import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../lib/api';

const STATUSES = [
  { value: "cv_uploaded",       label: "CV Uploaded" },
  { value: "ai_screened",       label: "AI Screened" },
  { value: "questions_sent",    label: "Questions Sent" },
  { value: "answers_submitted", label: "Answers Submitted" },
  { value: "hm_ready",          label: "HM Ready" },
  { value: "rejected",          label: "Rejected" },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ totalJobs: 0, totalCandidates: 0, avgScore: 0, hireRate: 0 });
  const [recentCandidates, setRecentCandidates] = useState<any[]>([]);
  const [allCandidates, setAllCandidates] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    async function load() {
      try {
        const [analyticsRes, candidatesRes, jobsRes] = await Promise.all([
          API.get('/analytics'),
          API.get('/candidates'),
          API.get('/jobs'),
        ]);
        const s = analyticsRes.data.summary || {};
        setStats({
          totalJobs: s.totalJobs || 0,
          totalCandidates: s.totalCandidates || 0,
          avgScore: s.avgScore || 0,
          hireRate: s.hireRate || 0,
        });
        const candidates = candidatesRes.data.candidates || [];
        setAllCandidates(candidates);
        setRecentCandidates(candidates.slice(0, 5));
        setJobs(jobsRes.data.jobs || jobsRes.data || []);
      } catch (e) { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  // ── Smart Alerts ──────────────────────────────────────────────
  const now = new Date();

  // Candidates stuck in same stage > 5 days
  const stuckCandidates = allCandidates.filter(c => {
    const date = new Date(c.updatedAt || c.createdAt || c.appliedAt || 0);
    const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    return days >= 5 && c.status !== 'rejected' && c.status !== 'hm_ready';
  });

  // Candidates with answers submitted but not reviewed
  const pendingReview = allCandidates.filter(c => c.status === 'answers_submitted');

  // HM Ready candidates
  const hmReady = allCandidates.filter(c => c.status === 'hm_ready');

  // Jobs with 0 candidates
  const emptyJobs = jobs.filter(j => (j.candidateCount || 0) === 0);

  // High score candidates still in early stage
  const highScoreEarly = allCandidates.filter(c => {
    const score = c.aiScore || c.score || 0;
    return score >= 80 && (c.status === 'cv_uploaded' || c.status === 'ai_screened');
  });

  // Build alerts list
  const alerts: { type: 'red' | 'amber' | 'green' | 'blue'; message: string; action: string; path: string }[] = [];

  if (stuckCandidates.length > 0)
    alerts.push({ type: 'red', message: `${stuckCandidates.length} candidate${stuckCandidates.length > 1 ? 's' : ''} stuck in same stage for 5+ days`, action: 'Review now', path: '/candidates' });

  if (pendingReview.length > 0)
    alerts.push({ type: 'amber', message: `${pendingReview.length} candidate${pendingReview.length > 1 ? 's' : ''} submitted answers — waiting for review`, action: 'View answers', path: '/candidates' });

  if (hmReady.length > 0)
    alerts.push({ type: 'green', message: `${hmReady.length} candidate${hmReady.length > 1 ? 's' : ''} ready for Hiring Manager interview`, action: 'View', path: '/candidates' });

  if (highScoreEarly.length > 0)
    alerts.push({ type: 'blue', message: `${highScoreEarly.length} high-scoring candidate${highScoreEarly.length > 1 ? 's' : ''} (80+) still in early stage — move them forward`, action: 'View', path: '/candidates' });

  if (emptyJobs.length > 0)
    alerts.push({ type: 'amber', message: `${emptyJobs.length} job${emptyJobs.length > 1 ? 's' : ''} have 0 candidates this week`, action: 'View jobs', path: '/jobs' });

  const alertColors = {
    red:   { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-800',   btn: 'text-red-600',   dot: 'bg-red-500',   icon: '🔴' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', btn: 'text-amber-600', dot: 'bg-amber-500', icon: '🟡' },
    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', btn: 'text-green-600', dot: 'bg-green-500', icon: '🟢' },
    blue:  { bg: 'bg-blue-50',  border: 'border-blue-200',  text: 'text-blue-800',  btn: 'text-blue-600',  dot: 'bg-blue-500',  icon: '🔵' },
  };

  // ── Pipeline Summary ──────────────────────────────────────────
  const pipelineCounts = STATUSES.map(s => ({
    ...s,
    count: allCandidates.filter(c => (c.status || 'cv_uploaded') === s.value).length,
  }));

  // ── Stat Cards ────────────────────────────────────────────────
  const statCards = [
    { label: 'Total Jobs', value: stats.totalJobs, icon: '💼', color: 'blue', path: '/jobs', sub: `${jobs.filter(j => j.status === 'open').length} open` },
    { label: 'Total Candidates', value: stats.totalCandidates, icon: '👥', color: 'purple', path: '/candidates', sub: `${hmReady.length} HM ready` },
    { label: 'Average AI Score', value: `${stats.avgScore || 0}/100`, icon: '🎯', color: 'emerald', path: '/analytics', sub: `${allCandidates.filter(c => (c.aiScore||c.score||0) >= 80).length} scored 80+` },
    { label: 'Hire Rate', value: `${stats.hireRate}%`, icon: '✅', color: 'amber', path: '/analytics', sub: 'Based on HM ready' },
  ];

  const colorMap: Record<string, string> = {
    blue:   'bg-blue-50 text-blue-600 border-blue-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    emerald:'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber:  'bg-amber-50 text-amber-600 border-amber-100',
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Welcome back, {user.name?.split(' ')[0]} 👋</h1>
        <p className="text-gray-500 mt-1">{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* ── Smart Alerts ── */}
      {!loading && alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">⚡ Needs Your Attention</h2>
          {alerts.map((alert, i) => {
            const c = alertColors[alert.type];
            return (
              <div key={i} className={`${c.bg} ${c.border} border rounded-xl px-4 py-3 flex items-center justify-between gap-4`}>
                <div className="flex items-center gap-3">
                  <span className="text-base">{c.icon}</span>
                  <p className={`text-sm font-medium ${c.text}`}>{alert.message}</p>
                </div>
                <button onClick={() => navigate(alert.path)}
                  className={`text-xs font-bold ${c.btn} hover:underline whitespace-nowrap shrink-0`}>
                  {alert.action} →
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!loading && alerts.length === 0 && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span>✅</span>
          <p className="text-sm font-medium text-green-800">All caught up! No urgent actions needed right now.</p>
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map(card => (
          <div key={card.label} onClick={() => navigate(card.path)}
            className={`bg-white rounded-2xl p-5 border ${colorMap[card.color]} cursor-pointer hover:shadow-md transition-all`}>
            <div className="text-3xl mb-2">{card.icon}</div>
            <div className="text-2xl font-black text-gray-900">{loading ? '...' : card.value}</div>
            <div className="text-sm text-gray-500 mt-1">{card.label}</div>
            {!loading && <div className="text-xs font-semibold mt-1 opacity-70">{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Pipeline Summary ── */}
      {!loading && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">📊 Pipeline Overview</h2>
            <button onClick={() => navigate('/candidates')} className="text-blue-600 text-sm hover:underline">View all →</button>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {pipelineCounts.map(s => (
              <button key={s.value} onClick={() => navigate('/candidates')}
                className="text-center p-3 rounded-xl bg-gray-50 hover:bg-blue-50 hover:border-blue-200 border border-transparent transition-all cursor-pointer">
                <div className="text-2xl font-black text-gray-900">{s.count}</div>
                <div className="text-xs text-gray-500 mt-1 leading-tight">{s.label}</div>
              </button>
            ))}
          </div>

          {/* Visual pipeline bar */}
          <div className="mt-4">
            <div className="flex rounded-full overflow-hidden h-3">
              {pipelineCounts.map((s, i) => {
                const total = allCandidates.length || 1;
                const pct = (s.count / total) * 100;
                const colors = ['bg-gray-400','bg-blue-400','bg-purple-400','bg-amber-400','bg-emerald-400','bg-red-400'];
                return pct > 0 ? (
                  <div key={s.value} className={`${colors[i]} transition-all`} style={{ width: `${pct}%` }} title={`${s.label}: ${s.count}`} />
                ) : null;
              })}
            </div>
            <div className="flex gap-4 mt-2 flex-wrap">
              {pipelineCounts.filter(s => s.count > 0).map((s, i) => {
                const colors = ['text-gray-500','text-blue-500','text-purple-500','text-amber-500','text-emerald-500','text-red-500'];
                const dots = ['bg-gray-400','bg-blue-400','bg-purple-400','bg-amber-400','bg-emerald-400','bg-red-400'];
                const idx = STATUSES.findIndex(st => st.value === s.value);
                return (
                  <div key={s.value} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${dots[idx]}`} />
                    <span className={`text-xs ${colors[idx]}`}>{s.label} ({s.count})</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            {[
              { label: 'Create New Job Posting', icon: '➕', path: '/jobs', color: 'bg-blue-600', badge: null },
              { label: 'View All Candidates', icon: '👥', path: '/candidates', color: 'bg-purple-600', badge: pendingReview.length > 0 ? `${pendingReview.length} pending` : null },
              { label: 'View Analytics', icon: '📈', path: '/analytics', color: 'bg-emerald-600', badge: null },
              { label: 'Manage Users', icon: '⚙️', path: '/admin', color: 'bg-orange-600', badge: null },
            ].map(action => (
              <button key={action.path} onClick={() => navigate(action.path)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-all text-left">
                <span className={`w-9 h-9 ${action.color} rounded-lg flex items-center justify-center text-white text-sm shrink-0`}>{action.icon}</span>
                <span className="font-medium text-gray-700 text-sm">{action.label}</span>
                {action.badge && (
                  <span className="ml-2 bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{action.badge}</span>
                )}
                <span className="ml-auto text-gray-400 text-xs">→</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Candidates */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Recent Candidates</h2>
            <button onClick={() => navigate('/candidates')} className="text-blue-600 text-sm hover:underline">View all →</button>
          </div>
          {loading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse" />)}</div>
          ) : recentCandidates.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl mb-2">📄</div>
              <p className="text-sm">No candidates yet.</p>
              <button onClick={() => navigate('/jobs')} className="mt-3 text-blue-600 text-sm hover:underline">Go to Jobs →</button>
            </div>
          ) : recentCandidates.map(c => {
            const score = c.aiScore || c.score || 0;
            const date = new Date(c.updatedAt || c.createdAt || c.appliedAt || 0);
            const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
            const isStuck = days >= 5 && c.status !== 'rejected' && c.status !== 'hm_ready';
            return (
              <div key={c._id} onClick={() => navigate(`/candidates/${c._id}`)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-all mb-1">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {c.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm truncate">{c.name}</p>
                    {isStuck && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold shrink-0">{days}d</span>}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{c.jobTitle || c.appliedFor}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-gray-900 text-sm">{score}</p>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.tier?.includes('A') ? 'bg-emerald-100 text-emerald-700' : c.tier?.includes('B') ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    {c.tier?.replace(/-?Tier$/i,'')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
