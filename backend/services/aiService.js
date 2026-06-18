const Groq = require('groq-sdk');

/**
 * RECRUIT IQ — AI SERVICE
 * ========================
 * Thinking as: Senior Technical Recruiter + Hiring Manager + Recruiting Manager
 *
 * SCORING PHILOSOPHY:
 * - CV Score = Skills depth (70%) + Stability (30%)
 *   → Skills: Does the candidate ACTUALLY know the required tech? Not just listed it.
 *   → Stability: Are they reliable? Frequent job changes = risk.
 *
 * - Screening Score = Technical accuracy (40%) + Depth (40%) + Role relevance (20%)
 *   → Pure technical merit. No soft skills, no behavioral scoring.
 *
 * - Combined = CV (60%) + Screening (40%) — configurable per job
 *
 * RECOMMENDATION SCALE:
 * 85+ → Strong Hire   (Proceed immediately, strong technical fit)
 * 72-84 → Hire        (Good fit, proceed with confidence)
 * 58-71 → Consider    (Has potential but gaps — discuss with HM)
 * 42-57 → Weak Fit    (Significant gaps, proceed only if pipeline is thin)
 * <42  → Reject       (Not a fit for this role)
 */

// ── CV Analysis Prompt ────────────────────────────────────────
const PROMPT_TEMPLATE = (jobContext, rawText) => {
  const jobTitle       = typeof jobContext === 'string' ? jobContext : (jobContext.title || 'Software Engineer');
  const primarySkill   = typeof jobContext === 'object' ? (jobContext.primarySkill  || '') : '';
  const requiredSkills = typeof jobContext === 'object' ? (jobContext.requiredSkills || []) : [];
  const level          = typeof jobContext === 'object' ? (jobContext.level          || '') : '';

  return `You are a Senior Technical Recruiter with 15 years of experience. Analyze this CV for the role below.

═══════════════════════════════════════════
JOB REQUIREMENTS
═══════════════════════════════════════════
Role: ${jobTitle}
Level: ${level || 'Not specified'}
Primary Skill: ${primarySkill || 'Not specified'}
Required Skills: ${requiredSkills.join(', ') || 'Not specified'}

═══════════════════════════════════════════
SCORING RULES (READ CAREFULLY)
═══════════════════════════════════════════
${primarySkill ? `
CRITICAL: Primary skill "${primarySkill}" check:
- NOT present in CV at all → skillsMatchScore MAX 30, aiScore MAX 35
- Mentioned but not as core skill → skillsMatchScore MAX 55, aiScore MAX 60
- Present as secondary skill → skillsMatchScore MAX 70, aiScore MAX 72
- Present as primary skill → score based on depth and required skills match

Wrong domain penalty (e.g. Java dev applying for React role):
- Score 25-40 MAXIMUM regardless of experience level` : ''}

SKILLS MATCH (70% of CV score):
- Score the DEPTH of technical knowledge, not just presence of skill names
- 90+: Expert — multiple years with primary skill, production projects, advanced usage
- 75-89: Proficient — solid experience, good depth, minor gaps in required skills
- 60-74: Competent — has the skills but limited depth or missing some required
- 45-59: Basic — has primary skill but significant gaps in required skills
- Below 45: Missing primary skill or major skills mismatch

STABILITY (30% of CV score):
- 90+: 2.5+ years average tenure, no gaps
- 75-89: Mix of tenures, mostly 1.5+ years, one or two shorter stints with valid reason
- 60-74: Some short tenures (under 1 year) but overall reasonable
- Below 60: Multiple roles under 1 year — flight risk

═══════════════════════════════════════════
RISK FLAGS — detect from CV:
═══════════════════════════════════════════
- frequentJobChanges: true if 2+ consecutive roles under 1 year
- missingMandatorySkills: which required skills are clearly absent from CV
- domainMismatch: true if candidate's domain fundamentally doesn't match role

═══════════════════════════════════════════
HM SUMMARY — write as if briefing the Hiring Manager before interview:
═══════════════════════════════════════════
4-5 sentences covering:
1. Technical profile summary
2. Strongest technical areas
3. Key gaps or concerns
4. Stability assessment
5. Hire/No-hire rationale for THIS specific role

Return ONLY valid JSON, no markdown, no extra text:
{
  "name": "full name",
  "email": "email or empty string",
  "phone": "phone or empty string",
  "domain": "primary tech domain",
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
    "missingMandatorySkills": [],
    "domainMismatch": false
  },

  "summary": "2-3 sentences on technical fit for ${jobTitle}",
  "hmSummary": "4-5 sentence HM briefing as described above",

  "technicalExperience": "2-3 sentences about technical stack and projects",
  "leadershipExperience": "1-2 sentences or None mentioned",
  "cloudExpertise": "1-2 sentences or None mentioned",

  "databases":      ["PostgreSQL"],
  "frameworks":     ["Spring Boot"],
  "tools":          ["Docker","Git"],
  "projectDomains": ["Banking"],

  "strengths": ["Specific technical strength for this role","Another technical strength"],
  "gaps":      ["Specific gap vs role requirements","Another gap"],

  "skillScores": [
    {"skill": "${primarySkill || 'Primary Skill'}", "score": 85},
    {"skill": "Another key skill", "score": 70}
  ],

  "interviewFocusAreas": [
    "Probe ${primarySkill || 'primary skill'} depth — ask for specific production examples",
    "Technical area to explore further",
    "Gap area to validate"
  ],

  "recommendation": "Strong Hire or Hire or Consider or Weak Fit or Reject",
  "recommendationReason": "2-3 sentences on why this candidate fits or doesn't fit ${jobTitle}"
}

Resume:
${rawText.slice(0, 4500)}`;
};

