const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// ============================================================
// ⭐ UPDATED: SECURITY & CONFIG IMPORTS
// ============================================================
const { analyzeWithFallback, getHealthStatus } = require('./services/multiAiService');
const { getConfiguredProviders } = require('./services/multiAiProviders');
const { verifyJWT } = require('./middleware/auth'); // ⭐ NEW

// ============================================================
// ⭐ CONSTANTS & UTILITIES
// ============================================================

const RESPONSE_CODES = {
  SUCCESS: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// Response utility functions ⭐ NEW
const sendResponse = (res, statusCode, data) => {
  res.status(statusCode).json({
    ...data,
    timestamp: new Date().toISOString(),
    requestId: res.locals.requestId
  });
};

const sendError = (res, statusCode, message, details = null) => {
  sendResponse(res, statusCode, {
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && details && { details })
  });
};

// ============================================================
// ⭐ ENVIRONMENT VALIDATION
// ============================================================

function validateEnvironment() {
  const required = ['MONGODB_URI', 'JWT_SECRET'];
  const missing = required.filter(env => !process.env[env]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  console.log('✅ Environment validation passed');
}

// ============================================================
// ⭐ INITIALIZE EXPRESS APP
// ============================================================

const app = express();

// ─────────────────────────────────────────────────────────────────
// REQUEST ID MIDDLEWARE ⭐ NEW
// ─────────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  res.locals.requestId = uuidv4();
  console.log(`[${res.locals.requestId}] ${req.method} ${req.originalUrl}`);
  next();
});

// ─────────────────────────────────────────────────────────────────
// SECURITY MIDDLEWARE
// ─────────────────────────────────────────────────────────────────

app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ⭐ NEW: RATE LIMITING
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Stricter for sensitive endpoints
  message: 'Too many requests to this endpoint',
});

app.use(limiter);

// ─────────────────────────────────────────────────────────────────
// CORS CONFIGURATION ⭐ UPDATED - MORE RESTRICTIVE
// ─────────────────────────────────────────────────────────────────

// ⭐ FIXED: Specific domain whitelist instead of wildcards
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
    
    // Only check exact whitelist - no wildcard includes
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Reject everything else
    console.warn(`[CORS BLOCKED] Origin: ${origin}`);
    callback(new Error(`CORS policy: Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
  maxAge: 600 // Cache CORS check for 10 minutes
}));

// ─────────────────────────────────────────────────────────────────
// DATABASE CONNECTION ⭐ IMPROVED
// ─────────────────────────────────────────────────────────────────

async function connectDB() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not set in environment variables');
    }

    // ⭐ NEW: Better connection options
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // 5 seconds
      socketTimeoutMS: 45000,
    });

    console.log('✅ MongoDB connected successfully');
    return true;
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    // ⭐ FIXED: Give time to retry instead of failing immediately
    console.warn('⚠️  Retrying connection in 5 seconds...');
    setTimeout(connectDB, 5000);
    return false;
  }
}

// ⭐ NEW: Ensure DB is connected before starting server
let dbConnected = false;

async function startServer() {
  try {
    validateEnvironment();
    dbConnected = await connectDB();
    
    // Optional: Wait for DB if critical
    let retries = 0;
    while (!dbConnected && retries < 5) {
      console.log(`Waiting for database connection... (${retries + 1}/5)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      dbConnected = mongoose.connection.readyState === 1;
      retries++;
    }

    if (!dbConnected) {
      console.warn('⚠️  Database not connected. Starting server anyway (non-blocking mode)');
    }

    // Auto-seed admin on first run
    try {
      const User = require('./models/User');
      const count = await User.countDocuments();
      if (count === 0) {
        // ⭐ FIXED: Properly hash password
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('Admin@1234', 10);
        
        await User.create({
          name: 'Admin',
          email: 'admin@recruitiq.com',
          password: hashedPassword, // ⭐ FIXED: Hashed, not plaintext
          role: 'admin',
          isActive: true
        });
        console.log('✅ Admin created: admin@recruitiq.com / Admin@1234');
        console.log('⚠️  CHANGE THIS PASSWORD IMMEDIATELY after first login!');
      }
    } catch (seedErr) {
      console.warn('⚠️  Seed skipped:', seedErr.message);
    }
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

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
    // ⭐ IMPROVED: Log actual error in dev mode
    console.log(`⚠️  Optional route not found (skipped): ${path}`);
    if (process.env.NODE_ENV === 'development') {
      console.log(`   Error details: ${e.message}`);
    }
  }
}

