const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const Candidate = require('../models/Candidate');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const aiService = require('../services/aiService');

// GET /api/jobs
router.get('/', protect, async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/jobs/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ job });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/jobs
router.post('/', protect, async (req, res) => {
  try {
    const { title, department, location, description } = req.body;
    const job = await Job.create({ title, department, location, description, createdBy: req.user._id });

    // Generate interview questions via AI
    try {
      const questions = await aiService.generateInterviewQuestions(title, description);
      job.questions = questions;
      await job.save();
    } catch (e) { /* AI optional */ }

    await AuditLog.create({ user: req.user.name, userId: req.user._id, action: 'JOB_CREATED', resource: job.title, details: `Job "${job.title}" created in ${department}` });
    res.status(201).json({ job });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/jobs/:id
router.put('/:id', protect, async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!job) return res.status(404).json({ message: 'Job not found' });
    await AuditLog.create({ user: req.user.name, userId: req.user._id, action: 'JOB_UPDATED', resource: job.title, details: `Job "${job.title}" updated` });
    res.json({ job });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/jobs/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    await AuditLog.create({ user: req.user.name, userId: req.user._id, action: 'JOB_DELETED', resource: job.title, details: `Job "${job.title}" deleted` });
    res.json({ message: 'Job deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/jobs/:id/candidates
router.get('/:id/candidates', protect, async (req, res) => {
  try {
    const candidates = await Candidate.find({ jobId: req.params.id }).sort({ score: -1 });
    res.json({ candidates });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/jobs/:id/questions
router.get('/:id/questions', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    res.json({ questions: job?.questions || [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
