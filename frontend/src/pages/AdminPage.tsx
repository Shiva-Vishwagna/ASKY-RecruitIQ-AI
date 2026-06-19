import React, { useState, useEffect } from "react";

interface User {
  _id: string;
  name: string;
  email: string;
  role: "admin" | "recruiter";
  isActive: boolean;
  createdAt?: string;
}

const API   = "https://asky-recruitiq-ai.onrender.com/api";
const token = () => localStorage.getItem("token") || "";

export default function AdminPage() {
  const [users, setUsers]         = useState<User[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [clearing, setClearing]   = useState(false);
  const [clearResult, setClearResult] = useState<string>("");
  const [showAdd, setShowAdd]     = useState(false);
  const [editUser, setEditUser]   = useState<User | null>(null);
  const [msg, setMsg]             = useState<{text:string; type:"success"|"error"} | null>(null);

  const [form, setForm] = useState({
    name: "", email: "", password: "", role: "recruiter" as "admin"|"recruiter", isActive: true
  });

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
  })();

  useEffect(() => { fetchUsers(); }, []);

  function flash(text: string, type: "success"|"error" = "success") {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  }

  async function fetchUsers() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/admin/users`, { headers: { Authorization: `Bearer ${token()}` } });
      const d = await r.json();
      setUsers(d.users || d || []);
    } catch { flash("Failed to load users", "error"); }
    finally { setLoading(false); }
  }

  async function createUser() {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      flash("Name, email and password are required", "error"); return;
    }
    if (form.password.length < 6) {
      flash("Password must be at least 6 characters", "error"); return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${API}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.message || "Failed to create user", "error"); return; }
      flash(`✅ ${form.name} added successfully as ${form.role}`);
      setForm({ name:"", email:"", password:"", role:"recruiter", isActive:true });
      setShowAdd(false);
      fetchUsers();
    } catch { flash("Error creating user", "error"); }
    finally { setSaving(false); }
  }

  async function updateUser() {
    if (!editUser) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/admin/users/${editUser._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          name:     editUser.name,
          email:    editUser.email,
          role:     editUser.role,
          isActive: editUser.isActive,
        }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.message || "Failed to update user", "error"); return; }
      flash(`✅ ${editUser.name} updated`);
      setEditUser(null);
      fetchUsers();
    } catch { flash("Error updating user", "error"); }
    finally { setSaving(false); }
  }

  async function toggleActive(user: User) {
    if (user._id === currentUser._id) { flash("You cannot deactivate yourself", "error"); return; }
    try {
      const r = await fetch(`${API}/admin/users/${user._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.message || "Failed to update", "error"); return; }
      flash(`${user.name} ${!user.isActive ? "activated" : "deactivated"}`);
      fetchUsers();
    } catch { flash("Error updating user", "error"); }
  }

  async function deleteUser(user: User) {
    if (user._id === currentUser._id) { flash("You cannot delete yourself", "error"); return; }
    if (!window.confirm(`Permanently delete ${user.name}? This cannot be undone.`)) return;
    try {
      const r = await fetch(`${API}/admin/users/${user._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await r.json();
      if (!r.ok) { flash(d.message || "Failed to delete", "error"); return; }
      flash(`${user.name} deleted`);
      fetchUsers();
    } catch { flash("Error deleting user", "error"); }
  }

  async function resetPassword(user: User) {
    const newPass = prompt(`Set new password for ${user.name} (min 6 chars):`);
    if (!newPass) return;
    if (newPass.length < 6) { flash("Password must be at least 6 characters", "error"); return; }
    try {
      const r = await fetch(`${API}/admin/users/${user._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ password: newPass }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.message || "Failed to reset password", "error"); return; }
      flash(`✅ Password reset for ${user.name}`);
    } catch { flash("Error resetting password", "error"); }
  }

  async function clearAllData() {
    const confirm1 = window.confirm("⚠️ This will permanently delete ALL candidates and audit logs.\n\nJobs, users, and settings will be kept.\n\nAre you sure?");
    if (!confirm1) return;
    const confirm2 = window.confirm("🔴 FINAL WARNING: This action CANNOT be undone.\n\nClick OK to proceed with clearing all candidate data.");
    if (!confirm2) return;

    setClearing(true);
    setClearResult("");
    try {
      const r = await fetch(`${API}/clear-all`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await r.json();
      if (r.ok) {
        setClearResult(`✅ ${d.message} — ${d.candidates} candidates and ${d.auditLogs} audit logs removed.`);
        flash("All candidate data cleared successfully");
      } else {
        setClearResult("❌ " + (d.message || "Failed to clear data"));
        flash(d.message || "Failed to clear data", "error");
      }
    } catch (e: any) {
      setClearResult("❌ Error: " + e.message);
      flash("Error: " + e.message, "error");
    } finally {
      setClearing(false);
    }
  }

  const admins    = users.filter(u => u.role === "admin");
  const recruiters = users.filter(u => u.role === "recruiter");

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage users, access, and data</p>
        </div>
        <button onClick={() => { setShowAdd(true); setEditUser(null); }}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-all text-sm">
          + Add User
        </button>
      </div>

      {/* Flash message */}
      {msg && (
        <div className={`mb-5 rounded-xl px-5 py-3 text-sm font-semibold ${msg.type==="success"?"bg-emerald-50 text-emerald-700 border border-emerald-200":"bg-red-50 text-red-700 border border-red-200"}`}>
          {msg.text}
        </div>
      )}

      {/* ── Add User Form ── */}
      {showAdd && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span>➕ Add New User</span>
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name *</label>
              <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}
                placeholder="e.g. Sushmita Sharma"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email *</label>
              <input value={form.email} onChange={e=>setForm({...form,email:e.target.value})}
                placeholder="sushmita@company.com" type="email"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password *</label>
              <input value={form.password} onChange={e=>setForm({...form,password:e.target.value})}
                placeholder="Min 6 characters" type="password"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Role *</label>
              <select value={form.role} onChange={e=>setForm({...form,role:e.target.value as any})}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="recruiter">Recruiter</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={createUser} disabled={saving}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60 text-sm">
              {saving ? "Creating..." : "✅ Create User"}
            </button>
            <button onClick={()=>setShowAdd(false)} className="border border-gray-200 text-gray-600 px-6 py-2.5 rounded-xl font-semibold hover:bg-gray-50 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Edit User Form ── */}
      {editUser && (
        <div className="bg-white rounded-2xl border border-blue-200 p-6 mb-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-4">✏️ Edit User — {editUser.name}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label>
              <input value={editUser.name} onChange={e=>setEditUser({...editUser,name:e.target.value})}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
              <input value={editUser.email} onChange={e=>setEditUser({...editUser,email:e.target.value})}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Role</label>
              <select value={editUser.role} onChange={e=>setEditUser({...editUser,role:e.target.value as any})}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="recruiter">Recruiter</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={editUser.isActive} onChange={e=>setEditUser({...editUser,isActive:e.target.checked})}
                  className="w-4 h-4 text-blue-600 rounded"/>
                <span className="text-sm font-semibold text-gray-700">Active Account</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={updateUser} disabled={saving}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60 text-sm">
              {saving ? "Saving..." : "💾 Save Changes"}
            </button>
            <button onClick={()=>setEditUser(null)} className="border border-gray-200 text-gray-600 px-6 py-2.5 rounded-xl font-semibold hover:bg-gray-50 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>
      ) : (
        <div className="space-y-6">

          {/* Admins */}
          <div className="bg-white rounded-2xl border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">👑 Admins ({admins.length})</h2>
              <span className="text-xs text-gray-400">Full access to all features</span>
            </div>
            <UserTable users={admins} currentUserId={currentUser._id}
              onEdit={setEditUser} onToggle={toggleActive} onDelete={deleteUser} onReset={resetPassword}/>
          </div>

          {/* Recruiters */}
          <div className="bg-white rounded-2xl border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">🧑‍💼 Recruiters ({recruiters.length})</h2>
              <span className="text-xs text-gray-400">Can upload CVs, screen candidates, generate reports</span>
            </div>
            {recruiters.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                No recruiters yet.
                <button onClick={()=>setShowAdd(true)} className="ml-2 text-blue-600 underline font-medium">Add one</button>
              </div>
            ) : (
              <UserTable users={recruiters} currentUserId={currentUser._id}
                onEdit={setEditUser} onToggle={toggleActive} onDelete={deleteUser} onReset={resetPassword}/>
            )}
          </div>

          {/* ── Danger Zone ── */}
          <div className="bg-white rounded-2xl border border-red-200">
            <div className="px-5 py-4 border-b border-red-100 bg-red-50 rounded-t-2xl">
              <h2 className="font-bold text-red-700">🔴 Danger Zone</h2>
              <p className="text-xs text-red-500 mt-0.5">Irreversible actions — proceed with caution</p>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between p-4 border border-red-100 rounded-xl bg-red-50">
                <div>
                  <p className="font-bold text-red-800 text-sm">Clear All Candidate Data</p>
                  <p className="text-xs text-red-600 mt-0.5">Deletes all candidates and audit logs. Jobs, users and settings are kept.</p>
                  {clearResult && (
                    <p className={`text-xs mt-2 font-semibold ${clearResult.startsWith("✅") ? "text-emerald-700" : "text-red-700"}`}>
                      {clearResult}
                    </p>
                  )}
                </div>
                <button onClick={clearAllData} disabled={clearing}
                  className="bg-red-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-red-700 disabled:opacity-60 text-sm shrink-0 ml-4">
                  {clearing ? "Clearing..." : "🗑 Clear All Data"}
                </button>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ── User Table Component ──────────────────────────────────────
function UserTable({ users, currentUserId, onEdit, onToggle, onDelete, onReset }: {
  users: User[];
  currentUserId: string;
  onEdit: (u:User) => void;
  onToggle: (u:User) => void;
  onDelete: (u:User) => void;
  onReset: (u:User) => void;
}) {
  return (
    <div className="divide-y divide-gray-50">
      {users.map(u => (
        <div key={u._id} className="px-5 py-4 flex items-center gap-4">
          {/* Avatar */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base shrink-0 ${u.role==="admin"?"bg-purple-500":"bg-blue-500"}`}>
            {u.name?.charAt(0)?.toUpperCase()}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 text-sm">{u.name}</span>
              {u._id === currentUserId && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">You</span>}
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${u.role==="admin"?"bg-purple-100 text-purple-700":"bg-blue-100 text-blue-700"}`}>
                {u.role}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${u.isActive?"bg-emerald-100 text-emerald-700":"bg-gray-100 text-gray-500"}`}>
                {u.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{u.email}</p>
            {u.createdAt && <p className="text-xs text-gray-300">Added {new Date(u.createdAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</p>}
          </div>

          {/* Actions */}
          <div className="flex gap-2 shrink-0">
            <button onClick={()=>onEdit(u)}
              className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 font-medium">
              ✏️ Edit
            </button>
            <button onClick={()=>onReset(u)}
              className="text-xs border border-amber-200 text-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-50 font-medium">
              🔑 Reset PW
            </button>
            <button onClick={()=>onToggle(u)} disabled={u._id === currentUserId}
              className={`text-xs border px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 ${u.isActive?"border-red-200 text-red-500 hover:bg-red-50":"border-emerald-200 text-emerald-600 hover:bg-emerald-50"}`}>
              {u.isActive ? "Deactivate" : "Activate"}
            </button>
            <button onClick={()=>onDelete(u)} disabled={u._id === currentUserId}
              className="text-xs border border-red-200 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 font-medium disabled:opacity-40">
              🗑
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
