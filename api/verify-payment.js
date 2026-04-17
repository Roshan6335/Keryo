// api/verify-payment.js — Vercel Serverless Function
// Verifies Razorpay signature + activates plan in Supabase
'use strict';

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const PLAN_CONFIG = {
    pro:     { amount: 9900 },
    premium: { amount: 29900 },
};

const COUPONS = {
    KeryobyRoshan: { discount: 0.50 },
    DevRoshan:     { discount: 1.00 },
};

function applyCoupon(baseAmount, code) {
    if (!code) return { finalAmount: baseAmount };
    const coupon = COUPONS[String(code).trim()];
    if (!coupon) return null;
    const discountAmt = Math.floor(baseAmount * coupon.discount);
    return { finalAmount: Math.max(0, baseAmount - discountAmt) };
}

function securityEvent(event, details = {}) {
    console.error(JSON.stringify({
        type: 'payment_verification_security_event',
        event,
        timestamp: new Date().toISOString(),
        ...details,
    }));
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
        return res.status(400).json({ error: 'Missing payment fields' });

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return res.status(503).json({ error: 'Payment service not configured' });

    // Verify Razorpay signature
    const expected = crypto.createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

    if (expected !== razorpay_signature) {
        securityEvent('signature_mismatch', { razorpay_order_id, razorpay_payment_id });
        return res.status(403).json({ error: 'Payment verification failed' });
    }

    let order;
    let payment;
    try {
        const Razorpay = (await import('razorpay')).default;
        const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
        order = await razorpay.orders.fetch(razorpay_order_id);
        payment = await razorpay.payments.fetch(razorpay_payment_id);
    } catch (err) {
        securityEvent('razorpay_fetch_failed', {
            razorpay_order_id,
            razorpay_payment_id,
            error: err?.message || 'unknown_error',
        });
        return res.status(400).json({ error: 'Unable to verify payment details' });
    }

    if (!order || !payment || payment.order_id !== order.id || payment.id !== razorpay_payment_id) {
        securityEvent('order_payment_link_mismatch', {
            razorpay_order_id,
            razorpay_payment_id,
            fetched_order_id: order?.id,
            fetched_payment_order_id: payment?.order_id,
        });
        return res.status(403).json({ error: 'Payment/order mismatch' });
    }

    if (order.status !== 'paid' || payment.status !== 'captured') {
        securityEvent('payment_not_captured', {
            razorpay_order_id,
            razorpay_payment_id,
            order_status: order.status,
            payment_status: payment.status,
        });
        return res.status(400).json({ error: 'Payment not captured' });
    }

    const notes = order.notes || {};
    const plan = notes.plan;
    const userId = notes.userId;
    const couponUsed = notes.couponUsed || '';

    if (!plan || !PLAN_CONFIG[plan] || !userId || typeof userId !== 'string' || userId.length < 5) {
        securityEvent('invalid_order_notes', {
            razorpay_order_id,
            razorpay_payment_id,
            notes_present: !!order.notes,
            plan,
            has_user_id: !!userId,
        });
        return res.status(400).json({ error: 'Invalid order metadata' });
    }

    const couponResult = applyCoupon(PLAN_CONFIG[plan].amount, couponUsed);
    if (couponResult === null) {
        securityEvent('invalid_coupon_in_notes', {
            razorpay_order_id,
            razorpay_payment_id,
            couponUsed,
            plan,
        });
        return res.status(400).json({ error: 'Invalid order metadata' });
    }

    const expectedAmount = couponResult.finalAmount;
    if (order.amount !== expectedAmount || payment.amount !== expectedAmount) {
        securityEvent('amount_mismatch', {
            razorpay_order_id,
            razorpay_payment_id,
            expectedAmount,
            order_amount: order.amount,
            payment_amount: payment.amount,
            plan,
            userId,
        });
        return res.status(403).json({ error: 'Payment amount mismatch' });
    }

    const supabase  = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const startDate = new Date();
    const endDate   = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    // Write to user_plans
    const { error: userPlanError } = await supabase.from('user_plans').upsert({
        user_id: userId, plan,
        start_date: startDate.toISOString(), end_date: endDate.toISOString(),
        payment_id: razorpay_payment_id, order_id: razorpay_order_id,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (userPlanError) {
        console.error('[verify-payment] user_plans upsert failed', userPlanError.message);
        return res.status(500).json({ error: 'Failed to activate plan' });
    }

    // Sync to profiles
    const { error: profileError } = await supabase.from('profiles').upsert({
        id: userId, plan, plan_expires_at: endDate.toISOString(),
        ads_enabled: false, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (profileError) {
        console.error('[verify-payment] profiles upsert failed', profileError.message);
        return res.status(500).json({ error: 'Failed to activate plan' });
    }

    return res.status(200).json({ success: true, plan, endDate: endDate.toISOString(), paymentId: razorpay_payment_id });
}
