# KERYO AI — ANTIGRAVITY GOD PROMPT
## For: Production Readiness, 1 Lakh+ Concurrent Users, Full Feature Audit

---

Act as an elite Principal Engineer with 15+ years of experience in high-scale distributed systems, frontend architecture, and payment infrastructure. You have complete read/write access to every file in this codebase. This is a production AI SaaS platform (Keryo AI) running on Vercel Serverless + Supabase + Razorpay. Conduct a final pre-launch engineering audit and implement all remaining fixes inline.

**ZERO TOLERANCE FOR AMBIGUITY. DO NOT EXPLAIN WHAT YOU WILL DO. ONLY OUTPUT THE FIXED FILES.**

---

## COMPLETED FIXES (already implemented — DO NOT re-fix these):

1. ✅ `api/verify-payment.js` — Supabase error handling on both upserts
2. ✅ `api/activate-plan.js` — Supabase error handling on both upserts
3. ✅ `api/webhook.js` — Raw body stream for correct HMAC + `export const config = { api: { bodyParser: false } }`
4. ✅ `api/ai-chat.js` — AbortController replaces withTimeout wrapper
5. ✅ `api/ai-qa.js` — AbortController replaces withTimeout wrapper
6. ✅ `api/ai-summarize.js` — AbortController replaces withTimeout wrapper
7. ✅ `vercel.json` — Removed catch-all rewrite that blocked privacy.html/terms.html
8. ✅ `public/ai.js` — answerQuestion buffer race condition fixed with local block-scoped variable; watermark function added
9. ✅ `public/script.js` — verifyPayment() and activateFreePlan() functions implemented; button text restored on error; setSidebar() reflow fix; image viewer fullscreen + keyboard dismiss

---

## REMAINING TASKS — IMPLEMENT ALL OF THESE:

### TASK 1 — Rate Limiting (CRITICAL for 1 lakh users)
**Files:** All `api/*.js` files

Add in-memory rate limiting per IP using a sliding window counter. Each serverless function should reject with 429 Too Many Requests after:
- `/api/ai-chat` → max 30 requests per minute per IP
- `/api/ai-image` → max 5 requests per minute per IP  
- `/api/ai-qa` → max 20 requests per minute per IP
- `/api/ai-summarize` → max 20 requests per minute per IP
- `/api/create-order` → max 10 requests per minute per IP
- `/api/verify-payment` → max 5 requests per minute per IP

Use a shared `Map` at module scope (survives warm instances). Key = `ip:windowStartMinute`. On cold starts the map resets — this is acceptable for serverless. Return:
```json
{ "error": "Too many requests. Please wait a moment.", "retryAfter": 60 }
```

### TASK 2 — Input Validation (CRITICAL)
**Files:** All `api/*.js`

Validate and sanitize ALL inputs before processing:
- Strip control characters and null bytes from all string inputs
- `userId` must match `/^[a-zA-Z0-9_\-\.]{5,128}$/` — reject anything else with 400
- `plan` must be exactly `'pro'` or `'premium'` — already done but double-check
- `messages` array: each `content` field must be a string, not object or array
- `prompt` in ai-image: strip HTML tags before sending to Bytez

### TASK 3 — Response Caching for AI Chat
**Files:** `api/ai-chat.js`

Add an ETag-based response cache for identical prompts. Use a `Map<string, {response, ts}>` at module scope. Cache key = SHA-256 of `JSON.stringify(messages) + plan`. Cache TTL = 5 minutes. If the exact same query comes in within 5 minutes, return the cached response. This dramatically reduces Groq/Gemini API calls under high load.

### TASK 4 — Supabase Connection Pooling
**Files:** All `api/*.js` that import `@supabase/supabase-js`

Replace `createClient(...)` inside the handler with a module-level singleton:
```javascript
// Module scope — created ONCE per warm serverless instance
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
            auth: { persistSession: false },
            db: { schema: 'public' },
        });
    }
    return _supabase;
}
```
This avoids creating a new TLS connection for every request — critical at scale.

### TASK 5 — CORS Hardening
**Files:** All `api/*.js`

