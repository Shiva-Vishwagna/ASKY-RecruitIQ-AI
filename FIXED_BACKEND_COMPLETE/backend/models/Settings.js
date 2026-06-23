const mongoose = require('mongoose');

const aiProviderSchema = new mongoose.Schema({
  id:        { type: String, required: true },
  name:      { type: String, required: true },
  provider:  { type: String, required: true },
  model:     { type: String, required: true },
  apiKey:    { type: String, default: '' },
  baseUrl:   { type: String, default: '' },
  enabled:   { type: Boolean, default: true },
  priority:  { type: Number, default: 0 },
  freetier:  { type: Boolean, default: false },
  notes:     { type: String, default: '' },
}, { _id: false });

const settingsSchema = new mongoose.Schema({
  companyName:        { type: String, default: 'ASKY RecruitIQ' },
  skillWeight:        { type: Number, default: 40 },
  experienceWeight:   { type: Number, default: 40 },
  educationWeight:    { type: Number, default: 20 },
  emailNotifications: { type: Boolean, default: true },
  newCandidateAlert:  { type: Boolean, default: true },
  aiProviders:        { type: [aiProviderSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
