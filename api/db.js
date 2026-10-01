// api/db.js — Vercel Serverless Function
// Secure Service-Role Backend Endpoint for Supabase CRUD
'use strict';

import { createClient } from '@supabase/supabase-js';
import { verifyGoogleToken, setCorsHeaders } from './auth.js';

export default async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const token = req.headers['x-google-token'];
        if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });

        const payload = await verifyGoogleToken(token);
        const userId = payload.sub;

        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
            throw new Error('Supabase environment variables missing');
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const body = req.body || {};
        const { action } = body;

        if (!action) return res.status(400).json({ error: 'No action specified' });

        let result = null;

        switch (action) {
            case 'syncPlan':
                // Fetch from user_plans primary, fallback to profiles
                const { data: planData, error: planError } = await supabase.from('user_plans')
                    .select('plan,end_date')
                    .eq('user_id', userId)
                    .single();
                
                if (!planError && planData) {
                    result = { plan: planData.plan, end_date: planData.end_date };
                    // Keep profiles in sync
                    if (planData.plan && planData.plan !== 'free') {
                        await supabase.from('profiles').upsert({
                            id: userId,
                            plan: planData.plan,
                            plan_expires_at: planData.end_date,
                            ads_enabled: false,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'id' });
                    }
                } else {
                    const { data: profData, error: profError } = await supabase.from('profiles')
                        .select('plan,plan_expires_at')
                        .eq('id', userId)
                        .single();
                    if (!profError && profData) {
                        result = { plan: profData.plan, end_date: profData.plan_expires_at };
                    } else {
                        result = { plan: 'free', end_date: null };
                    }
                }
                break;

            case 'upsertProfile':
                const { profile } = body;
                const { error: upsertErr } = await supabase.from('profiles').upsert({
                    id: userId,
                    name: (profile.name || 'User').slice(0, 120),
                    email: (profile.email || '').slice(0, 254),
                    picture: (profile.picture || '').slice(0, 512),
                    is_guest: false,
                    ads_enabled: (profile.plan === 'free'),
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'id' });
                if (upsertErr) throw upsertErr;
                result = { success: true };
                break;

            case 'loadAllChats':
                const { data: chats, error: chatsErr } = await supabase.from('chats')
                    .select('id,title,created_at')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(80);
                if (chatsErr) throw chatsErr;
                result = chats;
                break;

            case 'loadMessages':
                const { chatId } = body;
                if (!chatId) throw new Error('chatId required');
                // Verify chat belongs to user
                const { data: chatCheck } = await supabase.from('chats').select('user_id').eq('id', chatId).single();
                if (!chatCheck || chatCheck.user_id !== userId) throw new Error('Unauthorized chat access');

                const { data: msgs, error: msgsErr } = await supabase.from('messages')
                    .select('role,content,msg_type,images,timestamp')
                    .eq('chat_id', chatId)
                    .order('timestamp', { ascending: true });
                if (msgsErr) throw msgsErr;
                result = msgs;
                break;

            case 'persistNewChat':
                const { chat: newChat } = body;
                if (!newChat || !newChat.id) throw new Error('Invalid chat object');
                const { error: newChatErr } = await supabase.from('chats').insert({
                    id: newChat.id,
                    user_id: userId,
                    title: newChat.title || 'New Chat',
                    created_at: new Date().toISOString()
                });
                if (newChatErr) throw newChatErr;
                result = { success: true };
                break;

            case 'persistMessage':
                const { chatId: pChatId, message } = body;
                if (!pChatId || !message) throw new Error('chatId and message required');
                // Verify chat belongs to user
                const { data: chatCheck2 } = await supabase.from('chats').select('user_id').eq('id', pChatId).single();
                if (!chatCheck2 || chatCheck2.user_id !== userId) throw new Error('Unauthorized chat access');

                const { error: msgErr } = await supabase.from('messages').insert({
                    chat_id: pChatId,
                    role: message.role,
                    content: message.content || '',
                    msg_type: message.type || 'text',
                    images: message.images || null,
                    timestamp: Math.floor(new Date(message.ts || Date.now()).getTime())
                });
                if (msgErr) throw msgErr;
                result = { success: true };
                break;

            case 'persistTitle':
                const { chatId: tChatId, title } = body;
                if (!tChatId || !title) throw new Error('chatId and title required');
                // Verify chat belongs to user
                const { data: chatCheck3 } = await supabase.from('chats').select('user_id').eq('id', tChatId).single();
                if (!chatCheck3 || chatCheck3.user_id !== userId) throw new Error('Unauthorized chat access');

                const { error: titleErr } = await supabase.from('chats').update({ title }).eq('id', tChatId);
                if (titleErr) throw titleErr;
                result = { success: true };
                break;

            case 'persistDeleteChat':
                const { chatId: dChatId } = body;
                if (!dChatId) throw new Error('chatId required');
                // Verify chat belongs to user
                const { data: chatCheck4 } = await supabase.from('chats').select('user_id').eq('id', dChatId).single();
                if (!chatCheck4 || chatCheck4.user_id !== userId) throw new Error('Unauthorized chat access');

                const { error: delErr } = await supabase.from('chats').delete().eq('id', dChatId);
                if (delErr) throw delErr;
                result = { success: true };
                break;

            default:
                return res.status(400).json({ error: 'Unknown action' });
        }

        return res.status(200).json({ data: result });

    } catch (err) {
        console.error('[api/db] Error:', err.message);
        return res.status(500).json({ error: 'Internal database error' });
    }
}
