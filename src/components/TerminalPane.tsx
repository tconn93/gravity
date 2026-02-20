import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TerminalPolicy } from '../types'

interface TerminalPaneProps {
  sessionId: string
  cwd: string
  policy: TerminalPolicy
  isActive: boolean
  onExited: () => void
}

const XTERM_THEME = {
  background: '#1e1e1e',
  foreground: '#cccccc',
  cursor: '#aeafad',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  black: '#1e1e1e',
  red: '#f44747',
  green: '#4ec9b0',
  yellow: '#dcdcaa',
  blue: '#569cd6',
  magenta: '#c586c0',
  cyan: '#9cdcfe',
  white: '#d4d4d4',
  brightBlack: '#808080',
  brightRed: '#f44747',
  brightGreen: '#4ec9b0',
  brightYellow: '#dcdcaa',
  brightBlue: '#569cd6',
  brightMagenta: '#c586c0',
  brightCyan: '#9cdcfe',
  brightWhite: '#f8f8f8'
}

export default function TerminalPane({
  sessionId,
  policy,
  isActive,
  onExited
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const policyRef = useRef(policy)
  const inputBufferRef = useRef('')
  const [pendingCommand, setPendingCommand] = useState<string | null>(null)
  const pendingCommandRef = useRef<string | null>(null)

  // Keep policyRef current so the onData closure always sees latest policy
  useEffect(() => { policyRef.current = policy }, [policy])
  useEffect(() => { pendingCommandRef.current = pendingCommand }, [pendingCommand])

  const sendToTerminal = useCallback((data: string) => {
    window.electronAPI.terminal.write(sessionId, data)
  }, [sessionId])

  const approveCommand = useCallback(() => {
    const cmd = pendingCommandRef.current
    if (cmd === null) return
    sendToTerminal(cmd + '\r')
    inputBufferRef.current = ''
    setPendingCommand(null)
  }, [sendToTerminal])

  const rejectCommand = useCallback(() => {
    if (pendingCommandRef.current === null) return
    // Send Ctrl+C to cancel, clear local echo
    sendToTerminal('\x03')
    termRef.current?.write('\r\n')
    inputBufferRef.current = ''
    setPendingCommand(null)
  }, [sendToTerminal])

  // Keyboard shortcut for review actions
  useEffect(() => {
    if (!isActive || pendingCommand === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); approveCommand() }
      if (e.key === 'Escape') { e.preventDefault(); rejectCommand() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isActive, pendingCommand, approveCommand, rejectCommand])

  // Mount xterm + connect PTY
  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: XTERM_THEME,
      fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      allowTransparency: false,
      scrollback: 5000
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitAddonRef.current = fitAddon

    // PTY → xterm
    const unsubData = window.electronAPI.terminal.onData(sessionId, data => {
      term.write(data)
    })

    const unsubExit = window.electronAPI.terminal.onExit(sessionId, () => {
      term.write('\r\n\x1b[2m[Process exited]\x1b[0m\r\n')
      onExited()
    })

    // xterm input → PTY (with policy gate)
    const disposeInput = term.onData(data => {
      if (policyRef.current === 'turbo') {
        // Turbo: straight pass-through
        window.electronAPI.terminal.write(sessionId, data)
        return
      }

      // Review mode: intercept Enter, pass everything else
      if (data === '\r') {
        // Hold the command for review — don't send \r yet
        const cmd = inputBufferRef.current
        setPendingCommand(cmd)
        inputBufferRef.current = ''
      } else if (data === '\x7f' || data === '\b') {
        // Backspace: update local buffer (PTY handles the visual echo)
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1)
        }
        window.electronAPI.terminal.write(sessionId, data)
      } else if (data.charCodeAt(0) < 32) {
        // Control characters (Ctrl+C, Ctrl+L, Ctrl+D…): pass through directly
        inputBufferRef.current = ''
        window.electronAPI.terminal.write(sessionId, data)
      } else {
        // Printable chars: track in buffer, let PTY echo
        inputBufferRef.current += data
        window.electronAPI.terminal.write(sessionId, data)
      }
    })

    return () => {
      disposeInput.dispose()
      unsubData()
      unsubExit()
      term.dispose()
    }
  }, [sessionId, onExited])

  // Fit on resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      if (!fitAddonRef.current || !termRef.current) return
      fitAddonRef.current.fit()
      const { cols, rows } = termRef.current
      window.electronAPI.terminal.resize(sessionId, cols, rows)
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [sessionId])

  // Fit + focus when tab becomes active
  useEffect(() => {
    if (!isActive) return
    const timer = setTimeout(() => {
      fitAddonRef.current?.fit()
      termRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [isActive])

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%', padding: '4px 0' }} />

      {/* Review mode pending command bar */}
      {policy === 'review' && pendingCommand !== null && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#252526',
            borderTop: '1px solid #f0a500',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            zIndex: 10
          }}
        >
          <span style={{ color: '#f0a500', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
            REVIEW
          </span>
          <code
            style={{
              flex: 1,
              color: '#cccccc',
              fontSize: 12,
              fontFamily: 'Menlo, Monaco, Consolas, monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {pendingCommand || '(empty)'}
          </code>
          <button
            onClick={approveCommand}
            style={{
              padding: '3px 10px',
              background: '#0e7afe',
              color: '#fff',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              whiteSpace: 'nowrap'
            }}
            title="Run command (Cmd/Ctrl+Enter)"
          >
            Run
          </button>
          <button
            onClick={rejectCommand}
            style={{
              padding: '3px 10px',
              background: 'var(--bg-active)',
              color: 'var(--text-secondary)',
              borderRadius: 4,
              fontSize: 12,
              whiteSpace: 'nowrap'
            }}
            title="Reject (Escape)"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}
