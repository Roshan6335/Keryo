// api/create-order.js — Vercel Serverless Function
// Creates a Razorpay order with server-side coupon validation
'use strict';

import Razorpay from 'razorpay';
import { verifyGoogleToken, setCorsHeaders } from './auth.js';

const PLAN_CONFIG = {
    pro:     { amount: 9900,  label: 'Keryo Pro Plan — 1 Month' },
    premium: { amount: 29900, label: 'Keryo Premium Plan — 1 Month' },
};

const COUPONS = {
    keryobyroshan: { discount: 0.50 },
    devroshan:     { discount: 1.00 },
};

function applyCoupon(baseAmount, code) {
    if (!code) return { finalAmount: baseAmount, discount: 0, free: false, discountPct: 0 };
    const normalized = code.trim().toLowerCase();
    const coupon = COUPONS[normalized];
    if (!coupon) return null;
    const discountAmt = Math.floor(baseAmount * coupon.discount);
    const finalAmount = Math.max(0, baseAmount - discountAmt);
    return { finalAmount, discount: discountAmt, discountPct: Math.round(coupon.discount * 100), free: finalAmount === 0 };
}

export default async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { plan, userId, coupon, probeOnly } = req.body || {};

    if (!plan || !PLAN_CONFIG[plan])
        return res.status(400).json({ error: 'Invalid plan. Choose Pro or Premium.' });

    if (!userId || typeof userId !== 'string' || userId.length < 5)
        return res.status(400).json({ error: 'Please sign in to continue.' });

    // Verify token for all operations (including probeOnly)
    const token = req.headers['x-google-token'];
    try {
        const verifiedPayload = await verifyGoogleToken(token);
        if (verifiedPayload.sub !== userId) {
            return res.status(403).json({ error: 'Access denied: user ID mismatch.' });
        }
    } catch (err) {
        return res.status(401).json({ error: `Authentication failed: ${err.message}` });
    }

    const baseAmount = PLAN_CONFIG[plan].amount;
    let couponResult = { finalAmount: baseAmount, discount: 0, free: false, discountPct: 0 };

    if (coupon && coupon.trim()) {
        const result = applyCoupon(baseAmount, coupon);
        if (result === null) return res.status(400).json({ error: 'Invalid coupon code. Please check and try again.' });
        couponResult = result;
    }

    // 100% off — free unlock
    if (couponResult.free) {
        return res.status(200).json({ free: true, plan, userId, discountPct: couponResult.discountPct });
    }

    // Probe only — return discount info without creating a Razorpay order
    if (probeOnly === true) {
        return res.status(200).json({ free: false, discountPct: couponResult.discountPct, plan });
    }

    const keyId     = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return res.status(503).json({ error: 'Payment service not configured.' });

    try {
        const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
        const order = await razorpay.orders.create({
            amount: couponResult.finalAmount,
            currency: 'INR',
            receipt: `keryo_${plan}_${Date.now()}`,
            notes: { plan, userId: userId.slice(0, 64), couponUsed: coupon || '', originalAmt: String(baseAmount) },
        });
        return res.status(200).json({
            id: order.id, amount: order.amount, currency: order.currency,
            originalAmt: baseAmount, discountAmt: couponResult.discount,
            discountPct: couponResult.discountPct, free: false,
            razorpayKeyId: keyId,
        });
    } catch (err) {
        console.error('[create-order]', err.message);
        return res.status(500).json({ error: 'Could not create order. Please try again.' });
    }
}
