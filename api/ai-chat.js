// api/ai-chat.js — Vercel Serverless Function
// Multi-provider chat: Groq (primary) → Gemini (fallback)
'use strict';

import { createClient } from '@supabase/supabase-js';
import { verifyGoogleToken, setCorsHeaders } from './auth.js';

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), ms);
        promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
}

function getSystemPrompt(plan) {
    return 'You are Keryo, a helpful and friendly AI assistant. ' +
        'Be concise, clear, and accurate. Support English, Hindi, and Hinglish naturally. ' +
        (plan === 'premium' ? 'Give detailed expert-level answers. ' : '') +
        (plan === 'pro' ? 'Give thorough and well-structured answers. ' : '');
}

async function callGroq(messages, systemPrompt, key, temperature) {
    const resp = await withTimeout(fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            temperature: temperature,
            max_tokens: 2048,
            stream: false,
        }),
    }), TIMEOUT_MS);
    const data = await resp.json();
    if (!resp.ok) throw new Error('groq-' + resp.status + ': ' + (data.error?.message || ''));
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('groq-empty');
    return content;
}

async function callGemini(messages, systemPrompt, key, temperature) {
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
    }));
    const resp = await withTimeout(fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key
        },
        body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { temperature: temperature, maxOutputTokens: 2048 },
        }),
    }), TIMEOUT_MS);
    const data = await resp.json();
    if (!resp.ok) throw new Error('gemini-' + resp.status);
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('gemini-empty');
    return content;
}

async function getUserPlan(userId) {
    if (!userId || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return 'free';
    try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const { data } = await supabase.from('user_plans').select('plan,end_date').eq('user_id', userId).single();
        if (data && data.plan && data.end_date && new Date(data.end_date).getTime() > Date.now()) {
            return data.plan;
        }
    } catch (_) {}
    return 'free';
}

export default async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let userId = null;
    const token = req.headers['x-google-token'];
    if (token) {
        try {
            const payload = await verifyGoogleToken(token);
            userId = payload.sub;
        } catch (err) {
            return res.status(401).json({ error: `Authentication failed: ${err.message}` });
        }
    }

    const { messages, temperature } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'No messages provided' });
    }

    const parsedTemp = parseFloat(temperature);
    const safeTemp = (!isNaN(parsedTemp) && parsedTemp >= 0 && parsedTemp <= 1) ? parsedTemp : 0.7;

    const userPlan = userId ? await getUserPlan(userId) : 'free';

    const safeMsgs = messages.slice(-20).map(m => ({
        role: ['user', 'assistant', 'system'].includes(m.role) ? m.role : 'user',
        content: String(m.content || '').slice(0, 4000),
    }));

    const systemPrompt = getSystemPrompt(userPlan);
    const groqKey   = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (groqKey) {
        try {
            const content = await callGroq(safeMsgs, systemPrompt, groqKey, safeTemp);
            return res.status(200).json({ content });
        } catch (err) {
            console.warn('[ai-chat] Groq failed:', err.message);
        }
    }

    if (geminiKey) {
        try {
            const content = await callGemini(safeMsgs, systemPrompt, geminiKey, safeTemp);
            return res.status(200).json({ content });
        } catch (err) {
            console.warn('[ai-chat] Gemini failed:', err.message);
        }
    }

    return res.status(503).json({ error: 'Service temporarily unavailable' });
}
