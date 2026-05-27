const Groq = require('groq-sdk');

const PROMPT_TEMPLATE = (jobTitle, rawText) => `You are an expert technical recruiter. Analyze this resume for the role: "${jobTitle || 'Software Engineer'}".

Return ONLY valid JSON with no extra text:
{
  "name": "full name",
  "email": "email or empty string",
  "phone": "phone or empty string",
  "domain": "primary tech domain e.g. Java Backend, React Frontend, DevOps",
  "seniority": "Junior or Mid or Senior or Lead",
  "experience_years": 5,
  "topSkills": ["skill1","skill2","skill3","skill4","skill5"],
  "aiScore": 78,
  "tier": "A-Tier or B-Tier or C-Tier",
  "riskLevel": "low or medium or high",
  "summary": "2-3 sentence overview",
  "technicalExperience": "2-3 sentences about technical stack and projects",
  "leadershipExperience": "1-2 sentences about leadership, or None mentioned",
  "cloudExpertise": "1-2 sentences about cloud/infra, or None mentioned",
  "databases": ["PostgreSQL","MongoDB"],
  "frameworks": ["Spring Boot","React"],
  "tools": ["Docker","Jenkins","Git"],
  "projectDomains": ["Telecom","Banking"],
  "strengths": ["strength 1","strength 2","strength 3"],
  "gaps": ["gap 1","gap 2"],
  "skillScores": [{"skill":"Java","score":85},{"skill":"Spring Boot","score":75}],
  "recommendation": "Strong Hire or Hire or Maybe or No Hire",
  "recommendationReason": "2-3 sentence explanation"
}

Resume:
${rawText.slice(0, 4000)}`;

async function getProvidersFromDB() {
  try {
    const Settings = require('../models/Settings');
    const settings = await Settings.findOne();
    if (settings?.aiProviders?.length) {
      return settings.aiProviders
        .filter(p => p.enabled && p.apiKey)
        .sort((a, b) => a.priority - b.priority);
    }
  } catch (e) {
    console.log('[AI] Could not load providers from DB, using env vars');
  }
  return null;
}

async function screenResumeWithAI(rawText, jobTitle) {
  const prompt = PROMPT_TEMPLATE(jobTitle, rawText);

  // Try DB-configured providers first
  const dbProviders = await getProvidersFromDB();
  if (dbProviders && dbProviders.length > 0) {
    for (const p of dbProviders) {
      try {
        const result = await callProvider(p.provider, p.apiKey, p.model, p.baseUrl, prompt);
        if (result) { console.log(`[AI] Screened with ${p.name}`); return result; }
      } catch (e) { console.log(`[AI] ${p.name} failed: ${e.message}`); }
    }
  }

  // Fall back to environment variables
  const envProviders = [
    { name: 'Groq (env)',      fn: () => tryGroq(process.env.GROQ_API_KEY, 'llama-3.3-70b-versatile', prompt) },
    { name: 'OpenAI (env)',    fn: () => tryOpenAI(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || 'gpt-4o-mini', '', prompt) },
    { name: 'Anthropic (env)', fn: () => tryAnthropic(process.env.CLAUDE_API_KEY, 'claude-haiku-4-5-20251001', prompt) },
    { name: 'Gemini (env)',    fn: () => tryGemini(process.env.GEMINI_API_KEY, 'gemini-1.5-flash', prompt) },
  ];
  for (const { name, fn } of envProviders) {
    try {
      const result = await fn();
      if (result) { console.log(`[AI] Screened with ${name}`); return result; }
    } catch (e) { console.log(`[AI] ${name} failed: ${e.message}`); }
  }

  console.warn('[AI] All providers failed');
  return null;
}

async function callProvider(provider, apiKey, model, baseUrl, prompt) {
  switch (provider) {
    case 'groq':             return tryGroq(apiKey, model, prompt);
    case 'openai':
    case 'openai-compatible': return tryOpenAI(apiKey, model, baseUrl || '', prompt);
    case 'anthropic':        return tryAnthropic(apiKey, model, prompt);
    case 'gemini':           return tryGemini(apiKey, model, prompt);
    case 'huggingface':      return tryHuggingFace(apiKey, model, prompt);
    case 'ollama':           return tryOllama(baseUrl || 'http://localhost:11434', model, prompt);
    default:                 return tryOpenAI(apiKey, model, baseUrl || '', prompt);
  }
}

async function tryGroq(apiKey, model, prompt) {
  if (!apiKey) return null;
  const groq = new Groq({ apiKey });
  const resp = await groq.chat.completions.create({
    model: model || 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1, max_tokens: 1000,
  });
  return parseJSON(resp.choices[0].message.content);
}

async function tryOpenAI(apiKey, model, baseUrl, prompt) {
  if (!apiKey) return null;
  const url = baseUrl ? `${baseUrl}/chat/completions` : 'https://api.openai.com/v1/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 1000 }),
  });
  const data = await resp.json();
  if (!data.choices) throw new Error(data.error?.message || 'No response');
  return parseJSON(data.choices[0].message.content);
}

async function tryAnthropic(apiKey, model, prompt) {
  if (!apiKey) return null;
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: model || 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });
  return parseJSON(msg.content[0].text);
}

async function tryGemini(apiKey, model, prompt) {
  if (!apiKey) return null;
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 1000 } }),
  });
  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(data.error?.message || 'No content');
  return parseJSON(text);
}

async function tryHuggingFace(apiKey, model, prompt) {
  if (!apiKey || !model) return null;
  const resp = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 1000, temperature: 0.1 } }),
  });
  const data = await resp.json();
  const text = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
  if (!text) throw new Error('No response from HuggingFace');
  return parseJSON(text);
}

async function tryOllama(baseUrl, model, prompt) {
  if (!model) return null;
  const resp = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false }),
  });
  const data = await resp.json();
  return parseJSON(data.message?.content || '');
}

function parseJSON(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]);
}

module.exports = { screenResumeWithAI };
