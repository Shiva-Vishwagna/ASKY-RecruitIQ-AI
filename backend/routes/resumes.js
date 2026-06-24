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

// ── Text extraction ──────────────────────────────────────────
async function extractText(buffer, mimetype, filename) {
  try {
    const fname = (filename || '').toLowerCase();
    if (mimetype === 'application/pdf' || fname.endsWith('.pdf')) {
      try {
        const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
        return ((await pdfParse(buffer)).text || '').slice(0, 6000);
      } catch {
        const pdfParse = require('pdf-parse');
        return ((await pdfParse(buffer)).text || '').slice(0, 6000);
      }
    }
    if (mimetype.includes('wordprocessingml') || mimetype.includes('docx') ||
        fname.endsWith('.docx') || fname.endsWith('.doc')) {
      const mammoth = require('mammoth');
      const { value } = await mammoth.extractRawText({ buffer });
      return (value || '').slice(0, 6000);
    }
    return buffer.toString('utf-8').slice(0, 6000);
  } catch (e) {
    console.error('[extractText error]', e.message);
    return '';
  }
}

const trunc = (s, n) => (s || '').toString().slice(0, n);
const arr   = (a, n) => (Array.isArray(a) ? a : []).slice(0, n);
const num   = (v, max) => Math.min(Math.max(Number(v) || 0, 0), max);

function cleanName(filename) {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[_\-]/g, ' ')
    .replace(/\b(resume|cv|curriculum vitae)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Unknown Candidate';
}

// ── Process a single file — extract + AI screen + save ───────
async function processFile(file, jobContext, roleType, user, jobId) {
  const name = file.originalname;
  try {
    // Step 1: Extract text
    const rawText = await extractText(file.buffer, file.mimetype, name);
    file.buffer = null; // free memory immediately

    if (!rawText || rawText.trim().length < 50) {
      return { error: `Could not extract readable text from "${name}". Try a PDF or DOCX.`, file: name };
    }

    // Step 2: AI Screen
    const ai = await screenResumeWithAI(rawText, jobContext);

    if (!ai) {
      // Save fallback candidate — recruiters can re-screen manually
      const fallback = await Candidate.create({
        name:       cleanName(name),
        email:      '',
        appliedFor: trunc(jobContext.title, 100),
        jobId:      jobId,
        aiScore:    0, tier: 'C-Tier', riskLevel: 'medium',
        status:     'cv_uploaded',
        uploadedBy: user._id, uploadedByName: trunc(user.name, 50),
        summary:    'CV uploaded — click Run AI Screening to generate scores.',
      });
      console.log(`[upload] ⚠️  Fallback saved: ${cleanName(name)}`);
      return fallback;
    }

    // Step 3: Domain mismatch check
    const skillsText = (ai.topSkills || []).join(' ').toLowerCase();
    const isTechCandidate = /java|python|react|node|sql|aws|cloud|developer|engineer|software|backend|frontend|devops|api/i.test(skillsText);
    const isNonTechRole = roleType === 'non_technical';
    const domainMismatch = !!(ai.riskFlags?.domainMismatch) || (isNonTechRole && isTechCandidate);
    if (domainMismatch && isNonTechRole) {
      if (!ai.riskFlags) ai.riskFlags = {};
      ai.riskFlags.domainMismatch = true;
    }

    // Step 4: Score
    const cvScore = calculateCVScore(ai.cvScoreBreakdown, roleType, domainMismatch);
    const tier    = determineTier(cvScore);

    // Step 5: Save
    const candidate = await Candidate.create({
      name:            trunc(ai.name || cleanName(name), 100),
      email:           trunc(ai.email  || '', 100),
      phone:           trunc(ai.phone  || '', 20),
      appliedFor:      trunc(jobContext.title, 100),
      jobId,
      domain:          trunc(ai.domain    || '', 50),
      seniority:       trunc(ai.seniority || '', 30),
      experienceYears: num(ai.experience_years, 50),
      topSkills:       arr(ai.topSkills, 10).map(s => trunc(s, 50)),
      aiScore:         cvScore,
      cvScoreBreakdown: {
        skillsMatchScore: num(ai.cvScoreBreakdown?.skillsMatchScore, 100),
        stabilityScore:   num(ai.cvScoreBreakdown?.stabilityScore,   100),
      },
      combinedScore: cvScore,
      tier, riskLevel: trunc(ai.riskLevel || 'medium', 10),
      primarySkillMatch: typeof ai.primarySkillMatch === 'boolean' ? ai.primarySkillMatch : null,
      riskFlags: {
        frequentJobChanges:     !!ai.riskFlags?.frequentJobChanges,
        noticePeriodRisk:       trunc(ai.riskFlags?.noticePeriodRisk || '', 100),
        missingMandatorySkills: arr(ai.riskFlags?.missingMandatorySkills, 5).map(s => trunc(s, 50)),
        domainMismatch:         !!ai.riskFlags?.domainMismatch,
      },
      status:               'ai_screened',
      uploadedBy:           user._id,
      uploadedByName:       trunc(user.name, 50),
      summary:              trunc(ai.summary              || '', 500),
      hmSummary:            trunc(ai.hmSummary            || '', 800),
      technicalExperience:  trunc(ai.technicalExperience  || '', 300),
      leadershipExperience: trunc(ai.leadershipExperience || '', 300),
      cloudExpertise:       trunc(ai.cloudExpertise       || '', 300),
      recommendation:       trunc(ai.recommendation       || '', 20),
      recommendationReason: trunc(ai.recommendationReason || '', 300),
      interviewFocusAreas:  arr(ai.interviewFocusAreas, 5).map(s => trunc(s, 200)),
      databases:            arr(ai.databases,   8).map(s => trunc(s, 50)),
      frameworks:           arr(ai.frameworks,  8).map(s => trunc(s, 50)),
      tools:                arr(ai.tools,       8).map(s => trunc(s, 50)),
      strengths:            arr(ai.strengths,   4).map(s => trunc(s, 200)),
      gaps:                 arr(ai.gaps,        4).map(s => trunc(s, 200)),
      companiesWorkedAt:    num(ai.companiesWorkedAt, 50),
      shortTenureCompanies: arr(ai.shortTenureCompanies, 10).map(s => trunc(s, 100)),
      averageTenureYears:   num(ai.averageTenureYears, 50),
      projectDomains:       arr(ai.projectDomains, 4).map(s => trunc(s, 50)),
      skillScores:          arr(ai.skillScores, 8).map(s => ({ skill: trunc(s.skill || '', 50), score: num(s.score, 100) })),
    });

    // Async audit log — don't wait for it
    AuditLog.create({
      user: trunc(user.name, 50), userId: user._id,
      action: 'RESUME_UPLOADED', resource: 'resumes',
      details: trunc(`${candidate.name} | Score:${cvScore} | ${tier} | ${roleType}`, 150),
    }).catch(() => {});

    console.log(`[upload] ✅ ${candidate.name} | ${cvScore} | ${tier}`);
    return candidate;

  } catch (err) {
    console.error(`[upload] ❌ ${name}: ${err.message}`);
    return { error: err.message, file: name };
  }
}

