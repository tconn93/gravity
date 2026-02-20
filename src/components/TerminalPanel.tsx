import { useState, useEffect, useCallback, useRef } from 'react'
import TerminalPane from './TerminalPane'
import MissionControl from './MissionControl'
import type { TerminalSession, TerminalPolicy } from '../types'

interface TerminalPanelProps {
  workspacePath: string | null
  isOpen: boolean
  onToggle: () => void
  panelHeight: number
  onPanelResize: (height: number) => void
}

type ActiveView = string | 'agent'

const MIN_HEIGHT = 120
const MAX_HEIGHT = 600
const HEADER_HEIGHT = 35

export default function TerminalPanel({
  workspacePath,
  isOpen,
  onToggle,
  panelHeight,
  onPanelResize
}: TerminalPanelProps) {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [activeView, setActiveView] = useState<ActiveView>('agent')
  const [policy, setPolicy] = useState<TerminalPolicy>('turbo')
  const [sessionCounter, setSessionCounter] = useState(0)
  const isDraggingRef = useRef(false)
  const dragStartYRef = useRef(0)
  const dragStartHeightRef = useRef(0)

  const cwd = workspacePath ?? (typeof process !== 'undefined' ? process.env.HOME ?? '/' : '/')

  const createTerminal = useCallback(async () => {
    const id = await window.electronAPI.terminal.create(cwd)
    const num = sessionCounter + 1
    setSessionCounter(num)
    const session: TerminalSession = { id, label: `bash ${num}`, isAlive: true }
    setSessions(prev => [...prev, session])
    setActiveView(id)
    if (!isOpen) onToggle()
  }, [cwd, sessionCounter, isOpen, onToggle])

  const closeSession = useCallback((id: string) => {
    window.electronAPI.terminal.kill(id)
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id)
      if (activeView === id) {
        setActiveView(next[next.length - 1]?.id ?? 'agent')
      }
      return next
    })
  }, [activeView])

  const markExited = useCallback((id: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, isAlive: false } : s))
  }, [])

  // Listen for native menu "New Terminal"
  useEffect(() => {
    const unsub = window.electronAPI.terminal.onNewTerminal(createTerminal)
    return unsub
  }, [createTerminal])

  // Resize handle drag
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    dragStartYRef.current = e.clientY
    dragStartHeightRef.current = panelHeight

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return
      const delta = dragStartYRef.current - ev.clientY
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragStartHeightRef.current + delta))
      onPanelResize(newHeight)
    }
    const onMouseUp = () => {
      isDraggingRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [panelHeight, onPanelResize])

  const totalHeight = isOpen ? panelHeight : HEADER_HEIGHT

  return (
    <div
      style={{
        height: totalHeight,
        minHeight: totalHeight,
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Drag handle */}
      {isOpen && (
        <div
          onMouseDown={handleDragStart}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            cursor: 'ns-resize',
            zIndex: 20
          }}
        />
      )}

      {/* Header / tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          height: HEADER_HEIGHT,
          minHeight: HEADER_HEIGHT,
          borderBottom: isOpen ? '1px solid var(--border)' : 'none',
          background: 'var(--bg-tertiary)',
          flexShrink: 0,
          userSelect: 'none',
          overflow: 'hidden'
        }}
      >
        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          style={{
            padding: '0 10px',
            color: 'var(--text-secondary)',
            fontSize: 10,
            borderRight: '1px solid var(--border)'
          }}
          title={isOpen ? 'Collapse panel' : 'Expand panel'}
        >
          {isOpen ? '▼' : '▶'}
        </button>

        {/* Terminal session tabs */}
        <div style={{ display: 'flex', alignItems: 'stretch', flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
          {sessions.map(session => {
            const isActive = activeView === session.id
            return (
              <div
                key={session.id}
                onClick={() => setActiveView(session.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 10px',
                  cursor: 'pointer',
                  background: isActive ? 'var(--bg-secondary)' : 'transparent',
                  borderRight: '1px solid var(--border)',
                  fontSize: 'var(--font-size-sm)',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                <span style={{ fontSize: 12 }}>⌨</span>
                <span style={{ opacity: session.isAlive ? 1 : 0.5 }}>{session.label}</span>
                {!session.isAlive && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>✕</span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); closeSession(session.id) }}
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 14,
                    lineHeight: 1,
                    padding: '0 2px',
                    borderRadius: 2,
                    opacity: 0,
                    transition: 'opacity 0.1s'
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0' }}
                  title="Close terminal"
                >
                  ×
                </button>
              </div>
            )
          })}

          {/* New terminal button */}
          <button
            onClick={createTerminal}
            style={{
              padding: '0 10px',
              color: 'var(--text-secondary)',
              fontSize: 16,
              borderRight: '1px solid var(--border)',
              flexShrink: 0
            }}
            title="New Terminal (Ctrl+`)"
          >
            +
          </button>

          {/* Agent Manager tab */}
          <div
            onClick={() => setActiveView('agent')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 12px',
              cursor: 'pointer',
              background: activeView === 'agent' ? 'var(--bg-secondary)' : 'transparent',
              borderRight: '1px solid var(--border)',
              fontSize: 'var(--font-size-sm)',
              color: activeView === 'agent' ? 'var(--text-primary)' : 'var(--text-secondary)',
              flexShrink: 0
            }}
          >
            <span style={{ fontSize: 12 }}>⚡</span>
            <span>Agent Manager</span>
          </div>
        </div>

        {/* Right controls: policy toggle */}
        {isOpen && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', gap: 6, borderLeft: '1px solid var(--border)', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Policy:</span>
            <button
              onClick={() => setPolicy(p => p === 'turbo' ? 'review' : 'turbo')}
              style={{
                padding: '2px 10px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                background: policy === 'turbo' ? '#4ec9b0' : '#f0a500',
                color: '#1e1e1e',
                whiteSpace: 'nowrap'
              }}
              title={policy === 'turbo'
                ? 'Turbo: commands execute immediately. Click to switch to Request Review.'
                : 'Request Review: commands must be approved. Click to switch to Turbo.'}
            >
              {policy === 'turbo' ? '⚡ Turbo' : '🔍 Review'}
            </button>
          </div>
        )}
      </div>

      {/* Panel body */}
      {isOpen && (
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {/* Terminal panes — rendered but hidden when not active to preserve state */}
          {sessions.map(session => (
            <div
              key={session.id}
              style={{
                position: 'absolute',
                inset: 0,
                visibility: activeView === session.id ? 'visible' : 'hidden',
                pointerEvents: activeView === session.id ? 'auto' : 'none'
              }}
            >
              <TerminalPane
                sessionId={session.id}
                cwd={cwd}
                policy={policy}
                isActive={activeView === session.id}
                onExited={() => markExited(session.id)}
              />
            </div>
          ))}

          {/* Mission Control view */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              visibility: activeView === 'agent' ? 'visible' : 'hidden',
              pointerEvents: activeView === 'agent' ? 'auto' : 'none',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <MissionControl workspacePath={workspacePath} />
          </div>
        </div>
      )}
    </div>
  )
}

