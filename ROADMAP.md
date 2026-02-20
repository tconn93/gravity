# Gravity (Antigravity) Roadmap

## 🎯 Vision & Overview
Transform the current Electron-React prototype into a full **agent-first IDE** with **Three Surfaces** (Editor, Terminal, Browser), **Mission Control** dashboard, **Ultrawork Loop** (Plan→Act→Verify→Report), and deep customization (`.agent/` dirs). 

**Guiding Principles** (from PLAN.md/TODO.md):
- Agents as proactive teammates.
- Users as architects: Review/approve, don't micromanage.
- Trust via artifacts, visuals, policies.
- Local-first, secure, performant.

**Current State**: Functional MVP (Monaco editor, xterm terminal, OpenAI, Playwright-core demoed). No VSCode fork yet.

**Estimated Timeline**: 1-3 months to v1.0 (solo dev). Track via GitHub Projects or this file.

## 🚀 Milestones & Phases

### Phase 0: Foundation (Complete – Now)
- [x] Electron-React prototype (editor/terminal/AI).
- [x] Playwright-core integration (browser demo: click automation).
- [x] Marketing landing (`communication/index.html`).
- [x] Ultrawork Loop tooling (MD files, phases).

### **Phase 1: Quick Wins (1 Week – v0.1)**
Polish for immediate usability/shareability.
| Task | Details | Effort | Deps |
|------|---------|--------|------|
| [ ] `.agent/` structure | Create dirs: `rules/` (instructions), `workflows/` (macros), `skills/` (scripts). Add templates. | 1h | None |
| [ ] Enhanced README | Quickstart, screenshots (use `trial-clicked.png`), Ultrawork Loop guide. | 30min | None |
| [ ] Settings UI | React component: Model keys (.env), Terminal policies (Turbo/Review). | 2h | React |
| [ ] Basic deploy | `npm run dist` → GitHub Releases. | 1h | electron-builder |

**Milestone Goal**: Demo-ready prototype. Ship v0.1.

### **Phase 2: Core MVP (2-3 Weeks – v1.0)**
Build \"Three Pillars\" and Mission Control.
| Task | Category | Details | Effort | Deps |
|------|----------|---------|--------|------|
| [ ] Agent Dashboard | Mission Control | React sidebar: Spawn/monitor agents, MD viewers (task_plan/progress), approve actions. | 2 days | Phase 1 |
| [ ] Full Browser Surface | Browser Pillar | Embed Chromium (Playwright/Electron webview). API: `/click`, `/screenshot`. MCP endpoints. | 3 days | Playwright |
| [ ] Artifacts System | Loop/UI | Monaco tabs for task_list/plans/walkthroughs. Inline review/comments. Auto-gen. | 1 day | Dashboard |
| [ ] Multi-Agent Parallelism | Agents | Async spawn (e.g., Architect + Developer). Shared MD state. | 2 days | Dashboard |
| [ ] Terminal Policies UI | Terminal Pillar | Toggle: Auto-run commands or review. Safeguards (deps/builds). | 1 day | xterm |
| [ ] Validator Agent | Self-Healing | Role: Code review, test verify. Example skill. | 1 day | Multi-agent |

**Milestone Goal**: End-to-end agent workflow (e.g., \"Build feature X\"). Ship v1.0.

### **Phase 3: Advanced Features (1 Month – v2.0)**
Scale & polish.
| Task | Category | Details | Effort | Deps |
|------|----------|---------|--------|------|
| [ ] VS Code Fork | Editor Pillar | Migrate Monaco → full VSCode (extensions, tab completion, Cmd+I NL). | 1 week | v1.0 |
| [ ] Multi-Model Support | Intelligence | Gemini 3, Claude 3.5/4, Ollama. Selector UI. | 2 days | Settings |
| [ ] Knowledge Base | Memory | Embeddings for repo/docs. Long-term agent memory. | 3 days | OpenAI |
| [ ] Self-Healing Loop | Reliability | Error detect → analyze → fix. Integrate Validator. | 2 days | v1.0 |
| [ ] UI/UX Polish | All | Themes, artifacts recordings, multi-project. | 3 days | v1.0 |

**Milestone Goal**: Production-ready. Enterprise features.

### **Phase 4: Growth & Ecosystem (Ongoing – v3.0+)**
| Task | Details | Effort |
|------|---------|--------|
| [ ] Marketing Expansion | Functional CTAs (Stripe), demo videos, Vercel landing. | 1 day |
| [ ] Testing Suite | E2E Playwright tests, Validator examples. | 2 days |
| [ ] Deployment | Auto-updates, on-prem Docker, SOC2 prep. | 1 week |
| [ ] Community | VSCode marketplace? Plugins for agents. | Ongoing |

## 📋 Full TODO Integration (from TODO.md)
**Mapped & Prioritized**:
- **Editor**: File ops/artifacts (Phase 2/3).
- **Terminal**: Policies/safeguards (Phase 2).
- **Browser**: Playwright-MCP (Phase 2 – demoed!).
- **Agent Mgmt**: Dashboard/roles/parallelism (Phase 2).
- **Ultrawork Loop**: Phases/artifacts (Phase 2).
- **Customization**: .agent/ (Phase 1).
- **Intelligence**: Models/memory/healing (Phase 3).
- **Testing/Deploy**: (Phase 4).

## ⚠️ Risks & Dependencies
- **VSCode Fork**: High effort; prototype first.
- **Playwright-MCP**: Clarify \"MCP\" (Model Context Protocol?); use core for now.
- **Models**: API costs/keys.
- **Review Cadence**: Weekly milestone check-ins.

## 🎉 How to Use This Roadmap
- **Track Progress**: GitHub checkboxes or ZenHub.
- **Assign Agent Tasks**: E.g., \"@developer Implement dashboard\".
- **Next Action**: Pick Phase 1 task → I can execute via Ultrawork Loop!

Updated: $(date). Feedback welcome!