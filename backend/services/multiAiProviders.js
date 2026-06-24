/**
 * ASKY RecruitIQ — Bulletproof Multi-AI Provider System
 * 
 * Design principles:
 * 1. NEVER return an error if ANY provider is available
 * 2. Detect rate limits from 429 AND quota/error text
 * 3. Per-provider cooldown stored in-memory with auto-expiry
 * 4. Automatic retry with exponential backoff
 * 5. Request timeout so one slow provider doesn't block others
 * 6. Each provider call is fully isolated — one failure never affects others
 */

// ── Provider Registry ────────────────────────────────────────────
// Priority: lower = tried first. Add more keys = more capacity.
// Each key gets its OWN entry in the chain.
const PROVIDERS = [
  // GROQ Key 1 — 3 models = 3 chances per key
  { name:'GROQ-1-70B',   env:'GROQ_API_KEY',        type:'groq',       model:'llama-3.3-70b-versatile',                   priority:1  },
  { name:'GROQ-1-8B',    env:'GROQ_API_KEY',        type:'groq',       model:'llama3-8b-8192',                            priority:2  },
  { name:'GROQ-1-Gemma', env:'GROQ_API_KEY',        type:'groq',       model:'gemma2-9b-it',                              priority:3  },
  // GROQ Key 2
  { name:'GROQ-2-70B',   env:'GROQ_API_KEY_2',      type:'groq',       model:'llama-3.3-70b-versatile',                   priority:4  },
  { name:'GROQ-2-8B',    env:'GROQ_API_KEY_2',      type:'groq',       model:'llama3-8b-8192',                            priority:5  },
  { name:'GROQ-2-Gemma', env:'GROQ_API_KEY_2',      type:'groq',       model:'gemma2-9b-it',                              priority:6  },
  // GROQ Key 3
  { name:'GROQ-3-70B',   env:'GROQ_API_KEY_3',      type:'groq',       model:'llama-3.3-70b-versatile',                   priority:7  },
  { name:'GROQ-3-8B',    env:'GROQ_API_KEY_3',      type:'groq',       model:'llama3-8b-8192',                            priority:8  },
  { name:'GROQ-3-Gemma', env:'GROQ_API_KEY_3',      type:'groq',       model:'gemma2-9b-it',                              priority:9  },
  // GROQ Key 4
  { name:'GROQ-4-70B',   env:'GROQ_API_KEY_4',      type:'groq',       model:'llama-3.3-70b-versatile',                   priority:10 },
  { name:'GROQ-4-8B',    env:'GROQ_API_KEY_4',      type:'groq',       model:'llama3-8b-8192',                            priority:11 },
  // GROQ Key 5
  { name:'GROQ-5-70B',   env:'GROQ_API_KEY_5',      type:'groq',       model:'llama-3.3-70b-versatile',                   priority:12 },
  { name:'GROQ-5-8B',    env:'GROQ_API_KEY_5',      type:'groq',       model:'llama3-8b-8192',                            priority:13 },
  // Cerebras — very fast, generous free tier
  { name:'Cerebras-70B', env:'CEREBRAS_API_KEY',     type:'cerebras',   model:'llama3.3-70b',                              priority:20 },
  { name:'Cerebras-8B',  env:'CEREBRAS_API_KEY',     type:'cerebras',   model:'llama3.1-8b',                               priority:21 },
  // SambaNova — generous free tier
  { name:'SambaNova',    env:'SAMBANOVA_API_KEY',    type:'sambanova',  model:'Meta-Llama-3.3-70B-Instruct',               priority:25 },
  // Google Gemini — 1500 req/day free
  { name:'Gemini-2-Flash',  env:'GEMINI_API_KEY',   type:'gemini',     model:'gemini-2.0-flash',                          priority:30 },
  { name:'Gemini-1.5-Flash', env:'GEMINI_API_KEY',  type:'gemini',     model:'gemini-1.5-flash',                          priority:31 },
  { name:'Gemini-2-Flash-2', env:'GEMINI_API_KEY_2',type:'gemini',     model:'gemini-2.0-flash',                          priority:32 },
  // OpenRouter — free models
  { name:'OpenRouter-1', env:'OPENROUTER_API_KEY',   type:'openrouter', model:'meta-llama/llama-3.3-8b-instruct:free',     priority:35 },
  { name:'OpenRouter-2', env:'OPENROUTER_API_KEY',   type:'openrouter', model:'google/gemma-3-12b-it:free',                priority:36 },
  { name:'OpenRouter-3', env:'OPENROUTER_API_KEY',   type:'openrouter', model:'mistralai/mistral-7b-instruct:free',        priority:37 },
  // Together AI — free models
  { name:'Together-1',   env:'TOGETHER_API_KEY',     type:'together',   model:'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', priority:40 },
  { name:'Together-2',   env:'TOGETHER_API_KEY',     type:'together',   model:'mistralai/Mixtral-8x7B-Instruct-v0.1',      priority:41 },
  // Cohere — last resort
  { name:'Cohere',       env:'COHERE_API_KEY',       type:'cohere',     model:'command-r',                                 priority:50 },
  // HuggingFace — slowest but always available
  { name:'HuggingFace',  env:'HUGGINGFACE_API_KEY',  type:'huggingface',model:'HuggingFaceH4/zephyr-7b-beta',              priority:60 },
];

