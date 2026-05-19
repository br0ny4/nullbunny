import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Cpu, HardDrive, Plus, ShieldAlert } from 'lucide-react';
import type { Task } from '../store/tasks';

const DashboardPerformanceChart = React.lazy(() => import('./DashboardPerformanceChart'));

type HistoryPoint = {
  time: string;
  cpu: number;
  memory: number;
};

const TASK_TYPE_LABELS: Record<string, string> = {
  llm: 'LLM Scan',
  'web-vuln': 'Web漏洞扫描',
  recon: '信息收集',
  providers: '供应商测试',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  stopped: '已停止',
};

const STATUS_CLASS: Record<string, string> = {
  completed: 'bg-primary/20 text-primary',
  failed: 'bg-danger/20 text-danger',
  running: 'bg-warning/20 text-warning',
  pending: 'bg-textMuted/20 text-textMuted',
  stopped: 'bg-textMuted/20 text-textMuted',
};

export default function Dashboard() {
  const [stats, setStats] = useState({
    cpu: 0,
    memory: 0,
    tasks: 0,
    vulns: 0
  });

  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, tasksRes] = await Promise.all([
          fetch('/api/sys/stats'),
          fetch('/api/tasks'),
        ]);
        const data = await statsRes.json();
        const taskList: Task[] = await tasksRes.json();

        setStats(prev => ({
          ...prev,
          cpu: typeof data.cpuUsage === 'number' ? data.cpuUsage : prev.cpu,
          memory: typeof data.memoryUsage?.heapUsed === 'number' ? (data.memoryUsage.heapUsed / 1024 / 1024) : prev.memory,
          tasks: typeof data.activeTasks === 'number' ? data.activeTasks : prev.tasks,
        }));

        setTasks(Array.isArray(taskList) ? taskList.slice(0, 10) : []);

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

    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-white">仪表盘 Overview</h2>
        <Link
          to="/tasks/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primaryHover text-black font-semibold rounded-lg shadow-lg glow transition-all"
        >
          <Plus className="w-5 h-5" />
          新建扫描
        </Link>
      </div>
      
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
            <React.Suspense fallback={<div className="text-sm text-textMuted">加载图表中...</div>}>
              <DashboardPerformanceChart history={history} />
            </React.Suspense>
          </div>
        </div>
        
        <div className="glass p-6 rounded-xl border border-border">
          <h3 className="text-xl font-semibold mb-6">最近活动 (Recent Activity)</h3>
          <div className="space-y-4">
            {tasks.length === 0 ? (
              <p className="text-sm text-textMuted">暂无扫描任务</p>
            ) : (
              tasks.map((task) => (
                <Link
                  key={task.id}
                  to={`/tasks/${task.id}`}
                  className="flex items-center justify-between p-4 bg-surface rounded-lg hover:border-primary/50 border border-transparent transition-all block"
                >
                  <div>
                    <p className="font-medium text-white">{task.name}</p>
                    <p className="text-sm text-textMuted">{TASK_TYPE_LABELS[task.type] ?? task.type}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_CLASS[task.status] ?? 'bg-textMuted/20 text-textMuted'}`}>
                    {STATUS_LABELS[task.status] ?? task.status}
                  </span>
                </Link>
              ))
            )}
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
