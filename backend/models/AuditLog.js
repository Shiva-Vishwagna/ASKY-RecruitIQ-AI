const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  user:     { type: String, default: 'System' },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action:   { type: String, required: true },
  resource: { type: String, default: '' },
  details:  { type: String, default: '' },
  ip:       { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);