Replace the wildcard `Access-Control-Allow-Origin: *` with an allowlist. Read allowed origins from `process.env.ALLOWED_ORIGINS` (comma-separated). Fall back to `*` only in development:
```javascript
const origin = req.headers.origin || '';
const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const cors = (allowed.length && !allowed.includes('*'))
    ? (allowed.includes(origin) ? origin : allowed[0])
    : '*';
res.setHeader('Access-Control-Allow-Origin', cors);
```

### TASK 6 — api/ai-image.js Fallback Provider
**File:** `api/ai-image.js`

Bytez SDXL is slow and unreliable. Add Gemini Imagen 3 as a fallback:
- Primary: Bytez SDXL (as-is)
- Fallback: `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:generateImages`
- Use `process.env.GEMINI_API_KEY` for the fallback
- If both fail, return a user-friendly 503 with a helpful message

### TASK 7 — public/script.js: Daily Count Persistence Bug
**File:** `public/script.js` — `incTodayCount()` function

The current counter uses `localStorage` which is per-device. A user can bypass the daily limit by switching browsers/devices. The count should be validated server-side. Add a lightweight API endpoint `api/check-limit.js` that:
1. Accepts `{ userId, plan }` via POST
2. Queries Supabase `profiles` table for `daily_msg_count` and `last_msg_date`
3. Resets count if date changed
4. Increments count and checks against plan limits
5. Returns `{ allowed: true/false, remaining: N }`

Also add the Supabase columns: `daily_msg_count INTEGER DEFAULT 0`, `last_msg_date DATE` to `profiles` table (add migration SQL to `supabase_schema.sql`).

### TASK 8 — Memory Leak in Chat Messages
**File:** `public/script.js`

The `chats` array grows unboundedly in memory as users have more conversations. Cap it at 80 chats in memory (already done for Supabase, but not for localStorage path). When `lsSave()` is called, only persist the most recent 80 chats. When `chats.unshift(newChat)` happens, if chats.length > 80, pop the last element.

### TASK 9 — public/style.css: Mobile Sidebar Touch Gesture
**File:** `public/style.css` + `public/script.js`

Add swipe-to-open gesture for mobile sidebar:
- Detect `touchstart` on the left edge (x < 30px) of the screen
- On `touchmove`, translate the sidebar proportionally
- On `touchend`, if moved > 60px → open, else snap back
- Use `transform: translateX()` with `transition: none` during drag, then re-enable transition on release

### TASK 10 — SEO & Performance
**File:** `public/index.html`

Add these missing meta tags for production:
```html
<meta name="description" content="Keryo AI — Your intelligent assistant for chat, study, coding, and creativity. Free to use.">
<meta property="og:title" content="Keryo AI">
<meta property="og:description" content="Smart AI for everyone. Chat, study, code, create.">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="dns-prefetch" href="https://api.groq.com">
<link rel="dns-prefetch" href="https://generativelanguage.googleapis.com">
```

Add `loading="lazy"` to all non-critical images. Add `defer` to all non-critical scripts.

---

## ARCHITECTURE CONTEXT (read this before implementing):

- **Platform**: Vercel Serverless Functions (Node.js 18+, ES Modules)
- **Database**: Supabase (PostgreSQL) with RLS disabled for service key
- **Auth**: Google One Tap (client-side JWT decode only — no server verification)
- **Payments**: Razorpay (India)
- **AI Providers**: Groq (primary chat), Gemini 1.5 Flash (fallback chat + QA + summarize), Bytez (image + QA + summarize)
- **Frontend**: Vanilla JS, no framework, no bundler — everything served as static files from `/public`
- **Scale target**: 1 lakh concurrent users — Vercel auto-scales serverless, but API rate limits are the bottleneck

## CONSTRAINTS:
- No new npm packages unless absolutely necessary (check `package.json` first)
- All API files use ES Module syntax (`export default`, `import`)
- No TypeScript — plain JavaScript only
- Keep each serverless function under 50MB bundle size
- Do NOT add Redis, do NOT add Express — use only what's already in package.json

## OUTPUT FORMAT:
For each task, output the COMPLETE file contents (not diffs). Start each file with a comment: `// FIXED: [task number] — [one line description]`. No explanations, no markdown code fences, just the raw file content.

Begin with TASK 1. Output every changed file.
