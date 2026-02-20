import { useState, useEffect } from 'react'

interface AgentPanelProps {
  workspacePath: string | null
  isOpen: boolean
  onToggle: () => void
}

type UltraworkPhase = 'idle' | 'plan' | 'act' | 'verify' | 'report'

const PHASE_LABELS: Record<UltraworkPhase, string> = {
  idle: 'Idle',
  plan: 'Plan',
  act: 'Act',
  verify: 'Verify',
  report: 'Report'
}

const PHASE_DESCRIPTIONS: Record<UltraworkPhase, string> = {
  idle: 'Waiting for a task',
  plan: 'Analyzing prompt and generating task list',
  act: 'Executing across editor, terminal, and browser surfaces',
  verify: 'Validating via tests and browser checks',
  report: 'Producing walkthrough artifact with visual proof'
}

export default function AgentPanel({ workspacePath, isOpen, onToggle }: AgentPanelProps) {
  const [currentPhase] = useState<UltraworkPhase>('idle')
  const [manusFiles, setManusFiles] = useState<{ taskPlan: boolean; progress: boolean }>({
    taskPlan: false,
    progress: false
  })

  // Check for Manus Protocol files in workspace
  useEffect(() => {
    if (!workspacePath || !window.electronAPI?.readFile) return

    const check = async () => {
      const sep = workspacePath.includes('/') ? '/' : '\\'
      const checkFile = async (name: string) => {
        try {
          await window.electronAPI.readFile(`${workspacePath}${sep}${name}`)
          return true
        } catch {
          return false
        }
      }
      const [taskPlan, progress] = await Promise.all([
        checkFile('task_plan.md'),
        checkFile('progress.md')
      ])
      setManusFiles({ taskPlan, progress })
    }
    check()
  }, [workspacePath])

  const panelHeight = isOpen ? 200 : 35

  return (
    <div
      style={{
        height: panelHeight,
        minHeight: panelHeight,
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'height 0.15s ease',
        overflow: 'hidden',
        flexShrink: 0
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          height: 35,
          minHeight: 35,
          borderBottom: isOpen ? '1px solid var(--border)' : 'none',
          cursor: 'pointer',
          userSelect: 'none'
        }}
        onClick={onToggle}
      >
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginRight: 6 }}>
          {isOpen ? '▼' : '▶'}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase'
          }}
        >
          Agent Manager
        </span>
        <span
          style={{
            marginLeft: 8,
            padding: '1px 6px',
            background: 'var(--bg-tertiary)',
            borderRadius: 10,
            fontSize: 10,
            color: 'var(--text-muted)'
          }}
        >
          Ultrawork Loop
        </span>
        <div style={{ flex: 1 }} />
        {workspacePath && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Manus:{' '}
            <span style={{ color: manusFiles.taskPlan ? '#4ec9b0' : 'var(--text-muted)' }}>
              task_plan.md
            </span>{' '}
            <span style={{ color: manusFiles.progress ? '#4ec9b0' : 'var(--text-muted)' }}>
              progress.md
            </span>
          </span>
        )}
      </div>

      {/* Panel body */}
      {isOpen && (
        <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto' }}>
          {/* Ultrawork phase indicators */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(Object.keys(PHASE_LABELS) as UltraworkPhase[])
              .filter(p => p !== 'idle')
              .map(phase => {
                const isActive = currentPhase === phase
                return (
                  <div
                    key={phase}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 4,
                      background: isActive ? 'var(--accent)' : 'var(--bg-tertiary)',
                      color: isActive ? '#fff' : 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 400,
                      transition: 'all 0.15s'
                    }}
                  >
                    <span>{phase === 'plan' ? '📋' : phase === 'act' ? '⚡' : phase === 'verify' ? '✅' : '📊'}</span>
                    <span>{PHASE_LABELS[phase]}</span>
                  </div>
                )
              })}
          </div>

          {/* Status message */}
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--bg-tertiary)',
              borderRadius: 4,
              borderLeft: '3px solid var(--accent)',
              fontSize: 12
            }}
          >
            <div style={{ color: 'var(--text-secondary)', marginBottom: 4, fontSize: 11, fontWeight: 500 }}>
              STATUS
            </div>
            <div style={{ color: 'var(--text-primary)' }}>
              {PHASE_DESCRIPTIONS[currentPhase]}
            </div>
            <div style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 11 }}>
              Agent Manager — coming soon. Spawn parallel agents, review artifacts, and track Ultrawork Loop progress here.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
