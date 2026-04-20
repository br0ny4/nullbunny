import { Save, ShieldCheck } from 'lucide-react';

export default function Settings() {
  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-3xl font-bold tracking-tight text-white mb-8">系统设置 Settings</h2>
      
      <div className="glass p-8 rounded-xl border border-border">
        <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
          <ShieldCheck className="w-6 h-6 text-primary glow" />
          <h3 className="text-xl font-bold text-white uppercase tracking-wider">LLM Providers</h3>
        </div>

        <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-textMuted uppercase tracking-wider">Ollama Base URL</label>
              <input type="text" defaultValue="http://127.0.0.1:11434" className="w-full bg-surface border border-border rounded-lg p-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono" />
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-textMuted uppercase tracking-wider">Gemini API Key</label>
              <input type="password" placeholder="AIzaSy..." className="w-full bg-surface border border-border rounded-lg p-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono" />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-textMuted uppercase tracking-wider">Anthropic API Key</label>
              <input type="password" placeholder="sk-ant-..." className="w-full bg-surface border border-border rounded-lg p-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono" />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-textMuted uppercase tracking-wider">DeepSeek API Key</label>
              <input type="password" placeholder="sk-..." className="w-full bg-surface border border-border rounded-lg p-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono" />
            </div>
            
            <div className="col-span-1 md:col-span-2 p-6 bg-surface/50 border border-border rounded-lg space-y-4">
              <h4 className="text-lg font-bold text-white">Azure OpenAI</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-textMuted uppercase tracking-wider">Base URL</label>
                  <input type="text" placeholder="https://resource.openai.azure.com" className="w-full bg-surface border border-border rounded-lg p-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono" />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-textMuted uppercase tracking-wider">API Key</label>
                  <input type="password" placeholder="Azure API Key" className="w-full bg-surface border border-border rounded-lg p-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono" />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-border flex justify-end">
            <button type="submit" className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primaryHover text-black font-bold rounded-lg shadow-[0_0_15px_rgba(0,255,0,0.4)] transition-all">
              <Save className="w-5 h-5" />
              保存配置 (Save Configuration)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}