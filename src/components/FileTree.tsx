import { useState, useEffect, useRef } from 'react'
import type { FileNode } from '../types'

interface FileTreeProps {
  nodes: FileNode[]
  activeFilePath: string | null
  depth?: number
  refreshKey?: number
  onFileClick: (node: FileNode) => void
  onDirClick: (node: FileNode) => void
}

const FILE_ICONS: Record<string, string> = {
  ts: '🟦', tsx: '⚛️', js: '🟨', jsx: '⚛️',
  json: '📋', md: '📝', css: '🎨', html: '🌐',
  py: '🐍', rs: '🦀', go: '🐹', sh: '💻',
  txt: '📄', env: '🔒', gitignore: '🚫'
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return FILE_ICONS[ext] ?? '📄'
}

export default function FileTree({
  nodes,
  activeFilePath,
  depth = 0,
  refreshKey = 0,
  onFileClick,
  onDirClick
}: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loadedChildren, setLoadedChildren] = useState<Record<string, FileNode[]>>({})
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded

  // When the parent signals a refresh, re-read every directory that's currently open
  useEffect(() => {
    if (refreshKey === 0) return
    for (const dirPath of expandedRef.current) {
      window.electronAPI.readDir(dirPath).then(children => {
        setLoadedChildren(prev => ({ ...prev, [dirPath]: children }))
      }).catch(() => {})
    }
  }, [refreshKey])

  const handleDirClick = async (node: FileNode) => {
    const isExpanded = expanded.has(node.path)
    if (isExpanded) {
      setExpanded(prev => { const s = new Set(prev); s.delete(node.path); return s })
    } else {
      setExpanded(prev => new Set(prev).add(node.path))
      if (!loadedChildren[node.path]) {
        const children = await window.electronAPI.readDir(node.path)
        setLoadedChildren(prev => ({ ...prev, [node.path]: children }))
      }
      onDirClick(node)
    }
  }

  return (
    <div>
      {nodes.map(node => {
        const isActive = node.path === activeFilePath
        const isExpanded = expanded.has(node.path)
        const indent = depth * 12 + 8

        return (
          <div key={node.path}>
            <button
              onClick={() => node.isDirectory ? handleDirClick(node) : onFileClick(node)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                width: '100%',
                padding: `3px 8px 3px ${indent}px`,
                background: isActive ? 'var(--bg-active)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-primary)',
                fontSize: 'var(--font-size-sm)',
                textAlign: 'left',
                borderRadius: 0,
                transition: 'background 0.1s'
              }}
              onMouseEnter={e => {
                if (!isActive)(e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={e => {
                if (!isActive)(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              }}
            >
              {node.isDirectory ? (
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginRight: 2, lineHeight: 1 }}>
                  {isExpanded ? '▼' : '▶'}
                </span>
              ) : (
                <span style={{ fontSize: 14, marginRight: 2 }}>{getFileIcon(node.name)}</span>
              )}
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: node.isDirectory ? 500 : 400
                }}
              >
                {node.name}
              </span>
            </button>

            {node.isDirectory && isExpanded && (
              <FileTree
                nodes={loadedChildren[node.path] ?? node.children ?? []}
                activeFilePath={activeFilePath}
                depth={depth + 1}
                refreshKey={refreshKey}
                onFileClick={onFileClick}
                onDirClick={onDirClick}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
