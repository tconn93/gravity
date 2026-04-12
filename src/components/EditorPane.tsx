import { useEffect, useRef, useState, useCallback } from 'react'
import Editor, { type Monaco } from '@monaco-editor/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { EditorTab } from '../types'

interface EditorPaneProps {
  tabs: EditorTab[]
  activeTabPath: string | null
  onSelectTab: (path: string) => void
  onCloseTab: (path: string) => void
  onContentChange: (path: string, content: string) => void
  onSave: (path: string) => void
}

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  json: 'json', html: 'html', css: 'css',
  scss: 'scss', less: 'less', md: 'markdown',
  py: 'python', rs: 'rust', go: 'go',
  sh: 'shell', bash: 'shell', yaml: 'yaml',
  yml: 'yaml', toml: 'ini', xml: 'xml',
  sql: 'sql', graphql: 'graphql', c: 'c',
  cpp: 'cpp', java: 'java', rb: 'ruby',
  php: 'php', swift: 'swift', kt: 'kotlin'
}

function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_LANG[ext] ?? 'plaintext'
}

function isMarkdown(path: string): boolean {
  return path.split('.').pop()?.toLowerCase() === 'md'
}

type EditorInstance = Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[0]

export default function EditorPane({
  tabs,
  activeTabPath,
  onSelectTab,
  onCloseTab,
  onContentChange,
  onSave
}: EditorPaneProps) {
  const activeTab = tabs.find(t => t.path === activeTabPath) ?? null
  const editorRef = useRef<EditorInstance | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Cmd+I overlay state
  const [cmdIOpen, setCmdIOpen] = useState(false)
  const [cmdIQuery, setCmdIQuery] = useState('')
  const [cmdILoading, setCmdILoading] = useState(false)
  const cmdIInputRef = useRef<HTMLInputElement>(null)

  // Debounce ref for AI completion
  const completionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const completionProviderRef = useRef<{ dispose: () => void } | null>(null)

  // Close preview whenever the active tab is not a markdown file
  useEffect(() => {
    if (!activeTab || !isMarkdown(activeTab.path)) {
      setPreviewOpen(false)
    }
  }, [activeTab?.path])

  // Cmd+S / Ctrl+S save handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (activeTabPath) onSave(activeTabPath)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTabPath, onSave])

  // Cmd+I handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault()
        setCmdIOpen(v => !v)
        setCmdIQuery('')
      }
      if (e.key === 'Escape' && cmdIOpen) {
        setCmdIOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cmdIOpen])

  // Focus Cmd+I input when opened
  useEffect(() => {
    if (cmdIOpen) {
      setTimeout(() => cmdIInputRef.current?.focus(), 50)
    }
  }, [cmdIOpen])

  // Register AI tab completion provider
  const registerCompletionProvider = useCallback(async (monaco: Monaco) => {
    // Check if AI completion is enabled
    const settings = await window.electronAPI?.settings?.get().catch(() => null)
    if (!settings?.aiCompletionEnabled) return

    // Dispose previous provider if any
    completionProviderRef.current?.dispose()

    const disposable = monaco.languages.registerInlineCompletionsProvider('*', {
      provideInlineCompletions: async (model: import('monaco-editor').editor.ITextModel, position: import('monaco-editor').Position) => {
        if (completionDebounceRef.current) clearTimeout(completionDebounceRef.current)
        return new Promise(resolve => {
          completionDebounceRef.current = setTimeout(async () => {
            try {
              const prefix = model.getValueInRange({
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
              })
              const context = prefix.slice(-500)
              const completion = await window.electronAPI?.editorAI?.command('Complete the next part of this code, output ONLY the completion text, no explanation', context)
              if (completion && !completion.startsWith('// Error')) {
                resolve({ items: [{ insertText: completion }] })
              } else {
                resolve({ items: [] })
              }
            } catch {
              resolve({ items: [] })
            }
          }, 800)
        })
      },
      freeInlineCompletions: () => {}
    })
    completionProviderRef.current = disposable
  }, [])

  // Handle Cmd+I submission
  const handleCmdISubmit = useCallback(async () => {
    if (!cmdIQuery.trim() || !editorRef.current) return
    const editor = editorRef.current
    const model = editor.getModel()
    if (!model) return

    setCmdILoading(true)
    try {
      const selection = editor.getSelection()
      const selectedText = selection ? model.getValueInRange(selection) : ''
      const fullContent = model.getValue()
      const fileName = activeTabPath?.split(/[\\/]/).pop() ?? 'unknown'
      const language = activeTabPath ? getLanguage(activeTabPath) : 'plaintext'

      const context = JSON.stringify({
        filename: fileName,
        language,
        selectedText: selectedText || undefined,
        surroundingCode: selectedText ? undefined : fullContent.slice(0, 2000)
      })

      const result = await window.electronAPI?.editorAI?.command(cmdIQuery.trim(), context)

      if (result && !result.startsWith('// Error') && result.trim()) {
        if (selection && selectedText) {
          // Replace selected text
          editor.executeEdits('ai-command', [{
            range: selection,
            text: result,
            forceMoveMarkers: true
          }])
        } else {
          // Insert at cursor
          const position = editor.getPosition()
          if (position) {
            editor.executeEdits('ai-command', [{
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column
              },
              text: result,
              forceMoveMarkers: true
            }])
          }
        }
      }
    } finally {
      setCmdILoading(false)
      setCmdIOpen(false)
      setCmdIQuery('')
    }
  }, [cmdIQuery, activeTabPath])

  if (tabs.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 48 }}>⚡</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500 }}>Gravity</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Open a file from the sidebar to start editing</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>Cmd+I for AI commands · Cmd+, for Settings</div>
      </div>
    )
  }

  const showPreviewBtn = !!activeTab && isMarkdown(activeTab.path)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          background: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto',
          overflowY: 'hidden',
          minHeight: 'var(--tab-height)',
          flexShrink: 0,
          position: 'relative'
        }}
      >
        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'stretch', flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
          {tabs.map(tab => {
            const isActive = tab.path === activeTabPath
            return (
              <div
                key={tab.path}
                onClick={() => onSelectTab(tab.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 12px',
                  minWidth: 120,
                  maxWidth: 200,
                  cursor: 'pointer',
                  background: isActive ? 'var(--bg-primary)' : 'transparent',
                  borderRight: '1px solid var(--border)',
                  borderBottom: isActive ? '1px solid var(--bg-primary)' : '1px solid transparent',
                  marginBottom: isActive ? -1 : 0,
                  fontSize: 'var(--font-size-sm)',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  flexShrink: 0,
                  whiteSpace: 'nowrap'
                }}
              >
                {tab.isDirty && (
                  <span style={{ color: 'var(--dirty)', fontSize: 16, lineHeight: 1 }}>•</span>
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }} title={tab.path}>
                  {tab.label}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); onCloseTab(tab.path) }}
                  style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, padding: '0 2px', borderRadius: 2, opacity: 0, transition: 'opacity 0.1s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0' }}
                  title="Close"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>

        {/* Markdown preview toggle — only visible for .md files */}
        {showPreviewBtn && (
          <button
            onClick={() => setPreviewOpen(v => !v)}
            title={previewOpen ? 'Close Preview' : 'Open Preview (Markdown)'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '0 12px',
              fontSize: 11,
              fontWeight: 500,
              color: previewOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: previewOpen ? 'var(--bg-active)' : 'transparent',
              borderLeft: '1px solid var(--border)',
              flexShrink: 0,
              cursor: 'pointer',
              transition: 'background 0.1s, color 0.1s'
            }}
            onMouseEnter={e => {
              if (!previewOpen) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'
            }}
            onMouseLeave={e => {
              if (!previewOpen) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            }}
          >
            <span style={{ fontSize: 13 }}>📖</span>
            {previewOpen ? 'Close Preview' : 'Preview'}
          </button>
        )}
      </div>

      {/* Cmd+I overlay */}
      {cmdIOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'var(--tab-height, 35px)',
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border)',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>✦ AI</span>
            {activeTab && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                {activeTab.label} · {getLanguage(activeTab.path)}
                {editorRef.current?.getSelection() && !editorRef.current.getSelection()?.isEmpty()
                  ? ' · selection'
                  : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={cmdIInputRef}
              value={cmdIQuery}
              onChange={e => setCmdIQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCmdISubmit() }
                if (e.key === 'Escape') { setCmdIOpen(false); setCmdIQuery('') }
              }}
              placeholder='Describe what to do… e.g. "Add error handling" or "Refactor to async/await"'
              style={{
                flex: 1,
                padding: '6px 10px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--accent)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none',
                fontFamily: 'inherit'
              }}
            />
            <button
              onClick={handleCmdISubmit}
              disabled={cmdILoading || !cmdIQuery.trim()}
              style={{
                padding: '6px 14px',
                background: cmdILoading || !cmdIQuery.trim() ? 'var(--bg-tertiary)' : 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                fontSize: 12,
                cursor: cmdILoading || !cmdIQuery.trim() ? 'not-allowed' : 'pointer',
                flexShrink: 0
              }}
            >
              {cmdILoading ? '…' : 'Apply'}
            </button>
            <button
              onClick={() => { setCmdIOpen(false); setCmdIQuery('') }}
              style={{ padding: '6px 10px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
            >
              Esc
            </button>
          </div>
        </div>
      )}

      {/* Editor area: split when preview is open */}
      {activeTab && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Monaco editor — always present, width narrows in split mode */}
          <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
            <Editor
              key={activeTab.path}
              height="100%"
              language={getLanguage(activeTab.path)}
              value={activeTab.content}
              theme="vs-dark"
              options={{
                fontSize: 14,
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.6,
                minimap: { enabled: !previewOpen },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'off',
                renderWhitespace: 'selection',
                tabSize: 2,
                insertSpaces: true,
                bracketPairColorization: { enabled: true },
                guides: { bracketPairs: true },
                padding: { top: 8 },
                inlineSuggest: { enabled: true }
              }}
              onChange={value => {
                if (value !== undefined) onContentChange(activeTab.path, value)
              }}
              onMount={(editor, monaco) => {
                editorRef.current = editor
                monacoRef.current = monaco
                editor.focus()
                // Register AI completion provider
                registerCompletionProvider(monaco)
              }}
            />
          </div>

          {/* Markdown preview pane */}
          {previewOpen && (
            <>
              {/* Divider */}
              <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />

              {/* Preview */}
              <div
                style={{
                  flex: 1,
                  overflow: 'auto',
                  background: 'var(--bg-primary)',
                  minWidth: 0
                }}
              >
                {/* Preview header */}
                <div
                  style={{
                    padding: '6px 16px',
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-secondary)',
                    fontWeight: 500,
                    letterSpacing: '0.05em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <span>📖</span>
                  <span>PREVIEW</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 400, opacity: 0.7 }}>{activeTab.label}</span>
                </div>

                {/* Rendered markdown */}
                <div style={{ padding: '20px 24px' }}>
                  <div className="md" style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.7 }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeTab.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
