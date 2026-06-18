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
// TECHNICAL QUESTIONS ONLY — no behavioral, no soft skills
router.post('/:id/questions', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    const { jobTitle, skills, difficulty = 'medium' } = req.body;
    const role      = jobTitle || candidate.appliedFor || 'Software Engineer';
    const topSkills = (skills || candidate.topSkills || []).slice(0, 8);

    // Difficulty defines the TECHNICAL DEPTH — all questions are technical
    const difficultyGuide = {
      easy: `
TECHNICAL DEPTH: EASY — Suitable for 0-2 years experience
Question types (ALL must be technical):
- Core concept questions: "How does X work internally?", "What is the difference between X and Y?"
- Basic implementation: "How would you write a query to...?", "What happens when you call X?"
- Common technical scenarios they should know from day 1
- Examples: "What is the difference between ArrayList and LinkedList in Java?",
  "Explain what a REST API is and how HTTP methods work",
  "What is a foreign key in a database?",
  "How does indexing improve query performance?"
STRICTLY AVOID: General questions like "Tell me about yourself", "Where do you see yourself", "How do you work in a team"`,

      medium: `
TECHNICAL DEPTH: MEDIUM — Suitable for 3-5 years experience
Question types (ALL must be technical):
- Architecture and design: "How would you design X?", "Which approach would you use for Y and why?"
- Performance and optimization: "How would you optimize this query?", "What causes N+1 problem?"
- Real implementation decisions: "How would you handle transactions across microservices?"
- Debugging scenarios: "Given this error, what are the likely causes?"
- Examples: "How does connection pooling work and why is it needed?",
  "Explain SOLID principles with a code example from your experience",
  "How would you implement caching to reduce database load?",
  "What is the CAP theorem and how does it affect your database choice?"
STRICTLY AVOID: Any soft skill, behavioral, or non-technical questions`,

      hard: `
TECHNICAL DEPTH: HARD — Suitable for 6+ years experience
Question types (ALL must be technical):
- System design: "Design a system that handles X million requests per day"
- Deep internals: "How does the JVM garbage collector work?", "Explain the internals of Kafka"
- Complex trade-offs: "When would you choose eventual consistency over strong consistency?"
- Production-level problems: "How would you debug a memory leak in production?",
  "How would you migrate a live database with zero downtime?"
- Architectural decisions: "How would you break this monolith into microservices?"
- Examples: "Design a rate limiter for a public API",
  "How would you implement distributed locking across multiple nodes?",
  "Explain how you would handle a database that is running slow under peak load",
  "How does Kubernetes manage pod scheduling and resource allocation?"
STRICTLY AVOID: Any non-technical, behavioral, or generic questions`
    };

    const prompt = `You are a Senior Technical Architect conducting a technical interview.
Generate exactly 8 TECHNICAL interview questions for this role.

ROLE: ${role}
CANDIDATE SKILLS: ${topSkills.join(', ') || 'General Software Engineering'}
SENIORITY: ${candidate.seniority || 'Mid'}
EXPERIENCE: ${candidate.experienceYears || 'unknown'} years
DOMAIN: ${candidate.domain || 'Software Engineering'}

${difficultyGuide[difficulty] || difficultyGuide.medium}

MANDATORY RULES:
1. ALL 8 questions MUST be purely technical — no exceptions
2. Questions should test actual hands-on knowledge, not just book definitions
3. At least 3 questions must be specific to the candidate's listed skills: ${topSkills.slice(0,3).join(', ')||role}
4. Questions should make the candidate think and demonstrate real experience
5. Avoid questions that can be answered with a one-word or yes/no answer
6. No questions about: career goals, team work, time management, motivation, or personal background

Return ONLY a valid JSON array of exactly 8 question strings, no numbering, no markdown:
["Technical question 1?","Technical question 2?","Technical question 3?","Technical question 4?","Technical question 5?","Technical question 6?","Technical question 7?","Technical question 8?"]`;

    let questions = [];

    if (process.env.GROQ_API_KEY) {
      try {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const resp = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role:'user', content:prompt }],
          temperature: difficulty==='easy'?0.2:difficulty==='hard'?0.4:0.3,
          max_tokens: 1000,
        });
        const text  = resp.choices[0].message.content.replace(/```json|```/g,'').trim();
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed) && parsed.length >= 6) questions = parsed.slice(0,8);
        }
      } catch (e) { console.error('[AI questions]', e.message); }
    }

    // Fallback — still technical, skill-specific
    if (questions.length === 0) {
      const skill1 = topSkills[0] || role;
      const skill2 = topSkills[1] || 'SQL';
      const skill3 = topSkills[2] || 'REST API';

      const fallbacks = {
        easy: [
          `What is the difference between ${skill1} and its main alternatives? When would you choose one over the other?`,
          `How does memory management work in ${skill1}? What common memory issues have you encountered?`,
          `Explain the CRUD operations in ${skill2}. Write an example SQL SELECT with a JOIN.`,
          `What is the difference between a primary key and a foreign key in a relational database?`,
          `How does HTTP work? Explain the difference between GET, POST, PUT, and DELETE.`,
          `What is an index in a database and when should you use one?`,
          `What is the difference between synchronous and asynchronous programming? Give a real example.`,
          `How do you handle exceptions in ${skill1}? What is the difference between checked and unchecked exceptions?`,
        ],
        medium: [
          `How would you optimize a slow ${skill2} query that is causing performance issues in production?`,
          `Explain the N+1 query problem in ${skill1} and how you would fix it.`,
          `How does connection pooling work and why is it critical for ${skill1} applications?`,
          `Design a caching strategy for a high-traffic ${role} service. What would you cache and why?`,
          `How would you implement pagination for a REST API that returns millions of records?`,
          `What are the SOLID principles? Give a concrete example from your ${skill1} experience.`,
          `How do you handle database transactions in ${skill1}? What is the difference between optimistic and pessimistic locking?`,
          `Explain microservices vs monolith. For a ${role} project, what factors would drive your architecture decision?`,
        ],
        hard: [
          `Design a system for ${role} that handles 1 million concurrent users. What are the key architectural decisions?`,
          `How would you debug a memory leak in a production ${skill1} application with zero downtime?`,
          `Explain the CAP theorem. For a ${role} system, how does it affect your choice of database?`,
          `How would you migrate a live ${skill2} database to a new schema without taking downtime?`,
          `Design a distributed rate limiter for an API serving 10,000 requests per second.`,
          `How does the ${skill1} runtime/compiler optimize code internally? What are the performance implications?`,
          `How would you implement distributed locking in a microservices environment? What are the pitfalls?`,
          `Given a ${role} system where response times have increased 10x over 3 months, how would you diagnose and fix it?`,
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
// Combined score = CV score (60%) + Technical screening score (40%)
// Both based on technical merit only
router.post('/:id/answers', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id)
      .populate('jobId', 'scoringWeights');
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    const { answers } = req.body;
    if (!answers?.length) return res.status(400).json({ message: 'No answers provided' });

    // Configurable weights (default CV:60%, Screening:40%)
    const weights        = candidate.jobId?.scoringWeights || { cvWeight:60, screeningWeight:40 };
    const cvWeight       = (weights.cvWeight        || 60) / 100;
    const screeningWeight = (weights.screeningWeight || 40) / 100;

    // Score answers using technical-only scoring
    const { scoreScreeningAnswers } = require('../services/aiService');
    const { scoredAnswers, screeningScore } = await scoreScreeningAnswers(answers, {
      appliedFor: candidate.appliedFor || 'Software Engineer',
      topSkills:  candidate.topSkills  || [],
      domain:     candidate.domain     || '',
    });

    // Screening breakdown averages
    const screeningBreakdown = {
      technical: Math.round(scoredAnswers.reduce((a,s)=>a+(s.scoreBreakdown?.technical||0),0)/scoredAnswers.length),
      depth:     Math.round(scoredAnswers.reduce((a,s)=>a+(s.scoreBreakdown?.depth||0),0)/scoredAnswers.length),
      relevance: Math.round(scoredAnswers.reduce((a,s)=>a+(s.scoreBreakdown?.relevance||0),0)/scoredAnswers.length),
    };

    // Combined score
    const cvScore       = candidate.aiScore || 0;
    const combinedScore = Math.round((cvScore * cvWeight) + (screeningScore * screeningWeight));

    // Recommendation based on combined score
    const recommendation =
      combinedScore >= 85 ? 'Strong Hire' :
      combinedScore >= 72 ? 'Hire'        :
      combinedScore >= 58 ? 'Consider'    :
      combinedScore >= 42 ? 'Weak Fit'    : 'Reject';

    const newStatus = combinedScore >= 60 ? 'hm_ready' : 'answers_submitted';

    const updated = await Candidate.findByIdAndUpdate(req.params.id, {
      screeningAnswers:    scoredAnswers,
      screeningScore,
      screeningBreakdown,
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
      details:  `${candidate.name} CV:${cvScore} Screen:${screeningScore} Combined:${combinedScore} → ${recommendation}`.slice(0,150),
    });

    res.json({
      candidate: updated,
      screeningScore,
      screeningBreakdown,
      combinedScore,
      cvScore,
      recommendation,
      status: newStatus,
      weights: { cvWeight: weights.cvWeight, screeningWeight: weights.screeningWeight },
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

    const { screenResumeWithAI, calculateCVScore } = require('../services/aiService');

    const resumeText = `Name: ${candidate.name}
Email: ${candidate.email}
Domain: ${candidate.domain||''}
Seniority: ${candidate.seniority||''}
Experience: ${candidate.experienceYears||0} years
Skills: ${(candidate.topSkills||[]).join(', ')}
Applied For: ${candidate.appliedFor||''}
Summary: ${candidate.summary||''}`.trim();

    const ai = await screenResumeWithAI(resumeText, candidate.appliedFor||'');
    if (!ai) return res.status(500).json({ message: 'AI screening failed' });

    const cvScore = calculateCVScore(ai.cvScoreBreakdown) || ai.aiScore || 0;

    const updated = await Candidate.findByIdAndUpdate(req.params.id, {
      aiScore:              cvScore,
      cvScoreBreakdown:     ai.cvScoreBreakdown    || {},
      tier:                 ai.tier                || candidate.tier,
      riskLevel:            ai.riskLevel           || candidate.riskLevel,
      riskFlags:            ai.riskFlags           || {},
      summary:              (ai.summary            || '').slice(0,400),
      hmSummary:            (ai.hmSummary          || '').slice(0,600),
      topSkills:            (ai.topSkills?.length?ai.topSkills:candidate.topSkills||[]).slice(0,10),
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
      missingMandatorySkills:(ai.riskFlags?.missingMandatorySkills||[]).slice(0,5),
      recommendation:       ai.recommendation      || '',
      recommendationReason: (ai.recommendationReason||'').slice(0,200),
      status:               'ai_screened',
      updatedAt:            new Date(),
    }, { new: true });

    res.json({ candidate: updated, aiScore: updated.aiScore });
  } catch (err) {
    console.error('[rescreen]', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
