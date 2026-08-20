import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Activity, Database, Server, BarChart3, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import Dashboard from './pages/Dashboard';
import JobMonitor from './pages/JobMonitor';
import Storage from './pages/Storage';
import ActivityLog from './pages/ActivityLog';
import SystemMonitor from './pages/SystemMonitor';
import Analytics from './pages/Analytics';

function Sidebar() {
  const location = useLocation();
  
  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Job Monitor', path: '/jobs', icon: Activity },
    { name: 'Storage', path: '/storage', icon: Database },
    { name: 'Activity Log', path: '/activity', icon: Activity },
    { name: 'System Monitor', path: '/system', icon: Server },
    { name: 'Analytics', path: '/analytics', icon: BarChart3 },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="w-64 bg-slate-950 text-white min-h-screen flex flex-col fixed left-0 top-0">
      <div className="p-6">
        <h1 className="text-xl font-bold tracking-tight">AI Agent Monitor</h1>
      </div>
      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors",
                isActive ? "bg-primary text-primary-foreground" : "hover:bg-slate-800 text-slate-300"
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function App() {
  return (
    <Router basename="/monitor">
      <div className="min-h-screen bg-slate-50 flex">
        <Sidebar />
        <main className="flex-1 ml-64 p-8 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/jobs" element={<JobMonitor />} />
            <Route path="/storage" element={<Storage />} />
            <Route path="/activity" element={<ActivityLog />} />
            <Route path="/system" element={<SystemMonitor />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<div className="text-2xl font-bold">Settings</div>} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
