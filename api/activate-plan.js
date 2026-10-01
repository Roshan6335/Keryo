// api/activate-plan.js — Vercel Serverless Function
// Activates plan directly for 100% coupon (DevRoshan) — no Razorpay
'use strict';

import { createClient } from '@supabase/supabase-js';
import { verifyGoogleToken, setCorsHeaders } from './auth.js';

const FREE_COUPONS = new Set(['devroshan']);

export default async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { plan, userId, coupon } = req.body || {};

    if (!plan || !['pro', 'premium'].includes(plan))
        return res.status(400).json({ error: 'Invalid plan' });
    if (!userId || typeof userId !== 'string' || userId.length < 5)
        return res.status(400).json({ error: 'Invalid user' });

    const token = req.headers['x-google-token'];
    try {
        const verifiedPayload = await verifyGoogleToken(token);
        if (verifiedPayload.sub !== userId) {
            return res.status(403).json({ error: 'Access denied: user ID mismatch.' });
        }
    } catch (err) {
        return res.status(401).json({ error: `Authentication failed: ${err.message}` });
    }

    const normalizedCoupon = (coupon || '').trim().toLowerCase();
    if (!normalizedCoupon || !FREE_COUPONS.has(normalizedCoupon))
        return res.status(403).json({ error: 'Invalid free coupon' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return res.status(503).json({ error: 'Database service not configured' });
    }

    const supabase  = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const startDate = new Date();
    const endDate   = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const { error } = await supabase.from('user_plans').upsert({
        user_id: userId, plan,
        start_date: startDate.toISOString(), end_date: endDate.toISOString(),
        payment_id: 'coupon_' + normalizedCoupon, order_id: 'free_' + Date.now(),
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    await supabase.from('profiles').upsert({
        id: userId, plan, plan_expires_at: endDate.toISOString(),
        ads_enabled: false, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (error) return res.status(500).json({ error: 'Could not activate plan. Contact support.' });
    return res.status(200).json({ success: true, plan, endDate: endDate.toISOString() });
}
