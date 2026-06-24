/**
 * ASKY RecruitIQ — Complete Multi-AI Provider System
 * Supports 10+ providers with automatic fallback chain
 * Add any API key to Render env vars to activate that provider
 */

// ─────────────────────────────────────────────────────────────────
// PROVIDER REGISTRY
// Each provider: name, envKey, callFn, priority (lower = first tried)
// ─────────────────────────────────────────────────────────────────

const PROVIDERS = [

  // ── GROQ Keys 1-5 (multiple free keys supported) ──────────────
  // Free: 1,000 RPD (70B) / 14,400 RPD (8B) per key
  // Get keys at: console.groq.com
  { name: 'GROQ-1-70B',    envKey: 'GROQ_API_KEY',   priority: 1,  type: 'groq',    model: 'llama-3.3-70b-versatile' },
  { name: 'GROQ-1-8B',     envKey: 'GROQ_API_KEY',   priority: 2,  type: 'groq',    model: 'llama3-8b-8192' },
  { name: 'GROQ-1-Gemma',  envKey: 'GROQ_API_KEY',   priority: 3,  type: 'groq',    model: 'gemma2-9b-it' },
  { name: 'GROQ-2-70B',    envKey: 'GROQ_API_KEY_2', priority: 4,  type: 'groq',    model: 'llama-3.3-70b-versatile' },
  { name: 'GROQ-2-8B',     envKey: 'GROQ_API_KEY_2', priority: 5,  type: 'groq',    model: 'llama3-8b-8192' },
  { name: 'GROQ-3-70B',    envKey: 'GROQ_API_KEY_3', priority: 6,  type: 'groq',    model: 'llama-3.3-70b-versatile' },
  { name: 'GROQ-3-8B',     envKey: 'GROQ_API_KEY_3', priority: 7,  type: 'groq',    model: 'llama3-8b-8192' },
  { name: 'GROQ-4-70B',    envKey: 'GROQ_API_KEY_4', priority: 8,  type: 'groq',    model: 'llama-3.3-70b-versatile' },
  { name: 'GROQ-4-8B',     envKey: 'GROQ_API_KEY_4', priority: 9,  type: 'groq',    model: 'llama3-8b-8192' },
  { name: 'GROQ-5-70B',    envKey: 'GROQ_API_KEY_5', priority: 10, type: 'groq',    model: 'llama-3.3-70b-versatile' },
  { name: 'GROQ-5-8B',     envKey: 'GROQ_API_KEY_5', priority: 11, type: 'groq',    model: 'llama3-8b-8192' },

  // ── Google Gemini (Free: 1,500 req/day) ───────────────────────
  // Get key at: aistudio.google.com/apikey
  { name: 'Gemini-2-Flash-1', envKey: 'GEMINI_API_KEY',   priority: 20, type: 'gemini', model: 'gemini-2.0-flash' },
  { name: 'Gemini-1.5-Flash-1',envKey: 'GEMINI_API_KEY',  priority: 21, type: 'gemini', model: 'gemini-1.5-flash' },
  { name: 'Gemini-2-Flash-2', envKey: 'GEMINI_API_KEY_2', priority: 22, type: 'gemini', model: 'gemini-2.0-flash' },
  { name: 'Gemini-1.5-Flash-2',envKey: 'GEMINI_API_KEY_2',priority: 23, type: 'gemini', model: 'gemini-1.5-flash' },

  // ── Together AI (Free models available) ───────────────────────
  // Get key at: api.together.ai
  { name: 'Together-70B',  envKey: 'TOGETHER_API_KEY', priority: 30, type: 'together', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free' },
  { name: 'Together-Mix',  envKey: 'TOGETHER_API_KEY', priority: 31, type: 'together', model: 'mistralai/Mixtral-8x7B-Instruct-v0.1' },

  // ── OpenRouter (Free models) ───────────────────────────────────
  // Get key at: openrouter.ai
  { name: 'OpenRouter-Llama', envKey: 'OPENROUTER_API_KEY', priority: 35, type: 'openrouter', model: 'meta-llama/llama-3.3-8b-instruct:free' },
  { name: 'OpenRouter-Gemma', envKey: 'OPENROUTER_API_KEY', priority: 36, type: 'openrouter', model: 'google/gemma-3-12b-it:free' },

  // ── Cerebras (Free tier — very fast) ──────────────────────────
  // Get key at: cloud.cerebras.ai
  { name: 'Cerebras-70B', envKey: 'CEREBRAS_API_KEY', priority: 40, type: 'cerebras', model: 'llama3.3-70b' },
  { name: 'Cerebras-8B',  envKey: 'CEREBRAS_API_KEY', priority: 41, type: 'cerebras', model: 'llama3.1-8b' },

  // ── SambaNova (Free tier) ──────────────────────────────────────
  // Get key at: cloud.sambanova.ai
  { name: 'SambaNova-70B', envKey: 'SAMBANOVA_API_KEY', priority: 45, type: 'sambanova', model: 'Meta-Llama-3.3-70B-Instruct' },

  // ── HuggingFace Inference (Free) ──────────────────────────────
  // Get key at: huggingface.co/settings/tokens
  { name: 'HuggingFace',  envKey: 'HUGGINGFACE_API_KEY', priority: 50, type: 'huggingface', model: 'HuggingFaceH4/zephyr-7b-beta' },

  // ── Cohere (Free trial) ────────────────────────────────────────
  // Get key at: dashboard.cohere.com
  { name: 'Cohere',       envKey: 'COHERE_API_KEY', priority: 55, type: 'cohere', model: 'command-r' },

];

// Track rate-limited providers with cooldown (60 seconds)
const rateLimitCooldowns = {};

// ─────────────────────────────────────────────────────────────────
// MAIN CALL FUNCTION — tries all providers in priority order
// ─────────────────────────────────────────────────────────────────
async function callWithFallback(messages, maxTokens = 2000) {
  const now = Date.now();
  let lastError = null;
  let triedCount = 0;

  // Get active providers (have env key set + not in cooldown)
  const activeProviders = PROVIDERS.filter(p => {
    const key = process.env[p.envKey];
    return key && key.length > 10;
  }).sort((a, b) => a.priority - b.priority);

  if (activeProviders.length === 0) {
    throw new Error('No AI providers configured. Add at least GROQ_API_KEY to Render environment.');
  }

  console.log(`[AI] Pool: ${activeProviders.map(p => p.name).join(', ')}`);

  for (const provider of activeProviders) {
    // Skip if in rate-limit cooldown
    if (rateLimitCooldowns[provider.name] && rateLimitCooldowns[provider.name] > now) {
      const secs = Math.round((rateLimitCooldowns[provider.name] - now) / 1000);
      console.log(`[AI] Skipping ${provider.name} — rate limited (${secs}s left)`);
      continue;
    }

    triedCount++;
    try {
      const key = process.env[provider.envKey];
      const result = await callProvider(provider, key, messages, maxTokens);

      if (result) {
        if (triedCount > 1) console.log(`[AI] ✅ Success with: ${provider.name} (after ${triedCount - 1} failures)`);
        return result;
      }
    } catch (err) {
      if (err.message && err.message.includes('RATE_LIMIT')) {
        rateLimitCooldowns[provider.name] = now + 30000; // 30s cooldown
        console.warn(`[AI] ⚠️ Rate limited: ${provider.name}`);
      } else {
        console.warn(`[AI] ❌ ${provider.name}: ${err.message}`);
      }
      lastError = err;
    }
  }

  // If all providers are in cooldown, wait 10s and try again once
  const allInCooldown = activeProviders.every(p => 
    rateLimitCooldowns[p.name] && rateLimitCooldowns[p.name] > Date.now()
  );
  
  if (allInCooldown && activeProviders.length > 0) {
    console.log('[AI] All providers in cooldown — waiting 10s before retry...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Clear all cooldowns and try again
    activeProviders.forEach(p => delete rateLimitCooldowns[p.name]);
    
    for (const provider of activeProviders.slice(0, 3)) {
      try {
        const key = process.env[provider.envKey];
        const result = await callProvider(provider, key, messages, maxTokens);
        if (result) {
          console.log('[AI] ✅ Retry succeeded with: ' + provider.name);
          return result;
        }
      } catch (err) {
        console.warn('[AI] Retry failed on ' + provider.name + ': ' + err.message);
        lastError = err;
      }
    }
  }

  throw lastError || new Error('All AI providers exhausted. Try again in a few minutes.');
}

// ─────────────────────────────────────────────────────────────────
// INDIVIDUAL PROVIDER CALLERS
// ─────────────────────────────────────────────────────────────────
async function callProvider(provider, key, messages, maxTokens) {
  switch (provider.type) {
    case 'groq':       return callGroq(provider, key, messages, maxTokens);
    case 'gemini':     return callGemini(provider, key, messages, maxTokens);
    case 'together':   return callTogether(provider, key, messages, maxTokens);
    case 'openrouter': return callOpenRouter(provider, key, messages, maxTokens);
    case 'cerebras':   return callCerebras(provider, key, messages, maxTokens);
    case 'sambanova':  return callSambaNova(provider, key, messages, maxTokens);
    case 'huggingface':return callHuggingFace(provider, key, messages, maxTokens);
    case 'cohere':     return callCohere(provider, key, messages, maxTokens);
    default: throw new Error('Unknown provider type: ' + provider.type);
  }
}

// GROQ
async function callGroq(p, key, messages, maxTokens) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: p.model, messages, temperature: 0.3, max_tokens: maxTokens })
  });
  if (r.status === 429) throw new Error('RATE_LIMIT');
  if (!r.ok) { const e = await r.text(); throw new Error('GROQ ' + r.status + ': ' + e.substring(0, 80)); }
  const d = await r.json();
  return d.choices[0]?.message?.content || '';
}

