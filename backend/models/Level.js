const mongoose = require('mongoose');

const levelSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  minYears:       { type: Number, default: 0 },
  maxYears:       { type: Number, default: 5 },
  minScore:       { type: Number, default: 60 },
  requiredSkills: [{ type: String }],
  education:      { type: String, default: 'Any' },
  active:         { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Level', levelSchema);
