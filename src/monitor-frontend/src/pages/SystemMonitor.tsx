import { useEffect, useState } from 'react';
import { socket } from '../socket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SystemMonitor() {
  const [systems, setSystems] = useState([
    { name: 'Operating System', value: 'Unknown', status: 'Online' },
    { name: 'NodeJS Version', value: 'Unknown', status: 'Online' },
    { name: 'LibreOffice Status', value: '-', status: 'Warning' },
    { name: 'Redis Status', value: '-', status: 'Warning' },
    { name: 'Database Status', value: '-', status: 'Warning' },
    { name: 'Telegram Bot Status', value: '-', status: 'Warning' },
    { name: 'Gemini API Status', value: '-', status: 'Warning' },
    { name: 'Object Storage Status', value: '-', status: 'Warning' },
  ]);

  const [cacheStats, setCacheStats] = useState<any>(null);
  const [learningStats, setLearningStats] = useState<any>(null);

  useEffect(() => {
    socket.on('system_monitor', (data) => {
      setSystems(data);
    });
    socket.emit('get_system_monitor');

    // Fetch AI Stats
    fetch('/api/cache/stats').then(res => res.json()).then(setCacheStats).catch(console.error);
    fetch('/api/learning/stats').then(res => res.json()).then(setLearningStats).catch(console.error);

    const intervalId = setInterval(() => {
      fetch('/api/cache/stats').then(res => res.json()).then(setCacheStats).catch(console.error);
      fetch('/api/learning/stats').then(res => res.json()).then(setLearningStats).catch(console.error);
    }, 5000);

    return () => {
      socket.off('system_monitor');
      clearInterval(intervalId);
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch(status.toLowerCase()) {
      case 'online': return 'bg-emerald-500';
      case 'warning': return 'bg-amber-500';
      case 'offline': return 'bg-rose-500';
      default: return 'bg-slate-500';
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">System Monitor</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {systems.map((sys, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">{sys.name}</CardTitle>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-slate-500">{sys.status}</span>
                <div className={`w-3 h-3 rounded-full ${getStatusColor(sys.status)} animate-pulse`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-700">{sys.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="pt-6 border-t border-slate-200">
        <h2 className="text-2xl font-bold tracking-tight mb-4">AI Engine Insights</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Smart Cache Hits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{cacheStats?.totalHits || 0}</div>
              <p className="text-xs text-slate-500 mt-1">Saves API calls and latency</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Cache Hit Ratio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-600">{cacheStats?.hitRatio?.toFixed(1) || '0.0'}%</div>
              <p className="text-xs text-slate-500 mt-1">Total Entries: {cacheStats?.totalCacheEntries || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Learning Profiles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{learningStats?.totalLearningData || 0}</div>
              <p className="text-xs text-slate-500 mt-1">User preferences recorded</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Top Template</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600 truncate" title={learningStats?.topTemplate}>{learningStats?.topTemplate || '-'}</div>
              <p className="text-xs text-slate-500 mt-1">Most recommended</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
