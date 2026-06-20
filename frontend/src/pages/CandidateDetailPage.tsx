const mongoose = require("mongoose");

const CandidateSchema = new mongoose.Schema({
  // ── Identity
  name:            { type: String, required: true, trim: true, maxlength: 100 },
  email:           { type: String, trim: true, default: "", maxlength: 100 },
  phone:           { type: String, trim: true, default: "", maxlength: 20 },
  appliedFor:      { type: String, default: "", maxlength: 100 },
  jobId:           { type: mongoose.Schema.Types.ObjectId, ref: "Job" },

  // ── Profile
  domain:          { type: String, default: "", maxlength: 60 },
  seniority:       { type: String, default: "", maxlength: 30 },
  experienceYears: { type: Number, default: 0 },
  topSkills:       [{ type: String, maxlength: 60 }],

  // ── CV Score  (skills 70% + stability 30% for tech | experience 60% + stability 40% for non-tech)
  aiScore:         { type: Number, default: 0 },
  cvScoreBreakdown: {
    skillsMatchScore: { type: Number, default: 0 },   // also used for experienceRelevance in non-tech
    stabilityScore:   { type: Number, default: 0 },
  },

  // ── Screening (flexible Map so any keys work for both tech + non-tech)
  screeningScore:     { type: Number, default: 0 },
  screeningBreakdown: { type: Map, of: Number, default: {} }, // flexible: any criteria keys

  // ── Combined & final
  combinedScore:   { type: Number, default: 0 },
  hmReportType:    { type: String, default: "cv_only", maxlength: 30 },

  // ── Classification
  tier:      { type: String, default: "C-Tier", maxlength: 10 },
  riskLevel: { type: String, default: "medium", maxlength: 10 },
  primarySkillMatch: { type: Boolean },
  primarySkillScore: { type: Number, default: 0 },
  jobFitScore:       { type: Number, default: 0 },

  riskFlags: {
    frequentJobChanges:     { type: Boolean, default: false },
    noticePeriodRisk:       { type: String, default: "", maxlength: 100 },
    missingMandatorySkills: [{ type: String, maxlength: 60 }],
    domainMismatch:         { type: Boolean, default: false },
  },

  // ── Status
  status:         { type: String, default: "cv_uploaded", maxlength: 30 },
  uploadedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  uploadedByName: { type: String, default: "", maxlength: 60 },

  // ── AI Insights
  summary:              { type: String, default: "", maxlength: 600 },
  hmSummary:            { type: String, default: "", maxlength: 900 },
  technicalExperience:  { type: String, default: "", maxlength: 400 },
  leadershipExperience: { type: String, default: "", maxlength: 400 },
  cloudExpertise:       { type: String, default: "", maxlength: 400 },
  recommendation:       { type: String, default: "", maxlength: 30 },
  recommendationReason: { type: String, default: "", maxlength: 400 },
  interviewFocusAreas:  [{ type: String, maxlength: 250 }],
  strengths:  [{ type: String, maxlength: 250 }],
  gaps:       [{ type: String, maxlength: 250 }],
  databases:  [{ type: String, maxlength: 60 }],
  frameworks: [{ type: String, maxlength: 60 }],
  tools:      [{ type: String, maxlength: 60 }],
  projectDomains: [{ type: String, maxlength: 60 }],
  skillScores: [{
    skill: { type: String, maxlength: 60 },
    score: { type: Number, default: 0 },
  }],

  // ── Screening sessions (history of all screening rounds)
  screeningSessions: [{
    sessionType:        { type: String, enum: ["ai_generated","bank_questions"], default: "ai_generated" },
    difficulty:         { type: String, enum: ["easy","medium","hard"], default: "medium" },
    conductedAt:        { type: Date, default: Date.now },
    conductedBy:        { type: String, default: "", maxlength: 100 },
    questions:          [{ type: String, maxlength: 500 }],
    screeningScore:     { type: Number, default: 0 },
    screeningBreakdown: { type: Map, of: Number, default: {} },
    answers: [{
      question:       { type: String, maxlength: 500 },
      aiScore:        { type: Number, default: 0 },
      scoreBreakdown: { type: Map, of: Number, default: {} },
      aiFeedback:     { type: String, default: "", maxlength: 300 },
    }],
  }],

  // ── Active screening answers (latest session for quick access)
  interviewQuestions: [{ type: String, maxlength: 500 }],
  screeningAnswers: [{
    question:       { type: String, maxlength: 500 },
    aiScore:        { type: Number, default: 0 },
    scoreBreakdown: { type: Map, of: Number, default: {} },
    aiFeedback:     { type: String, default: "", maxlength: 300 },
  }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },

}, { strict: true });

CandidateSchema.index({ jobId: 1, status: 1 });
CandidateSchema.index({ uploadedBy: 1 });
CandidateSchema.index({ aiScore: -1 });
CandidateSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Candidate", CandidateSchema);
