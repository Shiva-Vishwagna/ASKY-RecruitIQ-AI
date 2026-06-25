/**
 * RECRUIT IQ — AI SERVICE (COMPLETE VERSION)
 * ========================
 * Handles all AI operations using Groq API via direct HTTP
 */

// ─────────────────────────────────────────────────────────────────
// MULTI-PROVIDER AI SYSTEM
// Uses multiAiProviders.js — supports 10+ providers with auto-fallback
// ─────────────────────────────────────────────────────────────────
const { callWithFallback } = require('./multiAiProviders');

// Calls multiAiProviders chain - auto-fallback across 16 providers
async function callGroq(messages, maxTokens = 2000) {
  return callWithFallback(messages, maxTokens);
}

// ─────────────────────────────────────────────────────────────────
// SCREEN RESUME WITH AI
// ─────────────────────────────────────────────────────────────────
async function screenResumeWithAI(resumeText, jobContext = {}) {
  if (!process.env.GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY not set');
    return null;
  }

  try {
    const isStr = typeof jobContext === 'string';
    const jobTitle = isStr ? jobContext : (jobContext.title || 'Professional');
    const roleType = isStr ? 'technical' : (jobContext.roleType || 'technical');
    const primarySkill = isStr ? '' : (jobContext.primarySkill || '');
    const requiredSkills = isStr ? [] : (jobContext.requiredSkills || []);
    const jobLevel = isStr ? '' : (jobContext.level || '');
    const isTech = roleType !== 'non_technical';

    // Build the scoring prompt
    const scoring = isTech ? `
ROLE TYPE: TECHNICAL / IT

SCORING — 2 factors:
1. skillsMatchScore (0-100) — weight 70%
   Depth of technical knowledge vs job requirements.
   90+: Expert in primary skill + all required skills
   70-89: Proficient, good depth, minor gaps
   50-69: Has primary skill but missing several
   Below 50: Primary skill missing or wrong domain
   ${primarySkill ? `CRITICAL: Primary skill is "${primarySkill}". If NOT in CV → max 35.` : ''}

2. stabilityScore (0-100) — weight 30%
   Reliability based on job tenure and career stability.
   90+: 2.5+ years average per role, consistent career
   70-89: Mostly stable, 1.5-2.5 yrs average per role
   50-69: Some roles under 1 year, some job hopping
   Below 50: Multiple roles under 6 months, frequent changes
   
   IMPORTANT: Count total companies worked at and flag any company 
   where tenure was less than 2 years as a stability risk (frequentJobChanges: true if 2+ such companies)
` : `
ROLE TYPE: NON-TECHNICAL

SCORING — 2 factors:
1. skillsMatchScore (0-100) — weight 60% — EXPERIENCE RELEVANCE
   How closely does the candidate's experience match this role/industry?
   90+: Same role, same industry, strong track record
   70-89: Related experience, transferable skills
   50-69: Some relevant experience but gaps
   Below 50: Mostly unrelated background

2. stabilityScore (0-100) — weight 40%
   Career progression and reliability.
   90+: Consistent tenure, clear progression
   70-89: Mostly stable career
   Below 60: Frequent unexplained changes
`;

    const prompt = `You are a Senior Talent Acquisition expert. Analyze this CV for the role.

CRITICAL NAME EXTRACTION RULE:
- Extract ONLY the actual person's name from the CV content
- Do NOT use the filename as the name
- The name is usually at the top of the CV, often the largest text
- If you cannot find a clear name, return "Unknown Candidate"
- Common patterns: "John Smith", "PRIYA SHARMA", "Rajesh Kumar"
- Ignore job titles, company names, years of experience in the name field

JOB: ${jobTitle}${jobLevel ? `\nLEVEL: ${jobLevel}` : ''}${primarySkill ? `\nPRIMARY SKILL: ${primarySkill}` : ''}${requiredSkills.length ? `\nREQUIREMENTS: ${requiredSkills.join(', ')}` : ''}

${scoring}

RISK FLAGS to identify:
- frequentJobChanges: true if 2+ consecutive roles lasted under 1 year
- missingMandatorySkills: array of required skills clearly absent
- domainMismatch: true if background doesn't match role

HM SUMMARY (4-5 sentences):
For hiring manager: background, strengths, gaps, stability, hire/no-hire rationale.

Return ONLY valid JSON. No markdown. Start with { and end with }

{
  "name": "full name from resume — extract from CV text, NOT from filename",
  "email": "email or empty string",
  "phone": "phone or empty string",
  "domain": "primary domain",
  "seniority": "Junior or Mid or Senior or Lead",
  "experience_years": 5,
  "topSkills": ["skill1","skill2","skill3","skill4","skill5"],
  "primarySkillMatch": true,
  "primarySkillScore": 85,
  "jobFitScore": 80,
  "cvScoreBreakdown": {
    "skillsMatchScore": 85,
    "stabilityScore": 90
  },
  "tier": "A-Tier",
  "riskLevel": "low",
  "riskFlags": {
    "frequentJobChanges": false,
    "noticePeriodRisk": "",
    "missingMandatorySkills": [],
    "domainMismatch": false
  },
  "companiesWorkedAt": 3,
  "shortTenureCompanies": ["CompanyA (8 months)", "CompanyB (1.2 years)"],
  "averageTenureYears": 1.8,
  "summary": "Brief 2-3 line summary of candidate",
  "hmSummary": "HM summary here",
  "technicalExperience": "Technical background details",
  "leadershipExperience": "Leadership details or empty",
  "cloudExpertise": "Cloud skills or empty",
  "recommendation": "Strong Hire",
  "recommendationReason": "Why hire or not",
  "interviewFocusAreas": ["area1", "area2"],
  "strengths": ["strength1", "strength2"],
  "gaps": ["gap1", "gap2"],
  "databases": ["db1", "db2"],
  "frameworks": ["fw1", "fw2"],
  "tools": ["tool1", "tool2"],
  "projectDomains": ["domain1"],
  "skillScores": [{"skill": "skill1", "score": 85}]
}`;

    const response = await callGroq([
      {
        role: 'user',
        content: `${prompt}\n\nREVENAL TEXT:\n${resumeText.substring(0, 8000)}`
      }
    ], 2000);
    
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[screenResumeWithAI] Could not extract JSON from response');
      return null;
    }

    const result = JSON.parse(jsonMatch[0]);
    return result;
  } catch (err) {
    console.error('[screenResumeWithAI]', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// CALCULATE CV SCORE
// ─────────────────────────────────────────────────────────────────
function calculateCVScore(breakdown, roleType = 'technical', domainMismatch = false) {
  if (!breakdown) return 0;

  const isTech = roleType !== 'non_technical';
  const skillWeight = isTech ? 0.7 : 0.6;
  const stabilityWeight = isTech ? 0.3 : 0.4;

  const skillScore = Math.min(breakdown.skillsMatchScore || 0, 100);
  const stabilityScore = Math.min(breakdown.stabilityScore || 0, 100);

  let score = Math.round(skillScore * skillWeight + stabilityScore * stabilityWeight);

  // Domain mismatch penalty — heavy penalty when candidate background doesn't match role type
  // e.g. Technical candidate for Non-Technical role or vice versa
  if (domainMismatch) {
    score = Math.round(score * 0.5); // 50% penalty for domain mismatch
    console.log(`[calculateCVScore] Domain mismatch penalty applied: ${score * 2} → ${score}`);
  }

  return Math.min(score, 100);
}

// ─────────────────────────────────────────────────────────────────
// DETERMINE TIER
// ─────────────────────────────────────────────────────────────────
function determineTier(score) {
  if (score >= 85) return 'A-Tier';
  if (score >= 70) return 'B-Tier';
  if (score >= 50) return 'C-Tier';
  return 'D-Tier';
}

// ─────────────────────────────────────────────────────────────────
// GENERATE INTERVIEW QUESTIONS
// ─────────────────────────────────────────────────────────────────
async function generateInterviewQuestions(config = {}) {
  if (!process.env.GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY not set');
    throw new Error('GROQ_API_KEY not configured');
  }

  const {
    candidateName = 'Candidate',
    skills = [],
    experience = 0,
    domain = 'General',
    difficulty = 'medium',
    count = 7
  } = config;

  try {
    const difficultyDesc = difficulty === 'easy' ? '0-2 years level, basic concepts'
                          : difficulty === 'hard' ? '6+ years level, system design'
                          : '3-5 years level, real scenarios';

    const prompt = `Generate exactly ${count} THEORY-BASED interview questions for ${candidateName}.

Skills: ${skills.join(', ') || 'Not specified'}
Experience: ${experience} years
Domain: ${domain}
Difficulty: ${difficulty} (${difficultyDesc})

CRITICAL RULES:
1. ALL questions must be VERBAL/THEORY questions - suitable for phone or video call screening
2. NO coding challenges, NO write-the-code questions, NO whiteboard tasks
3. Questions should test understanding, concepts, real-world experience and decision making
4. For Medium: scenario-based questions like "How would you handle X", "Explain your approach to Y", "Describe a time when Z"
5. For Hard: architecture decisions, system design concepts, leadership scenarios, trade-off analysis
6. Each question must be specific to the candidate's skills and experience level
7. Generate EXACTLY ${count} questions - no more, no less

Return ONLY a JSON array of strings, no markdown, no numbering:
[
  "Question 1",
  "Question 2"
]`;

    const response = await callGroq([{ role: 'user', content: prompt }], 1500) || '[]';
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    
    if (!jsonMatch) {
      console.warn('[generateInterviewQuestions] Using fallback questions');
      return generateFallbackQuestions(skills, experience, difficulty, count);
    }

    const questions = JSON.parse(jsonMatch[0]);
    return Array.isArray(questions) ? questions.slice(0, count) : generateFallbackQuestions(skills, experience, difficulty, count);
  } catch (err) {
    console.error('[generateInterviewQuestions]', err.message);
    return generateFallbackQuestions(skills, experience, difficulty, count);
  }
}

// Fallback questions if AI fails
function generateFallbackQuestions(skills, experience, difficulty, count) {
  const baseQuestions = {
    easy: [
      'What is your primary technical skill and how long have you been using it?',
      'Can you describe a basic project you worked on recently?',
      'What do you enjoy most about your current role?',
      'How do you stay updated with new technologies?',
      'Describe a situation where you had to learn something new quickly.'
    ],
    medium: [
      'Walk us through a complex technical problem you solved.',
      'How do you approach system design for a new feature?',
      'Tell us about a time you disagreed with a team decision.',
      'How do you handle technical debt in your projects?',
      'What\'s your experience with the tech stack for this role?'
    ],
    hard: [
      'Design a scalable system architecture for [domain].',
      'How would you handle a critical production incident?',
      'Discuss your approach to system performance optimization.',
      'How do you make technical decisions at scale?',
      'Tell us about your experience leading technical initiatives.'
    ]
  };

  const questions = baseQuestions[difficulty] || baseQuestions.medium;
  return questions.slice(0, count);
}

// ─────────────────────────────────────────────────────────────────
// EVALUATE SCREENING ANSWERS
// ─────────────────────────────────────────────────────────────────
async function evaluateScreeningAnswers(config = {}) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const {
    questions = [],
    answers = [],
    candidateName = 'Candidate',
    skills = [],
    domain = 'General'
  } = config;

  if (!questions.length || !answers.length) {
    return {
      overallScore: 0,
      scores: answers.map(() => 0),
      feedback: answers.map(() => 'No answer provided'),
      breakdown: {}
    };
  }

  try {
    // Build question-answer pairs for evaluation
    const qaPairs = questions.map((q, i) => `Q${i + 1}: ${q}\nA: ${answers[i] || 'No answer'}`).join('\n\n');

    const prompt = `You are a technical interview evaluator. Score these screening answers.

Candidate: ${candidateName}
Skills: ${skills.join(', ')}
Domain: ${domain}

${qaPairs}

For each answer (1-${questions.length}):
1. Score from 0-100 based on: accuracy, depth, relevance, communication
2. Provide brief feedback (1-2 sentences)
3. overallScore MUST equal the mathematical average of all individual scores (sum / count)

Return ONLY JSON, no markdown:
{
  "scores": [85, 92, 78],
  "feedback": ["Good understanding", "Excellent depth", "Basic but incomplete"],
  "overallScore": 85,
  "breakdown": {
    "technicalDepth": 85,
    "communication": 88,
    "roleRelevance": 80,
    "problemSolving": 85
  }
}`;

    const response = await callGroq([{ role: 'user', content: prompt }], 1500) || '{}';
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return generateFallbackEvaluation(answers.length);
    }

    const evaluation = JSON.parse(jsonMatch[0]);
    const scores = evaluation.scores || answers.map(() => 0);
    // Compute overallScore as true avg of individual scores — do not trust AI-returned overall
    const computedOverall = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : (evaluation.overallScore || 0);
    return {
      scores,
      feedback: evaluation.feedback || answers.map(() => 'Evaluated'),
      overallScore: computedOverall,
      breakdown: evaluation.breakdown || {}
    };
  } catch (err) {
    console.error('[evaluateScreeningAnswers]', err.message);
    return generateFallbackEvaluation(answers.length);
  }
}

