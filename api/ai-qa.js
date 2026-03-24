// api/ai-qa.js — Vercel Serverless Function
// Bytez RoBERTa-squad2 → Gemini fallback
'use strict';

const BYTEZ_URL  = 'https://api.bytez.com/model/v1/deepset/roberta-large-squad2';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const TIMEOUT_MS = 10000;

function withTimeout(promise, ms) {
    return new Promise((r, j) => { const t = setTimeout(() => j(new Error('timeout')), ms); promise.then(v => { clearTimeout(t); r(v); }, e => { clearTimeout(t); j(e); }); });
}

async function callBytez(question, context, key) {
    const resp = await withTimeout(fetch(BYTEZ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ inputs: { question, context } }),
    }), TIMEOUT_MS);
    const data = await resp.json();
    if (!resp.ok) throw new Error('bytez-' + resp.status);
    const answer = data?.answer || data?.[0]?.answer;
    if (!answer) throw new Error('bytez-empty');
    return answer;
}

async function callGemini(question, context, key) {
    const prompt = `Answer based only on this context:\n\nContext:\n${context}\n\nQuestion: ${question}\n\nAnswer:`;
    const resp = await withTimeout(fetch(GEMINI_URL + '?key=' + key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
        }),
    }), TIMEOUT_MS);
    const data = await resp.json();
    if (!resp.ok) throw new Error('gemini-' + resp.status);
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!answer) throw new Error('gemini-empty');
    return answer;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const question = String(req.body?.question || '').slice(0, 500).trim();
    const context  = String(req.body?.context  || '').slice(0, 3000).trim();
    if (!question) return res.status(400).json({ error: 'No question provided' });

    if (process.env.BYTEZ_API_KEY && context) {
        try { return res.status(200).json({ answer: await callBytez(question, context, process.env.BYTEZ_API_KEY) }); }
        catch (e) { console.warn('[ai-qa] Bytez failed:', e.message); }
    }
    if (process.env.GEMINI_API_KEY) {
        try { return res.status(200).json({ answer: await callGemini(question, context || question, process.env.GEMINI_API_KEY) }); }
        catch (e) { console.warn('[ai-qa] Gemini failed:', e.message); }
    }
    return res.status(503).json({ error: 'QA unavailable' });
}
