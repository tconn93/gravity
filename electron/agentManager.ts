import OpenAI from 'openai'
import { promises as fs } from 'fs'
import { join, resolve, isAbsolute, dirname } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { Provider, ProviderInfo, GravitySettings } from '../src/types'

const execAsync = promisify(exec)

// Decode HTML entities that some LLMs emit inside JSON strings
function htmlDecode(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

// ─── Provider registry ────────────────────────────────────────────────────────

export const PROVIDERS: Record<Provider, ProviderInfo> = {
  xai: {
    name: 'xAI (Grok)',
    baseURL: 'https://api.x.ai/v1',
    requiresKey: true,
    envKey: 'XAI_API_KEY',
    defaultModels: ['grok-code-fast-1', 'grok-3-fast', 'grok-3']
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    baseURL: 'https://api.anthropic.com/v1/',
    extraHeaders: { 'anthropic-version': '2023-06-01' },
    requiresKey: true,
    envKey: 'ANTHROPIC_API_KEY',
    defaultModels: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001']
  },
  gemini: {
    name: 'Google Gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    requiresKey: true,
    envKey: 'GEMINI_API_KEY',
    defaultModels: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-1.5-pro']
  },
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    requiresKey: true,
    envKey: 'OPENAI_API_KEY',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini']
  },
  ollama: {
    name: 'Ollama (local)',
    baseURL: 'http://localhost:11434/v1',
    requiresKey: false,
    envKey: '',
    defaultModels: ['llama3.3', 'qwen2.5-coder', 'mistral']
  },
  deepseek: {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    requiresKey: true,
    envKey: 'DEEPSEEK_API_KEY',
    defaultModels: ['deepseek-chat', 'deepseek-reasoner']
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentRole = 'architect' | 'developer' | 'validator' | 'custom'
export type UltraworkPhase = 'plan' | 'act' | 'verify' | 'report' | 'done'
export type AgentStatus = 'running' | 'done' | 'error' | 'cancelled'
export type AgentMode = 'standard' | 'planning' | 'fast'

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

// ─── Internal session type (adds ephemeral fields not exposed publicly) ────────

type InternalSession = AgentSession & {
  abortController: AbortController
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
  extraTools?: OpenAI.Chat.Completions.ChatCompletionTool[]
}

// ─── System prompts ───────────────────────────────────────────────────────────

const BASE_PROMPT = `
You are an AI agent running inside Gravity, an agent-first IDE.
You follow the Ultrawork Loop: Plan → Act → Verify → Report.

Use set_phase to signal which phase you are in as you work.
Always create at least one artifact summarizing your work via create_artifact.
Use update_task_plan to write a structured task_plan.md when you have a plan.
Use update_progress to keep progress.md current as you complete tasks.

Workspace root: {workspacePath}
All relative file paths are resolved from the workspace root.
`.trim()

const SYSTEM_PROMPTS: Record<AgentRole, string> = {
  architect: `${BASE_PROMPT}

Your role is ARCHITECT. You plan, design, and create structured implementation plans.
1. PLAN: Explore the codebase, understand the request, identify affected files
2. ACT: Create a detailed task_list artifact, then an implementation_plan artifact
3. VERIFY: Review your plan for completeness and correctness
4. REPORT: Create a walkthrough artifact summarising your approach and decisions`,

  developer: `${BASE_PROMPT}

Your role is DEVELOPER. You write and modify code to implement features.
1. PLAN: Read task_plan.md if it exists, explore relevant files, create a task_list
2. ACT: Use write_file to create/modify code, run_command to install deps and build
3. VERIFY: Run tests and builds via run_command to confirm the code works
4. REPORT: Create a walkthrough artifact listing every changed file and why`,

  validator: `${BASE_PROMPT}

Your role is VALIDATOR. You verify implementations are correct.
1. PLAN: Read the codebase and progress.md to understand what was implemented
2. ACT: Run tests, linters, and builds via run_command; read files to inspect quality
3. VERIFY: Confirm all checks pass; note any issues found
4. REPORT: Create a walkthrough artifact with a pass/fail summary and evidence`,

  custom: BASE_PROMPT
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const AGENT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Use paths relative to workspace root.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path (relative to workspace or absolute)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file. Creates parent directories as needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path (relative to workspace or absolute)' },
          content: { type: 'string', description: 'Full file content to write' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and subdirectories at a path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (relative to workspace or absolute)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command in the workspace. Returns stdout + stderr. 30s timeout.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run' },
          cwd: { type: 'string', description: 'Working directory override (optional)' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_codebase',
      description: 'Search the workspace for files matching a query string. Returns up to 20 matches with context.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text or pattern to search for' },
          filePattern: { type: 'string', description: 'Optional glob-style file extension filter, e.g. "*.ts"' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_phase',
      description: 'Update the current Ultrawork Loop phase.',
      parameters: {
        type: 'object',
        properties: {
          phase: {
            type: 'string',
            enum: ['plan', 'act', 'verify', 'report'],
            description: 'Current phase of the Ultrawork Loop'
          }
        },
        required: ['phase']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_artifact',
      description: 'Create a structured artifact to communicate your work.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['task_list', 'implementation_plan', 'walkthrough'],
            description: 'Artifact type'
          },
          title: { type: 'string', description: 'Artifact title' },
          content: { type: 'string', description: 'Artifact body in Markdown' }
        },
        required: ['type', 'title', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task_plan',
      description: 'Write to task_plan.md in the workspace root.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Full Markdown content for task_plan.md' }
        },
        required: ['content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_progress',
      description: 'Write to progress.md in the workspace root.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Full Markdown content for progress.md' }
        },
        required: ['content']
      }
    }
  }
]

