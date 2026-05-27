const Groq = require('groq-sdk');

const PROMPT_TEMPLATE = (jobContext, rawText) => {
  const jobTitle      = typeof jobContext === 'string' ? jobContext : (jobContext.title || 'Software Engineer');
  const primarySkill  = typeof jobContext === 'object' ? (jobContext.primarySkill || '') : '';
  const requiredSkills = typeof jobContext === 'object' ? (jobContext.requiredSkills || []) : [];
  const level         = typeof jobContext === 'object' ? (jobContext.level || '') : '';

  const skillMatchRules = primarySkill ? `
CRITICAL SCORING RULES — APPLY STRICTLY:
- Primary skill required: "${primarySkill}"
- Required skills: ${requiredSkills.length ? requiredSkills.join(', ') : 'not specified'}
- If the candidate does NOT have "${primarySkill}" as a primary skill, the aiScore MUST be 40 or below regardless of overall CV quality
- If the candidate has "${primarySkill}" but is missing most other required skills, cap score at 65
- Only give 75+ if candidate clearly has "${primarySkill}" AND most required skills
- Only give 85+ if candidate is strong in "${primarySkill}" AND matches all required skills AND experience level
- A strong Java developer applying for a React role is NOT a good match — score them low (30-45)
- Be strict: job fit matters more than overall CV strength` : '';

  return `You are an expert technical recruiter screening candidates for this specific role.

Job Title: ${jobTitle}${level ? `
Experience Level Required: ${level}` : ''}${primarySkill ? `
Primary Skill Required: ${primarySkill}` : ''}${requiredSkills.length ? `
Required Skills: ${requiredSkills.join(', ')}` : ''}
${skillMatchRules}

Analyze the resume below and return ONLY valid JSON with no extra text:
{
  "name": "full name",
  "email": "email or empty string",
  "phone": "phone or empty string",
  "domain": "candidate primary tech domain e.g. Java Backend, React Frontend",
  "seniority": "Junior or Mid or Senior or Lead",
  "experience_years": 5,
  "topSkills": ["skill1","skill2","skill3","skill4","skill5"],
  "primarySkillMatch": true,
  "primarySkillScore": 85,
  "jobFitScore": 60,
  "aiScore": 78,
  "tier": "A-Tier or B-Tier or C-Tier",
  "riskLevel": "low or medium or high",
  "summary": "2-3 sentence overview mentioning job fit",
  "technicalExperience": "2-3 sentences about technical stack",
  "leadershipExperience": "1-2 sentences or None mentioned",
  "cloudExpertise": "1-2 sentences or None mentioned",
  "databases": ["PostgreSQL","MongoDB"],
  "frameworks": ["Spring Boot","React"],
  "tools": ["Docker","Jenkins","Git"],
  "projectDomains": ["Telecom","Banking"],
  "strengths": ["strength 1 relevant to this role","strength 2"],
  "gaps": ["gap 1 vs this role requirements","gap 2"],
  "skillScores": [{"skill":"${primarySkill || 'Primary Skill'}","score":85},{"skill":"Secondary Skill","score":70}],
  "recommendation": "Strong Hire or Hire or Maybe or No Hire",
  "recommendationReason": "2-3 sentence explanation mentioning fit for ${jobTitle}"
}

Resume:
${rawText.slice(0, 4000)}`;
};

async function getProvidersFromDB() {
  try {
    const Settings = require('../models/Settings');
    const settings = await Settings.findOne();
    if (settings?.aiProviders?.length) {
      const active = settings.aiProviders
        .filter(p => p.enabled && (p.apiKey || p.provider === 'ollama'))
        .sort((a, b) => a.priority - b.priority);
      if (active.length) {
        console.log(`[AI] Found ${active.length} active providers in DB: ${active.map(p => p.name).join(', ')}`);
        return active;
      }
    }
  } catch (e) {
    console.log('[AI] DB provider load failed:', e.message);
  }
  console.log('[AI] No DB providers found, falling back to env vars');
  return null;
}

async function screenResumeWithAI(rawText, jobContext) {
  const prompt = PROMPT_TEMPLATE(jobContext, rawText);

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
