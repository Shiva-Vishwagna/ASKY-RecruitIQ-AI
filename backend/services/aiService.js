const Groq = require('groq-sdk');

// ── CV Scoring: ONLY skills match + stability ─────────────────
// As per HM/Recruiter logic: what matters is can they DO the job
// and are they reliable (not a job hopper)
const PROMPT_TEMPLATE = (jobContext, rawText) => {
  const jobTitle       = typeof jobContext === 'string' ? jobContext : (jobContext.title || 'Software Engineer');
  const primarySkill   = typeof jobContext === 'object' ? (jobContext.primarySkill  || '') : '';
  const requiredSkills = typeof jobContext === 'object' ? (jobContext.requiredSkills || []) : [];
  const level          = typeof jobContext === 'object' ? (jobContext.level          || '') : '';

  const skillRules = primarySkill ? `
STRICT SCORING RULES — APPLY EXACTLY:
- Primary skill required: "${primarySkill}"
- Required skills: ${requiredSkills.length ? requiredSkills.join(', ') : 'not specified'}
- If candidate does NOT have "${primarySkill}" as primary/core skill → aiScore MUST be 35 or below
- If candidate has "${primarySkill}" but missing most required skills → cap at 60
- Give 70-80 only if candidate clearly has "${primarySkill}" AND most required skills
- Give 85+ only if strong in "${primarySkill}" AND matches all required skills AND correct experience level
- A Java developer applying for React role = 25-40 MAX regardless of overall experience
- Job fit matters MORE than total years of experience` : '';

  return `You are an experienced Technical Recruiter and Hiring Manager screening a candidate.

ROLE: ${jobTitle}${level ? `\nLEVEL: ${level}` : ''}${primarySkill ? `\nPRIMARY SKILL: ${primarySkill}` : ''}${requiredSkills.length ? `\nREQUIRED SKILLS: ${requiredSkills.join(', ')}` : ''}
${skillRules}

CV SCORING — based ONLY on 2 factors:
1. skillsMatchScore (70% weight): How deeply does the candidate know the required skills?
   - Look for: years using each skill, projects built with it, depth of usage
   - Do NOT just check if skill name is mentioned — check actual usage
   - Score 90+: Expert in primary skill + all required skills
   - Score 70-89: Proficient in primary + most required skills
   - Score 50-69: Has primary skill but gaps in required skills
   - Score below 50: Missing primary skill or major gaps

2. stabilityScore (30% weight): Is the candidate reliable?
   - Score 90+: 2+ years per role, no unexplained gaps
   - Score 70-89: Mix of short and long tenures, mostly stable
   - Score 50-69: Some job changes under 1 year
   - Score below 50: Multiple roles under 6 months (job hopper red flag)

RISK FLAGS to detect from CV:
- frequentJobChanges: true if 2+ jobs with under 1 year tenure
- missingMandatorySkills: list which required skills are clearly NOT present in CV
- domainMismatch: true if candidate's domain doesn't match job domain at all

Analyze this resume and return ONLY valid JSON, no markdown, no extra text:
{
  "name": "full name from resume",
  "email": "email or empty string",
  "phone": "phone or empty string",
  "domain": "primary tech domain e.g. Java Backend, React Frontend, DevOps",
  "seniority": "Junior or Mid or Senior or Lead",
  "experience_years": 5,
  "topSkills": ["skill1","skill2","skill3","skill4","skill5"],
  "primarySkillMatch": true,
  "primarySkillScore": 85,
  "jobFitScore": 78,

  "cvScoreBreakdown": {
    "skillsMatchScore": 82,
    "stabilityScore": 75
  },

  "aiScore": 80,
  "tier": "A-Tier or B-Tier or C-Tier",
  "riskLevel": "low or medium or high",

  "riskFlags": {
    "frequentJobChanges": false,
    "missingMandatorySkills": ["skill1"],
    "domainMismatch": false
  },

  "summary": "2-3 sentences about this candidate's technical fit for ${jobTitle}",
  "hmSummary": "4-5 sentences for the Hiring Manager explaining: what technical skills are strong, what is missing, stability assessment, and a clear hire/no-hire rationale for ${jobTitle}.",

  "technicalExperience":  "2-3 sentences about their tech stack and projects",
  "leadershipExperience": "1-2 sentences or None mentioned",
  "cloudExpertise":       "1-2 sentences or None mentioned",

  "databases":      ["PostgreSQL","MongoDB"],
  "frameworks":     ["Spring Boot","React"],
  "tools":          ["Docker","Jenkins","Git"],
  "projectDomains": ["Banking","E-commerce"],

  "strengths": ["Technical strength specific to this role","Another technical strength"],
  "gaps":      ["Technical gap vs role requirements","Another gap"],

  "skillScores": [
    {"skill": "${primarySkill || 'Primary Skill'}", "score": 85},
    {"skill": "Secondary Skill", "score": 70}
  ],

  "interviewFocusAreas": [
    "Deep dive on ${primarySkill || 'primary skill'} — ask about specific projects",
    "Test knowledge of required skills",
    "Probe stability — reasons for short tenures if any"
  ],

  "recommendation": "Strong Hire or Hire or Consider or Weak Fit or Reject",
  "recommendationReason": "2-3 sentences explaining technical fit for ${jobTitle}"
}

Resume text:
${rawText.slice(0, 4500)}`;
};

