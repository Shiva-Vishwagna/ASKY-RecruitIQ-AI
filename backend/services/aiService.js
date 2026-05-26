const Groq = require('groq-sdk');

let groq;
function getClient() {
  if (!groq) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
}

async function screenResume(resumeText, jobTitle, jobDescription) {
  const client = getClient();
  const prompt = `You are an expert AI recruiter. Analyze this resume for the job position and return ONLY a valid JSON object, no other text.

JOB TITLE: ${jobTitle}
JOB DESCRIPTION: ${jobDescription || 'Not provided'}

RESUME TEXT:
${resumeText.slice(0, 3000)}

Return ONLY this JSON (no markdown, no backticks, no explanation):
{
  "name": "candidate full name from resume",
  "email": "email from resume or empty string",
  "phone": "phone from resume or empty string",
  "summary": "2-3 sentence professional summary",
  "skills": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "missingSkills": ["missing required skill1", "missing required skill2"],
  "riskFlags": ["any red flags like frequent job changes"],
  "scoreBreakdown": {
    "skills": 75,
    "experience": 70,
    "education": 65,
    "overall": 72
  },
  "tier": "B",
  "riskLevel": "low",
  "recommendation": "hire",
  "recommendationReason": "2-3 sentence explanation"
}

Scoring: A-tier=80-100 (strong hire), B-tier=60-79 (interview), C-tier=below 60 (reject)`;

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 1000,
  });

  const text = response.choices[0].message.content.trim();
  const cleaned = text.replace(/```json|```/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');
  return JSON.parse(jsonMatch[0]);
}

async function generateInterviewQuestions(jobTitle, jobDescription) {
  const client = getClient();
  const prompt = `Generate 8 targeted interview questions for: ${jobTitle}
Job Description: ${jobDescription || 'General role'}

Return ONLY a JSON array, no other text:
["question 1", "question 2", "question 3", "question 4", "question 5", "question 6", "question 7", "question 8"]`;

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 600,
  });

  const text = response.choices[0].message.content.trim();
  const cleaned = text.replace(/```json|```/g, '').trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array found');
  return JSON.parse(jsonMatch[0]);
}

module.exports = { screenResume, generateInterviewQuestions };
