const mongoose = require("mongoose");

const CandidateSchema = new mongoose.Schema({
  // Core Identity
  name:            { type: String, required: true, trim: true, maxlength: 100 },
  email:           { type: String, trim: true, default: "", maxlength: 100 },
  phone:           { type: String, trim: true, maxlength: 20 },
  appliedFor:      { type: String, maxlength: 100 },
  jobId:           { type: mongoose.Schema.Types.ObjectId, ref: "Job" },

  // Profile
  domain:          { type: String, maxlength: 50 },
  seniority:       { type: String, maxlength: 30 },
  experienceYears: { type: Number, default: 0, min: 0, max: 50 },
  topSkills:       [{ type: String, maxlength: 50 }],

  // CV Score — skills(70%) + stability(30%)
  aiScore: { type: Number, default: 0, min: 0, max: 100 },
  cvScoreBreakdown: {
    skillsMatchScore: { type: Number, default: 0 },
    stabilityScore:   { type: Number, default: 0 },
  },

  // Screening Score — technical only
  screeningScore: { type: Number, default: 0, min: 0, max: 100 },
  screeningBreakdown: {
    technical: { type: Number, default: 0 },
    depth:     { type: Number, default: 0 },
    relevance: { type: Number, default: 0 },
  },

  // Combined Score = CV(60%) + Screening(40%)
  combinedScore: { type: Number, default: 0, min: 0, max: 100 },

  // Tier & Classification
  tier:              { type: String, default: "C-Tier", maxlength: 10 },
  riskLevel:         { type: String, default: "medium", maxlength: 10 },
  primarySkillMatch: { type: Boolean },
  primarySkillScore: { type: Number, min: 0, max: 100 },
  jobFitScore:       { type: Number, min: 0, max: 100 },

  // Risk Flags
  riskFlags: {
    frequentJobChanges:     { type: Boolean, default: false },
    noticePeriodRisk:       { type: String, maxlength: 100, default: "" },
    missingMandatorySkills: [{ type: String, maxlength: 50 }],
    domainMismatch:         { type: Boolean, default: false },
  },

  // Status & Workflow
  status:         { type: String, default: "cv_uploaded", maxlength: 30 },
  uploadedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  uploadedByName: { type: String, maxlength: 50 },

  // AI Analysis
  summary:              { type: String, maxlength: 500 },
  hmSummary:            { type: String, maxlength: 800 },
  technicalExperience:  { type: String, maxlength: 300 },
  leadershipExperience: { type: String, maxlength: 300 },
  cloudExpertise:       { type: String, maxlength: 300 },
  recommendation:       { type: String, maxlength: 20 },
  recommendationReason: { type: String, maxlength: 300 },

  // HM Interview Focus
  interviewFocusAreas: [{ type: String, maxlength: 200 }],

  // Tech Arrays
  databases:      [{ type: String, maxlength: 50 }],
  frameworks:     [{ type: String, maxlength: 50 }],
  tools:          [{ type: String, maxlength: 50 }],
  strengths:      [{ type: String, maxlength: 200 }],
  gaps:           [{ type: String, maxlength: 200 }],
  projectDomains: [{ type: String, maxlength: 50 }],
  skillScores: [{
    skill: { type: String, maxlength: 50 },
    score: { type: Number, min: 0, max: 100 },
  }],

  // Screening
  interviewQuestions: [{ type: String, maxlength: 400 }],
  screeningAnswers: [{
    question:      { type: String, maxlength: 400 },
    aiScore:       { type: Number, min: 0, max: 100 },
    scoreBreakdown: {
      technical: { type: Number, default: 0 },
      depth:     { type: Number, default: 0 },
      relevance: { type: Number, default: 0 },
    },
    aiFeedback: { type: String, maxlength: 200 },
  }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },

}, { strict: true });

CandidateSchema.index({ jobId: 1, status: 1 });
CandidateSchema.index({ uploadedBy: 1 });
CandidateSchema.index({ aiScore: -1 });
CandidateSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Candidate", CandidateSchema);
