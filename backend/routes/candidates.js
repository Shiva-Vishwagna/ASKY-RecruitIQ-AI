const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyJWT, optionalJWT } = require('../middleware/auth');
 
// ============================================================
// MULTER CONFIGURATION - For File Uploads
// ============================================================
 
// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads/resumes');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`✅ Created uploads directory: ${uploadsDir}`);
}
 
// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // ⭐ Generate unique filename
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const uniqueName = `${name}-${timestamp}${ext}`;
    cb(null, uniqueName);
  }
});
 
// File filter - only allow PDFs and common document formats
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];
 
  const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt'];
  const ext = path.extname(file.originalname).toLowerCase();
 
  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed: PDF, DOC, DOCX, TXT`), false);
  }
};
 
// Configure multer with limits and filters
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  }
});
 
// ============================================================
// ⭐ FIXED: RESUME UPLOAD ENDPOINT
// ============================================================
 
/**
 * POST /api/candidates/upload
 * Upload candidate resume/CV
 * 
 * Authentication: Optional (can upload with or without JWT)
 * Content-Type: multipart/form-data
 * 
 * Form fields:
 * - file: Resume file (PDF, DOC, DOCX, TXT)
 * - candidateId: (optional) Associated candidate ID
 * - candidateName: (optional) Candidate name
 */
router.post('/upload', optionalJWT, upload.single('file'), async (req, res) => {
  try {
    console.log(`[${res.locals.requestId}] Resume upload attempt`);
 
    // ⭐ Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded. Please provide a resume file.',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }
 
    console.log(`[${res.locals.requestId}] File received: ${req.file.originalname}`);
 
    // Extract file info
    const fileInfo = {
      originalName: req.file.originalname,
      savedName: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadedAt: new Date(),
      path: `/uploads/resumes/${req.file.filename}`,
      uploadedBy: req.user ? req.user.email : 'anonymous',
      candidateName: req.body.candidateName || 'Unknown',
      candidateId: req.body.candidateId || null
    };
 
    console.log(`[${res.locals.requestId}] ✅ File uploaded successfully`);
 
    // ⭐ Response with file details
    res.json({
      success: true,
      message: 'Resume uploaded successfully',
      file: fileInfo,
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
 
  } catch (err) {
    console.error(`[${res.locals.requestId}] Upload error:`, err.message);
 
    // ⭐ Clean up uploaded file if error occurs
    if (req.file) {
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.error('Failed to delete partial upload:', unlinkErr.message);
      });
    }
 
    // Return appropriate error
    let statusCode = 500;
    let errorMessage = 'File upload failed';
 
    if (err.code === 'LIMIT_FILE_SIZE') {
      statusCode = 413;
      errorMessage = 'File too large. Maximum size is 5MB.';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      statusCode = 400;
      errorMessage = 'Unexpected file field.';
    } else if (err.message.includes('Invalid file type')) {
      statusCode = 400;
      errorMessage = err.message;
    }
 
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
  }
});
 
// ============================================================
// GET CANDIDATE RESUMES (List uploaded resumes)
// ============================================================
 
/**
 * GET /api/candidates/:candidateId/resumes
 * Get resumes for a specific candidate
 */
router.get('/:candidateId/resumes', verifyJWT, async (req, res) => {
  try {
    const { candidateId } = req.params;
 
    // ⭐ TODO: Query your database for resumes
    // This is a placeholder - implement based on your Candidate model
    
    console.log(`[${res.locals.requestId}] Fetching resumes for candidate: ${candidateId}`);
 
    res.json({
      success: true,
      candidateId: candidateId,
      resumes: [
        // Your resume data from database would go here
      ],
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
 
  } catch (err) {
    console.error(`[${res.locals.requestId}] Error fetching resumes:`, err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resumes',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
  }
});
 
// ============================================================
// DELETE RESUME
// ============================================================
 
/**
 * DELETE /api/candidates/resume/:fileId
 * Delete a specific resume file
 */
router.delete('/resume/:fileId', verifyJWT, async (req, res) => {
  try {
    const { fileId } = req.params;
 
    console.log(`[${res.locals.requestId}] Deleting resume: ${fileId}`);
 
    // ⭐ TODO: Verify ownership and delete from database
    // Then delete physical file:
    // fs.unlinkSync(path.join(uploadsDir, fileId));
 
    res.json({
      success: true,
      message: 'Resume deleted successfully',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
 
  } catch (err) {
    console.error(`[${res.locals.requestId}] Error deleting resume:`, err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to delete resume',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
  }
});
 
// ============================================================
// GET ALL CANDIDATES
// ============================================================
 
/**
 * GET /api/candidates
 * Get all candidates (with pagination)
 */
router.get('/', optionalJWT, async (req, res) => {
  try {
    const Candidate = require('../models/Candidate');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
 
    const candidates = await Candidate.find()
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });
 
    const total = await Candidate.countDocuments();
 
    res.json({
      success: true,
      candidates: candidates,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      },
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
 
  } catch (err) {
    console.error(`[${res.locals.requestId}] Error fetching candidates:`, err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch candidates',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
  }
});
 
// ============================================================
// GET SINGLE CANDIDATE
// ============================================================
 
/**
 * GET /api/candidates/:id
 * Get a specific candidate by ID
 */
router.get('/:id', optionalJWT, async (req, res) => {
  try {
    const Candidate = require('../models/Candidate');
    const candidate = await Candidate.findById(req.params.id);
 
    if (!candidate) {
      return res.status(404).json({
        success: false,
        error: 'Candidate not found',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }
 
    res.json({
      success: true,
      candidate: candidate,
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
 
  } catch (err) {
    console.error(`[${res.locals.requestId}] Error fetching candidate:`, err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch candidate',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
  }
});
 
// ============================================================
// CREATE CANDIDATE
// ============================================================
 
/**
 * POST /api/candidates
 * Create a new candidate
 */
router.post('/', verifyJWT, async (req, res) => {
  try {
    const { name, email, phone, position, experience } = req.body;
 
    // ⭐ Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }
 
    const Candidate = require('../models/Candidate');
 
    const candidate = await Candidate.create({
      name,
      email,
      phone,
      position,
      experience,
      createdBy: req.user.id
    });
 
    res.status(201).json({
      success: true,
      message: 'Candidate created successfully',
      candidate: candidate,
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
 
  } catch (err) {
    console.error(`[${res.locals.requestId}] Error creating candidate:`, err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create candidate',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
  }
});
 
// ============================================================
// UPDATE CANDIDATE
// ============================================================
 
/**
 * PUT /api/candidates/:id
 * Update a candidate
 */
router.put('/:id', verifyJWT, async (req, res) => {
  try {
    const Candidate = require('../models/Candidate');
    const candidate = await Candidate.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
 
    if (!candidate) {
      return res.status(404).json({
        success: false,
        error: 'Candidate not found',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }
 
    res.json({
      success: true,
      message: 'Candidate updated successfully',
      candidate: candidate,
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
 
  } catch (err) {
    console.error(`[${res.locals.requestId}] Error updating candidate:`, err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update candidate',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
  }
});
 
// ============================================================
// DELETE CANDIDATE
// ============================================================
 
/**
 * DELETE /api/candidates/:id
 * Delete a candidate
 */
router.delete('/:id', verifyJWT, async (req, res) => {
  try {
    const Candidate = require('../models/Candidate');
    const candidate = await Candidate.findByIdAndDelete(req.params.id);
 
    if (!candidate) {
      return res.status(404).json({
        success: false,
        error: 'Candidate not found',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
      });
    }
 
    res.json({
      success: true,
      message: 'Candidate deleted successfully',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
 
  } catch (err) {
    console.error(`[${res.locals.requestId}] Error deleting candidate:`, err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to delete candidate',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    });
  }
});
 
module.exports = router;
