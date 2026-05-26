import { useState, useEffect } from "react";

interface Profile {
  name: string;
  email: string;
  phone: string;
  role: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({ name: "", email: "", phone: "", role: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", newPw: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  const API = "https://asky-recruitiq-ai.onrender.com/api";
  const token = localStorage.getItem("token");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setProfile(data.user || data);
      } finally { setLoading(false); }
    }
    load();
  }, []);

  async function saveProfile() {
    setSaving(true);
    try {
      await fetch(`${API}/auth/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: profile.name, phone: profile.phone }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  }

  async function changePassword() {
    if (pwForm.newPw !== pwForm.confirm) { setPwMsg("Passwords do not match"); return; }
    if (pwForm.newPw.length < 8) { setPwMsg("Password must be at least 8 characters"); return; }
    setPwSaving(true);
    try {
      const res = await fetch(`${API}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.newPw }),
      });
      setPwMsg(res.ok ? "✅ Password changed successfully!" : "❌ Current password is incorrect");
      if (res.ok) setPwForm({ current: "", newPw: "", confirm: "" });
    } finally { setPwSaving(false); setTimeout(() => setPwMsg(""), 3000); }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-500 mt-1">Manage your personal information</p>
        </div>

        {/* Avatar */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-5 flex items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
            {profile.name?.charAt(0)?.toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{profile.name}</h2>
            <p className="text-gray-500 text-sm">{profile.email}</p>
            <span className="mt-2 inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full capitalize">
              {profile.role?.replace("_", " ")}
            </span>
          </div>
        </div>

        {/* Edit Profile */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-5">
          <h2 className="font-bold text-gray-900 mb-5">Edit Profile</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
              <input value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
              <input value={profile.email} disabled
                className="w-full border border-gray-100 rounded-xl px-4 py-2.5 bg-gray-50 text-gray-400 text-sm cursor-not-allowed" />
              <p className="text-xs text-gray-400 mt-1">Email cannot be changed. Contact admin if needed.</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
              <input value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })}
                placeholder="+91 98765 43210"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
            </div>
          </div>
          <button onClick={saveProfile} disabled={saving}
            className={`mt-5 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${saved ? "bg-emerald-500 text-white" : "bg-blue-600 text-white hover:bg-blue-700"} disabled:opacity-60`}>
            {saved ? "✓ Saved!" : saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-5">Change Password</h2>
          <div className="space-y-4">
            {[{ k: "current", l: "Current Password" }, { k: "newPw", l: "New Password" }, { k: "confirm", l: "Confirm New Password" }].map(({ k, l }) => (
              <div key={k}>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{l}</label>
                <input type="password" value={pwForm[k as keyof typeof pwForm]}
                  onChange={e => setPwForm({ ...pwForm, [k]: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
            ))}
          </div>
          {pwMsg && <p className={`mt-3 text-sm font-medium ${pwMsg.startsWith("✅") ? "text-emerald-600" : "text-red-500"}`}>{pwMsg}</p>}
          <button onClick={changePassword} disabled={pwSaving}
            className="mt-5 bg-gray-900 text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-all disabled:opacity-60">
            {pwSaving ? "Changing..." : "Change Password"}
          </button>
        </div>
      </div>
    </div>
  );
}
