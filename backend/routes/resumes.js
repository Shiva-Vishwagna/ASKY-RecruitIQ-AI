const express   = require('express');
const router    = express.Router();
const multer    = require('multer');
const Candidate = require('../models/Candidate');
const AuditLog  = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const { screenResumeWithAI, calculateCVScore, determineTier } = require('../services/aiService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
}).any();

// ── Extract text from uploaded file ──────────────────────────
async function extractText(buffer, mimetype, filename) {
  try {
    const fname = (filename || '').toLowerCase();

    if (mimetype === 'application/pdf' || fname.endsWith('.pdf')) {
      try {
        // Try dynamic import first (ESM)
        const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
        const data = await pdfParse(buffer);
        return (data.text || '').slice(0, 6000);
      } catch {
        // Fallback to require
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        return (data.text || '').slice(0, 6000);
      }
    }

    if (mimetype.includes('wordprocessingml') || mimetype.includes('docx') ||
        fname.endsWith('.docx') || fname.endsWith('.doc')) {
      const mammoth = require('mammoth');
      const { value } = await mammoth.extractRawText({ buffer });
      return (value || '').slice(0, 6000);
    }

    // Plain text fallback
    return buffer.toString('utf-8').slice(0, 6000);
  } catch (e) {
    console.error('[extractText error]', e.message);
    return '';
  }
}

const trunc = (s, n) => (s || '').toString().slice(0, n);
const arr   = (a, n) => (Array.isArray(a) ? a : []).slice(0, n);
const num   = (v, max) => Math.min(Math.max(Number(v) || 0, 0), max);

