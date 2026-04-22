import { useEffect, useMemo, useState } from 'react';
import { FileText, Download, Eye, X } from 'lucide-react';

type ReportEntry = {
  id: string;
  path: string;
  size: number;
  createdAt: string;
};

export default function Reports() {
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openContent, setOpenContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setError(null);
      try {
        const res = await fetch('/api/reports');
        const data = (await res.json()) as ReportEntry[];
        setReports(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load reports');
      }
    };
    void run();
  }, []);

  const pretty = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
    return { fmt };
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight text-white mb-8">报告中心 Reports</h2>
      
      <div className="grid grid-cols-1 gap-6">
        {error ? (
          <div className="border border-danger/40 bg-danger/10 text-danger rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        ) : null}

        {reports.map(report => (
          <div key={report.id} className="glass p-6 rounded-xl border border-border hover:border-secondary/50 transition-all flex flex-col md:flex-row items-center justify-between gap-6 group">
            
            <div className="flex items-center gap-4">
              <div className="p-4 bg-surface rounded-full border border-border group-hover:glow-purple transition-all duration-300">
                <FileText className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                  {report.id}
                  <span className="text-xs px-2 py-1 bg-surface border border-border text-textMuted rounded uppercase tracking-wider">
                    {report.id.endsWith('.sarif.json') ? 'SARIF' : report.id.endsWith('.md') ? 'MARKDOWN' : 'JSON'}
                  </span>
                </h3>
                <p className="text-sm text-textMuted font-mono mt-1">
                  {pretty.fmt.format(new Date(report.createdAt))} · {(report.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  setLoading(true);
                  setOpenId(report.id);
                  setOpenContent('');
                  try {
                    const res = await fetch(`/api/reports/${encodeURIComponent(report.id)}/text`);
                    const data = (await res.json()) as { content: string };
                    setOpenContent(data.content ?? '');
                  } catch (e) {
                    setOpenContent(e instanceof Error ? e.message : 'Failed to load report');
                  } finally {
                    setLoading(false);
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-secondary/20 text-secondary border border-border hover:border-secondary rounded-lg transition-colors font-medium"
              >
                <Eye className="w-4 h-4" />
                查看内容
              </button>
              <a
                href={`/api/reports/${encodeURIComponent(report.id)}/download`}
                className="p-2 bg-surface hover:bg-primary/20 text-primary border border-border hover:border-primary rounded-lg transition-colors"
              >
                <Download className="w-5 h-5" />
              </a>
            </div>
            
          </div>
        ))}
      </div>

      {openId ? (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="glass rounded-xl border border-border w-full max-w-5xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-sm text-textMuted uppercase tracking-wider">报告内容</div>
                <div className="mt-1 font-mono text-sm text-white break-all">{openId}</div>
              </div>
              <button
                onClick={() => {
                  setOpenId(null);
                  setOpenContent('');
                }}
                className="p-2 bg-surface hover:bg-surfaceHover text-text rounded-lg border border-border transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="h-[70vh] overflow-auto bg-[#0b0b0b]">
              <pre className="m-0 px-6 py-4 text-xs leading-5 text-text font-mono whitespace-pre-wrap break-words">
                {loading ? 'Loading...' : openContent}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
