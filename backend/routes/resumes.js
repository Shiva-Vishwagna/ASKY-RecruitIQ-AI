const express   = require('express');
const router    = express.Router();
const multer    = require('multer');
const mammoth   = require('mammoth');
const Candidate = require('../models/Candidate');
const AuditLog  = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const { screenResumeWithAI, calculateCVScore, determineTier } = require('../services/aiService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
}).any();

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

const trunc = (s, n) => (s || '').toString().slice(0, n);
const arr   = (a, n) => (Array.isArray(a) ? a : []).slice(0, n);

router.post('/upload', protect, (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: 'Upload error: ' + err.message });
    try {
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ message: 'No files uploaded.' });

      // Load job context for better scoring
      let job = null;
      if (req.body.jobId) {
        const Job = require('../models/Job');
        job = await Job.findById(req.body.jobId).lean();
      }
      const jobContext = {
        title:          job?.title          || req.body.jobTitle || '',
        primarySkill:   job?.primarySkill   || '',
        requiredSkills: job?.requiredSkills  || [],
        level:          job?.level          || '',
        minAiScore:     job?.minAiScore     || 60,
      };

      const results = [];

      for (const file of files) {
        try {
          const rawText = await extractText(file.buffer, file.mimetype);
          file.buffer = null;

          if (!rawText || rawText.length < 30) {
            results.push({ error: 'Could not extract text from file', file: file.originalname });
            continue;
          }

          const ai = await screenResumeWithAI(rawText, jobContext);

          // Calculate CV score properly: skills(70%) + stability(30%)
          const cvScore = ai?.cvScoreBreakdown
            ? calculateCVScore(ai.cvScoreBreakdown)
            : Math.min(Number(ai?.aiScore) || 0, 100);

          const tier = determineTier(cvScore);

          const candidate = await Candidate.create({
            name:           trunc(ai?.name || req.body.name || file.originalname.replace(/\.[^/.]+$/, ''), 100),
            email:          trunc(ai?.email  || req.body.email || '', 100),
            phone:          trunc(ai?.phone  || '', 20),
            appliedFor:     trunc(req.body.jobTitle || req.body.role || '', 100),
            jobId:          req.body.jobId || null,

            domain:          trunc(ai?.domain    || '', 50),
            seniority:       trunc(ai?.seniority || '', 30),
            experienceYears: Math.min(Number(ai?.experience_years) || 0, 50),
            topSkills:       arr(ai?.topSkills, 10),

            // CV scoring
            aiScore:          cvScore,
            cvScoreBreakdown: {
              skillsMatchScore: Math.min(Number(ai?.cvScoreBreakdown?.skillsMatchScore) || 0, 100),
              stabilityScore:   Math.min(Number(ai?.cvScoreBreakdown?.stabilityScore)   || 0, 100),
            },
            combinedScore: cvScore, // starts as CV score, updated after screening

            tier,
            riskLevel:         trunc(ai?.riskLevel || 'medium', 10),
            primarySkillMatch: ai?.primarySkillMatch ?? null,
            primarySkillScore: Math.min(Number(ai?.primarySkillScore) || 0, 100),
            jobFitScore:       Math.min(Number(ai?.jobFitScore)       || 0, 100),

            riskFlags: {
              frequentJobChanges:     !!ai?.riskFlags?.frequentJobChanges,
              noticePeriodRisk:       trunc(ai?.riskFlags?.noticePeriodRisk || '', 100),
              missingMandatorySkills: arr(ai?.riskFlags?.missingMandatorySkills, 5),
              domainMismatch:         !!ai?.riskFlags?.domainMismatch,
            },

            status:         'ai_screened',
            uploadedBy:     req.user._id,
            uploadedByName: trunc(req.user.name, 50),

            summary:              trunc(ai?.summary,              500),
            hmSummary:            trunc(ai?.hmSummary,            800),
            technicalExperience:  trunc(ai?.technicalExperience,  300),
            leadershipExperience: trunc(ai?.leadershipExperience, 300),
            cloudExpertise:       trunc(ai?.cloudExpertise,       300),
            recommendation:       trunc(ai?.recommendation,        20),
            recommendationReason: trunc(ai?.recommendationReason, 300),

            interviewFocusAreas: arr(ai?.interviewFocusAreas, 5),
            databases:           arr(ai?.databases,   8),
            frameworks:          arr(ai?.frameworks,  8),
            tools:               arr(ai?.tools,       8),
            strengths:           arr(ai?.strengths,   4),
            gaps:                arr(ai?.gaps,        4),
            projectDomains:      arr(ai?.projectDomains, 4),
            skillScores:         arr(ai?.skillScores, 8).map(s => ({
              skill: trunc(s.skill, 50),
              score: Math.min(Number(s.score) || 0, 100),
            })),
          });

          await AuditLog.create({
            user:     trunc(req.user.name, 50),
            userId:   req.user._id,
            action:   'RESUME_UPLOADED',
            resource: 'resumes',
            details:  trunc(`${candidate.name} | Score:${candidate.aiScore} | ${tier}`, 150),
          });

          results.push(candidate);

        } catch (fileErr) {
          console.error('[file processing error]', fileErr.message);
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

router.get('/', protect, async (req, res) => {
  try {
    const candidates = await Candidate.find().sort({ createdAt: -1 });
    res.json({ candidates });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
