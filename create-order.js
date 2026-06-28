// api/create-order.js — Vercel Serverless Function
// Creates a Razorpay order with server-side coupon validation
'use strict';

const PLAN_CONFIG = {
    pro:     { amount: 9900,  label: 'Keryo Pro Plan — 1 Month' },
    premium: { amount: 29900, label: 'Keryo Premium Plan — 1 Month' },
};

const COUPONS = {
    KeryobyRoshan: { discount: 0.50 },
    DevRoshan:     { discount: 1.00 },
};

function applyCoupon(baseAmount, code) {
    if (!code) return { finalAmount: baseAmount, discount: 0, free: false, discountPct: 0 };
    const coupon = COUPONS[code.trim()];
    if (!coupon) return null;
    const discountAmt = Math.floor(baseAmount * coupon.discount);
    const finalAmount = Math.max(0, baseAmount - discountAmt);
    return { finalAmount, discount: discountAmt, discountPct: Math.round(coupon.discount * 100), free: finalAmount === 0 };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { plan, userId, coupon } = req.body || {};

    if (!plan || !PLAN_CONFIG[plan])
        return res.status(400).json({ error: 'Invalid plan. Choose Pro or Premium.' });
    // probeOnly: just validate coupon, don't create a Razorpay order
    const probeOnly = req.body.probeOnly === true;

    if (!userId || typeof userId !== 'string' || userId.length < 5)
        return res.status(400).json({ error: 'Please sign in to continue.' });

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

    // Probe only — just return discount info, no Razorpay order needed
    if (probeOnly) {
        return res.status(200).json({ free: false, discountPct: couponResult.discountPct, plan });
    }

    const keyId     = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return res.status(503).json({ error: 'Payment service not configured.' });

    try {
        // Dynamic import for Razorpay (works in Vercel Edge)
        const Razorpay = (await import('razorpay')).default;
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
        });
    } catch (err) {
        console.error('[create-order]', err.message);
        return res.status(500).json({ error: 'Could not create order. Please try again.' });
    }
}
