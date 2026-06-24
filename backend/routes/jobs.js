const express = require('express');
const router  = express.Router();
const Job     = require('../models/Job');
const { protect } = require('../middleware/auth');
const mammoth = require('mammoth');

// ── GET all jobs ──────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    const Candidate = require('../models/Candidate');
    const enriched = await Promise.all(jobs.map(async j => {
      const count = await Candidate.countDocuments({ jobId: j._id });
      return { ...j.toObject(), candidateCount: count };
    }));
    res.json({ jobs: enriched });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET single job ────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ job });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST create job ───────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const job = await Job.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ job });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── PUT update job ────────────────────────────────────────────
router.put('/:id', protect, async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id, { ...req.body, updatedAt: new Date() }, { new: true }
    );
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ job });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── DELETE job ────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
    await Job.findByIdAndDelete(req.params.id);
    res.json({ message: 'Job deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET candidates for job ────────────────────────────────────
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

// ── GET question bank ─────────────────────────────────────────
router.get('/:id/question-bank', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).select('questionBank title');
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ questions: job.questionBank || [], count: (job.questionBank||[]).length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── DELETE question bank (clear all) ─────────────────────────
router.delete('/:id/question-bank', protect, async (req, res) => {
  try {
    await Job.findByIdAndUpdate(req.params.id, { questionBank: [], updatedAt: new Date() });
    res.json({ message: 'Question bank cleared', count: 0 });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST save question bank ───────────────────────────────────
router.post('/:id/question-bank', protect, async (req, res) => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions)) return res.status(400).json({ message: 'questions must be an array' });
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { questionBank: questions.slice(0, 20), updatedAt: new Date() },
      { new: true }
    );
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ job, message: `Saved ${questions.length} questions to bank` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST upload question bank from .docx/.txt file ───────────
// This runs on the BACKEND where mammoth is available — no JSZip needed in browser
const multer = require('multer');
const uploadMW = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }).single('file');

router.post('/:id/question-bank/upload', protect, (req, res) => {
  uploadMW(req, res, async (err) => {
    if (err) return res.status(400).json({ message: 'Upload error: ' + err.message });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    try {
      const file   = req.file;
      const fname  = file.originalname.toLowerCase();
      let rawText  = '';

      if (fname.endsWith('.docx')) {
        // Use mammoth — reliable server-side DOCX text extraction
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        rawText = result.value || '';
      } else if (fname.endsWith('.txt')) {
        rawText = file.buffer.toString('utf-8');
      } else {
        return res.status(400).json({ message: 'Only .docx and .txt files supported' });
      }

      if (!rawText.trim()) return res.status(400).json({ message: 'No text could be extracted from file' });

      // Parse questions using multi-strategy approach
      const questions = parseQuestionsFromText(rawText);
      if (questions.length === 0) {
        return res.status(400).json({ message: 'No questions found. Format: "Question: [text] Answer: [text]" or one question per line' });
      }

      res.json({ questions, count: questions.length, rawPreview: rawText.slice(0, 200) });
    } catch (e) {
      console.error('[question-bank upload]', e.message);
      res.status(500).json({ message: 'Failed to parse file: ' + e.message });
    }
  });
});

// ── Parse questions from text ─────────────────────────────────
function parseQuestionsFromText(text) {
  const questions = [];

  // Strategy 1: "Question: [text] Answer:" pattern (structured Word docs)
  const qaPattern = /Question:\s*(.+?)(?:\s*Answer:|$)/gi;
  let match;
  while ((match = qaPattern.exec(text)) !== null) {
    const q = match[1].trim().replace(/\s+/g, ' ');
    if (q.length > 15 && q.length < 600 && !questions.includes(q)) {
      questions.push(q);
    }
  }
  if (questions.length >= 3) return questions.slice(0, 20);

  // Strategy 2: Numbered lines "1. text" or "Q1. text" or bullet lines
  const lines = text.split(/\n|\r\n|\r/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const cleaned = line
      .replace(/^(Q\s*\d+[\.\:\)]\s*|\d+[\.\:\)]\s*|[-•*→]\s*)/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length > 15 && cleaned.length < 600 && !questions.includes(cleaned)) {
      questions.push(cleaned);
    }
  }
  if (questions.length >= 3) return questions.slice(0, 20);

  // Strategy 3: Extract sentences ending with "?"
  const parts = text.split(/(?<=[?])\s+/);
  for (const part of parts) {
    const cleaned = part.trim().replace(/^\d+[.)]\s*/, '').replace(/\s+/g, ' ');
    if (cleaned.length > 20 && cleaned.length < 600 && cleaned.endsWith('?') && !questions.includes(cleaned)) {
      questions.push(cleaned);
    }
  }

  return questions.slice(0, 20);
}

// ── GET random questions from bank ───────────────────────────
router.get('/:id/question-bank/random', protect, async (req, res) => {
  try {
    const { difficulty = 'medium' } = req.query;
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });

    let bank = job.questionBank || [];

    // Always filter to medium difficulty only
    const mediumBank = bank.filter(q => q.difficulty === 'medium');
    // Fall back to all questions if no medium ones exist yet
    const pool = mediumBank.length >= 3 ? mediumBank : bank;

    if (pool.length === 0) return res.status(404).json({ message: 'No questions in bank for this job. Please add questions first.' });

    // Fisher-Yates proper shuffle — better randomness than sort()
    const arr = [...pool];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    // Pick 7 questions (or all if less than 7)
    const count = Math.min(7, arr.length);
    const picked = arr.slice(0, count);

    console.log(`[question-bank/random] Job: ${job.title} | Pool: ${pool.length} | Picked: ${count} medium questions`);

    res.json({
      questions: picked.map(q => q.text),
      full: picked,
      count,
      totalInBank: pool.length
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});


// ── POST /api/jobs/:id/close ─────────────────────────────────────
router.post('/:id/close', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
    const { closeReason } = req.body;
    const job = await Job.findByIdAndUpdate(req.params.id, { status: 'closed', closeReason: closeReason || '', closedAt: new Date() }, { new: true });
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ job });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/jobs/:id/duplicate (save as template) ──────────────
router.post('/:id/duplicate', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
    const source = await Job.findById(req.params.id).lean();
    if (!source) return res.status(404).json({ message: 'Job not found' });
    const { _id, createdAt, updatedAt, candidateCount, ...rest } = source;
    const newJob = await Job.create({ ...rest, title: rest.title + ' (Copy)', status: 'open', createdBy: req.user._id, isTemplate: req.body.asTemplate || false });
    res.status(201).json({ job: newJob });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/jobs/templates ───────────────────────────────────────
router.get('/templates/list', protect, async (req, res) => {
  try {
    const templates = await Job.find({ isTemplate: true }).select('title department level roleType primarySkill requiredSkills').sort({ createdAt: -1 });
    res.json({ templates });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
