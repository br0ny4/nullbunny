import { create } from 'zustand'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped'
export type TaskType = 'llm' | 'web-vuln' | 'recon' | 'providers'

export type TaskLogLine = { ts: number; line: string }

export type Task = {
  id: string
  name: string
  type: TaskType
  status: TaskStatus
  progress: number
  createdAt: string
  updatedAt: string
  configPath?: string
  outputPath?: string
  exitCode?: number
  logs?: TaskLogLine[]
}

type CreateTaskInput = {
  name?: string
  type: TaskType
  configPath: string
}

type TaskEvent =
  | { type: 'task'; task: Task }
  | { type: 'log'; line: string }
  | { type: 'done'; exitCode: number }

type WsEvent =
  | ({ taskId: string } & TaskEvent)
  | { type: 'hello'; mode: 'all' | 'task' }

type TasksState = {
  tasks: Task[]
  taskById: Record<string, Task | undefined>
  logsById: Record<string, string[]>
  _ws?: WebSocket
  _wsSubs?: Set<string>
  _wsConnecting: boolean
  fetchTasks: () => Promise<void>
  fetchTask: (id: string) => Promise<void>
  createTask: (input: CreateTaskInput) => Promise<Task>
  deleteTask: (id: string) => Promise<void>
  stopTask: (id: string) => Promise<void>
  subscribeTask: (id: string) => () => void
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  taskById: {},
  logsById: {},
  _ws: undefined as unknown as WebSocket | undefined,
  _wsSubs: undefined as unknown as Set<string> | undefined,
  _wsConnecting: false as unknown as boolean,
  async fetchTasks() {
    const res = await fetch('/api/tasks')
    const data = (await res.json()) as Task[]
    set({
      tasks: data,
      taskById: Object.fromEntries(data.map((t) => [t.id, t])),
    })
  },
  async fetchTask(id) {
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`)
    const task = (await res.json()) as Task
    set((state) => ({
      taskById: { ...state.taskById, [id]: task },
      tasks: state.tasks.some((t) => t.id === id)
        ? state.tasks.map((t) => (t.id === id ? task : t))
        : [task, ...state.tasks],
      logsById: task.logs
        ? { ...state.logsById, [id]: task.logs.map((l) => l.line) }
        : state.logsById,
    }))
  },
  async createTask(input) {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      throw new Error(error?.error ?? 'Failed to create task')
    }
    const task = (await res.json()) as Task
    set((state) => ({
      tasks: [task, ...state.tasks],
      taskById: { ...state.taskById, [task.id]: task },
      logsById: { ...state.logsById, [task.id]: [] },
    }))
    return task
  },
  async deleteTask(id) {
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      throw new Error(error?.error ?? 'Failed to delete task')
    }
    set((state) => {
      const { [id]: _, ...rest } = state.taskById
      const { [id]: __, ...restLogs } = state.logsById
      return {
        tasks: state.tasks.filter((t) => t.id !== id),
        taskById: rest,
        logsById: restLogs,
      }
    })
  },
  async stopTask(id) {
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}/stop`, { method: 'POST' })
    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      throw new Error(error?.error ?? 'Failed to stop task')
    }
    await get().fetchTask(id)
  },
  subscribeTask(id) {
    const ensureSocket = () => {
      const state: any = get()
      const subs: Set<string> = state._wsSubs ?? new Set<string>()
      if (!state._wsSubs) {
        set({ _wsSubs: subs } as any)
      }

      if (state._ws && state._ws.readyState === WebSocket.OPEN) {
        return state._ws as WebSocket
      }
      if (state._wsConnecting) {
        return state._ws as WebSocket | undefined
      }

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws`)
      set({ _ws: ws, _wsConnecting: true } as any)

      ws.onopen = () => {
        set({ _wsConnecting: false } as any)
        ws.send(JSON.stringify({ type: 'subscribeAll' }))
        for (const taskId of subs) {
          ws.send(JSON.stringify({ type: 'subscribe', taskId }))
        }
      }

      ws.onmessage = (e) => {
        let msg: WsEvent | undefined
        try {
          msg = JSON.parse(e.data) as WsEvent
        } catch {
          msg = undefined
        }
        if (!msg || typeof msg !== 'object') return
        if ('taskId' in msg && typeof (msg as any).taskId === 'string') {
          const taskId = (msg as any).taskId as string
          if (msg.type === 'task') {
            const payload = msg as any as { taskId: string; type: 'task'; task: Task }
            set((state) => ({
              taskById: { ...state.taskById, [taskId]: payload.task },
              tasks: state.tasks.some((t) => t.id === taskId)
                ? state.tasks.map((t) => (t.id === taskId ? payload.task : t))
                : [payload.task, ...state.tasks],
            }))
          } else if (msg.type === 'log') {
            const payload = msg as any as { taskId: string; type: 'log'; line: string }
            set((state) => ({
              logsById: {
                ...state.logsById,
                [taskId]: [...(state.logsById[taskId] ?? []), payload.line].slice(-2000),
              },
            }))
          } else if (msg.type === 'done') {
            void get().fetchTask(taskId)
          }
        }
      }

      ws.onclose = () => {
        set({ _ws: undefined, _wsConnecting: false } as any)
        setTimeout(() => ensureSocket(), 800)
      }

      return ws
    }

    const state: any = get()
    const subs: Set<string> = state._wsSubs ?? new Set<string>()
    subs.add(id)
    set({ _wsSubs: subs } as any)

    const ws = ensureSocket()
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', taskId: id }))
    }

    return () => {
      const next: any = get()
      const s: Set<string> = next._wsSubs ?? new Set<string>()
      s.delete(id)
      set({ _wsSubs: s } as any)
      const w: WebSocket | undefined = next._ws
      if (w && w.readyState === WebSocket.OPEN) {
        w.send(JSON.stringify({ type: 'unsubscribe', taskId: id }))
      }
    }
  },
}))
