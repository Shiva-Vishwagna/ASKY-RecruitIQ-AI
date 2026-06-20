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
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (origin.includes('.vercel.app')) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Auto-seed admin on first run
async function autoSeedAdmin() {
  try {
    const User = require('./models/User');
    const count = await User.countDocuments();
    if (count === 0) {
      await User.create({ name:'Admin', email:'admin@recruitiq.com', password:'Admin@1234', role:'admin', isActive:true });
      console.log('✓ Admin created: admin@recruitiq.com / Admin@1234');
    }
  } catch (e) { console.log('Seed skipped:', e.message); }
}

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => { console.log('✓ MongoDB connected'); await autoSeedAdmin(); })
  .catch(err => console.error('✗ MongoDB error:', err.message));

// ── Core routes (always present) ──────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/jobs',       require('./routes/jobs'));
app.use('/api/candidates', require('./routes/candidates'));
app.use('/api/resumes',    require('./routes/resumes'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/settings',   require('./routes/settings'));

// ── Optional routes (load safely if they exist) ───────────────
const optionalRoutes = [
  { path: '/api/analytics',  file: './routes/analytics'  },
  { path: '/api/levels',     file: './routes/levels'     },
  { path: '/api/audit-logs', file: './routes/auditLogs'  },
  { path: '/api/jd',         file: './routes/jd'         },
];
for (const { path, file } of optionalRoutes) {
  try {
    app.use(path, require(file));
    console.log('✓ Route loaded:', path);
  } catch (e) {
    console.log('⚠ Optional route not found (skipped):', path);
  }
}

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status:'ok', db: mongoose.connection.readyState === 1, timestamp: new Date().toISOString() });
});

// ── Clear all candidate data (admin utility) ──────────────────
app.delete('/api/clear-all', async (req, res) => {
  try {
    const Candidate = require('./models/Candidate');
    const AuditLog  = require('./models/AuditLog');
    const c = await Candidate.deleteMany({});
    const a = await AuditLog.deleteMany({});
    res.json({ message:'✅ Database cleared', candidates: c.deletedCount, auditLogs: a.deletedCount });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// AI test
app.get('/api/ai-test', async (req, res) => { const keys = { GROQ_API_KEY: !!process.env.GROQ_API_KEY, MONGODB_URI: !!process.env.MONGODB_URI }; let groqTest='not set'; if(process.env.GROQ_API_KEY){try{const Groq=require('groq-sdk');const groq=new Groq({apiKey:process.env.GROQ_API_KEY});const r=await groq.chat.completions.create({model:'llama-3.3-70b-versatile',messages:[{role:'user',content:'Reply: ok'}],max_tokens:3});groqTest='✅ '+r.choices[0]?.message?.content;}catch(e){groqTest='❌ '+e.message;}}res.json({keys,groqTest}); });

app.get('/', (req, res) => res.json({ message:'Recruitment IQ API', version:'1.0.0' }));
app.use((req, res) => res.status(404).json({ message:'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status||500).json({ message: err.message||'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('✓ Server running on port ' + PORT));
