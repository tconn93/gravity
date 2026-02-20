import { useState, useEffect } from 'react'
import FileTree from './FileTree'
import { useFileSystem } from '../hooks/useFileSystem'
import type { FileNode } from '../types'

interface SidebarProps {
  workspacePath: string | null
  activeFilePath: string | null
  refreshKey: number
  onOpenFolder: () => void
  onOpenFile: (path: string) => void
}

export default function Sidebar({
  workspacePath,
  activeFilePath,
  refreshKey,
  onOpenFolder,
  onOpenFile
}: SidebarProps) {
  const [nodes, setNodes] = useState<FileNode[]>([])
  const { readDir } = useFileSystem()

  useEffect(() => {
    if (!workspacePath) return
    readDir(workspacePath).then(setNodes)
  }, [workspacePath, readDir, refreshKey])

  const folderName = workspacePath
    ? workspacePath.split(/[\\/]/).pop() ?? workspacePath
    : null

  return (
    <div
      style={{
        width: 'var(--sidebar-width)',
        minWidth: 'var(--sidebar-width)',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 35
        }}
      >
        <span>{folderName ?? 'Explorer'}</span>
        <button
          onClick={onOpenFolder}
          title="Open Folder"
          style={{
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 16,
            color: 'var(--text-secondary)',
            lineHeight: 1
          }}
        >
          📁
        </button>
      </div>

      {/* File tree */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {workspacePath && nodes.length > 0 ? (
          <FileTree
            nodes={nodes}
            activeFilePath={activeFilePath}
            refreshKey={refreshKey}
            onFileClick={node => onOpenFile(node.path)}
            onDirClick={() => {}}
          />
        ) : !workspacePath ? (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 12 }}>
              No folder open
            </p>
            <button
              onClick={onOpenFolder}
              style={{
                padding: '6px 14px',
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 500
              }}
            >
              Open Folder
            </button>
          </div>
        ) : (
          <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
            Empty folder
          </div>
        )}
      </div>
    </div>
  )
}