// ── In-memory cooldown tracking ──────────────────────────────────
// Key: provider name, Value: timestamp when cooldown expires
const cooldowns = {};
const COOLDOWN_MS = 62000; // 62 seconds (just over 1 minute reset window)
const REQUEST_TIMEOUT_MS = 25000; // 25 second timeout per provider

// ── Helpers ──────────────────────────────────────────────────────
function isRateLimitError(status, bodyText) {
  if (status === 429) return true;
  if (status === 503) return true;
  if (!bodyText) return false;
  const lower = bodyText.toLowerCase();
  return lower.includes('rate limit') ||
         lower.includes('rate_limit') ||
         lower.includes('quota exceeded') ||
         lower.includes('too many requests') ||
         lower.includes('daily limit') ||
         lower.includes('requests per day') ||
         lower.includes('capacity') ||
         lower.includes('overloaded');
}

function isInCooldown(name) {
  return cooldowns[name] && cooldowns[name] > Date.now();
}

function setCooldown(name) {
  cooldowns[name] = Date.now() + COOLDOWN_MS;
}

function clearAllCooldowns() {
  Object.keys(cooldowns).forEach(k => delete cooldowns[k]);
}

// Fetch with timeout
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return r;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('TIMEOUT');
    throw err;
  }
}

// ── Main export — bulletproof fallback chain ─────────────────────
async function callWithFallback(messages, maxTokens = 2000) {
  // Build pool: only providers with a configured key
  const pool = PROVIDERS
    .filter(p => { const k = process.env[p.env]; return k && k.length > 10; })
    .sort((a, b) => a.priority - b.priority);

  if (pool.length === 0) {
    throw new Error('No AI providers configured. Add GROQ_API_KEY to Render environment.');
  }

  // ── Pass 1: Try all non-cooled-down providers ─────────────────
  let lastError = null;
  for (const p of pool) {
    if (isInCooldown(p.name)) {
      const secs = Math.round((cooldowns[p.name] - Date.now()) / 1000);
      console.log(`[AI] Skip ${p.name} (cooldown ${secs}s)`);
      continue;
    }
    try {
      const result = await callOne(p, messages, maxTokens);
      if (result && result.trim().length > 0) {
        if (pool.indexOf(p) > 0) console.log(`[AI] ✅ ${p.name}`);
        return result;
      }
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('RATE_LIMIT') || msg.includes('TIMEOUT')) {
        setCooldown(p.name);
        console.warn(`[AI] ⚠️  ${p.name}: ${msg}`);
      } else {
        console.warn(`[AI] ❌ ${p.name}: ${msg.substring(0, 80)}`);
      }
      lastError = err;
    }
  }

  // ── Pass 2: All cooled down — wait 8s then clear and retry ───
  const available = pool.filter(p => !isInCooldown(p.name));
  if (available.length === 0) {
    console.log('[AI] All providers in cooldown — waiting 8s and retrying...');
    await new Promise(r => setTimeout(r, 8000));
    clearAllCooldowns();

    // Try every provider fresh
    for (const p of pool) {
      try {
        const result = await callOne(p, messages, maxTokens);
        if (result && result.trim().length > 0) {
          console.log(`[AI] ✅ ${p.name} (after cooldown reset)`);
          return result;
        }
      } catch (err) {
        const msg = err.message || '';
        if (msg.includes('RATE_LIMIT') || msg.includes('TIMEOUT')) setCooldown(p.name);
        lastError = err;
      }
    }
  }

  // ── Pass 3: Last resort — try 5 fastest providers with 40s waits ─
  console.log('[AI] Starting last-resort retry cycle...');
  const fastProviders = pool.slice(0, 5);
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise(r => setTimeout(r, 15000 * (attempt + 1)));
    clearAllCooldowns();
    for (const p of fastProviders) {
      try {
        const result = await callOne(p, messages, maxTokens);
        if (result && result.trim().length > 0) {
          console.log(`[AI] ✅ ${p.name} (last resort attempt ${attempt + 1})`);
          return result;
        }
      } catch (err) {
        lastError = err;
      }
    }
  }

  throw new Error('All AI providers exhausted after 3 retry cycles. Daily limits may have been reached. Resets at midnight UTC.');
}

