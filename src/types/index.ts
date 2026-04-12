export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

export interface EditorTab {
  path: string
  label: string
  content: string
  isDirty: boolean
}

export type TerminalPolicy = 'turbo' | 'review'

export interface TerminalSession {
  id: string
  label: string
  isAlive: boolean
}

export interface IpcResult<T = void> {
  success: boolean
  error?: string
  notInstalled?: boolean
  data?: string
  result?: string
  url?: string
  title?: string
  port?: number
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
    addConnection: (cfg: McpConnectionConfig) => Promise<IpcResult>
    removeConnection: (name: string) => Promise<IpcResult>
    listConnections: () => Promise<McpConnection[]>
  }
}

// ─── Multi-provider types ─────────────────────────────────────────────────────

export type Provider = 'xai' | 'anthropic' | 'gemini' | 'openai' | 'ollama' | 'deepseek'

export interface ProviderInfo {
  name: string
  baseURL: string
  extraHeaders?: Record<string, string>
  requiresKey: boolean
  envKey: string
  defaultModels: string[]
}

export interface GravitySettings {
  providers: Partial<Record<Provider, string>>  // provider → API key
  defaultProvider: Provider
  defaultModel: string
  terminalPolicy: 'turbo' | 'review'
  aiCompletionEnabled: boolean
}

export interface Workflow {
  name: string
  description: string
  role: AgentRole
  prompt: string
}

export type AgentMode = 'standard' | 'planning' | 'fast'

// ─── Run configuration types ──────────────────────────────────────────────────

export interface RunConfig {
  id: string
  name: string
  command: string
  cwd?: string  // relative to workspace root, defaults to root
  env?: Record<string, string>
}

export interface RunConfigAPI {
  list: (workspacePath: string) => Promise<RunConfig[]>
  save: (workspacePath: string, config: RunConfig) => Promise<void>
  delete: (workspacePath: string, id: string) => Promise<void>
  detectNpm: (workspacePath: string) => Promise<RunConfig[]>
}

// ─── MCP connection types ─────────────────────────────────────────────────────

export interface McpConnectionConfig {
  name: string
  command: string
  args?: string[]
}

export interface McpConnection extends McpConnectionConfig {
  status: 'stopped' | 'starting' | 'running' | 'error'
  port?: number
  pid?: number
}

// ─── Agent Manager types ──────────────────────────────────────────────────────

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
  type: 'text' | 'tool_call' | 'tool_result' | 'phase_change' | 'system' | 'user'
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
  provider?: Provider
  mode?: AgentMode
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
  provider?: Provider
  mode?: AgentMode
}

export interface AgentConfig {
  defaultModel: string
  hasApiKey: boolean
  providers: Record<Provider, ProviderInfo>
  settings: GravitySettings
}

export interface AgentAPI {
  getConfig: () => Promise<AgentConfig>
  spawn: (config: SpawnConfig) => Promise<{ id: string } | { error: string }>
  continueSession: (id: string, message: string) => Promise<{ ok: true } | { error: string }>
  cancel: (id: string) => Promise<void>
  list: () => Promise<AgentListItem[]>
  getSession: (id: string) => Promise<AgentSession | null>
  setApiKey: (key: string) => Promise<void>
  setProviderKey: (provider: Provider, key: string) => Promise<void>
  getWorkflows: (workspacePath: string) => Promise<Workflow[]>
  onUpdate: (callback: (agentId: string, update: AgentUpdate) => void) => () => void
}

export interface SettingsAPI {
  get: () => Promise<GravitySettings>
  set: (settings: GravitySettings) => Promise<void>
}

export interface EditorAIAPI {
  command: (prompt: string, context: string) => Promise<string>
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
  settings: SettingsAPI
  editorAI: EditorAIAPI
  runConfig: RunConfigAPI
}

// ─── Electron WebviewTag interface for DOM usage ──────────────────────────────

export interface WebviewElement extends HTMLElement {
  src: string
  loadURL(url: string): Promise<void>
  reload(): void
  stop(): void
  goBack(): void
  goForward(): void
  canGoBack(): boolean
  canGoForward(): boolean
  isLoading(): boolean
  getURL(): string
  getTitle(): string
  getWebContentsId(): number
  openDevTools(): void
  closeDevTools(): void
  isDevToolsOpened(): boolean
  executeJavaScript(code: string): Promise<unknown>
  insertCSS(css: string): Promise<string>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
