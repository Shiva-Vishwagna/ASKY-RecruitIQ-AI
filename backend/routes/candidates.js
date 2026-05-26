const express = require('express');
const router = express.Router();
const Candidate = require('../models/Candidate');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const Groq = require('groq-sdk');

// GET /api/candidates
router.get('/', protect, async (req, res) => {
  try {
    const candidates = await Candidate.find().sort({ createdAt: -1 });
    res.json({ candidates });
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
