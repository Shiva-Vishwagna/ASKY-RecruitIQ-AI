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
        obj.jobTitle      = obj.appliedFor || obj.jobId.title || '';
        obj.jobDepartment = obj.jobId.department || '';
        obj.jobLocation   = obj.jobId.location   || '';
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
    const c = await Candidate.findById(req.params.id)
      .populate('jobId', 'title department scoringWeights questionBank');
    if (!c) return res.status(404).json({ message: 'Candidate not found' });
    res.json({ candidate: c });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── PATCH /api/candidates/:id ─────────────────────────────────
router.patch('/:id', protect, async (req, res) => {
  try {
    const c = await Candidate.findByIdAndUpdate(
      req.params.id, { ...req.body, updatedAt: new Date() }, { new: true }
    );
    if (!c) return res.status(404).json({ message: 'Candidate not found' });
    res.json({ candidate: c });
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
// Generate technical questions (AI-based, difficulty-driven)
router.post('/:id/questions', protect, async (req, res) => {
  try {
    const c = await Candidate.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Candidate not found' });

    const { jobTitle, skills, difficulty = 'medium' } = req.body;
    const role      = jobTitle || c.appliedFor || 'Software Engineer';
    const topSkills = (skills || c.topSkills || []).slice(0, 8);
    const skill1    = topSkills[0] || role;
    const skill2    = topSkills[1] || 'databases';

    const guides = {
      easy: `EASY (0-2 yrs): Core concept definitions, internal workings, basic implementation.
NO behavioral, NO design, NO "tell me about yourself".
Example: "What is the difference between X and Y?", "How does X work internally?"`,
      medium: `MEDIUM (3-5 yrs): Real-world scenarios, optimization, trade-off decisions.
Example: "How would you debug slow ${skill1} queries in production?", "Design a caching layer for X"`,
      hard: `HARD (6+ yrs): System design, architectural trade-offs, production-scale problems.
Example: "Design a rate limiter for 100K req/sec", "Zero-downtime DB migration strategy"`,
    };

    const prompt = `You are a Principal Engineer generating technical interview questions.
Role: ${role} | Skills: ${topSkills.join(', ')||role} | Seniority: ${c.seniority||'Mid'}
${guides[difficulty]||guides.medium}
ALL 8 questions must be purely TECHNICAL. Zero behavioral/soft skill questions.
At least 3 must directly reference these skills: ${topSkills.slice(0,3).join(', ')||role}
Return ONLY a JSON array of exactly 8 question strings:
["Q1?","Q2?","Q3?","Q4?","Q5?","Q6?","Q7?","Q8?"]`;

    let questions = [];
    if (process.env.GROQ_API_KEY) {
      try {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const resp = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role:'user', content:prompt }],
          temperature: difficulty==='easy'?0.15:difficulty==='hard'?0.4:0.25,
          max_tokens: 900,
        });
        const text  = resp.choices[0].message.content.replace(/```json|```/g,'').trim();
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed) && parsed.length >= 6) questions = parsed.slice(0,8);
        }
      } catch (e) { console.error('[AI questions]', e.message); }
    }

    // Technical fallbacks by difficulty
    if (questions.length === 0) {
      const fallbacks = {
        easy: [
          `Explain how ${skill1} works internally — what happens under the hood?`,
          `What is the difference between ${skill1} and its main alternative? When would you choose each?`,
          `How does indexing work in ${skill2}? What are the trade-offs of over-indexing?`,
          `Explain synchronous vs asynchronous execution in ${skill1} with a real example.`,
          `What happens at the network level when a client calls a REST API? Walk through step by step.`,
          `What is a database transaction? Explain ACID properties with a concrete example.`,
          `How does memory management work in ${skill1}? What common memory issues do developers face?`,
          `What is the difference between a stack and a heap in ${skill1}? When does each apply?`,
        ],
        medium: [
          `Your ${skill1} service is slow under load. Walk through your systematic debugging approach.`,
          `How would you design a caching layer for a high-traffic ${role} service? What cache invalidation strategy?`,
          `Explain the N+1 query problem with ${skill2}. How would you detect and fix it in production?`,
          `How would you implement connection pooling for ${skill1}? What parameters matter most?`,
          `You need to add a column to a ${skill2} table with 50M rows in production. What's your approach?`,
          `How would you handle distributed transactions across microservices? Trade-offs vs 2PC?`,
          `Design a rate limiter for a ${role} API. What data structure and algorithm would you use?`,
          `How do you ensure ${skill1} application security — top 3 vulnerabilities and mitigations?`,
        ],
        hard: [
          `Design a ${skill1} system for 500K concurrent users. Architecture, data flow, failure modes.`,
          `Your ${skill1} service has intermittent P99 latency spikes every 4 hours in production. Diagnosis?`,
          `How would you migrate a live ${skill2} database to a new schema with zero downtime and rollback?`,
          `Design a distributed job queue that guarantees exactly-once execution at scale.`,
          `Explain CAP theorem and how it applies to choosing ${skill2} for ${role} at scale.`,
          `How would you implement multi-region active-active for ${skill1}? Consistency trade-offs?`,
          `Your ${skill1} service leaks 200MB/hour in production. Walk through diagnosis and resolution.`,
          `Design the data architecture for a system that handles both OLTP and OLAP workloads simultaneously.`,
        ],
      };
      questions = fallbacks[difficulty] || fallbacks.medium;
    }

    await Candidate.findByIdAndUpdate(req.params.id, {
      interviewQuestions: questions,
      status: 'questions_sent',
      updatedAt: new Date(),
    });

    res.json({ questions, difficulty, source: 'ai_generated', count: questions.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/candidates/:id/answers ─────────────────────────
// Score answers and store as a session. sessionType: ai_generated | bank_questions
router.post('/:id/answers', protect, async (req, res) => {
  try {
    const c = await Candidate.findById(req.params.id)
      .populate('jobId', 'scoringWeights title');
    if (!c) return res.status(404).json({ message: 'Candidate not found' });

    const { answers, sessionType = 'ai_generated', difficulty = 'medium' } = req.body;
    if (!answers?.length) return res.status(400).json({ message: 'No answers provided' });

    const weights        = c.jobId?.scoringWeights || { cvWeight:60, screeningWeight:40 };
    const cvWeight       = (weights.cvWeight        || 60) / 100;
    const screeningWeight = (weights.screeningWeight || 40) / 100;

    const { scoreScreeningAnswers } = require('../services/aiService');
    const { scoredAnswers, screeningScore } = await scoreScreeningAnswers(answers, {
      appliedFor: c.appliedFor || c.jobId?.title || 'Software Engineer',
      topSkills:  c.topSkills  || [],
      domain:     c.domain     || '',
    });

    const avgBreakdown = {
      technical: Math.round(scoredAnswers.reduce((a,s)=>a+(s.scoreBreakdown?.technical||0),0)/scoredAnswers.length),
      depth:     Math.round(scoredAnswers.reduce((a,s)=>a+(s.scoreBreakdown?.depth||0),    0)/scoredAnswers.length),
      relevance: Math.round(scoredAnswers.reduce((a,s)=>a+(s.scoreBreakdown?.relevance||0),0)/scoredAnswers.length),
    };

    // Store as a session for history
    const newSession = {
      sessionType,
      difficulty,
      conductedAt:  new Date(),
      conductedBy:  req.user.name || 'Recruiter',
      questions:    answers.map(a => a.question),
      answers:      scoredAnswers,
      screeningScore,
      screeningBreakdown: avgBreakdown,
    };

    // Combined score using configured weights
    const cvScore       = c.aiScore || 0;
    const combinedScore = Math.round((cvScore * cvWeight) + (screeningScore * screeningWeight));

    const recommendation =
      combinedScore >= 85 ? 'Strong Hire' :
      combinedScore >= 72 ? 'Hire'        :
      combinedScore >= 58 ? 'Consider'    :
      combinedScore >= 42 ? 'Weak Fit'    : 'Reject';

    const newStatus = combinedScore >= 60 ? 'answers_submitted' : 'answers_submitted';

    const updated = await Candidate.findByIdAndUpdate(req.params.id, {
      $push:         { screeningSessions: newSession },
      screeningAnswers:    scoredAnswers,
      screeningScore,
      screeningBreakdown:  avgBreakdown,
      interviewQuestions:  answers.map(a => a.question),
      combinedScore,
      recommendation,
      status:        newStatus,
      updatedAt:     new Date(),
    }, { new: true });

    await AuditLog.create({
      user:     req.user.name, userId: req.user._id, action: 'ANSWERS_SUBMITTED',
      resource: 'candidates',
      details:  `${c.name} | ${sessionType} | CV:${cvScore} Screen:${screeningScore} Combined:${combinedScore} → ${recommendation}`.slice(0,150),
    });

    res.json({
      candidate: updated, screeningScore, screeningBreakdown: avgBreakdown,
      combinedScore, cvScore, recommendation, status: newStatus, sessionType,
      weights: { cvWeight: weights.cvWeight, screeningWeight: weights.screeningWeight },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/candidates/:id/hm-report ───────────────────────
// Recruiter selects which report type to share with HM
// reportType: "cv_only" | "cv_ai_questions" | "cv_bank_questions"
router.post('/:id/hm-report', protect, async (req, res) => {
  try {
    const { reportType, sessionIndex } = req.body;
    const c = await Candidate.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Candidate not found' });

    const validTypes = ['cv_only', 'cv_ai_questions', 'cv_bank_questions'];
    if (!validTypes.includes(reportType)) return res.status(400).json({ message: 'Invalid reportType' });

    const cvScore = c.aiScore || 0;
    let finalScore, finalRec, screenScore, sessionData;

    if (reportType === 'cv_only') {
      // Score based on CV alone
      finalScore = cvScore;
      screenScore = null;
    } else {
      // Use specified session or latest session of matching type
      const targetType = reportType === 'cv_ai_questions' ? 'ai_generated' : 'bank_questions';
      const sessions   = (c.screeningSessions || []).filter(s => s.sessionType === targetType);
      sessionData      = sessionIndex != null ? sessions[sessionIndex] : sessions[sessions.length - 1];

      if (!sessionData) return res.status(400).json({ message: `No ${targetType} session found. Complete screening first.` });

      screenScore = sessionData.screeningScore;
      // Default weights or job-configured
      const cvW  = 0.60;
      const scW  = 0.40;
      finalScore = Math.round((cvScore * cvW) + (screenScore * scW));
    }

    finalRec =
      finalScore >= 85 ? 'Strong Hire' :
      finalScore >= 72 ? 'Hire'        :
      finalScore >= 58 ? 'Consider'    :
      finalScore >= 42 ? 'Weak Fit'    : 'Reject';

    const updated = await Candidate.findByIdAndUpdate(req.params.id, {
      hmReportType:  reportType,
      combinedScore: finalScore,
      recommendation: finalRec,
      status: 'hm_ready',
      updatedAt: new Date(),
    }, { new: true });

    await AuditLog.create({
      user: req.user.name, userId: req.user._id, action: 'HM_REPORT_SET',
      resource: 'candidates',
      details: `${c.name} | Report:${reportType} | Score:${finalScore} | ${finalRec}`.slice(0,150),
    });

    res.json({ candidate: updated, reportType, finalScore, screenScore, recommendation: finalRec });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/candidates/:id/rescreen ────────────────────────
router.post('/:id/rescreen', protect, async (req, res) => {
  try {
    const c = await Candidate.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Candidate not found' });

    const { screenResumeWithAI, calculateCVScore, determineTier } = require('../services/aiService');
    const resumeText = `Name: ${c.name}\nEmail: ${c.email}\nDomain: ${c.domain||''}\nSeniority: ${c.seniority||''}\nExperience: ${c.experienceYears||0} years\nSkills: ${(c.topSkills||[]).join(', ')}\nApplied For: ${c.appliedFor||''}`.trim();

    const ai = await screenResumeWithAI(resumeText, c.appliedFor||'');
    if (!ai) return res.status(500).json({ message: 'AI screening failed — check GROQ_API_KEY' });

    const cvScore = calculateCVScore(ai.cvScoreBreakdown) || ai.aiScore || 0;
    const tier    = determineTier(cvScore);
    const t = (s,n) => (s||'').slice(0,n);
    const a = (arr,n) => (Array.isArray(arr)?arr:[]).slice(0,n);

    const updated = await Candidate.findByIdAndUpdate(req.params.id, {
      aiScore: cvScore, cvScoreBreakdown: ai.cvScoreBreakdown || {}, tier,
      riskLevel: t(ai.riskLevel||'medium',10),
      riskFlags: ai.riskFlags || {},
      summary:              t(ai.summary,500),
      hmSummary:            t(ai.hmSummary,800),
      topSkills:            a(ai.topSkills,10),
      skillScores:          a(ai.skillScores,8).map(s=>({skill:t(s.skill,50),score:Math.min(Number(s.score)||0,100)})),
      strengths:            a(ai.strengths,4),
      gaps:                 a(ai.gaps,4),
      technicalExperience:  t(ai.technicalExperience,300),
      leadershipExperience: t(ai.leadershipExperience,300),
      cloudExpertise:       t(ai.cloudExpertise,300),
      databases:            a(ai.databases,8),
      frameworks:           a(ai.frameworks,8),
      tools:                a(ai.tools,8),
      interviewFocusAreas:  a(ai.interviewFocusAreas,5),
      recommendation:       t(ai.recommendation,20),
      recommendationReason: t(ai.recommendationReason,300),
      combinedScore: cvScore,
      status: 'ai_screened',
      updatedAt: new Date(),
    }, { new: true });

    res.json({ candidate: updated, aiScore: updated.aiScore, tier: updated.tier });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