const RUN_SKILL_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'run_skill',
    description: 'Run a custom skill script from .agent/skills/.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Script filename (e.g. "generate-docs.py")' },
        args: { type: 'string', description: 'Arguments to pass to the script' }
      },
      required: ['name']
    }
  }
}

// ─── Communication logger ─────────────────────────────────────────────────────

const COMM_DIR = resolve(__dirname, '../../communication')

function makeCommFilename(role: AgentRole, model: string, spawnedAt: number): string {
  const d = new Date(spawnedAt)
  const YYYY = d.getFullYear()
  const MM = String(d.getMonth() + 1).padStart(2, '0')
  const DD = String(d.getDate()).padStart(2, '0')
  const HH = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ssss = String(d.getMilliseconds()).padStart(4, '0')
  const safeModel = model.replace(/[^\w.-]/g, '_')
  return `${role}_${safeModel}_${YYYY}${MM}${DD}_${HH}-${mm}.${ss}${ssss}.md`
}

async function saveCommLog(
  session: AgentSession,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): Promise<void> {
  try {
    await fs.mkdir(COMM_DIR, { recursive: true })
    const filename = makeCommFilename(session.role, session.model, session.createdAt)
    const filepath = join(COMM_DIR, filename)

    const lines: string[] = [
      `# LLM Communication Log`,
      ``,
      `| Field | Value |`,
      `|-------|-------|`,
      `| Agent ID | ${session.id} |`,
      `| Role | ${session.role} |`,
      `| Model | ${session.model} |`,
      `| Provider | ${session.provider ?? 'xai'} |`,
      `| Status | ${session.status} |`,
      `| Workspace | ${session.workspacePath} |`,
      `| Spawned | ${new Date(session.createdAt).toISOString()} |`,
      ``
    ]

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      lines.push(`---`, ``)
      if (msg.role === 'system') {
        lines.push(`## [${i + 1}] SYSTEM`, ``, '```')
        lines.push(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content))
        lines.push('```')
      } else if (msg.role === 'user') {
        const content = msg.content
        if (typeof content === 'string') {
          lines.push(`## [${i + 1}] USER`, ``, content)
        } else {
          lines.push(`## [${i + 1}] USER (tool results)`, ``)
          for (const part of content as unknown[]) {
            lines.push('```json', JSON.stringify(part, null, 2), '```')
          }
        }
      } else if (msg.role === 'assistant') {
        lines.push(`## [${i + 1}] ASSISTANT`, ``)
        if (msg.content) {
          lines.push(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content))
        }
        const tc = (msg as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam).tool_calls
        if (tc?.length) {
          lines.push(``, `**Tool Calls:**`)
          for (const call of tc) {
            const fn = (call as { function: { name: string; arguments: string } }).function
            lines.push(``, `- \`${fn.name}\``, '```json')
            try { lines.push(JSON.stringify(JSON.parse(fn.arguments), null, 2)) }
            catch { lines.push(fn.arguments) }
            lines.push('```')
          }
        }
      } else if (msg.role === 'tool') {
        const tm = msg as OpenAI.Chat.Completions.ChatCompletionToolMessageParam
        lines.push(`## [${i + 1}] TOOL RESULT`, ``, `**Call ID:** \`${tm.tool_call_id}\``, ``, '```')
        lines.push(typeof tm.content === 'string' ? tm.content : JSON.stringify(tm.content))
        lines.push('```')
      }
      lines.push(``)
    }

    await fs.writeFile(filepath, lines.join('\n'), 'utf-8')
  } catch (err) {
    console.error('[agentManager] Failed to save comm log:', err)
  }
}

