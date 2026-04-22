import { useEffect, useMemo, useState } from 'react';
import { Play, Pause, Trash2, Plus, ChevronRight } from 'lucide-react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import TaskDetail from './TaskDetail';
import { useTasksStore } from '../store/tasks';

export default function Tasks() {
  const navigate = useNavigate();
  const tasks = useTasksStore((s) => s.tasks);
  const fetchTasks = useTasksStore((s) => s.fetchTasks);
  const stopTask = useTasksStore((s) => s.stopTask);
  const deleteTask = useTasksStore((s) => s.deleteTask);

  useEffect(() => {
    void fetchTasks();
    const id = setInterval(() => void fetchTasks(), 4000);
    return () => clearInterval(id);
  }, [fetchTasks]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-white">任务中心 Tasks</h2>
        <button onClick={() => navigate('/tasks/new')} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primaryHover text-black font-semibold rounded-lg shadow-lg glow transition-all">
          <Plus className="w-5 h-5" />
          新建任务 (New Task)
        </button>
      </div>

      <Routes>
        <Route path="/" element={
          <div className="grid grid-cols-1 gap-4">
            {tasks.map(task => (
              <div key={task.id} className="glass p-6 rounded-xl border border-border flex items-center justify-between group hover:border-primary/50 transition-all">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <button onClick={() => navigate(`/tasks/${task.id}`)} className="text-left">
                      <h3 className="text-xl font-bold text-white inline-flex items-center gap-2 hover:text-primary transition-colors">
                        {task.name}
                        <ChevronRight className="w-5 h-5 text-textMuted group-hover:text-primary transition-colors" />
                      </h3>
                    </button>
                    <span className="px-2 py-0.5 bg-surface border border-border text-xs rounded text-textMuted uppercase tracking-wide">{task.type}</span>
                    <span className={`px-2 py-0.5 border text-xs rounded uppercase tracking-wide font-bold ${
                      task.status === 'running' ? 'bg-primary/20 text-primary border-primary glow' :
                      task.status === 'completed' ? 'bg-surface border-border text-textMuted' : ''
                    }`}>{task.status}</span>
                  </div>
                  <p className="font-mono text-sm text-textMuted mb-4">{task.id}</p>
                  
                  <div className="w-full bg-surface rounded-full h-2.5 overflow-hidden">
                    <div className="bg-primary h-2.5 rounded-full shadow-[0_0_10px_rgba(0,255,0,0.5)] transition-all duration-500" style={{ width: `${task.progress}%` }}></div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 ml-8 opacity-50 group-hover:opacity-100 transition-opacity">
                  {task.status === 'running' ? (
                    <button onClick={() => void stopTask(task.id)} className="p-2 bg-surface hover:bg-danger/20 text-danger rounded-lg border border-border hover:border-danger transition-colors">
                      <Pause className="w-5 h-5" />
                    </button>
                  ) : (
                    <button onClick={() => navigate(`/tasks/${task.id}`)} className="p-2 bg-surface hover:bg-primary/20 text-primary rounded-lg border border-border hover:border-primary transition-colors">
                      <Play className="w-5 h-5" />
                    </button>
                  )}
                  <button onClick={() => void deleteTask(task.id)} className="p-2 bg-surface hover:bg-danger/20 text-danger rounded-lg border border-border hover:border-danger transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        } />
        <Route path="new" element={
          <NewTaskForm />
        } />
        <Route path=":id" element={<TaskDetail />} />
      </Routes>
    </div>
  );
}

function NewTaskForm() {
  const navigate = useNavigate();
  const createTask = useTasksStore((s) => s.createTask);
  const [name, setName] = useState('');
  const [type, setType] = useState<'llm' | 'web-vuln' | 'recon'>('llm');
  const [configPath, setConfigPath] = useState('./examples/basic-ollama/scan.json');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const placeholder = useMemo(() => {
    if (type === 'llm') return './examples/basic-ollama/scan.json';
    if (type === 'web-vuln') return './examples/web-vuln-scan/scan.json';
    return './reports/recon.json';
  }, [type]);

  return (
    <div className="glass p-8 rounded-xl border border-border">
      <h3 className="text-2xl font-bold text-white mb-6">新建扫描 (New Scan)</h3>
      <form
        className="space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          setError(null);
          try {
            const task = await createTask({ name: name.trim() || undefined, type, configPath: configPath.trim() });
            navigate(`/tasks/${task.id}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create task');
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-textMuted uppercase tracking-wider">任务名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：PR 安全门禁 / Web API 漏洞扫描"
              className="w-full bg-surface border border-border rounded-lg p-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-textMuted uppercase tracking-wider">扫描类型 (Scan Type)</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full bg-surface border border-border rounded-lg p-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            >
              <option value="llm">LLM 安全扫描 (scan run)</option>
              <option value="web-vuln">Web 漏洞扫描 (web vuln-scan)</option>
              <option value="recon">资产发现 (recon scan)</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-textMuted uppercase tracking-wider">配置路径 (Config Path)</label>
          <input
            type="text"
            value={configPath}
            onChange={(e) => setConfigPath(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-surface border border-border rounded-lg p-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
          />
          <div className="text-xs text-textMuted">
            支持相对路径（相对于项目根目录），例如 examples 下的 scan.json 或 web-vuln-scan 配置。
          </div>
        </div>

        {error ? (
          <div className="border border-danger/40 bg-danger/10 text-danger rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        ) : null}

        <div className="pt-6 border-t border-border flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/tasks')}
            className="px-6 py-2 bg-surface text-white rounded-lg hover:bg-surfaceHover border border-border transition-colors"
          >
            取消 (Cancel)
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-primary hover:bg-primaryHover text-black font-bold rounded-lg shadow-[0_0_15px_rgba(0,255,0,0.4)] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? '启动中...' : '启动扫描 (Start Scan)'}
          </button>
        </div>
      </form>
    </div>
  )
}
