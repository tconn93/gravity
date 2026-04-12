import { config as loadEnv } from 'dotenv'
import { app, BrowserWindow, ipcMain, dialog, Menu, webContents } from 'electron'
import { join } from 'path'

// Load .env from project root before anything else reads process.env
loadEnv({ path: join(__dirname, '../../.env') })
import { promises as fs } from 'fs'
import { createServer, type AddressInfo } from 'net'
import { spawn, type ChildProcess } from 'child_process'
import * as pty from 'node-pty'
import { chromium } from 'playwright-core'
import type { Browser, Page } from 'playwright-core'
import { agentManager } from './agentManager'
import type { GravitySettings, McpConnectionConfig, McpConnection, RunConfig } from '../src/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

// ─── PTY session registry ─────────────────────────────────────────────────────

const terminals = new Map<string, ReturnType<typeof pty.spawn>>()
let terminalCounter = 0

function getShell(): string {
  if (process.platform === 'win32') return 'powershell.exe'
  return process.env.SHELL || 'bash'
}

// ─── Playwright state ─────────────────────────────────────────────────────────

let pwBrowser: Browser | null = null
let pwPage: Page | null = null

// ─── MCP server state ─────────────────────────────────────────────────────────

let mcpProcess: ChildProcess | null = null
let mcpPort: number | null = null

// ─── External MCP connections ─────────────────────────────────────────────────

const mcpConnections = new Map<string, { process: ChildProcess; port?: number; config: McpConnectionConfig }>()

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as AddressInfo).port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

// ─── Settings store ───────────────────────────────────────────────────────────

const SETTINGS_FILE = join(app.getPath('userData'), 'gravity-settings.json')

const DEFAULT_SETTINGS: GravitySettings = {
  providers: {},
  defaultProvider: 'xai',
  defaultModel: 'grok-code-fast-1',
  terminalPolicy: 'turbo',
  aiCompletionEnabled: false
}

async function readSettings(): Promise<GravitySettings> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf-8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

async function writeSettings(settings: GravitySettings): Promise<void> {
  await fs.mkdir(join(app.getPath('userData')), { recursive: true })
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')
}

async function seedEnvFromSettings(): Promise<void> {
  const settings = await readSettings()
  for (const [provider, key] of Object.entries(settings.providers)) {
    if (key) {
      const envKeyMap: Record<string, string> = {
        xai: 'XAI_API_KEY',
        anthropic: 'ANTHROPIC_API_KEY',
        gemini: 'GEMINI_API_KEY',
        openai: 'OPENAI_API_KEY',
        deepseek: 'DEEPSEEK_API_KEY',
        ollama: ''
      }
      const envKey = envKeyMap[provider]
      if (envKey && !process.env[envKey]) {
        process.env[envKey] = key
      }
    }
  }
}

// ─── File system helpers ──────────────────────────────────────────────────────

async function readDirRecursive(dirPath: string, depth = 0): Promise<FileNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const nodes: FileNode[] = []
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    const node: FileNode = {
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory()
    }
    if (entry.isDirectory()) node.children = []
    nodes.push(node)
  }
  return nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

// ─── Window factory ───────────────────────────────────────────────────────────

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true // required for <webview> in renderer
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// ─── Native menu ──────────────────────────────────────────────────────────────

function buildMenu(win: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          async click() {
            const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
            if (!result.canceled && result.filePaths.length > 0) {
              win.webContents.send('folder:opened', result.filePaths[0])
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click() { win.webContents.send('file:save') }
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Terminal',
      submenu: [
        {
          label: 'New Terminal',
          accelerator: 'CmdOrCtrl+`',
          click() { win.webContents.send('terminal:new') }
        }
      ]
    },
    {
      label: 'Browser',
      submenu: [
        {
          label: 'Toggle Browser Panel',
          accelerator: 'CmdOrCtrl+Shift+B',
          click() { win.webContents.send('browser:toggle') }
        },
        {
          label: 'Launch Playwright Browser',
          click() { win.webContents.send('browser:playwright:launch') }
        }
      ]
    }
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' }, { type: 'separator' }, { role: 'services' },
        { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' },
        { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }
      ]
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ─── IPC: file system ─────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFolder', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('fs:readDir', async (_event, dirPath: string) => readDirRecursive(dirPath))
ipcMain.handle('fs:readFile', async (_event, filePath: string) => fs.readFile(filePath, 'utf-8'))
ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  await fs.writeFile(filePath, content, 'utf-8')
})

