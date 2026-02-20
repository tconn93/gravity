# Gravity

**Agent-First IDE**

[![GitHub stars](https://img.shields.io/github/stars/OWNER/gravity?style=social)](https://github.com/tconn93/gravity)

> Antigravity — Where AI agents build, verify, and ship code as your teammates.

Gravity is an innovative **agent-first IDE** built on Electron, React, Monaco Editor, xterm Terminal, and Playwright. Agents act as proactive developers across **three surfaces** (Editor, Terminal, Browser), following the **Ultrawork Loop** (Plan → Act → Verify → Report).

Current status: **Functional MVP** with agent tools for file ops, shell execution, browser automation, and MD artifacts.

## ✨ Features

- **Three Surfaces**:
  - 🖥️ **Editor**: Monaco-powered code editing with artifact generation (plans, diffs).
  - 🖥️ **Terminal**: xterm shell with policies (auto-run or review).
  - 🌐 **Browser**: Playwright for clicks, screenshots, UI testing.
- **Ultrawork Loop**: Structured phases with `task_plan.md`, `progress.md`, artifacts.
- **Mission Control**: Spawn agents (Developer, Architect, Validator) in parallel.
- **Artifacts**: Task lists, walkthroughs, MD summaries for trust & review.
- **Customization**: `.agent/` ecosystem (rules, workflows, skills) – Phase 1.
- **Models**: OpenAI (GPT), extensible to Claude/Gemini.

## 🚀 Quickstart

1. **Clone & Install**:
   ```bash
   git clone <repo>
   cd gravity
   npm install
   ```

2. **Environment**:
   ```bash
   cp .env.example .env
   # Edit .env: OPENAI_API_KEY=your-key
   ```

3. **Development**:
   ```bash
   npm run dev
   ```

4. **Build & Distribute**:
   ```bash
   npm run build    # Builds app
   npm run dist     # Creates installers (Win/Mac/Linux)
   ```

## 🔄 Ultrawork Loop

Agents execute tasks in 4 phases:

1. **Plan**: Explore files, create `task_plan.md`, task_list artifact.
2. **Act**: `write_file`, `run_command`, etc.
3. **Verify**: Run tests/builds.
4. **Report**: Walkthrough artifact listing changes.

**Example**: "@developer Fix bug in App.tsx"

See [PLAN.md](./PLAN.md) for architecture.

## 📋 Next Steps

- [ROADMAP.md](./ROADMAP.md) – Phase 1: Quick Wins (Settings UI, .agent/)
- [TODO.md](./TODO.md) – Detailed tasks
- Try spawning an agent in the app!

## 🤝 Contributing

1. Fork & PR.
2. Use Ultrawork Loop for features.
3. See [CLAUDE.md](./CLAUDE.md) for AI guidelines.

## 📄 License

[MIT](./LICENSE) *(or check LICENSE)*

---

⭐ Star on GitHub | [Demo Video](communication/) coming soon