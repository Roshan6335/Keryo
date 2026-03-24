// script.js — Keryo AI v6 — Full subscription, auth persistence, Razorpay
'use strict';
document.addEventListener('DOMContentLoaded', function() {

/* ══════════════════════════════════════════════════════════
   MODES
══════════════════════════════════════════════════════════ */
var MODES = {
    general:{label:'General',placeholder:'Ask Keryo anything…',
        subtitle:'Your all-purpose AI — ask anything, get answers instantly.',
        prompts:['What are 5 interesting facts about space?','Write a poem about the monsoon','Explain quantum entanglement simply','Generate ideas for a birthday surprise'],
        tools:[{label:'Web Search',prompt:'Search the web for: '},{label:'Summarize',prompt:'Summarize this: '},{label:'Translate',prompt:'Translate to Hindi: '},{label:'Generate Image',prompt:'Generate an image of '}],
        sysAddition:'You are a helpful, intelligent AI assistant. Be concise and friendly.'},
    student:{label:'Student',placeholder:'Ask about any topic, chapter, or subject…',
        subtitle:'Study smarter — Notes, MCQs, Revision, and Exam prep.',
        prompts:['Explain photosynthesis for Class 10','Quiz me on the French Revolution (5 MCQs)','Make revision notes on Trigonometry','Explain Newton\'s 3rd Law with an example'],
        tools:[{label:'Make MCQs',prompt:'Create 5 MCQ questions on: '},{label:'Make Notes',prompt:'Make revision notes on: '},{label:'Revision Plan',prompt:'Make a 7-day revision plan for: '},{label:'Explain Topic',prompt:'Explain this topic clearly: '},{label:'Practice Q',prompt:'Give me 5 practice questions on: '}],
        sysAddition:'You are a student tutor AI. Explain clearly with examples. Keep answers educational and exam-focused.'},
    developer:{label:'Dev',placeholder:'Ask about code, errors, APIs, or architecture…',
        subtitle:'Code, debug, and build — your intelligent dev companion.',
        prompts:['Fix this JS error: TypeError: Cannot read property','Write a Python Flask REST API with CRUD','Explain async/await vs Promises','How to structure a React project?'],
        tools:[{label:'Debug Code',prompt:'Debug this code:\n\n'},{label:'Optimize',prompt:'Optimize this code:\n\n'},{label:'Explain Code',prompt:'Explain this code:\n\n'},{label:'Build Feature',prompt:'Write code to implement: '},{label:'API Help',prompt:'Show me how to call this API: '}],
        sysAddition:'You are a senior developer AI. Provide clean, commented code. Suggest best practices and identify bugs.'},
    creator:{label:'Creator',placeholder:'Describe what content you need…',
        subtitle:'Content, scripts, captions — fuel your creative workflow.',
        prompts:['Write a YouTube script on AI trends (5 mins)','Generate 10 Instagram captions for a food post','Write a brand bio for a fitness influencer','Create 15 trending hashtags for a tech post'],
        tools:[{label:'Reel Script',prompt:'Write a 30-second reel script about: '},{label:'Caption Ideas',prompt:'Write 5 engaging captions for: '},{label:'Hashtags',prompt:'Generate 20 hashtags for: '},{label:'Content Plan',prompt:'Make a 7-day content calendar for: '}],
        sysAddition:'You are a creative content strategist AI. Help with scripts, captions, hashtags, and content strategy.'},
    writer:{label:'Writer',placeholder:'Tell me what you want to write…',
        subtitle:'Essays, blogs, stories — elevate every word you write.',
        prompts:['Write a 500-word blog post on mindfulness','Give me 5 creative story starters','Edit this paragraph for clarity','Write a cover letter for a software job'],
        tools:[{label:'Blog Post',prompt:'Write a blog post about: '},{label:'Short Story',prompt:'Write a short story about: '},{label:'Email Draft',prompt:'Write a professional email for: '},{label:'Edit & Polish',prompt:'Edit and improve this text:\n\n'}],
        sysAddition:'You are a professional writing AI. Help with essays, blogs, stories, and editing. Focus on clarity and style.'},
    research:{label:'Research',placeholder:'Enter your research topic or question…',
        subtitle:'Deep dives, citations, analysis — research at another level.',
        prompts:['Analyze the impact of AI on employment','Compare theories of consciousness','Summarize advances in quantum computing','What does research say about intermittent fasting?'],
        tools:[{label:'Web Search',prompt:'Research current info on: '},{label:'Compare',prompt:'Compare and contrast: '},{label:'Pros & Cons',prompt:'List pros and cons of: '},{label:'SWOT Analysis',prompt:'Do a SWOT analysis for: '}],
        sysAddition:'You are a research AI. Provide detailed, well-structured answers. Present multiple perspectives.'}
};

/* ══════════════════════════════════════════════════════════
   PLAN LIMITS — feature access per tier
══════════════════════════════════════════════════════════ */
var PLAN_LIMITS = {
    free:    { msgPerDay: 30,  maxMsgLen: 2000,  memory: false, modes: ['general','student'] },
    pro:     { msgPerDay: 200, maxMsgLen: 8000,  memory: true,  modes: ['general','student','developer','creator','writer','research'] },
    premium: { msgPerDay: 999, maxMsgLen: 16000, memory: true,  modes: ['general','student','developer','creator','writer','research'] },
};

/* ══════════════════════════════════════════════════════════
   PERSISTENCE KEYS
══════════════════════════════════════════════════════════ */
var KEYS = {
    SESSION:    'keryo_session_v6',
    SETTINGS:   'keryo_settings',
    CHATS:      'keryo_chats',
    GUEST_CNT:  'keryo_guest_count',
    TOPICS:     'keryo_topics',
    PROMPTS:    'keryo_custom_prompts',
    PINNED:     'keryo_pinned',
    SEEN:       'keryo_seen_v5',
    TODAY_CNT:  'keryo_today_count',
    TODAY_DATE: 'keryo_today_date',
};

/* ══════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════ */
var chats=[], currentChatId=null, isGenerating=false;
var attachedFiles=[], currentUser=null, userPlan='free';
var planEndDate=null;  // Date object — when current plan expires
var sbClient=null, userScrolled=false, streamEl=null, streamText='';
var isSpeaking=false, recognizer=null, isListening=false;
var currentMode='general', guestMsgCount=0, GUEST_MSG_LIMIT=15;
var bannerShownFor={}, searchQuery='';
var settings=loadSettings();
var weakTopics=loadWeakTopics();
var customPrompts=loadCustomPrompts();
var sidebarCollapsed=false;

var KERYO_MODELS=[
    {id:'keryo-free',     name:'Keryo Spark',   plan:'free',    desc:'Fast · Free · Reliable'},
    {id:'keryo-pro',      name:'Keryo Pro',      plan:'pro',     desc:'Powered by Groq · Fast'},
    {id:'keryo-premium',  name:'Keryo Premium',  plan:'premium', desc:'Best quality · Full power'},
];
var KERYO_MODEL_NAMES={};
KERYO_MODELS.forEach(function(m){KERYO_MODEL_NAMES[m.id]=m.name;});
function modelLabel(m){return KERYO_MODEL_NAMES[m]||m;}
window.updateModelBadge=function(){};

/* ══════════════════════════════════════════════════════════
   DOM HELPERS
══════════════════════════════════════════════════════════ */
function el(id){return document.getElementById(id);}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

var messagesEl=el('messages');
var msgCont=el('messages-container');
var welcomeEl=el('welcome-screen');
var chatListEl=el('chat-list');
var userInput=el('user-input');
var sendBtn=el('send-btn');
var stopBtn=el('stop-btn');
var charCountEl=el('char-count');
var fileInputEl=el('file-input');
var fileStripEl=el('file-preview-strip');
var toastEl=el('toast');
var scrollBtnEl=el('scroll-bottom-btn');

/* ══════════════════════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════════════════════ */
function loadSettings(){
    try{
        var s=JSON.parse(localStorage.getItem(KEYS.SETTINGS)||'{}');
        return{model:s.model||'keryo-free',theme:s.theme||'light',lang:s.lang||'en',
            defaultMode:s.defaultMode||'general',memory:s.memory!==false,
            memoryText:s.memoryText||'',temperature:typeof s.temperature==='number'?s.temperature:0.7,
            fontSize:s.fontSize||'normal',soundNotify:s.soundNotify!==false,
            showFollowUp:s.showFollowUp!==false,showReadTime:s.showReadTime!==false};
    }catch(_){return{model:'keryo-free',theme:'light',lang:'en',defaultMode:'general',
        memory:true,memoryText:'',temperature:0.7,fontSize:'normal',soundNotify:true,
        showFollowUp:true,showReadTime:true};}
}
function saveSettings(){try{localStorage.setItem(KEYS.SETTINGS,JSON.stringify(settings));}catch(_){}}
function loadWeakTopics(){try{return JSON.parse(localStorage.getItem(KEYS.TOPICS)||'[]');}catch(_){return[];}}
function saveWeakTopics(){try{localStorage.setItem(KEYS.TOPICS,JSON.stringify(weakTopics));}catch(_){}}
function loadCustomPrompts(){try{return JSON.parse(localStorage.getItem(KEYS.PROMPTS)||'[]');}catch(_){return[];}}
function saveCustomPrompts(){try{localStorage.setItem(KEYS.PROMPTS,JSON.stringify(customPrompts));}catch(_){}}

/* ══════════════════════════════════════════════════════════
   SESSION PERSISTENCE — stays alive across browser restarts
══════════════════════════════════════════════════════════ */
function saveSession(){
    if(!currentUser) return;
    try{
        var data={
            user:    currentUser,
            plan:    userPlan,
            endDate: planEndDate?planEndDate.toISOString():null,
            saved:   Date.now()
        };
        localStorage.setItem(KEYS.SESSION, JSON.stringify(data));
    }catch(_){}
}
function loadSession(){
    try{
        var raw=localStorage.getItem(KEYS.SESSION);
        if(!raw) return null;
        var data=JSON.parse(raw);
        // Validate structure
        if(!data||!data.user||!data.user.sub) return null;
        // Check session is not older than 30 days
        var age=Date.now()-(data.saved||0);
        if(age > 30*24*60*60*1000){ clearSession(); return null; }
        return data;
    }catch(_){ return null; }
}
function clearSession(){
    localStorage.removeItem(KEYS.SESSION);
}

/* ══════════════════════════════════════════════════════════
   DAILY MESSAGE COUNTER
══════════════════════════════════════════════════════════ */
function getTodayCount(){
    var today=new Date().toDateString();
    var saved=localStorage.getItem(KEYS.TODAY_DATE);
    if(saved!==today){
        localStorage.setItem(KEYS.TODAY_DATE,today);
        localStorage.setItem(KEYS.TODAY_CNT,'0');
        return 0;
    }
    return parseInt(localStorage.getItem(KEYS.TODAY_CNT)||'0',10);
}
function incTodayCount(){
    var c=getTodayCount()+1;
    localStorage.setItem(KEYS.TODAY_CNT,String(c));
    return c;
}
function loadGuestCount(){guestMsgCount=parseInt(localStorage.getItem(KEYS.GUEST_CNT)||'0',10);}
function saveGuestCount(){try{localStorage.setItem(KEYS.GUEST_CNT,String(guestMsgCount));}catch(_){}}

/* ══════════════════════════════════════════════════════════
   PLAN MANAGEMENT
══════════════════════════════════════════════════════════ */
function setUserPlan(plan, endDateIso){
    var validPlans=['free','pro','premium'];
    userPlan = validPlans.includes(plan) ? plan : 'free';
    planEndDate = endDateIso ? new Date(endDateIso) : null;
    saveSession();
    updateAllPlanUI();
}
function checkPlanExpiry(){
    if(userPlan==='free') return;
    if(planEndDate && Date.now() > planEndDate.getTime()){
        userPlan='free';
        planEndDate=null;
        saveSession();
        updateAllPlanUI();
        toast('Your plan has expired. Downgraded to Free.','',4000);
    }
}
function updateAllPlanUI(){
    // Profile badge
    var pp=el('profile-plan-badge');
    if(pp){
        pp.textContent=userPlan.charAt(0).toUpperCase()+userPlan.slice(1);
        pp.className='profile-plan-badge plan-badge-'+userPlan;
    }
    // Settings label
    var spn=el('settings-plan-name');
    if(spn) spn.textContent=userPlan.charAt(0).toUpperCase()+userPlan.slice(1)+' Plan';
    // Upgrade modal: mark current plan
    document.querySelectorAll('.plan-card').forEach(function(card){
        var cardPlan=card.dataset.plan;
        var btn=card.querySelector('.plan-btn');
        if(!btn) return;
        if(cardPlan===userPlan){
            btn.textContent='Current Plan';
            btn.disabled=true;
            btn.className='plan-btn plan-current';
        } else {
            btn.disabled=false;
            btn.className='plan-btn plan-upgrade-btn';
            btn.textContent='Upgrade to '+card.querySelector('.plan-name').textContent;
        }
    });
    // Mode access chips
    var limits=PLAN_LIMITS[userPlan]||PLAN_LIMITS.free;
    document.querySelectorAll('.persona-chip').forEach(function(chip){
        var mode=chip.dataset.mode;
        var locked=!limits.modes.includes(mode);
        chip.classList.toggle('locked-chip', locked);
        chip.title=locked?'Available on Pro and Premium':'';
    });
    // Ads: show for free/guest, hide for pro/premium
    var adEls=document.querySelectorAll('.ad-banner');
    adEls.forEach(function(ad){
        ad.style.display=(userPlan==='free'||!currentUser)?'flex':'none';
    });
}

/* ══════════════════════════════════════════════════════════
   SUPABASE CLIENT
══════════════════════════════════════════════════════════ */
function tryInitSupabase(){
    try{
        if(window.supabase&&window.CONFIG&&CONFIG.SUPABASE_URL&&CONFIG.SUPABASE_KEY){
            sbClient=window.supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_KEY,{
                auth:{
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                }
            });
        }
    }catch(_){}
}
tryInitSupabase();
// Retry after scripts fully loaded
setTimeout(tryInitSupabase, 600);
setTimeout(tryInitSupabase, 1500);

/* Fetch latest plan from Supabase and apply it */
async function syncPlanFromServer(){
    if(!sbClient||!currentUser) return;
    try{
        // Primary: user_plans (written by backend after Razorpay / coupon activation)
        var r=await sbClient.from('user_plans')
            .select('plan,end_date')
            .eq('user_id',currentUser.sub)
            .single();
        if(!r.error && r.data){
            var plan=r.data.plan, endDate=r.data.end_date;
            if(plan && plan!=='free' && endDate && new Date(endDate).getTime()>Date.now()){
                setUserPlan(plan, endDate);
                // Keep profiles table in sync
                try{await sbClient.from('profiles').upsert({
                    id:currentUser.sub, plan:plan,
                    plan_expires_at:endDate, ads_enabled:false,
                    updated_at:new Date().toISOString()
                },{onConflict:'id'});}catch(_){}
                return;
            }
        }
        // Fallback: profiles table (faster lookup)
        var rp=await sbClient.from('profiles')
            .select('plan,plan_expires_at')
            .eq('id',currentUser.sub)
            .single();
        if(!rp.error && rp.data){
            var p2=rp.data.plan, exp2=rp.data.plan_expires_at;
            if(p2 && p2!=='free' && exp2 && new Date(exp2).getTime()>Date.now()){
                setUserPlan(p2, exp2); return;
            }
        }
        setUserPlan('free', null);
    }catch(_){
        // Network error — keep current plan state, don't downgrade
    }
}

/* Upsert user profile in Supabase profiles table */
async function upsertProfile(){
    if(!sbClient||!currentUser) return;
    try{
        await sbClient.from('profiles').upsert({
            id:         currentUser.sub,
            name:       (currentUser.name||'User').slice(0,120),
            email:      (currentUser.email||'').slice(0,254),
            picture:    (currentUser.picture||'').slice(0,512),
            is_guest:   false,
            ads_enabled: (userPlan==='free'),
            updated_at: new Date().toISOString(),
        },{onConflict:'id'});
    }catch(_){}
}

/* ══════════════════════════════════════════════════════════
   PERSISTENCE — chats & messages
══════════════════════════════════════════════════════════ */
function lsLoad(){try{return JSON.parse(localStorage.getItem(KEYS.CHATS)||'[]');}catch(_){return[];}}
function lsSave(){try{localStorage.setItem(KEYS.CHATS,JSON.stringify(chats));}catch(_){}}
function genId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

async function loadAllChats(){
    if(sbClient&&currentUser){
        try{
            var r=await sbClient.from('chats').select('id,title,created_at')
                .eq('user_id',currentUser.sub).order('created_at',{ascending:false}).limit(80);
            if(!r.error&&r.data){
                chats=r.data.map(function(c){return{id:c.id,title:c.title,messages:null};});
                renderChatList(); return;
            }
        }catch(_){}
    }
    chats=lsLoad(); renderChatList();
}
async function loadMessages(chatId){
    var chat=chats.find(function(c){return c.id===chatId;}); if(!chat) return[];
    if(chat.messages) return chat.messages;
    if(sbClient&&currentUser){
        try{
            var r=await sbClient.from('messages').select('role,content,msg_type,timestamp')
                .eq('chat_id',chatId).order('timestamp',{ascending:true});
            if(!r.error&&r.data){chat.messages=r.data;return chat.messages;}
        }catch(_){}
    }
    chat.messages=chat.messages||[]; return chat.messages;
}
async function persistNewChat(chat){
    if(sbClient&&currentUser){try{await sbClient.from('chats').insert({id:chat.id,user_id:currentUser.sub,title:chat.title});}catch(_){}}
    lsSave();
}
async function persistMessage(chatId,msg){
    var chat=chats.find(function(c){return c.id===chatId;}); if(!chat) return;
    if(!chat.messages)chat.messages=[];
    chat.messages.push(msg);
    if(sbClient&&currentUser){
        try{await sbClient.from('messages').insert({chat_id:chatId,role:msg.role,content:msg.content,msg_type:msg.type||'text',timestamp:msg.ts});}catch(_){}
    }
    lsSave();
}
async function persistTitle(chatId,title){
    if(sbClient&&currentUser){try{await sbClient.from('chats').update({title:title}).eq('id',chatId);}catch(_){}}
    lsSave();
}
async function persistDeleteChat(chatId){
    if(sbClient&&currentUser){
        try{
            await sbClient.from('messages').delete().eq('chat_id',chatId);
            await sbClient.from('chats').delete().eq('id',chatId);
        }catch(_){}
    }
    chats=chats.filter(function(c){return c.id!==chatId;}); lsSave();
}

/* ══════════════════════════════════════════════════════════
   APPLY SETTINGS
══════════════════════════════════════════════════════════ */
function applySettings(){
    var ms=el('model-select'); if(ms) ms.value=settings.model;
    applyTheme(settings.theme);
    var ls=el('lang-select'); if(ls) ls.value=settings.lang;
    var ts=el('temp-slider');
    if(ts){ts.value=Math.round(settings.temperature*100);var tl=el('temp-label');if(tl)tl.textContent=settings.temperature.toFixed(1);}
    document.querySelectorAll('.font-size-btn').forEach(function(b){b.classList.toggle('active',b.dataset.size===settings.fontSize);});
    applyFontSize(settings.fontSize);
    document.querySelectorAll('.theme-option-btn').forEach(function(b){b.classList.toggle('active',b.dataset.theme===settings.theme);});
    var mi=el('memory-input'); if(mi) mi.value=settings.memoryText||'';
    wireToggle('sound-toggle',settings.soundNotify);
    wireToggle('followup-toggle',settings.showFollowUp);
    wireToggle('readtime-toggle',settings.showReadTime);
    updateAllPlanUI();
}
function wireToggle(id,val){var b=el(id);if(b){b.setAttribute('aria-pressed',String(val));b.classList.toggle('on',val);}}
function applyFontSize(sz){var m={small:'13px',normal:'15px',large:'17px'};document.documentElement.style.setProperty('--msg-font-size',m[sz]||'15px');}
function applyTheme(theme){
    document.documentElement.setAttribute('data-theme',theme);
    settings.theme=theme;
    var li=el('theme-icon-light'),di=el('theme-icon-dark');
    if(li) li.style.display=(theme==='light')?'block':'none';
    if(di) di.style.display=(theme==='dark')?'block':'none';
    var hl=el('hljs-theme');
    if(hl) hl.href=theme==='light'?'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css':'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css';
}
var themeBtn=el('theme-btn');
if(themeBtn) themeBtn.addEventListener('click',function(){
    var next=settings.theme==='light'?'dark':'light';
    applyTheme(next); saveSettings();
    document.querySelectorAll('.theme-option-btn').forEach(function(b){b.classList.toggle('active',b.dataset.theme===next);});
    toast(next.charAt(0).toUpperCase()+next.slice(1)+' mode');
});

/* ══════════════════════════════════════════════════════════
   LANDING CANVAS + SCROLL REVEAL
══════════════════════════════════════════════════════════ */
(function(){
    var canvas=el('landing-canvas'); if(!canvas) return;
    var ctx=canvas.getContext('2d'),W,H,pts=[];
    function resize(){W=canvas.width=window.innerWidth;H=canvas.height=window.innerHeight;}
    function mkPt(){return{x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.2+0.3,a:Math.random(),da:(Math.random()-0.5)*0.003,sp:Math.random()*0.14+0.03,hue:Math.random()*60+220};}
    resize(); for(var i=0;i<70;i++) pts.push(mkPt());
    window.addEventListener('resize',resize);
    function draw(){
        ctx.clearRect(0,0,W,H);
        pts.forEach(function(p){
            p.a+=p.da; if(p.a<0)p.da=Math.abs(p.da); if(p.a>1)p.da=-Math.abs(p.da);
            p.y-=p.sp; if(p.y<-2){p.y=H+2;p.x=Math.random()*W;}
            ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
            ctx.fillStyle='hsla('+p.hue+',80%,70%,'+(p.a*0.35)+')'; ctx.fill();
        });
        requestAnimationFrame(draw);
    }
    draw();
})();

(function(){
    var lpPage=el('landing-page'); if(!lpPage) return;
    var lpNav=el('lp-nav'), prog=el('lp-prog');
    lpPage.addEventListener('scroll',function(){
        var s=lpPage.scrollTop, tot=lpPage.scrollHeight-lpPage.clientHeight;
        if(prog) prog.style.width=tot>0?(s/tot*100)+'%':'0%';
        if(lpNav) lpNav.classList.toggle('lp-nav-stuck',s>50);
    });
    if(window.IntersectionObserver){
        var obs=new IntersectionObserver(function(entries){
            entries.forEach(function(e){if(e.isIntersecting)e.target.classList.add('lp-vis');});
        },{root:lpPage,threshold:0.08});
        document.querySelectorAll('.lp-reveal').forEach(function(n){obs.observe(n);});
    } else {
        document.querySelectorAll('.lp-reveal').forEach(function(n){n.classList.add('lp-vis');});
    }
})();

/* ══════════════════════════════════════════════════════════
   AUTH MODAL
══════════════════════════════════════════════════════════ */
function showAuthModal(onSuccessAfterLogin){
    var modal=el('auth-modal'); if(!modal) return;
    // Store callback so after login we can redirect properly
    if(typeof onSuccessAfterLogin==='function') modal._onSuccess=onSuccessAfterLogin;
    modal.style.display='flex';
    modal.classList.remove('auth-closing');
}
function hideAuthModal(cb){
    var modal=el('auth-modal');
    if(!modal){if(typeof cb==='function')cb();return;}
    modal.classList.add('auth-closing');
    setTimeout(function(){
        modal.style.display='none';
        modal.classList.remove('auth-closing');
        if(typeof cb==='function') cb();
    },220);
}
(function(){
    var closeBtn=el('auth-modal-close'), modal=el('auth-modal');
    if(closeBtn) closeBtn.addEventListener('click',function(){hideAuthModal();});
    if(modal) modal.addEventListener('click',function(e){if(e.target===modal)hideAuthModal();});
})();
(function(){
    var gBtn=el('auth-google-btn'), gsBtn=el('auth-guest-btn');
    if(gBtn) gBtn.addEventListener('click',function(){hideAuthModal(function(){triggerGoogleSignIn();});});
    if(gsBtn) gsBtn.addEventListener('click',function(){
        hideAuthModal(function(){hideLandingPage(function(){enterAsGuest();});});
    });
})();

/* ══════════════════════════════════════════════════════════
   LANDING SHOW/HIDE
══════════════════════════════════════════════════════════ */
function showLandingPage(){
    var lp=el('landing-page'); if(!lp) return;
    lp.style.display='block'; lp.classList.remove('lp-exiting');
    var appEl=el('app'); if(appEl){appEl.style.display='none';appEl.classList.remove('app-visible');}
}
function hideLandingPage(cb){
    var lp=el('landing-page');
    if(!lp){if(typeof cb==='function')cb();return;}
    lp.classList.add('lp-exiting');
    localStorage.setItem(KEYS.SEEN,'1');
    setTimeout(function(){
        lp.style.display='none'; lp.classList.remove('lp-exiting');
        var appEl=el('app');
        appEl.style.display='flex';
        void appEl.offsetWidth;
        appEl.classList.add('app-visible');
        if(typeof cb==='function') cb();
    },300);
}

// Hero buttons
(function(){
    var gBtn=el('landing-google-btn'), gsBtn=el('landing-guest-btn');
    if(gBtn) gBtn.addEventListener('click',function(){showAuthModal();});
    if(gsBtn) gsBtn.addEventListener('click',function(){hideLandingPage(function(){enterAsGuest();});});
})();
(function(){
    var navBtn=el('lp-signin-btn');
    if(navBtn) navBtn.addEventListener('click',function(){showAuthModal();});
})();

/* ══════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════ */
var toastTimer;
function toast(msg,type,dur){
    if(!toastEl) return;
    toastEl.textContent=msg;
    toastEl.className='toast show'+(type?' toast-'+type:'');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(function(){toastEl.className='toast';},dur||2200);
}

/* ══════════════════════════════════════════════════════════
   SOUND
══════════════════════════════════════════════════════════ */
function playDoneSound(){
    if(!settings.soundNotify) return;
    try{var ac=new(window.AudioContext||window.webkitAudioContext)(),o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);o.frequency.setValueAtTime(880,ac.currentTime);o.frequency.exponentialRampToValueAtTime(1100,ac.currentTime+0.08);g.gain.setValueAtTime(0.12,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+0.3);o.start();o.stop(ac.currentTime+0.3);}catch(_){}
}

