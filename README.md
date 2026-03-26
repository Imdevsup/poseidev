# ⚡ Poseidev

**The AI-Powered CLI Code Editor** — Multi-model orchestration, file operations, agent collaboration, and auto-build, all from your terminal.


---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🤖 **Multi-Model AI** | 5 models: Kimi K2, Qwen 3.5 397B, GLM 5, GPT-4o, GPT-4o Mini |
| 📁 **File Operations** | AI creates, edits, deletes, and renames files directly on disk |
| 🤝 **Model Collab** | All 3 NVIDIA models confer in rounds (Architect → Engineer → Reviewer) |
| 🔧 **Auto-Build** | 6-phase AI pipeline: architecture → schema → backend → frontend → integration → polish |
| 🔍 **Code Analysis** | Health reports, security scans, complexity analysis, dependency checks |
| 🧪 **Test Generation** | AI-powered test writing and coverage analysis |
| 🔒 **Security Scanning** | Static analysis + AI-driven vulnerability detection |
| 💬 **REPL Chat** | Persistent conversation with context, streaming, and markdown rendering |
| 🎨 **Beautiful TUI** | Gradients, panels, spinners, syntax highlighting, and themed output |

---

## 🛠️ Install from GitHub (for developers)


```bash
npm install poseidev

OR

# 1. Clone the repo
git clone https://github.com/Imdevsup/poseidev.git
cd poseidev/cli

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Link globally (makes 'poseidev' command available everywhere)
npm link

# 5. Set your API key (required — no keys are bundled)
poseidev config set-key nvidia-kimi YOUR_API_KEY

# 6. Start using
poseidev
```

> **⚠️ Important:** Poseidev ships with **no API keys**. Every user must provide their own.
> Get a free key at [build.nvidia.com](https://build.nvidia.com).

---

## 💻 Usage

### Interactive REPL (main mode)

```bash
poseidev
```

Opens an interactive session. Type naturally — the AI creates files, edits code, and answers questions.

```
  ❯ create a REST API with Express and MongoDB

  ◆ Writing files...

  ✓ src/index.ts       42 lines · 1.2 KB · /project/src/index.ts
  ✓ src/routes/api.ts   28 lines · 890 B  · /project/src/routes/api.ts
  ✓ package.json        25 lines · 856 B  · /project/package.json

  ✓ All 3 file(s) written and verified
```

### Slash Commands

| Command | What it does |
|---------|-------------|
| `/model` | List and switch between AI models |
| `/key` | View and set API keys |
| `/collab <task>` | All 3 models collaborate on a task |
| `/build` | Start the 6-phase auto-build engine |
| `/read <file>` | Read and display a file |
| `/ls [path]` | List files in a directory |
| `/create <file>` | Create a new empty file |
| `/delete <file>` | Delete a file |
| `/rename <old> <new>` | Rename or move a file |
| `/search <query>` | Search project files |
| `/help` | Show all 25+ commands |

### One-Shot Commands

```bash
# Chat without entering the REPL
poseidev chat "explain this error: Cannot read property of undefined"

# Analyze code health
poseidev analyze health

# Security scan
poseidev security scan

# Generate tests
poseidev test generate

# Auto-build a full project
poseidev build
```

---

## 🤝 Multi-Model Collaboration

The `/collab` command makes all 3 NVIDIA models work together in rounds:

```
  ━━━ Multi-Model Collaboration ━━━
  Models conferring in rounds, building on each other's input

  🧠 Architect     Kimi K2 Instruct
  ⚡ Engineer       Qwen 3.5 397B
  🔍 Reviewer       GLM 5

  ───── Round 1 — 🧠 Architect ─────
  [Proposes design and file structure]

  ───── Round 2 — ⚡ Engineer ─────
  [Builds on Architect's plan, adds implementation]

  ───── Round 3 — 🔍 Reviewer ─────
  [Critiques both, finds issues]

  ───── Round 4 — 🧠 Architect ─────
  [Incorporates all feedback into final plan]

  ───── Final — Implementation ─────
  [Engineer writes all files based on agreed plan]
```

---

## ⚙️ Configuration

### API Keys

Poseidev supports multiple AI providers. Set keys from the terminal or inside the REPL:

```bash
# From terminal
poseidev config set-key nvidia-kimi YOUR_KEY
poseidev config set-key nvidia-glm5 YOUR_KEY
poseidev config set-key nvidia-qwen YOUR_KEY
poseidev config set-key openai YOUR_KEY

# From inside the REPL
/key nvidia-kimi YOUR_KEY
/key openai YOUR_KEY
```

### Models

| Model | Provider | Key Required |
|-------|----------|-------------|
| Kimi K2 Instruct | NVIDIA NIM | `nvidia-kimi` |
| Qwen 3.5 397B | NVIDIA NIM | `nvidia-qwen` |
| GLM 5 | NVIDIA NIM | `nvidia-glm5` |
| GPT-4o | OpenAI | `openai` |
| GPT-4o Mini | OpenAI | `openai` |

Switch models anytime:
```bash
/model qwen/qwen3.5-397b-a17b
```

### Settings

```bash
poseidev config show          # View all settings
poseidev config reset         # Reset to defaults
```

Or from the REPL:
```
/tokens max 4096     # Set max tokens
/tokens temp 0.7     # Set temperature
/level expert        # Set experience level
/stream              # Toggle streaming
```

---

## 📁 File Operations

The AI can manipulate files directly. All operations are **verified** — Poseidev checks that files were written correctly.

```
  ✓ src/index.ts      42 lines · 1.2 KB · C:\project\src\index.ts     ← verified
  ✓ package.json      25 lines · 856 B · C:\project\package.json      ← verified
  ⚠ config.ts         written but size mismatch                        ← flagged
```

Verification checks:
- ✅ File exists after write
- ✅ Content size matches expected
- ✅ Deletion confirmed (file gone)
- ✅ Rename verified (old gone, new exists)

---

## 🏗️ Project Structure

```
poseidev/
├── cli/
│   ├── src/
│   │   ├── index.ts              # Entry point + CLI commands
│   │   ├── repl.ts               # Interactive REPL
│   │   ├── config/
│   │   │   └── configManager.ts  # Persistent config storage
│   │   ├── models/
│   │   │   └── modelManager.ts   # Multi-model + fallback chain
│   │   ├── files/
│   │   │   └── fileOperations.ts # File ops engine + verification
│   │   ├── collab/
│   │   │   └── collabEngine.ts   # Multi-model collaboration
│   │   ├── build/
│   │   │   ├── autoBuildEngine.ts # 6-phase auto-build
│   │   │   └── codeExtractor.ts  # Code extraction from AI
│   │   ├── chat/
│   │   │   ├── conversationStore.ts
│   │   │   └── markdownRenderer.ts
│   │   ├── ui/
│   │   │   └── display.ts        # TUI components
│   │   ├── commands/             # 14 CLI command modules
│   │   ├── prompts/
│   │   │   └── promptEnhancer.ts
│   │   ├── search/
│   │   │   └── searchEngine.ts
│   │   └── onboarding/
│   │       └── wizard.ts         # First-run setup wizard
│   ├── package.json
│   └── tsconfig.json
├── .gitignore
└── README.md
```


---


## 🧩 Requirements

- **Node.js** ≥ 18.0.0
- **npm** ≥ 8
- At least one API key (NVIDIA NIM keys are free at [build.nvidia.com](https://build.nvidia.com))

---

## 📝 License

MIT © Poseidev

---

<p align="center">
  <b>Built with ⚡ by the Poseidev team</b>
  <br>
  <sub>Multi-model AI orchestration for the terminal</sub>
</p>
