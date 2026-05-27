const mongoose = require("mongoose");

const CandidateSchema = new mongoose.Schema({
  name:            { type: String, required: true, trim: true },
  email:           { type: String, trim: true, default: "" },
  phone:           { type: String, trim: true },
  appliedFor:      { type: String },
  jobId:           { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
  domain:          { type: String },
  seniority:       { type: String },
  experienceYears: { type: Number, default: 0 },
  topSkills:       [{ type: String }],
  aiScore:         { type: Number, default: 0 },
  tier:            { type: String, default: "C-Tier" },
  riskLevel:       { type: String, default: "medium" },
  status:          { type: String, default: "new" },
  uploadedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  uploadedByName:  { type: String },
  summary:         { type: String },

  // Rich AI analysis fields
  technicalExperience:  { type: String },
  leadershipExperience: { type: String },
  cloudExpertise:       { type: String },
  databases:            [{ type: String }],
  frameworks:           [{ type: String }],
  tools:                [{ type: String }],
  strengths:            [{ type: String }],
  gaps:                 [{ type: String }],
  skillScores:          [{ skill: String, score: Number }],
  recommendation:       { type: String },
  recommendationReason: { type: String },

  interviewFeedback: [{
    interviewer: String,
    rating: Number,
    notes: String,
    date: { type: Date, default: Date.now }
  }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
}, { strict: false });

module.exports = mongoose.model("Candidate", CandidateSchema);
