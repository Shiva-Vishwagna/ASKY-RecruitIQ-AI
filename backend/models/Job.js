const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title:          { type: String, required: true, trim: true },
  department:     { type: String, required: true, trim: true },
  location:       { type: String, default: 'Remote' },
  description:    { type: String, default: '' },
  requirements:   [{ type: String }],
  status:         { type: String, enum: ['open', 'closed', 'on-hold'], default: 'open' },
  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  candidateCount: { type: Number, default: 0 },
  questions:      [{ type: String }],
  // Level Engine fields
  level:          { type: String, default: 'Mid' },
  primarySkill:   { type: String, default: '' },
  requiredSkills: [{ type: String }],
  minAiScore:     { type: Number, default: 60 },
}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);