// ── Calculate final CV score ─────────────────────────────────
// Skills: 70%, Stability: 30%
function calculateCVScore(breakdown) {
  if (!breakdown) return 0;
  const skills    = Math.min(100, Math.max(0, Number(breakdown.skillsMatchScore || 0)));
  const stability = Math.min(100, Math.max(0, Number(breakdown.stabilityScore   || 0)));
  return Math.round((skills * 0.70) + (stability * 0.30));
}

// ── Determine tier from CV score ─────────────────────────────
function determineTier(score) {
  if (score >= 78) return 'A-Tier';
  if (score >= 60) return 'B-Tier';
  return 'C-Tier';
}

// ── Get AI providers from DB ─────────────────────────────────
async function getProvidersFromDB() {
  try {
    const Settings = require('../models/Settings');
    const settings = await Settings.findOne();
    if (settings?.aiProviders?.length) {
      const active = settings.aiProviders
        .filter(p => p.enabled && (p.apiKey || p.provider === 'ollama'))
        .sort((a, b) => a.priority - b.priority);
      if (active.length) {
        console.log(`[AI] DB providers: ${active.map(p => p.name).join(', ')}`);
        return active;
      }
    }
  } catch (e) { console.log('[AI] DB provider load failed:', e.message); }
  return null;
}