/* ══════════════════════════════════════════════════════════
   GUEST MODE
══════════════════════════════════════════════════════════ */
function enterAsGuest(){
    currentUser=null; userPlan='free'; planEndDate=null;
    loadGuestCount(); renderAccessState(); updateAllPlanUI();
    applyMode(settings.defaultMode);
    loadAllChats().then(function(){
        if(chats.length>0) selectChat(chats[0].id); else showWelcome();
    });
}

/* ══════════════════════════════════════════════════════════
   ACCESS STATE — sidebar profile vs guest card
══════════════════════════════════════════════════════════ */
function renderAccessState(){
    var pc=el('profile-card'), gc=el('guest-sidebar-card'), ns=el('nav-signin-btn');
    if(currentUser){
        if(pc)pc.style.display='block';
        if(gc)gc.style.display='none';
        if(ns)ns.style.display='none';
        updateProfileCard();
    } else {
        if(pc)pc.style.display='none';
        if(gc)gc.style.display='block';
        if(ns)ns.style.display='flex';
    }
    updateGuestBar();
    updateAllPlanUI();
}

function updateProfileCard(){
    if(!currentUser) return;
    var pe=el('profile-pic'), pn=el('profile-name'), pp=el('profile-plan-badge');
    var pmn=el('pm-name'), pme=el('pm-email'), pma=el('pm-avatar-img'), spn=el('settings-plan-name');
    if(pe){
        var picSrc=currentUser.picture||'';
        var safe=/^https:\/\/(lh[0-9]+\.googleusercontent\.com|.*\.googleapis\.com)\/.+/.test(picSrc);
        pe.src=safe?picSrc:''; pe.onerror=function(){this.style.display='none';};
    }
    if(pn)  pn.textContent=currentUser.name||'User';
    if(pp){pp.textContent=userPlan.charAt(0).toUpperCase()+userPlan.slice(1);pp.className='profile-plan-badge plan-badge-'+userPlan;}
    if(pmn) pmn.textContent=currentUser.name||'User';
    if(pme) pme.textContent=currentUser.email||'';
    if(pma&&currentUser.picture){
        var pic2=currentUser.picture||'';
        var safe2=/^https:\/\/(lh[0-9]+\.googleusercontent\.com|.*\.googleapis\.com)\/.+/.test(pic2);
        if(safe2){var img=document.createElement('img');img.src=pic2;img.style.cssText='width:32px;height:32px;border-radius:50%;object-fit:cover';img.alt='Profile';img.onerror=function(){this.remove();};pma.innerHTML='';pma.appendChild(img);}
    }
    if(spn) spn.textContent=userPlan.charAt(0).toUpperCase()+userPlan.slice(1)+' Plan';
}

