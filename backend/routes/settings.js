const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    // Never expose full API keys to frontend — mask them
    const obj = settings.toObject();
    obj.aiProviders = (obj.aiProviders || []).map(p => ({
      ...p,
      apiKey: p.apiKey ? '••••••••' + p.apiKey.slice(-4) : '',
      apiKeySet: !!p.apiKey,
    }));
    res.json({ settings: obj });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/', protect, adminOnly, async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();
    const { aiProviders, ...rest } = req.body;
    Object.assign(settings, rest);
    if (aiProviders) {
      // Merge: keep existing keys if new value is masked
      const existing = settings.aiProviders || [];
      settings.aiProviders = aiProviders.map(p => {
        const existingProvider = existing.find(e => e.id === p.id);
        return {
          ...p,
          apiKey: (p.apiKey && !p.apiKey.startsWith('••••'))
            ? p.apiKey
            : (existingProvider?.apiKey || ''),
        };
      });
    }
    await settings.save();
    res.json({ message: 'Settings saved successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Test a specific provider key
router.post('/test-ai', protect, adminOnly, async (req, res) => {
  const { provider, apiKey, model, baseUrl } = req.body;
  try {
    let ok = false;
    let error = '';

    if (provider === 'groq') {
      const Groq = require('groq-sdk');
      const groq = new Groq({ apiKey });
      const r = await groq.chat.completions.create({
        model: model || 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Reply with just: ok' }],
        max_tokens: 5,
      });
      ok = !!r.choices[0].message.content;
    } else if (provider === 'openai' || provider === 'openai-compatible') {
      const url = baseUrl ? `${baseUrl}/chat/completions` : 'https://api.openai.com/v1/chat/completions';
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: model || 'gpt-4o-mini', messages: [{ role: 'user', content: 'Reply with just: ok' }], max_tokens: 5 }),
      });
      const d = await r.json();
      ok = !!d.choices?.[0]?.message?.content;
      if (!ok) error = d.error?.message || 'No response';
    } else if (provider === 'anthropic') {
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });
      const r = await client.messages.create({ model: model || 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: 'Reply with just: ok' }] });
      ok = !!r.content[0].text;
    } else if (provider === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with just: ok' }] }], generationConfig: { maxOutputTokens: 5 } }),
      });
      const d = await r.json();
      ok = !!d.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!ok) error = d.error?.message || 'No response';
    } else if (provider === 'huggingface') {
      const r = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: 'Reply with just: ok' }),
      });
      ok = r.ok;
      if (!ok) error = `HTTP ${r.status}`;
    } else {
      return res.status(400).json({ success: false, message: 'Unknown provider' });
    }

    res.json({ success: ok, message: ok ? '✅ Connection successful' : `❌ Failed: ${error}` });
  } catch (err) {
    res.json({ success: false, message: `❌ ${err.message}` });
  }
});

module.exports = router;
