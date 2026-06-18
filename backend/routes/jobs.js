const express = require('express');
const router  = express.Router();
const Job     = require('../models/Job');
const { protect } = require('../middleware/auth');

// GET all jobs
router.get('/', protect, async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    // Add candidateCount
    const Candidate = require('../models/Candidate');
    const enriched = await Promise.all(jobs.map(async j => {
      const count = await Candidate.countDocuments({ jobId: j._id });
      return { ...j.toObject(), candidateCount: count };
    }));
    res.json({ jobs: enriched });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET single job
router.get('/:id', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ job });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST create job
router.post('/', protect, async (req, res) => {
  try {
    const job = await Job.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ job });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT update job (title, status, questionBank, etc.)
router.put('/:id', protect, async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ job });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE job
router.delete('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
    await Job.findByIdAndDelete(req.params.id);
    res.json({ message: 'Job deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/jobs/:id/candidates
router.get('/:id/candidates', protect, async (req, res) => {
  try {
    const Candidate = require('../models/Candidate');
    const query = req.user.role === 'admin'
      ? { jobId: req.params.id }
      : { jobId: req.params.id, uploadedBy: req.user._id };
    const candidates = await Candidate.find(query).sort({ aiScore: -1 });
    res.json({ candidates });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/jobs/:id/question-bank — fetch current question bank
router.get('/:id/question-bank', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).select('questionBank title');
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ questions: job.questionBank || [], count: (job.questionBank || []).length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/jobs/:id/question-bank — clear all questions from bank
router.delete('/:id/question-bank', protect, async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { questionBank: [], updatedAt: new Date() },
      { new: true }
    );
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ message: 'Question bank cleared', count: 0 });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/jobs/:id/question-bank — save question bank for a job
router.post('/:id/question-bank', protect, async (req, res) => {
  try {
    const { questions } = req.body; // array of { text, difficulty, category }
    if (!Array.isArray(questions)) return res.status(400).json({ message: 'questions must be an array' });
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { questionBank: questions.slice(0, 20), updatedAt: new Date() }, // max 20
      { new: true }
    );
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ job, message: `Saved ${questions.length} questions to bank` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/jobs/:id/question-bank/random — get 8 random questions
router.get('/:id/question-bank/random', protect, async (req, res) => {
  try {
    const { difficulty } = req.query; // optional filter by difficulty
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });

    let bank = job.questionBank || [];
    // Filter by difficulty if provided
    if (difficulty && difficulty !== 'all') {
      const filtered = bank.filter(q => q.difficulty === difficulty);
      bank = filtered.length >= 4 ? filtered : bank; // fallback to all if too few
    }

    if (bank.length === 0) return res.status(404).json({ message: 'No questions in bank for this job' });

    // Shuffle and pick 8
    const shuffled = [...bank].sort(() => Math.random() - 0.5);
    const picked   = shuffled.slice(0, 8);
    res.json({ questions: picked.map(q => q.text), full: picked });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