// ─── AgentManager ─────────────────────────────────────────────────────────────

export class AgentManager {
  private sessions = new Map<string, InternalSession>()
  private counter = 0
  private _apiKeys = new Map<Provider, string>()
  private onUpdate: (agentId: string, update: AgentUpdate) => void = () => {}

  private effectiveApiKey(provider: Provider): string | null {
    const manual = this._apiKeys.get(provider)
    if (manual) return manual
    const info = PROVIDERS[provider]
    if (!info.requiresKey) return 'no-key'
    const envVal = info.envKey ? process.env[info.envKey]?.trim() : undefined
    return envVal ?? null
  }

  setApiKey(key: string) {
    // Legacy: sets xai key
    this._apiKeys.set('xai', key.trim() || '')
  }

  setProviderKey(provider: Provider, key: string) {
    if (key.trim()) {
      this._apiKeys.set(provider, key.trim())
    } else {
      this._apiKeys.delete(provider)
    }
  }

  hasApiKey(provider: Provider = 'xai'): boolean {
    return !!this.effectiveApiKey(provider)
  }

  getConfig(): AgentConfig {
    const defaultProvider: Provider = 'xai'
    const settings: GravitySettings = {
      providers: Object.fromEntries(
        Array.from(this._apiKeys.entries()).map(([k, v]) => [k, v])
      ) as Partial<Record<Provider, string>>,
      defaultProvider,
      defaultModel: process.env.XAI_DEFAULT_MODEL ?? 'grok-code-fast-1',
      terminalPolicy: 'turbo',
      aiCompletionEnabled: false
    }
    return {
      defaultModel: process.env.XAI_DEFAULT_MODEL ?? 'grok-code-fast-1',
      hasApiKey: this.hasApiKey('xai') || this.hasApiKey('anthropic') || this.hasApiKey('openai') ||
        this.hasApiKey('gemini') || this.hasApiKey('deepseek') || this.hasApiKey('ollama'),
      providers: PROVIDERS,
      settings
    }
  }

  setUpdateCallback(cb: (agentId: string, update: AgentUpdate) => void) {
    this.onUpdate = cb
  }

