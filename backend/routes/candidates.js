const express   = require('express');
const router    = express.Router();
const Candidate = require('../models/Candidate');
const AuditLog  = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const Groq = require('groq-sdk');

// ── GET /api/candidates ───────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? {} : { uploadedBy: req.user._id };
    const candidates = await Candidate.find(query)
      .populate('jobId', 'title department location scoringWeights')
      .sort({ createdAt: -1 });

    const enriched = candidates.map(c => {
      const obj = c.toObject();
      if (obj.jobId && typeof obj.jobId === 'object') {
        obj.jobTitle       = obj.appliedFor || obj.jobId.title || '';
        obj.jobDepartment  = obj.jobId.department || '';
        obj.jobLocation    = obj.jobId.location   || '';
        obj.scoringWeights = obj.jobId.scoringWeights || { cvWeight:60, screeningWeight:40 };
      } else {
        obj.jobTitle = obj.appliedFor || '';
      }
      return obj;
    });
    res.json({ candidates: enriched });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/candidates/:id ───────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id)
      .populate('jobId', 'title department scoringWeights');
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });
    res.json({ candidate });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── PATCH /api/candidates/:id ─────────────────────────────────
router.patch('/:id', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });
    res.json({ candidate });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── DELETE /api/candidates/:id ────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
    await Candidate.findByIdAndDelete(req.params.id);
    res.json({ message: 'Candidate removed' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/candidates/:id/questions ────────────────────────
// ALL questions are purely TECHNICAL — based on difficulty level
router.post('/:id/questions', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    const { jobTitle, skills, difficulty = 'medium' } = req.body;
    const role      = jobTitle || candidate.appliedFor || 'Software Engineer';
    const topSkills = (skills || candidate.topSkills || []).slice(0, 8);
    const skill1    = topSkills[0] || role;
    const skill2    = topSkills[1] || 'databases';
    const skill3    = topSkills[2] || 'system design';

    const difficultyGuide = {
      easy: `
DIFFICULTY: EASY (0-2 years experience)
Goal: Test foundational technical knowledge — can they explain HOW things work?
Question types:
- "What is X and how does it work internally?"
- "What is the difference between X and Y?" (e.g. ArrayList vs LinkedList, TCP vs UDP)
- "How would you write a basic [query/code/config] to do X?"
- "What happens step-by-step when you do X?"
DO NOT ASK: Design questions, team questions, career questions, behavioral questions
EXAMPLE GOOD questions:
- "Explain how an index works in a relational database and when you would use one"
- "What is the difference between a stack and a queue? When would you use each?"
- "How does HTTP request-response cycle work? What happens when you type a URL?"`,

      medium: `
DIFFICULTY: MEDIUM (3-5 years experience)
Goal: Test practical engineering judgment — can they solve real problems?
Question types:
- "How would you optimize X that is causing performance issues?"
- "Walk me through how you would design X at a high level"
- "What approach would you take for Y and what are the trade-offs?"
- "You encounter this specific technical problem — how do you debug it?"
DO NOT ASK: Basic definitions, career questions, team questions
EXAMPLE GOOD questions:
- "Your ${skill1} application is getting slow under load — walk me through your debugging approach"
- "How would you implement caching for a high-traffic ${skill1} service? What are the trade-offs?"
- "Explain the N+1 query problem in the context of ${skill2} and how you would prevent it"`,

      hard: `
DIFFICULTY: HARD (6+ years experience)
Goal: Test architectural thinking and production-level expertise
Question types:
- "Design a system for X that handles [scale/reliability requirement]"
- "How would you architect X for zero-downtime migration/deployment?"
- "What are the trade-offs between X approach and Y approach at scale?"
- "How would you debug/diagnose X type of production problem?"
DO NOT ASK: Basic concepts, definitions, career/behavioral questions
EXAMPLE GOOD questions:
- "Design a ${skill1} service that needs to handle 100K concurrent requests — walk through the architecture"
- "How would you migrate a live ${skill2} database to a new schema without downtime?"
- "Your ${skill1} service is experiencing intermittent latency spikes in production — systematic diagnosis approach?"`,
    };

    const prompt = `You are a Principal Engineer and Technical Hiring Manager generating interview questions.

Role to hire for: ${role}
Candidate's skills: ${topSkills.join(', ') || 'Software Engineering'}
Candidate seniority: ${candidate.seniority || 'Mid'}
Candidate experience: ${candidate.experienceYears || 'unknown'} years
Domain: ${candidate.domain || 'Software Engineering'}

${difficultyGuide[difficulty] || difficultyGuide.medium}

MANDATORY REQUIREMENTS FOR ALL 8 QUESTIONS:
1. Every single question must require technical knowledge to answer — no exceptions
2. At least 3 questions must directly reference the candidate's specific skills: ${topSkills.slice(0,3).join(', ')||role}
3. Questions must require demonstrated knowledge, not yes/no answers
4. Questions should reveal gaps if the candidate is bluffing
5. ZERO behavioral/soft skill/career questions — these are handled separately by HR

Return ONLY a JSON array of exactly 8 questions, no numbering, no markdown:
["Question 1?","Question 2?","Question 3?","Question 4?","Question 5?","Question 6?","Question 7?","Question 8?"]`;

    let questions = [];

    if (process.env.GROQ_API_KEY) {
      try {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const resp = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role:'user', content:prompt }],
          temperature: difficulty === 'easy' ? 0.15 : difficulty === 'hard' ? 0.4 : 0.25,
          max_tokens: 1000,
        });
        const text  = resp.choices[0].message.content.replace(/```json|```/g,'').trim();
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed) && parsed.length >= 6) {
            questions = parsed.slice(0,8);
          }
        }
      } catch (e) { console.error('[AI questions]', e.message); }
    }

    // Fallback — always technical, always skill-specific
    if (questions.length === 0) {
      const fallbacks = {
        easy: [
          `Explain how ${skill1} works internally — what happens under the hood when you execute a typical operation?`,
          `What is the difference between ${skill1} and its main alternative? Give a scenario where you'd choose each.`,
          `How does indexing work in ${skill2}? What are the trade-offs of adding too many indexes?`,
          `Explain the difference between synchronous and asynchronous execution in ${skill1}. When does each matter?`,
          `What happens at the network level when a client makes an HTTP request to a REST API? Walk through each step.`,
          `What is a transaction in a database? Explain ACID properties with a concrete example.`,
          `How does memory management work in ${skill1}? What common memory issues do developers encounter?`,
          `What is the difference between a compiled and interpreted language? Where does ${skill1} fit?`,
        ],
        medium: [
          `Your ${skill1} service is experiencing slow response times under load. Walk me through your systematic debugging approach.`,
          `How would you design a caching layer for a ${role} service? What cache invalidation strategy would you use and why?`,
          `Explain the N+1 query problem in the context of ${skill2}. How would you detect and fix it in production?`,
          `How would you implement database connection pooling for a high-traffic ${skill1} application? What parameters matter?`,
          `You need to add a new column to a ${skill2} table with 50 million rows in production. What is your approach?`,
          `How would you handle distributed transactions across multiple microservices? What are the trade-offs vs 2PC?`,
          `Describe a scenario where you would use ${skill3} vs a simpler solution. What are the operational trade-offs?`,
          `How would you design a rate limiter for a ${role} API? What data structure and algorithm would you use?`,
        ],
        hard: [
          `Design a ${skill1}-based system that handles 500K concurrent users. Walk through the architecture, data flow, and failure modes.`,
          `Your ${skill1} production service has intermittent P99 latency spikes every 4 hours. How do you diagnose and resolve this systematically?`,
          `How would you migrate a live ${skill2} database from schema version 1 to version 2 with zero downtime and rollback capability?`,
          `Design a distributed job queue for a ${role} system. How do you handle exactly-once execution, failures, and horizontal scaling?`,
          `Explain the CAP theorem and how it applies to choosing ${skill2} for a ${role} use case at scale.`,
          `How would you implement multi-region active-active deployment for a ${skill1} service? What are the consistency trade-offs?`,
          `Your ${skill1} service is leaking memory in production — 200MB per hour. Walk through your diagnosis and resolution process.`,
          `Design the data architecture for a ${role} system that needs to handle both OLTP (transactions) and OLAP (analytics) workloads.`,
        ],
      };
      questions = fallbacks[difficulty] || fallbacks.medium;
    }

    await Candidate.findByIdAndUpdate(req.params.id, {
      interviewQuestions: questions,
      status: 'questions_sent',
      updatedAt: new Date(),
    });

    res.json({ questions, difficulty, count: questions.length });
  } catch (err) {
    console.error('[questions]', err);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/candidates/:id/answers ─────────────────────────
// Final score = CV score (default 60%) + Technical screening (default 40%)
router.post('/:id/answers', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id)
      .populate('jobId', 'scoringWeights title');
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    const { answers } = req.body;
    if (!answers?.length) return res.status(400).json({ message: 'No answers provided' });

    // Get configured weights
    const weights         = candidate.jobId?.scoringWeights || { cvWeight:60, screeningWeight:40 };
    const cvWeight        = Math.min(100, Math.max(0, weights.cvWeight        || 60)) / 100;
    const screeningWeight = Math.min(100, Math.max(0, weights.screeningWeight || 40)) / 100;

    // Score the technical answers
    const { scoreScreeningAnswers } = require('../services/aiService');
    const { scoredAnswers, screeningScore } = await scoreScreeningAnswers(answers, {
      appliedFor: candidate.appliedFor || candidate.jobId?.title || 'Software Engineer',
      topSkills:  candidate.topSkills  || [],
      domain:     candidate.domain     || '',
    });

    // Average breakdown across all answers
    const avgBreakdown = {
      technical: Math.round(scoredAnswers.reduce((a,s) => a+(s.scoreBreakdown?.technical||0), 0) / scoredAnswers.length),
      depth:     Math.round(scoredAnswers.reduce((a,s) => a+(s.scoreBreakdown?.depth||0),     0) / scoredAnswers.length),
      relevance: Math.round(scoredAnswers.reduce((a,s) => a+(s.scoreBreakdown?.relevance||0), 0) / scoredAnswers.length),
    };

    // Final weighted combined score
    const cvScore       = candidate.aiScore || 0;
    const combinedScore = Math.round((cvScore * cvWeight) + (screeningScore * screeningWeight));

    // Recommendation
    const recommendation =
      combinedScore >= 85 ? 'Strong Hire' :
      combinedScore >= 72 ? 'Hire'        :
      combinedScore >= 58 ? 'Consider'    :
      combinedScore >= 42 ? 'Weak Fit'    : 'Reject';

    // Status: HM Ready if combined >= 60, else keep in answers_submitted
    const newStatus = combinedScore >= 60 ? 'hm_ready' : 'answers_submitted';

    const updated = await Candidate.findByIdAndUpdate(req.params.id, {
      screeningAnswers:    scoredAnswers,
      screeningScore,
      screeningBreakdown:  avgBreakdown,
      combinedScore,
      recommendation,
      status:     newStatus,
      updatedAt:  new Date(),
    }, { new: true });

    await AuditLog.create({
      user:     req.user.name,
      userId:   req.user._id,
      action:   'ANSWERS_SUBMITTED',
      resource: 'candidates',
      details:  `${candidate.name} | CV:${cvScore} Screen:${screeningScore} Combined:${combinedScore} → ${recommendation}`.slice(0,150),
    });

    res.json({
      candidate:         updated,
      screeningScore,
      screeningBreakdown: avgBreakdown,
      combinedScore,
      cvScore,
      recommendation,
      status:   newStatus,
      weights:  { cvWeight: weights.cvWeight, screeningWeight: weights.screeningWeight },
    });
  } catch (err) {
    console.error('[answers]', err);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/candidates/:id/rescreen ────────────────────────
router.post('/:id/rescreen', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    const { screenResumeWithAI, calculateCVScore, determineTier } = require('../services/aiService');

    const resumeText = [
      `Name: ${candidate.name}`,
      `Email: ${candidate.email}`,
      `Domain: ${candidate.domain||''}`,
      `Seniority: ${candidate.seniority||''}`,
      `Experience: ${candidate.experienceYears||0} years`,
      `Skills: ${(candidate.topSkills||[]).join(', ')}`,
      `Applied For: ${candidate.appliedFor||''}`,
      `Summary: ${candidate.summary||''}`,
    ].join('\n');

    const ai = await screenResumeWithAI(resumeText, candidate.appliedFor||'');
    if (!ai) return res.status(500).json({ message: 'AI screening failed — check GROQ_API_KEY in Render environment' });

    const cvScore = calculateCVScore(ai.cvScoreBreakdown) || ai.aiScore || 0;
    const tier    = determineTier(cvScore);

    const updated = await Candidate.findByIdAndUpdate(req.params.id, {
      aiScore:              cvScore,
      cvScoreBreakdown:     ai.cvScoreBreakdown    || {},
      tier,
      riskLevel:            ai.riskLevel           || candidate.riskLevel || 'medium',
      riskFlags:            ai.riskFlags           || {},
      summary:              (ai.summary            || '').slice(0,400),
      hmSummary:            (ai.hmSummary          || '').slice(0,600),
      topSkills:            (ai.topSkills?.length ? ai.topSkills : candidate.topSkills||[]).slice(0,10),
      skillScores:          (ai.skillScores        || []).slice(0,8),
      strengths:            (ai.strengths          || []).slice(0,4),
      gaps:                 (ai.gaps               || []).slice(0,4),
      technicalExperience:  (ai.technicalExperience  ||'').slice(0,200),
      leadershipExperience: (ai.leadershipExperience ||'').slice(0,200),
      cloudExpertise:       (ai.cloudExpertise       ||'').slice(0,200),
      databases:            (ai.databases          ||[]).slice(0,8),
      frameworks:           (ai.frameworks         ||[]).slice(0,8),
      tools:                (ai.tools              ||[]).slice(0,8),
      interviewFocusAreas:  (ai.interviewFocusAreas||[]).slice(0,5),
      missingMandatorySkills: (ai.riskFlags?.missingMandatorySkills||[]).slice(0,5),
      recommendation:       ai.recommendation      || '',
      recommendationReason: (ai.recommendationReason||'').slice(0,200),
      status:               'ai_screened',
      updatedAt:            new Date(),
    }, { new: true });

    res.json({ candidate: updated, aiScore: updated.aiScore, tier: updated.tier });
  } catch (err) {
    console.error('[rescreen]', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
