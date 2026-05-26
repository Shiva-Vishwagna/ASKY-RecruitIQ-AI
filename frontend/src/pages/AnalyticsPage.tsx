import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";

interface AnalyticsData {
  tierDistribution: { name: string; value: number; color: string }[];
  hiringFunnel: { stage: string; count: number }[];
  monthlyTrend: { month: string; candidates: number; hired: number }[];
  summary: { totalJobs: number; totalCandidates: number; avgScore: number; hireRate: number };
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30");

  const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  const token = localStorage.getItem("token");

  useEffect(() => { fetchAnalytics(); }, [range]);

  async function fetchAnalytics() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/analytics?days=${range}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setData(d);
    } catch {
      // Fallback demo data
      setData({
        tierDistribution: [
          { name: "A-Tier", value: 24, color: "#10b981" },
          { name: "B-Tier", value: 45, color: "#3b82f6" },
          { name: "C-Tier", value: 31, color: "#f59e0b" },
        ],
        hiringFunnel: [
          { stage: "Applied", count: 100 },
          { stage: "Screened", count: 75 },
          { stage: "Shortlisted", count: 40 },
          { stage: "Interviewed", count: 20 },
          { stage: "Offered", count: 8 },
          { stage: "Hired", count: 6 },
        ],
        monthlyTrend: [
          { month: "Jan", candidates: 45, hired: 5 },
          { month: "Feb", candidates: 62, hired: 8 },
          { month: "Mar", candidates: 78, hired: 10 },
          { month: "Apr", candidates: 55, hired: 7 },
          { month: "May", candidates: 89, hired: 12 },
        ],
        summary: { totalJobs: 12, totalCandidates: 329, avgScore: 67, hireRate: 18 },
      });
    } finally { setLoading(false); }
  }

  function exportReport() {
    alert("Report export will download as PDF. Feature requires backend PDF endpoint.");
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
    </div>
  );

  const stats = data?.summary;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 mt-1">Hiring performance and trends</p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
            {[{ v: "7", l: "7D" }, { v: "30", l: "30D" }, { v: "90", l: "90D" }].map(({ v, l }) => (
              <button key={v} onClick={() => setRange(v)}
                className={`px-4 py-2 text-sm font-semibold transition-all ${range === v ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={exportReport}
            className="border border-gray-200 bg-white text-gray-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all">
            ↓ Export
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Jobs", value: stats?.totalJobs, icon: "💼", color: "blue" },
          { label: "Total Candidates", value: stats?.totalCandidates, icon: "👥", color: "purple" },
          { label: "Avg AI Score", value: `${stats?.avgScore}/100`, icon: "🎯", color: "emerald" },
          { label: "Hire Rate", value: `${stats?.hireRate}%`, icon: "✅", color: "amber" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-white rounded-2xl p-5 border border-gray-100">
            <div className="text-2xl mb-2">{icon}</div>
            <div className={`text-3xl font-black text-${color}-600 mb-1`}>{value}</div>
            <div className="text-sm text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Monthly Trend */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-5">Monthly Candidate Trend</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data?.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="candidates" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} name="Candidates" />
              <Line type="monotone" dataKey="hired" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Hired" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Tier Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-5">Candidate Tier Distribution</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={data?.tierDistribution} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {data?.tierDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hiring Funnel */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <h2 className="font-bold text-gray-900 mb-5">Hiring Funnel</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data?.hiringFunnel} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis dataKey="stage" type="category" tick={{ fontSize: 12 }} width={90} />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" radius={[0, 6, 6, 0]} name="Candidates" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