function updateGuestBar(){
    if(currentUser) return;
    var left=Math.max(0,GUEST_MSG_LIMIT-guestMsgCount);
    if(left<=5&&left>0) showGuestBanner(left+' messages left','Sign in for unlimited access');
}

/* ══════════════════════════════════════════════════════════
   GOOGLE SIGN-IN
══════════════════════════════════════════════════════════ */
function triggerGoogleSignIn(){
    if(typeof google==='undefined'||!google.accounts){toast('Google Sign-in loading… try again','',2000);return;}
    google.accounts.id.prompt(function(n){
        if(n.isNotDisplayed()||n.isSkippedMoment()){
            var bd=document.createElement('div');
            bd.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:var(--surface);border-radius:16px;padding:24px;box-shadow:0 8px 40px rgba(0,0,0,0.15);border:1px solid var(--border)';
            bd.innerHTML='<div style="font-size:15px;font-weight:600;margin-bottom:14px;font-family:var(--font-display)">Sign in to Keryo AI</div>';
            document.body.appendChild(bd);
            google.accounts.id.renderButton(bd,{theme:'outline',size:'large',text:'sign_in_with',width:260});
        }
    });
}

window.handleGoogleCredential=function(resp){
    if(!resp||!resp.credential){toast('Sign-in failed','error');return;}
    try{
        var parts=resp.credential.split('.');
        if(parts.length!==3){toast('Sign-in failed','error');return;}
        var payload=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
        var nowSec=Math.floor(Date.now()/1000);
        if(!payload.exp||payload.exp<nowSec){toast('Session expired. Please sign in again.','error');return;}
        var expectedAud=(typeof CONFIG!=='undefined')&&CONFIG.GOOGLE_CLIENT_ID;
        if(expectedAud&&payload.aud&&payload.aud!==expectedAud){toast('Sign-in failed','error');return;}

        currentUser={
            sub:      String(payload.sub||''),
            name:     String(payload.name||'User').slice(0,120),
            email:    String(payload.email||'').slice(0,254),
            picture:  String(payload.picture||'').slice(0,512),
            _loginAt: Date.now(),
            _expAt:   payload.exp*1000,
        };

        // Check if there was a pending upgrade — auth-modal may have been triggered by upgrade click
        var modal=el('auth-modal');
        var pendingPlan=modal?modal._pendingPlan:null;
        if(modal) modal._pendingPlan=null;

        hideAuthModal();
        hideLandingPage(function(){
            renderAccessState();
            applyMode(settings.defaultMode);
            // Upsert profile & sync plan from server, then continue
            upsertProfile();
            syncPlanFromServer().then(function(){
                updateAllPlanUI();
                loadAllChats().then(function(){
                    if(chats.length>0) selectChat(chats[0].id); else showWelcome();
                    toast('Welcome, '+currentUser.name+'!','success');
                    // If user clicked upgrade before login, open upgrade modal now
                    if(pendingPlan){
                        setTimeout(function(){ openUpgradeModal(pendingPlan); }, 600);
                    }
                });
            });
        });
    }catch(e){
        toast('Sign-in failed. Please try again.','error');
    }
};

function initGoogleSignIn(){
    if(typeof google==='undefined'||!google.accounts){setTimeout(initGoogleSignIn,500);return;}
    try{google.accounts.id.initialize({client_id:CONFIG.GOOGLE_CLIENT_ID,callback:window.handleGoogleCredential,auto_select:false,cancel_on_tap_outside:true});}catch(_){}
}
initGoogleSignIn();
var navSignin=el('nav-signin-btn'); if(navSignin) navSignin.addEventListener('click',triggerGoogleSignIn);
var gscSignin=el('gsc-signin-btn'); if(gscSignin) gscSignin.addEventListener('click',triggerGoogleSignIn);

/* ══════════════════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════════════════ */
function setSidebar(collapsed){
    sidebarCollapsed=collapsed;
    var sb=el('sidebar'), nl=el('nav-logo'), ca=el('sb-collapsed-actions');
    if(collapsed){
        sb.classList.add('collapsed');
        if(nl) nl.style.display=window.innerWidth<=768?'flex':'none';
        if(ca) ca.style.display='flex';
    } else {
        sb.classList.remove('collapsed');
        if(nl) nl.style.display='none';
        if(ca) ca.style.display='none';
    }
}
var sbBtn=el('sidebar-collapse-btn'); if(sbBtn) sbBtn.addEventListener('click',function(){setSidebar(true);});
var sbLogo=el('sb-logo'); if(sbLogo) sbLogo.addEventListener('click',function(){if(sidebarCollapsed)setSidebar(false);});
var menuBtn=el('menu-btn');
if(menuBtn) menuBtn.addEventListener('click',function(){
    var sb=el('sidebar');
    if(window.innerWidth<=768) sb.classList.toggle('mobile-open');
    else setSidebar(!sidebarCollapsed);
});
(function(){
    var upBtn=el('sb-upgrade-icon-btn');
    if(upBtn) upBtn.addEventListener('click',function(){setSidebar(false);setTimeout(function(){openUpgradeModal();},250);});
    var srBtn=el('sb-search-icon-btn');
    if(srBtn) srBtn.addEventListener('click',function(){setSidebar(false);setTimeout(function(){var sc=el('chat-search');if(sc)sc.focus();},280);});
})();

/* ══════════════════════════════════════════════════════════
   UPGRADE MODAL — Razorpay + Coupon system
══════════════════════════════════════════════════════════ */

// Coupon state (per modal open)
var _activeCoupon = null;  // { code, discountPct, free }

function openUpgradeModal(highlightPlan){
    updateAllPlanUI();
    resetCouponUI();
    var modal=el('upgrade-modal');
    if(!modal) return;
    modal.style.display='flex';
    if(highlightPlan){
        var card=modal.querySelector('[data-plan="'+highlightPlan+'"]');
        if(card) card.classList.add('plan-highlight');
        setTimeout(function(){if(card) card.classList.remove('plan-highlight');},2000);
    }
}

function resetCouponUI(){
    _activeCoupon=null;
    var inp=el('coupon-input'), fb=el('coupon-feedback');
    if(inp){inp.value='';inp.className='coupon-input';}
    if(fb){fb.style.display='none';fb.textContent='';fb.className='coupon-feedback';}
    // Reset plan prices to original
    document.querySelectorAll('.plan-card').forEach(function(card){
        var priceEl=card.querySelector('.plan-price');
        if(priceEl) priceEl.innerHTML=priceEl.dataset.orig||priceEl.innerHTML;
    });
}

function showCouponFeedback(msg, type){
    var fb=el('coupon-feedback');
    if(!fb) return;
    fb.textContent=msg;
    fb.className='coupon-feedback cf-'+type;
    fb.style.display='block';
}

function applyDiscountToPrices(discountPct){
    // Update the displayed price on each paid plan card
    document.querySelectorAll('.plan-card').forEach(function(card){
        var plan=card.dataset.plan;
        if(!plan||plan==='free') return;
        var cfg=window.CONFIG&&CONFIG.PLANS&&CONFIG.PLANS[plan];
        if(!cfg) return;
        var origPrice=cfg.price; // e.g. 99 or 299
        var discounted=Math.round(origPrice*(1-(discountPct/100)));
        var priceEl=card.querySelector('.plan-price');
        if(!priceEl) return;
        // Store original HTML once
        if(!priceEl.dataset.orig) priceEl.dataset.orig=priceEl.innerHTML;
        priceEl.innerHTML=
            '<span class="plan-price-original">₹'+origPrice+'</span>'+
            '₹'+discounted+'<span>/month</span>'+
            '<span class="plan-discount-badge">-'+discountPct+'%</span>';
    });
}

// Coupon apply button
(function(){
    var applyBtn=el('coupon-apply-btn');
    if(!applyBtn) return;
    applyBtn.addEventListener('click', async function(){
        var inp=el('coupon-input');
        var code=(inp&&inp.value||'').trim();
        if(!code){ showCouponFeedback('Please enter a coupon code.','error'); return; }

        applyBtn.disabled=true;
        applyBtn.textContent='Checking…';
        showCouponFeedback('','');

        try{
            // Validate coupon via create-order (use 'pro' as a probe plan)
            var resp=await fetch('/api/create-order',{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    plan:'pro',
                    userId:currentUser?currentUser.sub:'guest_probe',
                    coupon:code,
                    probeOnly:true
                })
            });
            var data=await resp.json();

            if(!resp.ok){
                // 400 with 'Invalid coupon' message
                inp.className='coupon-input coupon-invalid';
                showCouponFeedback(data.error||'Invalid coupon code.','error');
                _activeCoupon=null;
            } else {
                inp.className='coupon-input coupon-valid';
                _activeCoupon={ code:code, discountPct:data.discountPct||0, free:data.free||false };
                if(data.free){
                    showCouponFeedback('🎉 100% off — Plan is FREE with this coupon!','success');
                    applyDiscountToPrices(100);
                } else {
                    showCouponFeedback('✓ '+data.discountPct+'% off applied!','success');
                    applyDiscountToPrices(data.discountPct||0);
                }
            }
        }catch(_){
            showCouponFeedback('Could not validate coupon. Please try again.','error');
            _activeCoupon=null;
        }finally{
            applyBtn.disabled=false;
            applyBtn.textContent='Apply';
        }
    });
})();

// Upgrade button clicks (delegated from the modal)
document.addEventListener('click',function(e){
    var btn=e.target.closest('.plan-upgrade-btn');
    if(!btn) return;
    var card=btn.closest('.plan-card');
    if(!card) return;
    var plan=card.dataset.plan;
    if(!plan||plan==='free') return;

    // Guest must log in first
    if(!currentUser){
        var modal=el('auth-modal');
        if(modal) modal._pendingPlan=plan;
        el('upgrade-modal').style.display='none';
        showAuthModal();
        toast('Please sign in to upgrade','',2500);
        return;
    }
    startPayment(plan);
});

