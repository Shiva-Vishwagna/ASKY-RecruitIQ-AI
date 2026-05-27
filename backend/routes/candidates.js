const express = require('express');
const router = express.Router();
const Candidate = require('../models/Candidate');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const Groq = require('groq-sdk');

// GET /api/candidates
router.get('/', protect, async (req, res) => {
  try {
    const candidates = await Candidate.find()
      .populate('jobId', 'title department location')
      .sort({ createdAt: -1 });

    // Enrich jobTitle from populated jobId if appliedFor is missing
    const enriched = candidates.map(c => {
      const obj = c.toObject();
      if (obj.jobId && typeof obj.jobId === 'object') {
        obj.jobTitle = obj.appliedFor || obj.jobId.title || '';
        obj.jobDepartment = obj.jobId.department || '';
        obj.jobLocation = obj.jobId.location || '';
      } else {
        obj.jobTitle = obj.appliedFor || '';
      }
      return obj;
    });

    res.json({ candidates: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/candidates/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id).populate('jobId', 'title department');
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });
    res.json({ candidate });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/candidates/:id — update status or any field
router.patch('/:id', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });
    res.json({ candidate });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/candidates/:id/questions — generate AI interview questions
router.post('/:id/questions', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    const { jobTitle, skills } = req.body;
    const role = jobTitle || candidate.appliedFor || 'Software Engineer';
    const topSkills = skills || candidate.topSkills || [];

    const prompt = `Generate 8 targeted technical interview questions for a ${role} candidate.
Skills to focus on: ${topSkills.join(', ') || 'general software engineering'}
Seniority: ${candidate.seniority || 'Mid'}
Domain: ${candidate.domain || 'Software Engineering'}

Return ONLY a JSON array of 8 question strings, no other text:
["Question 1?", "Question 2?", ...]`;

    let questions = [];

    if (process.env.GROQ_API_KEY) {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const resp = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 800,
      });
      const text = resp.choices[0].message.content.replace(/```json|```/g, '').trim();
      const match = text.match(/\[[\s\S]*\]/);
      if (match) questions = JSON.parse(match[0]);
    }

    if (questions.length === 0) {
      questions = [
        `Can you walk me through your experience with ${topSkills[0] || role}?`,
        `Describe a challenging project you worked on. What was your role and how did you overcome obstacles?`,
        `How do you approach debugging complex issues in production?`,
        `What design patterns have you used and when would you choose one over another?`,
        `How do you ensure code quality and maintainability in your projects?`,
        `Describe your experience with agile/scrum methodologies.`,
        `How do you stay updated with the latest trends in ${candidate.domain || 'technology'}?`,
        `Where do you see yourself in the next 3-5 years?`,
      ];
    }

    await Candidate.findByIdAndUpdate(req.params.id, { interviewQuestions: questions, status: 'questions_sent', updatedAt: new Date() });
    await AuditLog.create({ user: req.user.name, userId: req.user._id, action: 'QUESTIONS_GENERATED', resource: 'candidates', details: `Interview questions generated for ${candidate.name}` });

    res.json({ questions });
  } catch (err) {
    console.error('[questions]', err);
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/candidates/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    await Candidate.findByIdAndDelete(req.params.id);
    res.json({ message: 'Candidate removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

// POST /api/candidates/:id/answers — submit screening answers and AI score them
router.post('/:id/answers', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    const { answers } = req.body; // [{ question, answer }]
    if (!answers || !answers.length) return res.status(400).json({ message: 'No answers provided' });

    const Groq = require('groq-sdk');
    const scoredAnswers = [];
    let totalScore = 0;

    for (const { question, answer } of answers) {
      let aiScore = 0;
      let aiFeedback = '';

      if (process.env.GROQ_API_KEY && answer?.trim()) {
        try {
          const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
          const prompt = `You are a technical interviewer. Score this answer from 0-100 and give brief feedback.
Role: ${candidate.appliedFor || 'Software Engineer'}
Question: ${question}
Answer: ${answer}

Return ONLY valid JSON: {"score": 75, "feedback": "Brief 1-sentence feedback"}`;

          const resp = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1, max_tokens: 150,
          });
          const text = resp.choices[0].message.content.replace(/```json|```/g, '').trim();
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            aiScore = parsed.score || 0;
            aiFeedback = parsed.feedback || '';
          }
        } catch (e) { console.error('[answer scoring]', e.message); }
      }

      totalScore += aiScore;
      scoredAnswers.push({ question, answer, aiScore, aiFeedback });
    }

    const screeningScore = Math.round(totalScore / answers.length);

    // Auto-determine next status based on scores
    const combinedScore = Math.round((screeningScore + (candidate.aiScore || 0)) / 2);
    const newStatus = combinedScore >= 60 ? 'hm_ready' : 'answers_submitted';

    const updated = await Candidate.findByIdAndUpdate(req.params.id, {
      screeningAnswers: scoredAnswers,
      screeningScore,
      status: newStatus,
      updatedAt: new Date(),
    }, { new: true });

    await AuditLog.create({
      user: req.user.name, userId: req.user._id,
      action: 'ANSWERS_SUBMITTED', resource: 'candidates',
      details: `Screening answers submitted for ${candidate.name} — Screening Score: ${screeningScore}, Status: ${newStatus}`,
    });

    res.json({ candidate: updated, screeningScore, status: newStatus, combinedScore });
  } catch (err) {
    console.error('[answers]', err);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/candidates/:id/rescreen — re-run AI scoring on existing candidate data
router.post('/:id/rescreen', protect, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    const { screenResumeWithAI } = require('../services/aiService');

    // Build a text summary from stored candidate data to re-screen
    const resumeText = `
Name: ${candidate.name}
Email: ${candidate.email}
Phone: ${candidate.phone || ''}
Domain: ${candidate.domain || ''}
Seniority: ${candidate.seniority || ''}
Experience: ${candidate.experienceYears || 0} years
Skills: ${(candidate.topSkills || []).join(', ')}
Applied For: ${candidate.appliedFor || ''}
Summary: ${candidate.summary || ''}
    `.trim();

    const ai = await screenResumeWithAI(resumeText, candidate.appliedFor || '');

    if (!ai) return res.status(500).json({ message: 'AI screening failed — check API keys' });

    const updated = await Candidate.findByIdAndUpdate(req.params.id, {
      aiScore:         Number(ai.aiScore) || 0,
      tier:            ai.tier || candidate.tier,
      riskLevel:       ai.riskLevel || candidate.riskLevel,
      summary:         ai.summary || candidate.summary,
      topSkills:       ai.topSkills?.length ? ai.topSkills : candidate.topSkills,
      skillScores:     ai.skillScores || [],
      strengths:       ai.strengths || [],
      gaps:            ai.gaps || [],
      technicalExperience:  ai.technicalExperience || '',
      leadershipExperience: ai.leadershipExperience || '',
      cloudExpertise:       ai.cloudExpertise || '',
      databases:       ai.databases || [],
      frameworks:      ai.frameworks || [],
      tools:           ai.tools || [],
      recommendation:       ai.recommendation || '',
      recommendationReason: ai.recommendationReason || '',
      status:          'ai_screened',
      updatedAt:       new Date(),
    }, { new: true });

    res.json({ candidate: updated, aiScore: updated.aiScore });
  } catch (err) {
    console.error('[rescreen]', err);
    res.status(500).json({ message: err.message });
  }
});
