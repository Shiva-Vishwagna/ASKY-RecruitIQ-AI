const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const Candidate = require('../models/Candidate');
const AuditLog  = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const { screenResumeWithAI, calculateCVScore, determineTier } = require('../services/aiService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5MB
}).any();

// ── Extract text from file buffer ─────────────────────────────
async function extractText(buffer, mimetype, filename) {
  const fname = (filename || '').toLowerCase();
  try {
    if (mimetype === 'application/pdf' || fname.endsWith('.pdf')) {
      try {
        const mod  = await import('pdf-parse/lib/pdf-parse.js');
        const data = await mod.default(buffer);
        return (data.text || '').slice(0, 6000);
      } catch {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        return (data.text || '').slice(0, 6000);
      }
    }
    if (fname.endsWith('.docx') || mimetype.includes('wordprocessingml')) {
      const mammoth = require('mammoth');
      const { value } = await mammoth.extractRawText({ buffer });
      return (value || '').slice(0, 6000);
    }
    return buffer.toString('utf-8').slice(0, 6000);
  } catch (e) {
    console.error('[extractText]', e.message);
    return '';
  }
}

const t = (s, n) => (s || '').toString().trim().slice(0, n);
const a = (arr, n) => (Array.isArray(arr) ? arr : []).slice(0, n);
const n = (v)     => Math.min(Math.max(Number(v) || 0, 0), 100);

// ── POST /api/resumes/upload ──────────────────────────────────
router.post('/upload', protect, (req, res) => {
  upload(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ message: 'Upload error: ' + uploadErr.message });

    try {
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ message: 'No files received. Please select at least one PDF or DOCX.' });

      // ── Load job for context ────────────────────────────────
      let job = null;
      if (req.body.jobId) {
        try {
          job = await require('../models/Job').findById(req.body.jobId).lean();
        } catch (e) { console.warn('[job load]', e.message); }
      }

      const roleType = job?.roleType || 'technical';
      const jobContext = {
        title:          job?.title          || req.body.jobTitle || '',
        roleType,
        primarySkill:   job?.primarySkill   || '',
        requiredSkills: job?.requiredSkills  || [],
        level:          job?.level          || '',
      };

      console.log(`[upload] ${files.length} file(s) | job: "${jobContext.title}" | type: ${roleType}`);

      const results = [];

      for (const file of files) {
        const fname = file.originalname;
        try {
          // 1. Extract text
          const rawText = await extractText(file.buffer, file.mimetype, fname);
          file.buffer = null;

          if (!rawText || rawText.trim().length < 40) {
            console.error(`[upload] No text from: ${fname}`);
            results.push({ error: `Could not read text from "${fname}". Please upload a readable PDF or DOCX.`, file: fname });
            continue;
          }

          console.log(`[upload] Extracted ${rawText.length} chars from ${fname}`);

          // 2. AI screening
          const ai = await screenResumeWithAI(rawText, jobContext);

          if (!ai) {
            console.error(`[upload] AI returned null for: ${fname} — GROQ_API_KEY likely missing`);
            results.push({
              error: `AI screening failed for "${fname}". Please add GROQ_API_KEY in Render → Environment and redeploy.`,
              file: fname,
            });
            continue;
          }

          // 3. Calculate score
          const cvScore = calculateCVScore(ai.cvScoreBreakdown, roleType);
          const tier    = determineTier(cvScore);

          console.log(`[upload] ${ai.name || fname} | CV: ${cvScore} | Tier: ${tier}`);

          // 4. Save candidate
          const candidate = await Candidate.create({
            name:            t(ai.name, 100)  || fname.replace(/\.[^/.]+$/, '').replace(/[_\-]+/g, ' '),
            email:           t(ai.email, 100),
            phone:           t(ai.phone, 20),
            appliedFor:      t(jobContext.title || req.body.jobTitle || '', 100),
            jobId:           req.body.jobId || null,

            domain:          t(ai.domain, 60),
            seniority:       t(ai.seniority, 30),
            experienceYears: Math.min(Number(ai.experience_years) || 0, 50),
            topSkills:       a(ai.topSkills, 10).map(s => t(s, 60)),

            aiScore:         cvScore,
            cvScoreBreakdown: {
              skillsMatchScore: n(ai.cvScoreBreakdown?.skillsMatchScore),
              stabilityScore:   n(ai.cvScoreBreakdown?.stabilityScore),
            },
            combinedScore: cvScore,

            tier,
            riskLevel:         t(ai.riskLevel || 'medium', 10),
            primarySkillMatch: typeof ai.primarySkillMatch === 'boolean' ? ai.primarySkillMatch : undefined,
            primarySkillScore: n(ai.primarySkillScore),
            jobFitScore:       n(ai.jobFitScore),

            riskFlags: {
              frequentJobChanges:     !!ai.riskFlags?.frequentJobChanges,
              noticePeriodRisk:       t(ai.riskFlags?.noticePeriodRisk || '', 100),
              missingMandatorySkills: a(ai.riskFlags?.missingMandatorySkills, 5).map(s => t(s, 60)),
              domainMismatch:         !!ai.riskFlags?.domainMismatch,
            },

            status:         'ai_screened',
            uploadedBy:     req.user._id,
            uploadedByName: t(req.user.name, 60),

            summary:              t(ai.summary,              600),
            hmSummary:            t(ai.hmSummary,            900),
            technicalExperience:  t(ai.technicalExperience,  400),
            leadershipExperience: t(ai.leadershipExperience, 400),
            cloudExpertise:       t(ai.cloudExpertise,       400),
            recommendation:       t(ai.recommendation,        30),
            recommendationReason: t(ai.recommendationReason, 400),

            interviewFocusAreas: a(ai.interviewFocusAreas, 5).map(s => t(s, 250)),
            strengths:           a(ai.strengths,   4).map(s => t(s, 250)),
            gaps:                a(ai.gaps,        4).map(s => t(s, 250)),
            databases:           a(ai.databases,   8).map(s => t(s, 60)),
            frameworks:          a(ai.frameworks,  8).map(s => t(s, 60)),
            tools:               a(ai.tools,       8).map(s => t(s, 60)),
            projectDomains:      a(ai.projectDomains, 4).map(s => t(s, 60)),
            skillScores:         a(ai.skillScores, 8).map(s => ({
              skill: t(s.skill, 60),
              score: n(s.score),
            })),
          });

          AuditLog.create({
            user:     t(req.user.name, 60),
            userId:   req.user._id,
            action:   'RESUME_UPLOADED',
            resource: 'resumes',
            details:  `${candidate.name} | ${cvScore} | ${tier} | ${roleType}`.slice(0, 150),
          }).catch(() => {});

          results.push(candidate);

        } catch (fileErr) {
          console.error(`[upload file error] ${fname}:`, fileErr.message);
          results.push({ error: fileErr.message, file: fname });
        }
      }

      res.json({ candidates: results, count: results.length });

    } catch (err) {
      console.error('[upload fatal]', err.message, err.stack);
      res.status(500).json({ message: err.message || 'Upload failed.' });
    }
  });
});

router.get('/', protect, async (req, res) => {
  try {
    const candidates = await Candidate.find().sort({ createdAt: -1 });
    res.json({ candidates });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