// Google Gemini
async function callGemini(p, key, messages, maxTokens) {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + p.model + ':generateContent?key=' + key,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 } })
    }
  );
  if (r.status === 429) throw new Error('RATE_LIMIT');
  if (!r.ok) { const e = await r.text(); throw new Error('Gemini ' + r.status + ': ' + e.substring(0, 80)); }
  const d = await r.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Together AI (OpenAI-compatible)
async function callTogether(p, key, messages, maxTokens) {
  const r = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: p.model, messages, max_tokens: maxTokens, temperature: 0.3 })
  });
  if (r.status === 429) throw new Error('RATE_LIMIT');
  if (!r.ok) { const e = await r.text(); throw new Error('Together ' + r.status + ': ' + e.substring(0, 80)); }
  const d = await r.json();
  return d.choices[0]?.message?.content || '';
}

// OpenRouter (OpenAI-compatible)
async function callOpenRouter(p, key, messages, maxTokens) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://asky-recruit-iq-ai.vercel.app',
      'X-Title': 'ASKY RecruitIQ'
    },
    body: JSON.stringify({ model: p.model, messages, max_tokens: maxTokens, temperature: 0.3 })
  });
  if (r.status === 429) throw new Error('RATE_LIMIT');
  if (!r.ok) { const e = await r.text(); throw new Error('OpenRouter ' + r.status + ': ' + e.substring(0, 80)); }
  const d = await r.json();
  return d.choices[0]?.message?.content || '';
}

