# Poseidev CLI

Poseidev is an autonomous AI-driven code editor and project generator. It leverages LLMs to architect, design, and write full-stack applications in your terminal.

## Core Features

- **Autonomous File Execution**: The AI edits, creates, and renames files autonomously with real-time feedback.
- **Terminal Execution**: Poseidev can run tests, builds, and development servers using `===TERMINAL: command===`. It auto-debugs failed terminal executions.
- **Visual Overhauls (/revamp)**: Initiates an explosive, award-winning UI/UX component redesign of your frontend codebase.
- **Multi-Agent Collaboration**: Leverage architect, engineer, and designer agents for complex projects.
- **Auto-Build Engine**: Iterative phased generation for scaling up projects fast.

## Commands Reference

The Poseidev REPL offers multiple slash commands to help you manage your project directly from the chat prompt:

### Chat & AI
- `/help`, `/h` - Show all commands
- `/model`, `/m [id]` - List or switch active AI models
- `/key [provider] [key]` - View or set API keys for (e.g., deepseek, nvidia-kimi)
- `/tokens`, `/t [max|temp] [val]` - Adjust max tokens or temperature
- `/level [lvl]` - Set experience level to beginner, intermediate, or expert
- `/stream` - Toggle streaming AI outputs
- `/context`, `/ctx` - Show conversation context info
- `/config` - Show current config path and values

### Files
- `/read`, `/cat <file>` - Read and display file contents in the REPL
- `/ls`, `/dir [path]` - List files in a directory
- `/create <file>` - Create an empty file
- `/delete`, `/rm <file>` - Delete a file
- `/rename`, `/mv <old> <new>` - Rename or move a file
- `/search <query>` - Run a fast code search

### Tools
- `/collab <task>` - Spin up a 3-agent orchestration (Architect -> Engineer -> Reviewer)
- `/build`, `/b` - Invoke the automated auto-build system
- `/revamp` - Trigger a massive visual/award-winning UI UX architectural overhaul
- `/agents`, `/a` - Quick agent info and queries
- `/project`, `/p` - Info about the detected project files and stack
- `/analyze` - Run health, security, complexity, or dependency checks

### Session
- `/clear`, `/c` - Clear the current chat context
- `/save`, `/s [name]` - Save conversation history
- `/load`, `/l <id>` - Load a previous conversation
- `/exit`, `/q` - Exit Poseidev

## Installation

You can install Poseidev globally directly from NPM:

```bash
npm i poseidev
```

Once installed, the `poseidev` and `psd` commands will be available in your terminal.

## Getting Started

1. Set your API keys: `poseidev chat` -> `/key nvidia-kimi YOUR-KEY-HERE`
2. Initialize a project: `poseidev project init`
3. Ask Poseidev to build anything!
