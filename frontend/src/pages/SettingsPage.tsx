import { useState, useEffect } from "react";

interface Settings {
  companyName: string;
  aiModel: string;
  skillWeight: number;
  experienceWeight: number;
  educationWeight: number;
  emailNotifications: boolean;
  newCandidateAlert: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    companyName: "",
    aiModel: "gpt-4o",
    skillWeight: 40,
    experienceWeight: 40,
    educationWeight: 20,
    emailNotifications: true,
    newCandidateAlert: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  const token = localStorage.getItem("token");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/settings`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.settings) setSettings({ ...settings, ...data.settings });
      } finally { setLoading(false); }
    }
    load();
  }, []);

  const totalWeight = settings.skillWeight + settings.experienceWeight + settings.educationWeight;

  async function save() {
    if (totalWeight !== 100) { alert("Scoring weights must add up to 100%"); return; }
    setSaving(true);
    try {
      await fetch(`${API}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Platform Settings</h1>
          <p className="text-gray-500 mt-1">Configure AI, scoring, and notifications</p>
        </div>

        {/* Company Settings */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-5">
          <h2 className="font-bold text-gray-900 mb-4">Company Branding</h2>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Company Name</label>
            <input value={settings.companyName} onChange={e => setSettings({ ...settings, companyName: e.target.value })}
              placeholder="Your Company Name"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          </div>
        </div>

        {/* AI Settings */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-5">
          <h2 className="font-bold text-gray-900 mb-4">AI Configuration</h2>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">OpenAI Model</label>
            <select value={settings.aiModel} onChange={e => setSettings({ ...settings, aiModel: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
              <option value="gpt-4o">GPT-4o (Recommended — Most Accurate)</option>
              <option value="gpt-4o-mini">GPT-4o Mini (Faster — Lower Cost)</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
            </select>
          </div>
        </div>

        {/* Scoring Weights */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Scoring Weights</h2>
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${totalWeight === 100 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
              {totalWeight}/100
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-5">Define how much each factor contributes to the AI score. Must total 100%.</p>
          <div className="space-y-5">
            {[
              { k: "skillWeight", l: "Skills Match", d: "How well candidate skills match job requirements" },
              { k: "experienceWeight", l: "Work Experience", d: "Years and relevance of work experience" },
              { k: "educationWeight", l: "Education", d: "Degree and educational qualifications" },
            ].map(({ k, l, d }) => (
              <div key={k}>
                <div className="flex justify-between mb-1">
                  <div>
                    <span className="text-sm font-semibold text-gray-700">{l}</span>
                    <p className="text-xs text-gray-400">{d}</p>
                  </div>
                  <span className="font-bold text-blue-600 text-sm">{settings[k as keyof Settings]}%</span>
                </div>
                <input type="range" min={0} max={100}
                  value={settings[k as keyof Settings] as number}
                  onChange={e => setSettings({ ...settings, [k]: parseInt(e.target.value) })}
                  className="w-full accent-blue-600" />
              </div>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-6">
          <h2 className="font-bold text-gray-900 mb-4">Notifications</h2>
          <div className="space-y-4">
            {[
              { k: "emailNotifications", l: "Email Notifications", d: "Receive email updates for hiring activities" },
              { k: "newCandidateAlert", l: "New Candidate Alert", d: "Get notified when a new candidate is screened" },
            ].map(({ k, l, d }) => (
              <div key={k} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{l}</p>
                  <p className="text-xs text-gray-500">{d}</p>
                </div>
                <button onClick={() => setSettings({ ...settings, [k]: !settings[k as keyof Settings] })}
                  className={`w-12 h-6 rounded-full transition-all relative ${settings[k as keyof Settings] ? "bg-blue-600" : "bg-gray-300"}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${settings[k as keyof Settings] ? "left-6" : "left-0.5"}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <button onClick={save} disabled={saving || totalWeight !== 100}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${saved ? "bg-emerald-500 text-white" : "bg-blue-600 text-white hover:bg-blue-700"} disabled:opacity-60`}>
          {saved ? "✓ Settings Saved!" : saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
