import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
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

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-56' : 'w-16'} bg-slate-900 flex flex-col transition-all duration-200 shrink-0`}>
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
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">☰</button>
          <div className="flex-1" />
          <span className="text-sm text-gray-500">Welcome, <strong className="text-gray-800">{user.name}</strong></span>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