// ============================================================
// ⭐ MULTI-AI HEALTH ENDPOINT
// ============================================================

app.get('/api/ai-health', (req, res) => {
  try {
    const health = getHealthStatus(process.env);
    sendResponse(res, RESPONSE_CODES.SUCCESS, {
      success: true,
      status: health.status,
      providers: health.providers,
      available: health.available,
    });
  } catch (err) {
    console.error(`[${res.locals.requestId}] AI health check error:`, err.message);
    sendError(res, RESPONSE_CODES.SERVER_ERROR, 'Failed to check AI health', err.message);
  }
});

// ============================================================
// ⭐ MULTI-AI ANALYSIS ENDPOINT ⭐ IMPROVED
// ============================================================

app.post('/api/analyze', async (req, res) => {
  try {
    const { content } = req.body;
    
    // ⭐ IMPROVED: Better validation
    if (!content) {
      return sendError(res, RESPONSE_CODES.BAD_REQUEST, 'Content is required');
    }
    
    if (typeof content !== 'string') {
      return sendError(res, RESPONSE_CODES.BAD_REQUEST, 'Content must be a string');
    }
    
    if (content.trim().length === 0) {
      return sendError(res, RESPONSE_CODES.BAD_REQUEST, 'Content cannot be empty');
    }

    // ⭐ NEW: Max length validation to prevent DoS
    const MAX_CONTENT_LENGTH = 50000; // 50KB
    if (content.length > MAX_CONTENT_LENGTH) {
      return sendError(res, RESPONSE_CODES.BAD_REQUEST, 
        `Content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`);
    }

    console.log(`[${res.locals.requestId}] [ANALYZE] Processing content (${content.length} chars)...`);
    
    // ⭐ NEW: Add timeout for external API calls
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Analysis timeout')), 30000) // 30 seconds
    );

    const result = await Promise.race([
      analyzeWithFallback(content, process.env, console),
      timeoutPromise
    ]);
    
    if (result.success) {
      sendResponse(res, RESPONSE_CODES.SUCCESS, {
        success: true,
        analysis: result.analysis,
        provider: result.provider,
      });
    } else {
      sendError(res, RESPONSE_CODES.SERVICE_UNAVAILABLE,
        'All AI providers failed',
        { tried: result.tried || [] }
      );
    }
  } catch (err) {
    console.error(`[${res.locals.requestId}] [ANALYZE ERROR]`, err.message);
    sendError(res, RESPONSE_CODES.SERVER_ERROR, 'Analysis failed');
  }
});

// ─────────────────────────────────────────────────────────────────
// HEALTH CHECK ENDPOINT
// ─────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  const status = {
    success: true,
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development',
    aiProviders: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
      huggingface: !!process.env.HUGGINGFACE_API_KEY,
      cohere: !!process.env.COHERE_API_KEY,
      mistral: !!process.env.MISTRAL_API_KEY,
    }
  };
  
  sendResponse(res, RESPONSE_CODES.SUCCESS, status);
});

// ─────────────────────────────────────────────────────────────────
// AI TEST ENDPOINT ⭐ IMPROVED
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

    // Test multi-AI system
    let multiAiTest = 'not configured';
    if (Object.values(envStatus).some((v, i) => i < 5 && v)) {
      try {
        const health = getHealthStatus(process.env);
        multiAiTest = health.available.length > 0 
          ? `Available: ${health.available.join(', ')}`
          : 'No providers available';
      } catch (aiErr) {
        // ⭐ FIXED: Don't expose error details
        multiAiTest = 'Error checking availability';
        console.error(`[${res.locals.requestId}] AI check error:`, aiErr.message);
      }
    }

    // Groq test
    let groqTest = 'not configured';
    
    if (process.env.GROQ_API_KEY) {
      try {
        const Groq = require('groq-sdk');
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        
        const response = await groq.chat.completions.create({
          model: 'mixtral-8x7b-32768',
          messages: [{ role: 'user', content: 'Reply with: ok' }],
          max_tokens: 5
        });
        
        groqTest = `✅ Connected`;
      } catch (groqErr) {
        groqTest = `❌ Connection failed`;
        console.error(`[${res.locals.requestId}] Groq error:`, groqErr.message);
      }
    }

    sendResponse(res, RESPONSE_CODES.SUCCESS, {
      success: true,
      environment: envStatus,
      multiAiSystem: multiAiTest,
      groq: groqTest,
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
  } catch (err) {
    console.error(`[${res.locals.requestId}] AI test error:`, err.message);
    sendError(res, RESPONSE_CODES.SERVER_ERROR, 'AI test failed');
  }
});

