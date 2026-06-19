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

  // ── Role Type — drives all question & scoring logic ──────
  // technical: IT/Engineering roles — scores on skills + stability
  // non_technical: Sales, Travel, HR, Ops, etc — scores on experience relevance + stability
  roleType: {
    type:    String,
    enum:    ['technical', 'non_technical'],
    default: 'technical',
  },

  // Level Engine
  level:          { type: String, default: 'Mid' },
  primarySkill:   { type: String, default: '' },
  requiredSkills: [{ type: String }],
  minAiScore:     { type: Number, default: 60 },

  // Question Bank
  questionBank: [{
    text:       { type: String, maxlength: 400 },
    difficulty: { type: String, enum: ['easy','medium','hard'], default: 'medium' },
    category:   { type: String, default: 'General' },
  }],

  // Configurable scoring weights (cv% + screening% must = 100)
  scoringWeights: {
    cvWeight:        { type: Number, default: 60, min: 0, max: 100 },
    screeningWeight: { type: Number, default: 40, min: 0, max: 100 },
  },

}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);
