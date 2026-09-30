import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Activity, Database, Server, BarChart3, Settings, 
  MessageSquare, Search, Bell, User, Menu, PieChart, ShoppingCart, 
  ChevronDown, Layers, Box, Columns, PenTool, Layout
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Dashboard from './pages/Dashboard';
import JobMonitor from './pages/JobMonitor';
import Storage from './pages/Storage';
import ActivityLog from './pages/ActivityLog';
import SystemMonitor from './pages/SystemMonitor';
import Analytics from './pages/Analytics';
import { Chatbot } from './pages/Chatbot';

function Topbar() {
  return (
    <div className="h-14 bg-slate-900 flex items-center justify-between px-6 fixed top-0 w-full z-50 shadow-sm text-white">
      <div className="flex items-center gap-16">
        <div className="text-xl font-bold tracking-wide flex items-center gap-2 w-48">
          Architect
        </div>
        <div className="flex items-center gap-6 text-sm font-medium">
          <button className="hover:bg-black/10 p-2 rounded-full transition-colors"><Search size={18} /></button>
          <button className="flex items-center gap-1 hover:bg-black/10 px-3 py-1.5 rounded transition-colors">
            <LayoutDashboard size={16} /> Mega Menu <ChevronDown size={14} />
          </button>
          <button className="flex items-center gap-1 hover:bg-black/10 px-3 py-1.5 rounded transition-colors">
            <Settings size={16} /> Settings <ChevronDown size={14} />
          </button>
          <button className="flex items-center gap-1 hover:bg-black/10 px-3 py-1.5 rounded transition-colors">
            <Layers size={16} /> Projects <ChevronDown size={14} />
          </button>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <button className="hover:bg-black/10 p-2 rounded-full transition-colors relative">
          <Menu size={18} />
        </button>
        <button className="hover:bg-black/10 p-2 rounded-full transition-colors relative">
          <Bell size={18} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-[#2ECC71]"></span>
        </button>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center overflow-hidden border border-white/30 ml-2">
          <User size={16} />
        </div>
        <div className="hidden md:block text-sm mr-2">
          <div className="font-semibold leading-tight">Admin User</div>
          <div className="text-[10px] text-white/80 uppercase">System Manager</div>
        </div>
        <button className="hover:bg-black/10 p-2 rounded transition-colors ml-2"><Menu size={20} /></button>
      </div>
    </div>
  );
}

function Sidebar() {
  const location = useLocation();
  
  const navGroups = [
    {
      title: 'MENU',
      items: [
        { name: 'Dashboards', path: '/', icon: LayoutDashboard },
        { name: 'Analytics', path: '/analytics', icon: BarChart3, indent: true },
        { name: 'Commerce', path: '/commerce', icon: ShoppingCart, indent: true },
      ]
    },
    {
      title: 'UI COMPONENTS',
      items: [
        { name: 'System Monitor', path: '/system', icon: Server },
        { name: 'Activity Log', path: '/activity', icon: Activity },
      ]
    },
    {
      title: 'DASHBOARD WIDGETS',
      items: [
        { name: 'Web Chat', path: '/chat', icon: MessageSquare },
        { name: 'Job Monitor', path: '/jobs', icon: Activity },
      ]
    },
    {
      title: 'FORMS',
      items: [
        { name: 'Storage', path: '/storage', icon: Database },
      ]
    }
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col fixed left-0 top-14 z-40 overflow-y-auto pb-20 shadow-sm">
      {navGroups.map((group, idx) => (
        <div key={idx} className="mt-4">
          <div className="px-6 py-2 text-[11px] font-bold text-blue-600/80 uppercase tracking-wider">
            {group.title}
          </div>
          <div className="mt-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "architect-sidebar-link",
                    isActive && "architect-sidebar-link-active",
                    item.indent && "pl-12 text-[13px]"
                  )}
                >
                  {!item.indent && <Icon className="w-[18px] h-[18px] mr-3 opacity-70" />}
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function App() {
  return (
    <Router basename="/monitor">
      <div className="min-h-screen bg-[#F5F6FA] flex flex-col font-['Roboto'] selection:bg-[#2196F3]/30">
        <Topbar />
        <div className="flex flex-1 pt-14">
          <Sidebar />
          <main className="flex-1 ml-64 p-6 overflow-y-auto">
            <div className="max-w-[1400px] mx-auto">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/jobs" element={<JobMonitor />} />
                <Route path="/storage" element={<Storage />} />
                <Route path="/activity" element={<ActivityLog />} />
                <Route path="/system" element={<SystemMonitor />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/chat" element={<Chatbot />} />
                <Route path="/commerce" element={<div className="architect-card p-8"><h2 className="text-xl font-bold">Commerce Dashboard</h2><p className="text-gray-500 mt-2">Example layout placeholder.</p></div>} />
                <Route path="/settings" element={<div className="architect-card p-8"><h2 className="text-xl font-bold">Settings</h2><p className="text-gray-500 mt-2">Pengaturan sistem.</p></div>} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;
