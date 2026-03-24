// ai.js — Keryo AI Engine v6.3
// Multi-provider router: Groq → Gemini for chat,
// Bytez → Gemini for summarize/QA, Bytez for images.
// All API keys are BACKEND-ONLY via Netlify functions.
'use strict';

let _abortCtrl = null;

/* ─────────────────────────────────────────────
   IMAGE / SEARCH REQUEST DETECTION
───────────────────────────────────────────── */
function isImageRequest(text) {
    if (!text) return false;
    return /\b(generate|create|make|draw|design|render|paint|produce|imagine|visualize)\b.{0,40}\b(image|photo|picture|illustration|artwork|painting|drawing|portrait|landscape|wallpaper|logo|icon|poster|banner)\b/i.test(text)
        || /^(draw|paint|sketch|render|imagine|visualize)\s+/i.test(text.trim())
        || /\b(show\s+me|give\s+me)\s+a[n]?\s+(image|picture|photo|illustration)\b/i.test(text);
}

/* ─────────────────────────────────────────────
   SAFE LOGGER
───────────────────────────────────────────── */
const _log = {
    warn: function(code) {
        if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
            console.warn('[Keryo]', code);
        }
    }
};

/* ─────────────────────────────────────────────
   TIMEOUT HELPER — rejects after ms
───────────────────────────────────────────── */
function _withTimeout(promise, ms) {
    return new Promise(function(resolve, reject) {
        var t = setTimeout(function() { reject(new Error('timeout')); }, ms);
        promise.then(
            function(v) { clearTimeout(t); resolve(v); },
            function(e) { clearTimeout(t); reject(e); }
        );
    });
}

/* ─────────────────────────────────────────────
   CALL A NETLIFY PROXY FUNCTION
   Returns the JSON response body or throws.
───────────────────────────────────────────── */
async function _callProxy(url, body, signal, timeoutMs) {
    timeoutMs = timeoutMs || 7000;
    var fetchPromise = fetch(url, {
        method:  'POST',
        signal:  signal,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
    });
    var resp = await _withTimeout(fetchPromise, timeoutMs);
    var data = await resp.json();
    if (!resp.ok) {
        var err = new Error(data.error || 'proxy-' + resp.status);
        err.status = resp.status;
        throw err;
    }
    return data;
}

/* ─────────────────────────────────────────────
   MAIN: generateResponse
   Routes chat through /api/ai-chat
   which tries Groq first, then Gemini.
───────────────────────────────────────────── */
async function generateResponse(messages, onChunk, onError, onComplete, plan) {
    _abortCtrl = new AbortController();
    var signal = _abortCtrl.signal;
    var cfg = (typeof CONFIG !== 'undefined') ? CONFIG : {};
    var proxyUrl = cfg.AI_CHAT_URL || '/api/ai-chat';

    try {
        var data = await _callProxy(proxyUrl, { messages: messages, plan: plan || 'free' }, signal, 10000);

        if (signal.aborted) { onComplete && onComplete(true); return; }

        var content = (data && data.content) ? data.content : '';
        if (!content) {
            onError('__ALL_FAILED__');
            return;
        }

        // Deliver the response in chunks to preserve the streaming UX feel
        var chunkSize = 6;
        var i = 0;
        function deliverNextChunk() {
            if (signal.aborted) { onComplete && onComplete(true); return; }
            if (i >= content.length) { onComplete && onComplete(false); return; }
            var chunk = content.slice(i, i + chunkSize);
            onChunk(chunk);
            i += chunkSize;
            setTimeout(deliverNextChunk, 8);
        }
        deliverNextChunk();

    } catch (err) {
        if (err.name === 'AbortError') { onComplete && onComplete(true); return; }
        _log.warn('chat-fail:' + (err.message || 'unknown'));
        onError('__ALL_FAILED__');
    }
}

function stopGeneration() {
    if (_abortCtrl) _abortCtrl.abort();
}

/* ─────────────────────────────────────────────
   SUMMARIZE — Bytez → Gemini fallback
───────────────────────────────────────────── */
async function summarizeText(text, onSuccess, onError) {
    var cfg = (typeof CONFIG !== 'undefined') ? CONFIG : {};
    var proxyUrl = cfg.AI_SUMMARIZE_URL || '/api/ai-summarize';
    if (!text || !text.trim()) { onError('No text to summarize.'); return; }
    try {
        var data = await _withTimeout(
            fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text.trim() }),
            }).then(function(r) { return r.json(); }),
            9000
        );
        if (data && data.summary) { onSuccess(data.summary); }
        else { onError('Could not generate a summary.'); }
    } catch (_) {
        onError('Summarization unavailable right now.');
    }
}

/* ─────────────────────────────────────────────
   QUESTION ANSWERING — Bytez → Gemini fallback
───────────────────────────────────────────── */
async function answerQuestion(question, context, onSuccess, onError) {
    var cfg = (typeof CONFIG !== 'undefined') ? CONFIG : {};
    // If no context, fall back to normal chat
    if (!context || !context.trim()) {
        generateResponse(
            [{ role: 'user', content: question }],
            function(chunk) {
                answerQuestion._buf = (answerQuestion._buf || '') + chunk;
            },
            function() { onError('Could not find an answer.'); },
            function(aborted) {
                if (!aborted && answerQuestion._buf) {
                    onSuccess(answerQuestion._buf);
                    answerQuestion._buf = '';
                }
            },
            'free'
        );
        return;
    }
    var proxyUrl = cfg.AI_QA_URL || '/api/ai-qa';
    try {
        var data = await _withTimeout(
            fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: question, context: context }),
            }).then(function(r) { return r.json(); }),
            9000
        );
        if (data && data.answer) { onSuccess(data.answer); }
        else { onError('Could not find an answer.'); }
    } catch (_) {
        onError('Question answering unavailable right now.');
    }
}

/* ─────────────────────────────────────────────
   IMAGE GENERATION — Bytez stable-diffusion
───────────────────────────────────────────── */
async function generateImage(prompt, onSuccess, onError) {
    var cfg = (typeof CONFIG !== 'undefined') ? CONFIG : {};
    var proxyUrl = cfg.AI_IMAGE_URL || '/api/ai-image';
    if (!prompt || !prompt.trim()) { onError('__IMAGE_DISABLED__'); return; }
    try {
        var resp = await _withTimeout(
            fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: prompt.trim() }),
            }),
            30000  // image gen can take up to 30s
        );
        var data = await resp.json();
        if (!resp.ok || !data.imageUrl) {
            onError('__IMAGE_DISABLED__');
            return;
        }
        onSuccess(data.imageUrl);
    } catch (_) {
        onError('__IMAGE_DISABLED__');
    }
}

/* ─────────────────────────────────────────────
   WEB SEARCH — disabled (no Apify key needed)
───────────────────────────────────────────── */
async function webSearch(query, onSuccess, onError) {
    // Web search requires Apify — gracefully return empty
    onSuccess('');
}
