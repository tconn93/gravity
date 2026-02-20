import { contextBridge, ipcRenderer } from 'electron'

// ─── Shared result type ───────────────────────────────────────────────────────

interface IpcResult<T = void> {
  success: boolean
  error?: string
  notInstalled?: boolean
  data?: string
  result?: string
  url?: string
  title?: string
  port?: number
}

// ─── API surface types ────────────────────────────────────────────────────────

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

export interface TerminalAPI {
  create: (cwd: string) => Promise<string>
  write: (id: string, data: string) => void
  resize: (id: string, cols: number, rows: number) => void
  kill: (id: string) => void
  onData: (id: string, callback: (data: string) => void) => () => void
  onExit: (id: string, callback: (exitCode: number) => void) => () => void
  onNewTerminal: (callback: () => void) => () => void
}

export type AgentRole = 'architect' | 'developer' | 'validator' | 'custom'
export type UltraworkPhase = 'plan' | 'act' | 'verify' | 'report' | 'done'
export type AgentStatus = 'running' | 'done' | 'error' | 'cancelled'

export interface Artifact {
  id: string
  type: 'task_list' | 'implementation_plan' | 'walkthrough'
  title: string
  content: string
  createdAt: number
}

export interface OutputEntry {
  type: 'text' | 'tool_call' | 'tool_result' | 'phase_change' | 'system'
  content: string
  toolName?: string
  isError?: boolean
  timestamp: number
}

export interface AgentListItem {
  id: string
  role: AgentRole
  model: string
  prompt: string
  phase: UltraworkPhase
  status: AgentStatus
  createdAt: number
  artifactCount: number
  lastOutput: OutputEntry[]
}

export interface AgentSession {
  id: string
  role: AgentRole
  model: string
  prompt: string
  workspacePath: string
  phase: UltraworkPhase
  status: AgentStatus
  createdAt: number
  output: OutputEntry[]
  artifacts: Artifact[]
  error?: string
}

export type AgentUpdate =
  | { type: 'text_stream'; content: string }
  | { type: 'tool_call'; toolName: string; toolInput: string }
  | { type: 'tool_result'; toolName: string; content: string; isError: boolean }
  | { type: 'phase_change'; phase: UltraworkPhase }
  | { type: 'artifact'; artifact: Artifact }
  | { type: 'done' }
  | { type: 'error'; error: string }

export interface SpawnConfig {
  role: AgentRole
  model?: string
  prompt: string
  workspacePath: string
}

export interface AgentConfig {
  defaultModel: string
  hasApiKey: boolean
}

export interface AgentAPI {
  getConfig: () => Promise<AgentConfig>
  spawn: (config: SpawnConfig) => Promise<{ id: string } | { error: string }>
  continueSession: (id: string, message: string) => Promise<{ ok: true } | { error: string }>
  cancel: (id: string) => Promise<void>
  list: () => Promise<AgentListItem[]>
  getSession: (id: string) => Promise<AgentSession | null>
  setApiKey: (key: string) => Promise<void>
  onUpdate: (callback: (agentId: string, update: AgentUpdate) => void) => () => void
}

export interface BrowserAPI {
  captureWebview: (webContentsId: number) => Promise<string>
  onToggle: (callback: () => void) => () => void
  onPlaywrightLaunch: (callback: () => void) => () => void
  playwright: {
    launch: () => Promise<IpcResult>
    goto: (url: string) => Promise<IpcResult>
    screenshot: () => Promise<IpcResult>
    click: (selector: string) => Promise<IpcResult>
    fill: (selector: string, value: string) => Promise<IpcResult>
    evaluate: (expression: string) => Promise<IpcResult>
    close: () => Promise<IpcResult>
  }
  mcp: {
    start: () => Promise<IpcResult>
    stop: () => Promise<IpcResult>
    status: () => Promise<{ running: boolean; port: number | null }>
    onLog: (callback: (line: string) => void) => () => void
    onStopped: (callback: (code: number | null) => void) => () => void
  }
}

export interface ElectronAPI {
  openFolder: () => Promise<string | null>
  readDir: (path: string) => Promise<FileNode[]>
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  onFolderOpened: (callback: (path: string) => void) => () => void
  onFileSave: (callback: () => void) => () => void
  terminal: TerminalAPI
  browser: BrowserAPI
  agent: AgentAPI
}

// ─── Implementation ───────────────────────────────────────────────────────────

function on(channel: string, handler: (...args: unknown[]) => void): () => void {
  ipcRenderer.on(channel, handler as Parameters<typeof ipcRenderer.on>[1])
  return () => ipcRenderer.removeListener(channel, handler as Parameters<typeof ipcRenderer.on>[1])
}

const electronAPI: ElectronAPI = {
  // File system
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readDir: (path) => ipcRenderer.invoke('fs:readDir', path),
  readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
  writeFile: (path, content) => ipcRenderer.invoke('fs:writeFile', path, content),
  onFolderOpened: (cb) => on('folder:opened', (_e, path) => cb(path as string)),
  onFileSave: (cb) => on('file:save', () => cb()),

  // Terminal (PTY)
  terminal: {
    create: (cwd) => ipcRenderer.invoke('terminal:create', cwd),
    write: (id, data) => ipcRenderer.send('terminal:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('terminal:kill', id),
    onData: (id, cb) => on('terminal:data', (_e, termId, data) => {
      if (termId === id) cb(data as string)
    }),
    onExit: (id, cb) => on('terminal:exit', (_e, termId, code) => {
      if (termId === id) cb(code as number)
    }),
    onNewTerminal: (cb) => on('terminal:new', () => cb())
  },

  // Browser / Playwright / MCP
  browser: {
    captureWebview: (id) => ipcRenderer.invoke('browser:captureWebview', id),
    onToggle: (cb) => on('browser:toggle', () => cb()),
    onPlaywrightLaunch: (cb) => on('browser:playwright:launch', () => cb()),

    playwright: {
      launch: () => ipcRenderer.invoke('playwright:launch'),
      goto: (url) => ipcRenderer.invoke('playwright:goto', url),
      screenshot: () => ipcRenderer.invoke('playwright:screenshot'),
      click: (sel) => ipcRenderer.invoke('playwright:click', sel),
      fill: (sel, val) => ipcRenderer.invoke('playwright:fill', sel, val),
      evaluate: (expr) => ipcRenderer.invoke('playwright:evaluate', expr),
      close: () => ipcRenderer.invoke('playwright:close')
    },

    mcp: {
      start: () => ipcRenderer.invoke('mcp:start'),
      stop: () => ipcRenderer.invoke('mcp:stop'),
      status: () => ipcRenderer.invoke('mcp:status'),
      onLog: (cb) => on('mcp:log', (_e, line) => cb(line as string)),
      onStopped: (cb) => on('mcp:stopped', (_e, code) => cb(code as number | null))
    }
  },

  // Agent Manager
  agent: {
    getConfig: () => ipcRenderer.invoke('agent:getConfig'),
    spawn: (config) => ipcRenderer.invoke('agent:spawn', config),
    continueSession: (id, message) => ipcRenderer.invoke('agent:continue', id, message),
    cancel: (id) => ipcRenderer.invoke('agent:cancel', id),
    list: () => ipcRenderer.invoke('agent:list'),
    getSession: (id) => ipcRenderer.invoke('agent:getSession', id),
    setApiKey: (key) => ipcRenderer.invoke('agent:setApiKey', key),
    onUpdate: (cb) => on('agent:update', (_e, agentId, update) => cb(agentId as string, update as AgentUpdate))
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
