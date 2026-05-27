const express = require('express');
const router = express.Router();
const multer = require('multer');
const mammoth = require('mammoth');
const Candidate = require('../models/Candidate');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const { screenResumeWithAI } = require('../services/aiService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).any();

async function extractText(buffer, mimetype) {
  try {
    if (mimetype === 'application/pdf') {
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
      const data = await pdfParse(buffer);
      return data.text || '';
    }
    if (mimetype.includes('wordprocessingml') || mimetype.includes('docx')) {
      const { value } = await mammoth.extractRawText({ buffer });
      return value || '';
    }
    return buffer.toString('utf-8');
  } catch (e) {
    console.error('[extractText]', e.message);
    return '';
  }
}

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
        title:         job?.title || req.body.jobTitle || '',
        primarySkill:  job?.primarySkill || '',
        requiredSkills: job?.requiredSkills || [],
        level:         job?.level || '',
        minAiScore:    job?.minAiScore || 60,
      };

      const results = [];
      for (const file of files) {
        try {
          const rawText = await extractText(file.buffer, file.mimetype);
          const ai = await screenResumeWithAI(rawText, jobContext);

          const candidate = await Candidate.create({
            name:                 ai?.name || file.originalname.replace(/\.[^/.]+$/, ''),
            email:                ai?.email || '',
            phone:                ai?.phone || '',
            appliedFor:           req.body.jobTitle || req.body.role || '',
            jobId:                req.body.jobId || null,
            domain:               ai?.domain || '',
            seniority:            ai?.seniority || '',
            experienceYears:      Number(ai?.experience_years) || 0,
            topSkills:            ai?.topSkills || [],
            aiScore:              Number(ai?.aiScore) || 0,
            tier:                 ai?.tier || 'C-Tier',
            riskLevel:            ai?.riskLevel || 'medium',
            summary:              ai?.summary || '',
            primarySkillMatch:    ai?.primarySkillMatch ?? null,
            primarySkillScore:    Number(ai?.primarySkillScore) || 0,
            jobFitScore:          Number(ai?.jobFitScore) || 0,
            projectDomains:       ai?.projectDomains || [],
            technicalExperience:  ai?.technicalExperience || '',
            leadershipExperience: ai?.leadershipExperience || '',
            cloudExpertise:       ai?.cloudExpertise || '',
            databases:            ai?.databases || [],
            frameworks:           ai?.frameworks || [],
            tools:                ai?.tools || [],
            strengths:            ai?.strengths || [],
            gaps:                 ai?.gaps || [],
            skillScores:          ai?.skillScores || [],
            recommendation:       ai?.recommendation || '',
            recommendationReason: ai?.recommendationReason || '',
            status:               'new',
            uploadedBy:           req.user._id,
            uploadedByName:       req.user.name,
          });

          await AuditLog.create({
            user: req.user.name, userId: req.user._id,
            action: 'RESUME_UPLOADED', resource: 'resumes',
            details: `Resume uploaded for ${candidate.name} — Score: ${candidate.aiScore}`,
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

router.get('/', protect, async (req, res) => {
  try {
    const candidates = await Candidate.find().sort({ createdAt: -1 });
    res.json({ candidates });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
