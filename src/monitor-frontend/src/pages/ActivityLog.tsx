import { useEffect, useState } from 'react';
import { socket } from '../socket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';

export default function ActivityLog() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    socket.on('activity_log', (data) => {
      setLogs(prev => [data, ...prev].slice(0, 100)); // Keep last 100
    });
    socket.emit('get_activities');
    return () => {
      socket.off('activity_log');
    };
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Activity Log</h2>
      <Card>
        <CardHeader>
          <CardTitle>Recent Activities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {format(new Date(log.time), 'HH:mm:ss')}
                    </td>
                    <td className="px-4 py-3 font-medium">{log.user}</td>
                    <td className="px-4 py-3">{log.action}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold
                        ${log.status === 'Success' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={log.details}>
                      {log.details || '-'}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No recent activities.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