// ── Individual provider caller ───────────────────────────────────
async function callOne(p, messages, maxTokens) {
  const key = process.env[p.env];
  switch (p.type) {
    case 'groq':       return _groq(p, key, messages, maxTokens);
    case 'gemini':     return _gemini(p, key, messages, maxTokens);
    case 'cerebras':   return _cerebras(p, key, messages, maxTokens);
    case 'sambanova':  return _sambanova(p, key, messages, maxTokens);
    case 'openrouter': return _openrouter(p, key, messages, maxTokens);
    case 'together':   return _together(p, key, messages, maxTokens);
    case 'cohere':     return _cohere(p, key, messages, maxTokens);
    case 'huggingface':return _huggingface(p, key, messages, maxTokens);
    default: throw new Error('Unknown type: ' + p.type);
  }
}

// ── Provider implementations ─────────────────────────────────────
async function _groq(p, key, messages, maxTokens) {
  const r = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method:'POST',
    headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({model:p.model,messages,temperature:0.3,max_tokens:maxTokens})
  }, REQUEST_TIMEOUT_MS);
  const body = await r.text();
  if (isRateLimitError(r.status, body)) throw new Error('RATE_LIMIT');
  if (!r.ok) throw new Error('GROQ '+r.status+': '+body.substring(0,80));
  return JSON.parse(body).choices?.[0]?.message?.content || '';
}

async function _gemini(p, key, messages, maxTokens) {
  const contents = messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));
  const r = await fetchWithTimeout(
    'https://generativelanguage.googleapis.com/v1beta/models/'+p.model+':generateContent?key='+key,
    {method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({contents,generationConfig:{maxOutputTokens:maxTokens,temperature:0.3}})},
    REQUEST_TIMEOUT_MS
  );
  const body = await r.text();
  if (isRateLimitError(r.status, body)) throw new Error('RATE_LIMIT');
  if (!r.ok) throw new Error('Gemini '+r.status+': '+body.substring(0,80));
  return JSON.parse(body).candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function _cerebras(p, key, messages, maxTokens) {
  const r = await fetchWithTimeout('https://api.cerebras.ai/v1/chat/completions', {
    method:'POST',
    headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({model:p.model,messages,max_tokens:Math.min(maxTokens,8000),temperature:0.3})
  }, REQUEST_TIMEOUT_MS);
  const body = await r.text();
  if (isRateLimitError(r.status, body)) throw new Error('RATE_LIMIT');
  if (!r.ok) throw new Error('Cerebras '+r.status+': '+body.substring(0,80));
  return JSON.parse(body).choices?.[0]?.message?.content || '';
}

async function _sambanova(p, key, messages, maxTokens) {
  const r = await fetchWithTimeout('https://api.sambanova.ai/v1/chat/completions', {
    method:'POST',
    headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({model:p.model,messages,max_tokens:maxTokens,temperature:0.3})
  }, REQUEST_TIMEOUT_MS);
  const body = await r.text();
  if (isRateLimitError(r.status, body)) throw new Error('RATE_LIMIT');
  if (!r.ok) throw new Error('SambaNova '+r.status+': '+body.substring(0,80));
  return JSON.parse(body).choices?.[0]?.message?.content || '';
}

