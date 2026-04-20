import { FileText, Download, Eye } from 'lucide-react';

export default function Reports() {
  const reports = [
    { id: 'scan-1718294400', date: '2024-06-13 14:00', type: 'LLM Scan', critical: 2, high: 5, medium: 12 },
    { id: 'scan-1718294300', date: '2024-06-13 13:50', type: 'Web Scan', critical: 0, high: 1, medium: 4 },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight text-white mb-8">报告中心 Reports</h2>
      
      <div className="grid grid-cols-1 gap-6">
        {reports.map(report => (
          <div key={report.id} className="glass p-6 rounded-xl border border-border hover:border-secondary/50 transition-all flex flex-col md:flex-row items-center justify-between gap-6 group">
            
            <div className="flex items-center gap-4">
              <div className="p-4 bg-surface rounded-full border border-border group-hover:glow-purple transition-all duration-300">
                <FileText className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                  {report.id}
                  <span className="text-xs px-2 py-1 bg-surface border border-border text-textMuted rounded uppercase tracking-wider">{report.type}</span>
                </h3>
                <p className="text-sm text-textMuted font-mono mt-1">{report.date}</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex flex-col items-center justify-center p-3 bg-surface rounded-lg border border-border min-w-[80px]">
                <span className="text-xs text-textMuted font-bold uppercase tracking-wider mb-1">Critical</span>
                <span className={`text-xl font-bold font-mono ${report.critical > 0 ? 'text-danger glow' : 'text-textMuted'}`}>{report.critical}</span>
              </div>
              <div className="flex flex-col items-center justify-center p-3 bg-surface rounded-lg border border-border min-w-[80px]">
                <span className="text-xs text-textMuted font-bold uppercase tracking-wider mb-1">High</span>
                <span className={`text-xl font-bold font-mono ${report.high > 0 ? 'text-warning glow' : 'text-textMuted'}`}>{report.high}</span>
              </div>
              <div className="flex flex-col items-center justify-center p-3 bg-surface rounded-lg border border-border min-w-[80px]">
                <span className="text-xs text-textMuted font-bold uppercase tracking-wider mb-1">Medium</span>
                <span className="text-xl font-bold font-mono text-blue-400">{report.medium}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-secondary/20 text-secondary border border-border hover:border-secondary rounded-lg transition-colors font-medium">
                <Eye className="w-4 h-4" />
                View Details
              </button>
              <button className="p-2 bg-surface hover:bg-primary/20 text-primary border border-border hover:border-primary rounded-lg transition-colors">
                <Download className="w-5 h-5" />
              </button>
            </div>
            
          </div>
        ))}
      </div>
    </div>
  );
}