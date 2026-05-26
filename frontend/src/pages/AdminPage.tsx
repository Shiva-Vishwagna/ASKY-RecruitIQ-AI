import { useState, useEffect } from "react";

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  lastLogin?: string;
}

const roles = ["admin", "recruiter", "hiring_manager", "interviewer"];
const roleColors: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  recruiter: "bg-blue-100 text-blue-700",
  hiring_manager: "bg-purple-100 text-purple-700",
  interviewer: "bg-green-100 text-green-700",
};

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "recruiter" });
  const [creating, setCreating] = useState(false);
  const [systemStatus, setSystemStatus] = useState({ db: true, ai: true, storage: true });

  const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  const token = localStorage.getItem("token");

  useEffect(() => { fetchUsers(); checkSystem(); }, []);

  async function fetchUsers() {
    try {
      const res = await fetch(`${API}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setUsers(data.users || data || []);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  }

  async function checkSystem() {
    try {
      const res = await fetch(`${API}/health`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setSystemStatus({ db: data.db !== false, ai: data.ai !== false, storage: data.storage !== false });
    } catch { setSystemStatus({ db: false, ai: false, storage: false }); }
  }

  async function createUser() {
    if (!newUser.name || !newUser.email || !newUser.password) return;
    setCreating(true);
    try {
      const res = await fetch(`${API}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(newUser),
      });
      if (res.ok) { setShowModal(false); setNewUser({ name: "", email: "", password: "", role: "recruiter" }); fetchUsers(); }
    } finally { setCreating(false); }
  }

  async function deleteUser(userId: string) {
    if (!confirm("Are you sure you want to remove this user?")) return;
    await fetch(`${API}/admin/users/${userId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    fetchUsers();
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-gray-500 mt-1">Manage users and system settings</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-sm">
          + Add User
        </button>
      </div>

      {/* System Status */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">System Health</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "MongoDB Database", key: "db", icon: "🗄️" },
            { label: "OpenAI API", key: "ai", icon: "🤖" },
            { label: "File Storage", key: "storage", icon: "📁" },
          ].map(({ label, key, icon }) => (
            <div key={key} className={`rounded-xl p-4 border ${systemStatus[key as keyof typeof systemStatus] ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
              <div className="flex items-center gap-2">
                <span>{icon}</span>
                <span className={`text-sm font-bold ${systemStatus[key as keyof typeof systemStatus] ? "text-emerald-700" : "text-red-700"}`}>
                  {systemStatus[key as keyof typeof systemStatus] ? "● Connected" : "● Disconnected"}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50">
          <h2 className="font-bold text-gray-900">User Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} total users</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading users...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {["Name", "Email", "Role", "Created", "Last Login", "Actions"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                        {u.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <span className="font-semibold text-gray-900 text-sm">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-600">{u.email}</td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${roleColors[u.role] || "bg-gray-100 text-gray-600"}`}>
                      {u.role?.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-500">{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "Never"}</td>
                  <td className="px-4 py-3.5">
                    <button onClick={() => deleteUser(u._id)}
                      className="text-red-500 hover:text-red-700 text-sm font-medium hover:bg-red-50 px-2 py-1 rounded-lg transition-all">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Add New User</h2>
            <div className="space-y-4">
              {[{ k: "name", l: "Full Name", p: "John Smith" }, { k: "email", l: "Email", p: "john@company.com" }, { k: "password", l: "Temporary Password", p: "Min 8 characters" }].map(({ k, l, p }) => (
                <div key={k}>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">{l} *</label>
                  <input type={k === "password" ? "password" : "text"}
                    value={newUser[k as keyof typeof newUser]}
                    onChange={e => setNewUser({ ...newUser, [k]: e.target.value })}
                    placeholder={p}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Role *</label>
                <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  {roles.map(r => <option key={r} value={r}>{r.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-200 py-2.5 rounded-xl font-semibold text-gray-600 hover:bg-gray-50 transition-all text-sm">Cancel</button>
              <button onClick={createUser} disabled={creating}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-all disabled:opacity-60 text-sm">
                {creating ? "Creating..." : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
