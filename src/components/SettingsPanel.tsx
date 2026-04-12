import { useState, useEffect, useCallback } from 'react'
import type { GravitySettings, Provider } from '../types'

const PROVIDERS: { id: Provider; label: string; placeholder: string }[] = [
  { id: 'xai', label: 'xAI (Grok)', placeholder: 'xai-...' },
  { id: 'anthropic', label: 'Anthropic (Claude)', placeholder: 'sk-ant-...' },
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { id: 'gemini', label: 'Google Gemini', placeholder: 'AIza...' },
  { id: 'deepseek', label: 'DeepSeek', placeholder: 'sk-...' },
  { id: 'ollama', label: 'Ollama (local — no key needed)', placeholder: '' }
]

const DEFAULT_MODELS: Record<Provider, string[]> = {
  xai: ['grok-code-fast-1', 'grok-3-fast', 'grok-3'],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-1.5-pro'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  ollama: ['llama3.3', 'qwen2.5-coder', 'mistral']
}

const INPUT_STYLE: React.CSSProperties = {
  padding: '6px 10px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box'
}

const BTN_PRIMARY: React.CSSProperties = {
  padding: '7px 18px',
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontSize: 13,
  cursor: 'pointer',
  fontWeight: 500
}

const BTN_GHOST: React.CSSProperties = {
  padding: '5px 12px',
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer'
}

interface SettingsPanelProps {
  onClose: () => void
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<GravitySettings | null>(null)
  const [testStates, setTestStates] = useState<Partial<Record<Provider, 'idle' | 'testing' | 'ok' | 'fail'>>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.electronAPI?.settings?.get().then(s => setSettings(s))
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const updateProvider = (provider: Provider, key: string) => {
    if (!settings) return
    setSettings({
      ...settings,
      providers: { ...settings.providers, [provider]: key }
    })
    setTestStates(prev => ({ ...prev, [provider]: 'idle' }))
  }

  const testProvider = async (provider: Provider) => {
    setTestStates(prev => ({ ...prev, [provider]: 'testing' }))
    try {
      const key = settings?.providers[provider] ?? ''
      const result = await window.electronAPI?.editorAI?.command('Say hello in one word', '')
      setTestStates(prev => ({ ...prev, [provider]: result && !result.startsWith('// Error') ? 'ok' : 'fail' }))
    } catch {
      setTestStates(prev => ({ ...prev, [provider]: 'fail' }))
    }
  }

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await window.electronAPI?.settings?.set(settings)
      // Also update individual provider keys
      for (const [provider, key] of Object.entries(settings.providers)) {
        if (key) {
          await window.electronAPI?.agent?.setProviderKey(provider as Provider, key)
        }
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return (
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={onClose}
      >
        <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
          Loading…
        </div>
      </div>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60, overflow: 'auto' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          width: 560,
          maxHeight: '80vh',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Settings</span>
          <button onClick={onClose} style={{ ...BTN_GHOST, padding: '2px 8px' }}>✕</button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* API Keys */}
          <section>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
              API Keys
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PROVIDERS.map(({ id, label, placeholder }) => (
                <div key={id}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{label}</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {id === 'ollama' ? (
                      <input
                        type="text"
                        value="(no key needed)"
                        disabled
                        style={{ ...INPUT_STYLE, opacity: 0.4, cursor: 'not-allowed' }}
                      />
                    ) : (
                      <input
                        type="password"
                        placeholder={placeholder}
                        value={settings.providers[id] ?? ''}
                        onChange={e => updateProvider(id, e.target.value)}
                        style={INPUT_STYLE}
                        autoComplete="off"
                      />
                    )}
                    {id !== 'ollama' && (
                      <button
                        onClick={() => testProvider(id)}
                        disabled={testStates[id] === 'testing'}
                        style={{
                          ...BTN_GHOST,
                          flexShrink: 0,
                          color: testStates[id] === 'ok' ? '#4ec9b0' : testStates[id] === 'fail' ? '#f44747' : 'var(--text-secondary)'
                        }}
                      >
                        {testStates[id] === 'testing' ? '…' : testStates[id] === 'ok' ? '✓' : testStates[id] === 'fail' ? '✗' : 'Test'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Default Provider & Model */}
          <section>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
              Default Provider & Model
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Default Provider</label>
                <select
                  value={settings.defaultProvider}
                  onChange={e => setSettings({ ...settings, defaultProvider: e.target.value as Provider, defaultModel: DEFAULT_MODELS[e.target.value as Provider][0] })}
                  style={{ ...INPUT_STYLE }}
                >
                  {PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Default Model</label>
                <select
                  value={DEFAULT_MODELS[settings.defaultProvider].includes(settings.defaultModel) ? settings.defaultModel : 'custom'}
                  onChange={e => { if (e.target.value !== 'custom') setSettings({ ...settings, defaultModel: e.target.value }) }}
                  style={{ ...INPUT_STYLE }}
                >
                  {DEFAULT_MODELS[settings.defaultProvider].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Editor */}
          <section>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
              Editor
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.aiCompletionEnabled}
                onChange={e => setSettings({ ...settings, aiCompletionEnabled: e.target.checked })}
                style={{ width: 16, height: 16 }}
              />
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>Enable AI Tab Completion</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Inline suggestions as you type (debounced 800ms)</div>
              </div>
            </label>
          </section>

          {/* Terminal */}
          <section>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
              Terminal
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Default Policy</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['turbo', 'review'] as const).map(policy => (
                  <button
                    key={policy}
                    onClick={() => setSettings({ ...settings, terminalPolicy: policy })}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 500,
                      background: settings.terminalPolicy === policy ? 'var(--accent)' : 'var(--bg-tertiary)',
                      color: settings.terminalPolicy === policy ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${settings.terminalPolicy === policy ? 'var(--accent)' : 'var(--border)'}`,
                      cursor: 'pointer'
                    }}
                  >
                    {policy === 'turbo' ? 'Turbo (auto-execute)' : 'Review (approval required)'}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} style={BTN_GHOST}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...BTN_PRIMARY, opacity: saving ? 0.6 : 1 }}
          >
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
