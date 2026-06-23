const mongoose = require("mongoose");

const JDProfileSchema = new mongoose.Schema({
  rawText:     { type: String },
  skillMap:    { type: Object },
  candidateId: { type: String },
  source:      { type: String, default: "resume_upload" },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date },
});

module.exports = mongoose.model("JDProfile", JDProfileSchema);
