import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
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

export default function EditorPane({
  tabs,
  activeTabPath,
  onSelectTab,
  onCloseTab,
  onContentChange,
  onSave
}: EditorPaneProps) {
  const activeTab = tabs.find(t => t.path === activeTabPath) ?? null
  const editorRef = useRef<Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[0] | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

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

  if (tabs.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 48 }}>⚡</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500 }}>Gravity</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Open a file from the sidebar to start editing</div>
      </div>
    )
  }

  const showPreviewBtn = !!activeTab && isMarkdown(activeTab.path)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                padding: { top: 8 }
              }}
              onChange={value => {
                if (value !== undefined) onContentChange(activeTab.path, value)
              }}
              onMount={editor => {
                editorRef.current = editor
                editor.focus()
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
