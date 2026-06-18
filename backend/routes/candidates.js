const express = require('express');
const router  = express.Router();
const Candidate = require('../models/Candidate');
const AuditLog  = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const Groq = require('groq-sdk');

// ── GET /api/candidates ───────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? {} : { uploadedBy: req.user._id };
    const candidates = await Candidate.find(query)
      .populate('jobId', 'title department location')
      .sort({ createdAt: -1 });

    const enriched = candidates.map(c => {
      const obj = c.toObject();
      if (obj.jobId && typeof obj.jobId === 'object') {
        obj.jobTitle      = obj.appliedFor || obj.jobId.title || '';
        obj.jobDepartment = obj.jobId.department || '';
        obj.jobLocation   = obj.jobId.location || '';
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
    const candidate = await Candidate.findById(req.params.id).populate('jobId', 'title department');
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
// Generates AI questions with difficulty level support
router.post('/:id/questions', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    const { jobTitle, skills, difficulty = 'medium' } = req.body;
    const role      = jobTitle || candidate.appliedFor || 'Software Engineer';
    const topSkills = (skills || candidate.topSkills || []).slice(0, 8);

    // ── Difficulty-specific prompt ────────────────────────────
    const difficultyInstructions = {
      easy: `
DIFFICULTY: EASY (suitable for 0-2 years experience)
Question types to use:
- Basic concept definitions ("What is X?", "Explain Y")
- Simple how-to questions ("How do you do X?")
- Fundamental knowledge checks
- Basic syntax or usage questions
Avoid: System design, architecture, or complex scenario questions.`,
      medium: `
DIFFICULTY: MEDIUM (suitable for 3-5 years experience)
Question types to use:
- Real-world scenario questions ("How would you handle X situation?")
- Problem-solving questions ("What approach would you take for Y?")
- Describe past experience questions
- Practical implementation questions
- Trade-off comparison questions
Avoid: Pure definitions or highly advanced architecture questions.`,
      hard: `
DIFFICULTY: HARD (suitable for 6+ years experience)
Question types to use:
- System design questions ("Design a system that does X")
- Architecture decision questions ("How would you architect Y at scale?")
- Leadership & mentoring questions
- Complex trade-offs and optimization questions
- Cross-team collaboration scenarios
- Performance and scalability deep-dives
Avoid: Basic concept questions.`,
    };

    const prompt = `You are a senior technical interviewer. Generate exactly 8 interview questions for the role below.

Role: ${role}
Candidate Skills: ${topSkills.join(', ') || 'general software engineering'}
Seniority: ${candidate.seniority || 'Mid'}
Domain: ${candidate.domain || 'Software Engineering'}
Experience: ${candidate.experienceYears || 'unknown'} years

${difficultyInstructions[difficulty] || difficultyInstructions.medium}

CRITICAL RULES:
1. Return ONLY a valid JSON array of exactly 8 question strings
2. Each question must be specific to the role and skills listed
3. Questions must match the difficulty level strictly
4. No numbering, no explanation, no markdown — just the JSON array

Example format:
["Question 1?", "Question 2?", "Question 3?", "Question 4?", "Question 5?", "Question 6?", "Question 7?", "Question 8?"]`;

    let questions = [];

    if (process.env.GROQ_API_KEY) {
      try {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const resp = await groq.chat.completions.create({
          model:       'llama-3.3-70b-versatile',
          messages:    [{ role: 'user', content: prompt }],
          temperature: difficulty === 'easy' ? 0.2 : difficulty === 'hard' ? 0.5 : 0.35,
          max_tokens:  1000,
        });
        const text  = resp.choices[0].message.content.replace(/```json|```/g, '').trim();
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed) && parsed.length >= 4) questions = parsed.slice(0, 8);
        }
      } catch (e) { console.error('[AI questions error]', e.message); }
    }

    // ── Fallback questions by difficulty ─────────────────────
    if (questions.length === 0) {
      const fallbacks = {
        easy: [
          `What is ${topSkills[0] || role} and what is it used for?`,
          `Can you explain the basic concepts of ${topSkills[1] || 'object-oriented programming'}?`,
          `What is the difference between ${topSkills[0] || 'a function'} and a method?`,
          `How do you declare and use variables in ${topSkills[0] || 'your preferred language'}?`,
          `What tools do you use for version control and why?`,
          `Describe your experience working in a team environment.`,
          `What is debugging and how do you approach fixing a simple bug?`,
          `Where do you see yourself growing in the next 1-2 years?`,
        ],
        medium: [
          `Can you walk me through your experience with ${topSkills[0] || role}?`,
          `Describe a challenging project you worked on and how you overcame obstacles.`,
          `How do you approach debugging complex issues in production?`,
          `What design patterns have you used and when would you choose one over another?`,
          `How do you ensure code quality in your projects?`,
          `Describe your experience with agile methodologies.`,
          `How would you handle a situation where requirements change mid-project?`,
          `How do you collaborate with frontend/backend/QA teams on a feature?`,
        ],
        hard: [
          `How would you design a scalable ${topSkills[0] || 'microservices'} architecture for a high-traffic application?`,
          `Describe a time you led a complex technical initiative. What challenges did you face?`,
          `How would you approach migrating a monolithic application to microservices?`,
          `How do you ensure high availability and fault tolerance in distributed systems?`,
          `Describe your approach to performance optimization at scale.`,
          `How do you mentor junior developers while still delivering on your own tasks?`,
          `What trade-offs would you consider between consistency and availability in a distributed system?`,
          `How would you handle a critical production incident with no clear root cause?`,
        ],
      };
      questions = fallbacks[difficulty] || fallbacks.medium;
    }

    await Candidate.findByIdAndUpdate(req.params.id, {
      interviewQuestions: questions,
      status:             'questions_sent',
      updatedAt:          new Date(),
    });

    await AuditLog.create({
      user:     req.user.name,
      userId:   req.user._id,
      action:   'QUESTIONS_GENERATED',
      resource: 'candidates',
      details:  `${difficulty} questions generated for ${candidate.name}`.slice(0, 150),
    });

    res.json({ questions, difficulty, count: questions.length });
  } catch (err) {
    console.error('[questions]', err);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/candidates/:id/answers ─────────────────────────
router.post('/:id/answers', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    const { answers } = req.body;
    if (!answers || !answers.length) return res.status(400).json({ message: 'No answers provided' });

    const scoredAnswers = [];
    let totalScore = 0;

    for (const { question, answer } of answers) {
      let aiScore = 0;
      let aiFeedback = '';

      if (process.env.GROQ_API_KEY && answer?.trim()) {
        try {
          const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY });
          const prompt = `You are a technical interviewer. Score this answer from 0-100 and give brief feedback.
Role: ${candidate.appliedFor || 'Software Engineer'}
Question: ${question}
Answer: ${answer}

Return ONLY valid JSON: {"score": 75, "feedback": "Brief 1-sentence feedback"}`;

          const resp  = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1, max_tokens: 150,
          });
          const text  = resp.choices[0].message.content.replace(/```json|```/g, '').trim();
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            aiScore    = parsed.score || 0;
            aiFeedback = parsed.feedback || '';
          }
        } catch (e) { console.error('[answer scoring]', e.message); }
      }

      totalScore += aiScore;
      // Store only score + feedback, NOT the full answer text (saves DB space)
      scoredAnswers.push({ question: question.slice(0, 200), aiScore, aiFeedback: aiFeedback.slice(0, 150) });
    }

    const screeningScore = Math.round(totalScore / answers.length);
    const combinedScore  = Math.round((screeningScore + (candidate.aiScore || 0)) / 2);
    const newStatus      = combinedScore >= 60 ? 'hm_ready' : 'answers_submitted';

    const updated = await Candidate.findByIdAndUpdate(req.params.id, {
      screeningAnswers: scoredAnswers,
      screeningScore,
      status:    newStatus,
      updatedAt: new Date(),
    }, { new: true });

    await AuditLog.create({
      user:     req.user.name,
      userId:   req.user._id,
      action:   'ANSWERS_SUBMITTED',
      resource: 'candidates',
      details:  `${candidate.name} Score:${screeningScore} Status:${newStatus}`.slice(0, 150),
    });

    res.json({ candidate: updated, screeningScore, status: newStatus, combinedScore });
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

    const { screenResumeWithAI } = require('../services/aiService');

    const resumeText = `
Name: ${candidate.name}
Email: ${candidate.email}
Domain: ${candidate.domain || ''}
Seniority: ${candidate.seniority || ''}
Experience: ${candidate.experienceYears || 0} years
Skills: ${(candidate.topSkills || []).join(', ')}
Applied For: ${candidate.appliedFor || ''}
Summary: ${candidate.summary || ''}`.trim();

    const ai = await screenResumeWithAI(resumeText, candidate.appliedFor || '');
    if (!ai) return res.status(500).json({ message: 'AI screening failed' });

    const updated = await Candidate.findByIdAndUpdate(req.params.id, {
      aiScore:              Number(ai.aiScore) || 0,
      tier:                 ai.tier            || candidate.tier,
      riskLevel:            ai.riskLevel       || candidate.riskLevel,
      summary:              (ai.summary        || candidate.summary  || '').slice(0, 400),
      topSkills:            (ai.topSkills?.length ? ai.topSkills : candidate.topSkills || []).slice(0, 10),
      skillScores:          (ai.skillScores    || []).slice(0, 8),
      strengths:            (ai.strengths      || []).slice(0, 4),
      gaps:                 (ai.gaps           || []).slice(0, 4),
      technicalExperience:  (ai.technicalExperience  || '').slice(0, 200),
      leadershipExperience: (ai.leadershipExperience || '').slice(0, 200),
      cloudExpertise:       (ai.cloudExpertise       || '').slice(0, 200),
      databases:            (ai.databases      || []).slice(0, 8),
      frameworks:           (ai.frameworks     || []).slice(0, 8),
      tools:                (ai.tools          || []).slice(0, 8),
      recommendation:       ai.recommendation       || '',
      recommendationReason: (ai.recommendationReason || '').slice(0, 200),
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
