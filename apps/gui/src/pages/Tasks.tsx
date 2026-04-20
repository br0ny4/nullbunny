import { useState } from 'react';
import { Play, Pause, Trash2, Plus } from 'lucide-react';
import { Routes, Route, useNavigate } from 'react-router-dom';

export default function Tasks() {
  const [tasks] = useState([
    { id: 'scan-1718294400', name: 'Local Ollama Test', type: 'LLM', status: 'running', progress: 45 },
    { id: 'scan-1718294300', name: 'Prod Web Scan', type: 'Web', status: 'completed', progress: 100 },
  ]);
  const navigate = useNavigate();

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
                    <h3 className="text-xl font-bold text-white">{task.name}</h3>
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
                    <button className="p-2 bg-surface hover:bg-danger/20 text-danger rounded-lg border border-border hover:border-danger transition-colors">
                      <Pause className="w-5 h-5" />
                    </button>
                  ) : (
                    <button className="p-2 bg-surface hover:bg-primary/20 text-primary rounded-lg border border-border hover:border-primary transition-colors">
                      <Play className="w-5 h-5" />
                    </button>
                  )}
                  <button className="p-2 bg-surface hover:bg-danger/20 text-danger rounded-lg border border-border hover:border-danger transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        } />
        <Route path="new" element={
          <div className="glass p-8 rounded-xl border border-border">
            <h3 className="text-2xl font-bold text-white mb-6">新建扫描 (New Scan)</h3>
            <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); navigate('/tasks'); }}>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-textMuted uppercase tracking-wider">扫描类型 (Scan Type)</label>
                <select className="w-full bg-surface border border-border rounded-lg p-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all">
                  <option>LLM Red Teaming Scan</option>
                  <option>Web Vulnerability Scan</option>
                  <option>Infrastructure Reconnaissance</option>
                </select>
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-textMuted uppercase tracking-wider">目标 (Target)</label>
                <input type="text" placeholder="http://127.0.0.1:8000 or example.com" className="w-full bg-surface border border-border rounded-lg p-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono" />
              </div>

              <div className="pt-6 border-t border-border flex justify-end gap-4">
                <button type="button" onClick={() => navigate('/tasks')} className="px-6 py-2 bg-surface text-white rounded-lg hover:bg-surfaceHover border border-border transition-colors">
                  取消 (Cancel)
                </button>
                <button type="submit" className="px-6 py-2 bg-primary hover:bg-primaryHover text-black font-bold rounded-lg shadow-[0_0_15px_rgba(0,255,0,0.4)] transition-all">
                  启动扫描 (Start Scan)
                </button>
              </div>
            </form>
          </div>
        } />
      </Routes>
    </div>
  );
}