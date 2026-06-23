const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  user:     { type: String, default: 'System', maxlength: 50 },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action:   { type: String, required: true, maxlength: 30 },
  resource: { type: String, default: '', maxlength: 20 },
  details:  { type: String, default: '', maxlength: 150 }, // reduced from unlimited
  ip:       { type: String, default: '', maxlength: 45 },
}, {
  timestamps: true,
});

// ── Auto-delete audit logs older than 90 days ─────────────────
// This keeps the collection small automatically
auditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 } // 90 days TTL
);

// ── Index for fast queries ────────────────────────────────────
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ action: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
