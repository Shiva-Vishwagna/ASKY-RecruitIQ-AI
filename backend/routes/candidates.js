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
    const isAdmin = req.user.role === 'admin';
    // Admins see all candidates; recruiters see only their own uploads
    const filter = isAdmin ? {} : {
      $or: [
        { uploadedBy: req.user._id },
        { uploadedByName: req.user.name }
      ]
    };
    const candidates = await Candidate.find(filter).sort({ createdAt: -1 });
    res.json({ candidates });
  } catch (err) {
    console.error('[GET /candidates]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/candidates/:id
// Fetch single candidate details
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
// Update candidate status, notes, or other fields
// ─────────────────────────────────────────────────────────────────
router.patch('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, hmReportType } = req.body;

    const update = {};
    if (status) update.status = status;
    if (notes) update.notes = notes;
    if (hmReportType) update.hmReportType = hmReportType;

    const candidate = await Candidate.findByIdAndUpdate(
      id,
      update,
      { new: true }
    );

    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    // Audit log
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
// Delete a candidate
// ─────────────────────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;

    const candidate = await Candidate.findByIdAndDelete(id);

    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    // Audit log
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
// Re-run AI screening on candidate with new context
// ─────────────────────────────────────────────────────────────────
router.post('/:id/rescreen', protect, async (req, res) => {
  try {
    const { id } = req.params;

    const candidate = await Candidate.findById(id);
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    // TODO: Get candidate's CV/resume text from somewhere
    // For now, we'll re-analyze with stored data
    
    console.log(`[rescreen] Running AI rescreen for ${candidate.name}`);
    
    // Update the candidate with rescreen timestamp
    candidate.rescreenedAt = new Date();
    await candidate.save();

    // Audit log
    await AuditLog.create({
      user: req.user.name,
      userId: req.user._id,
      action: 'CANDIDATE_RESCREENED',
      resource: 'candidates',
      details: `${candidate.name} - AI rescreen initiated`
    }).catch(() => {});

    res.json({ 
      message: 'Candidate rescreen initiated',
      candidate 
    });
  } catch (err) {
    console.error('[POST /rescreen]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/candidates/:id/questions
// Generate or update interview questions for candidate
// ─────────────────────────────────────────────────────────────────
router.post('/:id/questions', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { mode = 'ai', difficulty = 'medium', count = 5 } = req.body;

    const candidate = await Candidate.findById(id);
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    console.log(`[questions] Generating ${mode} questions for ${candidate.name}`);

    let questions = [];

    if (mode === 'ai') {
      // Generate AI questions based on candidate profile
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
        // Return error but don't crash
        return res.status(500).json({ 
          message: `Failed to generate questions: ${aiErr.message}`,
          suggestion: 'Check if GROQ_API_KEY is set in environment variables'
        });
      }
    } else if (mode === 'bank') {
      // Load questions from question bank for the job
      // This would require fetching from job settings
      questions = [];
    }

    // Store questions in candidate record
    candidate.interviewQuestions = questions;
    await candidate.save();

    // Audit log
    await AuditLog.create({
      user: req.user.name,
      userId: req.user._id,
      action: 'QUESTIONS_GENERATED',
      resource: 'candidates',
      details: `${candidate.name} | ${mode} | ${questions.length} questions`
    }).catch(() => {});

    res.json({ 
      questions,
      count: questions.length,
      mode,
      difficulty
    });
  } catch (err) {
    console.error('[POST /questions]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/candidates/:id/answers
// Submit and score screening answers
// ─────────────────────────────────────────────────────────────────
router.post('/:id/answers', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { answers, questions, sessionType = 'ai_generated', difficulty = 'medium' } = req.body;

    const candidate = await Candidate.findById(id);
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    console.log(`[answers] Evaluating ${answers?.length || 0} answers for ${candidate.name}`);

    // Score answers using AI
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
      return res.status(500).json({ 
        message: `Failed to evaluate answers: ${aiErr.message}`
      });
    }

    // Create screening session - handle both string arrays and object arrays
    const normalizedAnswers = answers.map((ans, i) => ({
      question: questions[i] || (typeof ans === 'object' ? ans.question : ''),
      userAnswer: typeof ans === 'object' ? ans.answer : ans,
      aiScore: screeningResults?.scores?.[i] || 0,
      aiFeedback: screeningResults?.feedback?.[i] || ''
    }));

    const session = {
      sessionType,
      difficulty,
      conductedAt: new Date(),
      conductedBy: req.user.name,
      answers: normalizedAnswers,
      screeningScore: screeningResults?.overallScore || 0,
      screeningBreakdown: screeningResults?.breakdown || {}
    };

    // Add session to candidate
    if (!candidate.screeningSessions) {
      candidate.screeningSessions = [];
    }
    candidate.screeningSessions.push(session);
    candidate.screeningScore = session.screeningScore;
    candidate.screeningAnswers = session.answers;
    candidate.status = 'answers_submitted';

    await candidate.save();

    // Audit log
    await AuditLog.create({
      user: req.user.name,
      userId: req.user._id,
      action: 'SCREENING_SUBMITTED',
      resource: 'candidates',
      details: `${candidate.name} | Score: ${session.screeningScore} | ${sessionType}`
    }).catch(() => {});

    res.json({
      message: 'Answers evaluated successfully',
      session,
      overallScore: session.screeningScore,
      screeningScore: session.screeningScore,
      combinedScore: candidate.combinedScore || session.screeningScore,
      recommendation: candidate.recommendation,
      candidate: {
        _id: candidate._id,
        screeningScore: candidate.screeningScore,
        combinedScore: candidate.combinedScore,
        status: candidate.status,
        screeningSessions: candidate.screeningSessions
      }
    });
  } catch (err) {
    console.error('[POST /answers]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/candidates/:id/hm-report
// Generate final HM (Hiring Manager) report
// ─────────────────────────────────────────────────────────────────
router.post('/:id/hm-report', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { hmReportType = 'cv_only' } = req.body;

    const candidate = await Candidate.findById(id);
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    console.log(`[hm-report] Generating ${hmReportType} report for ${candidate.name}`);

    // Calculate combined score based on report type
    let finalScore = candidate.aiScore || 0;
    let recommendation = candidate.recommendation || 'Consider';

    if (hmReportType === 'cv_ai_questions') {
      // Weighted average: CV (60%) + AI Screening (40%)
      if (candidate.screeningScore) {
        finalScore = Math.round(
          (candidate.aiScore || 0) * 0.6 + 
          (candidate.screeningScore || 0) * 0.4
        );
      }
    } else if (hmReportType === 'cv_bank_questions') {
      // Similar weighting for bank questions
      if (candidate.screeningScore) {
        finalScore = Math.round(
          (candidate.aiScore || 0) * 0.6 + 
          (candidate.screeningScore || 0) * 0.4
        );
      }
    }

    // Generate HM recommendations
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
      // Continue with default recommendation
    }

    // Update candidate
    candidate.combinedScore = finalScore;
    candidate.hmReportType = hmReportType;
    candidate.recommendation = recommendation;
    candidate.status = 'hm_ready';

    await candidate.save();

    // Audit log
    await AuditLog.create({
      user: req.user.name,
      userId: req.user._id,
      action: 'HM_REPORT_GENERATED',
      resource: 'candidates',
      details: `${candidate.name} | Score: ${finalScore} | ${recommendation}`
    }).catch(() => {});

    res.json({
      message: 'HM Report generated successfully',
      finalScore,
      recommendation,
      reportType: hmReportType,
      candidate
    });
  } catch (err) {
    console.error('[POST /hm-report]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/candidates/:id/transcript-screen
// Process Webex/Teams/Zoom transcript and score answers
// ─────────────────────────────────────────────────────────────────
router.post('/:id/transcript-screen', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { transcript, questions, sessionType = 'ai_generated', difficulty = 'medium', meetingSource = 'webex' } = req.body;

    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ message: 'Transcript text is required' });
    }
    if (!questions || questions.length === 0) {
      return res.status(400).json({ message: 'No questions found. Please generate questions first.' });
    }

    const candidate = await Candidate.findById(id);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    console.log(`[transcript-screen] Processing ${meetingSource} transcript for ${candidate.name} — ${questions.length} questions`);

    // Build AI prompt to extract answers from transcript
    const questionsList = questions.map((q, idx) => (idx+1) + '. ' + q).join('\n');
    const prompt = `You are analyzing a job interview transcript to extract and score candidate answers.

INTERVIEW QUESTIONS ASKED:
${questionsList}

MEETING TRANSCRIPT:
${transcript.substring(0, 6000)}

TASK:
1. Find the candidate's answer to each question in the transcript
2. If a question wasn't answered, note "Not answered in transcript"
3. Score each answer from 0-100 based on: accuracy, depth, relevance, clarity
4. Give brief feedback for each answer

Return ONLY this JSON (no markdown):
{
  "answers": [
    {
      "question": "question text",
      "extractedAnswer": "candidate's answer from transcript",
      "score": 75,
      "feedback": "Brief feedback on the answer"
    }
  ],
  "overallScore": 72,
  "transcriptQuality": "good/partial/poor",
  "notes": "Any observations about the interview"
}`;

    let scoringResult = null;
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 2000
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.choices[0]?.message?.content || '{}';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) scoringResult = JSON.parse(jsonMatch[0]);
      }
    } catch (aiErr) {
      console.error('[transcript-screen AI error]', aiErr.message);
    }

    // Build session from AI result or fallback
    const answersData = scoringResult?.answers || questions.map((q, i) => ({
      question: q,
      extractedAnswer: 'Could not extract from transcript',
      score: 0,
      feedback: 'Answer extraction failed'
    }));

    const overallScore = scoringResult?.overallScore ||
      Math.round(answersData.reduce((s, a) => s + (a.score || 0), 0) / answersData.length);

    const session = {
      sessionType,
      difficulty,
      conductedAt: new Date(),
      conductedBy: req.user.name,
      meetingSource,
      transcriptUsed: true,
      answers: answersData.map((a, i) => ({
        question: a.question || questions[i] || '',
        userAnswer: a.extractedAnswer || '',
        aiScore: a.score || 0,
        aiFeedback: a.feedback || ''
      })),
      screeningScore: overallScore,
      screeningBreakdown: { transcriptQuality: scoringResult?.transcriptQuality, notes: scoringResult?.notes }
    };

    if (!candidate.screeningSessions) candidate.screeningSessions = [];
    candidate.screeningSessions.push(session);
    candidate.screeningScore = overallScore;
    candidate.status = 'answers_submitted';
    await candidate.save();

    await AuditLog.create({
      user: req.user.name,
      userId: req.user._id,
      action: 'TRANSCRIPT_SCREENED',
      resource: 'candidates',
      details: `${candidate.name} | ${meetingSource} transcript | Score: ${overallScore}`
    }).catch(() => {});

    console.log(`[transcript-screen] ✅ ${candidate.name} scored ${overallScore}/100 from transcript`);

    res.json({
      message: 'Transcript processed successfully',
      session,
      overallScore,
      screeningScore: overallScore,
      transcriptQuality: scoringResult?.transcriptQuality || 'unknown',
      candidate: {
        _id: candidate._id,
        screeningScore: candidate.screeningScore,
        status: candidate.status
      }
    });

  } catch (err) {
    console.error('[POST /transcript-screen]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/candidates/:id/questions
// Fetch stored interview questions for candidate
// ─────────────────────────────────────────────────────────────────
router.get('/:id/questions', protect, async (req, res) => {
  try {
    const { id } = req.params;

    const candidate = await Candidate.findById(id).select('interviewQuestions');
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    res.json({ 
      questions: candidate.interviewQuestions || [],
      count: (candidate.interviewQuestions || []).length
    });
  } catch (err) {
    console.error('[GET /questions]', err.message);
    res.status(500).json({ message: err.message });
  }
});


// ── POST /api/candidates/:id/notes ───────────────────────────────
router.post('/:id/notes', protect, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: 'Note text required' });
    const candidate = await Candidate.findByIdAndUpdate(
      req.params.id,
      { $push: { notes: { text: text.trim(), createdBy: req.user.name, createdAt: new Date() } } },
      { new: true }
    );
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });
    res.json({ notes: candidate.notes });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── DELETE /api/candidates/:id/notes/:noteId ─────────────────────
router.delete('/:id/notes/:noteId', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findByIdAndUpdate(
      req.params.id,
      { $pull: { notes: { _id: req.params.noteId } } },
      { new: true }
    );
    res.json({ notes: candidate?.notes || [] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/candidates/bulk-rescreen ───────────────────────────
router.post('/bulk-rescreen', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
    const zeroCandidates = await Candidate.find({ aiScore: { $in: [0, null] } }).select('_id name').limit(50);
    res.json({ candidates: zeroCandidates, count: zeroCandidates.length, message: `Found ${zeroCandidates.length} candidates needing re-screen` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/candidates/check-duplicate ──────────────────────────
router.get('/check-duplicate', protect, async (req, res) => {
  try {
    const { name, email } = req.query;
    const query = [];
    if (name) query.push({ name: new RegExp(name.trim(), 'i') });
    if (email) query.push({ email: email.trim().toLowerCase() });
    if (!query.length) return res.json({ duplicate: false });
    const existing = await Candidate.findOne({ $or: query }).select('_id name email appliedFor createdAt');
    res.json({ duplicate: !!existing, existing: existing || null });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── PATCH /api/candidates/:id/interview-date ─────────────────────
router.patch('/:id/interview-date', protect, async (req, res) => {
  try {
    const { interviewDate, interviewNotes } = req.body;
    const update = {};
    if (interviewDate !== undefined) update.interviewDate = interviewDate ? new Date(interviewDate) : null;
    if (interviewNotes !== undefined) update.interviewNotes = interviewNotes;
    const candidate = await Candidate.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });
    await AuditLog.create({ user: req.user.name, userId: req.user._id, action: 'INTERVIEW_SCHEDULED', resource: 'candidates', details: `${candidate.name} | ${interviewDate}` }).catch(() => {});
    res.json({ candidate });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
