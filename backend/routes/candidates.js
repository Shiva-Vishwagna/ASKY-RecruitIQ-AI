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
      .populate('jobId', 'title department location scoringWeights roleType')
      .sort({ createdAt: -1 });

    const enriched = candidates.map(c => {
      const obj = c.toObject();
      if (obj.jobId && typeof obj.jobId === 'object') {
        obj.jobTitle       = obj.appliedFor || obj.jobId.title || '';
        obj.jobDepartment  = obj.jobId.department || '';
        obj.jobLocation    = obj.jobId.location   || '';
        obj.scoringWeights = obj.jobId.scoringWeights || { cvWeight:60, screeningWeight:40 };
        obj.roleType       = obj.jobId.roleType || 'technical';
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
      .populate('jobId', 'title department scoringWeights roleType questionBank');
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
// roleType drives question style: technical vs non_technical
router.post('/:id/questions', protect, async (req, res) => {
  try {
    const c = await Candidate.findById(req.params.id)
      .populate('jobId', 'title roleType');
    if (!c) return res.status(404).json({ message: 'Candidate not found' });

    const { jobTitle, skills, difficulty = 'medium', roleType: bodyRoleType } = req.body;
    const role     = jobTitle || c.appliedFor || 'Professional';
    const roleType = bodyRoleType || c.jobId?.roleType || 'technical';
    const topSkills = (skills || c.topSkills || []).slice(0, 8);
    const isTech    = roleType !== 'non_technical';

    // ── Technical question prompts ──────────────────────────
    const techGuides = {
      easy:   `EASY (0-2 yrs): Core concept definitions, how things work internally. Example: "What is the difference between X and Y?", "How does X work under the hood?"`,
      medium: `MEDIUM (3-5 yrs): Real-world scenarios, optimization decisions, trade-offs. Example: "Your service is slow — how do you debug it?", "How would you design a caching layer?"`,
      hard:   `HARD (6+ yrs): System design, architectural trade-offs, production-scale problems. Example: "Design a system for 500K concurrent users", "Zero-downtime DB migration strategy"`,
    };

    // ── Non-technical question prompts ──────────────────────
    const nonTechGuides = {
      easy:   `ENTRY LEVEL: Questions about basic role knowledge, understanding of the industry, and common scenarios. Example: "How would you handle a client complaint?", "Describe your approach to managing a busy workload"`,
      medium: `MID LEVEL: Scenario-based questions requiring judgment and experience. Example: "Describe a time you resolved a difficult situation with a client", "How do you prioritize when everything is urgent?"`,
      hard:   `SENIOR LEVEL: Strategic thinking, leadership, complex scenario handling. Example: "How would you restructure a failing process?", "Describe how you built and managed a high-performing team"`,
    };

    const prompt = isTech
      ? `You are a Principal Engineer generating technical interview questions.
Role: ${role} | Skills: ${topSkills.join(', ')||role} | Seniority: ${c.seniority||'Mid'}
${techGuides[difficulty]||techGuides.medium}
ALL 8 questions must be purely TECHNICAL. Zero behavioral/HR questions.
At least 3 must reference these skills: ${topSkills.slice(0,3).join(', ')||role}
Return ONLY a JSON array of exactly 8 strings:
["Q1?","Q2?","Q3?","Q4?","Q5?","Q6?","Q7?","Q8?"]`

      : `You are an experienced HR interviewer and functional manager generating interview questions for a NON-TECHNICAL role.
Role: ${role} | Domain: ${c.domain||role} | Seniority: ${c.seniority||'Mid'}
Key competencies required: ${topSkills.join(', ')||'relevant domain skills'}
${nonTechGuides[difficulty]||nonTechGuides.medium}

Questions should assess: domain knowledge, judgment, communication, problem solving, and role fit.
DO NOT ask technical/IT questions. DO ask role-specific scenario and behavioral questions.
Return ONLY a JSON array of exactly 8 strings:
["Q1?","Q2?","Q3?","Q4?","Q5?","Q6?","Q7?","Q8?"]`;

    let questions = [];
    if (process.env.GROQ_API_KEY) {
      try {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const resp = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role:'user', content:prompt }],
          temperature: difficulty==='easy'?0.2:difficulty==='hard'?0.45:0.3,
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

    // ── Fallbacks ───────────────────────────────────────────
    if (questions.length === 0) {
      const skill1 = topSkills[0] || role;
      const skill2 = topSkills[1] || 'core competencies';

      const techFallbacks = {
        easy:   [`Explain how ${skill1} works internally.`,`What is the difference between ${skill1} and its main alternative?`,`How does indexing improve database query performance?`,`Explain synchronous vs asynchronous execution with a real example.`,`Walk through what happens when a client makes an HTTP request to a REST API.`,`What is a database transaction? Explain ACID properties.`,`How does memory management work in ${skill1}?`,`What is the difference between a stack and a heap?`],
        medium: [`Your ${skill1} service is slow under load. How do you debug it?`,`Design a caching layer for a high-traffic ${role} service. What invalidation strategy?`,`Explain the N+1 query problem and how to fix it in production.`,`How would you implement database connection pooling?`,`How do you add a column to a table with 50M rows in production?`,`How do you handle distributed transactions across microservices?`,`Design a rate limiter for an API. What data structure and algorithm?`,`What are the top 3 security vulnerabilities in ${skill1} and how do you mitigate them?`],
        hard:   [`Design a ${skill1} system handling 500K concurrent users. Architecture, data flow, failure modes.`,`Your service has intermittent P99 latency spikes in production. How do you diagnose and fix?`,`How would you migrate a live database to a new schema with zero downtime?`,`Design a distributed job queue with exactly-once execution guarantees.`,`Explain CAP theorem and how it drives your database choice for this system.`,`How would you implement multi-region active-active deployment?`,`Your service leaks 200MB/hour in production. Walk through diagnosis and resolution.`,`Design a system that handles both OLTP and OLAP workloads simultaneously.`],
      };

      const nonTechFallbacks = {
        easy:   [`How would you describe the core responsibilities of a ${role}?`,`How do you manage competing priorities when multiple tasks are urgent?`,`Describe your approach to building a positive relationship with a client or stakeholder.`,`What steps do you take to stay organized in a busy work environment?`,`How do you handle a situation where you disagree with a manager's decision?`,`Describe your experience working in a team. How do you handle conflict?`,`What do you know about ${skill2} and why is it important in this role?`,`How would you handle a situation where a client is unhappy with the service?`],
        medium: [`Describe a time you had to handle a difficult client or situation. What was your approach?`,`How do you prioritize tasks when everything is marked as urgent?`,`Tell me about a time you identified a problem in a process and improved it.`,`How do you build rapport with a new client or team member?`,`Describe a challenging project you led or contributed to. What was your role?`,`How do you measure success in a ${role} role?`,`Tell me about a time you had to learn something new quickly to deliver results.`,`How do you ensure quality and attention to detail in your work?`],
        hard:   [`How would you restructure an underperforming team or process?`,`Describe your approach to building a long-term client relationship from scratch.`,`How do you handle a major escalation or crisis situation at work?`,`What strategies do you use to grow revenue or client accounts?`,`How do you balance short-term deliverables with long-term strategic goals?`,`Describe a time you led a major change initiative. How did you manage resistance?`,`How would you mentor a junior team member who is struggling to meet expectations?`,`What does excellent performance in a ${role} role look like to you, and how do you achieve it?`],
      };

      const fallbackSet = isTech ? techFallbacks : nonTechFallbacks;
      questions = fallbackSet[difficulty] || fallbackSet.medium;
    }

    await Candidate.findByIdAndUpdate(req.params.id, {
      interviewQuestions: questions,
      status: 'questions_sent',
      updatedAt: new Date(),
    });

    res.json({ questions, difficulty, roleType, source: 'ai_generated', count: questions.length });
  } catch (err) {
    console.error('[questions]', err);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/candidates/:id/answers ─────────────────────────
router.post('/:id/answers', protect, async (req, res) => {
  try {
    const c = await Candidate.findById(req.params.id)
      .populate('jobId', 'scoringWeights title roleType');
    if (!c) return res.status(404).json({ message: 'Candidate not found' });

    const { answers, sessionType = 'ai_generated', difficulty = 'medium' } = req.body;
    if (!answers?.length) return res.status(400).json({ message: 'No answers provided' });

    const roleType        = c.jobId?.roleType || 'technical';
    const weights         = c.jobId?.scoringWeights || { cvWeight:60, screeningWeight:40 };
    const cvWeight        = (weights.cvWeight        || 60) / 100;
    const screeningWeight = (weights.screeningWeight || 40) / 100;

    const { scoreScreeningAnswers } = require('../services/aiService');
    const { scoredAnswers, screeningScore } = await scoreScreeningAnswers(answers, {
      appliedFor: c.appliedFor || c.jobId?.title || 'Professional',
      topSkills:  c.topSkills  || [],
      domain:     c.domain     || '',
      roleType,
    });

    // Average breakdown (works for both tech and non-tech)
    const avgBreakdown = {};
    const fields = Object.keys(scoredAnswers[0]?.scoreBreakdown || {});
    fields.forEach(f => {
      avgBreakdown[f] = Math.round(scoredAnswers.reduce((a,s)=>a+(s.scoreBreakdown?.[f]||0),0)/scoredAnswers.length);
    });

    const cvScore       = c.aiScore || 0;
    const combinedScore = Math.round((cvScore * cvWeight) + (screeningScore * screeningWeight));
    const recommendation =
      combinedScore >= 85 ? 'Strong Hire' :
      combinedScore >= 72 ? 'Hire'        :
      combinedScore >= 58 ? 'Consider'    :
      combinedScore >= 42 ? 'Weak Fit'    : 'Reject';

    const newSession = {
      sessionType, difficulty,
      conductedAt: new Date(),
      conductedBy: req.user.name || 'Recruiter',
      questions:   answers.map(a => a.question),
      answers:     scoredAnswers,
      screeningScore,
      screeningBreakdown: avgBreakdown,
    };

    const updated = await Candidate.findByIdAndUpdate(req.params.id, {
      $push:              { screeningSessions: newSession },
      screeningAnswers:    scoredAnswers,
      screeningScore,
      screeningBreakdown: avgBreakdown,
      combinedScore,
      recommendation,
      status:    'answers_submitted',
      updatedAt: new Date(),
    }, { new: true });

    await AuditLog.create({
      user: req.user.name, userId: req.user._id,
      action: 'ANSWERS_SUBMITTED', resource: 'candidates',
      details: `${c.name} | ${roleType} | ${sessionType} | CV:${cvScore} Screen:${screeningScore} → ${recommendation}`.slice(0,150),
    });

    res.json({ candidate: updated, screeningScore, screeningBreakdown: avgBreakdown,
      combinedScore, cvScore, recommendation, status: 'answers_submitted', roleType,
      weights: { cvWeight: weights.cvWeight, screeningWeight: weights.screeningWeight } });
  } catch (err) {
    console.error('[answers]', err);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/candidates/:id/hm-report ───────────────────────
router.post('/:id/hm-report', protect, async (req, res) => {
  try {
    const { reportType, sessionIndex } = req.body;
    const c = await Candidate.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Candidate not found' });

    const validTypes = ['cv_only', 'cv_ai_questions', 'cv_bank_questions'];
    if (!validTypes.includes(reportType)) return res.status(400).json({ message: 'Invalid reportType' });

    const cvScore = c.aiScore || 0;
    let finalScore, screenScore;

    if (reportType === 'cv_only') {
      finalScore  = cvScore;
      screenScore = null;
    } else {
      const targetType = reportType === 'cv_ai_questions' ? 'ai_generated' : 'bank_questions';
      const sessions   = (c.screeningSessions || []).filter(s => s.sessionType === targetType);
      const session    = sessionIndex != null ? sessions[sessionIndex] : sessions[sessions.length - 1];
      if (!session) return res.status(400).json({ message: `No ${targetType} session found. Complete screening first.` });
      screenScore = session.screeningScore;
      finalScore  = Math.round((cvScore * 0.60) + (screenScore * 0.40));
    }

    const finalRec =
      finalScore >= 85 ? 'Strong Hire' :
      finalScore >= 72 ? 'Hire'        :
      finalScore >= 58 ? 'Consider'    :
      finalScore >= 42 ? 'Weak Fit'    : 'Reject';

    const updated = await Candidate.findByIdAndUpdate(req.params.id, {
      hmReportType: reportType, combinedScore: finalScore,
      recommendation: finalRec, status: 'hm_ready', updatedAt: new Date(),
    }, { new: true });

    await AuditLog.create({
      user: req.user.name, userId: req.user._id, action: 'HM_REPORT_SET',
      resource: 'candidates',
      details: `${c.name} | ${reportType} | Score:${finalScore} | ${finalRec}`.slice(0,150),
    });

    res.json({ candidate: updated, reportType, finalScore, screenScore, recommendation: finalRec });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/candidates/:id/rescreen ────────────────────────
router.post('/:id/rescreen', protect, async (req, res) => {
  try {
    const c = await Candidate.findById(req.params.id)
      .populate('jobId', 'roleType title primarySkill requiredSkills level');
    if (!c) return res.status(404).json({ message: 'Candidate not found' });

    const { screenResumeWithAI, calculateCVScore, determineTier } = require('../services/aiService');

    const jobContext = c.jobId ? {
      title:         c.jobId.title        || c.appliedFor || '',
      roleType:      c.jobId.roleType     || 'technical',
      primarySkill:  c.jobId.primarySkill || '',
      requiredSkills:c.jobId.requiredSkills || [],
      level:         c.jobId.level        || '',
    } : c.appliedFor || '';

    const resumeText = `Name: ${c.name}\nEmail: ${c.email}\nDomain: ${c.domain||''}\nSeniority: ${c.seniority||''}\nExperience: ${c.experienceYears||0} years\nSkills: ${(c.topSkills||[]).join(', ')}\nApplied For: ${c.appliedFor||''}\nSummary: ${c.summary||''}`.trim();

    const ai = await screenResumeWithAI(resumeText, jobContext);
    if (!ai) return res.status(500).json({ message: 'AI screening failed — check GROQ_API_KEY in Render environment' });

    const roleType = typeof jobContext === 'object' ? (jobContext.roleType || 'technical') : 'technical';
    const cvScore  = calculateCVScore(ai.cvScoreBreakdown, roleType);
    const tier     = determineTier(cvScore);
    const t = (s,n) => (s||'').slice(0,n);
    const a = (arr,n) => (Array.isArray(arr)?arr:[]).slice(0,n);

    const updated = await Candidate.findByIdAndUpdate(req.params.id, {
      aiScore: cvScore, cvScoreBreakdown: ai.cvScoreBreakdown||{}, tier,
      riskLevel: t(ai.riskLevel||'medium',10), riskFlags: ai.riskFlags||{},
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
      status: 'ai_screened', updatedAt: new Date(),
    }, { new: true });

    res.json({ candidate: updated, aiScore: updated.aiScore, tier: updated.tier, roleType });
  } catch (err) {
    console.error('[rescreen]', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
