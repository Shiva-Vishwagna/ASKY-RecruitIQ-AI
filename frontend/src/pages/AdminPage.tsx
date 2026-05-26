import { useState, useEffect } from "react";

interface User { _id: string; name: string; email: string; role: string; isActive: boolean; createdAt: string; lastLogin?: string; }

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "recruiter" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const API = "https://asky-recruitiq-ai.onrender.com/api";
  const token = localStorage.getItem("token");

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    try {
      const res = await fetch(`${API}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setUsers(data.users || data || []);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  }

  async function addUser() {
    if (!form.name || !form.email || !form.password) return setMsg("All fields required.");
    setSaving(true); setMsg("");
    try {
      const res = await fetch(`${API}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) return setMsg(data.message || "Failed to create user.");
      setMsg("✅ User created successfully!");
      setForm({ name: "", email: "", password: "", role: "recruiter" });
      setShowAdd(false);
      fetchUsers();
    } catch { setMsg("Error creating user."); }
    finally { setSaving(false); }
  }

  async function toggleUser(userId: string, active: boolean) {
    await fetch(`${API}/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isActive: !active }),
    });
    fetchUsers();
  }

  async function deleteUser(userId: string, name: string) {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    await fetch(`${API}/admin/users/${userId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    fetchUsers();
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500 mt-1">{users.length} total users</p>
        </div>
        <button onClick={() => { setShowAdd(!showAdd); setMsg(""); }}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-all text-sm">
          + Add User
        </button>
      </div>

      {/* Add User Form */}
      {showAdd && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-6">
          <h2 className="font-bold text-gray-900 mb-4">New User</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input placeholder="Full Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input placeholder="Password" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="recruiter">Recruiter</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {msg && <p className={`text-sm mb-3 ${msg.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>{msg}</p>}
          <div className="flex gap-3">
            <button onClick={addUser} disabled={saving}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-all disabled:opacity-60 text-sm">
              {saving ? "Creating..." : "Create User"}
            </button>
            <button onClick={() => setShowAdd(false)} className="border border-gray-200 px-6 py-2.5 rounded-xl font-semibold text-gray-600 hover:bg-gray-50 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Users Table */}
      {loading ? (
        <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["User", "Role", "Status", "Last Login", "Actions"].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                        {u.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 text-sm">{u.name}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${u.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${u.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-500">
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-2">
                      <button onClick={() => toggleUser(u._id, u.isActive)}
                        className={`text-xs px-3 py-1 rounded-lg font-medium border transition-colors ${u.isActive ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}>
                        {u.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => deleteUser(u._id, u.name)}
                        className="text-xs px-3 py-1 rounded-lg font-medium border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