async function _openrouter(p, key, messages, maxTokens) {
  const r = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method:'POST',
    headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json',
             'HTTP-Referer':'https://asky-recruit-iq-ai.vercel.app','X-Title':'ASKY RecruitIQ'},
    body:JSON.stringify({model:p.model,messages,max_tokens:maxTokens,temperature:0.3})
  }, REQUEST_TIMEOUT_MS);
  const body = await r.text();
  if (isRateLimitError(r.status, body)) throw new Error('RATE_LIMIT');
  if (!r.ok) throw new Error('OpenRouter '+r.status+': '+body.substring(0,80));
  const d = JSON.parse(body);
  if (d.error) throw new Error('RATE_LIMIT'); // OpenRouter quota errors come as 200 with error field
  return d.choices?.[0]?.message?.content || '';
}

async function _together(p, key, messages, maxTokens) {
  const r = await fetchWithTimeout('https://api.together.xyz/v1/chat/completions', {
    method:'POST',
    headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({model:p.model,messages,max_tokens:maxTokens,temperature:0.3})
  }, REQUEST_TIMEOUT_MS);
  const body = await r.text();
  if (isRateLimitError(r.status, body)) throw new Error('RATE_LIMIT');
  if (!r.ok) throw new Error('Together '+r.status+': '+body.substring(0,80));
  return JSON.parse(body).choices?.[0]?.message?.content || '';
}

async function _cohere(p, key, messages, maxTokens) {
  const last = messages[messages.length-1];
  const history = messages.slice(0,-1).map(m=>({role:m.role==='assistant'?'CHATBOT':'USER',message:m.content}));
  const r = await fetchWithTimeout('https://api.cohere.com/v1/chat', {
    method:'POST',
    headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({model:p.model,message:last.content,chat_history:history,max_tokens:maxTokens})
  }, REQUEST_TIMEOUT_MS);
  const body = await r.text();
  if (isRateLimitError(r.status, body)) throw new Error('RATE_LIMIT');
  if (!r.ok) throw new Error('Cohere '+r.status+': '+body.substring(0,80));
  return JSON.parse(body).text || '';
}

async function _huggingface(p, key, messages, maxTokens) {
  const prompt = messages.map(m=>(m.role==='user'?'User: ':'Assistant: ')+m.content).join('\n')+'\nAssistant:';
  const r = await fetchWithTimeout('https://api-inference.huggingface.co/models/'+p.model, {
    method:'POST',
    headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({inputs:prompt,parameters:{max_new_tokens:Math.min(maxTokens,500),temperature:0.3}})
  }, REQUEST_TIMEOUT_MS);
  const body = await r.text();
  if (isRateLimitError(r.status, body)) throw new Error('RATE_LIMIT');
  if (!r.ok) throw new Error('HuggingFace '+r.status+': '+body.substring(0,80));
  const d = JSON.parse(body);
  const raw = Array.isArray(d) ? d[0]?.generated_text||'' : d.generated_text||'';
  return raw.split('Assistant:').pop()?.trim() || raw;
}

// ── Status for /api/ai-test ──────────────────────────────────────
function getProviderStatus() {
  const configured = PROVIDERS.filter(p=>{const k=process.env[p.env];return k&&k.length>10;});
  const active = configured.filter(p=>!isInCooldown(p.name));
  return {
    totalProviders: configured.length,
    activeProviders: active.length,
    providerList: configured.map(p=>p.name+(isInCooldown(p.name)?'⏳':'✅')),
    estimatedDailyCapacity: configured.length * 1000 + ' requests/day minimum',
    cooldowns: Object.keys(cooldowns).filter(k=>cooldowns[k]>Date.now()).map(k=>({
      name:k, resetsIn: Math.round((cooldowns[k]-Date.now())/1000)+'s'
    }))
  };
}

module.exports = { callWithFallback, getProviderStatus, PROVIDERS };