// ─── IPC: Settings ────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', async () => readSettings())
ipcMain.handle('settings:set', async (_event, settings: GravitySettings) => {
  await writeSettings(settings)
  // Update env vars and provider keys immediately
  for (const [provider, key] of Object.entries(settings.providers)) {
    if (key) {
      agentManager.setProviderKey(provider as any, key)
    }
  }
})

// ─── IPC: Workflows & Skills ──────────────────────────────────────────────────

ipcMain.handle('agent:readWorkflows', async (_event, workspacePath: string) => {
  const dir = join(workspacePath, '.agent', 'workflows')
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const workflows = []
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml') || entry.name.endsWith('.md'))) {
        try {
          const content = await fs.readFile(join(dir, entry.name), 'utf-8')
          // Simple frontmatter-style parse: look for name:, description:, role:, prompt:
          const lines = content.split('\n')
          const meta: Record<string, string> = {}
          let inFrontmatter = false
          let promptLines: string[] = []
          let pastFrontmatter = false
          for (const line of lines) {
            if (line.trim() === '---') {
              if (!inFrontmatter && !pastFrontmatter) { inFrontmatter = true; continue }
              if (inFrontmatter) { inFrontmatter = false; pastFrontmatter = true; continue }
            }
            if (inFrontmatter) {
              const m = line.match(/^(\w+):\s*(.*)$/)
              if (m) meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
            } else if (pastFrontmatter) {
              promptLines.push(line)
            }
          }
          const name = meta.name ?? entry.name.replace(/\.(yml|yaml|md)$/, '')
          workflows.push({
            name: name.startsWith('/') ? name : `/${name}`,
            description: meta.description ?? '',
            role: (meta.role ?? 'developer') as any,
            prompt: meta.prompt ?? promptLines.join('\n').trim()
          })
        } catch { /* skip malformed files */ }
      }
    }
    return workflows
  } catch {
    return []
  }
})

ipcMain.handle('agent:readSkills', async (_event, workspacePath: string) => {
  const dir = join(workspacePath, '.agent', 'skills')
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries
      .filter(e => e.isFile() && (e.name.endsWith('.py') || e.name.endsWith('.sh')))
      .map(e => e.name)
  } catch {
    return []
  }
})

// ─── IPC: Run configurations ──────────────────────────────────────────────────

function runConfigPath(workspacePath: string): string {
  return join(workspacePath, '.gravity', 'run.json')
}

