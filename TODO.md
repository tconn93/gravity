# TODO.md

## High-Level Tasks
- [ ] Fork VS Code repository and set up base IDE structure.
- [x] Bifurcate UI into Editor (synchronous) and Agent Manager (asynchronous dashboard).

## Architecture: Three Pillars
### Editor Surface
- [x] Implement file system read/write access for agents.
- [x] Develop artifact generation (e.g., diffs) with review/apply workflow.
- [ ] Integrate tab completion and natural language commands (Cmd + I).

### Terminal Surface
- [x] Enable shell command execution for agents.
- [ ] Create configurable Terminal Policies (Turbo, Request Review).
- [ ] Add safeguards for dependency installation and builds.

### Browser Surface
- [x] Integrate built-in Chrome instance.
- [x] Set up visual perception tools (screenshots, recordings).
- [x] Deploy Microsoft Playwright-MCP server:
  - [x] Install Playwright and configure MCP integration.
  - [x] Create API endpoints for agent-browser communication.
  - [x] Implement agent controls: open URLs, simulate clicks/buttons, form interactions.
  - [x] Add UI testing and visual regression detection.
- [ ] Ensure MCP support for external tool/database connections (e.g., Supabase).

## Agent Management: Mission Control
- [x] Build dashboard for spawning/monitoring agents.
- [x] Implement asynchronous orchestration for parallel agents.
- [x] Develop Manus Protocol: Generate/manage Markdown files (task_plan.md, progress.md).
- [x] Create specialized roles/personas (e.g., Architect, Validator).
- [x] Add artifact-based feedback system (inline comments on plans/screenshots).
- [x] Support multi-agent parallelism.
- [ ] Implement Planning Mode (roadmaps) and Fast Mode (immediate execution).
- [ ] Integrate MCP for context management.

## Lifecycle: Ultrawork Loop
- [x] Define Plan phase: Prompt analysis to Task List/Implementation Plan.
- [x] Implement Act phase: Task execution across surfaces.
- [x] Build Verify phase: Browser/test runner integration.
- [x] Create Report phase: Walkthrough artifacts with proofs.

## Artifacts System
- [x] Develop Task Lists as dynamic checklists.
- [x] Implement Implementation Plans for pre-coding review.
- [x] Create Walkthrough summaries.
- [x] Add support for Browser Recordings & Screenshots.

## Customization and Guardrails
- [ ] Set up .agent/rules/ for persistent instructions.
- [ ] Implement .agent/workflows/ for slash commands.
- [ ] Develop .agent/skills/ with script packaging (Python/Bash).
- [ ] Configure Terminal Policies UI.

## Intelligence and Performance
- [ ] Integrate default models (Gemini 3 variants).
- [ ] Add support for Claude 3.5/4.0 and GPT-OSS.
- [ ] Build Knowledge Base for long-term memory.
- [x] Implement self-healing: Error detection, analysis, and auto-fixes.

## Testing and Validation
- [ ] Set up unit/integration tests for core components.
- [x] Create Validator agent example for code double-checking.
- [x] Test multi-agent scenarios and asynchronous feedback.
- [x] Verify Playwright-MCP server with browser control demos.

## Deployment and Documentation
- [x] Package IDE with Playwright-MCP server deployment scripts.
- [ ] Write setup guides for rules, workflows, and Validator agents.
- [ ] Document Ultrawork Loop and overall usage.

## Miscellaneous
- [x] Ensure cross-session persistence (e.g., via Markdown files).
- [ ] Optimize for performance in multi-agent environments.
- [ ] Gather feedback loops for iterative improvements.