var umClose=el('upgrade-modal-close');
if(umClose) umClose.addEventListener('click',function(){el('upgrade-modal').style.display='none';resetCouponUI();});
var umModal=el('upgrade-modal');
if(umModal) umModal.addEventListener('click',function(e){if(e.target===this){this.style.display='none';resetCouponUI();}});

var settingsUpg=el('settings-upgrade-btn');
if(settingsUpg) settingsUpg.addEventListener('click',function(){el('settings-modal').style.display='none';openUpgradeModal();});

/* ══════════════════════════════════════════════════════════
   PAYMENT FLOW — Razorpay + coupon aware
══════════════════════════════════════════════════════════ */
async function startPayment(plan){
    if(!currentUser){toast('Please sign in first','error');return;}

    var planInfo=(window.CONFIG&&CONFIG.PLANS&&CONFIG.PLANS[plan])||{label:plan,priceStr:'₹?'};
    var modal=el('upgrade-modal');
    var card=modal&&modal.querySelector('[data-plan="'+plan+'"]');
    var btn=card&&card.querySelector('.plan-upgrade-btn');
    var couponCode=(_activeCoupon&&_activeCoupon.code)||'';

    if(btn){btn.disabled=true;btn.textContent='Processing…';}

    try{
        // 1. Create order (or get free-unlock signal) from server
        var resp=await fetch('/api/create-order',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({plan:plan, userId:currentUser.sub, coupon:couponCode})
        });
        var orderData=await resp.json();

        if(!resp.ok){
            throw new Error(orderData.error||'Something went wrong. Please try again.');
        }

        // 2a. Free unlock (100% coupon)
        if(orderData.free){
            if(modal) modal.style.display='none';
            resetCouponUI();
            await activateFreePlan(plan, couponCode);
            return;
        }

        // 2b. Paid — open Razorpay
        if(!orderData.id) throw new Error('Something went wrong. Please try again.');

        var options={
            key:         CONFIG.RAZORPAY_KEY_ID,
            amount:      orderData.amount,
            currency:    orderData.currency||'INR',
            name:        'Keryo AI',
            description: planInfo.label+' — 1 Month'+(orderData.discountPct?' ('+orderData.discountPct+'% off)':''),
            order_id:    orderData.id,
            prefill:{ name:currentUser.name||'', email:currentUser.email||'' },
            theme:{ color:'#5F43E9' },
            modal:{
                ondismiss:function(){
                    if(btn){btn.disabled=false;btn.textContent='Upgrade to '+planInfo.label;}
                    updateAllPlanUI();
                }
            },
            handler:async function(rzpResp){
                if(btn){btn.disabled=true;btn.textContent='Verifying…';}
                await verifyPayment(plan, rzpResp);
            }
        };

        if(modal) modal.style.display='none';

        if(!window.Razorpay) await loadScript('https://checkout.razorpay.com/v1/checkout.js');
        var rzp=new window.Razorpay(options);
        rzp.on('payment.failed',function(r){
            toast('Payment failed. Please try again.','error',4000);
            if(btn){btn.disabled=false;btn.textContent='Upgrade to '+planInfo.label;}
            updateAllPlanUI();
        });
        rzp.open();

    }catch(err){
        toast(err.message||'Something went wrong. Please try again.','error',3500);
        if(btn){btn.disabled=false;btn.textContent='Upgrade to '+planInfo.label;}
        updateAllPlanUI();
    }
}

// Activate a plan that was unlocked for free (100% coupon)
async function activateFreePlan(plan, couponCode){
    try{
        var resp=await fetch('/api/activate-plan',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({plan:plan, userId:currentUser.sub, coupon:couponCode})
        });
        var data=await resp.json();
        if(!resp.ok||!data.success) throw new Error(data.error||'Activation failed');
        setUserPlan(plan, data.endDate);
        saveSession();
        showPaymentSuccess(plan);
    }catch(err){
        toast(err.message||'Something went wrong. Please try again.','error',4000);
        updateAllPlanUI();
    }
}

async function verifyPayment(plan, rzpResponse){
    try{
        var resp=await fetch('/api/verify-payment',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                razorpay_order_id:   rzpResponse.razorpay_order_id,
                razorpay_payment_id: rzpResponse.razorpay_payment_id,
                razorpay_signature:  rzpResponse.razorpay_signature,
                plan:    plan,
                userId:  currentUser.sub,
            })
        });
        var data=await resp.json();
        if(!resp.ok||!data.success) throw new Error(data.error||'Verification failed');
        setUserPlan(plan, data.endDate);
        saveSession();
        showPaymentSuccess(plan);
    }catch(err){
        toast('Something went wrong. Please try again.','error',5000);
        updateAllPlanUI();
    }
}

function loadScript(src){
    return new Promise(function(resolve,reject){
        var s=document.createElement('script');
        s.src=src; s.onload=resolve; s.onerror=reject;
        document.head.appendChild(s);
    });
}

/* ══════════════════════════════════════════════════════════
   PAYMENT SUCCESS ANIMATION
══════════════════════════════════════════════════════════ */
function showPaymentSuccess(plan){
    var overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px)';
    var planLabel=window.CONFIG&&CONFIG.PLANS[plan]?CONFIG.PLANS[plan].label:plan;
    overlay.innerHTML=
        '<div style="background:var(--surface);border-radius:24px;padding:40px 48px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.25);max-width:340px;width:90%;animation:successPop .35s cubic-bezier(.34,1.56,.64,1)">'+
        '<div class="success-tick-wrap">'+
        '<svg class="success-tick-svg" viewBox="0 0 80 80" width="80" height="80">'+
        '<circle class="tick-circle" cx="40" cy="40" r="36" fill="none" stroke="#22c55e" stroke-width="5" stroke-dasharray="226" stroke-dashoffset="226"/>'+
        '<polyline class="tick-check" points="22,42 35,55 58,28" fill="none" stroke="#22c55e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="60" stroke-dashoffset="60"/>'+
        '</svg></div>'+
        '<div style="font-size:22px;font-weight:700;margin:16px 0 6px;color:var(--text1)">Welcome to '+esc(planLabel)+'!</div>'+
        '<div style="font-size:14px;color:var(--text2);margin-bottom:20px">Your plan is now active. Enjoy all the features!</div>'+
        '<button id="success-close-btn" style="background:var(--accent);color:#fff;border:none;border-radius:12px;padding:12px 28px;font-size:15px;font-weight:600;cursor:pointer;width:100%">Start Exploring ✦</button>'+
        '</div>';
    document.body.appendChild(overlay);

    // Inject animation CSS once
    if(!el('success-anim-css')){
        var style=document.createElement('style');
        style.id='success-anim-css';
        style.textContent=
            '@keyframes successPop{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}'+
            '.tick-circle{animation:tickCircle .6s .1s ease forwards}'+
            '.tick-check{animation:tickCheck .4s .65s ease forwards}'+
            '@keyframes tickCircle{to{stroke-dashoffset:0}}'+
            '@keyframes tickCheck{to{stroke-dashoffset:0}}';
        document.head.appendChild(style);
    }

    function closeSuccess(){
        document.body.removeChild(overlay);
        // Redirect to correct plan home
        updateAllPlanUI();
        applyMode(settings.defaultMode);
        if(!currentChatId){ showWelcome(); }
        toast(planLabel+' unlocked!','success',3000);
    }
    overlay.querySelector('#success-close-btn').addEventListener('click',closeSuccess);
    overlay.addEventListener('click',function(e){if(e.target===overlay)closeSuccess();});
    // Auto-close after 6 seconds
    setTimeout(closeSuccess, 6000);
}

/* ══════════════════════════════════════════════════════════
   3-DOT CHAT MENU
══════════════════════════════════════════════════════════ */
(function(){
    var dotBtn=el('chat-dot-btn'), dropdown=el('chat-dot-dropdown');
    if(!dotBtn||!dropdown) return;
    dotBtn.addEventListener('click',function(e){
        e.stopPropagation();
        var open=dropdown.style.display==='block';
        dropdown.style.display=open?'none':'block';
        dotBtn.classList.toggle('active',!open);
        dotBtn.setAttribute('aria-expanded',String(!open));
    });
    document.addEventListener('click',function(e){
        if(!e.target.closest('#chat-dot-menu')){dropdown.style.display='none';dotBtn.classList.remove('active');dotBtn.setAttribute('aria-expanded','false');}
    });
    var pinBtn=el('cdd-pin');
    if(pinBtn) pinBtn.addEventListener('click',function(){
        dropdown.style.display='none'; dotBtn.classList.remove('active');
        if(!currentChatId){toast('No chat selected','',1600);return;}
        var pinnedIds=JSON.parse(localStorage.getItem(KEYS.PINNED)||'[]');
        var idx=pinnedIds.indexOf(currentChatId);
        if(idx===-1){pinnedIds.push(currentChatId);toast('Chat pinned ✓');}
        else{pinnedIds.splice(idx,1);toast('Chat unpinned');}
        localStorage.setItem(KEYS.PINNED,JSON.stringify(pinnedIds));
        renderChatList();
    });
    var renBtn=el('cdd-rename');
    if(renBtn) renBtn.addEventListener('click',function(){
        dropdown.style.display='none'; dotBtn.classList.remove('active');
        if(!currentChatId){toast('No chat selected','',1600);return;}
        var chat=chats.find(function(c){return c.id===currentChatId;});
        if(!chat) return;
        var item=chatListEl.querySelector('.chat-item.active');
        if(item) startRename(item,chat);
    });
    var delBtn=el('cdd-delete');
    if(delBtn) delBtn.addEventListener('click',function(){
        dropdown.style.display='none'; dotBtn.classList.remove('active');
        if(!currentChatId){toast('No chat selected','',1600);return;}
        showDeleteConfirm(currentChatId);
    });
})();

/* ══════════════════════════════════════════════════════════
   MODEL PICKER
══════════════════════════════════════════════════════════ */
function setActiveModel(modelId, skipSave){
    var m=KERYO_MODELS.find(function(x){return x.id===modelId;});
    if(!m){m=KERYO_MODELS[0];modelId=m.id;}
    settings.model=modelId;
    if(!skipSave) saveSettings();
    var ne=el('model-pick-name'); if(ne) ne.textContent=m.name;
    document.querySelectorAll('.model-pick-option').forEach(function(b){b.classList.toggle('mpo-active',b.dataset.model===modelId);});
    var ms=el('model-select'); if(ms) ms.value=modelId;
}
(function(){
    var btn=el('model-pick-btn'), menu=el('model-pick-menu');
    if(!btn||!menu) return;
    btn.addEventListener('click',function(e){
        e.stopPropagation();
        var open=menu.classList.toggle('open');
        btn.classList.toggle('open',open);
        btn.setAttribute('aria-expanded',String(open));
    });
    document.addEventListener('click',function(e){
        if(!e.target.closest('#model-picker')){menu.classList.remove('open');btn.classList.remove('open');btn.setAttribute('aria-expanded','false');}
    });
    document.querySelectorAll('.model-pick-option').forEach(function(opt){
        opt.addEventListener('click',function(e){
            e.stopPropagation();
            menu.classList.remove('open');btn.classList.remove('open');btn.setAttribute('aria-expanded','false');
            var modelId=opt.dataset.model;
            var mdef=KERYO_MODELS.find(function(x){return x.id===modelId;});
            // Check plan access
            if(mdef && mdef.plan && mdef.plan !== 'free'){
                if((mdef.plan==='premium' && userPlan!=='premium') ||
                   (mdef.plan==='pro'     && userPlan==='free')){
                    openUpgradeModal(mdef.plan); return;
                }
            }
            setActiveModel(modelId);
            toast('Model: '+(mdef?mdef.name:modelId));
        });
    });
})();

/* ══════════════════════════════════════════════════════════
   PERSONA CHIPS (with plan access check)
══════════════════════════════════════════════════════════ */
document.querySelectorAll('.persona-chip').forEach(function(chip){
    chip.addEventListener('click',function(){
        var mode=chip.dataset.mode;
        if(!mode||!MODES[mode]) return;
        var limits=PLAN_LIMITS[userPlan]||PLAN_LIMITS.free;
        if(!limits.modes.includes(mode)){
            toast('Upgrade to Pro to unlock '+(MODES[mode].label||mode)+' mode','',2800);
            openUpgradeModal();
            return;
        }
        applyMode(mode); saveSettings();
    });
});

