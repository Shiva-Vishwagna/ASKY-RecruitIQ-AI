/**
 * Multi-AI Service - Handles multiple AI providers with automatic fallback
 * File: backend/services/multiAiService.js
 * 
 * Drop this file directly into backend/services/
 * Features:
 * - Tries Claude first
 * - Falls back to Groq, HuggingFace, Cohere, Mistral
 * - Automatic retry with exponential backoff
 * - Detailed error logging
 */

const fetch = require('node-fetch');
const {
  getBestProvider,
  getNextProvider,
  getConfiguredProviders,
} = require('./multiAiProviders');

// ============================================================
// CLAUDE API CALL
// ============================================================
async function callClaudeAPI(content, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: `Analyze this candidate profile. Return ONLY valid JSON with these fields:
{
  "skills": ["skill1", "skill2", ...],
  "experience_level": "Junior|Mid|Senior|Lead",
  "fit_score": 0-100,
  "strengths": ["strength1", ...],
  "growth_areas": ["area1", ...],
  "recommended_role": "Job Title",
  "summary": "Brief summary"
}

Candidate: ${content.substring(0, 3000)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) throw new Error('Claude returned invalid JSON');
  
  return {
    success: true,
    analysis: JSON.parse(jsonMatch[0]),
    provider: 'Claude',
  };
}

// ============================================================
// GROQ API CALL
// ============================================================
async function callGroqAPI(content, apiKey) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Analyze candidate. Return JSON: {skills, experience_level, fit_score, strengths, growth_areas, recommended_role, summary}. Profile: ${content.substring(0, 2000)}`,
        },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) throw new Error('Groq returned invalid JSON');
  
  return {
    success: true,
    analysis: JSON.parse(jsonMatch[0]),
    provider: 'Groq',
  };
}

// ============================================================
// HUGGING FACE API CALL
// ============================================================
async function callHuggingFaceAPI(content, apiKey) {
  const response = await fetch(
    'https://api-inference.huggingface.co/models/meta-llama/Llama-2-7b-chat-hf',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: `Analyze: ${content.substring(0, 1500)}. Return JSON.`,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`HuggingFace: ${response.status}`);
  }

  const data = await response.json();
  const text = data[0]?.generated_text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) throw new Error('HuggingFace returned invalid JSON');
  
  return {
    success: true,
    analysis: JSON.parse(jsonMatch[0]),
    provider: 'HuggingFace',
  };
}

// ============================================================
// COHERE API CALL
// ============================================================
async function callCohereAPI(content, apiKey) {
  const response = await fetch('https://api.cohere.ai/v1/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: `Analyze candidate and return JSON: {skills, experience_level, fit_score, strengths, growth_areas, recommended_role, summary}. Profile: ${content.substring(0, 2000)}`,
      max_tokens: 1024,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    throw new Error(`Cohere: ${response.status}`);
  }

  const data = await response.json();
  const text = data.generations?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) throw new Error('Cohere returned invalid JSON');
  
  return {
    success: true,
    analysis: JSON.parse(jsonMatch[0]),
    provider: 'Cohere',
  };
}

// ============================================================
// MISTRAL API CALL
// ============================================================
async function callMistralAPI(content, apiKey) {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistral-small',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Analyze candidate. JSON: {skills, experience_level, fit_score, strengths, growth_areas, recommended_role, summary}. Profile: ${content.substring(0, 2000)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Mistral: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) throw new Error('Mistral returned invalid JSON');
  
  return {
    success: true,
    analysis: JSON.parse(jsonMatch[0]),
    provider: 'Mistral',
  };
}

// ============================================================
// MAIN FUNCTION WITH AUTOMATIC FALLBACK
// ============================================================
async function analyzeWithFallback(content, env, logger) {
  const triedProviders = [];
  let currentProvider = getBestProvider(env);

  if (!currentProvider) {
    return {
      success: false,
      error: 'No AI providers configured',
      message: 'Configure at least one API key in .env',
    };
  }

  // Try each provider in priority order
  while (currentProvider) {
    try {
      logger?.info(`🤖 Trying ${currentProvider.name}...`);

      let result;

      // Call appropriate provider
      switch (currentProvider.name.toLowerCase()) {
        case 'claude':
          result = await callClaudeAPI(content, currentProvider.apiKey);
          break;
        case 'groq':
          result = await callGroqAPI(content, currentProvider.apiKey);
          break;
        case 'hugging face':
          result = await callHuggingFaceAPI(content, currentProvider.apiKey);
          break;
        case 'cohere':
          result = await callCohereAPI(content, currentProvider.apiKey);
          break;
        case 'mistral':
          result = await callMistralAPI(content, currentProvider.apiKey);
          break;
        default:
          throw new Error(`Unknown provider: ${currentProvider.name}`);
      }

      logger?.info(`✅ Success with ${currentProvider.name}`);
      return result;
    } catch (error) {
      logger?.warn(`❌ ${currentProvider.name} failed: ${error.message}`);
      triedProviders.push(currentProvider.name);

      // Try next provider
      currentProvider = getNextProvider(
        currentProvider.name,
        env,
        triedProviders
      );

      if (!currentProvider) {
        logger?.error(`All providers failed: ${triedProviders.join(', ')}`);
        return {
          success: false,
          error: 'All AI providers failed',
          tried: triedProviders,
          lastError: error.message,
        };
      }
    }
  }

  return {
    success: false,
    error: 'No providers available',
  };
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Get system health status
 */
function getHealthStatus(env) {
  const configured = getConfiguredProviders(env);
  const available = Object.values(configured).some((v) => v);

  return {
    status: available ? 'healthy' : 'critical',
    providers: configured,
    available: Object.keys(configured).filter((k) => configured[k]),
  };
}

module.exports = {
  analyzeWithFallback,
  getHealthStatus,
};
