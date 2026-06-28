// config.js — Keryo AI v6.3
// ╔══════════════════════════════════════════════════════════════╗
// ║  SAFE IN THIS FILE (public/publishable keys only)            ║
// ║  • SUPABASE_KEY: anon key — safe per Supabase docs           ║
// ║  • RAZORPAY_KEY_ID: publishable key — safe for frontend      ║
// ║  NEVER PUT HERE (use Vercel Dashboard → Settings → Env Vars):       ║
// ║  • RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET              ║
// ║  • SUPABASE_SERVICE_KEY                                       ║
// ║  • GROQ_API_KEY, GEMINI_API_KEY, BYTEZ_API_KEY               ║
// ╚══════════════════════════════════════════════════════════════╝
const CONFIG = {
    // ── Supabase (anon key is safe here) ─────────────────────────
    SUPABASE_URL:  'https://ldijcqmlfxlpsjriugek.supabase.co',
    SUPABASE_KEY:  'sb_publishable_JNFx3kEtgpHwapmJRVGCRw_tnp-8nn3',

    // ── Razorpay (publishable key only) ──────────────────────────
    RAZORPAY_KEY_ID: 'rzp_test_SUxtfaXBWSbahG',

    // ── AI proxy endpoints (Vercel API routes) ──────────────────────
    // These route through your backend so no secret keys are exposed
    AI_CHAT_URL:      '/api/ai-chat',
    AI_IMAGE_URL:     '/api/ai-image',
    AI_SUMMARIZE_URL: '/api/ai-summarize',
    AI_QA_URL:        '/api/ai-qa',

    // ── Plan pricing ──────────────────────────────────────────────
    PLANS: {
        free:    { price: 0,   label: 'Free',    priceStr: '₹0'   },
        pro:     { price: 99,  label: 'Pro',     priceStr: '₹99'  },
        premium: { price: 299, label: 'Premium', priceStr: '₹299' },
    },

    DEFAULT_THEME:      'light',
    SESSION_MAX_AGE_MS: 60 * 60 * 1000,

    // ── Legacy / unused (kept for compatibility) ─────────────────
    GOOGLE_CLIENT_ID: '96652804843-a2ceqr4nuhqp4jj4jgged25ipaf3nhvd.apps.googleusercontent.com',
};
