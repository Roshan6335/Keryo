# Keryo AI

An AI-powered chat assistant supporting Hindi, English, and Hinglish. Built for study, code, writing, and research.

## Features
- Multi-model AI chat (Gemini, Groq)
- AI image generation (Bytez SDXL)
- Web search integration
- Guest + Google Sign-in mode
- Pro & Premium subscription plans via Razorpay
- Chat history persisted in Supabase

## Stack
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Backend**: Vercel Serverless Functions (Node.js ESM)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Google OAuth 2.0 (JWKS verification)
- **Payments**: Razorpay

## Setup

1. Clone the repo
2. Copy `.env.example` → `.env` and fill in your keys
3. Run the Supabase schema: paste `supabase_schema.sql` into your Supabase SQL Editor
4. Deploy to Vercel (or `vercel dev` locally)

See [SETUP.md](./SETUP.md) for detailed step-by-step instructions.

## Environment Variables

See [`.env.example`](./.env.example) for the full list of required keys.

## Project Structure

```
├── api/               # Vercel serverless functions
│   ├── auth.js        # Shared Google token verification
│   ├── db.js          # Database CRUD actions
│   ├── ai-chat.js     # Chat streaming endpoint
│   ├── ai-image.js    # Image generation endpoint
│   ├── ai-qa.js       # Q&A endpoint
│   ├── ai-summarize.js
│   ├── create-order.js
│   ├── verify-payment.js
│   ├── activate-plan.js
│   └── webhook.js
├── public/            # Static frontend
│   ├── index.html
│   ├── style.css
│   ├── script.js      # Main app logic
│   ├── ai.js          # AI streaming
│   ├── config.js      # Public (non-secret) config
│   └── ...
├── supabase_schema.sql
├── vercel.json
└── .env.example
```

## License
Private — all rights reserved.
