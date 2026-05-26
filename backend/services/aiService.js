const Groq = require('groq-sdk');

async function screenResumeWithAI(rawText, jobTitle) {
  const prompt = `You are an expert technical recruiter. Analyze this resume for the role: "${jobTitle || 'Software Engineer'}".

Return ONLY valid JSON with no extra text:
{
  "name": "full name",
  "email": "email or empty string",
  "phone": "phone or empty string",
  "domain": "primary tech domain e.g. Java Backend, React Frontend, DevOps",
  "seniority": "Junior or Mid or Senior or Lead",
  "experience_years": 5,
  "topSkills": ["skill1","skill2","skill3","skill4","skill5"],
  "aiScore": 78,
  "tier": "A-Tier or B-Tier or C-Tier",
  "riskLevel": "low or medium or high",
  "summary": "2-3 sentence overview of the candidate",
  "projectDomains": ["Telecom","Banking"],
  "technicalExperience": "2-3 sentences about their technical stack and project experience",
  "leadershipExperience": "1-2 sentences about leadership or team experience, or 'No leadership experience mentioned'",
  "cloudExpertise": "1-2 sentences about cloud/infra skills, or 'No cloud expertise mentioned'",
  "databases": ["PostgreSQL","MongoDB"],
  "frameworks": ["Spring Boot","React"],
  "tools": ["Docker","Jenkins","Git"],
  "strengths": ["strength 1","strength 2","strength 3"],
  "gaps": ["gap 1","gap 2"],
  "skillScores": [
    {"skill": "Java", "score": 85},
    {"skill": "Spring Boot", "score": 75},
    {"skill": "SQL", "score": 70}
  ],
  "recommendation": "Strong Hire or Hire or Maybe or No Hire",
  "recommendationReason": "2-3 sentence explanation of the hiring recommendation"
}

Resume:
${rawText.slice(0, 4000)}`;

  const providers = [tryGroq, tryOpenAI, tryAnthropic];
  for (const provider of providers) {
    try {
      const result = await provider(prompt);
      if (result) return result;
    } catch (e) {
      console.log(`[AI provider failed] ${e.message}`);
    }
  }
  console.warn('[AI] All providers failed');
  return null;
}

async function tryGroq(prompt) {
  if (!process.env.GROQ_API_KEY) return null;
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const resp = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 1000,
  });
  return parseJSON(resp.choices[0].message.content);
}

async function tryOpenAI(prompt) {
  if (!process.env.OPENAI_API_KEY) return null;
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const resp = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 1000,
  });
  return parseJSON(resp.choices[0].message.content);
}

async function tryAnthropic(prompt) {
  if (!process.env.CLAUDE_API_KEY) return null;
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });
  return parseJSON(msg.content[0].text);
}

function parseJSON(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]);
}

module.exports = { screenResumeWithAI };
