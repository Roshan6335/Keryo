// api/webhook.js — Vercel Serverless Function
// Receives and verifies Razorpay webhook events
'use strict';

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(500).send('Webhook not configured');

    const receivedSig = req.headers['x-razorpay-signature'];
    if (!receivedSig) return res.status(400).send('Missing signature');

    // Vercel gives us parsed body — we need raw body for HMAC
    // Use the rawBody from Vercel's request
    const rawBody = JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    if (expected !== receivedSig) return res.status(400).send('Invalid signature');

    const { event, payload } = req.body;
    const paymentEntity = payload?.payment?.entity;
    const orderEntity   = payload?.order?.entity;

    if (event === 'payment.captured' || event === 'order.paid') {
        const notes  = orderEntity?.notes || paymentEntity?.notes || {};
        const userId = String(notes.userId || '').trim();
        const plan   = String(notes.plan   || '').trim();

        if (!userId || !['pro', 'premium'].includes(plan)) return res.status(200).send('OK');

        const supabase  = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const startDate = new Date();
        const endDate   = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);

        await supabase.from('user_plans').upsert({
            user_id: userId, plan,
            start_date: startDate.toISOString(), end_date: endDate.toISOString(),
            payment_id: paymentEntity?.id, order_id: orderEntity?.id || paymentEntity?.order_id,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        await supabase.from('profiles').upsert({
            id: userId, plan, plan_expires_at: endDate.toISOString(),
            ads_enabled: false, updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
    }

    return res.status(200).send('OK');
}