/* ══════════════════════════════════════════════════════════
   PROFILE MENU
══════════════════════════════════════════════════════════ */
var pct=el('profile-card-trigger');
if(pct){
    pct.addEventListener('click',function(){var menu=el('profile-menu'),chev=el('profile-chevron');var open=menu.style.display==='block';menu.style.display=open?'none':'block';if(chev)chev.classList.toggle('open',!open);});
    document.addEventListener('click',function(e){if(!e.target.closest('#profile-card')){var m=el('profile-menu');if(m)m.style.display='none';var c=el('profile-chevron');if(c)c.classList.remove('open');}});
}
var pmSBtn=el('pm-settings-btn'); if(pmSBtn) pmSBtn.addEventListener('click',function(){el('profile-menu').style.display='none';applySettings();el('settings-modal').style.display='flex';});
var pmUBtn=el('pm-upgrade-btn'); if(pmUBtn) pmUBtn.addEventListener('click',function(){el('profile-menu').style.display='none';openUpgradeModal();});
var pmLBtn=el('pm-logout-btn');
if(pmLBtn) pmLBtn.addEventListener('click',function(){
    if(currentUser&&currentUser.sub){
        try{if(typeof google!=='undefined'&&google.accounts&&google.accounts.id){google.accounts.id.revoke(currentUser.email||'',function(){});}}catch(_){}
    }
    currentUser=null; userPlan='free'; planEndDate=null; attachedFiles=[]; streamText=''; streamEl=null;
    clearSession();
    localStorage.removeItem(KEYS.SEEN);
    localStorage.removeItem(KEYS.CHATS);
    var menu=el('profile-menu'); if(menu) menu.style.display='none';
    chats=[]; currentChatId=null; lsSave(); renderChatList(); showWelcome(); renderAccessState();
    toast('Signed out');
    setTimeout(function(){
        var appEl=el('app');
        appEl.classList.remove('app-visible');
        setTimeout(function(){appEl.style.display='none';showLandingPage();},200);
    },500);
});

/* ══════════════════════════════════════════════════════════
   APPLY MODE
══════════════════════════════════════════════════════════ */
function applyMode(mode){
    if(!MODES[mode]) mode='general';
    currentMode=mode; settings.defaultMode=mode;
    var md=MODES[mode];
    document.querySelectorAll('.persona-chip').forEach(function(b){b.classList.toggle('active',b.dataset.mode===mode);});
    if(userInput) userInput.placeholder=md.placeholder;
    renderModeTools(md);
    renderExamplePrompts(md);
    var ws=el('welcome-subtitle'); if(ws) ws.textContent=md.subtitle;
}
function renderModeTools(md){
    var strip=el('mode-tools-strip'); if(!strip) return;
    strip.innerHTML='';
    (md.tools||[]).forEach(function(tool){
        var btn=document.createElement('button'); btn.className='mode-tool-btn';
        btn.textContent=tool.label;
        btn.addEventListener('click',function(){userInput.value=tool.prompt;userInput.dispatchEvent(new Event('input'));userInput.focus();});
        strip.appendChild(btn);
    });
}
function renderExamplePrompts(md){
    var c=el('example-prompts'); if(!c) return;
    c.innerHTML='';
    (md.prompts||[]).forEach(function(p){
        var d=document.createElement('div'); d.className='example-chip'; d.textContent=p;
        d.addEventListener('click',function(){userInput.value=p;updateSendBtn();userInput.focus();});
        c.appendChild(d);
    });
}

/* ══════════════════════════════════════════════════════════
   GUEST BANNER
══════════════════════════════════════════════════════════ */
function showGuestBanner(title,sub){
    if(currentUser) return;
    var key=(title||'').slice(0,30); if(bannerShownFor[key]) return; bannerShownFor[key]=true;
    var banner=el('guest-banner'), gt=el('guest-banner-text');
    if(!banner) return;
    if(gt) gt.textContent=(title||'Sign in')+(sub?' — '+sub:'');
    banner.style.display='flex';
}
var gbSignin=el('guest-banner-signin'); if(gbSignin) gbSignin.addEventListener('click',function(){el('guest-banner').style.display='none';triggerGoogleSignIn();});
var gbClose=el('guest-banner-close'); if(gbClose) gbClose.addEventListener('click',function(){el('guest-banner').style.display='none';});

/* ══════════════════════════════════════════════════════════
   CHAT MANAGEMENT
══════════════════════════════════════════════════════════ */
async function createNewChat(){
    var chat={id:genId(),title:'New Chat',messages:[]};
    chats.unshift(chat);
    if(currentUser) await persistNewChat(chat); else lsSave();
    renderChatList(); selectChat(chat.id); return chat.id;
}
async function selectChat(id){
    currentChatId=id;
    var chat=chats.find(function(c){return c.id===id;}); if(!chat) return;
    welcomeEl.style.display='none'; messagesEl.innerHTML=''; userScrolled=false;
    renderChatList();
    var msgs=await loadMessages(id);
    for(var i=0;i<msgs.length;i++) appendMessage(msgs[i].role,msgs[i].content,msgs[i].ts||msgs[i].timestamp,false,msgs[i].type||msgs[i].msg_type);
    scrollBottom(true);
    if(window.innerWidth<=768) el('sidebar').classList.remove('mobile-open');
}
function showWelcome(){messagesEl.innerHTML='';welcomeEl.style.display='flex';currentChatId=null;applyMode(currentMode);}
function renderChatList(query){
    query=query!==undefined?query:searchQuery;
    chatListEl.innerHTML='';
    var all=chats.slice();
    var pinned=JSON.parse(localStorage.getItem(KEYS.PINNED)||'[]');
    all.sort(function(a,b){var ap=pinned.indexOf(a.id)!==-1,bp=pinned.indexOf(b.id)!==-1;if(ap&&!bp)return -1;if(!ap&&bp)return 1;return 0;});
    var filtered=query?all.filter(function(c){return c.title.toLowerCase().includes(query.toLowerCase());}):all;
    var sl=document.querySelector('.chat-section-label'); if(sl) sl.textContent=query?'Search results':'Recent';
    if(!filtered.length){chatListEl.innerHTML='<div style="padding:10px 8px;font-size:12px;color:var(--text3);text-align:center">'+(query?'No matching chats':'No chats yet')+'</div>';return;}
    filtered.forEach(function(chat){
        var isPinned=pinned.indexOf(chat.id)!==-1;
        var div=document.createElement('div');
        div.className='chat-item'+(chat.id===currentChatId?' active':'')+(isPinned?' pinned':'');
        div.innerHTML='<div class="chat-item-title" title="'+esc(chat.title)+'">'+esc(chat.title)+'</div>'
            +'<div class="chat-item-actions">'
            +'<button class="ci-btn ci-pin-btn" title="'+(isPinned?'Unpin':'Pin')+'" data-id="'+chat.id+'"><svg viewBox="0 0 24 24" fill="'+(isPinned?'currentColor':'none')+'" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="11" height="11"><path d="M12 17v5M8 17h8M5.586 10.586L12 4.172l6.414 6.414M12 4v8"/></svg></button>'
            +'<button class="ci-btn ci-rename-btn" title="Rename" data-id="'+chat.id+'"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
            +'<button class="ci-btn danger ci-del-btn" title="Delete" data-id="'+chat.id+'"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>'
            +'</div>';
        div.addEventListener('click',function(e){if(e.target.closest('.chat-item-actions'))return;selectChat(chat.id);});
        div.querySelector('.chat-item-title').addEventListener('dblclick',function(e){e.stopPropagation();startRename(div,chat);});
        chatListEl.appendChild(div);
    });
}
function startRename(div,chat){
    var te=div.querySelector('.chat-item-title');
    var inp=document.createElement('input'); inp.className='chat-item-title-input'; inp.value=chat.title;
    te.replaceWith(inp); inp.select(); inp.focus();
    function finish(){var t=inp.value.trim()||chat.title;chat.title=t;persistTitle(chat.id,t);renderChatList();}
    inp.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();finish();}if(e.key==='Escape')renderChatList();});
    inp.addEventListener('blur',finish);
}
chatListEl.addEventListener('click',function(e){
    var db=e.target.closest('.ci-del-btn'); if(db){showDeleteConfirm(db.dataset.id);return;}
    var pb=e.target.closest('.ci-pin-btn');
    if(pb){var id=pb.dataset.id,pin=JSON.parse(localStorage.getItem(KEYS.PINNED)||'[]'),ix=pin.indexOf(id);if(ix===-1){pin.push(id);toast('Chat pinned');}else{pin.splice(ix,1);toast('Chat unpinned');}localStorage.setItem(KEYS.PINNED,JSON.stringify(pin));renderChatList();return;}
    var rb=e.target.closest('.ci-rename-btn');
    if(rb){var cid=rb.dataset.id,ch=chats.find(function(c){return c.id===cid;}),dv=rb.closest('.chat-item');if(ch&&dv)startRename(dv,ch);return;}
});
var chatSearch=el('chat-search'); if(chatSearch) chatSearch.addEventListener('input',function(){searchQuery=this.value.trim();renderChatList(searchQuery);});
var ncBtn=el('new-chat-btn'); if(ncBtn) ncBtn.addEventListener('click',createNewChat);

/* ══════════════════════════════════════════════════════════
   DELETE CONFIRM BANNER
══════════════════════════════════════════════════════════ */
var _dcbTarget=null, _dcbTimer=null;
function showDeleteConfirm(chatId){
    _dcbTarget=chatId;
    var b=el('delete-confirm-banner'); if(!b) return;
    b.style.display='block';
    requestAnimationFrame(function(){b.classList.add('dcb-show');});
    clearTimeout(_dcbTimer);
    _dcbTimer=setTimeout(function(){hideDeleteConfirm();},6000);
}
function hideDeleteConfirm(){
    var b=el('delete-confirm-banner'); if(!b) return;
    b.classList.remove('dcb-show');
    setTimeout(function(){b.style.display='none';_dcbTarget=null;},220);
    clearTimeout(_dcbTimer);
}
(function(){
    var cancelBtn=el('dcb-cancel'), confirmBtn=el('dcb-confirm');
    if(cancelBtn) cancelBtn.addEventListener('click',hideDeleteConfirm);
    if(confirmBtn) confirmBtn.addEventListener('click',function(){
        if(!_dcbTarget){hideDeleteConfirm();return;}
        var delId=_dcbTarget;
        hideDeleteConfirm();
        persistDeleteChat(delId);
        renderChatList();
        if(currentChatId===delId){currentChatId=null;showWelcome();}
        toast('Chat deleted');
    });
})();

/* ══════════════════════════════════════════════════════════
   MESSAGES
══════════════════════════════════════════════════════════ */
function scrollBottom(force){if(force||!userScrolled) msgCont.scrollTop=msgCont.scrollHeight;}
msgCont.addEventListener('scroll',function(){
    var atBottom=msgCont.scrollHeight-msgCont.scrollTop-msgCont.clientHeight<60;
    userScrolled=!atBottom;
    if(scrollBtnEl) scrollBtnEl.style.display=atBottom?'none':'flex';
    var ind=el('scroll-indicator');
    if(ind){var total=msgCont.scrollHeight-msgCont.clientHeight;ind.style.width=total>0?(msgCont.scrollTop/total*100)+'%':'0%';}
});
if(scrollBtnEl) scrollBtnEl.addEventListener('click',function(){userScrolled=false;scrollBottom(true);});

function addTyping(){
    var div=document.createElement('div'); div.className='message ai'; div.id='typing-ind';
    div.innerHTML='<div class="msg-avatar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div><div class="msg-body"><div class="typing-bubble"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div></div>';
    messagesEl.appendChild(div); scrollBottom(false);
}
function removeTyping(){var t=el('typing-ind');if(t&&t.parentNode)t.parentNode.removeChild(t);}

window.keryoCopyCode=function(btn){
    var cb=btn.closest('.code-block'); if(!cb) return;
    var code=cb.querySelector('code'); if(!code) return;
    navigator.clipboard.writeText(code.textContent||'').then(function(){var old=btn.textContent;btn.textContent='Copied!';setTimeout(function(){btn.textContent=old;},1500);}).catch(function(){});
};
window.keryoOpenImage=function(src){
    var m=el('img-viewer-modal'),i=el('img-viewer-src');
    if(m&&i){i.src=src;m.style.display='flex';}
};
window.copyMsg=function(btn){
    var bubble=btn.closest('.msg-body'); if(!bubble) return;
    var b=bubble.querySelector('.msg-bubble'); if(!b) return;
    navigator.clipboard.writeText(b.innerText||b.textContent||'').then(function(){toast('Copied!');}).catch(function(){});
};