// Cerebras (OpenAI-compatible)
async function callCerebras(p, key, messages, maxTokens) {
  const r = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: p.model, messages, max_tokens: maxTokens, temperature: 0.3 })
  });
  if (r.status === 429) throw new Error('RATE_LIMIT');
  if (!r.ok) { const e = await r.text(); throw new Error('Cerebras ' + r.status + ': ' + e.substring(0, 80)); }
  const d = await r.json();
  return d.choices[0]?.message?.content || '';
}

// SambaNova (OpenAI-compatible)
async function callSambaNova(p, key, messages, maxTokens) {
  const r = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: p.model, messages, max_tokens: maxTokens, temperature: 0.3 })
  });
  if (r.status === 429) throw new Error('RATE_LIMIT');
  if (!r.ok) { const e = await r.text(); throw new Error('SambaNova ' + r.status + ': ' + e.substring(0, 80)); }
  const d = await r.json();
  return d.choices[0]?.message?.content || '';
}

// HuggingFace Inference
async function callHuggingFace(p, key, messages, maxTokens) {
  const prompt = messages.map(m => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.content).join('\n') + '\nAssistant:';
  const r = await fetch('https://api-inference.huggingface.co/models/' + p.model, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: maxTokens, temperature: 0.3 } })
  });
  if (r.status === 429) throw new Error('RATE_LIMIT');
  if (!r.ok) { const e = await r.text(); throw new Error('HuggingFace ' + r.status + ': ' + e.substring(0, 80)); }
  const d = await r.json();
  const raw = Array.isArray(d) ? d[0]?.generated_text || '' : d.generated_text || '';
  return raw.split('Assistant:').pop()?.trim() || raw;
}

// Cohere
async function callCohere(p, key, messages, maxTokens) {
  const last = messages[messages.length - 1];
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
    message: m.content
  }));
  const r = await fetch('https://api.cohere.com/v1/chat', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: p.model, message: last.content, chat_history: history, max_tokens: maxTokens })
  });
  if (r.status === 429) throw new Error('RATE_LIMIT');
  if (!r.ok) { const e = await r.text(); throw new Error('Cohere ' + r.status + ': ' + e.substring(0, 80)); }
  const d = await r.json();
  return d.text || '';
}

// ─────────────────────────────────────────────────────────────────
// STATUS CHECKER — for /api/ai-test endpoint
// ─────────────────────────────────────────────────────────────────
function getProviderStatus() {
  const status = {};
  PROVIDERS.forEach(p => {
    const key = process.env[p.envKey];
    const hasKey = !!(key && key.length > 10);
    const inCooldown = !!(rateLimitCooldowns[p.name] && rateLimitCooldowns[p.name] > Date.now());
    if (!status[p.envKey]) {
      status[p.envKey] = {
        configured: hasKey,
        providers: []
      };
    }
    if (hasKey) {
      status[p.envKey].providers.push(p.name + (inCooldown ? ' (cooling)' : ' ✅'));
    }
  });

  const configured = PROVIDERS.filter(p => {
    const key = process.env[p.envKey];
    return key && key.length > 10;
  });

  return {
    totalProviders: configured.length,
    activeProviders: configured.filter(p => !rateLimitCooldowns[p.name] || rateLimitCooldowns[p.name] <= Date.now()).length,
    providerList: configured.map(p => p.name),
    keyStatus: status,
    estimatedDailyCapacity: configured.length * 1000 + ' requests minimum'
  };
}

module.exports = {
  callWithFallback,
  getProviderStatus,
  PROVIDERS,
};
