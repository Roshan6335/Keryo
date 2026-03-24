// api/ai-summarize.js — Vercel Serverless Function
// Bytez BART-large-CNN → Gemini fallback
'use strict';

const BYTEZ_URL  = 'https://api.bytez.com/model/v1/facebook/bart-large-cnn';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const TIMEOUT_MS = 10000;

function withTimeout(promise, ms) {
    return new Promise((r, j) => { const t = setTimeout(() => j(new Error('timeout')), ms); promise.then(v => { clearTimeout(t); r(v); }, e => { clearTimeout(t); j(e); }); });
}

async function callBytez(text, key) {
    const resp = await withTimeout(fetch(BYTEZ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ inputs: text }),
    }), TIMEOUT_MS);
    const data = await resp.json();
    if (!resp.ok) throw new Error('bytez-' + resp.status);
    const summary = Array.isArray(data) ? (data[0]?.summary_text || data[0]?.generated_text) : data?.summary_text;
    if (!summary) throw new Error('bytez-empty');
    return summary;
}

async function callGemini(text, key) {
    const resp = await withTimeout(fetch(GEMINI_URL + '?key=' + key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Summarize concisely in 3-5 sentences:\n\n' + text }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
        }),
    }), TIMEOUT_MS);
    const data = await resp.json();
    if (!resp.ok) throw new Error('gemini-' + resp.status);
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!summary) throw new Error('gemini-empty');
    return summary;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const text = String(req.body?.text || '').slice(0, 3000).trim();
    if (!text) return res.status(400).json({ error: 'No text provided' });

    if (process.env.BYTEZ_API_KEY) {
        try { return res.status(200).json({ summary: await callBytez(text, process.env.BYTEZ_API_KEY) }); }
        catch (e) { console.warn('[ai-summarize] Bytez failed:', e.message); }
    }
    if (process.env.GEMINI_API_KEY) {
        try { return res.status(200).json({ summary: await callGemini(text, process.env.GEMINI_API_KEY) }); }
        catch (e) { console.warn('[ai-summarize] Gemini failed:', e.message); }
    }
    return res.status(503).json({ error: 'Summarization unavailable' });
}
