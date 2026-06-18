const mongoose = require("mongoose");

const CandidateSchema = new mongoose.Schema({
  // ── Core Identity ─────────────────────────────────────────
  name:            { type: String, required: true, trim: true, maxlength: 100 },
  email:           { type: String, trim: true, default: "", maxlength: 100 },
  phone:           { type: String, trim: true, maxlength: 20 },
  appliedFor:      { type: String, maxlength: 100 },
  jobId:           { type: mongoose.Schema.Types.ObjectId, ref: "Job" },

  // ── Basic Profile ─────────────────────────────────────────
  domain:          { type: String, maxlength: 50 },
  seniority:       { type: String, maxlength: 30 },
  experienceYears: { type: Number, default: 0, min: 0, max: 50 },
  topSkills:       { type: [String], validate: v => v.length <= 10 },

  // ── CV Score (from AI analysis of resume) ────────────────
  aiScore:           { type: Number, default: 0, min: 0, max: 100 }, // weighted CV score
  cvScoreBreakdown: {
    skillsMatchScore:      { type: Number, default: 0 },
    experienceScore:       { type: Number, default: 0 },
    domainScore:           { type: Number, default: 0 },
    educationScore:        { type: Number, default: 0 },
    projectRelevanceScore: { type: Number, default: 0 },
    stabilityScore:        { type: Number, default: 0 },
  },

  // ── Screening Score (from interview answers) ─────────────
  screeningScore: { type: Number, min: 0, max: 100 },
  screeningBreakdown: {
    technical:         { type: Number, default: 0 },
    communication:     { type: Number, default: 0 },
    problemSolving:    { type: Number, default: 0 },
    roleUnderstanding: { type: Number, default: 0 },
    motivation:        { type: Number, default: 0 },
  },

  // ── Combined Score ────────────────────────────────────────
  combinedScore: { type: Number, min: 0, max: 100 },

  // ── Tier & Classification ─────────────────────────────────
  tier:              { type: String, default: "C-Tier", maxlength: 10 },
  riskLevel:         { type: String, default: "medium", maxlength: 10 },
  primarySkillMatch: { type: Boolean },
  primarySkillScore: { type: Number, min: 0, max: 100 },
  jobFitScore:       { type: Number, min: 0, max: 100 },

  // ── Risk Flags ────────────────────────────────────────────
  riskFlags: {
    frequentJobChanges:     { type: Boolean, default: false },
    noticePeriodRisk:       { type: String, maxlength: 100 },
    missingMandatorySkills: { type: [String] },
    domainMismatch:         { type: Boolean, default: false },
  },
  missingMandatorySkills: { type: [String] },

  // ── Status & Workflow ─────────────────────────────────────
  status:         { type: String, default: "new", maxlength: 30 },
  uploadedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  uploadedByName: { type: String, maxlength: 50 },

  // ── AI Analysis ───────────────────────────────────────────
  summary:              { type: String, maxlength: 400 },
  hmSummary:            { type: String, maxlength: 600 }, // HM-ready summary
  technicalExperience:  { type: String, maxlength: 200 },
  leadershipExperience: { type: String, maxlength: 200 },
  cloudExpertise:       { type: String, maxlength: 200 },
  recommendation:       { type: String, maxlength: 20 },
  recommendationReason: { type: String, maxlength: 200 },

  // ── HM Interview Focus Areas ──────────────────────────────
  interviewFocusAreas: { type: [String], validate: v => v.length <= 5 },

  // ── Arrays ────────────────────────────────────────────────
  databases:      { type: [String], validate: v => v.length <= 8 },
  frameworks:     { type: [String], validate: v => v.length <= 8 },
  tools:          { type: [String], validate: v => v.length <= 8 },
  strengths:      { type: [String], validate: v => v.length <= 4 },
  gaps:           { type: [String], validate: v => v.length <= 4 },
  projectDomains: { type: [String], validate: v => v.length <= 4 },
  skillScores: {
    type: [{ skill: { type: String, maxlength: 30 }, score: { type: Number, min:0, max:100 } }],
    validate: v => v.length <= 8,
  },

  // ── Screening Answers ─────────────────────────────────────
  interviewQuestions: { type: [{ type: String, maxlength: 150 }], validate: v => v.length <= 8 },
  screeningAnswers: {
    type: [{
      question:       { type: String, maxlength: 200 },
      aiScore:        { type: Number, min: 0, max: 100 },
      scoreBreakdown: {
        technical:         { type: Number },
        communication:     { type: Number },
        problemSolving:    { type: Number },
        roleUnderstanding: { type: Number },
        motivation:        { type: Number },
      },
      aiFeedback: { type: String, maxlength: 150 },
    }],
    validate: v => v.length <= 10,
  },

  // ── Interview Feedback ────────────────────────────────────
  interviewFeedback: {
    type: [{
      interviewer: { type: String, maxlength: 50 },
      rating:      { type: Number, min: 1, max: 5 },
      notes:       { type: String, maxlength: 300 },
      date:        { type: Date, default: Date.now },
    }],
    validate: v => v.length <= 2,
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },

}, { strict: true });

// ── Indexes ───────────────────────────────────────────────────
CandidateSchema.index({ jobId: 1, status: 1 });
CandidateSchema.index({ uploadedBy: 1 });
CandidateSchema.index({ aiScore: -1 });
CandidateSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Candidate", CandidateSchema);
