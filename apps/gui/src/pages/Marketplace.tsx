import { useEffect, useState } from 'react'
import { Package, ToggleLeft, ToggleRight } from 'lucide-react'

type PluginEntry = {
  path: string
  id: string
  label: string
  attacks: number
  judges: number
}

type PluginsResponse = {
  enabledPaths: string[]
  available: PluginEntry[]
  sources: string[]
}

export default function Marketplace() {
  const [data, setData] = useState<PluginsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = async () => {
    setError(null)
    try {
      const res = await fetch('/api/plugins')
      const json = (await res.json()) as PluginsResponse
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plugins')
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const enabled = new Set(data?.enabledPaths ?? [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">扩展市场 Marketplace</h2>
          <div className="mt-2 text-sm text-textMuted">
            从本地 manifest 扫描可用插件，并维护启用/禁用状态（后续可用于 GUI 启动扫描时自动注入 bridge.manifestPaths）。
          </div>
        </div>
        <div className="p-3 bg-surface rounded-lg border border-border">
          <Package className="w-6 h-6 text-secondary" />
        </div>
      </div>

      {error ? (
        <div className="border border-danger/40 bg-danger/10 text-danger rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {data ? (
        <div className="glass p-6 rounded-xl border border-border">
          <div className="text-xs text-textMuted uppercase tracking-wider">扫描源</div>
          <div className="mt-2 font-mono text-xs text-textMuted break-all">
            {(data.sources ?? []).join('\n')}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4">
        {(data?.available ?? []).map((p) => {
          const isEnabled = enabled.has(p.path)
          return (
            <div key={p.path} className="glass p-6 rounded-xl border border-border hover:border-secondary/50 transition-all">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <div className="text-xl font-bold text-white">{p.label}</div>
                  <div className="mt-1 font-mono text-xs text-textMuted break-all">{p.id}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    <span className="px-2 py-1 bg-surface border border-border rounded text-textMuted uppercase tracking-wider">
                      attacks: {p.attacks}
                    </span>
                    <span className="px-2 py-1 bg-surface border border-border rounded text-textMuted uppercase tracking-wider">
                      judges: {p.judges}
                    </span>
                  </div>
                  <div className="mt-3 font-mono text-xs text-textMuted break-all">{p.path}</div>
                </div>

                <button
                  disabled={busy === p.path}
                  onClick={async () => {
                    setBusy(p.path)
                    try {
                      await fetch(isEnabled ? '/api/plugins/disable' : '/api/plugins/enable', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ path: p.path }),
                      })
                      await refresh()
                    } finally {
                      setBusy(null)
                    }
                  }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors font-medium ${
                    isEnabled
                      ? 'bg-primary/15 text-primary border-primary/40 hover:border-primary glow'
                      : 'bg-surface text-textMuted border-border hover:border-secondary/60 hover:text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  {isEnabled ? '已启用' : '未启用'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

