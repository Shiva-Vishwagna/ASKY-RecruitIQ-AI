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
  process.env.FRONTEND_URL || 'https://asky-recruit-iq-ai.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (origin && origin.includes('.vercel.app')) return callback(null, true);
    if (origin && origin.includes('localhost')) return callback(null, true);
    if (origin && origin.includes('127.0.0.1')) return callback(null, true);
    console.warn('[CORS] Rejected origin: ' + origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));

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
      console.warn('Seed skipped:', seedErr.message);
    }
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
  }
}

connectDB();

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/jobs',       require('./routes/jobs'));
app.use('/api/candidates', require('./routes/candidates'));
app.use('/api/resumes',    require('./routes/resumes'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/settings',   require('./routes/settings'));

const optionalRoutes = [
  { path: '/api/analytics',  file: './routes/analytics'  },
  { path: '/api/levels',     file: './routes/levels'     },
  { path: '/api/audit-logs', file: './routes/auditLogs'  },
  { path: '/api/jd',         file: './routes/jd'         },
];

for (const route of optionalRoutes) {
  try {
    app.use(route.path, require(route.file));
    console.log('Optional route loaded: ' + route.path);
  } catch (e) {
    console.log('Optional route not found (skipped): ' + route.path);
  }
}

app.get('/api/health', function(req, res) {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 1 : 0,
    timestamp: new Date().toISOString(),
    env: {
      groq_api_key: !!process.env.GROQ_API_KEY,
      mongodb_uri: !!process.env.MONGODB_URI,
      frontend_url: process.env.FRONTEND_URL || 'not set',
      jwt_secret: !!process.env.JWT_SECRET
    }
  });
});

app.get('/api/ai-test', function(req, res) {
  var envStatus = {
    GROQ_API_KEY: !!process.env.GROQ_API_KEY,
    MONGODB_URI: !!process.env.MONGODB_URI,
    JWT_SECRET: !!process.env.JWT_SECRET,
    FRONTEND_URL: process.env.FRONTEND_URL || 'not set'
  };
  var groqTest = 'not tested';
  res.json({
    environment: envStatus,
    groq: groqTest,
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.get('/', function(req, res) {
  res.json({
    message: 'Recruitment IQ API',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

app.use(function(req, res) {
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

app.use(function(err, req, res, next) {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

var PORT = process.env.PORT || 5000;

app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
  console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
  console.log('Frontend: ' + (process.env.FRONTEND_URL || 'http://localhost:3000'));
  console.log('Health: http://localhost:' + PORT + '/api/health');
});

process.on('SIGTERM', function() {
  console.log('SIGTERM received, shutting down gracefully');
  mongoose.connection.close();
  process.exit(0);
});
