import { useEffect, useState } from 'react';
import { socket } from '../socket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';

export default function JobMonitor() {
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    socket.on('job_update', (data) => {
      setJobs(data);
    });
    socket.emit('get_jobs');
    return () => {
      socket.off('job_update');
    };
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Job Monitor</h2>
      <Card>
        <CardHeader>
          <CardTitle>Active & Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3">Job ID</th>
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3">Started At</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3 font-medium">{job.id}</td>
                    <td className="px-4 py-3">{job.template}</td>
                    <td className="px-4 py-3">{job.user}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold
                        ${job.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 
                          job.status === 'failed' ? 'bg-rose-100 text-rose-700' : 
                          'bg-blue-100 text-blue-700'}`}>
                        {job.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <div className="w-full bg-slate-200 rounded-full h-2.5">
                          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${job.progress}%` }}></div>
                        </div>
                        <span>{job.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{format(new Date(job.startedAt), 'HH:mm:ss')}</td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No active jobs.
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
