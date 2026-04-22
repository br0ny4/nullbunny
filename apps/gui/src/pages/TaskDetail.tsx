import { useEffect, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, CircleX, Loader2, Square } from 'lucide-react'
import { useTasksStore } from '../store/tasks'

function statusBadge(status: string) {
  if (status === 'running') {
    return { label: 'RUNNING', className: 'bg-primary/20 text-primary border-primary glow', icon: Loader2 }
  }
  if (status === 'completed') {
    return { label: 'COMPLETED', className: 'bg-primary/10 text-primary border-primary/40', icon: CheckCircle2 }
  }
  if (status === 'failed') {
    return { label: 'FAILED', className: 'bg-danger/20 text-danger border-danger', icon: CircleX }
  }
  if (status === 'stopped') {
    return { label: 'STOPPED', className: 'bg-warning/20 text-warning border-warning', icon: Square }
  }
  return { label: 'PENDING', className: 'bg-surface text-textMuted border-border', icon: AlertTriangle }
}

export default function TaskDetail() {
  const { id } = useParams()
  const fetchTask = useTasksStore((s) => s.fetchTask)
  const subscribeTask = useTasksStore((s) => s.subscribeTask)
  const stopTask = useTasksStore((s) => s.stopTask)
  const task = useTasksStore((s) => (id ? s.taskById[id] : undefined))
  const logs = useTasksStore((s) => (id ? s.logsById[id] : undefined))
  const logRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!id) return
    void fetchTask(id)
    const unsub = subscribeTask(id)
    return () => unsub()
  }, [id, fetchTask, subscribeTask])

  useEffect(() => {
    if (!logRef.current) return
    logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs?.length])

  const badge = useMemo(() => statusBadge(task?.status ?? 'pending'), [task?.status])
  const StatusIcon = badge.icon

  if (!id) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">任务详情</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm text-textMuted">{id}</span>
            <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded border text-xs font-bold uppercase tracking-wide ${badge.className}`}>
              <StatusIcon className={`w-4 h-4 ${task?.status === 'running' ? 'animate-spin' : ''}`} />
              {badge.label}
            </span>
            <span className="px-2 py-1 bg-surface border border-border text-xs rounded text-textMuted uppercase tracking-wide">
              {task?.type ?? 'unknown'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => id && void stopTask(id)}
            disabled={task?.status !== 'running'}
            className="px-4 py-2 bg-danger/20 text-danger rounded-lg border border-danger/40 hover:border-danger disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            停止任务
          </button>
        </div>
      </div>

      <div className="glass p-6 rounded-xl border border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-textMuted uppercase tracking-wider">进度</div>
          <div className="font-mono text-sm text-textMuted">{Math.round(task?.progress ?? 0)}%</div>
        </div>
        <div className="w-full bg-surface rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-primary h-2.5 rounded-full shadow-[0_0_10px_rgba(0,255,0,0.5)] transition-all duration-500"
            style={{ width: `${Math.max(0, Math.min(100, task?.progress ?? 0))}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-surface/60 border border-border rounded-lg p-4">
            <div className="text-textMuted uppercase tracking-wider text-xs">配置</div>
            <div className="mt-2 font-mono text-white break-all">{task?.configPath ?? '-'}</div>
          </div>
          <div className="bg-surface/60 border border-border rounded-lg p-4">
            <div className="text-textMuted uppercase tracking-wider text-xs">输出</div>
            <div className="mt-2 font-mono text-white break-all">{task?.outputPath ?? '-'}</div>
          </div>
          <div className="bg-surface/60 border border-border rounded-lg p-4">
            <div className="text-textMuted uppercase tracking-wider text-xs">退出码</div>
            <div className="mt-2 font-mono text-white">{task?.exitCode ?? '-'}</div>
          </div>
        </div>
      </div>

      <div className="glass rounded-xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="text-sm text-textMuted uppercase tracking-wider">实时日志</div>
          <div className="font-mono text-xs text-textMuted">{(logs?.length ?? 0).toLocaleString()} lines</div>
        </div>
        <div ref={logRef} className="h-[420px] overflow-auto scrollbar-hide bg-[#0b0b0b]">
          <pre className="m-0 px-6 py-4 text-xs leading-5 text-text font-mono whitespace-pre-wrap break-words">
            {(logs ?? []).join('\n')}
          </pre>
        </div>
      </div>
    </div>
  )
}

