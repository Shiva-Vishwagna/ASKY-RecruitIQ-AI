const Groq = require('groq-sdk');

/**
 * RECRUIT IQ — AI SERVICE
 * ========================
 * Supports two job types:
 *
 * TECHNICAL (IT/Engineering):
 *   CV Score    = Skills depth (70%) + Stability (30%)
 *   Screening   = Technical accuracy (40%) + Technical depth (40%) + Role relevance (20%)
 *
 * NON-TECHNICAL (Sales, Travel, HR, Ops, Marketing etc):
 *   CV Score    = Experience relevance (60%) + Stability (40%)
 *   Screening   = Domain knowledge (30%) + Communication & clarity (30%) +
 *                 Problem solving (20%) + Role understanding (20%)
 *
 * Combined = CV (60%) + Screening (40%) — configurable per job
 *
 * Recommendation scale (same for both):
 *   85+ Strong Hire · 72+ Hire · 58+ Consider · 42+ Weak Fit · <42 Reject
 */

// ── CV Analysis Prompt ────────────────────────────────────────
const CV_PROMPT = (jobContext, rawText) => {
  const jobTitle    = typeof jobContext === 'string' ? jobContext : (jobContext.title || 'Professional');
  const roleType    = typeof jobContext === 'object'  ? (jobContext.roleType || 'technical') : 'technical';
  const primarySkill  = typeof jobContext === 'object' ? (jobContext.primarySkill  || '') : '';
  const requiredSkills = typeof jobContext === 'object' ? (jobContext.requiredSkills || []) : [];
  const level          = typeof jobContext === 'object' ? (jobContext.level || '') : '';
  const isTech = roleType !== 'non_technical';

  const scoringInstructions = isTech ? `
ROLE TYPE: TECHNICAL / IT
CV SCORING — 2 factors:

1. skillsMatchScore (70%): Depth of technical knowledge vs requirements
   - NOT just whether skills are mentioned — check actual usage and depth
   - 90+: Expert in primary skill + all required skills, production projects
   - 70-89: Proficient, solid experience, minor gaps
   - 50-69: Has primary skill but gaps in required skills
   - Below 50: Missing primary skill or major mismatch

2. stabilityScore (30%): Job tenure reliability
   - 90+: 2.5+ years average, no gaps
   - 70-89: Mostly stable, one or two short stints with reason
   - 50-69: Some short tenures (<1 year)
   - Below 50: Multiple roles under 6 months (flight risk)

${primarySkill ? `CRITICAL: "${primarySkill}" is primary skill. Not present → aiScore MAX 35. Wrong domain → MAX 45.` : ''}
` : `
ROLE TYPE: NON-TECHNICAL (${jobTitle})
This is NOT an IT/engineering role. Evaluate domain experience and soft competencies.

CV SCORING — 2 factors:

1. experienceRelevanceScore (60%): How relevant is the candidate's work experience to THIS role?
   - Evaluate industry match, job function match, and seniority appropriateness
   - 90+: Direct experience in same role/industry, strong track record
   - 70-89: Related experience, transferable skills, good domain knowledge
   - 50-69: Some relevant experience but significant gaps
   - Below 50: Mostly unrelated experience

2. stabilityScore (40%): Job tenure and career progression
   - 90+: Consistent tenure 2+ years, clear career progression
   - 70-89: Mostly stable, one or two moves are understandable
   - Below 60: Frequent job changes with no clear career arc

IMPORTANT: Do NOT penalize for not having IT/technical skills. This is a ${jobTitle} role.
`;

  return `You are a Senior Talent Acquisition expert. Analyze this CV for the specific role below.

ROLE: ${jobTitle}
${level ? `LEVEL: ${level}` : ''}
${primarySkill ? `PRIMARY SKILL/FOCUS: ${primarySkill}` : ''}
${requiredSkills.length ? `REQUIREMENTS: ${requiredSkills.join(', ')}` : ''}

${scoringInstructions}

RISK FLAGS to detect:
- frequentJobChanges: true if 2+ consecutive roles under 1 year
- missingMandatorySkills: list requirements clearly absent from CV
- domainMismatch: true if candidate background fundamentally doesn't match role

HM SUMMARY: Write 4-5 sentences as a briefing to the Hiring Manager covering:
1. What this candidate has done and their background
2. Strongest relevant areas for THIS role
3. Key gaps or concerns
4. Stability / career progression assessment
5. Clear hire/no-hire rationale

Return ONLY valid JSON, no markdown, no extra text:
{
  "name": "full name",
  "email": "email or empty string",
  "phone": "phone or empty string",
  "domain": "primary domain e.g. Java Backend, Travel & Hospitality, Sales",
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

  "summary": "2-3 sentences on fit for ${jobTitle}",
  "hmSummary": "4-5 sentence HM briefing as described above",

  "technicalExperience": "2-3 sentences about experience and projects",
  "leadershipExperience": "1-2 sentences or None mentioned",
  "cloudExpertise": "1-2 sentences or None mentioned",

  "databases":      [],
  "frameworks":     [],
  "tools":          [],
  "projectDomains": [],

  "strengths": ["Relevant strength 1","Relevant strength 2"],
  "gaps":      ["Gap 1 vs role requirements","Gap 2"],

  "skillScores": [
    {"skill": "${primarySkill || 'Key Skill'}", "score": 85}
  ],

  "interviewFocusAreas": [
    "Area to probe in HM interview",
    "Gap to validate",
    "Experience to verify"
  ],

  "recommendation": "Strong Hire or Hire or Consider or Weak Fit or Reject",
  "recommendationReason": "2-3 sentences on why this candidate fits or doesn't"
}

Resume text:
${rawText.slice(0, 4500)}`;
};