// ── Main CV screening ────────────────────────────────────────
async function screenResumeWithAI(rawText, jobContext) {
  const prompt = PROMPT_TEMPLATE(jobContext, rawText);

  const dbProviders = await getProvidersFromDB();
  if (dbProviders?.length) {
    for (const p of dbProviders) {
      try {
        const result = await callProvider(p.provider, p.apiKey, p.model, p.baseUrl, prompt);
        if (result) {
          if (result.cvScoreBreakdown) {
            result.aiScore = calculateCVScore(result.cvScoreBreakdown);
          }
          result.tier = determineTier(result.aiScore);
          console.log(`[AI] CV screened with ${p.name} → Score: ${result.aiScore} (${result.tier})`);
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
        result.tier = determineTier(result.aiScore);
        console.log(`[AI] CV screened with ${name} → Score: ${result.aiScore} (${result.tier})`);
        return result;
      }
    } catch (e) { console.log(`[AI] ${name} failed: ${e.message}`); }
  }

  console.warn('[AI] All providers failed — CV screening returned null');
  return null;
}

// ── Score interview answers — TECHNICAL ONLY ─────────────────
// Criteria:
//   Technical Accuracy (40%): Are facts correct? No misconceptions?
//   Technical Depth (40%): Shows real hands-on knowledge, not textbook?
//   Role Relevance (20%): Answer relevant to what THIS role needs?
async function scoreScreeningAnswers(answers, candidateContext) {
  const { appliedFor = 'Software Engineer', topSkills = [], domain = '' } = candidateContext;
  const scoredAnswers = [];
  let totalScore = 0;

  for (const { question, answer } of answers) {
    let accuracy  = 0;
    let depth     = 0;
    let relevance = 0;
    let overall   = 0;
    let feedback  = '';

    if (answer?.trim() && process.env.GROQ_API_KEY) {
      try {
        const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const prompt = `You are a Principal Engineer conducting a technical interview.
Evaluate this answer on TECHNICAL MERIT ONLY.

Role: ${appliedFor}
Domain: ${domain || 'Software Engineering'}
Candidate core skills: ${topSkills.slice(0,5).join(', ')||'Not specified'}

Question: ${question}
Answer: ${answer}

Score on 3 technical dimensions:

1. technicalAccuracy (0-100):
   - Is the answer factually correct? No wrong information?
   - 90+: Expert-level accuracy, no mistakes
   - 70-89: Mostly correct, minor gaps acceptable
   - 50-69: Partially correct, some technical errors
   - Below 50: Incorrect facts or fundamental misunderstanding

2. technicalDepth (0-100):
   - Does the answer demonstrate REAL hands-on experience?
   - 90+: Gives specific examples, mentions edge cases, trade-offs, production experience
   - 70-89: Good explanation with practical context
   - 50-69: Surface level, sounds like textbook knowledge
   - Below 50: Vague, generic, no real depth shown

3. roleRelevance (0-100):
   - Is this answer relevant to what ${appliedFor} needs?
   - 90+: Directly addresses the role requirements
   - 70-89: Mostly on-target
   - Below 60: Misses the point for this role

IMPORTANT: Do NOT score on communication style, grammar, or enthusiasm.
Only evaluate technical content.

Return ONLY valid JSON:
{
  "technicalAccuracy": 75,
  "technicalDepth": 70,
  "roleRelevance": 80,
  "overallScore": 74,
  "feedback": "One specific technical observation — what was strong or what technical concept was missing/wrong"
}`;

        const resp = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role:'user', content:prompt }],
          temperature: 0.1, max_tokens: 250,
        });
        const text  = resp.choices[0].message.content.replace(/```json|```/g,'').trim();
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const p  = JSON.parse(match[0]);
          accuracy  = Math.min(100, Math.max(0, Number(p.technicalAccuracy || 0)));
          depth     = Math.min(100, Math.max(0, Number(p.technicalDepth    || 0)));
          relevance = Math.min(100, Math.max(0, Number(p.roleRelevance     || 0)));
          overall   = Math.round((accuracy * 0.40) + (depth * 0.40) + (relevance * 0.20));
          feedback  = (p.feedback || '').slice(0, 150);
        }
      } catch (e) { console.error('[answer scoring]', e.message); }
    }

    totalScore += overall;
    scoredAnswers.push({
      question:      question.slice(0, 200),
      aiScore:       overall,
      scoreBreakdown:{ technical: accuracy, depth, relevance },
      aiFeedback:    feedback,
    });
  }

  const screeningScore = answers.length > 0
    ? Math.round(totalScore / answers.length)
    : 0;

  return { scoredAnswers, screeningScore };
}

// ── Provider functions ────────────────────────────────────────
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
    temperature: 0.1, max_tokens: 1500,
  });
  return parseJSON(resp.choices[0].message.content);
}

async function tryOpenAI(apiKey, model, baseUrl, prompt) {
  if (!apiKey) return null;
  const url = baseUrl ? `${baseUrl}/chat/completions` : 'https://api.openai.com/v1/chat/completions';
  const resp = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json', Authorization:`Bearer ${apiKey}`},
    body: JSON.stringify({ model:model||'gpt-4o-mini', messages:[{role:'user',content:prompt}], temperature:0.1, max_tokens:1500 }),
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
    model: model||'claude-haiku-4-5-20251001', max_tokens:1500,
    messages:[{role:'user',content:prompt}],
  });
  return parseJSON(msg.content[0].text);
}

async function tryGemini(apiKey, model, prompt) {
  if (!apiKey) return null;
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model||'gemini-1.5-flash'}:generateContent?key=${apiKey}`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.1,maxOutputTokens:1500} }),
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
    body: JSON.stringify({inputs:prompt,parameters:{max_new_tokens:1500,temperature:0.1}}),
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
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]);
}

module.exports = { screenResumeWithAI, scoreScreeningAnswers, calculateCVScore, determineTier };