// ── Calculate CV score from breakdown (skills 70% + stability 30%) ──
function calculateCVScore(breakdown) {
  if (!breakdown) return 0;
  const skills    = Number(breakdown.skillsMatchScore || 0);
  const stability = Number(breakdown.stabilityScore   || 0);
  return Math.round((skills * 0.70) + (stability * 0.30));
}

// ── Get AI providers from DB settings ────────────────────────
async function getProvidersFromDB() {
  try {
    const Settings = require('../models/Settings');
    const settings = await Settings.findOne();
    if (settings?.aiProviders?.length) {
      const active = settings.aiProviders
        .filter(p => p.enabled && (p.apiKey || p.provider === 'ollama'))
        .sort((a, b) => a.priority - b.priority);
      if (active.length) {
        console.log(`[AI] Providers: ${active.map(p => p.name).join(', ')}`);
        return active;
      }
    }
  } catch (e) { console.log('[AI] DB provider load failed:', e.message); }
  return null;
}

// ── Main CV screening function ────────────────────────────────
async function screenResumeWithAI(rawText, jobContext) {
  const prompt = PROMPT_TEMPLATE(jobContext, rawText);

  const dbProviders = await getProvidersFromDB();
  if (dbProviders?.length) {
    for (const p of dbProviders) {
      try {
        const result = await callProvider(p.provider, p.apiKey, p.model, p.baseUrl, prompt);
        if (result) {
          // Recalculate score from breakdown
          if (result.cvScoreBreakdown) {
            result.aiScore = calculateCVScore(result.cvScoreBreakdown);
          }
          console.log(`[AI] CV screened with ${p.name} → Score: ${result.aiScore}`);
          return result;
        }
      } catch (e) { console.log(`[AI] ${p.name} failed: ${e.message}`); }
    }
  }

  const envProviders = [
    { name:'Groq',      fn: () => tryGroq(process.env.GROQ_API_KEY, 'llama-3.3-70b-versatile', prompt) },
    { name:'OpenAI',    fn: () => tryOpenAI(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL||'gpt-4o-mini', '', prompt) },
    { name:'Anthropic', fn: () => tryAnthropic(process.env.CLAUDE_API_KEY, 'claude-haiku-4-5-20251001', prompt) },
    { name:'Gemini',    fn: () => tryGemini(process.env.GEMINI_API_KEY, 'gemini-1.5-flash', prompt) },
  ];
  for (const { name, fn } of envProviders) {
    try {
      const result = await fn();
      if (result) {
        if (result.cvScoreBreakdown) result.aiScore = calculateCVScore(result.cvScoreBreakdown);
        console.log(`[AI] CV screened with ${name} → Score: ${result.aiScore}`);
        return result;
      }
    } catch (e) { console.log(`[AI] ${name} failed: ${e.message}`); }
  }

  console.warn('[AI] All providers failed');
  return null;
}

// ── Score screening answers — TECHNICAL ONLY ─────────────────
// Score is based purely on technical accuracy and depth
// No soft skills, no motivation, no behavioral scoring
async function scoreScreeningAnswers(answers, candidateContext) {
  const { appliedFor = 'Software Engineer', topSkills = [], domain = '' } = candidateContext;

  const scoredAnswers = [];
  let totalScore = 0;

  for (const { question, answer } of answers) {
    let technicalScore = 0;
    let depthScore     = 0;
    let accuracyScore  = 0;
    let overallScore   = 0;
    let aiFeedback     = '';

    if (answer?.trim() && process.env.GROQ_API_KEY) {
      try {
        const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const prompt = `You are a Senior Technical Architect evaluating a candidate's technical answer.
Role: ${appliedFor}
Domain: ${domain || 'Software Engineering'}
Candidate's core skills: ${topSkills.slice(0,5).join(', ')||'not specified'}

Technical Question: ${question}
Candidate's Answer: ${answer}

Evaluate this answer PURELY on technical merit — not on communication style or soft skills.

SCORING CRITERIA:
1. technicalAccuracy (0-100): Is the answer technically correct? Are facts right? No wrong information?
   - 90+: Perfectly accurate, shows expert-level understanding
   - 70-89: Mostly correct with minor gaps
   - 50-69: Partially correct, some misconceptions
   - Below 50: Incorrect or shows fundamental misunderstanding

2. technicalDepth (0-100): Does the answer show real hands-on experience, not just theory?
   - 90+: Gives specific examples, mentions trade-offs, shows battle-tested knowledge
   - 70-89: Good explanation with some practical context
   - 50-69: Surface-level answer, textbook knowledge only
   - Below 50: Vague or generic answer, no real depth

3. roleRelevance (0-100): Is the answer relevant to the ${appliedFor} role requirements?
   - 90+: Directly addresses what this role needs
   - 70-89: Mostly relevant, minor tangents
   - 50-69: Somewhat relevant
   - Below 50: Off-topic or irrelevant to the role

Return ONLY valid JSON:
{
  "technicalAccuracy": 75,
  "technicalDepth": 70,
  "roleRelevance": 80,
  "overallScore": 75,
  "feedback": "One specific technical observation about this answer — what was strong or what was missing technically"
}`;

        const resp  = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role:'user', content:prompt }],
          temperature: 0.1, max_tokens: 250,
        });
        const text  = resp.choices[0].message.content.replace(/```json|```/g,'').trim();
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed  = JSON.parse(match[0]);
          technicalScore = parsed.technicalAccuracy || 0;
          depthScore     = parsed.technicalDepth    || 0;
          accuracyScore  = parsed.roleRelevance     || 0;
          // Weighted: accuracy 40% + depth 40% + relevance 20%
          overallScore = Math.round(
            (technicalScore * 0.40) +
            (depthScore     * 0.40) +
            (accuracyScore  * 0.20)
          );
          aiFeedback = (parsed.feedback || '').slice(0, 150);
        }
      } catch (e) { console.error('[answer scoring]', e.message); }
    }

    totalScore += overallScore;
    scoredAnswers.push({
      question:   question.slice(0, 200),
      aiScore:    overallScore,
      scoreBreakdown: {
        technical:    technicalScore,
        depth:        depthScore,
        relevance:    accuracyScore,
      },
      aiFeedback,
    });
  }

  const screeningScore = answers.length > 0
    ? Math.round(totalScore / answers.length)
    : 0;

  return { scoredAnswers, screeningScore };
}

