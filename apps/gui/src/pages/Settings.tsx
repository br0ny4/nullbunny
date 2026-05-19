import { useEffect, useState } from 'react';
import { Save, ShieldCheck } from 'lucide-react';

type SettingsData = Record<string, string>;

const DEFAULT_PLACEHOLDERS: Record<string, string> = {
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  geminiApiKey: 'AIzaSy...',
  anthropicApiKey: 'sk-ant-...',
  deepseekApiKey: 'sk-...',
  groqApiKey: 'gsk_...',
  siliconflowApiKey: 'sk-...',
  mistralApiKey: 'mistral-...',
  cohereApiKey: 'cohere-...',
  azureOpenAIBaseUrl: 'https://resource.openai.azure.com',
  azureOpenAIApiKey: 'Azure API Key',
};

const FIELDS: { key: string; label: string; type: 'text' | 'password' }[] = [
  { key: 'ollamaBaseUrl', label: 'Ollama Base URL', type: 'text' },
  { key: 'geminiApiKey', label: 'Gemini API Key', type: 'password' },
  { key: 'anthropicApiKey', label: 'Anthropic API Key', type: 'password' },
  { key: 'deepseekApiKey', label: 'DeepSeek API Key', type: 'password' },
  { key: 'groqApiKey', label: 'Groq API Key', type: 'password' },
  { key: 'siliconflowApiKey', label: 'SiliconFlow API Key', type: 'password' },
  { key: 'mistralApiKey', label: 'Mistral API Key', type: 'password' },
  { key: 'cohereApiKey', label: 'Cohere API Key', type: 'password' },
  { key: 'azureOpenAIBaseUrl', label: 'Azure OpenAI Base URL', type: 'text' },
  { key: 'azureOpenAIApiKey', label: 'Azure OpenAI API Key', type: 'password' },
];

export default function Settings() {
  const [values, setValues] = useState<SettingsData>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        const initial: SettingsData = {};
        for (const field of FIELDS) {
          initial[field.key] = typeof data[field.key] === 'string' ? data[field.key] : '';
        }
        setValues(initial);
      } catch (err) {
        console.error(err);
      } finally {
        setLoaded(true);
      }
    };
    void load();
  }, []);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Save failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-3xl font-bold tracking-tight text-white mb-8">系统设置 Settings</h2>

      <div className="glass p-8 rounded-xl border border-border">
        <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
          <ShieldCheck className="w-6 h-6 text-primary glow" />
          <h3 className="text-xl font-bold text-white uppercase tracking-wider">LLM Providers</h3>
        </div>

        <form className="space-y-8" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {FIELDS.filter((f) => f.key !== 'azureOpenAIBaseUrl' && f.key !== 'azureOpenAIApiKey').map((field) => (
              <div key={field.key} className="space-y-2">
                <label htmlFor={`settings-${field.key}`} className="block text-sm font-medium text-textMuted uppercase tracking-wider">{field.label}</label>
                <input
                  id={`settings-${field.key}`}
                  type={field.type}
                  value={loaded ? values[field.key] ?? '' : ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  placeholder={DEFAULT_PLACEHOLDERS[field.key]}
                  className="w-full bg-surface border border-border rounded-lg p-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
                />
              </div>
            ))}

            <div className="col-span-1 md:col-span-2 p-6 bg-surface/50 border border-border rounded-lg space-y-4">
              <h4 className="text-lg font-bold text-white">Azure OpenAI</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="settings-azureOpenAIBaseUrl" className="block text-sm font-medium text-textMuted uppercase tracking-wider">Base URL</label>
                  <input
                    id="settings-azureOpenAIBaseUrl"
                    type="text"
                    value={loaded ? values.azureOpenAIBaseUrl ?? '' : ''}
                    onChange={(e) => handleChange('azureOpenAIBaseUrl', e.target.value)}
                    placeholder={DEFAULT_PLACEHOLDERS.azureOpenAIBaseUrl}
                    className="w-full bg-surface border border-border rounded-lg p-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="settings-azureOpenAIApiKey" className="block text-sm font-medium text-textMuted uppercase tracking-wider">API Key</label>
                  <input
                    id="settings-azureOpenAIApiKey"
                    type="password"
                    value={loaded ? values.azureOpenAIApiKey ?? '' : ''}
                    onChange={(e) => handleChange('azureOpenAIApiKey', e.target.value)}
                    placeholder={DEFAULT_PLACEHOLDERS.azureOpenAIApiKey}
                    className="w-full bg-surface border border-border rounded-lg p-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <div className="border border-danger/40 bg-danger/10 text-danger rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          ) : null}

          <div className="pt-6 border-t border-border flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primaryHover text-black font-bold rounded-lg shadow-[0_0_15px_rgba(0,255,0,0.4)] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Save className="w-5 h-5" />
              保存配置 (Save Configuration)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
