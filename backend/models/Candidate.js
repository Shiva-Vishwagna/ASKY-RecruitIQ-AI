const mongoose = require("mongoose");

const CandidateSchema = new mongoose.Schema({
  // Basic identity — all you need
  name:         { type: String, required: true, trim: true },
  email:        { type: String, required: true, trim: true },
  phone:        { type: String, trim: true },
  
  // Job context
  appliedFor:   { type: String },   // job title they applied to
  jobId:        { type: mongoose.Schema.Types.ObjectId, ref: "Job" },

  // AI extracted summary — small, no raw CV text
  domain:       { type: String },   // e.g. "Java CRM"
  seniority:    { type: String },   // Junior / Mid / Senior / Lead
  experienceYears: { type: Number, default: 0 },
  topSkills:    [{ type: String }], // ["Java", "Spring Boot", "MySQL"] max 10

  // Scoring
  aiScore:      { type: Number, default: 0 },  // 0-100
  tier:         { type: String, default: "C-Tier" }, // A/B/C Tier

  // Status
  status:       { type: String, default: "new" }, // new | reviewed | shortlisted | rejected

  // Timestamps
  createdAt:    { type: Date, default: Date.now },
  updatedAt:    { type: Date },
}, {
  // This stops mongoose storing extra unknown fields
  strict: true
});

module.exports = mongoose.model("Candidate", CandidateSchema);
