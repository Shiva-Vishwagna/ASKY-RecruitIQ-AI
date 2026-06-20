const Groq = require('groq-sdk');

/**
 * RECRUIT IQ — AI SERVICE
 * ========================
 * CV Scoring:
 *   Technical:     Skills depth (70%) + Stability (30%)
 *   Non-Technical: Experience relevance (60%) + Stability (40%)
 *
 * Screening:
 *   Technical:     Technical accuracy (40%) + Depth (40%) + Relevance (20%)
 *   Non-Technical: Domain knowledge (30%) + Communication (30%) + Problem solving (20%) + Role fit (20%)
 *
 * Combined = CV (60%) + Screening (40%) — configurable per job
 */

// ── CV Analysis Prompt ────────────────────────────────────────
function buildCVPrompt(jobContext, rawText) {
  const isStr      = typeof jobContext === 'string';
  const jobTitle   = isStr ? jobContext : (jobContext.title        || 'Professional');
  const roleType   = isStr ? 'technical' : (jobContext.roleType   || 'technical');
  const primary    = isStr ? '' :          (jobContext.primarySkill  || '');
  const required   = isStr ? [] :          (jobContext.requiredSkills || []);
  const level      = isStr ? '' :          (jobContext.level        || '');
  const isTech     = roleType !== 'non_technical';

  const scoring = isTech ? `
ROLE TYPE: TECHNICAL / IT

SCORING — 2 factors only:
1. skillsMatchScore (0-100) — weight 70%
   Depth of technical knowledge vs job requirements.
   DO NOT just check if skill is mentioned — check years used, projects built, depth.
   90+: Expert in primary skill + all required skills, real production work
   70-89: Proficient, good depth, minor gaps in required skills
   50-69: Has primary skill but missing several required skills
   Below 50: Primary skill missing or wrong domain
   ${primary ? `\nCRITICAL: Primary skill is "${primary}". If NOT in CV → max 35. Wrong domain → max 45.` : ''}

2. stabilityScore (0-100) — weight 30%
   Reliability based on job tenure history.
   90+: 2.5+ years average per role, no unexplained gaps
   70-89: Mostly stable, one or two shorter stints with context
   50-69: Some roles under 1 year
   Below 50: Multiple roles under 6 months — flight risk
` : `
ROLE TYPE: NON-TECHNICAL (${jobTitle})
This is NOT an IT role. Do NOT penalise for lacking programming/tech skills.

SCORING — 2 factors only:
1. skillsMatchScore (0-100) — weight 60% — here this means EXPERIENCE RELEVANCE
   How closely does the candidate's experience match this specific role/industry?
   90+: Same role, same industry, strong track record
   70-89: Related experience, transferable skills, good domain knowledge
   50-69: Some relevant experience but significant gaps
   Below 50: Mostly unrelated background

2. stabilityScore (0-100) — weight 40%
   Career progression and reliability.
   90+: Consistent tenure, clear upward progression
   70-89: Mostly stable career with understandable moves
   Below 60: Frequent unexplained changes, no clear arc
`;

  return `You are a Senior Talent Acquisition expert. Analyze this CV for the specific role.

JOB: ${jobTitle}${level ? `\nLEVEL: ${level}` : ''}${primary ? `\nPRIMARY SKILL: ${primary}` : ''}${required.length ? `\nREQUIREMENTS: ${required.join(', ')}` : ''}

${scoring}

RISK FLAGS to identify:
- frequentJobChanges: true if 2+ consecutive roles lasted under 1 year
- missingMandatorySkills: array of required skills clearly absent from this CV
- domainMismatch: true if candidate background fundamentally doesn't match role

HM SUMMARY (4-5 sentences for the Hiring Manager):
Cover: background overview, strongest relevant areas, key gaps/concerns, stability assessment, clear hire/no-hire rationale.

Return ONLY valid JSON. No markdown. No extra text. Start with { and end with }

{
  "name": "full name from resume",
  "email": "email address or empty string",
  "phone": "phone number or empty string",
  "domain": "primary domain e.g. Java Backend, Travel & Hospitality, Sales",
  "seniority": "Junior or Mid or Senior or Lead",
  "experience_years": 4,
  "topSkills": ["skill1","skill2","skill3","skill4","skill5"],
  "primarySkillMatch": true,
  "primarySkillScore": 80,
  "jobFitScore": 75,
  "cvScoreBreakdown": {
    "skillsMatchScore": 78,
    "stabilityScore": 82
  },
  "aiScore": 79,
  "tier": "B-Tier",
  "riskLevel": "low",
  "riskFlags": {
    "frequentJobChanges": false,
    "missingMandatorySkills": [],
    "domainMismatch": false
  },
  "summary": "2-3 sentence CV overview relevant to ${jobTitle}",
  "hmSummary": "4-5 sentence HM briefing: background, strengths, gaps, stability, hire rationale",
  "technicalExperience": "2-3 sentences about technical or domain experience",
  "leadershipExperience": "1-2 sentences or None mentioned",
  "cloudExpertise": "1-2 sentences or None mentioned",
  "databases": ["PostgreSQL"],
  "frameworks": ["Spring Boot"],
  "tools": ["Docker","Git"],
  "projectDomains": ["Banking"],
  "strengths": ["Specific strength for ${jobTitle}","Another strength"],
  "gaps": ["Gap vs requirements","Another gap"],
  "skillScores": [{"skill":"${primary || 'Key Skill'}","score":80}],
  "interviewFocusAreas": ["Probe depth of ${primary||'primary skill'}","Validate gap area","Verify stability reasons"],
  "recommendation": "Hire",
  "recommendationReason": "2-3 sentences explaining fit for ${jobTitle}"
}

RESUME TEXT:
${rawText.slice(0, 5000)}`;
}