function appendMessage(role,content,ts,noScroll,type){
    if(!content&&type!=='image') return;
    var ts2=ts||Date.now();
    var div=document.createElement('div'); div.className='message '+(role==='user'?'user':'ai');
    var avatarHtml=role==='user'
        ?'<div class="msg-avatar user-avatar">'+(currentUser?(currentUser.name||'U').charAt(0):'G')+'</div>'
        :'<div class="msg-avatar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div>';
    var bodyHtml='<div class="msg-body">';
    if(type==='image'){
        bodyHtml+='<div class="msg-bubble"><div class="img-card"><img src="'+esc(content)+'" class="gen-img" alt="Generated image" onclick="keryoOpenImage(this.src)"><div style="padding:4px 0"><button class="dl-img-btn" onclick="var a=document.createElement(\'a\');a.href=this.closest(\'.img-card\').querySelector(\'img\').src;a.download=\'keryo-image.png\';a.click()">Download</button></div></div></div>';
    } else {
        bodyHtml+='<div class="msg-bubble'+(role==='ai'?' ai-bubble':'')+'">'+
            (role==='user'?esc(content).replace(/\n/g,'<br>'):renderMarkdown(content))+'</div>';
    }
    if(role==='ai'){
        var timeStr=new Date(ts2).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        var readMin=Math.max(1,Math.ceil((content||'').split(/\s+/).length/200));
        bodyHtml+='<div class="msg-actions"><button class="msg-action-btn copy-btn" onclick="copyMsg(this)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</button></div>';
        if(settings.showReadTime) bodyHtml+='<div class="msg-meta"><span>'+timeStr+'</span><span>~'+readMin+' min read</span></div>';
    }
    bodyHtml+='</div>';
    div.innerHTML=avatarHtml+bodyHtml;
    messagesEl.appendChild(div);
    if(!noScroll) scrollBottom(false);
    if(typeof hljs!=='undefined') div.querySelectorAll('pre code').forEach(function(b){hljs.highlightElement(b);});
    if(role==='ai'&&settings.showFollowUp&&type!=='image') addFollowUpChips(div,content);
    return div;
}

function addFollowUpChips(msgDiv,content){
    var sugg=[];
    if(/code|function|class|algorithm/i.test(content)){sugg.push('Explain this step by step','Show me a use case');}
    else if(/explain|concept|theory/i.test(content)){sugg.push('Simplify this further','Give a real-world example');}
    else if(/write|create|generate/i.test(content)){sugg.push('Make it longer','Try a different style');}
    else{sugg.push('Tell me more','Give me an example');}
    if(!sugg.length) return;
    var chips=document.createElement('div'); chips.className='follow-up-chips';
    sugg.slice(0,2).forEach(function(s){
        var chip=document.createElement('button'); chip.className='follow-chip'; chip.textContent=s;
        chip.addEventListener('click',function(){userInput.value=s;updateSendBtn();userInput.focus();});
        chips.appendChild(chip);
    });
    var body=msgDiv.querySelector('.msg-body'); if(body) body.appendChild(chips);
}

