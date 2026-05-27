import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../lib/api';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ totalJobs: 0, totalCandidates: 0, avgScore: 0, hireRate: 0 });
  const [recentCandidates, setRecentCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    async function load() {
      try {
        const [analyticsRes, candidatesRes] = await Promise.all([
          API.get('/analytics'),
          API.get('/candidates'),
        ]);
        const s = analyticsRes.data.summary || {};
        setStats({
          totalJobs: s.totalJobs || 0,
          totalCandidates: s.totalCandidates || 0,
          avgScore: s.avgScore || 0,
          hireRate: s.hireRate || 0,
        });
        setRecentCandidates((candidatesRes.data.candidates || []).slice(0, 5));
      } catch (e) { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const statCards = [
    { label: 'Total Jobs', value: stats.totalJobs, icon: '💼', color: 'blue', path: '/jobs' },
    { label: 'Total Candidates', value: stats.totalCandidates, icon: '👥', color: 'purple', path: '/candidates' },
    { label: 'Average AI Score', value: `${stats.avgScore || 0}/100`, icon: '🎯', color: 'emerald', path: '/analytics' },
    { label: 'Hire Rate', value: `${stats.hireRate}%`, icon: '✅', color: 'amber', path: '/analytics' },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  };

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome back, {user.name?.split(' ')[0]} 👋</h1>
        <p className="text-gray-500 mt-1">Here's your recruitment overview</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(card => (
          <div key={card.label} onClick={() => navigate(card.path)}
            className={`bg-white rounded-2xl p-5 border ${colorMap[card.color]} cursor-pointer hover:shadow-md transition-all`}>
            <div className="text-3xl mb-2">{card.icon}</div>
            <div className="text-2xl font-black text-gray-900">{loading ? '...' : card.value}</div>
            <div className="text-sm text-gray-500 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            {[
              { label: 'Create New Job Posting', icon: '➕', path: '/jobs', color: 'bg-blue-600' },
              { label: 'View All Candidates', icon: '👥', path: '/candidates', color: 'bg-purple-600' },
              { label: 'View Analytics', icon: '📈', path: '/analytics', color: 'bg-emerald-600' },
              { label: 'Manage Users', icon: '⚙️', path: '/admin', color: 'bg-orange-600' },
            ].map(action => (
              <button key={action.path} onClick={() => navigate(action.path)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-all text-left">
                <span className={`w-9 h-9 ${action.color} rounded-lg flex items-center justify-center text-white text-sm`}>{action.icon}</span>
                <span className="font-medium text-gray-700 text-sm">{action.label}</span>
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
              <p className="text-sm">No candidates yet. Upload resumes to get started.</p>
              <button onClick={() => navigate('/jobs')} className="mt-3 text-blue-600 text-sm hover:underline">Go to Jobs →</button>
            </div>
          ) : recentCandidates.map(c => (
            <div key={c._id} onClick={() => navigate(`/candidates/${c._id}`)}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-all mb-1">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {c.name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{c.name}</p>
                <p className="text-xs text-gray-500 truncate">{c.jobTitle}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-gray-900 text-sm">{c.score}</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.tier === 'A' ? 'bg-emerald-100 text-emerald-700' : c.tier === 'B' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                  {c.tier}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
