const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  companyName:          { type: String, default: 'My Company' },
  aiModel:              { type: String, default: 'gpt-4o' },
  skillWeight:          { type: Number, default: 40 },
  experienceWeight:     { type: Number, default: 40 },
  educationWeight:      { type: Number, default: 20 },
  emailNotifications:   { type: Boolean, default: true },
  newCandidateAlert:    { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
