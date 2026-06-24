import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../lib/api';

const STATUSES = [
  { value: "cv_uploaded",       label: "CV Uploaded",    color: "bg-gray-100 text-gray-600"     },
  { value: "ai_screened",       label: "AI Screened",    color: "bg-blue-100 text-blue-700"     },
  { value: "questions_sent",    label: "Questions Sent", color: "bg-purple-100 text-purple-700" },
  { value: "answers_submitted", label: "Answers In",     color: "bg-amber-100 text-amber-700"   },
  { value: "hm_ready",          label: "HM Ready",       color: "bg-emerald-100 text-emerald-700"},
  { value: "rejected",          label: "Rejected",       color: "bg-red-100 text-red-700"       },
];

function getDaysInStage(c: any): number {
  const d = new Date(c.updatedAt || c.createdAt || c.appliedAt || 0);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats]                 = useState({ totalJobs: 0, totalCandidates: 0, avgScore: 0, hireRate: 0 });
  const [recentCandidates, setRecentCandidates] = useState<any[]>([]);
  const [allCandidates, setAllCandidates] = useState<any[]>([]);
  const [jobs, setJobs]                   = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [recruiterFilter, setRecruiterFilter] = useState('all');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowSearch(s => !s); }
      if (e.key === 'Escape') setShowSearch(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const isAdmin = user.role === 'admin';
        const [analyticsRes, candidatesRes, jobsRes] = await Promise.all([
          API.get('/analytics'),
          API.get('/candidates'),
          API.get('/jobs'),
        ]);
        const s = analyticsRes.data.summary || {};
        const allCands = candidatesRes.data.candidates || [];

        // Recruiters only see candidates they uploaded
        const myCands = isAdmin
          ? allCands
          : allCands.filter((c: any) =>
              c.uploadedBy === user._id ||
              c.uploadedBy === user.id ||
              c.uploadedByName === user.name
            );

        // Stats: admin sees all, recruiter sees own
        const myAvgScore = myCands.length
          ? Math.round(myCands.reduce((s: number, c: any) => s + (c.aiScore || c.score || 0), 0) / myCands.length)
          : 0;
        const myHired = myCands.filter((c: any) => c.status === 'hm_ready').length;
        const myHireRate = myCands.length ? Math.round((myHired / myCands.length) * 100) : 0;

        setStats(isAdmin
          ? { totalJobs: s.totalJobs || 0, totalCandidates: s.totalCandidates || 0, avgScore: s.avgScore || 0, hireRate: s.hireRate || 0 }
          : { totalJobs: jobsRes.data?.jobs?.length || jobsRes.data?.length || 0, totalCandidates: myCands.length, avgScore: myAvgScore, hireRate: myHireRate }
        );
        setAllCandidates(myCands);
        setRecentCandidates([...myCands].sort((a: any, b: any) => new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime()).slice(0, 5));
        setJobs(jobsRes.data.jobs || jobsRes.data || []);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  // ── Smart Alerts ─────────────────────────────────────────────
  const searchResults = search.trim().length > 1
    ? allCandidates.filter(c =>
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase()) ||
        (c.appliedFor||c.jobTitle||'').toLowerCase().includes(search.toLowerCase())
      ).slice(0, 8)
    : [];

  // ── Recruiter Activity Stats (admin only) ───────────────────
  const recruiterMap: Record<string, any> = {};
  allCandidates.forEach((c: any) => {
    const name = c.uploadedByName || c.uploadedBy || 'Unknown';
    if (!recruiterMap[name]) recruiterMap[name] = {
      name, uploads: 0, screened: 0, hmReady: 0, rejected: 0,
      scores: [], latest: null, candidates: []
    };
    recruiterMap[name].uploads++;
    if (c.screeningScore && c.screeningScore > 0) recruiterMap[name].screened++;
    if (c.status === 'hm_ready') recruiterMap[name].hmReady++;
    if (c.status === 'rejected') recruiterMap[name].rejected++;
    if (c.aiScore) recruiterMap[name].scores.push(c.aiScore);
    if (!recruiterMap[name].latest || new Date(c.createdAt) > new Date(recruiterMap[name].latest))
      recruiterMap[name].latest = c.createdAt;
    recruiterMap[name].candidates.push(c);
  });
  const recruiterStats = Object.values(recruiterMap).map((r: any) => ({
    ...r,
    avgScore: r.scores.length ? Math.round(r.scores.reduce((a: number, b: number) => a + b, 0) / r.scores.length) : 0,
    convRate: r.uploads > 0 ? Math.round((r.hmReady / r.uploads) * 100) : 0,
  })).sort((a: any, b: any) => b.uploads - a.uploads);

  const filteredCandidates = recruiterFilter === 'all'
    ? allCandidates
    : allCandidates.filter((c: any) => (c.uploadedByName || c.uploadedBy || 'Unknown') === recruiterFilter);

  const stuckCandidates  = filteredCandidates.filter(c => getDaysInStage(c) >= 5 && c.status !== 'rejected' && c.status !== 'hm_ready');
  const pendingReview    = filteredCandidates.filter((c: any) => c.status === 'answers_submitted');
  const hmReady          = filteredCandidates.filter((c: any) => c.status === 'hm_ready');
  const highScoreEarly   = filteredCandidates.filter((c: any) => (c.aiScore||c.score||0) >= 80 && (c.status === 'cv_uploaded' || c.status === 'ai_screened'));
  const emptyJobs        = jobs.filter(j => (j.candidateCount || 0) === 0);

  const alerts: { type: 'red'|'amber'|'green'|'blue'; message: string; path: string; action: string }[] = [];
  if (stuckCandidates.length)  alerts.push({ type: 'red',   message: `${stuckCandidates.length} candidate(s) stuck in same stage for 5+ days`,           path: '/candidates', action: 'Review now' });
  if (pendingReview.length)    alerts.push({ type: 'amber', message: `${pendingReview.length} candidate(s) submitted answers — waiting for review`,         path: '/candidates', action: 'View answers' });
  if (hmReady.length)          alerts.push({ type: 'green', message: `${hmReady.length} candidate(s) ready for Hiring Manager interview`,                   path: '/candidates', action: 'View' });
  if (highScoreEarly.length)   alerts.push({ type: 'blue',  message: `${highScoreEarly.length} high-scoring candidate(s) (80+) still in early stage`,       path: '/candidates', action: 'Move forward' });
  if (emptyJobs.length)        alerts.push({ type: 'amber', message: `${emptyJobs.length} job(s) have 0 candidates this week`,                              path: '/jobs',       action: 'View jobs' });

  const alertColors = {
    red:   { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-800',   btn: 'bg-red-600',   icon: '🔴' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', btn: 'bg-amber-600', icon: '🟡' },
    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', btn: 'bg-emerald-600',icon: '🟢' },
    blue:  { bg: 'bg-blue-50',  border: 'border-blue-200',  text: 'text-blue-800',  btn: 'bg-blue-600',  icon: '🔵' },
  };

  // ── Pipeline counts ───────────────────────────────────────────
  const pipelineCounts = STATUSES.map(s => ({
    ...s,
    count: filteredCandidates.filter((c: any) => (c.status || 'cv_uploaded') === s.value).length,
  }));

  const colorMap: Record<string, string> = {
    blue:   'bg-blue-50 text-blue-600 border-blue-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    emerald:'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber:  'bg-amber-50 text-amber-600 border-amber-100',
  };

  const isAdmin = user.role === 'admin';
  const statCards = [
    { label: isAdmin ? 'Total Jobs' : 'Open Jobs',            value: stats.totalJobs,            icon: '💼', color: 'blue',    path: '/jobs',       sub: `${jobs.filter(j=>j.status==='open').length} open` },
    { label: isAdmin ? 'Total Candidates' : 'My Candidates',  value: stats.totalCandidates,      icon: '👥', color: 'purple',  path: '/candidates', sub: `${hmReady.length} HM ready` },
    { label: isAdmin ? 'Average AI Score' : 'My Avg Score',   value: `${stats.avgScore||0}/100`, icon: '🎯', color: 'emerald', path: '/analytics',  sub: `${allCandidates.filter(c=>(c.aiScore||c.score||0)>=80).length} scored 80+` },
    { label: isAdmin ? 'Hire Rate' : 'My Hire Rate',          value: `${stats.hireRate}%`,       icon: '✅', color: 'amber',   path: '/analytics',  sub: isAdmin ? 'Based on HM ready' : 'Your candidates' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-gray-900">Welcome back, {user.name?.split(' ')[0]} 👋</h1>
            {user.role !== 'admin' && (
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full border border-blue-200">
                👤 Recruiter View — Your Candidates Only
              </span>
            )}
          </div>
            {user.role !== 'admin' && (
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full border border-blue-200">
                👤 Recruiter View — Your Candidates Only
              </span>
            )}
          </div>
          <p className="text-gray-400 mt-1 text-sm">{new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSearch(s => !s)}
            className="bg-gray-100 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all flex items-center gap-2">
            🔍 Search <span className="text-xs text-gray-400 bg-white px-1.5 py-0.5 rounded-md border border-gray-200">Ctrl+K</span>
          </button>
          <button onClick={() => navigate('/pipeline')}
            className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all">
            🎯 Pipeline View
          </button>
        </div>
      </div>

      {/* ── Smart Alerts ── */}
      {!loading && (
        <div className="mb-6">
          {alerts.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 flex items-center gap-3">
              <span className="text-xl">✅</span>
              <p className="text-sm font-semibold text-green-800">All caught up! No urgent actions needed right now.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">⚡ Needs Your Attention</p>
              {alerts.map((alert, i) => {
                const c = alertColors[alert.type];
                return (
                  <div key={i} className={`${c.bg} ${c.border} border rounded-2xl px-5 py-3.5 flex items-center justify-between gap-4`}>
                    <div className="flex items-center gap-3">
                      <span>{c.icon}</span>
                      <p className={`text-sm font-medium ${c.text}`}>{alert.message}</p>
                    </div>
                    <button onClick={() => navigate(alert.path)}
                      className={`${c.btn} text-white text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0 hover:opacity-90`}>
                      {alert.action} →
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
            {!loading && <div className="text-xs font-semibold mt-1 opacity-60">{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Recruiter Activity Panel (Admin Only) ── */}
      {isAdmin && !loading && (
        <div className="bg-white rounded-2xl border border-gray-100 mb-6 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-bold text-gray-900 text-base">👤 Recruiter Activity</h2>
              <p className="text-xs text-gray-400 mt-0.5">Uploads and pipeline progress per recruiter — click a row to filter pipeline below</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 font-medium">Filter pipeline by:</span>
              <button onClick={() => setRecruiterFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${recruiterFilter === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                All
              </button>
              {recruiterStats.map((r: any) => (
                <button key={r.name} onClick={() => setRecruiterFilter(recruiterFilter === r.name ? 'all' : r.name)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${recruiterFilter === r.name ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                  {r.name.split(' ')[0]} ({r.uploads})
                </button>
              ))}
            </div>
          </div>
          {recruiterStats.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No recruiter data yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {['Recruiter','Uploads','Screened','HM Ready','Rejected','Avg Score','Conv %','Last Upload'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recruiterStats.map((r: any, i: number) => (
                    <tr key={i} onClick={() => setRecruiterFilter(recruiterFilter === r.name ? 'all' : r.name)}
                      className={`cursor-pointer transition-colors ${recruiterFilter === r.name ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-black">{r.name.charAt(0).toUpperCase()}</div>
                          <div>
                            <div className="font-semibold text-gray-900 text-sm">{r.name}</div>
                            {i === 0 && <span className="text-xs text-amber-600">🏆 Most active</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className="font-black text-gray-900 text-lg">{r.uploads}</span></td>
                      <td className="px-4 py-3"><span className="text-sm text-blue-700 font-medium">{r.screened}</span></td>
                      <td className="px-4 py-3"><span className={`text-sm font-bold px-2 py-0.5 rounded-full ${r.hmReady > 0 ? 'bg-emerald-100 text-emerald-700' : 'text-gray-300'}`}>{r.hmReady}</span></td>
                      <td className="px-4 py-3"><span className={`text-sm ${r.rejected > 0 ? 'text-red-500' : 'text-gray-300'}`}>{r.rejected}</span></td>
                      <td className="px-4 py-3"><span className={`font-black text-sm ${r.avgScore >= 80 ? 'text-emerald-600' : r.avgScore >= 60 ? 'text-blue-600' : r.avgScore > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{r.avgScore > 0 ? r.avgScore : '—'}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-1.5 bg-gray-100 rounded-full"><div className={`h-1.5 rounded-full ${r.convRate>=30?'bg-emerald-500':r.convRate>=15?'bg-blue-500':'bg-amber-400'}`} style={{width:`${r.convRate}%`}}/></div>
                          <span className="text-xs font-bold text-gray-600">{r.convRate}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{r.latest ? new Date(r.latest).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Pipeline Overview ── */}
      {!loading && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">📊 Pipeline Overview</h2>
            <button onClick={() => navigate('/candidates')} className="text-blue-600 text-sm hover:underline font-medium">View all →</button>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
            {pipelineCounts.map(s => (
              <button key={s.value} onClick={() => navigate('/candidates')}
                className="text-center p-3 rounded-xl bg-gray-50 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-all">
                <div className="text-2xl font-black text-gray-900">{s.count}</div>
                <div className="text-xs text-gray-500 mt-1 leading-tight">{s.label}</div>
              </button>
            ))}
          </div>
          {/* Bar */}
          <div className="flex rounded-full overflow-hidden h-3 mb-2">
            {pipelineCounts.map((s, i) => {
              const total = allCandidates.length || 1;
              const pct   = (s.count / total) * 100;
              const colors = ['bg-gray-400','bg-blue-400','bg-purple-400','bg-amber-400','bg-emerald-400','bg-red-400'];
              return pct > 0 ? <div key={s.value} className={`${colors[i]}`} style={{ width: `${pct}%` }} title={`${s.label}: ${s.count}`} /> : null;
            })}
          </div>
          <div className="flex gap-4 flex-wrap mt-1">
            {pipelineCounts.filter(s => s.count > 0).map((s, i) => {
              const colors  = ['text-gray-500','text-blue-500','text-purple-500','text-amber-500','text-emerald-500','text-red-500'];
              const dots    = ['bg-gray-400','bg-blue-400','bg-purple-400','bg-amber-400','bg-emerald-400','bg-red-400'];
              const idx     = STATUSES.findIndex(st => st.value === s.value);
              return (
                <div key={s.value} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${dots[idx]}`} />
                  <span className={`text-xs ${colors[idx]}`}>{s.label} ({s.count})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-4">⚡ Quick Actions</h2>
          <div className="space-y-2">
            {[
              { label: 'Create New Job Posting', icon: '➕', path: '/jobs',      color: 'bg-blue-600',    badge: null },
              { label: 'View All Candidates',    icon: '👥', path: '/candidates', color: 'bg-purple-600',  badge: pendingReview.length > 0 ? `${pendingReview.length} pending` : null },
              { label: 'Pipeline View',          icon: '🎯', path: '/pipeline',   color: 'bg-indigo-600',  badge: null },
              { label: 'View Analytics',         icon: '📈', path: '/analytics',  color: 'bg-emerald-600', badge: null },
              { label: 'Manage Users',           icon: '⚙️', path: '/admin',      color: 'bg-orange-600',  badge: null },
            ].map(action => (
              <button key={action.path} onClick={() => navigate(action.path)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-all text-left">
                <span className={`w-8 h-8 ${action.color} rounded-lg flex items-center justify-center text-white text-sm shrink-0`}>{action.icon}</span>
                <span className="font-medium text-gray-700 text-sm">{action.label}</span>
                {action.badge && <span className="ml-1 bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{action.badge}</span>}
                <span className="ml-auto text-gray-400 text-xs">→</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Candidates */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">🕐 Recent Candidates</h2>
            <button onClick={() => navigate('/candidates')} className="text-blue-600 text-sm hover:underline font-medium">View all →</button>
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
            const days  = getDaysInStage(c);
            const isStuck = days >= 5 && c.status !== 'rejected' && c.status !== 'hm_ready';
            const tierKey = c.tier?.replace(/-?Tier$/i,'') || c.tier;
            return (
              <div key={c._id} onClick={() => navigate(`/candidates/${c._id}`)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-all mb-1 border border-transparent hover:border-gray-100">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {c.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm truncate">{c.name}</p>
                    {isStuck && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold shrink-0">{days}d</span>}
                  </div>
                  <p className="text-xs text-gray-400 truncate">{c.jobTitle || c.appliedFor}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-black text-sm ${score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-blue-600' : 'text-amber-600'}`}>{score}</p>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tierKey === 'A' ? 'bg-emerald-100 text-emerald-700' : tierKey === 'B' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    {tierKey}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Today's Focus */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-4">🎯 Today's Focus</h2>
          {loading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="space-y-3">
              {/* HM Ready */}
              <div onClick={() => navigate('/candidates')} className="p-4 rounded-xl border-2 border-emerald-100 bg-emerald-50 cursor-pointer hover:border-emerald-300 transition-all">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">HM Ready</span>
                  <span className="text-2xl font-black text-emerald-600">{hmReady.length}</span>
                </div>
                <p className="text-xs text-emerald-600">Candidates ready for interview</p>
              </div>

              {/* Pending Review */}
              <div onClick={() => navigate('/candidates')} className="p-4 rounded-xl border-2 border-amber-100 bg-amber-50 cursor-pointer hover:border-amber-300 transition-all">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Pending Review</span>
                  <span className="text-2xl font-black text-amber-600">{pendingReview.length}</span>
                </div>
                <p className="text-xs text-amber-600">Answers submitted, awaiting review</p>
              </div>

              {/* Stuck */}
              <div onClick={() => navigate('/candidates')} className="p-4 rounded-xl border-2 border-red-100 bg-red-50 cursor-pointer hover:border-red-300 transition-all">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-red-700 uppercase tracking-wide">Stuck 5+ Days</span>
                  <span className="text-2xl font-black text-red-600">{stuckCandidates.length}</span>
                </div>
                <p className="text-xs text-red-500">Need immediate follow-up</p>
              </div>

              {/* Open Roles */}
              <div onClick={() => navigate('/jobs')} className="p-4 rounded-xl border-2 border-blue-100 bg-blue-50 cursor-pointer hover:border-blue-300 transition-all">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Open Roles</span>
                  <span className="text-2xl font-black text-blue-600">{jobs.filter(j => j.status === 'open').length}</span>
                </div>
                <p className="text-xs text-blue-500">Active job postings</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
