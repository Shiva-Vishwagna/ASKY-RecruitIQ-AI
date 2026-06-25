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
// Re-run full AI scoring using candidate's stored profile data
// ─────────────────────────────────────────────────────────────────
router.post('/:id/rescreen', protect, async (req, res) => {
  try {
    const { id } = req.params;

    const candidate = await Candidate.findById(id).populate('jobId');
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    console.log(`[rescreen] Re-scoring ${candidate.name} using stored profile data`);

    // Build a rich text summary from stored candidate data to re-run AI on
    const profileText = [
      `Name: ${candidate.name}`,
      candidate.email ? `Email: ${candidate.email}` : '',
      candidate.phone ? `Phone: ${candidate.phone}` : '',
      candidate.seniority ? `Seniority: ${candidate.seniority}` : '',
      candidate.experienceYears ? `Experience: ${candidate.experienceYears} years` : '',
      candidate.domain ? `Domain: ${candidate.domain}` : '',
      (candidate.topSkills||[]).length ? `Skills: ${candidate.topSkills.join(', ')}` : '',
      (candidate.frameworks||[]).length ? `Frameworks: ${candidate.frameworks.join(', ')}` : '',
      (candidate.databases||[]).length ? `Databases: ${candidate.databases.join(', ')}` : '',
      (candidate.tools||[]).length ? `Tools: ${candidate.tools.join(', ')}` : '',
      candidate.technicalExperience ? `Technical Background: ${candidate.technicalExperience}` : '',
      candidate.leadershipExperience ? `Leadership: ${candidate.leadershipExperience}` : '',
      candidate.companiesWorkedAt ? `Companies Worked At: ${candidate.companiesWorkedAt}` : '',
      candidate.averageTenureYears ? `Average Tenure: ${candidate.averageTenureYears} years` : '',
      (candidate.shortTenureCompanies||[]).length ? `Short Tenure Companies: ${candidate.shortTenureCompanies.join(', ')}` : '',
      (candidate.projectDomains||[]).length ? `Project Domains: ${candidate.projectDomains.join(', ')}` : '',
      (candidate.strengths||[]).length ? `Strengths: ${candidate.strengths.join(', ')}` : '',
      (candidate.gaps||[]).length ? `Gaps: ${candidate.gaps.join(', ')}` : '',
      candidate.summary ? `Summary: ${candidate.summary}` : '',
    ].filter(Boolean).join('\n');


    if (!profileText || profileText.length < 50) {
      return res.status(400).json({ 
        message: 'Not enough candidate data to re-screen. Please re-upload the CV file.' 
      });
    }

    // Get job context
    const jobContext = candidate.jobId && typeof candidate.jobId === 'object'
      ? {
          title: candidate.appliedFor || candidate.jobTitle || 'General Role',
          roleType: candidate.jobId.roleType || 'technical',
          primarySkill: candidate.jobId.primarySkill || '',
          requiredSkills: candidate.jobId.requiredSkills || [],
          level: candidate.jobId.level || '',
        }
      : {
          title: candidate.appliedFor || candidate.jobTitle || 'General Role',
          roleType: 'technical',
        };

    // Run full AI screening
    const ai = await screenResumeWithAI(profileText, jobContext);

    if (!ai) {
      return res.status(503).json({ 
        message: 'AI screening failed — all providers are rate limited. Try again in a minute.' 
      });
    }

    // Detect domain mismatch
    const roleType = jobContext.roleType || 'technical';
    const candidateSkillsText = (candidate.topSkills || []).join(' ').toLowerCase();
    const isTechCandidate = /java|python|react|node|sql|aws|cloud|developer|engineer|software|backend|frontend|devops|api/i.test(candidateSkillsText);
    const isNonTechRole = roleType === 'non_technical';
    const domainMismatch = !!(ai.riskFlags?.domainMismatch) || (isNonTechRole && isTechCandidate);

    const cvScore = calculateCVScore(ai.cvScoreBreakdown, roleType, domainMismatch);
    const tier    = determineTier(cvScore);

    // Update all fields
    const num  = (v, max=100) => { const n = Number(v); return (isNaN(n)||n<0) ? 0 : Math.min(n, max); };
    const arr  = (v, max=10) => Array.isArray(v) ? v.slice(0, max) : [];
    const trunc = (s, max=500) => typeof s === 'string' ? s.substring(0, max) : '';

    Object.assign(candidate, {
      aiScore:      cvScore,
      combinedScore: cvScore,
      tier,
      cvScoreBreakdown: {
        skillsMatchScore: num(ai.cvScoreBreakdown?.skillsMatchScore),
        stabilityScore:   num(ai.cvScoreBreakdown?.stabilityScore),
      },
      riskLevel:    trunc(ai.riskLevel || 'medium', 10),
      riskFlags: {
        frequentJobChanges:    !!ai.riskFlags?.frequentJobChanges,
        noticePeriodRisk:      trunc(ai.riskFlags?.noticePeriodRisk || '', 100),
        missingMandatorySkills: arr(ai.riskFlags?.missingMandatorySkills, 5).map(s => trunc(s, 50)),
        domainMismatch:        domainMismatch,
      },
      recommendation: trunc(ai.recommendation || 'Consider', 20),
      recommendationReason: trunc(ai.recommendationReason || '', 300),
      summary:       trunc(ai.summary || '', 500),
      hmSummary:     trunc(ai.hmSummary || '', 800),
      strengths:     arr(ai.strengths, 4).map(s => trunc(s, 200)),
      gaps:          arr(ai.gaps, 4).map(s => trunc(s, 200)),
      interviewFocusAreas: arr(ai.interviewFocusAreas, 5).map(s => trunc(s, 200)),
      topSkills:     arr(ai.topSkills || candidate.topSkills, 10).map(s => trunc(s, 50)),
      skillScores:   arr(ai.skillScores, 8).map(s => ({ skill: trunc(s.skill||'', 50), score: num(s.score) })),
      databases:     arr(ai.databases || candidate.databases, 8).map(s => trunc(s, 50)),
      frameworks:    arr(ai.frameworks || candidate.frameworks, 8).map(s => trunc(s, 50)),
      tools:         arr(ai.tools || candidate.tools, 8).map(s => trunc(s, 50)),
      status:        'ai_screened',
      rescreenedAt:  new Date(),
    });

    await candidate.save();

    await AuditLog.create({
      user: req.user.name,
      userId: req.user._id,
      action: 'CANDIDATE_RESCREENED',
      resource: 'candidates',
      details: `${candidate.name} | Score: ${cvScore} | ${tier}`
    }).catch(() => {});

    console.log(`[rescreen] ✅ ${candidate.name} rescreened — Score: ${cvScore} | ${tier}`);

    res.json({ 
      message: 'Re-screen complete',
      candidate,
      cvScore,
      tier
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
// ─────────────────────────────────────────────────────────────────
router.post('/:id/transcript-screen', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { transcript, questions, sessionType = 'bank_questions', difficulty = 'medium', meetingSource = 'webex' } = req.body;

    if (!transcript || !transcript.trim()) return res.status(400).json({ message: 'Transcript text is required' });
    if (!questions || questions.length === 0) return res.status(400).json({ message: 'No questions found. Please generate questions first.' });

    const candidate = await Candidate.findById(id);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    console.log(`[transcript-screen] ${meetingSource} transcript for ${candidate.name} — ${questions.length} Qs`);

    // ── Pre-process transcript ────────────────────────────────────
    // Detect format and extract candidate speech intelligently
    // Supported formats:
    // 1. Webex: "0:32 : Speaker Name : text"
    // 2. Teams: "[00:01:23] Speaker: text"
    // 3. Zoom:  "Speaker Name: text"
    // 4. Plain: any text

    const lines = transcript.split('\n').map(l => l.trim()).filter(Boolean);
    
    // Detect Webex format: "timestamp : Speaker : text"
    const isWebex = lines.some(l => /^\d+:\d+\s*:\s*.+\s*:\s*.+/.test(l));
    
    let processedTranscript = transcript;
    let detectedSpeakers = [];

    if (isWebex) {
      // Parse Webex format — group consecutive lines by same speaker
      const parsed = [];
      for (const line of lines) {
        const match = line.match(/^(\d+:\d+)\s*:\s*(.+?)\s*:\s*(.+)$/);
        if (match) {
          const [, time, speaker, text] = match;
          const last = parsed[parsed.length - 1];
          if (last && last.speaker === speaker.trim()) {
            last.text += ' ' + text.trim(); // merge consecutive lines from same speaker
          } else {
            parsed.push({ time, speaker: speaker.trim(), text: text.trim() });
          }
          if (!detectedSpeakers.includes(speaker.trim())) detectedSpeakers.push(speaker.trim());
        }
      }

      // Identify who is the candidate (not the interviewer, not admin)
      // Candidate is the person answering questions, not the one asking them
      // Heuristic: the person who speaks AFTER the interviewer's questions
      const questionKeywords = /question|how|what|explain|describe|tell me|can you|could you/i;
      const interviewerCandidates = {};
      for (let i = 0; i < parsed.length - 1; i++) {
        if (questionKeywords.test(parsed[i].text)) {
          // Next speaker after a question is likely the candidate
          const responder = parsed[i+1]?.speaker;
          if (responder && responder !== parsed[i].speaker) {
            interviewerCandidates[responder] = (interviewerCandidates[responder] || 0) + 1;
          }
        }
      }
      
      const likelyCandidateName = Object.entries(interviewerCandidates)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || '';

      console.log(`[transcript-screen] Detected candidate: "${likelyCandidateName}" | Speakers: ${detectedSpeakers.join(', ')}`);

      // Build clean transcript showing Q&A pairs clearly
      processedTranscript = parsed.map(p => {
        const role = p.speaker === likelyCandidateName ? 'CANDIDATE' : 'INTERVIEWER';
        return `[${p.time}] ${role} (${p.speaker}): ${p.text}`;
      }).join('\n');
    }

    // ── AI Scoring ────────────────────────────────────────────────
    const { callWithFallback } = require('../services/multiAiProviders');
    const questionsList = questions.map((q, i) => `${i+1}. ${q}`).join('\n');

    const prompt = `You are a senior technical interviewer analyzing a job interview transcript.

INTERVIEW QUESTIONS (${questions.length} total):
${questionsList}

TRANSCRIPT (${isWebex ? 'Webex format, pre-processed' : 'raw'}):
${processedTranscript.substring(0, 7000)}

INSTRUCTIONS:
- Extract what the CANDIDATE said in response to each question
- The CANDIDATE label shows who is being interviewed
- Score each answer 0-100: accuracy, depth, completeness, clarity
- "I don't know" or no answer = 0-10
- Partial answer = 20-50
- Good answer = 60-80
- Excellent detailed answer = 80-100
- If question was not asked in this interview, set score to -1
- Merge consecutive candidate lines that form one answer

Return ONLY valid JSON, no markdown:
{
  "candidateName": "detected name of candidate",
  "answers": [
    {
      "question": "exact question text",
      "extractedAnswer": "what candidate said verbatim from transcript",
      "score": 75,
      "feedback": "2-sentence feedback on quality of answer",
      "answered": true
    }
  ],
  "overallScore": 72,
  "transcriptQuality": "good",
  "interviewNotes": "overall observations"
}`;

    let scoringResult = null;
    try {
      const aiResponse = await callWithFallback([{ role: 'user', content: prompt }], 2500);
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        scoringResult = JSON.parse(jsonMatch[0]);
        console.log(`[transcript-screen] AI scored: ${scoringResult.overallScore}/100 | Quality: ${scoringResult.transcriptQuality}`);
      }
    } catch (aiErr) {
      console.error('[transcript-screen AI error]', aiErr.message);
    }

    if (!scoringResult) {
      return res.status(503).json({ message: 'AI scoring failed — all providers busy. Please try again in 1 minute.' });
    }

    // ── Build session ─────────────────────────────────────────────
    const answersData = scoringResult.answers || [];
    const validScores = answersData.filter(a => a.score >= 0).map(a => a.score);
    const overallScore = scoringResult.overallScore ||
      (validScores.length ? Math.round(validScores.reduce((s, v) => s + v, 0) / validScores.length) : 0);

    const session = {
      sessionType,
      difficulty,
      conductedAt: new Date(),
      conductedBy: req.user.name,
      meetingSource,
      transcriptUsed: true,
      answers: questions.map((q, i) => {
        const match = answersData.find(a =>
          a.question?.toLowerCase().includes(q.toLowerCase().substring(0, 30)) ||
          q.toLowerCase().includes((a.question || '').toLowerCase().substring(0, 30))
        ) || answersData[i];
        return {
          question: q,
          userAnswer: match?.extractedAnswer || 'Not found in transcript',
          aiScore:   (match?.score >= 0) ? match.score : 0,
          aiFeedback: match?.feedback || ''
        };
      }),
      screeningScore: overallScore,
      screeningBreakdown: {
        transcriptQuality: scoringResult.transcriptQuality,
        notes: scoringResult.interviewNotes,
        detectedSpeakers: detectedSpeakers.join(', '),
        candidateDetected: scoringResult.candidateName || ''
      }
    };

    if (!candidate.screeningSessions) candidate.screeningSessions = [];
    candidate.screeningSessions.push(session);
    candidate.screeningScore = overallScore;
    candidate.status = 'answers_submitted';
    await candidate.save();

    AuditLog.create({
      user: req.user.name, userId: req.user._id,
      action: 'TRANSCRIPT_SCREENED', resource: 'candidates',
      details: `${candidate.name} | ${meetingSource} | Score: ${overallScore} | Quality: ${scoringResult.transcriptQuality}`
    }).catch(() => {});

    console.log(`[transcript-screen] ✅ ${candidate.name} | Score: ${overallScore}/100 | ${scoringResult.transcriptQuality}`);

    res.json({
      message: 'Transcript processed and scored successfully',
      session,
      overallScore,
      screeningScore: overallScore,
      transcriptQuality: scoringResult.transcriptQuality,
      candidateDetected: scoringResult.candidateName,
      candidate: { _id: candidate._id, screeningScore: overallScore, status: candidate.status }
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

// ── PATCH /api/candidates/:id/fix-roletype ─────────────────────
// Fix roleType tag for existing candidates based on their job
router.patch('/:id/fix-roletype', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id).populate('jobId');
    if (!candidate) return res.status(404).json({ message: 'Not found' });
    const roleType = candidate.jobId?.roleType || req.body.roleType || 'technical';
    candidate.roleType = roleType;
    await candidate.save();
    res.json({ message: 'roleType updated', roleType });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