// ── Calculate CV score ────────────────────────────────────────
function calculateCVScore(breakdown, roleType) {
  if (!breakdown) return 0;
  const isTech = roleType !== 'non_technical';

  if (isTech) {
    // Technical: skills(70%) + stability(30%)
    const skills    = Math.min(100, Math.max(0, Number(breakdown.skillsMatchScore || 0)));
    const stability = Math.min(100, Math.max(0, Number(breakdown.stabilityScore   || 0)));
    return Math.round((skills * 0.70) + (stability * 0.30));
  } else {
    // Non-technical: experience relevance(60%) + stability(40%)
    // Use skillsMatchScore field to store experience relevance for consistency
    const experience = Math.min(100, Math.max(0, Number(breakdown.skillsMatchScore || 0)));
    const stability  = Math.min(100, Math.max(0, Number(breakdown.stabilityScore   || 0)));
    return Math.round((experience * 0.60) + (stability * 0.40));
  }
}

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
      if (active.length) return active;
    }
  } catch (e) { /* ignore */ }
  return null;
}

// ── Main CV screening ─────────────────────────────────────────
async function screenResumeWithAI(rawText, jobContext) {
  const prompt = CV_PROMPT(jobContext, rawText);
  const roleType = typeof jobContext === 'object' ? (jobContext.roleType || 'technical') : 'technical';

  const dbProviders = await getProvidersFromDB();
  if (dbProviders?.length) {
    for (const p of dbProviders) {
      try {
        const result = await callProvider(p.provider, p.apiKey, p.model, p.baseUrl, prompt);
        if (result) {
          result.aiScore = calculateCVScore(result.cvScoreBreakdown, roleType);
          result.tier    = determineTier(result.aiScore);
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
        result.aiScore = calculateCVScore(result.cvScoreBreakdown, roleType);
        result.tier    = determineTier(result.aiScore);
        console.log(`[AI] CV screened with ${name} → ${result.aiScore} (${result.tier})`);
        return result;
      }
    } catch (e) { console.log(`[AI] ${name} failed: ${e.message}`); }
  }

  console.warn('[AI] All providers failed');
  return null;
}

// ── Score screening answers ───────────────────────────────────
// Technical roles: accuracy + depth + relevance
// Non-technical roles: domain knowledge + communication + problem solving + role understanding
async function scoreScreeningAnswers(answers, candidateContext) {
  const { appliedFor = 'Professional', topSkills = [], domain = '', roleType = 'technical' } = candidateContext;
  const isTech  = roleType !== 'non_technical';
  const scoredAnswers = [];
  let totalScore = 0;

  for (const { question, answer } of answers) {
    let score1 = 0, score2 = 0, score3 = 0, score4 = 0;
    let overall = 0, feedback = '';

    if (answer?.trim() && process.env.GROQ_API_KEY) {
      try {
        const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY });

        const prompt = isTech ? `You are a Principal Engineer evaluating a technical interview answer.
Role: ${appliedFor} | Skills: ${topSkills.slice(0,5).join(', ')||'Software Engineering'}

Question: ${question}
Answer: ${answer}

Score PURELY on technical merit — not communication style:
1. technicalAccuracy (0-100): Are facts correct? No wrong information?
2. technicalDepth (0-100): Real hands-on experience vs textbook knowledge?
3. roleRelevance (0-100): Does this answer apply to the ${appliedFor} role specifically?

Return ONLY valid JSON:
{"technicalAccuracy":75,"technicalDepth":70,"roleRelevance":80,"feedback":"One specific technical observation"}`

: `You are an experienced HR/Functional interviewer evaluating a candidate for a ${appliedFor} role.
Domain: ${domain || appliedFor} | Key skills: ${topSkills.slice(0,5).join(', ')||appliedFor}

Question: ${question}
Answer: ${answer}

Score the answer quality for a NON-TECHNICAL role (NOT an IT role):
1. domainKnowledge (0-100): Does the candidate understand the domain/industry for this role?
2. communicationClarity (0-100): Is the answer clear, structured, and professional?
3. problemSolving (0-100): Does the answer show logical thinking and initiative?
4. roleUnderstanding (0-100): Does the candidate understand what this role requires?

Return ONLY valid JSON:
{"domainKnowledge":75,"communicationClarity":80,"problemSolving":70,"roleUnderstanding":75,"feedback":"One specific observation about this answer"}`;

        const resp  = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role:'user', content:prompt }],
          temperature: 0.1, max_tokens: 200,
        });
        const text  = resp.choices[0].message.content.replace(/```json|```/g,'').trim();
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const p = JSON.parse(match[0]);
          feedback = (p.feedback || '').slice(0, 200);

          if (isTech) {
            score1 = Math.min(100, Math.max(0, Number(p.technicalAccuracy || 0)));
            score2 = Math.min(100, Math.max(0, Number(p.technicalDepth    || 0)));
            score3 = Math.min(100, Math.max(0, Number(p.roleRelevance     || 0)));
            // Technical: accuracy(40%) + depth(40%) + relevance(20%)
            overall = Math.round((score1 * 0.40) + (score2 * 0.40) + (score3 * 0.20));
          } else {
            score1 = Math.min(100, Math.max(0, Number(p.domainKnowledge      || 0)));
            score2 = Math.min(100, Math.max(0, Number(p.communicationClarity || 0)));
            score3 = Math.min(100, Math.max(0, Number(p.problemSolving       || 0)));
            score4 = Math.min(100, Math.max(0, Number(p.roleUnderstanding    || 0)));
            // Non-technical: domain(30%) + communication(30%) + problem(20%) + role(20%)
            overall = Math.round((score1 * 0.30) + (score2 * 0.30) + (score3 * 0.20) + (score4 * 0.20));
          }
        }
      } catch (e) { console.error('[answer scoring]', e.message); }
    }

    totalScore += overall;
    scoredAnswers.push({
      question:       question.slice(0, 400),
      aiScore:        overall,
      scoreBreakdown: isTech
        ? { technical: score1, depth: score2, relevance: score3 }
        : { domain: score1, communication: score2, problemSolving: score3, roleUnderstanding: score4 },
      aiFeedback: feedback,
    });
  }

  const screeningScore = answers.length > 0 ? Math.round(totalScore / answers.length) : 0;
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
    temperature:0.1, max_tokens:1500,
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
  if (!text) throw new Error('No HuggingFace response');
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
