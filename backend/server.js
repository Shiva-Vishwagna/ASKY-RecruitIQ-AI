const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    if (origin && origin.includes('.vercel.app')) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

async function autoSeedAdmin() {
  try {
    const User = require('./models/User');
    const count = await User.countDocuments();
    if (count === 0) {
      await User.create({
        name: 'Admin',
        email: 'admin@recruitiq.com',
        password: 'Admin@1234',
        role: 'admin',
        isActive: true,
      });
      console.log('✓ Admin account auto-created: admin@recruitiq.com / Admin@1234');
    }
  } catch (e) {
    console.log('Auto-seed skipped:', e.message);
  }
}

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✓ MongoDB connected successfully');
    await autoSeedAdmin();
  })
  .catch(err => console.error('✗ MongoDB connection error:', err.message));

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/jobs',       require('./routes/jobs'));
app.use('/api/candidates', require('./routes/candidates'));
app.use('/api/resumes',    require('./routes/resumes'));
app.use('/api/analytics',  require('./routes/analytics'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/settings',   require('./routes/settings'));
app.use('/api/levels',     require('./routes/levels'));
app.use('/api/audit-logs', require('./routes/auditLogs'));
app.use('/api/jd',         require('./routes/jd'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: mongoose.connection.readyState === 1, timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ message: 'Recruitment IQ API', version: '1.0.0', status: 'running' });
});

// ── TEMPORARY CLEANUP ROUTE v2 — remove after running ────────
app.get('/api/cleanup/run', async (req, res) => {
  if (req.query.secret !== 'cleanup2024') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  try {
    const db = require('mongoose').connection.db;
    const col = db.collection('candidates');
    const results = {};

    // Remove all large raw fields
    const r1 = await col.updateMany({}, {
      $unset: {
        resumeText: "", rawText: "", fullText: "",
        parsedText: "", resume_text: "", extractedText: "",
        fileData: "", pdfData: "", cvText: "",
      }
    });
    results.largeFieldsRemoved = r1.modifiedCount;

    // Apply new tighter limits to all existing candidates
    const all = await col.find({}).toArray();
    let truncated = 0;
    for (const c of all) {
      const u = {};
      if (c.summary?.length > 400)              u.summary              = c.summary.slice(0, 400);
      if (c.technicalExperience?.length > 200)  u.technicalExperience  = c.technicalExperience.slice(0, 200);
      if (c.leadershipExperience?.length > 200) u.leadershipExperience = c.leadershipExperience.slice(0, 200);
      if (c.cloudExpertise?.length > 200)       u.cloudExpertise       = c.cloudExpertise.slice(0, 200);
      if (c.recommendationReason?.length > 200) u.recommendationReason = c.recommendationReason.slice(0, 200);
      if (c.topSkills?.length > 10)             u.topSkills            = c.topSkills.slice(0, 10);
      if (c.strengths?.length > 4)              u.strengths            = c.strengths.slice(0, 4);
      if (c.gaps?.length > 4)                   u.gaps                 = c.gaps.slice(0, 4);
      if (c.databases?.length > 8)              u.databases            = c.databases.slice(0, 8);
      if (c.frameworks?.length > 8)             u.frameworks           = c.frameworks.slice(0, 8);
      if (c.tools?.length > 8)                  u.tools                = c.tools.slice(0, 8);
      if (c.skillScores?.length > 8)            u.skillScores          = c.skillScores.slice(0, 8);
      if (c.projectDomains?.length > 4)         u.projectDomains       = c.projectDomains.slice(0, 4);
      if (c.interviewFeedback?.length > 2)      u.interviewFeedback    = c.interviewFeedback.slice(0, 2);

      // Remove answer text from screeningAnswers — keep only scores
      if (c.screeningAnswers?.length > 0) {
        u.screeningAnswers = c.screeningAnswers.slice(0, 10).map(a => ({
          question:   (a.question || '').slice(0, 200),
          aiScore:    a.aiScore || 0,
          aiFeedback: (a.aiFeedback || '').slice(0, 150),
          // answer text removed
        }));
      }

      if (Object.keys(u).length > 0) {
        await col.updateOne({ _id: c._id }, { $set: u });
        truncated++;
      }
    }
    results.candidatesCleaned = truncated;

    // Remove old rejected candidates (6+ months)
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
    const r3 = await col.deleteMany({ status: 'rejected', createdAt: { $lt: sixMonthsAgo } });
    results.oldRejectedRemoved = r3.deletedCount;

    // Clean audit logs older than 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const auditCol = db.collection('auditlogs');
    const r4 = await auditCol.deleteMany({ createdAt: { $lt: ninetyDaysAgo } });
    results.oldAuditLogsRemoved = r4.deletedCount;

    results.totalCandidatesNow = await col.countDocuments();

    return res.json({ success: true, message: '✅ Deep cleanup complete!', results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
// ── END TEMPORARY CLEANUP ROUTE ───────────────────────────────

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✓ Server running on port ${PORT}`));