  async spawn(config: SpawnConfig): Promise<{ id: string } | { error: string }> {
    const provider: Provider = config.provider ?? 'xai'
    if (!this.effectiveApiKey(provider)) {
      return { error: `No API key for provider "${PROVIDERS[provider].name}". Set it in Settings or .env.` }
    }
    const id = String(++this.counter)
    const defaultModel = PROVIDERS[provider].defaultModels[0]
    const model = config.model ?? defaultModel
    let systemPrompt = SYSTEM_PROMPTS[config.role].replace('{workspacePath}', config.workspacePath)

    // Inject .agent/rules/
    const rulesContent = await this.loadRules(config.workspacePath)
    if (rulesContent) {
      systemPrompt = `## RULES\n\n${rulesContent}\n\n---\n\n${systemPrompt}`
    }

    // Mode modifications
    if (config.mode === 'planning') {
      systemPrompt += '\n\nOnly plan — create task lists and implementation plans. Do NOT write any code files.'
    }

    // Load skills
    const extraTools: OpenAI.Chat.Completions.ChatCompletionTool[] = []
    const hasSkills = await this.hasSkills(config.workspacePath)
    if (hasSkills) {
      extraTools.push(RUN_SKILL_TOOL)
    }

    const session: InternalSession = {
      id,
      role: config.role,
      model,
      prompt: config.prompt,
      workspacePath: config.workspacePath,
      phase: 'plan',
      status: 'running',
      createdAt: Date.now(),
      provider,
      mode: config.mode ?? 'standard',
      output: [
        { type: 'user', content: config.prompt, timestamp: Date.now() }
      ],
      artifacts: [],
      abortController: new AbortController(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: config.prompt }
      ],
      extraTools
    }
    this.sessions.set(id, session)
    this.runLoop(session).catch(err => {
      session.status = 'error'
      session.error = err instanceof Error ? err.message : String(err)
      this.onUpdate(id, { type: 'error', error: session.error! })
    })
    return { id }
  }

  continueSession(id: string, message: string): { ok: true } | { error: string } {
    const session = this.sessions.get(id)
    if (!session) return { error: 'Session not found' }
    if (session.status === 'running') return { error: 'Session is already running' }

    const provider = session.provider ?? 'xai'
    if (!this.effectiveApiKey(provider)) return { error: 'No API key configured' }

    // Reset state for continuation
    session.status = 'running'
    session.phase = 'plan'
    delete session.error
    session.abortController = new AbortController()

    // Show user message in output
    session.output.push({ type: 'user', content: message, timestamp: Date.now() })

    // Append to the live conversation history
    session.messages.push({ role: 'user', content: message })

    this.runLoop(session).catch(err => {
      session.status = 'error'
      session.error = err instanceof Error ? err.message : String(err)
      this.onUpdate(id, { type: 'error', error: session.error! })
    })

    return { ok: true }
  }

  cancel(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    session.abortController.abort()
    session.status = 'cancelled'
    this.onUpdate(id, { type: 'done' })
  }

  list(): AgentListItem[] {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      role: s.role,
      model: s.model,
      prompt: s.prompt,
      phase: s.phase,
      status: s.status,
      createdAt: s.createdAt,
      artifactCount: s.artifacts.length,
      lastOutput: s.output.slice(-5)
    }))
  }

  getSession(id: string): AgentSession | null {
    const s = this.sessions.get(id)
    if (!s) return null
    // Return public fields only (exclude abortController and messages)
    return {
      id: s.id,
      role: s.role,
      model: s.model,
      prompt: s.prompt,
      workspacePath: s.workspacePath,
      phase: s.phase,
      status: s.status,
      createdAt: s.createdAt,
      output: s.output,
      artifacts: s.artifacts,
      error: s.error,
      provider: s.provider,
      mode: s.mode
    }
  }

  // ── One-shot AI call for editor commands ──────────────────────────────────

  async oneShot(prompt: string, context: string): Promise<string> {
    // Pick first available provider
    const providers: Provider[] = ['xai', 'anthropic', 'openai', 'gemini', 'deepseek', 'ollama']
    let chosenProvider: Provider = 'xai'
    for (const p of providers) {
      if (this.effectiveApiKey(p)) { chosenProvider = p; break }
    }
    const key = this.effectiveApiKey(chosenProvider)
    if (!key) return '// No AI provider configured'

    const prov = PROVIDERS[chosenProvider]
    const client = new OpenAI({
      apiKey: key,
      baseURL: prov.baseURL,
      defaultHeaders: prov.extraHeaders ?? {}
    })

    try {
      const response = await client.chat.completions.create({
        model: prov.defaultModels[0],
        max_tokens: 2048,
        messages: [
          { role: 'system', content: 'You are a code assistant. Respond with ONLY the code or text requested — no explanation, no markdown fences unless explicitly asked.' },
          { role: 'user', content: `Context:\n${context}\n\nRequest: ${prompt}` }
        ]
      })
      return response.choices[0]?.message?.content ?? ''
    } catch (err) {
      return `// Error: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  // ── Rules loader ──────────────────────────────────────────────────────────

  private async loadRules(workspacePath: string): Promise<string> {
    const rulesDir = join(workspacePath, '.agent', 'rules')
    try {
      const entries = await fs.readdir(rulesDir, { withFileTypes: true })
      const parts: string[] = []
      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
          try {
            const content = await fs.readFile(join(rulesDir, entry.name), 'utf-8')
            parts.push(`### ${entry.name}\n\n${content.trim()}`)
          } catch { /* skip */ }
        }
      }
      return parts.join('\n\n')
    } catch {
      return ''
    }
  }

  // ── Skills checker ────────────────────────────────────────────────────────

  private async hasSkills(workspacePath: string): Promise<boolean> {
    const skillsDir = join(workspacePath, '.agent', 'skills')
    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true })
      return entries.some(e => e.isFile() && (e.name.endsWith('.py') || e.name.endsWith('.sh')))
    } catch {
      return false
    }
  }

  // ── Agentic loop ──────────────────────────────────────────────────────────

  private async runLoop(session: InternalSession) {
    const provider: Provider = session.provider ?? 'xai'
    const prov = PROVIDERS[provider]
    const client = new OpenAI({
      apiKey: this.effectiveApiKey(provider) ?? 'no-key',
      baseURL: prov.baseURL,
      defaultHeaders: prov.extraHeaders ?? {}
    })

    const saveComms = (process.env.SAVE_LLM_COMMUNICATION ?? '').toLowerCase() === 'true'
    const MAX_TURNS = session.mode === 'fast' ? 10 : 40
    let turns = 0

    const tools = [...AGENT_TOOLS, ...(session.extraTools ?? [])]

    while (turns < MAX_TURNS) {
      if (session.abortController.signal.aborted) break
      turns++

      let textBuffer = ''
      const stream = client.chat.completions.stream({
        model: session.model,
        max_tokens: 8192,
        messages: session.messages,
        tools
      })

      stream.on('content', (delta: string) => {
        textBuffer += delta
        this.onUpdate(session.id, { type: 'text_stream', content: delta })
      })

      const response = await stream.finalChatCompletion()

      if (textBuffer) {
        session.output.push({ type: 'text', content: textBuffer, timestamp: Date.now() })
      }

      const choice = response.choices[0]
      const assistantMessage = choice.message

      session.messages.push({
        role: 'assistant',
        content: assistantMessage.content ?? null,
        tool_calls: assistantMessage.tool_calls ?? undefined
      })

      if (choice.finish_reason === 'stop') {
        session.status = 'done'
        session.phase = 'done'
        if (saveComms) await saveCommLog(session, session.messages)
        this.onUpdate(session.id, { type: 'done' })
        break
      }

      if (choice.finish_reason === 'tool_calls' && assistantMessage.tool_calls?.length) {
        for (const toolCall of assistantMessage.tool_calls) {
          if (session.abortController.signal.aborted) break

          const toolName = toolCall.function.name
          let toolInput: Record<string, unknown>
          try { toolInput = JSON.parse(toolCall.function.arguments) }
          catch { toolInput = {} }

          const inputStr = JSON.stringify(toolInput, null, 2)
          this.onUpdate(session.id, { type: 'tool_call', toolName, toolInput: inputStr })
          session.output.push({ type: 'tool_call', content: `${toolName}(${inputStr})`, toolName, timestamp: Date.now() })

          const result = await this.executeTool(session, toolName, toolInput)

          this.onUpdate(session.id, { type: 'tool_result', toolName, content: result.content, isError: result.isError })
          session.output.push({ type: 'tool_result', content: result.content, toolName, isError: result.isError, timestamp: Date.now() })

          session.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result.isError ? `Error: ${result.content}` : result.content
          })
        }
      }
    }

    if (session.status === 'running') {
      session.status = 'done'
      session.phase = 'done'
      if (saveComms) await saveCommLog(session, session.messages)
      this.onUpdate(session.id, { type: 'done' })
    }
  }

  // ── Tool executor ─────────────────────────────────────────────────────────

  private async executeTool(
    session: AgentSession,
    toolName: string,
    input: Record<string, unknown>
  ): Promise<{ content: string; isError: boolean }> {
    try {
      switch (toolName) {
        case 'read_file': {
          const p = this.resolvePath(session.workspacePath, input.path as string)
          return { content: await fs.readFile(p, 'utf-8'), isError: false }
        }
        case 'write_file': {
          const p = this.resolvePath(session.workspacePath, input.path as string)
          await fs.mkdir(dirname(p), { recursive: true })
          await fs.writeFile(p, htmlDecode(input.content as string), 'utf-8')
          return { content: `Written: ${p}`, isError: false }
        }
        case 'list_directory': {
          const p = this.resolvePath(session.workspacePath, input.path as string)
          const entries = await fs.readdir(p, { withFileTypes: true })
          const lines = entries.map(e => `${e.isDirectory() ? 'dir  ' : 'file '} ${e.name}`)
          return { content: lines.join('\n') || '(empty)', isError: false }
        }
        case 'run_command': {
          const cwd = input.cwd
            ? this.resolvePath(session.workspacePath, input.cwd as string)
            : session.workspacePath
          const { stdout, stderr } = await execAsync(input.command as string, {
            cwd, timeout: 30_000, env: { ...process.env }
          })
          const out = [stdout, stderr ? `STDERR:\n${stderr}` : ''].filter(Boolean).join('\n').trim()
          return { content: out || '(no output)', isError: false }
        }
        case 'search_codebase': {
          return this.searchCodebase(session.workspacePath, input.query as string, input.filePattern as string | undefined)
        }
        case 'set_phase': {
          const phase = input.phase as UltraworkPhase
          session.phase = phase
          this.onUpdate(session.id, { type: 'phase_change', phase })
          return { content: `Phase → ${phase}`, isError: false }
        }
        case 'create_artifact': {
          const artifact: Artifact = {
            id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: input.type as Artifact['type'],
            title: input.title as string,
            content: input.content as string,
            createdAt: Date.now()
          }
          session.artifacts.push(artifact)
          this.onUpdate(session.id, { type: 'artifact', artifact })
          return { content: `Artifact created: "${artifact.title}"`, isError: false }
        }
        case 'update_task_plan': {
          const p = join(session.workspacePath, 'task_plan.md')
          await fs.writeFile(p, input.content as string, 'utf-8')
          return { content: 'task_plan.md updated', isError: false }
        }
        case 'update_progress': {
          const p = join(session.workspacePath, 'progress.md')
          await fs.writeFile(p, input.content as string, 'utf-8')
          return { content: 'progress.md updated', isError: false }
        }
        case 'run_skill': {
          const skillName = input.name as string
          const skillArgs = (input.args as string) ?? ''
          const skillPath = join(session.workspacePath, '.agent', 'skills', skillName)
          const isPy = skillName.endsWith('.py')
          const cmd = isPy ? `python "${skillPath}" ${skillArgs}` : `bash "${skillPath}" ${skillArgs}`
          const { stdout, stderr } = await execAsync(cmd, {
            cwd: session.workspacePath,
            timeout: 30_000,
            env: { ...process.env }
          })
          const out = [stdout, stderr ? `STDERR:\n${stderr}` : ''].filter(Boolean).join('\n').trim()
          return { content: out || '(no output)', isError: false }
        }
        default:
          return { content: `Unknown tool: ${toolName}`, isError: true }
      }
    } catch (err) {
      return { content: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true }
    }
  }

  // ── search_codebase implementation ────────────────────────────────────────

  private async searchCodebase(
    workspacePath: string,
    query: string,
    filePattern?: string
  ): Promise<{ content: string; isError: boolean }> {
    const results: string[] = []
    const MAX_RESULTS = 20

    const extFilter = filePattern
      ? filePattern.replace(/\*/g, '').replace(/\./g, '').toLowerCase()
      : null

    const searchDir = async (dir: string, depth: number) => {
      if (depth > 8 || results.length >= MAX_RESULTS) return
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (results.length >= MAX_RESULTS) break
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
          const fullPath = join(dir, entry.name)
          if (entry.isDirectory()) {
            await searchDir(fullPath, depth + 1)
          } else if (entry.isFile()) {
            if (extFilter && !entry.name.toLowerCase().endsWith(extFilter)) continue
            try {
              const content = await fs.readFile(fullPath, 'utf-8')
              const lines = content.split('\n')
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                  const start = Math.max(0, i - 1)
                  const end = Math.min(lines.length - 1, i + 1)
                  const context = lines.slice(start, end + 1).map((l, idx) =>
                    `${start + idx + 1}: ${l}`
                  ).join('\n')
                  results.push(`${fullPath}:${i + 1}\n${context}`)
                  if (results.length >= MAX_RESULTS) break
                }
              }
            } catch { /* skip binary files */ }
          }
        }
      } catch { /* skip unreadable dirs */ }
    }

    await searchDir(workspacePath, 0)
    if (results.length === 0) return { content: 'No matches found.', isError: false }
    return { content: results.join('\n\n---\n\n'), isError: false }
  }

  private resolvePath(workspacePath: string, inputPath: string): string {
    if (isAbsolute(inputPath)) return inputPath
    return resolve(join(workspacePath, inputPath))
  }
}

export const agentManager = new AgentManager()