// ─────────────────────────────────────────────────────────────────
// DATABASE CLEAR ENDPOINT ⭐ MAJOR SECURITY FIX
// ─────────────────────────────────────────────────────────────────

app.delete('/api/clear-all', strictLimiter, verifyJWT, async (req, res) => {
  try {
    // ⭐ FIXED: Check user role with JWT verification
    if (req.user.role !== 'admin') {
      return sendError(res, RESPONSE_CODES.FORBIDDEN, 'Admin access required');
    }

    const Candidate = require('./models/Candidate');
    const AuditLog = require('./models/AuditLog');
    
    const candidatesDeleted = await Candidate.deleteMany({});
    const auditLogsDeleted = await AuditLog.deleteMany({});
    
    console.log(`[${res.locals.requestId}] Database cleared by ${req.user.email}`);
    
    sendResponse(res, RESPONSE_CODES.SUCCESS, {
      success: true,
      message: 'Database cleared successfully',
      candidates: candidatesDeleted.deletedCount,
      auditLogs: auditLogsDeleted.deletedCount
    });
  } catch (err) {
    console.error(`[${res.locals.requestId}] Clear-all error:`, err.message);
    sendError(res, RESPONSE_CODES.SERVER_ERROR, 'Failed to clear database');
  }
});

// ─────────────────────────────────────────────────────────────────
// ROOT ENDPOINT
// ─────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  sendResponse(res, RESPONSE_CODES.SUCCESS, {
    success: true,
    message: 'Recruitment IQ API',
    version: '1.1.0',
    status: 'online',
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
  console.warn(`[${res.locals.requestId}] [404] ${req.method} ${req.originalUrl}`);
  sendError(res, RESPONSE_CODES.NOT_FOUND, 'Route not found');
});

// ─────────────────────────────────────────────────────────────────
// ERROR HANDLING - Server Errors
// ─────────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  const requestId = res.locals.requestId || 'unknown';
  console.error(`[${requestId}] [ERROR]`, err.stack || err.message);
  
  // Handle rate limit errors
  if (err.status === 429) {
    return sendError(res, RESPONSE_CODES.RATE_LIMITED, 'Too many requests');
  }

  // Handle CORS errors
  if (err.message.includes('CORS')) {
    return sendError(res, RESPONSE_CODES.FORBIDDEN, 'CORS policy violation');
  }

  sendError(res, err.status || RESPONSE_CODES.SERVER_ERROR, 
    err.message || 'Internal server error',
    process.env.NODE_ENV === 'development' ? err.stack : undefined
  );
});

// ─────────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

// Check AI providers on startup
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

// ⭐ NEW: Start server properly
startServer().then(() => {
  app.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ RecruitIQ Server running on port ${PORT}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log(`\nAPI Endpoints:`);
    console.log(`  Health:        http://localhost:${PORT}/api/health`);
    console.log(`  AI Health:     http://localhost:${PORT}/api/ai-health`);
    console.log(`  AI Test:       http://localhost:${PORT}/api/ai-test`);
    console.log(`  Analyze:       http://localhost:${PORT}/api/analyze (POST)`);
    console.log(`  Root:          http://localhost:${PORT}/`);
    console.log(`${'='.repeat(60)}\n`);
  });
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n✋ SIGTERM received, shutting down gracefully...');
  mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n✋ SIGINT received, shutting down gracefully...');
  mongoose.connection.close();
  process.exit(0);
});

module.exports = app;
