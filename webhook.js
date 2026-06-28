// api/webhook.js — Vercel Serverless Function
// Receives and verifies Razorpay webhook events
// Raw body MUST be read manually for correct HMAC verification
'use strict';

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// CRITICAL: Disable Vercel body parser — we need the raw bytes for HMAC
export const config = {
    api: { bodyParser: false }
};

async function getRawBody(readable) {
    const chunks = [];
    for await (const chunk of readable) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(500).send('Webhook not configured');

    const receivedSig = req.headers['x-razorpay-signature'];
    if (!receivedSig) return res.status(400).send('Missing signature');

    // Read raw body stream — this is the ONLY way to get correct HMAC
    const rawBody = await getRawBody(req);
    const rawBodyStr = rawBody.toString('utf-8');

    // Verify against raw bytes
    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBodyStr).digest('hex');
    if (expected !== receivedSig) return res.status(400).send('Invalid signature');

    // Parse body only after signature is verified
    let body;
    try {
        body = JSON.parse(rawBodyStr);
    } catch (_) {
        return res.status(400).send('Invalid JSON');
    }

    const { event, payload } = body;
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

        const { error: planError } = await supabase.from('user_plans').upsert({
            user_id: userId, plan,
            start_date: startDate.toISOString(), end_date: endDate.toISOString(),
            payment_id: paymentEntity?.id, order_id: orderEntity?.id || paymentEntity?.order_id,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        if (planError) {
            console.error('[webhook] user_plans write failed:', planError.message);
            // Return 200 to prevent Razorpay retries, but log the error
            // Razorpay retries on non-2xx — returning 500 causes infinite retries
        }

        const { error: profileError } = await supabase.from('profiles').upsert({
            id: userId, plan, plan_expires_at: endDate.toISOString(),
            ads_enabled: false, updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

        if (profileError) {
            console.error('[webhook] profiles sync failed:', profileError.message);
        }
    }

    return res.status(200).send('OK');
}
