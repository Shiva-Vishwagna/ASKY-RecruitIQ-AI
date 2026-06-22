const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
require('dotenv').config();

// ============================================================
// ⭐ NEW: MULTI-AI IMPORTS
// ============================================================
const { analyzeWithFallback, getHealthStatus } = require('./services/multiAiService');
const { getConfiguredProviders } = require('./services/multiAiProviders');

const app = express();

// ─────────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────────

app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─────────────────────────────────────────────────────────────────
// CORS CONFIGURATION
// ─────────────────────────────────────────────────────────────────

const allowedOrigins = [
  process.env.FRONTEND_URL || 'https://asky-recruit-iq-ai.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in whitelist
    if (allowedOrigins.includes(origin)) return callback(null, true);
    
    // Allow all Vercel.app domains
    if (origin && origin.includes('.vercel.app')) return callback(null, true);
    
    // Allow all localhost variants
    if (origin && origin.includes('localhost')) return callback(null, true);
    if (origin && origin.includes('127.0.0.1')) return callback(null, true);
    
    // Reject everything else
    console.warn(`[CORS] Rejected origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));

// ─────────────────────────────────────────────────────────────────
// DATABASE CONNECTION
// ─────────────────────────────────────────────────────────────────

async function connectDB() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not set in environment variables');
    }

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ MongoDB connected');
    
    // Auto-seed admin on first run
    try {
      const User = require('./models/User');
      const count = await User.countDocuments();
      if (count === 0) {
        await User.create({
          name: 'Admin',
          email: 'admin@recruitiq.com',
          password: 'Admin@1234',
          role: 'admin',
          isActive: true
        });
        console.log('✅ Admin created: admin@recruitiq.com / Admin@1234');
      }
    } catch (seedErr) {
      console.warn('⚠️  Seed skipped:', seedErr.message);
    }
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    // Don't exit - let Render handle crashes
  }
}

// Connect to database
connectDB();

// ─────────────────────────────────────────────────────────────────
// CORE ROUTES (Always Present)
// ─────────────────────────────────────────────────────────────────

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/jobs',       require('./routes/jobs'));
app.use('/api/candidates', require('./routes/candidates'));
app.use('/api/resumes',    require('./routes/resumes'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/settings',   require('./routes/settings'));

// ─────────────────────────────────────────────────────────────────
// OPTIONAL ROUTES (Load Safely)
// ─────────────────────────────────────────────────────────────────

const optionalRoutes = [
  { path: '/api/analytics',  file: './routes/analytics'  },
  { path: '/api/levels',     file: './routes/levels'     },
  { path: '/api/audit-logs', file: './routes/auditLogs'  },
  { path: '/api/jd',         file: './routes/jd'         },
];

for (const { path, file } of optionalRoutes) {
  try {
    app.use(path, require(file));
    console.log(`✅ Optional route loaded: ${path}`);
  } catch (e) {
    console.log(`⚠️  Optional route not found (skipped): ${path}`);
  }
}

// ============================================================
// ⭐ NEW: MULTI-AI HEALTH ENDPOINT
// ============================================================

app.get('/api/ai-health', (req, res) => {
  try {
    const health = getHealthStatus(process.env);
    res.json({
      status: health.status,
      providers: health.providers,
      available: health.available,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================
// ⭐ NEW: MULTI-AI ANALYSIS ENDPOINT
// ============================================================

app.post('/api/analyze', async (req, res) => {
  try {
    const { content } = req.body;
    
    // Validate input
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Content is required and must be a non-empty string',
      });
    }

    // Call multi-AI service with fallback
    console.log(`[ANALYZE] Processing content (${content.length} chars)...`);
    const result = await analyzeWithFallback(content, process.env, console);
    
    if (result.success) {
      res.json({
        success: true,
        analysis: result.analysis,
        provider: result.provider, // Shows which AI provider was used
        timestamp: new Date().toISOString(),
      });
    } else {
      // All providers failed
      res.status(503).json({
        success: false,
        error: result.error,
        message: result.message || 'All AI providers failed',
        tried: result.tried || [],
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('[ANALYZE ERROR]', err);
    res.status(500).json({
      success: false,
      error: 'Analysis failed',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ─────────────────────────────────────────────────────────────────
// HEALTH CHECK ENDPOINT
// ─────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  const status = {
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 1 : 0,
    timestamp: new Date().toISOString(),
    env: {
      // ⭐ NEW: Show AI provider configuration
      anthropic_api_key: !!process.env.ANTHROPIC_API_KEY,
      groq_api_key: !!process.env.GROQ_API_KEY,
      huggingface_api_key: !!process.env.HUGGINGFACE_API_KEY,
      cohere_api_key: !!process.env.COHERE_API_KEY,
      mistral_api_key: !!process.env.MISTRAL_API_KEY,
      // Existing config
      mongodb_uri: !!process.env.MONGODB_URI,
      frontend_url: process.env.FRONTEND_URL || 'not set',
      jwt_secret: !!process.env.JWT_SECRET
    }
  };
  
  res.json(status);
});

// ─────────────────────────────────────────────────────────────────
// GROQ API TEST ENDPOINT
// ─────────────────────────────────────────────────────────────────

app.get('/api/ai-test', async (req, res) => {
  try {
    const envStatus = {
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      GROQ_API_KEY: !!process.env.GROQ_API_KEY,
      HUGGINGFACE_API_KEY: !!process.env.HUGGINGFACE_API_KEY,
      COHERE_API_KEY: !!process.env.COHERE_API_KEY,
      MISTRAL_API_KEY: !!process.env.MISTRAL_API_KEY,
      MONGODB_URI: !!process.env.MONGODB_URI,
      JWT_SECRET: !!process.env.JWT_SECRET,
      FRONTEND_URL: process.env.FRONTEND_URL || 'not set'
    };

    // ⭐ NEW: Test multi-AI system
    let multiAiTest = 'not configured';
    if (Object.values(envStatus).some((v, i) => i < 5 && v)) {
      try {
        const health = getHealthStatus(process.env);
        multiAiTest = `Available: ${health.available.join(', ') || 'none'}`;
      } catch (aiErr) {
        multiAiTest = `Error: ${aiErr.message.substring(0, 50)}`;
      }
    }

    // Existing Groq test
    let groqTest = 'not set';
    
    if (process.env.GROQ_API_KEY) {
      try {
        const Groq = require('groq-sdk');
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        
        const response = await groq.chat.completions.create({
          model: 'mixtral-8x7b-32768',
          messages: [{ role: 'user', content: 'Reply with: ok' }],
          max_tokens: 5
        });
        
        const content = response.choices[0]?.message?.content || '';
        groqTest = `✅ Connected: ${content.substring(0, 20)}`;
      } catch (groqErr) {
        groqTest = `❌ Error: ${groqErr.message.substring(0, 50)}`;
      }
    }

    res.json({
      environment: envStatus,
      multiAiSystem: multiAiTest,
      groq: groqTest,
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// DATABASE CLEAR ENDPOINT (Admin Utility)
// ─────────────────────────────────────────────────────────────────

app.delete('/api/clear-all', async (req, res) => {
  try {
    // Check for admin password in header
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'admin-override') {
      return res.status(403).json({ message: '❌ Unauthorized' });
    }

    const Candidate = require('./models/Candidate');
    const AuditLog = require('./models/AuditLog');
    
    const candidatesDeleted = await Candidate.deleteMany({});
    const auditLogsDeleted = await AuditLog.deleteMany({});
    
    res.json({
      message: '✅ Database cleared successfully',
      candidates: candidatesDeleted.deletedCount,
      auditLogs: auditLogsDeleted.deletedCount
    });
  } catch (err) {
    console.error('[clear-all]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// ROOT ENDPOINT
// ─────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    message: 'Recruitment IQ API',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      aiHealth: '/api/ai-health',
      aiTest: '/api/ai-test',
      analyze: '/api/analyze (POST)',
      auth: '/api/auth',
      candidates: '/api/candidates',
      jobs: '/api/jobs',
      resumes: '/api/resumes'
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// ERROR HANDLING - 404 Not Found
// ─────────────────────────────────────────────────────────────────

app.use((req, res) => {
  console.warn(`[404] ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    hint: 'Check your endpoint URL and HTTP method'
  });
});

