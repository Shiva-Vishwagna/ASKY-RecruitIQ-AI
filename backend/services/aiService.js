const Groq = require('groq-sdk');

// ── Enhanced CV scoring prompt with 6 weighted criteria ──────
const PROMPT_TEMPLATE = (jobContext, rawText) => {
  const jobTitle       = typeof jobContext === 'string' ? jobContext : (jobContext.title || 'Software Engineer');
  const primarySkill   = typeof jobContext === 'object' ? (jobContext.primarySkill  || '') : '';
  const requiredSkills = typeof jobContext === 'object' ? (jobContext.requiredSkills || []) : [];
  const level          = typeof jobContext === 'object' ? (jobContext.level          || '') : '';

  const skillMatchRules = primarySkill ? `
CRITICAL SCORING RULES:
- Primary skill required: "${primarySkill}"
- Required skills: ${requiredSkills.length ? requiredSkills.join(', ') : 'not specified'}
- If candidate does NOT have "${primarySkill}", aiScore MUST be 40 or below
- If candidate has "${primarySkill}" but missing most required skills, cap at 65
- Only give 75+ if candidate clearly has "${primarySkill}" AND most required skills
- Only give 85+ if candidate is strong in "${primarySkill}" AND matches all required skills AND level
- A strong Java developer applying for a React role scores 30-45 MAX` : '';

  return `You are a senior Talent Acquisition expert evaluating a candidate for a specific role.
Perform a comprehensive CV analysis using weighted scoring criteria.

Job Title: ${jobTitle}${level ? `\nLevel Required: ${level}` : ''}${primarySkill ? `\nPrimary Skill: ${primarySkill}` : ''}${requiredSkills.length ? `\nRequired Skills: ${requiredSkills.join(', ')}` : ''}
${skillMatchRules}

CV SCORING BREAKDOWN (must add logic for each):
1. skillsMatchScore (30%): How well do candidate skills match required/preferred skills?
2. experienceScore (25%): Is years and type of experience relevant to this role?
3. domainScore (15%): Does candidate's domain/industry match the role's domain?
4. educationScore (10%): Does education/certification match requirements?
5. projectRelevanceScore (10%): Are past projects relevant to this role?
6. stabilityScore (10%): Is tenure stable? Penalize if frequent job changes (<1yr each).

RISK FLAGS to detect:
- frequentJobChanges: true if 2+ jobs with <1 year tenure
- noticePeriodRisk: mention if notice period seems long (>60 days) or unclear
- missingMandatorySkills: list skills from required that are clearly missing
- domainMismatch: true if candidate domain doesn't match job domain

Analyze the resume and return ONLY valid JSON — no extra text, no markdown:
{
  "name": "full name",
  "email": "email or empty string",
  "phone": "phone or empty string",
  "domain": "primary tech domain e.g. Java Backend, React Frontend",
  "seniority": "Junior or Mid or Senior or Lead",
  "experience_years": 5,
  "topSkills": ["skill1","skill2","skill3","skill4","skill5"],

  "primarySkillMatch": true,
  "primarySkillScore": 85,
  "jobFitScore": 78,

  "cvScoreBreakdown": {
    "skillsMatchScore": 85,
    "experienceScore": 80,
    "domainScore": 75,
    "educationScore": 70,
    "projectRelevanceScore": 80,
    "stabilityScore": 85
  },

  "aiScore": 80,
  "tier": "A-Tier or B-Tier or C-Tier",
  "riskLevel": "low or medium or high",

  "riskFlags": {
    "frequentJobChanges": false,
    "noticePeriodRisk": "Not mentioned",
    "missingMandatorySkills": ["skill1","skill2"],
    "domainMismatch": false
  },

  "summary": "2-3 sentence CV overview mentioning job fit",
  "hmSummary": "3-5 sentence hiring manager summary: why this candidate is or isn't suitable for ${jobTitle}. Mention specific strengths, concerns, and a clear recommendation rationale.",

  "technicalExperience":  "2-3 sentences about technical stack",
  "leadershipExperience": "1-2 sentences or None mentioned",
  "cloudExpertise":       "1-2 sentences or None mentioned",

  "databases":      ["PostgreSQL","MongoDB"],
  "frameworks":     ["Spring Boot","React"],
  "tools":          ["Docker","Jenkins","Git"],
  "projectDomains": ["Telecom","Banking"],

  "strengths": ["strength 1 specific to this role","strength 2","strength 3"],
  "gaps":      ["gap 1 vs requirements","gap 2"],

  "skillScores": [
    {"skill":"${primarySkill || 'Primary Skill'}","score":85},
    {"skill":"Secondary Skill","score":70}
  ],

  "interviewFocusAreas": ["Focus area 1 for HM interview","Focus area 2","Focus area 3"],

  "recommendation": "Strong Hire or Hire or Consider or Weak Fit or Reject",
  "recommendationReason": "2-3 sentence explanation for ${jobTitle}"
}

Resume:
${rawText.slice(0, 4000)}`;
};

// ── Calculate weighted CV score from breakdown ────────────────
function calculateCVScore(breakdown) {
  if (!breakdown) return 0;
  const weights = {
    skillsMatchScore:      0.30,
    experienceScore:       0.25,
    domainScore:           0.15,
    educationScore:        0.10,
    projectRelevanceScore: 0.10,
    stabilityScore:        0.10,
  };
  let total = 0;
  for (const [key, weight] of Object.entries(weights)) {
    total += (breakdown[key] || 0) * weight;
  }
  return Math.round(total);
}

