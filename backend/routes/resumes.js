const express = require('express');
const router = express.Router();
const multer = require('multer');
const mammoth = require('mammoth');
const Groq = require('groq-sdk');
const Candidate = require('../models/Candidate');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');

// Accept any field name, any number of files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).any();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
    console.error('[extractText error]', e.message);
    return '';
  }
}

async function screenWithAI(rawText, jobTitle) {
  try {
    const prompt = `Extract candidate info from this resume. Return ONLY valid JSON:
{
  "name": "full name or Unknown",
  "email": "email or empty string",
  "phone": "phone or empty string",
  "domain": "tech domain e.g. Java Backend",
  "seniority": "Junior or Mid or Senior or Lead",
  "experience_years": 3,
  "topSkills": ["skill1","skill2","skill3"],
  "aiScore": 75,
  "tier": "A-Tier or B-Tier or C-Tier"
}
Job: ${jobTitle || 'Software Engineer'}
Resume: ${rawText.slice(0, 2000)}`;

    const resp = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 400,
    });
    const text = resp.choices[0].message.content.replace(/```json|```/g, '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch (e) {
    console.error('[AI error]', e.message);
    return null;
  }
}

// POST /api/resumes/upload
router.post('/upload', protect, (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('[multer error]', err.message);
      return res.status(400).json({ message: 'File upload error: ' + err.message });
    }

    try {
      const files = req.files || [];
      if (files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded.' });
      }

      const results = [];
      for (const file of files) {
        try {
          const rawText = await extractText(file.buffer, file.mimetype);
          const ai = await screenWithAI(rawText, req.body.jobTitle || '');

          const candidate = await Candidate.create({
            name:            ai?.name || file.originalname.replace(/\.[^/.]+$/, ''),
            email:           ai?.email || '',
            phone:           ai?.phone || '',
            appliedFor:      req.body.jobTitle || req.body.role || '',
            jobId:           req.body.jobId || null,
            domain:          ai?.domain || '',
            seniority:       ai?.seniority || '',
            experienceYears: Number(ai?.experience_years) || 0,
            topSkills:       ai?.topSkills || [],
            aiScore:         Number(ai?.aiScore) || 0,
            tier:            ai?.tier || 'C-Tier',
            status:          'new',
          });

          await AuditLog.create({
            user:     req.user.name,
            userId:   req.user._id,
            action:   'RESUME_UPLOADED',
            resource: 'resumes',
            details:  `Resume uploaded for ${candidate.name}`,
          });

          results.push(candidate);
        } catch (fileErr) {
          console.error('[file process error]', fileErr.message);
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
