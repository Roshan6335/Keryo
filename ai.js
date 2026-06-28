// ai.js — Keryo AI Engine v6.4
// Multi-provider router: Groq → Gemini for chat,
// Bytez → Gemini for summarize/QA, Bytez for images.
// All API keys are BACKEND-ONLY via Vercel functions.
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
   CALL A VERCEL PROXY FUNCTION
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
   FIX: Use local block-scoped buffer instead of
   function-attached property to prevent race conditions
   when multiple concurrent calls are made.
───────────────────────────────────────────── */
async function answerQuestion(question, context, onSuccess, onError) {
    var cfg = (typeof CONFIG !== 'undefined') ? CONFIG : {};
    // If no context, fall back to normal chat with LOCAL buffer (not shared state)
    if (!context || !context.trim()) {
        let localBuf = ''; // local variable — no shared state, no race condition
        generateResponse(
            [{ role: 'user', content: question }],
            function(chunk) {
                localBuf += chunk;
            },
            function() { onError('Could not find an answer.'); },
            function(aborted) {
                if (!aborted && localBuf) {
                    onSuccess(localBuf);
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
   With Keryo watermark stamped on canvas
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
        // Stamp Keryo watermark on the image
        _addWatermark(data.imageUrl, function(watermarkedUrl) {
            onSuccess(watermarkedUrl);
        }, function() {
            // If watermarking fails, still return original
            onSuccess(data.imageUrl);
        });
    } catch (_) {
        onError('__IMAGE_DISABLED__');
    }
}

/* ─────────────────────────────────────────────
   WATERMARK — stamps a light Keryo logo on
   bottom-left of image, like Gemini style
───────────────────────────────────────────── */
function _addWatermark(imageUrl, onSuccess, onError) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
        var canvas = document.createElement('canvas');
        canvas.width  = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext('2d');

        // Draw original image
        ctx.drawImage(img, 0, 0);

        // Watermark config — bottom left, like Gemini
        var pad    = Math.max(10, Math.round(img.width * 0.015));
        var fSize  = Math.max(11, Math.round(img.width * 0.022));
        var dotR   = Math.round(fSize * 0.28);
        var x      = pad;
        var y      = img.height - pad;

        ctx.save();

        // Semi-transparent pill background
        var pillW  = fSize * 4.6;
        var pillH  = fSize * 1.5;
        var pillX  = x - 6;
        var pillY  = y - pillH + 4;
        var pillR  = pillH / 2;
        ctx.beginPath();
        ctx.moveTo(pillX + pillR, pillY);
        ctx.lineTo(pillX + pillW - pillR, pillY);
        ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + pillR);
        ctx.lineTo(pillX + pillW, pillY + pillH - pillR);
        ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - pillR, pillY + pillH);
        ctx.lineTo(pillX + pillR, pillY + pillH);
        ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - pillR);
        ctx.lineTo(pillX, pillY + pillR);
        ctx.quadraticCurveTo(pillX, pillY, pillX + pillR, pillY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
        ctx.fill();

        // Accent dot (Keryo brand color)
        var dotX = x + dotR + 2;
        var dotY = y - fSize * 0.32;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = '#5F43E9';
        ctx.fill();

        // Second smaller dot (like Gemini's dual-dot logo)
        ctx.beginPath();
        ctx.arc(dotX + dotR * 1.8, dotY, dotR * 0.65, 0, Math.PI * 2);
        ctx.fillStyle = '#00C9FF';
        ctx.fill();

        // "Keryo" text
        ctx.font = 'bold ' + fSize + 'px "DM Sans", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.90)';
        ctx.textBaseline = 'middle';
        ctx.fillText('Keryo', dotX + dotR * 3.2, dotY);

        ctx.restore();

        try {
            onSuccess(canvas.toDataURL('image/png'));
        } catch (e) {
            onError(e);
        }
    };
    img.onerror = function() { onError(new Error('img-load-fail')); };
    img.src = imageUrl;
}

/* ─────────────────────────────────────────────
   WEB SEARCH — disabled (no Apify key needed)
───────────────────────────────────────────── */
async function webSearch(query, onSuccess, onError) {
    // Web search requires Apify — gracefully return empty
    onSuccess('');
}
