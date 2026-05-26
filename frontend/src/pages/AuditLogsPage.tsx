import { useState, useEffect } from "react";

interface AuditLog {
  _id: string;
  user: string;
  action: string;
  resource: string;
  details: string;
  ip?: string;
  createdAt: string;
}

const actionIcons: Record<string, string> = {
  LOGIN: "🔐", LOGOUT: "🚪",
  JOB_CREATED: "💼", JOB_UPDATED: "✏️", JOB_DELETED: "🗑️",
  RESUME_UPLOADED: "📄", CANDIDATE_SCORED: "🎯",
  DECISION_MADE: "✅", USER_CREATED: "👤",
};

const actionColors: Record<string, string> = {
  LOGIN: "bg-blue-100 text-blue-700",
  LOGOUT: "bg-gray-100 text-gray-600",
  JOB_CREATED: "bg-emerald-100 text-emerald-700",
  JOB_DELETED: "bg-red-100 text-red-600",
  RESUME_UPLOADED: "bg-purple-100 text-purple-700",
  CANDIDATE_SCORED: "bg-amber-100 text-amber-700",
  DECISION_MADE: "bg-emerald-100 text-emerald-700",
  USER_CREATED: "bg-blue-100 text-blue-700",
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  const token = localStorage.getItem("token");

  useEffect(() => { fetchLogs(); }, []);

  async function fetchLogs() {
    try {
      const res = await fetch(`${API}/audit-logs`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setLogs(data.logs || data || []);
    } catch { setLogs([]); }
    finally { setLoading(false); }
  }

  function exportCSV() {
    const headers = ["User", "Action", "Resource", "Details", "Time"];
    const rows = filtered.map(l => [l.user, l.action, l.resource, l.details, new Date(l.createdAt).toLocaleString()]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "audit-logs.csv"; a.click();
  }

  const filtered = logs.filter(l => {
    const matchSearch = l.user?.toLowerCase().includes(search.toLowerCase()) ||
      l.details?.toLowerCase().includes(search.toLowerCase()) ||
      l.resource?.toLowerCase().includes(search.toLowerCase());
    const matchAction = actionFilter === "all" || l.action === actionFilter;
    return matchSearch && matchAction;
  });

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const uniqueActions = [...new Set(logs.map(l => l.action))];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-500 mt-1">Complete history of all platform activity</p>
        </div>
        <button onClick={exportCSV}
          className="border border-gray-200 bg-white text-gray-700 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all">
          ↓ Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-6 flex flex-wrap gap-3 items-center">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search user, action, or details..."
          className="border border-gray-200 rounded-xl px-4 py-2 w-72 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Actions</option>
          {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-sm text-gray-400 ml-auto">{filtered.length} events</span>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center text-gray-400">Loading audit logs...</div>
      ) : paginated.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 border border-gray-100 text-center text-gray-400">
          <div className="text-5xl mb-4">📋</div>
          <p className="font-medium">No audit logs found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {paginated.map(log => (
              <div key={log._id} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                <span className="text-xl shrink-0 mt-0.5">{actionIcons[log.action] || "📌"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">{log.user}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${actionColors[log.action] || "bg-gray-100 text-gray-600"}`}>
                      {log.action?.replace(/_/g, " ")}
                    </span>
                    {log.resource && <span className="text-xs text-gray-400">on {log.resource}</span>}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">{log.details}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">{new Date(log.createdAt).toLocaleDateString()}</p>
                  <p className="text-xs text-gray-400">{new Date(log.createdAt).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-gray-50 px-5 py-4 flex items-center justify-between">
              <span className="text-sm text-gray-400">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-gray-50">← Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-gray-50">Next →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
