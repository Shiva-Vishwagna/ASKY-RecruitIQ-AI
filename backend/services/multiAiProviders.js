/**
 * Multi-AI Providers Configuration
 * File: backend/services/multiAiProviders.js
 * 
 * Drop this file directly into backend/services/
 * Supports: Claude, Groq, Hugging Face, Cohere, Mistral
 */

const multiAiProviders = {
  // ============================================================
  // 1. CLAUDE (Anthropic) - PRIMARY
  // ============================================================
  claude: {
    name: 'Claude',
    provider: 'anthropic',
    enabled: true,
    priority: 1,
    models: ['claude-opus-4-6', 'claude-sonnet-4-6'],
    defaultModel: 'claude-opus-4-6',
    apiEndpoint: 'https://api.anthropic.com/v1/messages',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    maxTokens: 1500,
    timeout: 30000,
  },

  // ============================================================
  // 2. GROQ - BACKUP 1 (Fastest, Free)
  // ============================================================
  groq: {
    name: 'Groq',
    provider: 'groq',
    enabled: true,
    priority: 2,
    models: ['llama3-8b-8192', 'llama3-70b-8192'],
    defaultModel: 'llama3-8b-8192',
    apiEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
    apiKeyEnvVar: 'GROQ_API_KEY',
    maxTokens: 1024,
    timeout: 25000,
  },

  // ============================================================
  // 3. HUGGING FACE - BACKUP 2 (Free)
  // ============================================================
  huggingface: {
    name: 'Hugging Face',
    provider: 'huggingface',
    enabled: true,
    priority: 3,
    models: ['meta-llama/Llama-2-7b-chat-hf'],
    defaultModel: 'meta-llama/Llama-2-7b-chat-hf',
    apiEndpoint: 'https://api-inference.huggingface.co/models',
    apiKeyEnvVar: 'HUGGINGFACE_API_KEY',
    maxTokens: 512,
    timeout: 40000,
  },

  // ============================================================
  // 4. COHERE - BACKUP 3
  // ============================================================
  cohere: {
    name: 'Cohere',
    provider: 'cohere',
    enabled: true,
    priority: 4,
    models: ['command'],
    defaultModel: 'command',
    apiEndpoint: 'https://api.cohere.ai/v1/generate',
    apiKeyEnvVar: 'COHERE_API_KEY',
    maxTokens: 1024,
    timeout: 30000,
  },

  // ============================================================
  // 5. MISTRAL - BACKUP 4 (Fast)
  // ============================================================
  mistral: {
    name: 'Mistral',
    provider: 'mistral',
    enabled: true,
    priority: 5,
    models: ['mistral-small'],
    defaultModel: 'mistral-small',
    apiEndpoint: 'https://api.mistral.ai/v1/chat/completions',
    apiKeyEnvVar: 'MISTRAL_API_KEY',
    maxTokens: 1024,
    timeout: 30000,
  },
};

/**
 * Get all enabled providers sorted by priority
 */
function getEnabledProviders() {
  return Object.entries(multiAiProviders)
    .filter(([_, config]) => config.enabled)
    .sort((a, b) => a[1].priority - b[1].priority)
    .map(([name, config]) => ({ name, ...config }));
}

/**
 * Get provider by name
 */
function getProvider(providerName) {
  return multiAiProviders[providerName?.toLowerCase()];
}

/**
 * Get API key for provider
 */
function getApiKey(providerName, env) {
  const provider = getProvider(providerName);
  if (!provider) return null;
  return env[provider.apiKeyEnvVar];
}

/**
 * Get best available provider (has API key)
 */
function getBestProvider(env) {
  const enabled = getEnabledProviders();
  for (const provider of enabled) {
    const apiKey = env[provider.apiKeyEnvVar];
    if (apiKey && apiKey.length > 10) {
      return { name: provider.name, ...provider, apiKey };
    }
  }
  return null;
}

/**
 * Get next provider (for fallback)
 */
function getNextProvider(currentName, env, tried = []) {
  const enabled = getEnabledProviders();
  const current = getProvider(currentName);
  
  if (!current) return null;

  const remaining = enabled.filter(
    (p) => p.priority > current.priority && !tried.includes(p.name)
  );

  for (const provider of remaining) {
    const apiKey = env[provider.apiKeyEnvVar];
    if (apiKey && apiKey.length > 10) {
      return { name: provider.name, ...provider, apiKey };
    }
  }
  return null;
}

/**
 * Check which providers are configured
 */
function getConfiguredProviders(env) {
  const configured = {};
  const enabled = getEnabledProviders();
  
  enabled.forEach((provider) => {
    const apiKey = env[provider.apiKeyEnvVar];
    configured[provider.name] = !!apiKey && apiKey.length > 10;
  });

  return configured;
}

module.exports = {
  multiAiProviders,
  getEnabledProviders,
  getProvider,
  getApiKey,
  getBestProvider,
  getNextProvider,
  getConfiguredProviders,
};
