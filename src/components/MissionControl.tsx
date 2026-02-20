import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {
  AgentRole,
  AgentConfig,
  AgentListItem,
  AgentSession,
  Artifact,
  OutputEntry,
  SpawnConfig
} from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_ICONS: Record<AgentRole, string> = {
  architect: '📐',
  developer: '💻',
  validator: '✅',
  custom: '🔧'
}

const PHASE_COLORS: Record<string, string> = {
  plan: '#569cd6',
  act: '#4ec9b0',
  verify: '#ce9178',
  report: '#dcdcaa',
  done: '#6a9955'
}

const STATUS_COLORS: Record<string, string> = {
  running: '#4ec9b0',
  done: '#6a9955',
  error: '#f44747',
  cancelled: '#808080'
}

const INPUT_STYLE: React.CSSProperties = {
  padding: '6px 10px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
  fontFamily: 'inherit'
}

const BTN_PRIMARY: React.CSSProperties = {
  padding: '6px 14px',
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  flexShrink: 0
}

const BTN_GHOST: React.CSSProperties = {
  padding: '3px 8px',
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  fontSize: 11,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  flexShrink: 0
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function Markdown({ content }: { content: string }) {
  return (
    <div className="md" style={{ color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.6 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

// ─── ApiKeyPrompt ─────────────────────────────────────────────────────────────

function ApiKeyPrompt({ onSave }: { onSave: (key: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
        No <code>XAI_API_KEY</code> found. Enter your xAI API key to enable agents.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="password"
          placeholder="xai-..."
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onSave(value.trim()) }}
          style={{ ...INPUT_STYLE, flex: 1 }}
          autoFocus
        />
        <button onClick={() => { if (value.trim()) onSave(value.trim()) }} style={BTN_PRIMARY}>
          Save
        </button>
      </div>
    </div>
  )
}

// ─── SpawnForm ────────────────────────────────────────────────────────────────

function SpawnForm({
  workspacePath,
  defaultModel,
  onSpawn,
  onCancel
}: {
  workspacePath: string | null
  defaultModel: string
  onSpawn: (config: SpawnConfig) => void
  onCancel?: () => void
}) {
  const [role, setRole] = useState<AgentRole>('developer')
  const [model, setModel] = useState(defaultModel)
  const [prompt, setPrompt] = useState('')

  useEffect(() => { setModel(defaultModel) }, [defaultModel])

  const canSubmit = prompt.trim().length > 0 && !!workspacePath

  const handleSubmit = () => {
    if (!canSubmit) return
    onSpawn({ role, model: model.trim() || defaultModel, prompt: prompt.trim(), workspacePath: workspacePath! })
    setPrompt('')
  }

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          value={role}
          onChange={e => setRole(e.target.value as AgentRole)}
          style={{ ...INPUT_STYLE, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
        >
          {(['architect', 'developer', 'validator', 'custom'] as AgentRole[]).map(r => (
            <option key={r} value={r}>{ROLE_ICONS[r]} {r}</option>
          ))}
        </select>
        <input
          value={model}
          onChange={e => setModel(e.target.value)}
          style={{ ...INPUT_STYLE, width: 170, padding: '4px 8px', fontSize: 11 }}
        />
        {!workspacePath && <span style={{ color: '#f44747', fontSize: 11 }}>Open a folder first</span>}
        {onCancel && (
          <button onClick={onCancel} style={{ ...BTN_GHOST, marginLeft: 'auto' }}>Cancel</button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSubmit() } }}
          placeholder="Describe what the agent should do… (Cmd+Enter to spawn)"
          rows={2}
          style={{ ...INPUT_STYLE, flex: 1, resize: 'none' }}
          autoFocus
        />
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{ ...BTN_PRIMARY, background: canSubmit ? 'var(--accent)' : 'var(--bg-tertiary)', color: canSubmit ? '#fff' : 'var(--text-secondary)', cursor: canSubmit ? 'pointer' : 'not-allowed' }}
        >
          Spawn Agent
        </button>
      </div>
    </div>
  )
}

// ─── ChatInput ────────────────────────────────────────────────────────────────

function ChatInput({
  session,
  onSend,
  onNewAgent
}: {
  session: AgentSession | null
  onSend: (message: string) => void
  onNewAgent: () => void
}) {
  const [message, setMessage] = useState('')
  const isRunning = session?.status === 'running'
  const canSend = !!session && message.trim().length > 0 && !isRunning

  const handleSend = () => {
    if (!canSend) return
    onSend(message.trim())
    setMessage('')
  }

  return (
    <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {session
            ? `${ROLE_ICONS[session.role]} ${session.role} #${session.id} · ${isRunning ? '⏳ thinking…' : session.status}`
            : 'No session selected'}
        </span>
        <button onClick={onNewAgent} style={BTN_GHOST}>+ Spawn New Agent</button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSend() } }}
          disabled={!session || isRunning}
          placeholder={
            !session ? 'Select a session to continue chatting'
            : isRunning ? 'Agent is thinking…'
            : 'Continue the conversation… (Cmd+Enter to send)'
          }
          rows={2}
          style={{ ...INPUT_STYLE, flex: 1, resize: 'none', opacity: (!session || isRunning) ? 0.5 : 1 }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{ ...BTN_PRIMARY, background: canSend ? 'var(--accent)' : 'var(--bg-tertiary)', color: canSend ? '#fff' : 'var(--text-secondary)', cursor: canSend ? 'pointer' : 'not-allowed' }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ─── AgentCard ────────────────────────────────────────────────────────────────

function AgentCard({ item, isSelected, onClick, onCancel }: {
  item: AgentListItem; isSelected: boolean; onClick: () => void; onCancel: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isSelected ? 'var(--bg-secondary)' : 'transparent', display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
          {ROLE_ICONS[item.role]} {item.role}
          <span style={{ marginLeft: 8, fontFamily: 'monospace', color: 'var(--text-secondary)', fontWeight: 400 }}>#{item.id}</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: PHASE_COLORS[item.phase] ?? 'var(--text-secondary)', fontFamily: 'monospace' }}>{item.phase}</span>
          <span style={{ fontSize: 10, color: STATUS_COLORS[item.status] ?? 'var(--text-secondary)' }}>
            {item.status === 'running' ? '⏳' : item.status === 'done' ? '✓' : item.status === 'error' ? '✗' : '○'}
          </span>
          {item.status === 'running' && (
            <button
              onClick={e => { e.stopPropagation(); onCancel() }}
              style={{ padding: '1px 5px', fontSize: 10, background: 'transparent', color: '#f44747', border: '1px solid #f44747', borderRadius: 3, cursor: 'pointer' }}
            >stop</button>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.prompt}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', gap: 10 }}>
        <span>{item.model}</span>
        {item.artifactCount > 0 && <span>📎 {item.artifactCount}</span>}
      </div>
    </div>
  )
}

// ─── ToolBlock (collapsed by default) ────────────────────────────────────────

function ToolBlock({ entry }: { entry: OutputEntry }) {
  const [expanded, setExpanded] = useState(false)
  const isCall = entry.type === 'tool_call'
  const isError = !!entry.isError
  const color = isCall ? '#569cd6' : isError ? '#f44747' : '#4ec9b0'
  const bg = isCall ? 'rgba(86,156,214,0.07)' : isError ? 'rgba(244,71,71,0.07)' : 'rgba(78,201,176,0.07)'
  const icon = isCall ? '⚙' : isError ? '✗' : '✓'

  // Summary: first non-empty line of content, truncated
  const firstLine = entry.content.split('\n').find(l => l.trim()) ?? ''
  const summary = firstLine.length > 90 ? firstLine.slice(0, 90) + '…' : firstLine

  return (
    <div style={{ margin: '3px 0', background: bg, borderLeft: `2px solid ${color}`, borderRadius: 2, overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ fontSize: 10, color, fontFamily: 'monospace', flexShrink: 0 }}>{icon} {entry.toolName}</span>
        {!expanded && summary && (
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {summary}
          </span>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 'auto', flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>
      {expanded && (
        <pre style={{ margin: 0, padding: '2px 8px 6px', fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', borderTop: `1px solid ${color}20` }}>
          {entry.content}
        </pre>
      )}
    </div>
  )
}

// ─── OutputLine ───────────────────────────────────────────────────────────────

function OutputLine({ entry }: { entry: OutputEntry }) {
  if (entry.type === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0 4px' }}>
        <div style={{
          maxWidth: '85%',
          padding: '7px 12px',
          background: 'var(--accent)',
          borderRadius: '12px 12px 3px 12px',
          fontSize: 12
        }}>
          <div className="md" style={{ color: '#fff', fontSize: 12, lineHeight: 1.6 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
          </div>
        </div>
      </div>
    )
  }

  if (entry.type === 'text') {
    return (
      <div style={{ margin: '6px 0' }}>
        <Markdown content={entry.content} />
      </div>
    )
  }

  if (entry.type === 'tool_call' || entry.type === 'tool_result') {
    return <ToolBlock entry={entry} />
  }

  if (entry.type === 'phase_change') {
    return (
      <div style={{ margin: '10px 0', textAlign: 'center', fontSize: 10, color: PHASE_COLORS[entry.content] ?? 'var(--text-secondary)', letterSpacing: 2, textTransform: 'uppercase' }}>
        ── {entry.content} ──
      </div>
    )
  }

  // 'system' — used for any other internal messages
  if (entry.type === 'system') {
    return (
      <div style={{ margin: '4px 0', fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
        {entry.content}
      </div>
    )
  }

  return null
}

// ─── ArtifactViewer ───────────────────────────────────────────────────────────

function ArtifactViewer({ artifact }: { artifact: Artifact }) {
  const [open, setOpen] = useState(false)
  const typeIcon = artifact.type === 'task_list' ? '📋' : artifact.type === 'implementation_plan' ? '📝' : '📖'
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{ padding: '5px 10px', background: 'var(--bg-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 500 }}>
          {typeIcon} {artifact.title}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '10px 12px', background: 'var(--bg-primary)', maxHeight: 320, overflow: 'auto' }}>
          <Markdown content={artifact.content} />
        </div>
      )}
    </div>
  )
}

// ─── ArtifactsSection (collapsible) ──────────────────────────────────────────

function ArtifactsSection({ artifacts }: { artifacts: Artifact[] }) {
  const [expanded, setExpanded] = useState(true)
  if (artifacts.length === 0) return null

  return (
    <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      {expanded ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Artifacts ({artifacts.length})
            </span>
            <button onClick={() => setExpanded(false)} style={BTN_GHOST}>Show less</button>
          </div>
          {artifacts.map(a => <ArtifactViewer key={a.id} artifact={a} />)}
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            This session has {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}
          </span>
          <button onClick={() => setExpanded(true)} style={BTN_GHOST}>View all</button>
        </div>
      )}
    </div>
  )
}

// ─── SessionDetail ────────────────────────────────────────────────────────────

function SessionDetail({ session, streaming }: { session: AgentSession; streaming: string }) {
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [session.output.length, streaming])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{ROLE_ICONS[session.role]} {session.role} #{session.id}</span>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: PHASE_COLORS[session.phase] ?? 'var(--text-secondary)' }}>{session.phase}</span>
        <span style={{ fontSize: 11, color: STATUS_COLORS[session.status] ?? 'var(--text-secondary)' }}>{session.status}</span>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 'auto' }}>{session.model}</span>
      </div>

      {/* Artifacts — collapsible section */}
      <ArtifactsSection artifacts={session.artifacts} />

      {/* Output stream */}
      <div ref={outputRef} style={{ flex: 1, overflow: 'auto', padding: '10px 14px', minHeight: 0 }}>
        {session.output.map((entry, i) => <OutputLine key={i} entry={entry} />)}
        {streaming && (
          <div style={{ margin: '6px 0' }}>
            <Markdown content={streaming} />
            <span style={{ opacity: 0.5, fontSize: 12 }}>▋</span>
          </div>
        )}
        {session.error && (
          <div style={{ color: '#f44747', fontSize: 12, marginTop: 8 }}>Error: {session.error}</div>
        )}
      </div>
    </div>
  )
}

// ─── MissionControl ───────────────────────────────────────────────────────────

export default function MissionControl({ workspacePath }: { workspacePath: string | null }) {
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [session, setSession] = useState<AgentSession | null>(null)
  const [streamingText, setStreamingText] = useState<Record<string, string>>({})
  const [bottomMode, setBottomMode] = useState<'chat' | 'spawn'>('spawn')

  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId

  const api = window.electronAPI?.agent

  // Load config on mount
  useEffect(() => {
    api?.getConfig().then(setConfig)
  }, [api])

  const handleSaveKey = async (key: string) => {
    await api?.setApiKey(key)
    const cfg = await api?.getConfig()
    if (cfg) setConfig(cfg)
  }

  // Agent list polling
  const refreshList = useCallback(async () => {
    const list = await api?.list()
    if (list) setAgents(list)
  }, [api])

  useEffect(() => {
    refreshList()
    const t = setInterval(refreshList, 1500)
    return () => clearInterval(t)
  }, [refreshList])

  // Streaming updates — registered once, ref for selectedId avoids stale closures
  useEffect(() => {
    if (!api) return
    return api.onUpdate((agentId, update) => {
      if (update.type === 'text_stream') {
        setStreamingText(prev => ({ ...prev, [agentId]: (prev[agentId] ?? '') + update.content }))
      } else if (update.type === 'done' || update.type === 'error') {
        setStreamingText(prev => { const n = { ...prev }; delete n[agentId]; return n })
        if (agentId === selectedIdRef.current) {
          api.getSession(agentId).then(s => { if (s) setSession(s) })
        }
        refreshList()
      } else {
        if (agentId === selectedIdRef.current) {
          api.getSession(agentId).then(s => { if (s) setSession(s) })
        }
      }
    })
  }, [api, refreshList])

  // Load session detail on selection change
  useEffect(() => {
    if (!selectedId) { setSession(null); return }
    api?.getSession(selectedId).then(s => { if (s) setSession(s) })
  }, [api, selectedId])

  // Keep session live while running
  useEffect(() => {
    if (!selectedId || !api) return
    if (agents.find(a => a.id === selectedId)?.status !== 'running') return
    const t = setInterval(() => {
      api.getSession(selectedId).then(s => { if (s) setSession(s) })
    }, 500)
    return () => clearInterval(t)
  }, [api, selectedId, agents])

  // Actions
  const handleSelectSession = (id: string) => {
    setSelectedId(id)
    setBottomMode('chat')
  }

  const handleSpawn = async (cfg: SpawnConfig) => {
    const result = await api?.spawn(cfg)
    if (!result) return
    if ('error' in result) { alert(result.error); return }
    setSelectedId(result.id)
    setBottomMode('chat')
    await refreshList()
  }

  const handleContinue = async (message: string) => {
    if (!selectedId) return
    const result = await api?.continueSession(selectedId, message)
    if (result && 'error' in result) { alert(result.error); return }
    await refreshList()
    api?.getSession(selectedId).then(s => { if (s) setSession(s) })
  }

  const handleCancel = async (id: string) => {
    await api?.cancel(id)
    await refreshList()
  }

  // Render
  if (!config) {
    return <div style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 12 }}>Loading…</div>
  }
  if (!config.hasApiKey) {
    return <ApiKeyPrompt onSave={handleSaveKey} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Main area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* Left: agent list */}
        <div style={{ width: 220, minWidth: 220, borderRight: '1px solid var(--border)', overflow: 'auto', flexShrink: 0 }}>
          {agents.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--text-secondary)', fontSize: 12 }}>No agents yet.</div>
          ) : (
            agents.slice().reverse().map(a => (
              <AgentCard
                key={a.id}
                item={a}
                isSelected={a.id === selectedId}
                onClick={() => handleSelectSession(a.id)}
                onCancel={() => handleCancel(a.id)}
              />
            ))
          )}
        </div>

        {/* Right: session detail */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {session ? (
            <SessionDetail session={session} streaming={streamingText[session.id] ?? ''} />
          ) : (
            <div style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 12 }}>
              {agents.length > 0 ? 'Select a session to view its output.' : 'Spawn an agent to get started.'}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: ChatInput or SpawnForm */}
      {bottomMode === 'chat' ? (
        <ChatInput session={session} onSend={handleContinue} onNewAgent={() => setBottomMode('spawn')} />
      ) : (
        <SpawnForm
          workspacePath={workspacePath}
          defaultModel={config.defaultModel}
          onSpawn={handleSpawn}
          onCancel={agents.length > 0 ? () => setBottomMode('chat') : undefined}
        />
      )}
    </div>
  )
}
