const express = require('express');
const router = express.Router();
const multer = require('multer');
const mammoth = require('mammoth');
const Candidate = require('../models/Candidate');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const { screenResumeWithAI } = require('../services/aiService');

// ── Multer: memory only, 5MB limit (reduced from 10MB) ───────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
}).any();

// ── Extract text from PDF/DOCX/TXT ───────────────────────────
async function extractText(buffer, mimetype) {
  try {
    if (mimetype === 'application/pdf') {
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
      const data = await pdfParse(buffer);
      // ── Truncate to 8000 chars — enough for AI, saves memory ──
      return (data.text || '').slice(0, 8000);
    }
    if (mimetype.includes('wordprocessingml') || mimetype.includes('docx')) {
      const { value } = await mammoth.extractRawText({ buffer });
      return (value || '').slice(0, 8000);
    }
    return buffer.toString('utf-8').slice(0, 8000);
  } catch (e) {
    console.error('[extractText]', e.message);
    return '';
  }
}

// ── POST /api/resumes/upload ──────────────────────────────────
router.post('/upload', protect, (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: 'File upload error: ' + err.message });
    try {
      const files = req.files || [];
      if (files.length === 0) return res.status(400).json({ message: 'No files uploaded.' });

      // Fetch job details for accurate skill-match scoring
      let job = null;
      if (req.body.jobId) {
        const Job = require('../models/Job');
        job = await Job.findById(req.body.jobId).lean();
      }
      const jobContext = {
        title:          job?.title         || req.body.jobTitle || '',
        primarySkill:   job?.primarySkill  || '',
        requiredSkills: job?.requiredSkills || [],
        level:          job?.level         || '',
        minAiScore:     job?.minAiScore    || 60,
      };

      const results = [];

      for (const file of files) {
        try {
          // ── Extract text (used ONLY for AI — NOT saved to DB) ──
          const rawText = await extractText(file.buffer, file.mimetype);

          // ── Free memory immediately after extraction ───────────
          file.buffer = null;

          if (!rawText || rawText.length < 50) {
            results.push({ error: 'Could not extract text from file', file: file.originalname });
            continue;
          }

          // ── AI screening ───────────────────────────────────────
          const ai = await screenResumeWithAI(rawText, jobContext);

          // ── Save to DB — NO resumeText stored ─────────────────
          const candidate = await Candidate.create({
            name:                 ai?.name                || req.body.name || file.originalname.replace(/\.[^/.]+$/, ''),
            email:                ai?.email               || req.body.email || '',
            phone:                ai?.phone               || req.body.phone || '',
            appliedFor:           req.body.jobTitle       || req.body.role || '',
            jobId:                req.body.jobId          || null,
            domain:               ai?.domain              || '',
            seniority:            ai?.seniority           || '',
            experienceYears:      Number(ai?.experience_years) || 0,
            topSkills:            (ai?.topSkills          || []).slice(0, 15),   // max 15 skills
            aiScore:              Number(ai?.aiScore)     || 0,
            tier:                 ai?.tier                || 'C-Tier',
            riskLevel:            ai?.riskLevel           || 'medium',
            summary:              (ai?.summary            || '').slice(0, 500),  // max 500 chars
            primarySkillMatch:    ai?.primarySkillMatch   ?? null,
            primarySkillScore:    Number(ai?.primarySkillScore) || 0,
            jobFitScore:          Number(ai?.jobFitScore) || 0,
            projectDomains:       (ai?.projectDomains     || []).slice(0, 5),
            technicalExperience:  (ai?.technicalExperience  || '').slice(0, 300),
            leadershipExperience: (ai?.leadershipExperience || '').slice(0, 300),
            cloudExpertise:       (ai?.cloudExpertise       || '').slice(0, 300),
            databases:            (ai?.databases          || []).slice(0, 10),
            frameworks:           (ai?.frameworks         || []).slice(0, 10),
            tools:                (ai?.tools              || []).slice(0, 10),
            strengths:            (ai?.strengths          || []).slice(0, 5),    // max 5 strengths
            gaps:                 (ai?.gaps               || []).slice(0, 5),    // max 5 gaps
            skillScores:          (ai?.skillScores        || []).slice(0, 10),
            recommendation:       ai?.recommendation      || '',
            recommendationReason: (ai?.recommendationReason || '').slice(0, 300),
            status:               'ai_screened',
            uploadedBy:           req.user._id,
            uploadedByName:       req.user.name,
            // ✅ resumeText: NOT SAVED — biggest storage saving
          });

          await AuditLog.create({
            user:     req.user.name,
            userId:   req.user._id,
            action:   'RESUME_UPLOADED',
            resource: 'resumes',
            details:  `Resume uploaded for ${candidate.name} — Score: ${candidate.aiScore}`,
          });

          results.push(candidate);

        } catch (fileErr) {
          console.error('[file error]', fileErr.message);
          results.push({ error: fileErr.message, file: file.originalname });
        }
      }

      res.json({ candidates: results, count: results.length });

    } catch (err) {
      console.error('[resume-upload]', err);
      res.status(500).json({ message: err.message || 'Resume processing failed.' });
    }
  });
});

// ── GET /api/resumes ──────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const candidates = await Candidate.find().sort({ createdAt: -1 });
    res.json({ candidates });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
