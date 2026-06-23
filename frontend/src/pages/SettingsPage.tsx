import { useState, useEffect } from "react";

interface AIProvider {
  id: string; name: string; provider: string; model: string;
  apiKey: string; baseUrl?: string; enabled: boolean;
  priority: number; freetier: boolean; notes: string;
  apiKeySet?: boolean;
}

const PROVIDER_PRESETS = [
  { label: "Groq (Free — Llama 3.3 70B)", provider: "groq", model: "llama-3.3-70b-versatile", baseUrl: "", freetier: true, notes: "Free tier: 14,400 req/day. Get key at console.groq.com" },
  { label: "Groq (Free — Mixtral 8x7B)", provider: "groq", model: "mixtral-8x7b-32768", baseUrl: "", freetier: true, notes: "Free tier available. Fast and capable." },
  { label: "Groq (Free — Gemma2 9B)", provider: "groq", model: "gemma2-9b-it", baseUrl: "", freetier: true, notes: "Free tier available at console.groq.com" },
  { label: "OpenAI — GPT-4o Mini", provider: "openai", model: "gpt-4o-mini", baseUrl: "", freetier: false, notes: "Cheapest OpenAI model. ~$0.15/1M tokens." },
  { label: "OpenAI — GPT-4o", provider: "openai", model: "gpt-4o", baseUrl: "", freetier: false, notes: "Best quality. $5/1M tokens." },
  { label: "Anthropic — Claude Haiku", provider: "anthropic", model: "claude-haiku-4-5-20251001", baseUrl: "", freetier: false, notes: "Fast and cheap Anthropic model." },
  { label: "Anthropic — Claude Sonnet", provider: "anthropic", model: "claude-sonnet-4-20250514", baseUrl: "", freetier: false, notes: "Best Anthropic balance of speed and quality." },
  { label: "Google Gemini 1.5 Flash (Free)", provider: "gemini", model: "gemini-1.5-flash", baseUrl: "", freetier: true, notes: "Free tier: 15 req/min. Get key at aistudio.google.com" },
  { label: "Google Gemini 1.5 Pro", provider: "gemini", model: "gemini-1.5-pro", baseUrl: "", freetier: false, notes: "Free tier: 2 req/min. Best Gemini model." },
  { label: "Google Gemini 2.0 Flash (Free)", provider: "gemini", model: "gemini-2.0-flash", baseUrl: "", freetier: true, notes: "Newest Gemini — fast and free tier available." },
  { label: "Together AI — Llama 3.3 70B (Free)", provider: "openai-compatible", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", baseUrl: "https://api.together.xyz/v1", freetier: true, notes: "Free model on Together AI. Get key at api.together.ai" },
  { label: "Together AI — Mixtral 8x7B (Free)", provider: "openai-compatible", model: "mistralai/Mixtral-8x7B-Instruct-v0.1", baseUrl: "https://api.together.xyz/v1", freetier: true, notes: "Free model on Together AI." },
  { label: "OpenRouter — Free Models", provider: "openai-compatible", model: "meta-llama/llama-3.3-70b-instruct:free", baseUrl: "https://openrouter.ai/api/v1", freetier: true, notes: "Free models via OpenRouter. Get key at openrouter.ai" },
  { label: "Cerebras — Llama 3.3 70B (Free)", provider: "openai-compatible", model: "llama-3.3-70b", baseUrl: "https://api.cerebras.ai/v1", freetier: true, notes: "Very fast inference. Free tier at cloud.cerebras.ai" },
  { label: "SambaNova — Llama 3.3 70B (Free)", provider: "openai-compatible", model: "Meta-Llama-3.3-70B-Instruct", baseUrl: "https://api.sambanova.ai/v1", freetier: true, notes: "Free at cloud.sambanova.ai" },
  { label: "HuggingFace Inference — Zephyr 7B", provider: "huggingface", model: "HuggingFaceH4/zephyr-7b-beta", baseUrl: "", freetier: true, notes: "Free via HuggingFace Inference API. Get key at huggingface.co/settings/tokens" },
  { label: "Ollama (Local)", provider: "ollama", model: "llama3.2", baseUrl: "http://localhost:11434", freetier: true, notes: "Run AI locally. Install Ollama at ollama.ai — no API key needed." },
  { label: "Custom OpenAI-Compatible", provider: "openai-compatible", model: "", baseUrl: "", freetier: false, notes: "Any API with OpenAI-compatible /v1/chat/completions endpoint." },
];

const PROVIDER_COLORS: Record<string, string> = {
  groq: "bg-orange-50 border-orange-200 text-orange-700",
  openai: "bg-emerald-50 border-emerald-200 text-emerald-700",
  anthropic: "bg-violet-50 border-violet-200 text-violet-700",
  gemini: "bg-blue-50 border-blue-200 text-blue-700",
  "openai-compatible": "bg-gray-50 border-gray-200 text-gray-700",
  huggingface: "bg-yellow-50 border-yellow-200 text-yellow-700",
  ollama: "bg-teal-50 border-teal-200 text-teal-700",
};

const PROVIDER_ICONS: Record<string, string> = {
  groq: "⚡", openai: "🤖", anthropic: "🧠", gemini: "✨",
  "openai-compatible": "🔌", huggingface: "🤗", ollama: "🦙",
};

export default function SettingsPage() {
  const [companyName, setCompanyName] = useState("ASKY RecruitIQ");
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [newKey, setNewKey] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState("");
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("ai-models");

  const API = "https://asky-recruitiq-ai.onrender.com/api";
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = user.role === "admin";

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    try {
      const res = await fetch(`${API}/settings`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.settings) {
        setCompanyName(data.settings.companyName || "ASKY RecruitIQ");
        setProviders(data.settings.aiProviders || []);
      }
    } finally { setLoading(false); }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await fetch(`${API}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyName, aiProviders: providers }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally { setSaving(false); }
  }

  function addProvider() {
    const preset = PROVIDER_PRESETS[selectedPreset];
    const provider: AIProvider = {
      id: Date.now().toString(),
      name: preset.label,
      provider: preset.provider,
      model: preset.model,
      apiKey: newKey,
      baseUrl: preset.baseUrl,
      enabled: true,
      priority: providers.length,
      freetier: preset.freetier,
      notes: preset.notes,
    };
    setProviders(prev => [...prev, provider]);
    setNewKey(""); setShowAddModal(false);
  }

  function removeProvider(id: string) {
    setProviders(prev => prev.filter(p => p.id !== id));
  }

  function toggleProvider(id: string) {
    setProviders(prev => prev.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p));
  }

  function movePriority(id: string, dir: -1 | 1) {
    setProviders(prev => {
      const idx = prev.findIndex(p => p.id === id);
      const newArr = [...prev];
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= newArr.length) return prev;
      [newArr[idx], newArr[swapIdx]] = [newArr[swapIdx], newArr[idx]];
      return newArr.map((p, i) => ({ ...p, priority: i }));
    });
  }

  function saveEditKey(id: string) {
    if (editKey) setProviders(prev => prev.map(p => p.id === id ? { ...p, apiKey: editKey } : p));
    setEditingId(null); setEditKey("");
  }

  async function testProvider(p: AIProvider) {
    setTesting(p.id);
    try {
      const res = await fetch(`${API}/settings/test-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider: p.provider, apiKey: p.apiKey, model: p.model, baseUrl: p.baseUrl }),
      });
      const data = await res.json();
      setTestResults(prev => ({ ...prev, [p.id]: { ok: data.success, msg: data.message } }));
    } catch {
      setTestResults(prev => ({ ...prev, [p.id]: { ok: false, msg: "❌ Network error" } }));
    } finally { setTesting(null); }
  }

  const freePresets = PROVIDER_PRESETS.filter(p => p.freetier);
  const paidPresets = PROVIDER_PRESETS.filter(p => !p.freetier);

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-500 mt-1">Manage AI providers and app configuration</p>
          </div>
          {isAdmin && (
            <button onClick={saveSettings} disabled={saving}
              className={`px-6 py-2.5 rounded-xl font-semibold transition-all text-sm ${saved ? "bg-emerald-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700"} disabled:opacity-60`}>
              {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Settings"}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-gray-100 mb-4 flex">
          {["ai-models", "general"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-semibold capitalize rounded-2xl transition-all ${activeTab === tab ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
              {tab === "ai-models" ? "🤖 AI Models" : "⚙️ General"}
            </button>
          ))}
        </div>

        {/* AI MODELS TAB */}
        {activeTab === "ai-models" && (
          <div className="space-y-4">
            {/* Info banner */}
            <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
              <p className="text-sm text-blue-800 font-medium mb-1">🔄 How AI Fallback Works</p>
              <p className="text-sm text-blue-700">Providers are tried in order (top to bottom). If the first one fails or has no key, it automatically moves to the next. Drag to reorder priority.</p>
            </div>

            {/* Configured providers */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Configured AI Providers ({providers.length})</h2>
                {isAdmin && (
                  <button onClick={() => setShowAddModal(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all">
                    + Add Provider
                  </button>
                )}
              </div>

              {providers.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <div className="text-5xl mb-3">🤖</div>
                  <p className="font-medium">No AI providers configured</p>
                  <p className="text-sm mt-1">Add a free provider to get started</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {providers.map((p, idx) => {
                    const testResult = testResults[p.id];
                    const colorClass = PROVIDER_COLORS[p.provider] || PROVIDER_COLORS["openai-compatible"];
                    return (
                      <div key={p.id} className={`p-4 ${!p.enabled ? "opacity-50" : ""}`}>
                        <div className="flex items-start gap-3">
                          {/* Priority arrows */}
                          {isAdmin && (
                            <div className="flex flex-col gap-0.5 mt-1 shrink-0">
                              <button onClick={() => movePriority(p.id, -1)} disabled={idx === 0} className="text-gray-300 hover:text-gray-600 disabled:invisible text-xs">▲</button>
                              <span className="text-xs text-gray-400 text-center">{idx + 1}</span>
                              <button onClick={() => movePriority(p.id, 1)} disabled={idx === providers.length - 1} className="text-gray-300 hover:text-gray-600 disabled:invisible text-xs">▼</button>
                            </div>
                          )}

                          {/* Provider info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-lg">{PROVIDER_ICONS[p.provider] || "🔌"}</span>
                              <span className="font-semibold text-gray-900 text-sm">{p.name}</span>
                              {p.freetier && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">FREE</span>}
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colorClass}`}>{p.provider}</span>
                              {!p.enabled && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Disabled</span>}
                            </div>
                            <div className="text-xs text-gray-500 mb-1">Model: <span className="font-mono">{p.model}</span>{p.baseUrl && ` · ${p.baseUrl}`}</div>
                            {p.notes && <div className="text-xs text-gray-400 italic mb-2">{p.notes}</div>}

                            {/* API Key row */}
                            <div className="flex items-center gap-2">
                              {editingId === p.id ? (
                                <>
                                  <input value={editKey} onChange={e => setEditKey(e.target.value)} type="password"
                                    placeholder="Paste new API key..."
                                    className="flex-1 border border-blue-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                  <button onClick={() => saveEditKey(p.id)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">Save</button>
                                  <button onClick={() => { setEditingId(null); setEditKey(""); }} className="text-gray-500 px-2 py-1.5 rounded-lg text-xs">Cancel</button>
                                </>
                              ) : (
                                <div className="flex items-center gap-2">
                                  {p.provider === 'ollama' ? (
                                    <span className="text-xs text-teal-600 bg-teal-50 px-2 py-1 rounded-lg">No key needed (local)</span>
                                  ) : (
                                    <span className={`text-xs px-2 py-1 rounded-lg font-mono ${p.apiKeySet || p.apiKey ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-500"}`}>
                                      {p.apiKeySet || p.apiKey ? (p.apiKey.startsWith('••••') ? p.apiKey : '••••' + p.apiKey.slice(-4)) : "No key set"}
                                    </span>
                                  )}
                                  {isAdmin && p.provider !== 'ollama' && (
                                    <button onClick={() => { setEditingId(p.id); setEditKey(""); }}
                                      className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                                      {p.apiKeySet || p.apiKey ? "Update" : "Add Key"}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Test result */}
                            {testResult && (
                              <div className={`mt-2 text-xs px-2 py-1 rounded-lg ${testResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                                {testResult.msg}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex flex-col gap-1.5 shrink-0">
                            {isAdmin && (p.apiKeySet || p.apiKey || p.provider === 'ollama') && (
                              <button onClick={() => testProvider(p)} disabled={testing === p.id}
                                className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-all disabled:opacity-60">
                                {testing === p.id ? "Testing..." : "Test"}
                              </button>
                            )}
                            {isAdmin && (
                              <button onClick={() => toggleProvider(p.id)}
                                className={`text-xs px-3 py-1.5 rounded-lg transition-all ${p.enabled ? "border border-amber-200 text-amber-600 hover:bg-amber-50" : "border border-emerald-200 text-emerald-600 hover:bg-emerald-50"}`}>
                                {p.enabled ? "Disable" : "Enable"}
                              </button>
                            )}
                            {isAdmin && (
                              <button onClick={() => removeProvider(p.id)}
                                className="text-xs border border-red-200 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-all">
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Free providers quick reference */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-3">🆓 Free AI Providers — Quick Reference</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {freePresets.map(p => (
                  <div key={p.label} className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl">
                    <span>{PROVIDER_ICONS[p.provider] || "🔌"}</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{p.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{p.notes}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* GENERAL TAB */}
        {activeTab === "general" && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <h2 className="font-bold text-gray-900 mb-4">General Settings</h2>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Company Name</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} disabled={!isAdmin}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 text-sm" />
            </div>
            {!isAdmin && <p className="text-xs text-gray-400">Only admins can change settings.</p>}
          </div>
        )}
      </div>

      {/* Add Provider Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Add AI Provider</h2>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Choose Provider</label>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                <p className="text-xs text-emerald-700 font-bold uppercase tracking-wide px-1">Free Providers</p>
                {freePresets.map((p, i) => (
                  <button key={i} onClick={() => setSelectedPreset(PROVIDER_PRESETS.indexOf(p))}
                    className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${selectedPreset === PROVIDER_PRESETS.indexOf(p) ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <div className="flex items-center gap-2">
                      <span>{PROVIDER_ICONS[p.provider]}</span>
                      <span className="font-semibold">{p.label}</span>
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full ml-auto">FREE</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 pl-6">{p.notes}</p>
                  </button>
                ))}
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wide px-1 mt-3">Paid Providers</p>
                {paidPresets.map((p, i) => (
                  <button key={i} onClick={() => setSelectedPreset(PROVIDER_PRESETS.indexOf(p))}
                    className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${selectedPreset === PROVIDER_PRESETS.indexOf(p) ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <div className="flex items-center gap-2">
                      <span>{PROVIDER_ICONS[p.provider]}</span>
                      <span className="font-semibold">{p.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 pl-6">{p.notes}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom model name if needed */}
            {PROVIDER_PRESETS[selectedPreset].model === "" && (
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Model Name</label>
                <input placeholder="e.g. gpt-4o-mini or llama3.2"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            {/* API Key */}
            {PROVIDER_PRESETS[selectedPreset].provider !== "ollama" && (
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">API Key</label>
                <input value={newKey} onChange={e => setNewKey(e.target.value)} type="password"
                  placeholder="Paste your API key here..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-xs text-gray-400 mt-1">{PROVIDER_PRESETS[selectedPreset].notes}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setShowAddModal(false); setNewKey(""); }}
                className="flex-1 border border-gray-200 py-2.5 rounded-xl font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={addProvider}
                disabled={PROVIDER_PRESETS[selectedPreset].provider !== "ollama" && !newKey}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60">
                Add Provider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
