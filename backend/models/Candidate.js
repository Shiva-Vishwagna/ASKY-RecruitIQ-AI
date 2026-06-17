const mongoose = require("mongoose");

const CandidateSchema = new mongoose.Schema({

  // ── Core Identity ─────────────────────────────────────────────
  name:            { type: String, required: true, trim: true, maxlength: 100 },
  email:           { type: String, trim: true, default: "", maxlength: 100 },
  phone:           { type: String, trim: true, maxlength: 20 },
  appliedFor:      { type: String, maxlength: 100 },
  jobId:           { type: mongoose.Schema.Types.ObjectId, ref: "Job" },

  // ── Basic Profile ─────────────────────────────────────────────
  domain:          { type: String, maxlength: 50 },
  seniority:       { type: String, maxlength: 30 },
  experienceYears: { type: Number, default: 0, min: 0, max: 50 },
  topSkills:       { type: [String], validate: v => v.length <= 10 }, // max 10 skills

  // ── AI Scores ─────────────────────────────────────────────────
  aiScore:           { type: Number, default: 0, min: 0, max: 100 },
  tier:              { type: String, default: "C-Tier", maxlength: 10 },
  riskLevel:         { type: String, default: "medium", maxlength: 10 },
  primarySkillMatch: { type: Boolean },
  primarySkillScore: { type: Number, min: 0, max: 100 },
  jobFitScore:       { type: Number, min: 0, max: 100 },

  // ── Status & Workflow ─────────────────────────────────────────
  status:        { type: String, default: "new", maxlength: 30 },
  uploadedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  uploadedByName:{ type: String, maxlength: 50 },

  // ── AI Analysis ───────────────────────────────────────────────
  summary:              { type: String, maxlength: 400 },   // reduced from 500
  technicalExperience:  { type: String, maxlength: 200 },   // reduced from 300
  leadershipExperience: { type: String, maxlength: 200 },   // reduced from 300
  cloudExpertise:       { type: String, maxlength: 200 },   // reduced from 300
  recommendation:       { type: String, maxlength: 20 },
  recommendationReason: { type: String, maxlength: 200 },   // reduced from 300

  // ── Arrays — all strictly limited ────────────────────────────
  databases:      { type: [String], validate: v => v.length <= 8  },
  frameworks:     { type: [String], validate: v => v.length <= 8  },
  tools:          { type: [String], validate: v => v.length <= 8  },
  strengths:      { type: [String], validate: v => v.length <= 4  }, // reduced from 5
  gaps:           { type: [String], validate: v => v.length <= 4  }, // reduced from 5
  projectDomains: { type: [String], validate: v => v.length <= 4  },
  skillScores:    {                                                    // max 8 skill scores
    type: [{ skill: { type: String, maxlength: 30 }, score: { type: Number, min: 0, max: 100 } }],
    validate: v => v.length <= 8
  },

  // ── Screening ─────────────────────────────────────────────────
  screeningScore: { type: Number, min: 0, max: 100 },

  // Store ONLY scores + short feedback — NOT full answers (saves 80% space)
  screeningAnswers: {
    type: [{
      question:   { type: String, maxlength: 200 },   // question text
      aiScore:    { type: Number, min: 0, max: 100 },  // score only
      aiFeedback: { type: String, maxlength: 150 },    // very short feedback
      // answer: NOT stored — saves huge space
    }],
    validate: v => v.length <= 10
  },

  // Store questions as single joined string instead of array (saves overhead)
  // Max 8 questions, each max 150 chars
  interviewQuestions: {
    type: [{ type: String, maxlength: 150 }],
    validate: v => v.length <= 8
  },

  // ── Interview Feedback — max 2 entries ───────────────────────
  interviewFeedback: {
    type: [{
      interviewer: { type: String, maxlength: 50 },
      rating:      { type: Number, min: 1, max: 5 },
      notes:       { type: String, maxlength: 300 },  // reduced from 1000
      date:        { type: Date, default: Date.now }
    }],
    validate: v => v.length <= 2  // max 2 feedback entries
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },

}, {
  strict: true, // blocks ALL unknown fields including resumeText
});

// ── Indexes for fast queries ──────────────────────────────────
CandidateSchema.index({ jobId: 1, status: 1 });     // combined index
CandidateSchema.index({ uploadedBy: 1 });
CandidateSchema.index({ aiScore: -1 });
CandidateSchema.index({ createdAt: -1 });
// Note: removed separate status index — covered by jobId+status combined

module.exports = mongoose.model("Candidate", CandidateSchema);
