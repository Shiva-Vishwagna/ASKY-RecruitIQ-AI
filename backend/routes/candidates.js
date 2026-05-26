const express = require('express');
const router = express.Router();
const Candidate = require('../models/Candidate');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');

// GET /api/candidates
router.get('/', protect, async (req, res) => {
  try {
    const candidates = await Candidate.find().sort({ score: -1 });
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

// POST /api/candidates/:id/feedback
router.post('/:id/feedback', protect, async (req, res) => {
  try {
    const { rating, notes } = req.body;
    const candidate = await Candidate.findByIdAndUpdate(
      req.params.id,
      { $push: { interviewFeedback: { interviewer: req.user.name, rating, notes, date: new Date() } } },
      { new: true }
    );
    await AuditLog.create({ user: req.user.name, userId: req.user._id, action: 'FEEDBACK_ADDED', resource: candidate.name, details: `Interview feedback added for ${candidate.name}` });
    res.json({ candidate });
  } catch (err) {
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