// ── Calculate CV score from breakdown ─────────────────────────
function calculateCVScore(breakdown, roleType) {
  if (!breakdown) return 0;
  const skills    = clamp(Number(breakdown.skillsMatchScore || 0));
  const stability = clamp(Number(breakdown.stabilityScore   || 0));
  const isTech    = roleType !== 'non_technical';
  return Math.round(isTech
    ? (skills * 0.70) + (stability * 0.30)
    : (skills * 0.60) + (stability * 0.40)
  );
}

function clamp(n) { return Math.min(100, Math.max(0, n)); }

function determineTier(score) {
  if (score >= 78) return 'A-Tier';
  if (score >= 58) return 'B-Tier';
  return 'C-Tier';
}

// ── Get providers from DB settings ───────────────────────────
async function getProvidersFromDB() {
  try {
    const Settings = require('../models/Settings');
    const s = await Settings.findOne();
    if (s?.aiProviders?.length) {
      const active = s.aiProviders
        .filter(p => p.enabled && (p.apiKey || p.provider === 'ollama'))
        .sort((a, b) => (a.priority||0) - (b.priority||0));
      if (active.length) return active;
    }
  } catch (e) { /* ignore */ }
  return null;
}

// ── Main: screen a resume ─────────────────────────────────────
async function screenResumeWithAI(rawText, jobContext) {
  const prompt   = buildCVPrompt(jobContext, rawText);
  const roleType = typeof jobContext === 'object' ? (jobContext.roleType || 'technical') : 'technical';

  // Try DB-configured providers first
  const dbProviders = await getProvidersFromDB();
  if (dbProviders?.length) {
    for (const p of dbProviders) {
      try {
        const result = await callProvider(p.provider, p.apiKey, p.model, p.baseUrl, prompt);
        if (result) {
          result.aiScore = calculateCVScore(result.cvScoreBreakdown, roleType);
          result.tier    = determineTier(result.aiScore);
          console.log('[AI] CV screened via DB provider:', p.name, '→', result.aiScore);
          return result;
        }
      } catch (e) { console.log('[AI]', p.name, 'failed:', e.message); }
    }
  }

  // Fall back to environment variables
  const key     = process.env.GROQ_API_KEY;
  const oaiKey  = process.env.OPENAI_API_KEY;
  const claudeKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  console.log('[AI] Env keys present — GROQ:', !!key, '| OpenAI:', !!oaiKey, '| Claude:', !!claudeKey, '| Gemini:', !!geminiKey);

  const envProviders = [
    { name:'Groq',      fn: () => tryGroq(key, 'llama-3.3-70b-versatile', prompt) },
    { name:'OpenAI',    fn: () => tryOpenAI(oaiKey, process.env.OPENAI_MODEL||'gpt-4o-mini', '', prompt) },
    { name:'Anthropic', fn: () => tryAnthropic(claudeKey, 'claude-haiku-4-5-20251001', prompt) },
    { name:'Gemini',    fn: () => tryGemini(geminiKey, 'gemini-1.5-flash', prompt) },
  ];

  for (const { name, fn } of envProviders) {
    try {
      const result = await fn();
      if (result) {
        result.aiScore = calculateCVScore(result.cvScoreBreakdown, roleType);
        result.tier    = determineTier(result.aiScore);
        console.log('[AI] CV screened via', name, '→', result.aiScore, '/', result.tier);
        return result;
      }
    } catch (e) { console.log('[AI]', name, 'error:', e.message); }
  }

  console.error('[AI] ALL providers failed. Check API keys in Render → Environment.');
  return null;
}