// ── POST /api/resumes/upload ──────────────────────────────────
router.post('/upload', protect, (req, res) => {
  upload(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ message: 'Upload error: ' + uploadErr.message });

    try {
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ message: 'No files uploaded.' });

      // ── Load job context (critical for scoring) ───────────
      let job = null;
      if (req.body.jobId) {
        try {
          const Job = require('../models/Job');
          job = await Job.findById(req.body.jobId).lean();
        } catch (e) { console.error('[job load]', e.message); }
      }

      const roleType = job?.roleType || 'technical';
      const jobContext = {
        title:          job?.title          || req.body.jobTitle || '',
        roleType,
        primarySkill:   job?.primarySkill   || '',
        requiredSkills: job?.requiredSkills  || [],
        level:          job?.level          || '',
        minAiScore:     job?.minAiScore     || 60,
      };

      console.log(`[upload] Processing ${files.length} file(s) for role: ${jobContext.title} (${roleType})`);

      const results = [];

      for (const file of files) {
        try {
          // ── Extract text ──────────────────────────────────
          const rawText = await extractText(file.buffer, file.mimetype, file.originalname);
          file.buffer = null; // free memory

          if (!rawText || rawText.trim().length < 50) {
            console.error('[upload] Could not extract text from:', file.originalname);
            results.push({ error: 'Could not extract readable text from this file. Try a PDF or DOCX.', file: file.originalname });
            continue;
          }

          console.log(`[upload] Extracted ${rawText.length} chars from ${file.originalname}`);

          // ── AI Screening ──────────────────────────────────
          const ai = await screenResumeWithAI(rawText, jobContext);

          if (!ai) {
            console.error('[upload] AI screening returned null for:', file.originalname, '— saving with basic info');
            // Save candidate with basic info even when AI fails
            const fallbackName = file.originalname.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
            try {
              const fallbackCandidate = await Candidate.create({
                name:       fallbackName,
                email:      '',
                appliedFor: trunc(req.body.jobTitle || jobContext.title || '', 100),
                jobId:      req.body.jobId ? require('mongoose').Types.ObjectId.isValid(req.body.jobId) ? new (require('mongoose').Types.ObjectId)(req.body.jobId) : null : null,
                aiScore:    0,
                tier:       'C-Tier',
                riskLevel:  'medium',
                status:     'cv_uploaded',
                uploadedBy: req.user._id,
                uploadedByName: trunc(req.user.name, 50),
                summary:    'AI screening pending — GROQ API key may need to be refreshed in Render environment.',
              });
              results.push(fallbackCandidate);
              console.log('[upload] Saved fallback candidate:', fallbackName);
            } catch (saveErr) {
              console.error('[upload] Could not save fallback candidate:', saveErr.message);
              results.push({ error: 'AI screening failed and could not save candidate.', file: file.originalname });
            }
            continue;
          }

          // ── Calculate scores ──────────────────────────────
          const cvScore = calculateCVScore(ai.cvScoreBreakdown, roleType);
          const tier    = determineTier(cvScore);

          console.log(`[upload] ${ai.name} | CV: ${cvScore} | Tier: ${tier} | Role: ${roleType}`);

          // ── Save candidate ────────────────────────────────
          const candidate = await Candidate.create({
            name:            trunc(ai.name || '', 100) || file.originalname.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
            email:           trunc(ai.email  || '', 100),
            phone:           trunc(ai.phone  || '', 20),
            appliedFor:      trunc(req.body.jobTitle || jobContext.title || '', 100),
            jobId:           req.body.jobId ? require('mongoose').Types.ObjectId.isValid(req.body.jobId) ? new (require('mongoose').Types.ObjectId)(req.body.jobId) : null : null,

            domain:          trunc(ai.domain    || '', 50),
            seniority:       trunc(ai.seniority || '', 30),
            experienceYears: num(ai.experience_years, 50),
            topSkills:       arr(ai.topSkills, 10).map(s => trunc(s, 50)),

            aiScore: cvScore,
            cvScoreBreakdown: {
              skillsMatchScore: num(ai.cvScoreBreakdown?.skillsMatchScore, 100),
              stabilityScore:   num(ai.cvScoreBreakdown?.stabilityScore,   100),
            },
            combinedScore: cvScore,

            tier,
            riskLevel:         trunc(ai.riskLevel || 'medium', 10),
            primarySkillMatch: typeof ai.primarySkillMatch === 'boolean' ? ai.primarySkillMatch : null,
            primarySkillScore: num(ai.primarySkillScore, 100),
            jobFitScore:       num(ai.jobFitScore, 100),

            riskFlags: {
              frequentJobChanges:     !!ai.riskFlags?.frequentJobChanges,
              noticePeriodRisk:       trunc(ai.riskFlags?.noticePeriodRisk || '', 100),
              missingMandatorySkills: arr(ai.riskFlags?.missingMandatorySkills, 5).map(s => trunc(s, 50)),
              domainMismatch:         !!ai.riskFlags?.domainMismatch,
            },

            status:         'ai_screened',
            uploadedBy:     req.user._id,
            uploadedByName: trunc(req.user.name, 50),

            summary:              trunc(ai.summary              || '', 500),
            hmSummary:            trunc(ai.hmSummary            || '', 800),
            technicalExperience:  trunc(ai.technicalExperience  || '', 300),
            leadershipExperience: trunc(ai.leadershipExperience || '', 300),
            cloudExpertise:       trunc(ai.cloudExpertise       || '', 300),
            recommendation:       trunc(ai.recommendation       || '', 20),
            recommendationReason: trunc(ai.recommendationReason || '', 300),

            interviewFocusAreas: arr(ai.interviewFocusAreas, 5).map(s => trunc(s, 200)),
            databases:           arr(ai.databases,   8).map(s => trunc(s, 50)),
            frameworks:          arr(ai.frameworks,  8).map(s => trunc(s, 50)),
            tools:               arr(ai.tools,       8).map(s => trunc(s, 50)),
            strengths:           arr(ai.strengths,   4).map(s => trunc(s, 200)),
            gaps:                arr(ai.gaps,        4).map(s => trunc(s, 200)),
            projectDomains:      arr(ai.projectDomains, 4).map(s => trunc(s, 50)),
            skillScores:         arr(ai.skillScores, 8).map(s => ({
              skill: trunc(s.skill || '', 50),
              score: num(s.score, 100),
            })),
          });

          await AuditLog.create({
            user:     trunc(req.user.name, 50),
            userId:   req.user._id,
            action:   'RESUME_UPLOADED',
            resource: 'resumes',
            details:  trunc(`${candidate.name} | Score:${cvScore} | ${tier} | ${roleType}`, 150),
          }).catch(() => {}); // don't fail upload if audit fails

          results.push(candidate);
          console.log(`[upload] Saved: ${candidate.name} (${candidate._id})`);

        } catch (fileErr) {
          console.error('[file error]', fileErr.message, fileErr.stack);
          results.push({ error: fileErr.message, file: file.originalname });
        }
      }

      res.json({ candidates: results, count: results.length });

    } catch (err) {
      console.error('[resume-upload fatal]', err.message, err.stack);
      res.status(500).json({ message: err.message || 'Resume processing failed.' });
    }
  });
});

router.get('/', protect, async (req, res) => {
  try {
    const candidates = await Candidate.find().sort({ createdAt: -1 });
    res.json({ candidates });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
