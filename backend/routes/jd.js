const express = require("express");
const multer = require("multer");
const mammoth = require("mammoth");
const Anthropic = require("@anthropic-ai/sdk");
const JDProfile = require("../models/JDProfile");
const { JD_EXTRACT_PROMPT } = require("../prompts/jdExtract");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function extractText(buffer, mimetype) {
  if (mimetype === "application/pdf") {
    // Dynamic import to avoid ESM/CJS conflict with pdf-parse
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (mimetype.includes("wordprocessingml")) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  throw new Error("Unsupported file type. Use PDF or DOCX.");
}

router.post("/parse-resume", upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded." });

    const rawText = await extractText(req.file.buffer, req.file.mimetype);

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: JD_EXTRACT_PROMPT,
      messages: [{ role: "user", content: `Resume text:\n\n${rawText}` }],
    });

    const raw = message.content[0].text.replace(/```json|```/g, "").trim();
    const skillMap = JSON.parse(raw);

    const saved = await JDProfile.create({
      rawText: "",
      skillMap,
      source: "resume_upload",
      createdAt: new Date(),
    });

    res.json({ skillMap, jdId: saved._id });
  } catch (err) {
    console.error("[parse-resume]", err);
    res.status(500).json({ message: err.message || "Parsing failed." });
  }
});

router.post("/save", async (req, res) => {
  try {
    const { skillMap, candidateId } = req.body;
    const saved = await JDProfile.findOneAndUpdate(
      { candidateId },
      { skillMap, candidateId, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, id: saved._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
