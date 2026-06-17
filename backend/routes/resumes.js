const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const mammoth  = require('mammoth');
const Candidate = require('../models/Candidate');
const AuditLog  = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const { screenResumeWithAI } = require('../services/aiService');

// ── Multer: 5MB limit ─────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).any();

// ── Extract text — max 6000 chars (enough for AI) ────────────
async function extractText(buffer, mimetype) {
  try {
    if (mimetype === 'application/pdf') {
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
      const data = await pdfParse(buffer);
      return (data.text || '').slice(0, 6000);
    }
    if (mimetype.includes('wordprocessingml') || mimetype.includes('docx')) {
      const { value } = await mammoth.extractRawText({ buffer });
      return (value || '').slice(0, 6000);
    }
    return buffer.toString('utf-8').slice(0, 6000);
  } catch (e) {
    console.error('[extractText]', e.message);
    return '';
  }
}

// ── Helper: truncate string safely ───────────────────────────
const t = (s, max) => (s || '').slice(0, max);
const a = (arr, max) => (arr || []).slice(0, max);

// ── POST /api/resumes/upload ──────────────────────────────────
router.post('/upload', protect, (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: 'Upload error: ' + err.message });
    try {
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ message: 'No files uploaded.' });

      let job = null;
      if (req.body.jobId) {
        const Job = require('../models/Job');
        job = await Job.findById(req.body.jobId).lean();
      }
      const jobContext = {
        title:          job?.title          || req.body.jobTitle || '',
        primarySkill:   job?.primarySkill   || '',
        requiredSkills: job?.requiredSkills || [],
        level:          job?.level          || '',
        minAiScore:     job?.minAiScore     || 60,
      };

      const results = [];

      for (const file of files) {
        try {
          const rawText = await extractText(file.buffer, file.mimetype);
          file.buffer = null; // free memory immediately

          if (!rawText || rawText.length < 30) {
            results.push({ error: 'Could not extract text', file: file.originalname });
            continue;
          }

          const ai = await screenResumeWithAI(rawText, jobContext);

          const candidate = await Candidate.create({
            // ── Identity ──────────────────────────────────────
            name:           t(ai?.name || req.body.name || file.originalname.replace(/\.[^/.]+$/, ''), 100),
            email:          t(ai?.email  || req.body.email || '', 100),
            phone:          t(ai?.phone  || req.body.phone || '', 20),
            appliedFor:     t(req.body.jobTitle || req.body.role || '', 100),
            jobId:          req.body.jobId || null,

            // ── Profile ───────────────────────────────────────
            domain:          t(ai?.domain || '', 50),
            seniority:       t(ai?.seniority || '', 30),
            experienceYears: Math.min(Number(ai?.experience_years) || 0, 50),
            topSkills:       a(ai?.topSkills, 10),

            // ── Scores ────────────────────────────────────────
            aiScore:           Math.min(Number(ai?.aiScore) || 0, 100),
            tier:              t(ai?.tier || 'C-Tier', 10),
            riskLevel:         t(ai?.riskLevel || 'medium', 10),
            primarySkillMatch: ai?.primarySkillMatch ?? null,
            primarySkillScore: Math.min(Number(ai?.primarySkillScore) || 0, 100),
            jobFitScore:       Math.min(Number(ai?.jobFitScore) || 0, 100),

            // ── Status ────────────────────────────────────────
            status:         'ai_screened',
            uploadedBy:     req.user._id,
            uploadedByName: t(req.user.name, 50),

            // ── AI Analysis — all truncated ───────────────────
            summary:              t(ai?.summary, 400),
            technicalExperience:  t(ai?.technicalExperience, 200),
            leadershipExperience: t(ai?.leadershipExperience, 200),
            cloudExpertise:       t(ai?.cloudExpertise, 200),
            recommendation:       t(ai?.recommendation, 20),
            recommendationReason: t(ai?.recommendationReason, 200),

            // ── Arrays — all limited ──────────────────────────
            databases:      a(ai?.databases, 8),
            frameworks:     a(ai?.frameworks, 8),
            tools:          a(ai?.tools, 8),
            strengths:      a(ai?.strengths, 4),
            gaps:           a(ai?.gaps, 4),
            projectDomains: a(ai?.projectDomains, 4),
            skillScores:    a(ai?.skillScores, 8).map(s => ({
              skill: t(s.skill, 30),
              score: Math.min(Number(s.score) || 0, 100),
            })),

            // ✅ resumeText: NOT saved
            // ✅ screeningAnswers: NOT saved at upload time
          });

          // Minimal audit log
          await AuditLog.create({
            user:     t(req.user.name, 50),
            userId:   req.user._id,
            action:   'RESUME_UPLOADED',
            resource: 'resumes',
            details:  t(`${candidate.name} Score:${candidate.aiScore}`, 150),
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
