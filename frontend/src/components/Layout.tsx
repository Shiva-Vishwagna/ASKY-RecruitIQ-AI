import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import RecruiterBot from './RecruiterBot';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('token');
  const API = 'https://asky-recruitiq-ai.onrender.com/api';
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : {};
  const isAdmin = user.role === 'admin';

  const navItems = [
    { path: '/dashboard', icon: '📊', label: 'Dashboard',     adminOnly: false },
    { path: '/jobs',      icon: '💼', label: 'Jobs',          adminOnly: false },
    { path: '/pipeline',  icon: '🎯', label: 'Pipeline View', adminOnly: false },
    { path: '/candidates',icon: '👥', label: 'Candidates',    adminOnly: false },
    { path: '/analytics', icon: '📈', label: 'Analytics',     adminOnly: false },
    { path: '/audit-logs',icon: '📋', label: 'Audit Logs',    adminOnly: true  },
    { path: '/settings',  icon: '🔧', label: 'Settings',      adminOnly: false },
    { path: '/admin',     icon: '👤', label: 'Admin',         adminOnly: true  },
  ].filter(item => !item.adminOnly || isAdmin);

  // Dark mode toggle
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  // Global Ctrl+K search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(s => !s);
      }
      if (e.key === 'Escape') setShowSearch(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Load candidates for search when search opens
  useEffect(() => {
    if (showSearch && candidates.length === 0) {
      fetch(`${API}/candidates`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setCandidates(d.candidates || d || []))
        .catch(() => {});
    }
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 50);
  }, [showSearch]);

  // Filter search results
  useEffect(() => {
    if (searchQuery.trim().length < 2) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    setSearchResults(
      candidates.filter((c: any) =>
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        (c.appliedFor || c.jobTitle || '').toLowerCase().includes(q) ||
        (c.seniority || '').toLowerCase().includes(q)
      ).slice(0, 8)
    );
  }, [searchQuery, candidates]);

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  return (
    <div className={`flex h-screen overflow-hidden transition-colors duration-200 ${darkMode ? "bg-gray-950" : "bg-gray-50"}`}>
      {/* Sidebar */}
      <div className={`${sidebarOpen ? "w-56" : "w-16"} ${darkMode ? "bg-gray-900" : "bg-slate-900"} flex flex-col transition-all duration-200 shrink-0`}>
        <div className="p-4 border-b border-slate-700 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0">R</div>
          {sidebarOpen && <span className="text-white font-bold text-sm leading-tight">Recruit IQ</span>}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <Link key={item.path} to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                location.pathname.startsWith(item.path)
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}>
              <span className="text-base shrink-0">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-700">
          <Link to="/profile" className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-800 transition-all">
            <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">{user.name}</p>
                <p className="text-slate-400 text-xs capitalize">{user.role}</p>
              </div>
            )}
          </Link>
          {sidebarOpen && (
            <button onClick={logout} className="w-full mt-1 text-left px-3 py-2 text-slate-400 hover:text-red-400 text-xs rounded-xl hover:bg-slate-800 transition-all">
              🚪 Sign Out
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      {/* ── Global Search Overlay ── */}
      {showSearch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-20 px-4"
          onClick={() => { setShowSearch(false); setSearchQuery(''); }}>
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-100'}`}
            onClick={e => e.stopPropagation()}>
            {/* Search input */}
            <div className={`flex items-center gap-3 px-4 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <span className="text-xl">🔍</span>
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search candidates by name, email, role..."
                className={`flex-1 text-base focus:outline-none bg-transparent ${darkMode ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
              />
              <button onClick={() => { setShowSearch(false); setSearchQuery(''); }}
                className={`text-lg ${darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-300 hover:text-gray-600'}`}>✕</button>
            </div>
            {/* Results */}
            <div className="max-h-80 overflow-y-auto">
              {searchQuery.trim().length < 2 ? (
                <div className={`p-6 text-center text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Type at least 2 characters to search candidates...
                </div>
              ) : searchResults.length === 0 ? (
                <div className={`p-6 text-center text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  No candidates found for "<strong>{searchQuery}</strong>"
                </div>
              ) : (
                searchResults.map((c: any) => (
                  <button key={c._id}
                    onClick={() => { navigate(`/candidates/${c._id}`); setShowSearch(false); setSearchQuery(''); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                    <div className="w-9 h-9 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {c.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-sm truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{c.name}</div>
                      <div className={`text-xs truncate ${darkMode ? 'text-gray-400' : 'text-gray-400'}`}>
                        {c.appliedFor || c.jobTitle || '—'} · {c.seniority || ''} · Score: {c.aiScore || 0}
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      c.tier?.includes('A') ? 'bg-emerald-100 text-emerald-700' :
                      c.tier?.includes('B') ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'}`}>
                      {c.tier || 'C-Tier'}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className={`px-4 py-2 text-xs border-t ${darkMode ? 'border-gray-700 text-gray-500' : 'border-gray-50 text-gray-400'}`}>
              Press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-xs">Esc</kbd> to close · <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-xs">Ctrl+K</kbd> to open
            </div>
          </div>
        </div>
      )}

      <div className={`flex-1 flex flex-col overflow-hidden transition-colors ${darkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
        <div className={`border-b px-4 py-3 flex items-center gap-3 shrink-0 transition-colors ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-1 rounded-lg transition-colors ${darkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>☰</button>
          <div className="flex-1" />
          <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Welcome, <strong className={darkMode ? 'text-white' : 'text-gray-800'}>{user.name}</strong>
          </span>
          {/* 🔍 Global Search */}
          <button onClick={() => setShowSearch(s => !s)}
            title="Search candidates (Ctrl+K)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${darkMode ? 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'}`}>
            🔍 <span className="hidden sm:inline opacity-60">Ctrl+K</span>
          </button>
          {/* 🌙 Dark Mode Toggle */}
          <button onClick={() => setDarkMode((d: boolean) => !d)}
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all border ${darkMode ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-gray-100 border-gray-200 hover:bg-gray-200'}`}>
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
        <div className={`flex-1 overflow-y-auto transition-colors ${darkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>{children}</div>
      </div>

      {/* Recruiter Bot — appears on every page */}
      <RecruiterBot />
    </div>
  );
}