// ── Score screening answers ───────────────────────────────────
async function scoreScreeningAnswers(answers, ctx) {
  const { appliedFor='Professional', topSkills=[], domain='', roleType='technical' } = ctx;
  const isTech  = roleType !== 'non_technical';
  const groqKey = process.env.GROQ_API_KEY;
  const scored  = [];
  let   total   = 0;

  for (const { question, answer } of answers) {
    let breakdown = {};
    let overall   = 0;
    let feedback  = '';

    if (answer?.trim() && groqKey) {
      try {
        const groq   = new Groq({ apiKey: groqKey });
        const prompt = isTech
          ? `You are a Principal Engineer evaluating a technical interview answer.
Role: ${appliedFor} | Skills: ${topSkills.slice(0,5).join(', ')||'Software Engineering'}

Question: ${question}
Answer: ${answer}

Score ONLY on technical merit — not communication style:
1. technicalAccuracy (0-100): Are facts correct? No wrong information?
2. technicalDepth (0-100): Real hands-on experience or just textbook knowledge?
3. roleRelevance (0-100): Relevant to what ${appliedFor} needs?

Return ONLY valid JSON:
{"technicalAccuracy":75,"technicalDepth":70,"roleRelevance":80,"feedback":"One specific technical observation"}`

          : `You are an HR interviewer evaluating a candidate for a ${appliedFor} role.
Domain: ${domain||appliedFor} | Skills: ${topSkills.slice(0,5).join(', ')||appliedFor}

Question: ${question}
Answer: ${answer}

Score for a NON-TECHNICAL role. Do NOT evaluate coding or IT knowledge:
1. domainKnowledge (0-100): Does candidate understand the domain/industry for this role?
2. communicationClarity (0-100): Is answer clear, structured, professional?
3. problemSolving (0-100): Logical thinking and initiative shown?
4. roleUnderstanding (0-100): Does candidate understand what this specific role requires?

Return ONLY valid JSON:
{"domainKnowledge":75,"communicationClarity":80,"problemSolving":70,"roleUnderstanding":75,"feedback":"One specific observation about this answer"}`;

        const resp = await groq.chat.completions.create({
          model:'llama-3.3-70b-versatile',
          messages:[{ role:'user', content:prompt }],
          temperature:0.1, max_tokens:200,
        });

        const text  = resp.choices[0].message.content.replace(/```json|```/g,'').trim();
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const p = JSON.parse(match[0]);
          feedback = (p.feedback || '').slice(0, 200);
          if (isTech) {
            const acc = clamp(Number(p.technicalAccuracy||0));
            const dep = clamp(Number(p.technicalDepth   ||0));
            const rel = clamp(Number(p.roleRelevance    ||0));
            breakdown = { technical: acc, depth: dep, relevance: rel };
            overall   = Math.round(acc*0.40 + dep*0.40 + rel*0.20);
          } else {
            const dom = clamp(Number(p.domainKnowledge     ||0));
            const com = clamp(Number(p.communicationClarity||0));
            const pro = clamp(Number(p.problemSolving      ||0));
            const rol = clamp(Number(p.roleUnderstanding   ||0));
            breakdown = { domain: dom, communication: com, problemSolving: pro, roleUnderstanding: rol };
            overall   = Math.round(dom*0.30 + com*0.30 + pro*0.20 + rol*0.20);
          }
        }
      } catch (e) { console.error('[answer scoring]', e.message); }
    }

    total += overall;
    scored.push({ question: question.slice(0,400), aiScore: overall, scoreBreakdown: breakdown, aiFeedback: feedback });
  }

  const screeningScore = answers.length > 0 ? Math.round(total / answers.length) : 0;
  return { scoredAnswers: scored, screeningScore };
}