async function readRunConfigs(workspacePath: string): Promise<RunConfig[]> {
  try {
    const raw = await fs.readFile(runConfigPath(workspacePath), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

ipcMain.handle('runConfig:list', async (_event, workspacePath: string) => {
  return readRunConfigs(workspacePath)
})

ipcMain.handle('runConfig:save', async (_event, workspacePath: string, config: RunConfig) => {
  const configs = await readRunConfigs(workspacePath)
  const idx = configs.findIndex(c => c.id === config.id)
  if (idx >= 0) configs[idx] = config
  else configs.push(config)
  await fs.mkdir(join(workspacePath, '.gravity'), { recursive: true })
  await fs.writeFile(runConfigPath(workspacePath), JSON.stringify(configs, null, 2), 'utf-8')
})

ipcMain.handle('runConfig:delete', async (_event, workspacePath: string, id: string) => {
  const configs = await readRunConfigs(workspacePath)
  const filtered = configs.filter(c => c.id !== id)
  await fs.mkdir(join(workspacePath, '.gravity'), { recursive: true })
  await fs.writeFile(runConfigPath(workspacePath), JSON.stringify(filtered, null, 2), 'utf-8')
})

ipcMain.handle('runConfig:detectNpm', async (_event, workspacePath: string) => {
  try {
    const raw = await fs.readFile(join(workspacePath, 'package.json'), 'utf-8')
    const pkg = JSON.parse(raw)
    const scripts: Record<string, string> = pkg.scripts ?? {}
    return Object.entries(scripts).map(([name, cmd]) => ({
      id: `npm:${name}`,
      name: `npm run ${name}`,
      command: `npm run ${name}`,
      cwd: '.'
    })) as RunConfig[]
  } catch {
    return []
  }
})

// ─── IPC: Editor AI ───────────────────────────────────────────────────────────

ipcMain.handle('editor:aiCommand', async (_event, prompt: string, context: string) => {
  return agentManager.oneShot(prompt, context)
})

// ─── IPC: terminal (PTY) ──────────────────────────────────────────────────────

ipcMain.handle('terminal:create', (event, cwd: string) => {
  const id = String(++terminalCounter)
  const term = pty.spawn(getShell(), [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd || process.env.HOME || process.cwd(),
    env: process.env as Record<string, string>
  })
  term.onData(data => {
    BrowserWindow.fromWebContents(event.sender)?.webContents.send('terminal:data', id, data)
  })
  term.onExit(({ exitCode }) => {
    BrowserWindow.fromWebContents(event.sender)?.webContents.send('terminal:exit', id, exitCode)
    terminals.delete(id)
  })
  terminals.set(id, term)
  return id
})

ipcMain.on('terminal:write', (_event, id: string, data: string) => { terminals.get(id)?.write(data) })
ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number) => {
  try { terminals.get(id)?.resize(cols, rows) } catch { /* ignore */ }
})
ipcMain.on('terminal:kill', (_event, id: string) => {
  try { terminals.get(id)?.kill() } catch { /* ignore */ }
  terminals.delete(id)
})

// ─── IPC: webview screenshot ──────────────────────────────────────────────────

ipcMain.handle('browser:captureWebview', async (_event, webContentsId: number) => {
  const wc = webContents.fromId(webContentsId)
  if (!wc) throw new Error('WebContents not found')
  const image = await wc.capturePage()
  return image.toPNG().toString('base64')
})

// ─── IPC: Playwright automation ───────────────────────────────────────────────

ipcMain.handle('playwright:launch', async () => {
  try {
    if (pwBrowser) { await pwBrowser.close().catch(() => {}); pwBrowser = null; pwPage = null }
    pwBrowser = await chromium.launch({ headless: true })
    const ctx = await pwBrowser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    })
    pwPage = await ctx.newPage()
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isNotInstalled = msg.includes('Executable') || msg.includes('not found') || msg.includes('install')
    return {
      success: false,
      error: msg,
      notInstalled: isNotInstalled
    }
  }
})

