# KeryoAI v6.3 — Vercel Deployment Guide
# =========================================
# Read this fully before deploying. Takes ~10 minutes total.

## ─────────────────────────────────────────
## STEP 1 — Run SQL in Supabase
## ─────────────────────────────────────────
# Go to your Supabase project dashboard
# Dashboard → SQL Editor → New Query
# Paste the ENTIRE contents of supabase_schema.sql → Run
# You should see "Success. No rows returned."


## ─────────────────────────────────────────
## STEP 2 — Deploy to Vercel
## ─────────────────────────────────────────

Option A — GitHub (recommended):
  1. Push this folder to a GitHub repo
  2. Go to vercel.com → New Project → Import from GitHub
  3. Root directory: leave as default (/)
  4. Framework Preset: Other
  5. Click Deploy

Option B — Vercel CLI:
  npm i -g vercel
  cd KeryoAI_vercel
  vercel --prod


## ─────────────────────────────────────────
## STEP 3 — Add Environment Variables in Vercel
## ─────────────────────────────────────────
# Vercel Dashboard → Your Project → Settings → Environment Variables
# Add ALL of these. Set environment to: Production + Preview + Development
# NEVER commit real key values here — use Vercel Dashboard or .env.local only.

| Variable                  | Where to get it                                          |
|---------------------------|----------------------------------------------------------|
| GROQ_API_KEY              | console.groq.com → API Keys                             |
| GEMINI_API_KEY            | aistudio.google.com → Get API Key                       |
| BYTEZ_API_KEY             | bytez.com → API Keys                                    |
| RAZORPAY_KEY_ID           | Razorpay Dashboard → Settings → API Keys (publishable)  |
| RAZORPAY_KEY_SECRET       | Razorpay Dashboard → Settings → API Keys (secret)       |
| RAZORPAY_WEBHOOK_SECRET   | Set after creating webhook in Razorpay dashboard         |
| SUPABASE_URL              | Supabase → Settings → API → Project URL                 |
| SUPABASE_SERVICE_KEY      | Supabase → Settings → API → service_role key            |

After adding all vars → click "Redeploy" on your latest deployment.

See .env.example for the full list of required variable names.


## ─────────────────────────────────────────
## STEP 4 — Razorpay Webhook (optional but safe)
## ─────────────────────────────────────────
# 1. Razorpay Dashboard → Settings → Webhooks → Add New Webhook
# 2. Webhook URL: https://YOUR-SITE.vercel.app/api/webhook
# 3. Select events: payment.captured, order.paid, payment.failed
# 4. Copy the Secret → add as RAZORPAY_WEBHOOK_SECRET in Vercel


## ─────────────────────────────────────────
## STEP 5 — Test Checklist
## ─────────────────────────────────────────
[ ] Open site → landing page loads
[ ] "Continue with Google" → signs in, profile card shows name + avatar
[ ] Refresh page → stays logged in (session persists)
[ ] Chat works → AI responds (Groq fast path)
[ ] Ask to "generate an image of a sunset" → image appears or soft unavailable
[ ] Click Upgrade → upgrade modal opens
[ ] Enter coupon "KeryobyRoshan" → shows 50% off on prices
[ ] Enter coupon "DevRoshan" → shows 100% off, "Plan is FREE" message
[ ] Click Upgrade with DevRoshan → plan activates immediately, green tick shows
[ ] After Pro/Premium → model picker shows Keryo Pro / Keryo Premium (not locked)
[ ] Ads hidden for paid users
[ ] Logout → back to guest mode
[ ] Plan syncs after refresh (check Supabase user_plans table)


## ─────────────────────────────────────────
## COUPON CODES
## ─────────────────────────────────────────
KeryobyRoshan  →  50% off Pro & Premium
DevRoshan      →  100% off (instant free activation, skips Razorpay)

To add new coupons: edit api/create-order.js (COUPONS object)
For new 100% coupons: also add to FREE_COUPONS set in api/activate-plan.js


## ─────────────────────────────────────────
## AI PROVIDER ROUTING
## ─────────────────────────────────────────
Task          Primary                    Fallback
----------    -------------------------  -------------------------
Chat          Groq llama-3.3-70b        Gemini 1.5 Flash
Summarize     Bytez BART-large-CNN      Gemini 1.5 Flash
Q&A           Bytez RoBERTa-squad2      Gemini 1.5 Flash
Image         Bytez SDXL                soft unavailable state

All API keys stay on the backend (Vercel Functions). Never in browser.
Timeout per provider: 8s (chat), 10s (summarize/QA), 35s (image)


## ─────────────────────────────────────────
## GOING LIVE (Real Payments)
## ─────────────────────────────────────────
1. Complete KYC on Razorpay dashboard
2. Switch to Live mode → get rzp_live_* keys
3. Update in Vercel env vars:
   RAZORPAY_KEY_ID    → rzp_live_XXXXXXXX
   RAZORPAY_KEY_SECRET → your live secret
4. Update public/config.js line:
   RAZORPAY_KEY_ID: 'rzp_live_XXXXXXXX',
5. Redeploy