// ── Provider implementations ──────────────────────────────────
async function callProvider(provider, apiKey, model, baseUrl, prompt) {
  switch (provider) {
    case 'groq':              return tryGroq(apiKey, model, prompt);
    case 'openai':
    case 'openai-compatible': return tryOpenAI(apiKey, model, baseUrl||'', prompt);
    case 'anthropic':         return tryAnthropic(apiKey, model, prompt);
    case 'gemini':            return tryGemini(apiKey, model, prompt);
    case 'huggingface':       return tryHuggingFace(apiKey, model, prompt);
    case 'ollama':            return tryOllama(baseUrl||'http://localhost:11434', model, prompt);
    default:                  return tryGroq(apiKey, model, prompt);
  }
}

async function tryGroq(apiKey, model, prompt) {
  if (!apiKey) { console.log('[AI] Groq skipped — no key'); return null; }
  const groq = new Groq({ apiKey });
  const resp = await groq.chat.completions.create({
    model:    model || 'llama-3.3-70b-versatile',
    messages: [{ role:'user', content:prompt }],
    temperature: 0.1,
    max_tokens:  1500,
  });
  return parseJSON(resp.choices[0].message.content);
}

async function tryOpenAI(apiKey, model, baseUrl, prompt) {
  if (!apiKey) return null;
  const url = baseUrl ? `${baseUrl}/chat/completions` : 'https://api.openai.com/v1/chat/completions';
  const resp = await fetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${apiKey}` },
    body: JSON.stringify({ model:model||'gpt-4o-mini', messages:[{role:'user',content:prompt}], temperature:0.1, max_tokens:1500 }),
  });
  const data = await resp.json();
  if (!data.choices) throw new Error(data.error?.message || 'No response from OpenAI');
  return parseJSON(data.choices[0].message.content);
}

async function tryAnthropic(apiKey, model, prompt) {
  if (!apiKey) return null;
  const Anthropic = require('@anthropic-ai/sdk');
  const client    = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model:    model || 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{ role:'user', content:prompt }],
  });
  return parseJSON(msg.content[0].text);
}

async function tryGemini(apiKey, model, prompt) {
  if (!apiKey) return null;
  const url  = `https://generativelanguage.googleapis.com/v1beta/models/${model||'gemini-1.5-flash'}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{ temperature:0.1, maxOutputTokens:1500 } }),
  });
  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(data.error?.message || 'No content from Gemini');
  return parseJSON(text);
}

async function tryHuggingFace(apiKey, model, prompt) {
  if (!apiKey || !model) return null;
  const resp = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method:'POST',
    headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ inputs:prompt, parameters:{ max_new_tokens:1500, temperature:0.1 } }),
  });
  const data = await resp.json();
  const text = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
  if (!text) throw new Error('No response from HuggingFace');
  return parseJSON(text);
}

async function tryOllama(baseUrl, model, prompt) {
  if (!model) return null;
  const resp = await fetch(`${baseUrl}/api/chat`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ model, messages:[{role:'user',content:prompt}], stream:false }),
  });
  const data = await resp.json();
  return parseJSON(data.message?.content || '');
}

function parseJSON(text) {
  if (!text) throw new Error('Empty response from AI');
  const cleaned = text.replace(/```json|```/g, '').trim();
  // Find first { to last } to extract JSON even if there's extra text
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in: ' + cleaned.slice(0,100));
  return JSON.parse(cleaned.slice(start, end+1));
}

module.exports = { screenResumeWithAI, scoreScreeningAnswers, calculateCVScore, determineTier };
