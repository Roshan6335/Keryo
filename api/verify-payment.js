// api/verify-payment.js — Vercel Serverless Function
// Verifies Razorpay signature + activates plan in Supabase
'use strict';

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, userId } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
        return res.status(400).json({ error: 'Missing payment fields' });
    if (!plan || !['pro', 'premium'].includes(plan))
        return res.status(400).json({ error: 'Invalid plan' });
    if (!userId || userId.length < 5)
        return res.status(400).json({ error: 'Invalid user' });

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) return res.status(503).json({ error: 'Payment service not configured' });

    // Verify Razorpay signature
    const expected = crypto.createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

    if (expected !== razorpay_signature)
        return res.status(400).json({ error: 'Payment verification failed' });

    const supabase  = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const startDate = new Date();
    const endDate   = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    // Write to user_plans
    await supabase.from('user_plans').upsert({
        user_id: userId, plan,
        start_date: startDate.toISOString(), end_date: endDate.toISOString(),
        payment_id: razorpay_payment_id, order_id: razorpay_order_id,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    // Sync to profiles
    await supabase.from('profiles').upsert({
        id: userId, plan, plan_expires_at: endDate.toISOString(),
        ads_enabled: false, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    return res.status(200).json({ success: true, plan, endDate: endDate.toISOString(), paymentId: razorpay_payment_id });
}
