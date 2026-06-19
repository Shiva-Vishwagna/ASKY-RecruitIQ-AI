const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
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
    if (origin && origin.includes('.vercel.app'))    return callback(null, true);
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
        name: 'Admin', email: 'admin@recruitiq.com',
        password: 'Admin@1234', role: 'admin', isActive: true,
      });
      console.log('✓ Admin account auto-created: admin@recruitiq.com / Admin@1234');
    }
  } catch (e) { console.log('Auto-seed skipped:', e.message); }
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
  res.json({ status:'ok', db: mongoose.connection.readyState === 1, timestamp: new Date().toISOString() });
});

// ── ONE-TIME CLEANUP ROUTE ────────────────────────────────────
// Call DELETE https://asky-recruitiq-ai.onrender.com/api/clear-all
// from browser console (logged in). Clears all candidates + audit logs.
// Safe to leave in — requires DELETE method so won't fire accidentally.
app.delete('/api/clear-all', async (req, res) => {
  try {
    const Candidate = require('./models/Candidate');
    const AuditLog  = require('./models/AuditLog');
    const c = await Candidate.deleteMany({});
    const a = await AuditLog.deleteMany({});
    res.json({
      message:    '✅ Database cleared',
      candidates: c.deletedCount,
      auditLogs:  a.deletedCount,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/', (req, res) => {
  res.json({ message: 'Recruitment IQ API', version: '1.0.0', status: 'running' });
});

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✓ Server running on port ${PORT}`));
