const express  = require('express');
const router   = express.Router();
const Candidate = require('../models/Candidate');
const AuditLog  = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const { 
  screenResumeWithAI, 
  calculateCVScore, 
  determineTier,
  generateInterviewQuestions,
  evaluateScreeningAnswers,
  generateHMReport 
} = require('../services/aiService');

// ─────────────────────────────────────────────────────────────────
// GET /api/candidates
// ─────────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const candidates = await Candidate.find().sort({ createdAt: -1 });
    res.json({ candidates });
  } catch (err) {
    console.error('[GET /candidates]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/candidates/:id
// ─────────────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id.length !== 24) {
      return res.status(400).json({ message: 'Invalid candidate ID' });
    }
    const candidate = await Candidate.findById(id).lean();
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    res.json({ candidate });
  } catch (err) {
    console.error('[GET /candidates/:id]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PATCH /api/candidates/:id
// ─────────────────────────────────────────────────────────────────
router.patch('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, hmReportType } = req.body;
    const update = {};
    if (status) update.status = status;
    if (notes) update.notes = notes;
    if (hmReportType) update.hmReportType = hmReportType;
    const candidate = await Candidate.findByIdAndUpdate(id, update, { new: true });
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    await AuditLog.create({
      user: req.user.name,
      userId: req.user._id,
      action: 'CANDIDATE_UPDATED',
      resource: 'candidates',
      details: `${candidate.name} | ${status || 'notes updated'}`
    }).catch(() => {});
    res.json({ candidate });
  } catch (err) {
    console.error('[PATCH /candidates/:id]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/candidates/:id
// ─────────────────────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const candidate = await Candidate.findByIdAndDelete(id);
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    await AuditLog.create({
      user: req.user.name,
      userId: req.user._id,
      action: 'CANDIDATE_DELETED',
      resource: 'candidates',
      details: `${candidate.name} (${id})`
    }).catch(() => {});
    res.json({ message: 'Candidate deleted successfully' });
  } catch (err) {
    console.error('[DELETE /candidates/:id]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/candidates/:id/rescreen
// ─────────────────────────────────────────────────────────────────
router.post('/:id/rescreen', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const candidate = await Candidate.findById(id);
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    candidate.rescreenedAt = new Date();
    await candidate.save();
    await AuditLog.create({
      user: req.user.name,
      userId: req.user._id,
      action: 'CANDIDATE_RESCREENED',
      resource: 'candidates',
      details: `${candidate.name} - AI rescreen initiated`
    }).catch(() => {});
    res.json({ message: 'Candidate rescreen initiated', candidate });
  } catch (err) {
    console.error('[POST /rescreen]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/candidates/:id/questions
// ─────────────────────────────────────────────────────────────────
router.post('/:id/questions', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { mode = 'ai', difficulty = 'medium', count = 5 } = req.body;
    const candidate = await Candidate.findById(id);
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    let questions = [];
    if (mode === 'ai') {
      try {
        questions = await generateInterviewQuestions({
          candidateName: candidate.name,
          skills: candidate.topSkills || [],
          experience: candidate.experienceYears,
          domain: candidate.domain,
          difficulty,
          count
        });
      } catch (aiErr) {
        console.error('[questions AI error]', aiErr.message);
        return res.status(500).json({ 
          message: `Failed to generate questions: ${aiErr.message}`,
          suggestion: 'Check if GROQ_API_KEY is set in environment variables'
        });
      }
    }
    candidate.interviewQuestions = questions;
    await candidate.save();
    await AuditLog.create({
      user: req.user.name,
      userId: req.user._id,
      action: 'QUESTIONS_GENERATED',
      resource: 'candidates',
      details: `${candidate.name} | ${mode} | ${questions.length} questions`
    }).catch(() => {});
    res.json({ questions, count: questions.length, mode, difficulty });
  } catch (err) {
    console.error('[POST /questions]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/candidates/:id/answers
// ─────────────────────────────────────────────────────────────────
router.post('/:id/answers', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { answers, questions, sessionType = 'ai_generated', difficulty = 'medium' } = req.body;
    const candidate = await Candidate.findById(id);
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    let screeningResults = null;
    try {
      screeningResults = await evaluateScreeningAnswers({
        questions,
        answers,
        candidateName: candidate.name,
        skills: candidate.topSkills || [],
        domain: candidate.domain
      });
    } catch (aiErr) {
      console.error('[answers evaluation error]', aiErr.message);
      return res.status(500).json({ message: `Failed to evaluate answers: ${aiErr.message}` });
    }
    const session = {
      sessionType,
      difficulty,
      conductedAt: new Date(),
      conductedBy: req.user.name,
      answers: answers.map((ans, i) => ({
        question: questions[i],
        userAnswer: ans,
        aiScore: screeningResults?.scores[i] || 0,
        aiFeedback: screeningResults?.feedback[i] || ''
      })),
      screeningScore: screeningResults?.overallScore || 0,
      screeningBreakdown: screeningResults?.breakdown || {}
    };
    if (!candidate.screeningSessions) candidate.screeningSessions = [];
    candidate.screeningSessions.push(session);
    candidate.screeningScore = session.screeningScore;
    candidate.screeningAnswers = session.answers;
    candidate.status = 'answers_submitted';
    await candidate.save();
    await AuditLog.create({
      user: req.user.name,
      userId: req.user._id,
      action: 'SCREENING_SUBMITTED',
      resource: 'candidates',
      details: `${candidate.name} | Score: ${session.screeningScore} | ${sessionType}`
    }).catch(() => {});
    res.json({ message: 'Answers evaluated successfully', session, overallScore: session.screeningScore });
  } catch (err) {
    console.error('[POST /answers]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/candidates/:id/hm-report
// ─────────────────────────────────────────────────────────────────
router.post('/:id/hm-report', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { hmReportType = 'cv_only' } = req.body;
    const candidate = await Candidate.findById(id);
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    let finalScore = candidate.aiScore || 0;
    let recommendation = candidate.recommendation || 'Consider';
    if (hmReportType === 'cv_ai_questions' || hmReportType === 'cv_bank_questions') {
      if (candidate.screeningScore) {
        finalScore = Math.round((candidate.aiScore || 0) * 0.6 + (candidate.screeningScore || 0) * 0.4);
      }
    }
    try {
      const hmReport = await generateHMReport({
        candidate: {
          name: candidate.name,
          topSkills: candidate.topSkills,
          experience: candidate.experienceYears,
          domain: candidate.domain,
          cvScore: candidate.aiScore,
          screeningScore: candidate.screeningScore,
          strengths: candidate.strengths,
          gaps: candidate.gaps
        },
        reportType: hmReportType
      });
      recommendation = hmReport?.recommendation || recommendation;
    } catch (aiErr) {
      console.warn('[hm-report AI error]', aiErr.message);
    }
    candidate.combinedScore = finalScore;
    candidate.hmReportType = hmReportType;
    candidate.recommendation = recommendation;
    candidate.status = 'hm_ready';
    await candidate.save();
    await AuditLog.create({
      user: req.user.name,
      userId: req.user._id,
      action: 'HM_REPORT_GENERATED',
      resource: 'candidates',
      details: `${candidate.name} | Score: ${finalScore} | ${recommendation}`
    }).catch(() => {});
    res.json({ message: 'HM Report generated successfully', finalScore, recommendation, reportType: hmReportType, candidate });
  } catch (err) {
    console.error('[POST /hm-report]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/candidates/:id/questions
// ─────────────────────────────────────────────────────────────────
router.get('/:id/questions', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const candidate = await Candidate.findById(id).select('interviewQuestions');
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    res.json({ questions: candidate.interviewQuestions || [], count: (candidate.interviewQuestions || []).length });
  } catch (err) {
    console.error('[GET /questions]', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
