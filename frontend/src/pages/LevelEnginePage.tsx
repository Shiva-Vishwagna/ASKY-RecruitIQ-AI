import { useState, useEffect } from "react";

interface Level {
  _id?: string;
  name: string;
  minYears: number;
  maxYears: number;
  minScore: number;
  requiredSkills: string[];
  education: string;
  active: boolean;
}

const defaultLevel: Level = { name: "", minYears: 0, maxYears: 5, minScore: 60, requiredSkills: [], education: "Any", active: true };

export default function LevelEnginePage() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Level | null>(null);
  const [skillInput, setSkillInput] = useState("");
  const [saving, setSaving] = useState(false);

  const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  const token = localStorage.getItem("token");

  useEffect(() => { fetchLevels(); }, []);

  async function fetchLevels() {
    try {
      const res = await fetch(`${API}/levels`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setLevels(data.levels || data || []);
    } catch { setLevels([]); }
    finally { setLoading(false); }
  }

  async function saveLevel() {
    if (!editing?.name) return;
    setSaving(true);
    try {
      const method = editing._id ? "PUT" : "POST";
      const url = editing._id ? `${API}/levels/${editing._id}` : `${API}/levels`;
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(editing),
      });
      setEditing(null); fetchLevels();
    } finally { setSaving(false); }
  }

  async function deleteLevel(id: string) {
    if (!confirm("Delete this level configuration?")) return;
    await fetch(`${API}/levels/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    fetchLevels();
  }

  function addSkill() {
    if (!skillInput.trim() || !editing) return;
    setEditing({ ...editing, requiredSkills: [...editing.requiredSkills, skillInput.trim()] });
    setSkillInput("");
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Level Engine</h1>
          <p className="text-gray-500 mt-1">Define hiring criteria for each experience level</p>
        </div>
        <button onClick={() => setEditing({ ...defaultLevel })}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-sm">
          + Add Level
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : levels.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 border border-gray-100 text-center text-gray-400">
          <div className="text-5xl mb-4">⚙️</div>
          <p className="font-medium text-lg">No levels configured</p>
          <p className="text-sm mt-1">Add your first hiring level to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {levels.map(level => (
            <div key={level._id} className="bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">{level.name}</h3>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full mt-1 inline-block ${level.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {level.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing({ ...level })}
                    className="text-blue-500 hover:bg-blue-50 p-1.5 rounded-lg transition-all text-sm">✏️</button>
                  <button onClick={() => level._id && deleteLevel(level._id)}
                    className="text-red-400 hover:bg-red-50 p-1.5 rounded-lg transition-all text-sm">🗑️</button>
                </div>
              </div>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between"><span className="text-gray-400">Experience</span><span className="font-medium">{level.minYears}–{level.maxYears} years</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Min Score</span><span className="font-medium">{level.minScore}/100</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Education</span><span className="font-medium">{level.education}</span></div>
              </div>
              {level.requiredSkills?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-50">
                  <p className="text-xs text-gray-400 mb-2">Required Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {level.requiredSkills.slice(0, 4).map(s => (
                      <span key={s} className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                    {level.requiredSkills.length > 4 && <span className="text-xs text-gray-400">+{level.requiredSkills.length - 4} more</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">{editing._id ? "Edit Level" : "Create Level"}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Level Name *</label>
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Junior, Mid-Level, Senior"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Min Years Exp</label>
                  <input type="number" min={0} value={editing.minYears} onChange={e => setEditing({ ...editing, minYears: parseInt(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Max Years Exp</label>
                  <input type="number" min={0} value={editing.maxYears} onChange={e => setEditing({ ...editing, maxYears: parseInt(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Minimum AI Score: <span className="text-blue-600">{editing.minScore}</span></label>
                <input type="range" min={0} max={100} value={editing.minScore}
                  onChange={e => setEditing({ ...editing, minScore: parseInt(e.target.value) })}
                  className="w-full accent-blue-600" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Education Requirement</label>
                <select value={editing.education} onChange={e => setEditing({ ...editing, education: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  {["Any", "High School", "Diploma", "Bachelor's", "Master's", "PhD"].map(e => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Required Skills</label>
                <div className="flex gap-2 mb-2">
                  <input value={skillInput} onChange={e => setSkillInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addSkill()}
                    placeholder="Type a skill and press Enter"
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={addSkill} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editing.requiredSkills.map(s => (
                    <span key={s} className="bg-blue-50 text-blue-700 text-sm px-3 py-1 rounded-full flex items-center gap-1">
                      {s}
                      <button onClick={() => setEditing({ ...editing, requiredSkills: editing.requiredSkills.filter(x => x !== s) })}
                        className="text-blue-400 hover:text-red-500 ml-1">×</button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditing(null)}
                className="flex-1 border border-gray-200 py-2.5 rounded-xl font-semibold text-gray-600 hover:bg-gray-50 text-sm">Cancel</button>
              <button onClick={saveLevel} disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60 text-sm">
                {saving ? "Saving..." : "Save Level"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
