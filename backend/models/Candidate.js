const mongoose = require("mongoose");

const CandidateSchema = new mongoose.Schema({
  // ── Core Identity (keep always) ──────────────────────────────
  name:            { type: String, required: true, trim: true },
  email:           { type: String, trim: true, default: "" },
  phone:           { type: String, trim: true },
  appliedFor:      { type: String },
  jobId:           { type: mongoose.Schema.Types.ObjectId, ref: "Job" },

  // ── Basic Profile (keep — small) ─────────────────────────────
  domain:          { type: String },
  seniority:       { type: String },
  experienceYears: { type: Number, default: 0 },
  topSkills:       [{ type: String }],

  // ── AI Scores (keep — critical) ──────────────────────────────
  aiScore:           { type: Number, default: 0 },
  tier:              { type: String, default: "C-Tier" },
  riskLevel:         { type: String, default: "medium" },
  primarySkillMatch: { type: Boolean },
  primarySkillScore: { type: Number },
  jobFitScore:       { type: Number },

  // ── Status & Workflow ─────────────────────────────────────────
  status:          { type: String, default: "new" },
  uploadedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  uploadedByName:  { type: String },

  // ── AI Analysis (keep — used in UI) ──────────────────────────
  summary:              { type: String },
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
  projectDomains:       [{ type: String }],

  // ── Screening (keep — used in UI) ────────────────────────────
  interviewQuestions: [{ type: String }],
  screeningScore:     { type: Number },
  screeningAnswers:   [{
    question:   String,
    answer:     { type: String, maxlength: 2000 }, // ← limit answer length
    aiScore:    Number,
    aiFeedback: { type: String, maxlength: 500 },  // ← limit feedback length
  }],

  // ── Interview Feedback ────────────────────────────────────────
  interviewFeedback: [{
    interviewer: String,
    rating:      Number,
    notes:       { type: String, maxlength: 1000 }, // ← limit notes
    date:        { type: Date, default: Date.now }
  }],

  // ── REMOVED: resumeText field (was biggest storage consumer) ──
  // resumeText: String  ← INTENTIONALLY NOT STORED

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
}, {
  strict: true, // ← changed from false to true — blocks any unknown fields including resumeText
});

// ── Index for faster queries ──────────────────────────────────
CandidateSchema.index({ jobId: 1 });
CandidateSchema.index({ uploadedBy: 1 });
CandidateSchema.index({ status: 1 });
CandidateSchema.index({ aiScore: -1 });
CandidateSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Candidate", CandidateSchema);
