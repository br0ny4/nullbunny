import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Cpu, HardDrive, ShieldAlert } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    cpu: 0,
    memory: 0,
    tasks: 0,
    vulns: 0
  });

  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/sys/stats');
        const data = await res.json();
        
        setStats(prev => ({
          ...prev,
          cpu: typeof data.cpuUsage === 'number' ? data.cpuUsage : prev.cpu,
          memory: typeof data.memoryUsage?.heapUsed === 'number' ? (data.memoryUsage.heapUsed / 1024 / 1024) : prev.memory,
          tasks: typeof data.activeTasks === 'number' ? data.activeTasks : prev.tasks,
        }));

        setHistory(prev => {
          const last = prev[prev.length - 1];
          const cpu = typeof data.cpuUsage === 'number' ? data.cpuUsage : last?.cpu ?? 0;
          const memory = typeof data.memoryUsage?.heapUsed === 'number' ? (data.memoryUsage.heapUsed / 1024 / 1024) : last?.memory ?? 0;
          const newHistory = [...prev, { time: new Date().toLocaleTimeString(), cpu, memory }];
          return newHistory.slice(-20);
        });
      } catch (err) {
        console.error(err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight text-white mb-8">仪表盘 Overview</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="活跃任务" value={stats.tasks} icon={<Activity className="text-primary" />} />
        <StatCard title="高危漏洞" value={stats.vulns} icon={<ShieldAlert className="text-danger" />} />
        <StatCard title="CPU 占用" value={`${Math.round(stats.cpu)}%`} icon={<Cpu className="text-secondary" />} />
        <StatCard title="内存使用" value={`${Math.round(stats.memory)} MB`} icon={<HardDrive className="text-warning" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="glass p-6 rounded-xl border border-border">
          <h3 className="text-xl font-semibold mb-6">性能趋势 (Performance)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#888" fontSize={12} />
                <YAxis stroke="#888" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: '#121212', borderColor: '#333' }} />
                <Line type="monotone" dataKey="cpu" stroke="#00FF00" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="memory" stroke="#B026FF" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="glass p-6 rounded-xl border border-border">
          <h3 className="text-xl font-semibold mb-6">最近活动 (Recent Activity)</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-surface rounded-lg">
              <div>
                <p className="font-medium text-white">LLM Security Scan</p>
                <p className="text-sm text-textMuted">Target: local-model</p>
              </div>
              <span className="px-3 py-1 bg-primary/20 text-primary rounded-full text-xs font-bold glow">Completed</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-surface rounded-lg">
              <div>
                <p className="font-medium text-white">Web Vulnerability Scan</p>
                <p className="text-sm text-textMuted">Target: example.com</p>
              </div>
              <span className="px-3 py-1 bg-danger/20 text-danger rounded-full text-xs font-bold">Failed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: string | number, icon: React.ReactNode }) {
  return (
    <div className="glass p-6 rounded-xl border border-border hover:border-primary/50 transition-colors group">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-textMuted text-sm font-medium uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-bold text-white mt-2 font-mono group-hover:glow transition-all duration-300">{value}</p>
        </div>
        <div className="p-3 bg-surface rounded-lg border border-border">
          {icon}
        </div>
      </div>
    </div>
  );
}
