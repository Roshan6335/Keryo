-- supabase_schema.sql — Keryo AI v6.3
-- Run this in your Supabase SQL editor: Dashboard → SQL Editor → New Query
-- Safe to run multiple times (uses IF NOT EXISTS / OR REPLACE).

-- ─────────────────────────────────────────────────────────
-- SECTION 1: profiles — one row per authenticated user
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    id              TEXT        NOT NULL PRIMARY KEY,  -- auth user sub / Google sub
    name            TEXT,
    email           TEXT,
    picture         TEXT,
    plan            TEXT        NOT NULL DEFAULT 'free'
                                CHECK (plan IN ('free', 'pro', 'premium')),
    is_guest        BOOLEAN     NOT NULL DEFAULT false,
    ads_enabled     BOOLEAN     NOT NULL DEFAULT true,
    plan_expires_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Each user can read their own profile (anon key)
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
    ON public.profiles FOR SELECT
    USING (id = current_setting('request.jwt.claims', true)::json->>'sub');

-- No direct client writes — profile is written by backend functions only
-- (or by trusted upsert in frontend after Google sign-in for name/email/picture)
DROP POLICY IF EXISTS "profiles_upsert_own" ON public.profiles;
CREATE POLICY "profiles_upsert_own"
    ON public.profiles FOR INSERT
    WITH CHECK (id = current_setting('request.jwt.claims', true)::json->>'sub');

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
    ON public.profiles FOR UPDATE
    USING (id = current_setting('request.jwt.claims', true)::json->>'sub');

-- ─────────────────────────────────────────────────────────
-- SECTION 2: user_plans — billing & subscription state
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_plans (
    user_id    TEXT        NOT NULL PRIMARY KEY,
    plan       TEXT        NOT NULL DEFAULT 'free'
                           CHECK (plan IN ('free', 'pro', 'premium')),
    start_date TIMESTAMPTZ,
    end_date   TIMESTAMPTZ,
    payment_id TEXT,
    order_id   TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;

-- Users can read their own plan
DROP POLICY IF EXISTS "users_read_own_plan" ON public.user_plans;
CREATE POLICY "users_read_own_plan"
    ON public.user_plans FOR SELECT
    USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- No client writes — only backend service_role key can write
DROP POLICY IF EXISTS "no_client_writes_plans" ON public.user_plans;
CREATE POLICY "no_client_writes_plans"
    ON public.user_plans FOR INSERT
    WITH CHECK (false);

DROP POLICY IF EXISTS "no_client_updates_plans" ON public.user_plans;
CREATE POLICY "no_client_updates_plans"
    ON public.user_plans FOR UPDATE
    USING (false);

DROP POLICY IF EXISTS "no_client_deletes_plans" ON public.user_plans;
CREATE POLICY "no_client_deletes_plans"
    ON public.user_plans FOR DELETE
    USING (false);

-- ─────────────────────────────────────────────────────────
-- SECTION 3: chats & messages
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chats (
    id         TEXT        NOT NULL PRIMARY KEY,
    user_id    TEXT        NOT NULL,
    title      TEXT        NOT NULL DEFAULT 'New Chat',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_chats" ON public.chats;
CREATE POLICY "users_own_chats" ON public.chats
    FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE TABLE IF NOT EXISTS public.messages (
    id         BIGSERIAL   PRIMARY KEY,
    chat_id    TEXT        NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    role       TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT        NOT NULL,
    msg_type   TEXT        DEFAULT 'text',
    timestamp  BIGINT      DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_messages" ON public.messages;
CREATE POLICY "users_own_messages" ON public.messages
    FOR ALL USING (
        chat_id IN (
            SELECT id FROM public.chats
            WHERE user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        )
    );

-- ─────────────────────────────────────────────────────────
-- SECTION 4: Indexes for fast lookups
-- ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chats_user_id    ON public.chats(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id  ON public.messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email    ON public.profiles(email);

-- ─────────────────────────────────────────────────────────
-- SECTION 5: Auto-update updated_at trigger
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_plans_updated_at ON public.user_plans;
CREATE TRIGGER trg_plans_updated_at
    BEFORE UPDATE ON public.user_plans
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
