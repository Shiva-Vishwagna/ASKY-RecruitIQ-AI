/**
 * ASKY RecruitIQ — Storage Management
 * Auto-archive old candidates when DB hits 50-60% of free tier
 * Free tier: 512 MB. We clean at 50% (256 MB) to stay safe.
 */

const express   = require('express');
const router    = express.Router();
const mongoose  = require('mongoose');
const Candidate = require('../models/Candidate');
const AuditLog  = require('../models/AuditLog');
const { protect } = require('../middleware/auth');

// ── Constants ────────────────────────────────────────────────────
const FREE_TIER_MB     = 512;
const WARN_THRESHOLD   = 0.50; // 50% — show warning
const CLEAN_THRESHOLD  = 0.60; // 60% — auto suggest cleanup
const BYTES_PER_MB     = 1024 * 1024;

// Safe to archive: these statuses are "done" or "stale"
const ARCHIVABLE_STATUSES = ['rejected', 'cv_uploaded'];
const ARCHIVABLE_AI_SCREENED = ['ai_screened']; // if no questions sent and old

// ── GET /api/storage/status ───────────────────────────────────────
// Returns current DB storage stats and cleanup preview
router.get('/status', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });

    // Get DB stats
    const db = mongoose.connection.db;
    const stats = await db.stats();
    
    const usedMB     = stats.dataSize / BYTES_PER_MB;
    const usedPct    = (usedMB / FREE_TIER_MB) * 100;
    const remainMB   = FREE_TIER_MB - usedMB;
    const totalCands = await Candidate.countDocuments();

    // Preview what would be cleaned
    const now         = new Date();
    const days90ago   = new Date(now - 90 * 24 * 60 * 60 * 1000);
    const days60ago   = new Date(now - 60 * 24 * 60 * 60 * 1000);
    const days30ago   = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      rejected90,
      cvUploaded60,
      aiScreened90,
      rejectedRecent,
    ] = await Promise.all([
      Candidate.countDocuments({ status: 'rejected',    createdAt: { $lt: days90ago } }),
      Candidate.countDocuments({ status: 'cv_uploaded', createdAt: { $lt: days60ago } }),
      Candidate.countDocuments({ status: 'ai_screened', createdAt: { $lt: days90ago } }),
      Candidate.countDocuments({ status: 'rejected',    createdAt: { $gte: days30ago } }),
    ]);

    const cleanupEstimate = rejected90 + cvUploaded60 + aiScreened90;
    const savingEstMB     = cleanupEstimate * 0.0062; // ~6.2KB per candidate

    res.json({
      storage: {
        usedMB:      Math.round(usedMB * 100) / 100,
        usedPct:     Math.round(usedPct * 100) / 100,
        remainMB:    Math.round(remainMB * 100) / 100,
        freeTierMB:  FREE_TIER_MB,
        status:      usedPct >= CLEAN_THRESHOLD * 100 ? 'critical' :
                     usedPct >= WARN_THRESHOLD * 100  ? 'warning'  : 'healthy',
      },
      candidates: {
        total: totalCands,
        perMB: Math.round(totalCands / usedMB),
      },
      cleanup: {
        eligible: cleanupEstimate,
        breakdown: {
          rejected_90d:    rejected90,
          cv_uploaded_60d: cvUploaded60,
          ai_screened_90d: aiScreened90,
        },
        estimatedSavingMB: Math.round(savingEstMB * 100) / 100,
        safe: ['HM Ready', 'Answers Submitted', 'Questions Sent', 'Rejected (last 30d)'].join(', '),
        neverDelete: 'HM Ready, Answers Submitted, Questions Sent candidates are NEVER touched',
      },
    });

  } catch (err) {
    console.error('[storage/status]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/storage/cleanup ─────────────────────────────────────
// Admin-triggered cleanup — archives stale candidates
router.post('/cleanup', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });

    const {
      includeRejected90   = true,
      includeCvUploaded60 = true,
      includeAiScreened90 = false, // default false — more cautious
      dryRun              = true,  // always dry-run unless explicitly set to false
    } = req.body;

    const now       = new Date();
    const days90ago = new Date(now - 90 * 24 * 60 * 60 * 1000);
    const days60ago = new Date(now - 60 * 24 * 60 * 60 * 1000);

    // Build filter — NEVER delete HM Ready, Answers Submitted, Questions Sent
    const safeStatuses = ['hm_ready', 'answers_submitted', 'questions_sent'];
    const filters = [];

    if (includeRejected90) {
      filters.push({ status: 'rejected', createdAt: { $lt: days90ago } });
    }
    if (includeCvUploaded60) {
      filters.push({ status: 'cv_uploaded', createdAt: { $lt: days60ago }, aiScore: { $in: [0, null] } });
    }
    if (includeAiScreened90) {
      filters.push({
        status: 'ai_screened',
        createdAt: { $lt: days90ago },
        screeningSessions: { $size: 0 }, // no screening done
      });
    }

    if (filters.length === 0) {
      return res.json({ message: 'No cleanup filters selected', deleted: 0 });
    }

    const query = {
      $and: [
        { status: { $nin: safeStatuses } }, // SAFETY: never touch these
        { $or: filters }
      ]
    };

    // Find candidates that would be deleted
    const toDelete = await Candidate.find(query)
      .select('_id name status createdAt appliedFor uploadedByName')
      .lean();

    if (dryRun) {
      return res.json({
        dryRun: true,
        wouldDelete: toDelete.length,
        estimatedSavingMB: Math.round(toDelete.length * 0.0062 * 100) / 100,
        preview: toDelete.slice(0, 20).map(c => ({
          name:       c.name,
          status:     c.status,
          appliedFor: c.appliedFor,
          uploadedBy: c.uploadedByName,
          age:        Math.floor((now - new Date(c.createdAt)) / (1000 * 60 * 60 * 24)) + ' days old',
        })),
        message: dryRun
          ? `DRY RUN: ${toDelete.length} candidates would be archived. Set dryRun=false to confirm.`
          : '',
      });
    }

    // LIVE DELETE — only when dryRun=false explicitly passed
    const ids = toDelete.map(c => c._id);
    const result = await Candidate.deleteMany({ _id: { $in: ids } });

    // Audit log
    await AuditLog.create({
      user:     req.user.name,
      userId:   req.user._id,
      action:   'STORAGE_CLEANUP',
      resource: 'candidates',
      details:  `Archived ${result.deletedCount} stale candidates. Filters: ${JSON.stringify({ includeRejected90, includeCvUploaded60, includeAiScreened90 })}`,
    }).catch(() => {});

    console.log(`[storage/cleanup] ✅ Deleted ${result.deletedCount} stale candidates by ${req.user.name}`);

    res.json({
      dryRun:   false,
      deleted:  result.deletedCount,
      estimatedSavingMB: Math.round(result.deletedCount * 0.0062 * 100) / 100,
      message:  `✅ Archived ${result.deletedCount} stale candidates`,
    });

  } catch (err) {
    console.error('[storage/cleanup]', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
