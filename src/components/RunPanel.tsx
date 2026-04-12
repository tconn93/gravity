import { useState, useEffect, useCallback } from 'react'
import type { RunConfig } from '../types'

const INPUT: React.CSSProperties = {
  padding: '5px 8px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box'
}

const BTN_PRIMARY: React.CSSProperties = {
  padding: '4px 12px',
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
  fontWeight: 500,
  whiteSpace: 'nowrap'
}

const BTN_GHOST: React.CSSProperties = {
  padding: '3px 8px',
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  fontSize: 11,
  cursor: 'pointer',
  whiteSpace: 'nowrap'
}

function generateId() {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

interface RunPanelProps {
  workspacePath: string | null
  onRun: (config: RunConfig) => void
}

export default function RunPanel({ workspacePath, onRun }: RunPanelProps) {
  const [configs, setConfigs] = useState<RunConfig[]>([])
  const [npmScripts, setNpmScripts] = useState<RunConfig[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<Partial<RunConfig>>({})

  const api = window.electronAPI?.runConfig

  const load = useCallback(async () => {
    if (!workspacePath || !api) return
    const [saved, npm] = await Promise.all([
      api.list(workspacePath),
      api.detectNpm(workspacePath)
    ])
    setConfigs(saved)
    // Only show npm scripts that aren't already saved
    const savedCmds = new Set(saved.map(c => c.command))
    setNpmScripts(npm.filter(n => !savedCmds.has(n.command)))
  }, [workspacePath, api])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!workspacePath || !api || !form.name?.trim() || !form.command?.trim()) return
    const config: RunConfig = {
      id: editingId ?? generateId(),
      name: form.name.trim(),
      command: form.command.trim(),
      cwd: form.cwd?.trim() || undefined,
      env: form.env
    }
    await api.save(workspacePath, config)
    setForm({})
    setShowAdd(false)
    setEditingId(null)
    load()
  }

  const handleDelete = async (id: string) => {
    if (!workspacePath || !api) return
    await api.delete(workspacePath, id)
    load()
  }

  const startEdit = (config: RunConfig) => {
    setEditingId(config.id)
    setForm({ name: config.name, command: config.command, cwd: config.cwd })
    setShowAdd(true)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm({})
    setShowAdd(false)
  }

  if (!workspacePath) {
    return (
      <div style={{ padding: '20px 14px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
        Open a folder to manage run configurations.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>RUN CONFIGURATIONS</span>
        {!showAdd && (
          <button onClick={() => { setShowAdd(true); setEditingId(null); setForm({}) }} style={BTN_PRIMARY}>
            + New
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {showAdd && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <input
            value={form.name ?? ''}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Name (e.g. Dev Server)"
            style={INPUT}
            autoFocus
          />
          <input
            value={form.command ?? ''}
            onChange={e => setForm(f => ({ ...f, command: e.target.value }))}
            placeholder="Command (e.g. npm run dev)"
            style={INPUT}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          />
          <input
            value={form.cwd ?? ''}
            onChange={e => setForm(f => ({ ...f, cwd: e.target.value }))}
            placeholder="Working dir (optional, relative to project root)"
            style={INPUT}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={cancelEdit} style={BTN_GHOST}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={!form.name?.trim() || !form.command?.trim()}
              style={{ ...BTN_PRIMARY, opacity: (!form.name?.trim() || !form.command?.trim()) ? 0.5 : 1 }}
            >
              {editingId ? 'Update' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Config list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {configs.length === 0 && npmScripts.length === 0 && !showAdd && (
          <div style={{ padding: '16px 14px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            No run configurations yet.
            <br />
            <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
              Click <strong>+ New</strong> to add one, or auto-detect from package.json.
            </span>
          </div>
        )}

        {/* Saved configs */}
        {configs.map(config => (
          <RunConfigRow
            key={config.id}
            config={config}
            onRun={() => onRun(config)}
            onEdit={() => startEdit(config)}
            onDelete={() => handleDelete(config.id)}
          />
        ))}

        {/* npm scripts (auto-detected, not yet saved) */}
        {npmScripts.length > 0 && (
          <>
            <div style={{ padding: '5px 10px 3px', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', background: 'var(--bg-tertiary)', borderTop: configs.length > 0 ? '1px solid var(--border)' : 'none', borderBottom: '1px solid var(--border)' }}>
              Detected from package.json
            </div>
            {npmScripts.map(config => (
              <RunConfigRow
                key={config.id}
                config={config}
                onRun={() => onRun(config)}
                onEdit={() => {
                  setEditingId(null)
                  setForm({ name: config.name, command: config.command })
                  setShowAdd(true)
                }}
                isNpm
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ─── RunConfigRow ─────────────────────────────────────────────────────────────

function RunConfigRow({
  config,
  onRun,
  onEdit,
  onDelete,
  isNpm = false
}: {
  config: RunConfig
  onRun: () => void
  onEdit: () => void
  onDelete?: () => void
  isNpm?: boolean
}) {
  return (
    <div
      style={{
        padding: '7px 10px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}
    >
      {/* Play button */}
      <button
        onClick={onRun}
        title={`Run: ${config.command}`}
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: '#4ec9b0',
          color: '#1e1e1e',
          fontSize: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontWeight: 700,
          cursor: 'pointer',
          border: 'none'
        }}
      >
        ▶
      </button>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {config.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
          {config.command}
          {config.cwd ? ` (in ${config.cwd})` : ''}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {isNpm ? (
          <button onClick={onEdit} style={{ ...BTN_GHOST, fontSize: 10, padding: '2px 6px' }} title="Save to run configs">
            Save
          </button>
        ) : (
          <>
            <button onClick={onEdit} style={{ ...BTN_GHOST, fontSize: 10, padding: '2px 6px' }}>Edit</button>
            {onDelete && (
              <button
                onClick={onDelete}
                style={{ ...BTN_GHOST, fontSize: 10, padding: '2px 6px', color: '#f44747', borderColor: '#f4474740' }}
              >
                ✕
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