// ─────────────────────────────────────────────────────────────────
// ERROR HANDLING - Server Errors
// ─────────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err.message);
  
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    timestamp: new Date().toISOString()
  });
});

// ─────────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

// ⭐ NEW: Check AI providers on startup
const configuredProviders = getConfiguredProviders(process.env);
const hasAiProviders = Object.values(configuredProviders).some(v => v);

if (!hasAiProviders) {
  console.warn('⚠️  WARNING: No AI providers configured!');
  console.warn('   Add API keys to .env:');
  console.warn('   - ANTHROPIC_API_KEY=sk-ant-...');
  console.warn('   - GROQ_API_KEY=gsk_...');
  console.warn('   - Or other providers');
} else {
  const active = Object.keys(configuredProviders).filter(k => configuredProviders[k]);
  console.log(`✅ AI Providers configured: ${active.join(', ')}`);
}

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  Health:        http://localhost:${PORT}/api/health`);
  console.log(`  AI Health:     http://localhost:${PORT}/api/ai-health`);
  console.log(`  AI Test:       http://localhost:${PORT}/api/ai-test`);
  console.log(`  Analyze:       http://localhost:${PORT}/api/analyze (POST)`);
  console.log(`  Root:          http://localhost:${PORT}/`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  mongoose.connection.close();
  process.exit(0);
});
