// api/ai-image.js — Vercel Serverless Function
// Bytez stable-diffusion-xl-base-1.0
'use strict';

const BYTEZ_URL = 'https://api.bytez.com/model/v1/stabilityai/stable-diffusion-xl-base-1.0';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const prompt = String(req.body?.prompt || '').slice(0, 500).trim();
    if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

    const bytezKey = process.env.BYTEZ_API_KEY;
    if (!bytezKey) return res.status(503).json({ error: 'Image generation not configured' });

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 35000);

        const resp = await fetch(BYTEZ_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + bytezKey },
            body: JSON.stringify({ inputs: prompt }),
        });
        clearTimeout(timeout);

        if (!resp.ok) throw new Error('bytez-' + resp.status);

        const contentType = resp.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            const data = await resp.json();
            const imageData = data?.image || data?.[0]?.image || data?.data?.[0]?.b64_json || data?.[0]?.b64_json;
            if (!imageData) throw new Error('no-image-data');
            const imageUrl = imageData.startsWith('data:') ? imageData : 'data:image/png;base64,' + imageData;
            return res.status(200).json({ imageUrl });
        }

        if (contentType.includes('image/')) {
            const buf = await resp.arrayBuffer();
            const b64 = Buffer.from(buf).toString('base64');
            return res.status(200).json({ imageUrl: 'data:' + contentType.split(';')[0] + ';base64,' + b64 });
        }

        throw new Error('unexpected-format');
    } catch (err) {
        console.warn('[ai-image] Failed:', err.message);
        return res.status(503).json({ error: 'Image generation unavailable' });
    }
}