// ── POST /api/resumes/upload ──────────────────────────────────
// Parallel processing: up to 3 files at a time
router.post('/upload', protect, (req, res) => {
  upload(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ message: 'Upload error: ' + uploadErr.message });

    try {
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ message: 'No files uploaded.' });

      const isAdmin = req.user.role === 'admin';
      const maxFiles = isAdmin ? 50 : 10;
      if (files.length > maxFiles) {
        return res.status(400).json({
          message: `Maximum ${maxFiles} CVs allowed per upload${!isAdmin ? '. Contact your admin.' : '.'}`
        });
      }

      // Load job context
      let job = null;
      if (req.body.jobId) {
        try {
          const Job = require('../models/Job');
          job = await Job.findById(req.body.jobId).lean();
        } catch (e) { console.error('[job load]', e.message); }
      }

      const mongoose = require('mongoose');
      const jobId = req.body.jobId && mongoose.Types.ObjectId.isValid(req.body.jobId)
        ? new mongoose.Types.ObjectId(req.body.jobId) : null;

      const roleType  = job?.roleType || 'technical';
      const jobContext = {
        title:          job?.title         || req.body.jobTitle || '',
        roleType,
        primarySkill:   job?.primarySkill  || '',
        requiredSkills: job?.requiredSkills || [],
        level:          job?.level         || '',
        minAiScore:     job?.minAiScore    || 60,
      };

      console.log(`[upload] 🚀 ${files.length} file(s) for "${jobContext.title}" — parallel processing (max 3 concurrent)`);

      // ── PARALLEL PROCESSING with concurrency limit ────────
      // Process up to 3 files simultaneously to balance speed vs API pressure
      const CONCURRENCY = 3;
      const results = [];

      for (let i = 0; i < files.length; i += CONCURRENCY) {
        const batch = files.slice(i, i + CONCURRENCY);
        console.log(`[upload] Batch ${Math.floor(i/CONCURRENCY)+1}: processing ${batch.length} files...`);

        const batchResults = await Promise.all(
          batch.map(file => processFile(file, jobContext, roleType, req.user, jobId))
        );

        results.push(...batchResults);

        // Small gap between batches to avoid API bursts
        if (i + CONCURRENCY < files.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      const saved    = results.filter(r => r._id);
      const errored  = results.filter(r => r.error);

      console.log(`[upload] ✅ Done: ${saved.length} saved, ${errored.length} errors`);

      res.json({
        candidates: results,
        count:      saved.length,
        errors:     errored.length,
        message:    `${saved.length} candidate(s) processed${errored.length > 0 ? `, ${errored.length} failed` : ''}`
      });

    } catch (err) {
      console.error('[resume-upload fatal]', err.message);
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