async function callProvider(provider, apiKey, model, baseUrl, prompt) {
  switch (provider) {
    case 'groq':              return tryGroq(apiKey, model, prompt);
    case 'openai':
    case 'openai-compatible': return tryOpenAI(apiKey, model, baseUrl||'', prompt);
    case 'anthropic':         return tryAnthropic(apiKey, model, prompt);
    case 'gemini':            return tryGemini(apiKey, model, prompt);
    case 'huggingface':       return tryHuggingFace(apiKey, model, prompt);
    case 'ollama':            return tryOllama(baseUrl||'http://localhost:11434', model, prompt);
    default:                  return tryOpenAI(apiKey, model, baseUrl||'', prompt);
  }
}

async function tryGroq(apiKey, model, prompt) {
  if (!apiKey) return null;
  const groq = new Groq({ apiKey });
  const resp = await groq.chat.completions.create({
    model: model||'llama-3.3-70b-versatile',
    messages:[{ role:'user', content:prompt }],
    temperature:0.1, max_tokens:1200,
  });
  return parseJSON(resp.choices[0].message.content);
}

async function tryOpenAI(apiKey, model, baseUrl, prompt) {
  if (!apiKey) return null;
  const url = baseUrl ? `${baseUrl}/chat/completions` : 'https://api.openai.com/v1/chat/completions';
  const resp = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json', Authorization:`Bearer ${apiKey}`},
    body: JSON.stringify({ model:model||'gpt-4o-mini', messages:[{role:'user',content:prompt}], temperature:0.1, max_tokens:1200 }),
  });
  const data = await resp.json();
  if (!data.choices) throw new Error(data.error?.message||'No response');
  return parseJSON(data.choices[0].message.content);
}

async function tryAnthropic(apiKey, model, prompt) {
  if (!apiKey) return null;
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: model||'claude-haiku-4-5-20251001', max_tokens:1200,
    messages:[{role:'user',content:prompt}],
  });
  return parseJSON(msg.content[0].text);
}

async function tryGemini(apiKey, model, prompt) {
  if (!apiKey) return null;
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model||'gemini-1.5-flash'}:generateContent?key=${apiKey}`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.1,maxOutputTokens:1200} }),
  });
  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(data.error?.message||'No content');
  return parseJSON(text);
}

async function tryHuggingFace(apiKey, model, prompt) {
  if (!apiKey||!model) return null;
  const resp = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method:'POST',
    headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body: JSON.stringify({inputs:prompt,parameters:{max_new_tokens:1200,temperature:0.1}}),
  });
  const data = await resp.json();
  const text = Array.isArray(data)?data[0]?.generated_text:data.generated_text;
  if (!text) throw new Error('No response from HuggingFace');
  return parseJSON(text);
}

async function tryOllama(baseUrl, model, prompt) {
  if (!model) return null;
  const resp = await fetch(`${baseUrl}/api/chat`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({model,messages:[{role:'user',content:prompt}],stream:false}),
  });
  const data = await resp.json();
  return parseJSON(data.message?.content||'');
}

function parseJSON(text) {
  const cleaned = text.replace(/```json|```/g,'').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in response');
  return JSON.parse(match[0]);
}

module.exports = { screenResumeWithAI, scoreScreeningAnswers, calculateCVScore };
