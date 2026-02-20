import { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from './components/Sidebar'
import EditorPane from './components/EditorPane'
import TerminalPanel from './components/TerminalPanel'
import BrowserPane from './components/BrowserPane'
import { useFileSystem } from './hooks/useFileSystem'
import type { EditorTab } from './types'

const WORKSPACE_KEY = 'gravity:workspacePath'
const PANEL_HEIGHT_KEY = 'gravity:panelHeight'
const BROWSER_WIDTH_KEY = 'gravity:browserWidth'
const DEFAULT_PANEL_HEIGHT = 220
const DEFAULT_BROWSER_WIDTH = 480
const MIN_BROWSER_WIDTH = 320
const MAX_BROWSER_WIDTH = 900

export default function App() {
  const [workspacePath, setWorkspacePath] = useState<string | null>(() =>
    localStorage.getItem(WORKSPACE_KEY)
  )
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelHeight, setPanelHeight] = useState(() => {
    const s = localStorage.getItem(PANEL_HEIGHT_KEY)
    return s ? Number(s) : DEFAULT_PANEL_HEIGHT
  })
  const [browserOpen, setBrowserOpen] = useState(false)
  const [browserWidth, setBrowserWidth] = useState(() => {
    const s = localStorage.getItem(BROWSER_WIDTH_KEY)
    return s ? Number(s) : DEFAULT_BROWSER_WIDTH
  })
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0)

  const isDraggingBrowser = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs

  const { openFolder, readFile, writeFile } = useFileSystem()

  // ── File actions ─────────────────────────────────────────────────────────

  const handleOpenFolder = useCallback(async () => {
    const path = await openFolder()
    if (path) {
      setWorkspacePath(path)
      localStorage.setItem(WORKSPACE_KEY, path)
      setTabs([])
      setActiveTabPath(null)
    }
  }, [openFolder])

  const handleOpenFile = useCallback(async (filePath: string) => {
    const existing = tabs.find(t => t.path === filePath)
    if (existing) { setActiveTabPath(filePath); return }
    const content = await readFile(filePath)
    const label = filePath.split(/[\\/]/).pop() ?? filePath
    setTabs(prev => [...prev, { path: filePath, label, content, isDirty: false }])
    setActiveTabPath(filePath)
  }, [tabs, readFile])

  const handleContentChange = useCallback((path: string, content: string) => {
    setTabs(prev => prev.map(t => t.path === path ? { ...t, content, isDirty: true } : t))
  }, [])

  const handleSave = useCallback(async (path: string) => {
    const tab = tabs.find(t => t.path === path)
    if (!tab) return
    await writeFile(path, tab.content)
    setTabs(prev => prev.map(t => t.path === path ? { ...t, isDirty: false } : t))
  }, [tabs, writeFile])

  const handleCloseTab = useCallback((path: string) => {
    const tab = tabs.find(t => t.path === path)
    if (tab?.isDirty && !window.confirm(`${tab.label} has unsaved changes. Close anyway?`)) return
    setTabs(prev => {
      const next = prev.filter(t => t.path !== path)
      if (activeTabPath === path) {
        const idx = prev.findIndex(t => t.path === path)
        setActiveTabPath((next[idx] ?? next[idx - 1])?.path ?? null)
      }
      return next
    })
  }, [tabs, activeTabPath])

  const handlePanelResize = useCallback((h: number) => {
    setPanelHeight(h)
    localStorage.setItem(PANEL_HEIGHT_KEY, String(h))
  }, [])

  // ── Browser panel drag-resize ─────────────────────────────────────────────

  const handleBrowserDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingBrowser.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = browserWidth

    const onMove = (ev: MouseEvent) => {
      if (!isDraggingBrowser.current) return
      const delta = dragStartX.current - ev.clientX
      const w = Math.min(MAX_BROWSER_WIDTH, Math.max(MIN_BROWSER_WIDTH, dragStartWidth.current + delta))
      setBrowserWidth(w)
      localStorage.setItem(BROWSER_WIDTH_KEY, String(w))
    }
    const onUp = () => {
      isDraggingBrowser.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [browserWidth])

  // ── Native event listeners ────────────────────────────────────────────────

  useEffect(() => {
    if (!window.electronAPI?.onFileSave) return
    return window.electronAPI.onFileSave(() => { if (activeTabPath) handleSave(activeTabPath) })
  }, [activeTabPath, handleSave])

  useEffect(() => {
    if (!window.electronAPI?.onFolderOpened) return
    return window.electronAPI.onFolderOpened((path: string) => {
      setWorkspacePath(path)
      localStorage.setItem(WORKSPACE_KEY, path)
      setTabs([])
      setActiveTabPath(null)
    })
  }, [])

  useEffect(() => {
    if (!window.electronAPI?.browser?.onToggle) return
    return window.electronAPI.browser.onToggle(() => setBrowserOpen(v => !v))
  }, [])

  // On window focus: refresh sidebar tree + re-read non-dirty open tabs
  useEffect(() => {
    const handleFocus = async () => {
      setSidebarRefreshKey(k => k + 1)
      for (const tab of tabsRef.current) {
        if (tab.isDirty) continue
        try {
          const content = await readFile(tab.path)
          setTabs(prev => prev.map(t =>
            t.path === tab.path && !t.isDirty ? { ...t, content } : t
          ))
        } catch { /* file may have been deleted externally */ }
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [readFile])

  // Cmd+Shift+B keyboard toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'b') {
        e.preventDefault()
        setBrowserOpen(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Main row: sidebar + editor + (optional) browser */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <Sidebar
          workspacePath={workspacePath}
          activeFilePath={activeTabPath}
          refreshKey={sidebarRefreshKey}
          onOpenFolder={handleOpenFolder}
          onOpenFile={handleOpenFile}
        />

        <EditorPane
          tabs={tabs}
          activeTabPath={activeTabPath}
          onSelectTab={setActiveTabPath}
          onCloseTab={handleCloseTab}
          onContentChange={handleContentChange}
          onSave={handleSave}
        />

        {/* Browser panel */}
        {browserOpen && (
          <>
            {/* Drag handle */}
            <div
              onMouseDown={handleBrowserDragStart}
              style={{
                width: 4,
                cursor: 'col-resize',
                background: 'var(--border)',
                flexShrink: 0,
                zIndex: 10,
                transition: 'background 0.1s'
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--accent)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--border)' }}
            />
            <div style={{ width: browserWidth, minWidth: browserWidth, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <BrowserPane />
            </div>
          </>
        )}

        {/* Browser toggle button (top-right corner, always visible) */}
        <button
          onClick={() => setBrowserOpen(v => !v)}
          title={`${browserOpen ? 'Close' : 'Open'} Browser Panel (Cmd+Shift+B)`}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 50,
            padding: '4px 10px',
            background: browserOpen ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: browserOpen ? '#fff' : 'var(--text-secondary)',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 500,
            border: '1px solid var(--border)'
          }}
        >
          {browserOpen ? '🌐 Browser' : '🌐'}
        </button>
      </div>

      {/* Terminal + Agent panel */}
      <TerminalPanel
        workspacePath={workspacePath}
        isOpen={panelOpen}
        onToggle={() => setPanelOpen(v => !v)}
        panelHeight={panelHeight}
        onPanelResize={handlePanelResize}
      />
    </div>
  )
}
