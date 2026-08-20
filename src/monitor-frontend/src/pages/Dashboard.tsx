import { useEffect, useState } from 'react';
import { socket } from '../socket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, FileText, Users, Database, AlertCircle, HardDrive, Cpu, Clock } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    today: 0,
    month: 0,
    docx: 0,
    pdf: 0,
    templates: 0,
    users: 0,
    errors: 0,
    storage: '0 MB',
    cpu: '0%',
    ram: '0%',
    uptime: '0s'
  });

  useEffect(() => {
    socket.on('dashboard_stats', (data) => {
      setStats(prev => ({ ...prev, ...data }));
    });
    
    // Request initial stats
    socket.emit('get_dashboard_stats');
    
    return () => {
      socket.off('dashboard_stats');
    };
  }, []);

  const cards = [
    { title: 'Generate Hari Ini', value: stats.today, icon: Activity, color: 'text-blue-500' },
    { title: 'Generate Bulan Ini', value: stats.month, icon: Activity, color: 'text-blue-600' },
    { title: 'Total DOCX', value: stats.docx, icon: FileText, color: 'text-indigo-500' },
    { title: 'Total PDF', value: stats.pdf, icon: FileText, color: 'text-red-500' },
    { title: 'Total Template', value: stats.templates, icon: Database, color: 'text-emerald-500' },
    { title: 'Total User', value: stats.users, icon: Users, color: 'text-orange-500' },
    { title: 'Total Error', value: stats.errors, icon: AlertCircle, color: 'text-rose-500' },
    { title: 'Storage Terpakai', value: stats.storage, icon: HardDrive, color: 'text-slate-500' },
    { title: 'CPU Usage', value: stats.cpu, icon: Cpu, color: 'text-purple-500' },
    { title: 'RAM Usage', value: stats.ram, icon: Database, color: 'text-teal-500' },
    { title: 'Uptime Server', value: stats.uptime, icon: Clock, color: 'text-green-500' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Home Dashboard</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((card, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