ipcMain.handle('playwright:goto', async (_event, url: string) => {
  if (!pwPage) return { success: false, error: 'No Playwright browser. Launch it first.' }
  try {
    await pwPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    return { success: true, url: pwPage.url(), title: await pwPage.title() }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('playwright:screenshot', async () => {
  if (!pwPage) return { success: false, error: 'No Playwright page open.' }
  try {
    const buffer = await pwPage.screenshot({ type: 'png', fullPage: false })
    return { success: true, data: buffer.toString('base64'), url: pwPage.url() }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('playwright:click', async (_event, selector: string) => {
  if (!pwPage) return { success: false, error: 'No Playwright page open.' }
  try {
    await pwPage.click(selector, { timeout: 10000 })
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('playwright:fill', async (_event, selector: string, value: string) => {
  if (!pwPage) return { success: false, error: 'No Playwright page open.' }
  try {
    await pwPage.fill(selector, value)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('playwright:evaluate', async (_event, expression: string) => {
  if (!pwPage) return { success: false, error: 'No Playwright page open.' }
  try {
    const result = await pwPage.evaluate(expression)
    return { success: true, result: JSON.stringify(result) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('playwright:close', async () => {
  try { await pwBrowser?.close() } catch { /* ignore */ }
  pwBrowser = null
  pwPage = null
  return { success: true }
})

// ─── IPC: MCP server (built-in Playwright MCP) ────────────────────────────────

ipcMain.handle('mcp:start', async (event) => {
  if (mcpProcess && !mcpProcess.killed) {
    return { success: true, port: mcpPort }
  }
  try {
    const port = await findFreePort()
    const proc = spawn('npx', ['--yes', '@playwright/mcp@latest', '--port', String(port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env: { ...process.env }
    })
    mcpProcess = proc
    mcpPort = port

    const win = BrowserWindow.fromWebContents(event.sender)
    proc.stdout?.on('data', (data: Buffer) => {
      win?.webContents.send('mcp:log', data.toString())
    })
    proc.stderr?.on('data', (data: Buffer) => {
      win?.webContents.send('mcp:log', data.toString())
    })
    proc.on('exit', (code) => {
      mcpProcess = null
      mcpPort = null
      win?.webContents.send('mcp:stopped', code)
    })

    // Give it 3s to start
    await new Promise(resolve => setTimeout(resolve, 3000))
    return { success: true, port }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('mcp:stop', async () => {
  try { mcpProcess?.kill() } catch { /* ignore */ }
  mcpProcess = null
  mcpPort = null
  return { success: true }
})

ipcMain.handle('mcp:status', () => ({
  running: !!mcpProcess && !mcpProcess.killed,
  port: mcpPort
}))

// ─── IPC: External MCP connections ───────────────────────────────────────────

ipcMain.handle('mcp:addConnection', async (event, cfg: McpConnectionConfig) => {
  if (mcpConnections.has(cfg.name)) {
    return { success: false, error: `Connection "${cfg.name}" already exists` }
  }
  try {
    const port = await findFreePort()
    const args = [...(cfg.args ?? []), '--port', String(port)]
    const parts = cfg.command.split(' ')
    const cmd = parts[0]
    const cmdArgs = [...parts.slice(1), ...args]
    const proc = spawn(cmd, cmdArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env: { ...process.env }
    })
    mcpConnections.set(cfg.name, { process: proc, port, config: cfg })
    const win = BrowserWindow.fromWebContents(event.sender)
    proc.stdout?.on('data', (d: Buffer) => win?.webContents.send('mcp:connection:log', cfg.name, d.toString()))
    proc.stderr?.on('data', (d: Buffer) => win?.webContents.send('mcp:connection:log', cfg.name, d.toString()))
    proc.on('exit', () => {
      const entry = mcpConnections.get(cfg.name)
      if (entry) mcpConnections.set(cfg.name, { ...entry, process: proc })
      win?.webContents.send('mcp:connection:stopped', cfg.name)
    })
    await new Promise(resolve => setTimeout(resolve, 1500))
    return { success: true, port }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('mcp:removeConnection', async (_event, name: string) => {
  const entry = mcpConnections.get(name)
  if (!entry) return { success: false, error: 'Connection not found' }
  try { entry.process.kill() } catch { /* ignore */ }
  mcpConnections.delete(name)
  return { success: true }
})

ipcMain.handle('mcp:listConnections', () => {
  const result: McpConnection[] = []
  for (const [name, entry] of mcpConnections.entries()) {
    const alive = !entry.process.killed && entry.process.exitCode === null
    result.push({
      name,
      command: entry.config.command,
      args: entry.config.args,
      status: alive ? 'running' : 'stopped',
      port: entry.port,
      pid: entry.process.pid
    })
  }
  return result
})

// ─── IPC: Agent Manager ───────────────────────────────────────────────────────

// Forward agent updates to all renderer windows
agentManager.setUpdateCallback((agentId, update) => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('agent:update', agentId, update)
  }
})

ipcMain.handle('agent:getConfig', () => agentManager.getConfig())
ipcMain.handle('agent:spawn', (_event, config) => agentManager.spawn(config))
ipcMain.handle('agent:continue', (_event, id: string, message: string) => agentManager.continueSession(id, message))
ipcMain.handle('agent:cancel', (_event, id: string) => { agentManager.cancel(id) })
ipcMain.handle('agent:list', () => agentManager.list())
ipcMain.handle('agent:getSession', (_event, id: string) => agentManager.getSession(id))
ipcMain.handle('agent:setApiKey', (_event, key: string) => { agentManager.setApiKey(key) })
ipcMain.handle('agent:setProviderKey', (_event, provider: string, key: string) => {
  agentManager.setProviderKey(provider as any, key)
})
ipcMain.handle('agent:getWorkflows', (_event, workspacePath: string) =>
  ipcMain.emit('agent:readWorkflows', null, workspacePath)
)

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  await seedEnvFromSettings()
  const settings = await readSettings()
  // Apply saved provider keys to agent manager
  for (const [provider, key] of Object.entries(settings.providers)) {
    if (key) agentManager.setProviderKey(provider as any, key)
  }

  const win = createWindow()
  buildMenu(win)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  for (const term of terminals.values()) { try { term.kill() } catch { /* ignore */ } }
  terminals.clear()
  pwBrowser?.close().catch(() => {})
  try { mcpProcess?.kill() } catch { /* ignore */ }
  for (const entry of mcpConnections.values()) {
    try { entry.process.kill() } catch { /* ignore */ }
  }
  mcpConnections.clear()

  if (process.platform !== 'darwin') app.quit()
})