async function getProvidersFromDB() {
  try {
    const Settings = require('../models/Settings');
    const settings = await Settings.findOne();
    if (settings?.aiProviders?.length) {
      const active = settings.aiProviders
        .filter(p => p.enabled && (p.apiKey || p.provider === 'ollama'))
        .sort((a, b) => a.priority - b.priority);
      if (active.length) {
        console.log(`[AI] Found ${active.length} active providers: ${active.map(p => p.name).join(', ')}`);
        return active;
      }
    }
  } catch (e) { console.log('[AI] DB provider load failed:', e.message); }
  return null;
}

async function screenResumeWithAI(rawText, jobContext) {
  const prompt = PROMPT_TEMPLATE(jobContext, rawText);

  const dbProviders = await getProvidersFromDB();
  if (dbProviders?.length) {
    for (const p of dbProviders) {
      try {
        const result = await callProvider(p.provider, p.apiKey, p.model, p.baseUrl, prompt);
        if (result) {
          result.aiScore = calculateCVScore(result.cvScoreBreakdown) || result.aiScore || 0;
          console.log(`[AI] Screened with ${p.name}, CV Score: ${result.aiScore}`);
          return result;
        }
      } catch (e) { console.log(`[AI] ${p.name} failed: ${e.message}`); }
    }
  }

  const envProviders = [
    { name:'Groq (env)',      fn: () => tryGroq(process.env.GROQ_API_KEY, 'llama-3.3-70b-versatile', prompt) },
    { name:'OpenAI (env)',    fn: () => tryOpenAI(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL||'gpt-4o-mini', '', prompt) },
    { name:'Anthropic (env)', fn: () => tryAnthropic(process.env.CLAUDE_API_KEY, 'claude-haiku-4-5-20251001', prompt) },
    { name:'Gemini (env)',    fn: () => tryGemini(process.env.GEMINI_API_KEY, 'gemini-1.5-flash', prompt) },
  ];
  for (const { name, fn } of envProviders) {
    try {
      const result = await fn();
      if (result) {
        result.aiScore = calculateCVScore(result.cvScoreBreakdown) || result.aiScore || 0;
        console.log(`[AI] Screened with ${name}, CV Score: ${result.aiScore}`);
        return result;
      }
    } catch (e) { console.log(`[AI] ${name} failed: ${e.message}`); }
  }

  console.warn('[AI] All providers failed');
  return null;
}

// ── Score screening answers with 5 criteria ──────────────────
async function scoreScreeningAnswers(answers, candidateContext) {
  const { appliedFor = 'Software Engineer', topSkills = [] } = candidateContext;

  const scoredAnswers = [];
  let totalScore = 0;

  for (const { question, answer } of answers) {
    let scores = { technical: 0, communication: 0, problemSolving: 0, roleUnderstanding: 0, motivation: 0 };
    let overallScore = 0;
    let aiFeedback = '';

    if (answer?.trim() && process.env.GROQ_API_KEY) {
      try {
        const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const prompt = `You are a senior interviewer scoring a candidate's answer for a ${appliedFor} role.
Candidate skills: ${topSkills.slice(0,5).join(', ')||'general'}

Question: ${question}
Answer: ${answer}

Score the answer across 5 dimensions (0-100 each):
1. technicalScore: Depth of technical knowledge demonstrated (not just keyword mention)
2. communicationScore: Clarity, structure, and articulation of the answer
3. problemSolvingScore: Problem-solving approach and logical thinking shown
4. roleUnderstandingScore: Understanding of the role requirements and context
5. motivationScore: Enthusiasm, availability fit, and motivation clarity

Return ONLY valid JSON:
{
  "technicalScore": 75,
  "communicationScore": 80,
  "problemSolvingScore": 70,
  "roleUnderstandingScore": 75,
  "motivationScore": 80,
  "overallScore": 76,
  "feedback": "One sentence of specific, actionable feedback about this answer"
}`;

        const resp  = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role:'user', content:prompt }],
          temperature: 0.1, max_tokens: 200,
        });
        const text  = resp.choices[0].message.content.replace(/```json|```/g,'').trim();
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          scores = {
            technical:        parsed.technicalScore        || 0,
            communication:    parsed.communicationScore    || 0,
            problemSolving:   parsed.problemSolvingScore   || 0,
            roleUnderstanding:parsed.roleUnderstandingScore|| 0,
            motivation:       parsed.motivationScore       || 0,
          };
          // Weighted screening score per answer
          overallScore = Math.round(
            scores.technical         * 0.40 +
            scores.communication     * 0.20 +
            scores.problemSolving    * 0.15 +
            scores.roleUnderstanding * 0.15 +
            scores.motivation        * 0.10
          );
          aiFeedback = (parsed.feedback || '').slice(0, 150);
        }
      } catch (e) { console.error('[screening score]', e.message); }
    }

    totalScore += overallScore;
    scoredAnswers.push({
      question:         question.slice(0, 200),
      aiScore:          overallScore,
      scoreBreakdown:   scores,
      aiFeedback,
    });
  }

  const screeningScore = answers.length > 0 ? Math.round(totalScore / answers.length) : 0;
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
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]);
}

module.exports = { screenResumeWithAI, scoreScreeningAnswers, calculateCVScore };
