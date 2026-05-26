const express = require('express');
const router = express.Router();
const multer = require('multer');
const Candidate = require('../models/Candidate');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function extractText(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    // Dynamic import to handle ESM pdf-parse
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (mimetype.includes('wordprocessingml') || mimetype.includes('docx')) {
    const mammoth = require('mammoth');
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  // Fallback: treat as plain text
  return buffer.toString('utf-8');
}

// POST /api/resumes/upload
router.post('/upload', protect, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

    const rawText = await extractText(req.file.buffer, req.file.mimetype);

    // Build candidate from form fields + extracted text
    const candidate = await Candidate.create({
      name:            req.body.name || 'Unknown',
      email:           req.body.email || '',
      phone:           req.body.phone || '',
      appliedFor:      req.body.role || '',
      jobId:           req.body.jobId || null,
      domain:          req.body.domain || '',
      seniority:       req.body.seniority || '',
      experienceYears: Number(req.body.experienceYears) || 0,
      topSkills:       req.body.skills ? req.body.skills.split(',').map(s => s.trim()).slice(0, 10) : [],
      aiScore:         Number(req.body.score) || 0,
      tier:            req.body.tier || 'C-Tier',
      status:          'new',
    });

    await AuditLog.create({
      user: req.user.name,
      userId: req.user._id,
      action: 'RESUME_UPLOADED',
      resource: 'resumes',
      details: `Resume uploaded for ${candidate.name}`,
    });

    res.json({ candidate, extractedText: rawText.slice(0, 500) });
  } catch (err) {
    console.error('[resume-upload]', err);
    res.status(500).json({ message: err.message || 'Resume processing failed.' });
  }
});

// GET /api/resumes
router.get('/', protect, async (req, res) => {
  try {
    const candidates = await Candidate.find().sort({ createdAt: -1 });
    res.json({ candidates });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
