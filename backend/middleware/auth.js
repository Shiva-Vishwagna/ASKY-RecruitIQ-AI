// ============================================================
// JWT AUTHENTICATION MIDDLEWARE
// ============================================================
// Place this at: ./middleware/auth.js

const jwt = require('jsonwebtoken');

/**
 * Verify JWT token from Authorization header
 * Expected format: Bearer <token>
 */
const verifyJWT = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // ⭐ Check if Authorization header exists
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header missing',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }

    // ⭐ Extract token from "Bearer <token>" format
    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        error: 'Invalid Authorization header format. Use: Bearer <token>',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }

    const token = parts[1];

    // ⭐ Verify token signature and expiry
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ⭐ Attach user info to request for downstream handlers
    req.user = {
      id: decoded.userId || decoded.id,
      email: decoded.email,
      role: decoded.role || 'user',
      iat: decoded.iat,
      exp: decoded.exp
    };

    console.log(`[${res.locals.requestId}] ✅ JWT verified for user: ${req.user.email}`);
    next();

  } catch (err) {
    console.error(`[${res.locals.requestId}] JWT verification failed:`, err.message);

    // Different error handling based on error type
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        expiredAt: err.expiredAt,
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }

    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
  }
};

/**
 * Check if user has specific role
 * Usage: app.delete('/api/route', verifyJWT, requireRole('admin'), handler)
 */
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }

    if (req.user.role !== requiredRole) {
      console.warn(`[${res.locals.requestId}] ❌ Access denied for user ${req.user.email}. Required role: ${requiredRole}, actual: ${req.user.role}`);
      
      return res.status(403).json({
        success: false,
        error: `This action requires ${requiredRole} role`,
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }

    next();
  };
};

/**
 * Optional JWT verification - doesn't fail if token missing/invalid
 * Useful for endpoints that serve different content based on auth status
 */
const optionalJWT = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      req.user = {
        id: decoded.userId || decoded.id,
        email: decoded.email,
        role: decoded.role || 'user'
      };
      
      console.log(`[${res.locals.requestId}] ℹ️  Optional JWT verified for: ${req.user.email}`);
    }
  } catch (err) {
    // Silently ignore errors - auth is optional
    console.log(`[${res.locals.requestId}] ℹ️  No valid JWT provided (optional auth)`);
  }
  
  next();
};

module.exports = {
  verifyJWT,
  requireRole,
  optionalJWT
};
