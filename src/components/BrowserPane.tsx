import { useState, useRef, useEffect, useCallback } from 'react'
import type { WebviewElement, IpcResult, McpConnectionConfig, McpConnection } from '../types'

// ─── Layout constants ─────────────────────────────────────────────────────────

const TOOLBAR_H = 38
const STATUS_H = 28

// ─── Types ────────────────────────────────────────────────────────────────────

type BrowserView = 'live' | 'playwright' | 'connections'
type PlaywrightState = 'idle' | 'launching' | 'active' | 'error'
type McpState = 'stopped' | 'starting' | 'running' | 'error'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeUrl(raw: string): string {
  const s = raw.trim()
  if (!s) return 'about:blank'
  if (s.startsWith('about:') || s.startsWith('file:')) return s
  if (/^https?:\/\//i.test(s)) return s
  if (s.includes('.') && !s.includes(' ')) return `https://${s}`
  return `https://www.google.com/search?q=${encodeURIComponent(s)}`
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + '…' : str
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavButton({
  onClick,
  disabled = false,
  title,
  children
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '0 8px',
        height: '100%',
        color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
        fontSize: 14,
        cursor: disabled ? 'default' : 'pointer',
        borderRadius: 4,
        transition: 'background 0.1s'
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-active)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      {children}
    </button>
  )
}

// ─── MCP Connections Panel ───────────────────────────────────────────────────

function ConnectionsPanel() {
  const [connections, setConnections] = useState<McpConnection[]>([])
  const [newName, setNewName] = useState('')
  const [newCommand, setNewCommand] = useState('')
  const [newArgs, setNewArgs] = useState('')
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(false)

  const INPUT = {
    padding: '5px 8px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text-primary)',
    fontSize: 12,
    outline: 'none',
    fontFamily: 'inherit'
  } as React.CSSProperties

  const refreshConnections = useCallback(async () => {
    const list = await window.electronAPI?.browser?.mcp?.listConnections?.()
    if (list) setConnections(list)
  }, [])

  useEffect(() => {
    refreshConnections()
    const t = setInterval(refreshConnections, 2000)
    return () => clearInterval(t)
  }, [refreshConnections])

  const handleAdd = async () => {
    if (!newName.trim() || !newCommand.trim()) return
    setLoading(true)
    try {
      const cfg: McpConnectionConfig = {
        name: newName.trim(),
        command: newCommand.trim(),
        args: newArgs.trim() ? newArgs.trim().split(' ').filter(Boolean) : undefined
      }
      await window.electronAPI?.browser?.mcp?.addConnection?.(cfg)
      setNewName('')
      setNewCommand('')
      setNewArgs('')
      setAdding(false)
      await refreshConnections()
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (name: string) => {
    await window.electronAPI?.browser?.mcp?.removeConnection?.(name)
    await refreshConnections()
  }

  const statusColor = (status: McpConnection['status']) => {
    if (status === 'running') return '#4ec9b0'
    if (status === 'starting') return '#dcdcaa'
    if (status === 'error') return '#f44747'
    return 'var(--text-muted)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>External MCP Connections</span>
        <button
          onClick={() => setAdding(v => !v)}
          style={{ padding: '3px 10px', fontSize: 11, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          + Add
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Name (e.g. supabase)"
              style={{ ...INPUT, flex: 1 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={newCommand}
              onChange={e => setNewCommand(e.target.value)}
              placeholder="Command (e.g. npx @supabase/mcp@latest)"
              style={{ ...INPUT, flex: 1 }}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={newArgs}
              onChange={e => setNewArgs(e.target.value)}
              placeholder="Extra args (space-separated, optional)"
              style={{ ...INPUT, flex: 1 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setAdding(false)} style={{ padding: '4px 10px', fontSize: 11, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
            <button
              onClick={handleAdd}
              disabled={loading || !newName.trim() || !newCommand.trim()}
              style={{ padding: '4px 10px', fontSize: 11, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Starting…' : 'Start'}
            </button>
          </div>
        </div>
      )}

      {/* Connection list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {connections.length === 0 ? (
          <div style={{ padding: '20px 14px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            No MCP connections configured.
            <br />
            <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>Add one above to connect to external tools.</span>
          </div>
        ) : (
          connections.map(conn => (
            <div key={conn.name} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(conn.status), flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{conn.name}</span>
                {conn.port && (
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 10 }}>
                    :{conn.port}
                  </span>
                )}
                <button
                  onClick={() => handleRemove(conn.name)}
                  style={{ fontSize: 10, padding: '2px 6px', background: 'transparent', color: '#f44747', border: '1px solid #f44747', borderRadius: 3, cursor: 'pointer' }}
                >
                  Remove
                </button>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', paddingLeft: 16 }}>
                {conn.command}{conn.args?.length ? ' ' + conn.args.join(' ') : ''}
              </div>
              <div style={{ fontSize: 10, color: statusColor(conn.status), paddingLeft: 16 }}>
                {conn.status}
                {conn.pid ? ` (pid ${conn.pid})` : ''}
                {conn.port && conn.status === 'running' ? (
                  <button
                    onClick={() => navigator.clipboard?.writeText(`http://localhost:${conn.port}/sse`).catch(() => {})}
                    style={{ marginLeft: 6, fontSize: 9, padding: '1px 4px', background: 'var(--bg-active)', color: 'var(--text-muted)', border: 'none', borderRadius: 2, cursor: 'pointer' }}
                  >
                    Copy URL
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface BrowserPaneProps {
  initialUrl?: string
}

export default function BrowserPane({ initialUrl = 'https://www.google.com' }: BrowserPaneProps) {
  const webviewContainerRef = useRef<HTMLDivElement>(null)
  const webviewRef = useRef<WebviewElement | null>(null)

  // Live browser state
  const [inputUrl, setInputUrl] = useState(initialUrl)
  const [currentUrl, setCurrentUrl] = useState(initialUrl)
  const [pageTitle, setPageTitle] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  // View toggle
  const [view, setView] = useState<BrowserView>('live')

  // Playwright state
  const [pwState, setPwState] = useState<PlaywrightState>('idle')
  const [pwUrl, setPwUrl] = useState('')
  const [pwScreenshot, setPwScreenshot] = useState<string | null>(null)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwInput, setPwInput] = useState('')

  // MCP server state
  const [mcpState, setMcpState] = useState<McpState>('stopped')
  const [mcpPort, setMcpPort] = useState<number | null>(null)
  const [mcpLog, setMcpLog] = useState<string[]>([])

  // ── Mount webview via DOM (avoids TS JSX issues) ─────────────────────────

  useEffect(() => {
    const container = webviewContainerRef.current
    if (!container) return

    const wv = document.createElement('webview') as unknown as WebviewElement
    const wvEl = wv as unknown as HTMLElement
    wvEl.style.display = 'block'
    ;(wv as unknown as Element).setAttribute('src', initialUrl)
    ;(wv as unknown as Element).setAttribute('allowpopups', '')
    ;(wv as unknown as Element).setAttribute('webpreferences', 'contextIsolation=yes')

    // <webview> ignores CSS percentage/flex sizing — drive it with explicit pixels
    const sizeWebview = () => {
      const w = container.offsetWidth
      const h = container.offsetHeight
      if (w > 0 && h > 0) {
        wvEl.style.width = `${w}px`
        wvEl.style.height = `${h}px`
      }
    }
    const sizeObserver = new ResizeObserver(sizeWebview)
    sizeObserver.observe(container)
    requestAnimationFrame(sizeWebview)

    const updateNav = () => {
      setCanGoBack(wv.canGoBack?.() ?? false)
      setCanGoForward(wv.canGoForward?.() ?? false)
    }

    const onNavigate = (e: Event) => {
      const url = (e as CustomEvent & { url: string }).url
      setCurrentUrl(url)
      setInputUrl(url)
      updateNav()
    }
    const onInPageNavigate = (e: Event) => {
      const ev = e as CustomEvent & { url: string; isMainFrame: boolean }
      if (ev.isMainFrame) { setCurrentUrl(ev.url); setInputUrl(ev.url) }
    }
    const onStartLoading = () => setIsLoading(true)
    const onStopLoading = () => {
      setIsLoading(false)
      updateNav()
      setPageTitle(wv.getTitle?.() ?? '')
    }
    const onTitleUpdate = (e: Event) => {
      setPageTitle((e as CustomEvent & { title: string }).title)
    }
    const onFailLoad = () => setIsLoading(false)

    const el = wv as unknown as EventTarget
    el.addEventListener('did-navigate', onNavigate)
    el.addEventListener('did-navigate-in-page', onInPageNavigate)
    el.addEventListener('did-start-loading', onStartLoading)
    el.addEventListener('did-stop-loading', onStopLoading)
    el.addEventListener('did-fail-load', onFailLoad)
    el.addEventListener('page-title-updated', onTitleUpdate)

    container.appendChild(wv as unknown as Node)
    webviewRef.current = wv

    return () => {
      sizeObserver.disconnect()
      el.removeEventListener('did-navigate', onNavigate)
      el.removeEventListener('did-navigate-in-page', onInPageNavigate)
      el.removeEventListener('did-start-loading', onStartLoading)
      el.removeEventListener('did-stop-loading', onStopLoading)
      el.removeEventListener('did-fail-load', onFailLoad)
      el.removeEventListener('page-title-updated', onTitleUpdate)
      try { container.removeChild(wv as unknown as Node) } catch { /* ignore */ }
      webviewRef.current = null
    }
  }, []) // mount once

  // ── Navigation ───────────────────────────────────────────────────────────

  const navigate = useCallback((raw: string) => {
    const url = normalizeUrl(raw)
    setInputUrl(url)
    webviewRef.current?.loadURL(url)
  }, [])

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') navigate(inputUrl)
    if (e.key === 'Escape') setInputUrl(currentUrl)
  }

  // ── Screenshot (webview) ──────────────────────────────────────────────────

  const handleCaptureWebview = useCallback(async () => {
    const wv = webviewRef.current
    if (!wv?.getWebContentsId) return
    try {
      const base64 = await window.electronAPI.browser.captureWebview(wv.getWebContentsId())
      const a = document.createElement('a')
      a.href = `data:image/png;base64,${base64}`
      a.download = `screenshot-${Date.now()}.png`
      a.click()
    } catch (err) {
      console.error('Screenshot failed:', err)
    }
  }, [])

  // ── Playwright ────────────────────────────────────────────────────────────

  const launchPlaywright = useCallback(async () => {
    setPwState('launching')
    setPwError(null)
    const result = await window.electronAPI.browser.playwright.launch()
    if (result.success) {
      setPwState('active')
      setView('playwright')
    } else {
      setPwState('error')
      setPwError(result.error ?? 'Launch failed')
    }
  }, [])

  const closePlaywright = useCallback(async () => {
    await window.electronAPI.browser.playwright.close()
    setPwState('idle')
    setPwScreenshot(null)
    setPwUrl('')
    if (view === 'playwright') setView('live')
  }, [view])

  const playwrightGoto = useCallback(async (url: string) => {
    if (pwState !== 'active') return
    const result = await window.electronAPI.browser.playwright.goto(url)
    if (result.success) {
      setPwUrl(result.url ?? url)
      // Auto-screenshot after navigation
      const shot = await window.electronAPI.browser.playwright.screenshot()
      if (shot.success && shot.data) setPwScreenshot(shot.data)
    } else {
      setPwError(result.error ?? 'Navigation failed')
    }
  }, [pwState])

  const playwrightScreenshot = useCallback(async () => {
    const result = await window.electronAPI.browser.playwright.screenshot()
    if (result.success && result.data) {
      setPwScreenshot(result.data)
      setPwUrl(result.url ?? pwUrl)
    } else {
      setPwError(result.error ?? 'Screenshot failed')
    }
  }, [pwUrl])

  // Listen for native menu "Launch Playwright"
  useEffect(() => {
    const unsub = window.electronAPI.browser.onPlaywrightLaunch(launchPlaywright)
    return unsub
  }, [launchPlaywright])

  // ── MCP server ────────────────────────────────────────────────────────────

  const startMcp = useCallback(async () => {
    setMcpState('starting')
    setMcpLog([])
    const result = await window.electronAPI.browser.mcp.start()
    if (result.success && result.port) {
      setMcpState('running')
      setMcpPort(result.port)
    } else {
      setMcpState('error')
      setMcpLog(prev => [...prev, result.error ?? 'Failed to start'])
    }
  }, [])

  const stopMcp = useCallback(async () => {
    await window.electronAPI.browser.mcp.stop()
    setMcpState('stopped')
    setMcpPort(null)
  }, [])

  useEffect(() => {
    const unsubLog = window.electronAPI.browser.mcp.onLog(line => {
      setMcpLog(prev => [...prev.slice(-50), line.trim()])
    })
    const unsubStop = window.electronAPI.browser.mcp.onStopped(() => {
      setMcpState('stopped')
      setMcpPort(null)
    })
    return () => { unsubLog(); unsubStop() }
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  const pwBusy = pwState === 'launching'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        background: 'var(--bg-primary)',
        borderLeft: '1px solid var(--border)'
      }}
    >
      {/* ── Toolbar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          height: TOOLBAR_H,
          minHeight: TOOLBAR_H,
          padding: '0 6px',
          background: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0
        }}
      >
        {/* View toggle pill */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-active)',
            borderRadius: 4,
            padding: 2,
            marginRight: 4,
            gap: 2,
            flexShrink: 0
          }}
        >
          {(['live', 'playwright', 'connections'] as BrowserView[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '2px 8px',
                borderRadius: 3,
                fontSize: 11,
                fontWeight: 500,
                background: view === v ? 'var(--bg-secondary)' : 'transparent',
                color: view === v ? 'var(--text-primary)' : 'var(--text-muted)',
                transition: 'all 0.1s'
              }}
            >
              {v === 'live' ? '🌐 Live' : v === 'playwright' ? '🤖 Playwright' : '🔌 Connections'}
            </button>
          ))}
        </div>

        {/* Nav controls — only for live view */}
        {view === 'live' && (
          <>
            <NavButton onClick={() => webviewRef.current?.goBack()} disabled={!canGoBack} title="Back">◀</NavButton>
            <NavButton onClick={() => webviewRef.current?.goForward()} disabled={!canGoForward} title="Forward">▶</NavButton>
            <NavButton
              onClick={() => isLoading ? webviewRef.current?.stop() : webviewRef.current?.reload()}
              title={isLoading ? 'Stop' : 'Reload'}
            >
              {isLoading ? '✕' : '↺'}
            </NavButton>
          </>
        )}

        {/* URL bar — only for live and playwright */}
        {view !== 'connections' && (
          <input
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            onFocus={e => e.currentTarget.select()}
            placeholder={view === 'playwright' ? 'URL for Playwright to navigate…' : 'Enter URL or search…'}
            style={{
              flex: 1,
              height: 24,
              padding: '0 8px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              outline: 'none'
            }}
            onKeyDownCapture={e => {
              if (e.key === 'Enter' && view === 'playwright') {
                e.preventDefault()
                playwrightGoto(inputUrl)
              }
            }}
          />
        )}

        {/* Action buttons */}
        {view === 'live' && (
          <>
            <NavButton onClick={handleCaptureWebview} title="Screenshot (save PNG)">📷</NavButton>
            <NavButton onClick={() => webviewRef.current?.openDevTools()} title="Open DevTools">🔧</NavButton>
          </>
        )}
        {view === 'playwright' && pwState === 'active' && (
          <>
            <NavButton onClick={() => playwrightGoto(inputUrl)} disabled={pwBusy} title="Navigate Playwright browser">Go</NavButton>
            <NavButton onClick={playwrightScreenshot} disabled={pwBusy} title="Capture Playwright screenshot">📷</NavButton>
          </>
        )}
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Live webview (always mounted, hidden when in other views) */}
        <div
          ref={webviewContainerRef}
          style={{
            position: 'absolute',
            inset: 0,
            visibility: view === 'live' ? 'visible' : 'hidden',
            pointerEvents: view === 'live' ? 'auto' : 'none'
          }}
        />

        {/* Playwright view */}
        {view === 'playwright' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-primary)',
              overflow: 'auto'
            }}
          >
            {pwState === 'idle' && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Playwright Browser</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                  Control a headless Chromium browser for agent automation
                </div>
                <button
                  onClick={launchPlaywright}
                  style={{
                    padding: '8px 20px',
                    background: 'var(--accent)',
                    color: '#fff',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500
                  }}
                >
                  Launch Browser
                </button>
              </div>
            )}

            {pwState === 'launching' && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: 12 }}>Launching Playwright browser…</div>
              </div>
            )}

            {pwState === 'error' && (
              <div style={{ textAlign: 'center', padding: '0 24px', maxWidth: 420 }}>
                <div style={{ color: '#f44747', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Launch failed</div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    background: 'var(--bg-tertiary)',
                    padding: '8px 12px',
                    borderRadius: 4,
                    marginBottom: 12,
                    textAlign: 'left',
                    wordBreak: 'break-word'
                  }}
                >
                  {pwError}
                </div>
                {pwError?.includes('Executable') && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                    Run in the Terminal panel to install the browser:
                    <code
                      style={{
                        display: 'block',
                        marginTop: 6,
                        fontFamily: 'var(--font-mono)',
                        background: 'var(--bg-tertiary)',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 11
                      }}
                    >
                      npx playwright install chromium
                    </code>
                  </div>
                )}
                <button
                  onClick={launchPlaywright}
                  style={{
                    padding: '6px 16px',
                    background: 'var(--bg-active)',
                    color: 'var(--text-primary)',
                    borderRadius: 4,
                    fontSize: 12
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {pwState === 'active' && (
              <div style={{ width: '100%', height: '100%', overflow: 'auto', position: 'relative' }}>
                {pwScreenshot ? (
                  <img
                    src={`data:image/png;base64,${pwScreenshot}`}
                    alt="Playwright screenshot"
                    style={{ width: '100%', display: 'block' }}
                  />
                ) : (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <div style={{ fontSize: 12 }}>
                      Browser ready. Navigate to a URL and take a screenshot.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Connections view */}
        {view === 'connections' && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <ConnectionsPanel />
          </div>
        )}
      </div>

      {/* ── Status bar ── */}
      <div
        style={{
          height: STATUS_H,
          minHeight: STATUS_H,
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          gap: 12,
          background: 'var(--bg-tertiary)',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
          fontSize: 11,
          overflow: 'hidden'
        }}
      >
        {/* Page title */}
        <span style={{ color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {view === 'live' && pageTitle ? truncate(pageTitle, 40) : ''}
          {view === 'playwright' && pwUrl ? truncate(pwUrl, 40) : ''}
        </span>

        {/* Playwright status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: pwState === 'active' ? '#4ec9b0' : pwState === 'launching' ? '#dcdcaa' : pwState === 'error' ? '#f44747' : 'var(--text-muted)'
            }}
          />
          <span style={{ color: 'var(--text-muted)' }}>PW</span>
          {pwState === 'active' && (
            <button
              onClick={closePlaywright}
              style={{ color: 'var(--text-muted)', fontSize: 10, padding: '1px 4px', borderRadius: 2, background: 'var(--bg-active)' }}
            >
              Close
            </button>
          )}
        </div>

        {/* Divider */}
        <span style={{ color: 'var(--border)', userSelect: 'none' }}>|</span>

        {/* MCP server status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: mcpState === 'running' ? '#4ec9b0' : mcpState === 'starting' ? '#dcdcaa' : mcpState === 'error' ? '#f44747' : 'var(--text-muted)'
            }}
          />
          {mcpState === 'running' && mcpPort ? (
            <>
              <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                MCP :{mcpPort}
              </span>
              <button
                onClick={() => navigator.clipboard?.writeText(`http://localhost:${mcpPort}/sse`).catch(() => {})}
                title="Copy MCP endpoint URL"
                style={{ color: 'var(--text-muted)', fontSize: 10, padding: '1px 4px', borderRadius: 2, background: 'var(--bg-active)' }}
              >
                Copy
              </button>
              <button
                onClick={stopMcp}
                style={{ color: 'var(--text-muted)', fontSize: 10, padding: '1px 4px', borderRadius: 2, background: 'var(--bg-active)' }}
              >
                Stop
              </button>
            </>
          ) : (
            <button
              onClick={startMcp}
              disabled={mcpState === 'starting'}
              title="Start @playwright/mcp server for agent browser control"
              style={{
                color: mcpState === 'starting' ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 2,
                background: 'var(--bg-active)'
              }}
            >
              {mcpState === 'starting' ? 'Starting MCP…' : 'Start MCP'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
