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
router.post('/:id/questions', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    const { jobTitle, skills, difficulty = 'medium' } = req.body;
    const role      = jobTitle || candidate.appliedFor || 'Software Engineer';
    const topSkills = (skills || candidate.topSkills || []).slice(0, 8);

    const difficultyInstructions = {
      easy: `DIFFICULTY: EASY (0-2 years experience)
- Basic concept definitions ("What is X?", "Explain Y")
- Simple how-to questions
- Fundamental knowledge checks
- No system design or architecture questions`,
      medium: `DIFFICULTY: MEDIUM (3-5 years experience)
- Real-world scenario questions ("How would you handle X?")
- Problem-solving and practical implementation
- Trade-off comparison questions
- Past experience questions`,
      hard: `DIFFICULTY: HARD (6+ years experience)
- System design questions ("Design a system for X")
- Architecture decisions and trade-offs
- Leadership and mentoring scenarios
- Performance, scalability, cross-team collaboration`,
    };

    const prompt = `You are a senior technical interviewer. Generate exactly 8 interview questions.

Role: ${role}
Skills: ${topSkills.join(', ')||'general software engineering'}
Seniority: ${candidate.seniority||'Mid'}
Experience: ${candidate.experienceYears||'unknown'} years

${difficultyInstructions[difficulty]||difficultyInstructions.medium}

Return ONLY a valid JSON array of exactly 8 question strings:
["Question 1?","Question 2?","Question 3?","Question 4?","Question 5?","Question 6?","Question 7?","Question 8?"]`;

    let questions = [];

    if (process.env.GROQ_API_KEY) {
      try {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const resp = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role:'user', content:prompt }],
          temperature: difficulty==='easy'?0.2:difficulty==='hard'?0.5:0.35,
          max_tokens: 1000,
        });
        const text  = resp.choices[0].message.content.replace(/```json|```/g,'').trim();
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed) && parsed.length >= 4) questions = parsed.slice(0,8);
        }
      } catch (e) { console.error('[AI questions]', e.message); }
    }

    if (questions.length === 0) {
      const fallbacks = {
        easy:   [`What is ${topSkills[0]||role} and what is it used for?`,`Explain the basic concepts of ${topSkills[1]||'object-oriented programming'}.`,`How do you declare and use variables in your preferred language?`,`What is the difference between a function and a method?`,`What tools do you use for version control?`,`Describe your experience working in a team.`,`What is debugging and how do you fix a simple bug?`,`Where do you want to grow in the next 1-2 years?`],
        medium: [`Walk me through your experience with ${topSkills[0]||role}.`,`Describe a challenging project and how you overcame obstacles.`,`How do you approach debugging complex production issues?`,`What design patterns have you used and why?`,`How do you ensure code quality in your projects?`,`Describe your experience with agile methodologies.`,`How would you handle changing requirements mid-project?`,`How do you collaborate with cross-functional teams?`],
        hard:   [`Design a scalable ${topSkills[0]||'microservices'} architecture for high traffic.`,`Describe a time you led a complex technical initiative.`,`How would you migrate a monolithic app to microservices?`,`How do you ensure high availability in distributed systems?`,`Describe your approach to performance optimization at scale.`,`How do you mentor junior developers while delivering your own work?`,`What trade-offs exist between consistency and availability?`,`How would you handle a critical production incident with no clear root cause?`],
      };
      questions = fallbacks[difficulty]||fallbacks.medium;
    }

    await Candidate.findByIdAndUpdate(req.params.id, {
      interviewQuestions: questions, status:'questions_sent', updatedAt: new Date(),
    });

    res.json({ questions, difficulty, count: questions.length });
  } catch (err) {
    console.error('[questions]', err);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/candidates/:id/answers ─────────────────────────
// Uses enhanced 5-criteria scoring + weighted combined score
router.post('/:id/answers', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id)
      .populate('jobId', 'scoringWeights');
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    const { answers } = req.body;
    if (!answers?.length) return res.status(400).json({ message: 'No answers provided' });

    // Get configurable weights (default CV:60%, Screening:40%)
    const weights = candidate.jobId?.scoringWeights || { cvWeight:60, screeningWeight:40 };
    const cvWeight        = (weights.cvWeight        || 60) / 100;
    const screeningWeight = (weights.screeningWeight || 40) / 100;

    // Use enhanced scoring from aiService
    const { scoreScreeningAnswers } = require('../services/aiService');
    const { scoredAnswers, screeningScore } = await scoreScreeningAnswers(answers, {
      appliedFor: candidate.appliedFor || 'Software Engineer',
      topSkills:  candidate.topSkills  || [],
    });

    // Calculate screening breakdown averages
    const screeningBreakdown = {
      technical:         Math.round(scoredAnswers.reduce((a,s)=>a+(s.scoreBreakdown?.technical||0),0)/scoredAnswers.length),
      communication:     Math.round(scoredAnswers.reduce((a,s)=>a+(s.scoreBreakdown?.communication||0),0)/scoredAnswers.length),
      problemSolving:    Math.round(scoredAnswers.reduce((a,s)=>a+(s.scoreBreakdown?.problemSolving||0),0)/scoredAnswers.length),
      roleUnderstanding: Math.round(scoredAnswers.reduce((a,s)=>a+(s.scoreBreakdown?.roleUnderstanding||0),0)/scoredAnswers.length),
      motivation:        Math.round(scoredAnswers.reduce((a,s)=>a+(s.scoreBreakdown?.motivation||0),0)/scoredAnswers.length),
    };

    // Weighted combined score
    const cvScore       = candidate.aiScore || 0;
    const combinedScore = Math.round((cvScore * cvWeight) + (screeningScore * screeningWeight));

    // Determine recommendation based on combined score
    const recommendation =
      combinedScore >= 85 ? 'Strong Hire' :
      combinedScore >= 70 ? 'Hire'        :
      combinedScore >= 55 ? 'Consider'    :
      combinedScore >= 40 ? 'Weak Fit'    : 'Reject';

    const newStatus = combinedScore >= 60 ? 'hm_ready' : 'answers_submitted';

    const updated = await Candidate.findByIdAndUpdate(req.params.id, {
      screeningAnswers:    scoredAnswers,
      screeningScore,
      screeningBreakdown,
      combinedScore,
      recommendation,
      status:      newStatus,
      updatedAt:   new Date(),
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

    const resumeText = `Name: ${candidate.name}\nEmail: ${candidate.email}\nDomain: ${candidate.domain||''}\nSeniority: ${candidate.seniority||''}\nExperience: ${candidate.experienceYears||0} years\nSkills: ${(candidate.topSkills||[]).join(', ')}\nApplied For: ${candidate.appliedFor||''}\nSummary: ${candidate.summary||''}`.trim();

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
      databases:            (ai.databases          || []).slice(0,8),
      frameworks:           (ai.frameworks         || []).slice(0,8),
      tools:                (ai.tools              || []).slice(0,8),
      interviewFocusAreas:  (ai.interviewFocusAreas|| []).slice(0,5),
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