/* ══════════════════════════════════════════════════════════
   MARKDOWN RENDERER
══════════════════════════════════════════════════════════ */
var _codeBlockCounter=0;
function sanitizeUrl(url){
    if(!url) return '#';
    var u=url.trim().toLowerCase();
    if(u.startsWith('javascript:')||u.startsWith('data:')||u.startsWith('vbscript:')) return '#';
    return url;
}
function renderMarkdown(text){
    if(!text) return '';
    _codeBlockCounter++;
    var lines=text.split('\n'),out='',inCode=false,codeLang='',codeBuf='';
    for(var i=0;i<lines.length;i++){
        var line=lines[i];
        if(line.startsWith('```')){
            if(!inCode){inCode=true;codeLang=line.slice(3).trim()||'text';codeBuf='';}
            else{
                var blockId='cb-'+_codeBlockCounter+'-'+i;
                out+='<div class="code-block"><div class="code-block-header"><span>'+esc(codeLang)+'</span><button class="copy-code-btn" onclick="keryoCopyCode(this)">Copy</button></div><pre><code id="'+blockId+'" class="language-'+esc(codeLang)+'">'+esc(codeBuf.trimEnd())+'</code></pre></div>';
                inCode=false;codeLang='';codeBuf='';
            }
            continue;
        }
        if(inCode){codeBuf+=line+'\n';continue;}
        line=esc(line);
        line=line.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
        line=line.replace(/\*([^*]+)\*/g,'<em>$1</em>');
        line=line.replace(/`([^`]+)`/g,'<code>$1</code>');
        line=line.replace(/\[([^\]]+)\]\(([^)]+)\)/g,function(_,linkText,url){
            return '<a href="'+esc(sanitizeUrl(url))+'" target="_blank" rel="noopener noreferrer">'+linkText+'</a>';
        });
        if(/^#{3}\s/.test(line)) out+='<h3>'+line.replace(/^#{3}\s/,'')+'</h3>';
        else if(/^#{2}\s/.test(line)) out+='<h2>'+line.replace(/^#{2}\s/,'')+'</h2>';
        else if(/^#\s/.test(line)) out+='<h1>'+line.replace(/^#\s/,'')+'</h1>';
        else if(/^\s*[-*]\s/.test(line)) out+='<li>'+line.replace(/^\s*[-*]\s/,'')+'</li>';
        else if(/^\s*\d+\.\s/.test(line)) out+='<li>'+line.replace(/^\s*\d+\.\s/,'')+'</li>';
        else if(line.trim()==='') out+='<br>';
        else out+='<p>'+line+'</p>';
    }
    if(inCode) out+='<pre><code>'+esc(codeBuf)+'</code></pre>';
    return out;
}

/* ══════════════════════════════════════════════════════════
   SEND BUTTON STATE
══════════════════════════════════════════════════════════ */
function updateSendBtn(){
    var limits=PLAN_LIMITS[userPlan]||PLAN_LIMITS.free;
    var maxLen=limits.maxMsgLen||16000;
    var len=userInput?userInput.value.length:0;
    if(charCountEl) charCountEl.textContent=len>500?(len>999?(len/1000).toFixed(1)+'k/'+Math.round(maxLen/1000)+'k':len+'/'+maxLen):''
    if(sendBtn) sendBtn.disabled=(!len&&!attachedFiles.length)||len>maxLen||isGenerating;
}
if(userInput){
    userInput.addEventListener('input',function(){this.style.height='auto';this.style.height=Math.min(this.scrollHeight,160)+'px';updateSendBtn();});
    userInput.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!sendBtn.disabled)handleSend();}});
}

/* ══════════════════════════════════════════════════════════
   SYSTEM PROMPT
══════════════════════════════════════════════════════════ */
function buildSystemPrompt(){
    var base='You are Keryo AI, a helpful, intelligent, and friendly AI assistant.';
    var md=MODES[currentMode]; if(md&&md.sysAddition) base+='\n\n'+md.sysAddition;
    var limits=PLAN_LIMITS[userPlan]||PLAN_LIMITS.free;
    if(limits.memory&&settings.memory&&settings.memoryText) base+='\n\n### User Memory:\n'+settings.memoryText;
    var langMap={hinglish:'Please respond in Hinglish (mix of Hindi and English).',hi:'Please respond in Hindi.',es:'Please respond in Spanish.',fr:'Please respond in French.',de:'Please respond in German.',ja:'Please respond in Japanese.',zh:'Please respond in Chinese.'};
    if(langMap[settings.lang]) base+='\n\n'+langMap[settings.lang];
    return base;
}
function buildMessages(chatMessages,userText){
    var sys=buildSystemPrompt();
    var history=(chatMessages||[]).slice(-20).map(function(m){return{role:m.role,content:(m.type==='image'||m.msg_type==='image')?'[Image generated]':m.content};});
    var hasImgs=attachedFiles.some(function(f){return f.type.startsWith('image/')&&f.dataUrl;});
    var userContent;
    if(hasImgs&&typeof CONFIG!=='undefined'&&CONFIG.VISION_MODEL){
        userContent=[{type:'text',text:userText}];
        attachedFiles.forEach(function(f){if(f.type.startsWith('image/')&&f.dataUrl) userContent.push({type:'image_url',image_url:{url:f.dataUrl}});});
    } else {
        var fc='';
        attachedFiles.forEach(function(f){if(f.content) fc+='\n\n---\nFile: '+f.name+'\n'+f.content;});
        userContent=userText+(fc?'\n\n'+fc:'');
    }
    return [{role:'system',content:sys},...history,{role:'user',content:userContent}];
}
function isSearchRequest(text){
    return /\b(search|find|look up|what is.*today|current|latest|news|2024|2025|2026)\b/i.test(text)||text.includes('search the web')||text.includes('online info');
}

/* ══════════════════════════════════════════════════════════
   HANDLE SEND (with daily limit check)
══════════════════════════════════════════════════════════ */
async function handleSend(){
    var text=userInput.value.trim();
    if((!text&&!attachedFiles.length)||isGenerating) return;

    // Guest limit
    if(!currentUser){
        guestMsgCount++;
        saveGuestCount();
        if(guestMsgCount>=GUEST_MSG_LIMIT){
            showGuestBanner('Message limit reached','Sign in for unlimited');
            return;
        }
    } else {
        // Logged-in daily limit
        var limits=PLAN_LIMITS[userPlan]||PLAN_LIMITS.free;
        var todayCount=incTodayCount();
        if(todayCount>limits.msgPerDay){
            toast('Daily limit reached ('+limits.msgPerDay+' messages). Upgrade for more!','',3500);
            openUpgradeModal();
            return;
        }
    }

    if(!currentChatId) await createNewChat();
    var chat=chats.find(function(c){return c.id===currentChatId;}); if(!chat) return;
    var userMsg={role:'user',content:text,ts:Date.now(),type:'text'};
    await persistMessage(currentChatId,userMsg);
    userInput.value=''; userInput.style.height='auto'; updateSendBtn();
    attachedFiles=[]; if(fileStripEl){fileStripEl.innerHTML='';fileStripEl.style.display='none';}
    welcomeEl.style.display='none';
    appendMessage('user',text,userMsg.ts,false,'text');
    isGenerating=true; sendBtn.style.display='none'; stopBtn.style.display='flex';
    addTyping();
    if(chat.title==='New Chat'&&text.length>0){var nt=text.slice(0,50)+(text.length>50?'…':'');chat.title=nt;persistTitle(currentChatId,nt);renderChatList();}

    // Image request — route to generateImage (Bytez SDXL via backend)
    if(typeof isImageRequest==='function'&&isImageRequest(text)){
        removeTyping();
        var imgDiv=document.createElement('div'); imgDiv.className='message ai';
        imgDiv.innerHTML='<div class="msg-avatar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div><div class="msg-body"><div class="msg-bubble ai-bubble"><div class="img-coming-soon"><div class="ics-text"><strong>Generating your image…</strong></div></div></div></div>';
        messagesEl.appendChild(imgDiv); scrollBottom(false);
        var imgBubble=imgDiv.querySelector('.msg-bubble');
        if(typeof generateImage==='function'){
            generateImage(text,
                function(imageUrl){
                    var img=document.createElement('img');
                    img.src=imageUrl; img.alt='Generated image';
                    img.style.cssText='max-width:100%;border-radius:12px;margin-top:4px;cursor:pointer;display:block';
                    img.addEventListener('click',function(){var iv=el('img-viewer-modal'),ivs=el('img-viewer-src');if(iv&&ivs){ivs.src=imageUrl;iv.style.display='flex';}});
                    if(imgBubble){imgBubble.innerHTML='';imgBubble.appendChild(img);}
                    var dlBtn=document.createElement('button');
                    dlBtn.textContent='Download'; dlBtn.style.cssText='margin-top:8px;display:inline-flex;align-items:center;padding:6px 14px;border-radius:8px;background:var(--accent);color:#fff;font-size:12px;font-weight:600;border:none;cursor:pointer';
                    dlBtn.addEventListener('click',function(){var a=document.createElement('a');a.href=imageUrl;a.download='keryo-image.png';a.click();});
                    if(imgBubble) imgBubble.appendChild(dlBtn);
                    scrollBottom(false); finishGeneration();
                },
                function(){
                    if(imgBubble) imgBubble.innerHTML='<div class="img-coming-soon"><div class="ics-text"><strong>Image generation is unavailable right now.</strong><p>I can still help with anything else — just ask!</p></div></div>';
                    scrollBottom(false); finishGeneration();
                }
            );
        } else {
            if(imgBubble) imgBubble.innerHTML='<div class="img-coming-soon"><div class="ics-text"><strong>Image generation not configured.</strong></div></div>';
            finishGeneration();
        }
        return;
    }

    if(isSearchRequest(text)&&typeof webSearch==='function'){
        webSearch(text,function(ctx){continueChat(text,ctx,chat.messages);},function(){continueChat(text,'',chat.messages);});
    } else {
        continueChat(text,'',chat.messages);
    }
}

function continueChat(text,searchCtx,chatMessages){
    var msgs=buildMessages(chatMessages.slice(0,-1),text+(searchCtx?'\n\n'+searchCtx:''));
    streamText=''; streamEl=null;
    removeTyping();
    var aiDiv=document.createElement('div'); aiDiv.className='message ai streaming';
    aiDiv.innerHTML='<div class="msg-avatar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div><div class="msg-body"><div class="msg-bubble ai-bubble streaming-cursor"></div></div>';
    messagesEl.appendChild(aiDiv); scrollBottom(false);
    streamEl=aiDiv.querySelector('.msg-bubble');
    generateResponse(msgs,
        function(chunk){streamText+=chunk;if(streamEl){streamEl.innerHTML=renderMarkdown(streamText);}scrollBottom(false);},
        function(err){
            removeTyping();
            var friendlyMsg=(err==='__ALL_FAILED__')?'Couldn\'t get a response right now. Please try again in a moment.':'Something went wrong. Please try again.';
            if(streamEl){
                streamEl.innerHTML='';
                var errBlock=document.createElement('div'); errBlock.className='ai-error-block';
                var errSvg=document.createElement('span');
                errSvg.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
                var errTxt=document.createElement('span');
                errTxt.textContent=friendlyMsg;
                errBlock.appendChild(errSvg); errBlock.appendChild(errTxt);
                streamEl.appendChild(errBlock);
                var retryBtn=document.createElement('button');
                retryBtn.className='ai-retry-btn';
                retryBtn.textContent='↺ Try again';
                retryBtn.style.cssText='margin-top:10px;display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;background:var(--accent);color:#fff;font-size:12px;font-weight:600;border:none;cursor:pointer';
                (function(retryText,msgDiv){
                    retryBtn.addEventListener('click',function(){
                        if(msgDiv&&msgDiv.parentNode)msgDiv.parentNode.removeChild(msgDiv);
                        if(userInput&&typeof handleSend==='function'){userInput.value=retryText;updateSendBtn();handleSend();}
                    });
                })(text,aiDiv);
                streamEl.appendChild(retryBtn);
            }
            finishGeneration();
        },
        function(aborted){
            if(streamEl) streamEl.classList.remove('streaming-cursor');
            aiDiv.classList.remove('streaming');
            if(!aborted&&streamText){
                var aiMsg={role:'assistant',content:streamText,ts:Date.now(),type:'text'};
                persistMessage(currentChatId,aiMsg);
                if(typeof hljs!=='undefined') aiDiv.querySelectorAll('pre code').forEach(function(b){hljs.highlightElement(b);});
                if(settings.showFollowUp) addFollowUpChips(aiDiv,streamText);
                var timeStr=new Date(aiMsg.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
                var readMin=Math.max(1,Math.ceil(streamText.split(/\s+/).length/200));
                var body=aiDiv.querySelector('.msg-body');
                if(body){
                    var acts=document.createElement('div'); acts.className='msg-actions';
                    acts.innerHTML='<button class="msg-action-btn copy-btn" onclick="copyMsg(this)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</button>';
                    body.appendChild(acts);
                    if(settings.showReadTime){var meta=document.createElement('div');meta.className='msg-meta';meta.innerHTML='<span>'+timeStr+'</span><span>~'+readMin+' min read</span>';body.appendChild(meta);}
                }
                playDoneSound();
            }
            finishGeneration();
        },
        userPlan
    );
}
function finishGeneration(){isGenerating=false;sendBtn.style.display='flex';stopBtn.style.display='none';updateSendBtn();streamEl=null;streamText='';}
if(stopBtn) stopBtn.addEventListener('click',function(){if(typeof stopGeneration==='function')stopGeneration();});
if(sendBtn) sendBtn.addEventListener('click',function(){if(!sendBtn.disabled)handleSend();});

/* ══════════════════════════════════════════════════════════
   FILE HANDLING
══════════════════════════════════════════════════════════ */
var ALLOWED_MIME_TYPES={'image/jpeg':true,'image/png':true,'image/gif':true,'image/webp':true,'text/plain':true,'text/markdown':true,'text/csv':true,'text/xml':true,'application/json':true,'application/pdf':true};
var ALLOWED_EXTENSIONS=/\.(jpg|jpeg|png|gif|webp|pdf|txt|md|csv|json|xml|yaml|yml|js|ts|jsx|tsx|py|c|cpp|java|go|rs|rb|php|swift|html|css)$/i;
var BLOCKED_EXTENSIONS=/\.(exe|bat|cmd|sh|bash|ps1|msi|vbs|wsf|jar|dll|so|dylib|app|apk|dmg|iso|bin|com|scr|hta)$/i;
var MAX_FILE_SIZE_BYTES=10*1024*1024, MAX_TEXT_SIZE_BYTES=500*1024, MAX_FILES=5;
function handleFiles(files){
    Array.from(files).forEach(function(file){
        if(attachedFiles.length>=MAX_FILES){toast('Max '+MAX_FILES+' files at once');return;}
        if(file.size>MAX_FILE_SIZE_BYTES){toast('File too large: '+file.name.slice(0,30)+' (max 10 MB)','error',3000);return;}
        if(BLOCKED_EXTENSIONS.test(file.name)){toast('File type not allowed: '+file.name.slice(0,30),'error',3000);return;}
        if(!ALLOWED_EXTENSIONS.test(file.name)){toast('Unsupported file: '+file.name.slice(0,30),'error',3000);return;}
        var isImage=file.type.startsWith('image/');
        if(isImage&&!ALLOWED_MIME_TYPES[file.type]){toast('Image type not supported','error',3000);return;}
        var entry={name:file.name.slice(0,120),type:file.type,size:file.size};
        var chip=document.createElement('div'); chip.className='file-preview-item';
        var nameSpan=document.createElement('span');
        nameSpan.style.cssText='font-size:11px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        nameSpan.textContent=file.name.slice(0,60);
        var delBtn=document.createElement('button'); delBtn.className='file-preview-del';delBtn.title='Remove';delBtn.textContent='×';
        chip.appendChild(nameSpan); chip.appendChild(delBtn);
        var idx=attachedFiles.length;
        delBtn.addEventListener('click',function(){attachedFiles.splice(idx,1);if(fileStripEl)fileStripEl.removeChild(chip);if(fileStripEl&&!fileStripEl.children.length)fileStripEl.style.display='none';updateSendBtn();});
        if(isImage){var fr=new FileReader();fr.onload=function(e){entry.dataUrl=e.target.result;};fr.readAsDataURL(file);}
        else if(file.size<=MAX_TEXT_SIZE_BYTES){var fr2=new FileReader();fr2.onload=function(e){entry.content=e.target.result;};fr2.readAsText(file);}
        attachedFiles.push(entry);
        if(fileStripEl){fileStripEl.appendChild(chip);fileStripEl.style.display='flex';}
        updateSendBtn();
    });
}
var attBtn=el('attach-btn'); if(attBtn) attBtn.addEventListener('click',function(e){e.preventDefault();fileInputEl.click();});
if(fileInputEl) fileInputEl.addEventListener('change',function(){handleFiles(this.files);this.value='';});
var inputCard=el('input-card');
if(inputCard){
    inputCard.addEventListener('dragover',function(e){e.preventDefault();this.style.borderColor='var(--accent)';});
    inputCard.addEventListener('dragleave',function(){this.style.borderColor='';});
    inputCard.addEventListener('drop',function(e){e.preventDefault();this.style.borderColor='';if(e.dataTransfer.files.length)handleFiles(e.dataTransfer.files);});
}
if(userInput) userInput.addEventListener('paste',function(e){var f=e.clipboardData&&e.clipboardData.files;if(f&&f.length){e.preventDefault();handleFiles(f);}});

/* ══════════════════════════════════════════════════════════
   VOICE
══════════════════════════════════════════════════════════ */
var micBtn=el('mic-btn');
if(micBtn) micBtn.addEventListener('click',function(){
    if(!('webkitSpeechRecognition' in window||'SpeechRecognition' in window)){toast('Voice not supported in this browser');return;}
    if(isListening){if(recognizer)recognizer.stop();isListening=false;micBtn.classList.remove('recording');return;}
    var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    recognizer=new SR(); recognizer.continuous=false; recognizer.interimResults=false;
    recognizer.lang=(settings.lang==='hi'||settings.lang==='hinglish')?'hi-IN':'en-US';
    recognizer.onresult=function(e){userInput.value=e.results[0][0].transcript;updateSendBtn();};
    recognizer.onerror=function(){isListening=false;micBtn.classList.remove('recording');};
    recognizer.onend=function(){isListening=false;micBtn.classList.remove('recording');};
    recognizer.start(); isListening=true; micBtn.classList.add('recording'); toast('Listening…','',3000);
});

/* ══════════════════════════════════════════════════════════
   TTS
══════════════════════════════════════════════════════════ */
var ttsBtn=el('tts-btn');
if(ttsBtn) ttsBtn.addEventListener('click',function(){
    if(isSpeaking){window.speechSynthesis.cancel();isSpeaking=false;ttsBtn.classList.remove('active');return;}
    var last=messagesEl.querySelectorAll('.message.ai .msg-bubble'); if(!last.length){toast('No AI message to read');return;}
    var text=last[last.length-1].innerText||last[last.length-1].textContent;
    if(!text.trim()){toast('Nothing to read');return;}
    var utt=new SpeechSynthesisUtterance(text);
    utt.onend=function(){isSpeaking=false;ttsBtn.classList.remove('active');};
    utt.onerror=function(){isSpeaking=false;ttsBtn.classList.remove('active');};
    window.speechSynthesis.speak(utt); isSpeaking=true; ttsBtn.classList.add('active');
});

/* ══════════════════════════════════════════════════════════
   SETTINGS MODAL
══════════════════════════════════════════════════════════ */
var settingsClose=el('settings-close'); if(settingsClose) settingsClose.addEventListener('click',function(){el('settings-modal').style.display='none';});
var settingsModal=el('settings-modal'); if(settingsModal) settingsModal.addEventListener('click',function(e){if(e.target===this)this.style.display='none';});
var modelSelect=el('model-select');
if(modelSelect) modelSelect.addEventListener('change',function(){
    var mid=this.value;
    var mdef=KERYO_MODELS.find(function(x){return x.id===mid;});
    if(mdef && mdef.plan && mdef.plan!=='free'){
        if((mdef.plan==='premium'&&userPlan!=='premium')||(mdef.plan==='pro'&&userPlan==='free')){
            this.value=settings.model; openUpgradeModal(mdef.plan); return;
        }
    }
    setActiveModel(mid); toast('Model: '+modelLabel(mid));
});
var langSelect=el('lang-select'); if(langSelect) langSelect.addEventListener('change',function(){settings.lang=this.value;saveSettings();toast('Language updated');if(recognizer)recognizer.lang=(settings.lang==='hi'||settings.lang==='hinglish')?'hi-IN':'en-US';});
document.querySelectorAll('.theme-option-btn').forEach(function(b){b.addEventListener('click',function(){applyTheme(b.dataset.theme);saveSettings();document.querySelectorAll('.theme-option-btn').forEach(function(x){x.classList.toggle('active',x.dataset.theme===b.dataset.theme);});});});
document.querySelectorAll('.font-size-btn').forEach(function(b){b.addEventListener('click',function(){settings.fontSize=b.dataset.size;applyFontSize(b.dataset.size);document.querySelectorAll('.font-size-btn').forEach(function(x){x.classList.toggle('active',x.dataset.size===b.dataset.size);});saveSettings();toast('Font: '+b.dataset.size);});});
var tempSlider=el('temp-slider'); if(tempSlider) tempSlider.addEventListener('input',function(){settings.temperature=parseInt(this.value)/100;var tl=el('temp-label');if(tl)tl.textContent=settings.temperature.toFixed(1);saveSettings();});
var sndTgl=el('sound-toggle'); if(sndTgl) sndTgl.addEventListener('click',function(){settings.soundNotify=!settings.soundNotify;wireToggle('sound-toggle',settings.soundNotify);saveSettings();toast(settings.soundNotify?'Sound on':'Sound off');});
var fuTgl=el('followup-toggle'); if(fuTgl) fuTgl.addEventListener('click',function(){settings.showFollowUp=!settings.showFollowUp;wireToggle('followup-toggle',settings.showFollowUp);saveSettings();});
var rtTgl=el('readtime-toggle'); if(rtTgl) rtTgl.addEventListener('click',function(){settings.showReadTime=!settings.showReadTime;wireToggle('readtime-toggle',settings.showReadTime);saveSettings();});
var expTxt=el('export-txt-btn'); if(expTxt) expTxt.addEventListener('click',function(){exportChat('txt');});
var expHtml=el('export-pdf-btn'); if(expHtml) expHtml.addEventListener('click',function(){exportChat('html');});
var expJson=el('export-json-btn'); if(expJson) expJson.addEventListener('click',function(){exportChat('json');});
var clearAll=el('clear-all-chats-btn'); if(clearAll) clearAll.addEventListener('click',function(){
    _dcbTarget='__ALL__';
    var b=el('delete-confirm-banner'), txt=b&&b.querySelector('.dcb-text');
    if(txt) txt.textContent='Delete ALL chats?';
    if(b){b.style.display='block';requestAnimationFrame(function(){b.classList.add('dcb-show');});}
    clearTimeout(_dcbTimer);
    _dcbTimer=setTimeout(function(){hideDeleteConfirm();var txt2=b&&b.querySelector('.dcb-text');if(txt2)txt2.textContent='Delete this chat?';},6000);
    var confirmBtn=el('dcb-confirm');
    if(confirmBtn){
        var orig=confirmBtn.onclick;
        confirmBtn.onclick=function(){
            hideDeleteConfirm();
            if(b){var txt3=b.querySelector('.dcb-text');if(txt3)txt3.textContent='Delete this chat?';}
            confirmBtn.onclick=null;
            chats=[];currentChatId=null;lsSave();renderChatList();showWelcome();toast('All chats cleared');
        };
    }
});
var memSave=el('memory-save-btn'); if(memSave) memSave.addEventListener('click',function(){
    var limits=PLAN_LIMITS[userPlan]||PLAN_LIMITS.free;
    if(!limits.memory){toast('Memory is a Pro feature — upgrade to save memory','',2800);openUpgradeModal();return;}
    settings.memoryText=el('memory-input').value;saveSettings();toast('Memory saved');
});
var memClear=el('memory-clear-btn'); if(memClear) memClear.addEventListener('click',function(){settings.memoryText='';el('memory-input').value='';saveSettings();toast('Memory cleared');});

/* ══════════════════════════════════════════════════════════
   WEAK TOPICS & PROMPT LIBRARY
══════════════════════════════════════════════════════════ */
var wtClose=el('weak-topics-close'); if(wtClose) wtClose.addEventListener('click',function(){el('weak-topics-modal').style.display='none';});
var wtModal=el('weak-topics-modal'); if(wtModal) wtModal.addEventListener('click',function(e){if(e.target===this)this.style.display='none';});
var wtAdd=el('weak-topic-add-btn');
if(wtAdd) wtAdd.addEventListener('click',function(){
    var inp=el('weak-topic-input'),sub=el('weak-topic-subject');
    var name=inp.value.trim(); if(!name) return;
    weakTopics.push({name:name,subject:sub?sub.value:'Other'}); saveWeakTopics(); inp.value=''; renderWeakTopics(); toast('Topic saved');
});
var wtInp=el('weak-topic-input'); if(wtInp) wtInp.addEventListener('keydown',function(e){if(e.key==='Enter'&&wtAdd)wtAdd.click();});
function renderWeakTopics(){var list=el('weak-topics-list');if(!list)return;list.innerHTML='';weakTopics.forEach(function(t,i){var d=document.createElement('div');d.className='topic-item';d.innerHTML='<span>'+esc(t.name)+' <small style="color:var(--text3)">'+esc(t.subject)+'</small></span><button class="topic-del" data-i="'+i+'">×</button>';list.appendChild(d);});list.querySelectorAll('.topic-del').forEach(function(b){b.addEventListener('click',function(){weakTopics.splice(parseInt(b.dataset.i),1);saveWeakTopics();renderWeakTopics();});});}

var builtinPrompts=[{name:'Study Plan',category:'Student',text:'Create a 30-day study plan for: '},{name:'MCQ Quiz',category:'Student',text:'Create 10 MCQ questions on: '},{name:'Code Review',category:'Developer',text:'Review this code:\n\n'},{name:'API Integration',category:'Developer',text:'Show me how to integrate this API: '},{name:'Blog Post',category:'Writer',text:'Write a 600-word blog post about: '},{name:'Professional Email',category:'Writer',text:'Write a professional email about: '},{name:'YouTube Script',category:'Creator',text:'Write a 5-minute YouTube script on: '},{name:'Instagram Captions',category:'Creator',text:'Write 10 Instagram captions for: '},{name:'SWOT Analysis',category:'Research',text:'Do a SWOT analysis for: '},{name:'Compare Topics',category:'Research',text:'Compare and contrast: '}];
var promptLibActiveCat='All';
var plClose=el('prompt-lib-close'); if(plClose) plClose.addEventListener('click',function(){el('prompt-lib-modal').style.display='none';});
var plModal=el('prompt-lib-modal'); if(plModal) plModal.addEventListener('click',function(e){if(e.target===this)this.style.display='none';});
var cpSave=el('custom-prompt-save');
if(cpSave) cpSave.addEventListener('click',function(){
    var name=el('custom-prompt-name').value.trim(),cat=el('custom-prompt-cat').value.trim(),text=el('custom-prompt-text').value.trim();
    if(!name||!text){toast('Name and prompt required');return;}
    customPrompts.push({name:name,category:cat||'Custom',text:text}); saveCustomPrompts();
    el('custom-prompt-name').value=''; el('custom-prompt-cat').value=''; el('custom-prompt-text').value='';
    renderPromptLibrary(); toast('Prompt saved');
});
var plSearch=el('prompt-lib-search'); if(plSearch) plSearch.addEventListener('input',function(){promptLibActiveCat='All';renderPromptLibrary(this.value.trim().toLowerCase());});
function renderPromptLibrary(filter){
    var ce=el('prompt-lib-cats'),ge=el('prompt-lib-grid'); if(!ce||!ge) return;
    var all=builtinPrompts.concat(customPrompts);
    var cats=['All'].concat(all.map(function(p){return p.category;}).filter(function(v,i,a){return a.indexOf(v)===i;}));
    ce.innerHTML='';
    cats.forEach(function(cat){var b=document.createElement('button');b.className='prompt-cat-btn'+(promptLibActiveCat===cat?' active':'');b.textContent=cat;b.addEventListener('click',function(){promptLibActiveCat=cat;renderPromptLibrary(el('prompt-lib-search')?el('prompt-lib-search').value.trim().toLowerCase():'');});ce.appendChild(b);});
    var filtered=all.filter(function(p){var mc=promptLibActiveCat==='All'||p.category===promptLibActiveCat;var mf=!filter||(p.name.toLowerCase().includes(filter)||p.text.toLowerCase().includes(filter));return mc&&mf;});
    ge.innerHTML='';
    filtered.forEach(function(p){var c=document.createElement('div');c.className='prompt-card';c.innerHTML='<div class="prompt-card-name">'+esc(p.name)+'</div><div class="prompt-card-text">'+esc(p.text)+'</div>';c.addEventListener('click',function(){userInput.value=p.text;updateSendBtn();userInput.focus();el('prompt-lib-modal').style.display='none';});ge.appendChild(c);});
}

/* ══════════════════════════════════════════════════════════
   IMAGE VIEWER
══════════════════════════════════════════════════════════ */
var ivClose=el('img-viewer-close'); if(ivClose) ivClose.addEventListener('click',function(){el('img-viewer-modal').style.display='none';});
var ivModal=el('img-viewer-modal'); if(ivModal) ivModal.addEventListener('click',function(e){if(e.target===this)this.style.display='none';});
var ivDlPng=el('img-viewer-dl-png'); if(ivDlPng) ivDlPng.addEventListener('click',function(){var a=document.createElement('a');a.href=el('img-viewer-src').src;a.download='keryo-'+Date.now()+'.png';a.click();});
var ivDlJpg=el('img-viewer-dl-jpg');
if(ivDlJpg) ivDlJpg.addEventListener('click',function(){
    var c=document.createElement('canvas'),img=new Image();
    img.crossOrigin='anonymous';
    img.onload=function(){c.width=img.width;c.height=img.height;var ctx2=c.getContext('2d');ctx2.fillStyle='#fff';ctx2.fillRect(0,0,c.width,c.height);ctx2.drawImage(img,0,0);var a=document.createElement('a');a.href=c.toDataURL('image/jpeg',0.92);a.download='keryo-'+Date.now()+'.jpg';a.click();};
    img.src=el('img-viewer-src').src;
});

/* ══════════════════════════════════════════════════════════
   EXPORT
══════════════════════════════════════════════════════════ */
function exportChat(fmt){
    if(!currentChatId){toast('No chat selected');return;}
    var chat=chats.find(function(c){return c.id===currentChatId;});
    if(!chat||!chat.messages||!chat.messages.length){toast('Chat is empty');return;}
    var title=chat.title||'Keryo AI Chat';
    if(fmt==='txt'){
        var lines=['Keryo AI — '+title,'='.repeat(50),''];
        chat.messages.forEach(function(m){var r=m.role==='user'?'You':'Keryo AI';lines.push('['+r+'] '+new Date(m.ts||0).toLocaleString());lines.push(m.type==='image'?'[Image]':m.content);lines.push('');});
        dlBlob(lines.join('\n'),title+'.txt','text/plain');
    } else if(fmt==='json'){
        dlBlob(JSON.stringify({title:title,exported:new Date().toISOString(),messages:chat.messages},null,2),title+'.json','application/json');
    } else {
        var rows=chat.messages.map(function(m){var r=m.role==='user'?'You':'Keryo AI',t=new Date(m.ts||0).toLocaleString(),c=m.type==='image'?'<em>[Image]</em>':esc(m.content).replace(/\n/g,'<br>');return '<div class="r '+m.role+'"><div class="meta">'+r+' · '+t+'</div><div class="bbl">'+c+'</div></div>';}).join('');
        dlBlob('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+esc(title)+'</title><style>body{font-family:system-ui;max-width:800px;margin:40px auto;padding:0 20px}.bbl{padding:12px;border-radius:12px;margin:6px 0;white-space:pre-wrap}.r.user .bbl{background:#5F43E9;color:white;margin-left:60px}.r.assistant .bbl{background:#f4f4f5;margin-right:60px}.meta{font-size:11px;color:#999;margin-bottom:3px}</style></head><body><h1>'+esc(title)+'</h1>'+rows+'</body></html>',title+'.html','text/html');
        toast('HTML exported','',2500);
    }
}
function dlBlob(content,name,mime){var b=new Blob([content],{type:mime}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}

/* ══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════════ */
document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();createNewChat();}
    if((e.ctrlKey||e.metaKey)&&e.key==='/'){e.preventDefault();if(userInput)userInput.focus();}
    if((e.ctrlKey||e.metaKey)&&e.key===','){e.preventDefault();applySettings();el('settings-modal').style.display='flex';}
    if(e.key==='Escape'){
        document.querySelectorAll('.modal-backdrop').forEach(function(m){m.style.display='none';});
        var pm=el('profile-menu');if(pm)pm.style.display='none';
        var mpMenu=el('model-pick-menu');if(mpMenu)mpMenu.classList.remove('open');
        var mpBtn=el('model-pick-btn');if(mpBtn){mpBtn.classList.remove('open');mpBtn.setAttribute('aria-expanded','false');}
        var sb=el('sidebar');if(sb)sb.classList.remove('mobile-open');
    }
});

/* ══════════════════════════════════════════════════════════
   BACKGROUND ORBS
══════════════════════════════════════════════════════════ */
(function(){
    var ca=document.querySelector('.chat-area'); if(!ca) return;
    var orb=document.createElement('div');
    orb.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0';
    orb.innerHTML='<div style="position:absolute;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(95,67,233,0.04),transparent);top:10%;left:5%;animation:orbA 14s ease-in-out infinite"></div><div style="position:absolute;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(0,201,255,0.035),transparent);bottom:20%;right:8%;animation:orbB 17s ease-in-out infinite"></div>';
    ca.style.position='relative'; ca.insertBefore(orb,ca.firstChild);
    var s=document.createElement('style');
    s.textContent='@keyframes orbA{0%,100%{transform:translate(0,0)}25%{transform:translate(18px,-14px)}50%{transform:translate(-8px,18px)}75%{transform:translate(14px,8px)}}@keyframes orbB{0%,100%{transform:translate(0,0)}33%{transform:translate(-18px,14px)}66%{transform:translate(14px,-18px)}}';
    document.head.appendChild(s);
})();

/* ══════════════════════════════════════════════════════════
   SCROLL INDICATOR
══════════════════════════════════════════════════════════ */
(function(){
    var ind=el('scroll-indicator'); if(!ind||!msgCont) return;
    msgCont.addEventListener('scroll',function(){var t=msgCont.scrollHeight-msgCont.clientHeight;ind.style.width=t>0?(msgCont.scrollTop/t*100)+'%':'0%';});
})();

/* ══════════════════════════════════════════════════════════
   INIT — restore session if available
══════════════════════════════════════════════════════════ */
async function init(){
    applySettings();
    setActiveModel(settings.model||'keryo-free',true);
    updateSendBtn();

    // Try to restore a persisted session
    var session=loadSession();
    if(session&&session.user){
        currentUser=session.user;
        userPlan=session.plan||'free';
        planEndDate=session.endDate?new Date(session.endDate):null;
        checkPlanExpiry();

        // Skip landing — go straight to app
        el('landing-page').style.display='none';
        var appEl=el('app');
        appEl.style.display='flex';
        appEl.classList.add('app-visible');

        renderAccessState();
        applyMode(settings.defaultMode);

        // Sync plan from server in background (non-blocking)
        syncPlanFromServer().then(function(){
            updateAllPlanUI();
        });

        loadAllChats().then(function(){
            if(chats.length>0) selectChat(chats[0].id); else showWelcome();
        });
        return;
    }

    // Check if seen before (was a guest)
    var seen=localStorage.getItem(KEYS.SEEN);
    if(seen){
        el('landing-page').style.display='none';
        var appEl=el('app');
        appEl.style.display='flex';
        appEl.classList.add('app-visible');
        enterAsGuest();
    } else {
        el('landing-page').style.display='block';
        el('app').style.display='none';
    }
}

// Save session whenever user state changes
setInterval(function(){
    if(currentUser){ checkPlanExpiry(); saveSession(); }
}, 60*1000); // every minute

init();

}); // end DOMContentLoaded
