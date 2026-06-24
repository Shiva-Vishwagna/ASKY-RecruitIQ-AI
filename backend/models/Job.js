const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title:          { type: String, required: true, trim: true },
  department:     { type: String, required: true, trim: true },
  location:       { type: String, default: 'Remote' },
  description:    { type: String, default: '' },
  requirements:   [{ type: String }],
  status:         { type: String, enum: ['open','closed','on-hold'], default: 'open' },
  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  candidateCount: { type: Number, default: 0 },
  questions:      [{ type: String }],

  // Role Type — Technical or Non-Technical
  roleType:       { type: String, enum: ['technical','non_technical'], default: 'technical' },

  // Level Engine
  level:          { type: String, default: 'Mid' },
  primarySkill:   { type: String, default: '' },
  requiredSkills: [{ type: String }],
  minAiScore:     { type: Number, default: 60 },

  closeReason:    { type: String, default: '' },
  closedAt:       { type: Date },
  isTemplate:     { type: Boolean, default: false },

  // Question Bank
  questionBank: [{
    text:       { type: String, maxlength: 400 },
    difficulty: { type: String, enum: ['easy','medium','hard'], default: 'medium' },
    category:   { type: String, default: 'Technical' },
  }],

  // ── Configurable scoring weightages ──────────────────────
  scoringWeights: {
    cvWeight:        { type: Number, default: 60, min: 0, max: 100 }, // % weight for CV score
    screeningWeight: { type: Number, default: 40, min: 0, max: 100 }, // % weight for screening score
  },

}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);