function generateFallbackEvaluation(answerCount) {
  return {
    scores: Array(answerCount).fill(70),
    feedback: Array(answerCount).fill('Answer evaluated'),
    overallScore: 70,
    breakdown: {
      technicalDepth: 70,
      communication: 70,
      roleRelevance: 70,
      problemSolving: 70
    }
  };
}

// ─────────────────────────────────────────────────────────────────
// GENERATE HM REPORT
// ─────────────────────────────────────────────────────────────────
async function generateHMReport(config = {}) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const {
    candidate = {},
    reportType = 'cv_only'
  } = config;

  try {
    const info = [
      `Name: ${candidate.name || 'N/A'}`,
      `Skills: ${(candidate.topSkills || []).join(', ')}`,
      `Experience: ${candidate.experience || 0} years`,
      `Domain: ${candidate.domain || 'N/A'}`,
      `CV Score: ${candidate.cvScore || 0}`,
      `Screening Score: ${candidate.screeningScore || 0}`,
      `Strengths: ${(candidate.strengths || []).join(', ')}`,
      `Gaps: ${(candidate.gaps || []).join(', ')}`
    ].join('\n');

    const prompt = `Generate a hiring manager report for a candidate.

CANDIDATE INFO:
${info}

REPORT TYPE: ${reportType}

Create a concise hiring recommendation (2-3 sentences):
- Include overall assessment
- Key strengths and concerns
- Clear hire/no-hire recommendation

Return ONLY JSON:
{
  "recommendation": "Strong Hire",
  "reasoning": "Summary of recommendation",
  "keyStrengths": ["strength1", "strength2"],
  "concerns": ["concern1"],
  "suggestedNextSteps": ["step1"]
}`;

    const response = await callGroq([{ role: 'user', content: prompt }], 1000) || '{}';
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return generateFallbackReport();
    }

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[generateHMReport]', err.message);
    return generateFallbackReport();
  }
}

function generateFallbackReport() {
  return {
    recommendation: 'Consider',
    reasoning: 'Further evaluation needed',
    keyStrengths: [],
    concerns: [],
    suggestedNextSteps: ['Review CV carefully', 'Conduct technical assessment']
  };
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────
module.exports = {
  screenResumeWithAI,
  calculateCVScore,
  determineTier,
  generateInterviewQuestions,
  evaluateScreeningAnswers,
  generateHMReport
};
