<img width="1672" height="941" alt="Ravana’s Ten-Headed AI Command Center" src="https://github.com/user-attachments/assets/cc2095bf-b119-481a-b6aa-b018e8cbee27" />
# RAVANA — AI Agentic HUD

**RAVANA** is an AI agentic HUD and multi-agent command centre by **CodesbyFebin**. It brings voice commands, specialist agents, model routing, live system telemetry, task and memory panels, and human-reviewed actions into a single cyberpunk dashboard.

Explore the project: [RAVANA on GitHub](https://github.com/CodesbyFebin/Ravana-Multi-Agent-HUD-clean) · [CodesbyFebin](https://github.com/CodesbyFebin)

> RAVANA is an experimental developer project. The dashboard includes demo and simulated data; review the notes below before treating any panel as a production system.

## What it does

- **Agentic HUD:** a full-screen React dashboard with a Three.js reactor visualization, agent status, command controls, and modular panels.
- **Voice command interface:** browser speech recognition where available, text-to-speech output, and a voice activity display.
- **Agent workflow:** routes prompts through a task classifier, tracks specialist agent state, and streams command events to connected clients over WebSockets.
- **Model integration:** server-side Gemini API integration through `@google/genai`, with model selection and optional Google Search or Maps grounding where configured.
- **Review gate:** high-impact command categories can open an adversarial review panel for a person to approve or reject.
- **Live server telemetry:** CPU, memory, uptime, and connected-client metrics are read from the running Node.js host and sent over the `/live` WebSocket.
- **Workspace panels:** local file-backed tasks and user notes when the Express server is running, model status, proactive suggestions, and grouped DevOps, finance, communications, and executive widgets.
- **Controls:** freeze switch, visual themes, audio toggle, and responsive navigation dock.

## Screens and panels
<img width="2155" height="730" alt="RAVANA Multi-Agent AI HUD Showcase" src="https://github.com/user-attachments/assets/e948b573-21cb-4cd3-af1b-f2c351f2b358" />

The HUD organizes controls into overview, DevOps and infrastructure, trading and finance, communications and intelligence, executive tools, agents and skills, models, tasks, and memory. The interface is designed as a single-pane AI agent dashboard for observing and interacting with an agentic workflow.

## Run locally

Requirements: Node.js 20+ and npm, pnpm, or Bun.

```bash
git clone https://github.com/CodesbyFebin/Ravana-Multi-Agent-HUD-clean.git
cd Ravana-Multi-Agent-HUD-clean
npm install
cp .env.example .env
```

Add a Gemini API key to `.env` to enable the server-side Gemini integration:

```dotenv
GEMINI_API_KEY=your_gemini_api_key
APP_URL=http://localhost:3000
```

Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To create a static frontend build, run `npm run build`. For a production-style server, run `npm run build && npm start`.

## GitHub Pages download

The public [GitHub Pages site](https://codesbyfebin.github.io/Ravana-Multi-Agent-HUD-clean/) is a download portal for the source ZIP. It does not publish the interactive HUD, API, WebSocket server, database, worker, or private personal configuration. The workflow type-checks, tests, and builds the frontend, then packages the checked-in source from that commit for download. The ZIP omits `.git`, runtime data, dependencies, and populated environment files.

This download-only page does not restrict access to the public GitHub repository: visitors can still browse, clone, and fork the source. Forks can run the app locally by following the instructions below. The backend is local-only and must not be exposed to the public internet.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Optional | Enables Gemini requests, grounding, and generated speech through the server. Without it, chat and review requests fail closed with HTTP 503; no model response is generated. |
| `APP_URL` | Optional | Public app URL for deployments that need to refer to their own host. |
| `RAVANA_DATA_DIR` | Optional | Local single-process JSON file-store directory; defaults to `.ravana-data`. This is not a shared database or multi-instance store. |

Keep API keys on the server. Do not expose secrets in frontend variables or commit a populated `.env` file.

## Architecture

```text
React + TypeScript HUD
  ├── Three.js reactor and modular dashboard widgets
  ├── Voice command and browser speech APIs
  ├── Model/task routing and human review UI
  └── HTTP API + WebSocket client (/live)
          └── Express server + Gemini API (optional)
```

The browser UI talks to the local Express server for chat, speech, and adversarial-review requests. The server broadcasts telemetry, agent state, model state, command events, and task updates through a WebSocket endpoint at `/live`.

Personal hosted deployment is a separate workstream. See [Personal deployment direction](docs/PERSONAL_DEPLOYMENT.md) for the security, persistence, and worker gates that must be completed before any remote API is exposed.

## Important: demo data and safety boundaries

RAVANA is a prototype HUD, not a finished autonomous-agent runtime. The ten agent cards are role identities routed through one shared Gemini-backed orchestrator, not ten independent workers. Claw bot cards are inactive strategy profiles; no bot trading loop or exchange order execution is running. The model pool starts from static metadata, while online status and usage update after successful requests. Host CPU, memory, disk, uptime, and WebSocket client counts are measured from the local Node.js process; network speed, latency, token rate, and some cost values are not measured. Market tickers use Binance's public read-only API when available. Tasks and user notes persist to local JSON files when the Express backend is running; on GitHub Pages they are session-only because Pages has no API or shared database. Episodic summaries use a separate local JSON file. Communications and external infrastructure integrations are disconnected.

The review UI is not a production safety control. Approved execution is disabled by default and, when explicitly enabled, is limited to the local harness's allowlisted paper-trading and diagnostic actions; deployment approval records intent only. It does not submit exchange orders or deploy software. Do not expose this development server to the public internet.

## Built with

React · TypeScript · Vite · Express · WebSockets · Three.js · Tailwind CSS · Google GenAI SDK · Lucide

## Search terms

AI agentic HUD · AI agent dashboard · multi-agent AI command centre · agent orchestration dashboard · voice-controlled AI assistant · LLM routing interface · real-time AI agent monitoring · adversarial AI review

## Author

Built by [CodesbyFebin](https://github.com/CodesbyFebin) — [Portfolio](https://codesbyfebin.github.io/) · [LinkedIn](https://www.linkedin.com/in/codes-by-febin/)

## License

No license file is present yet. Until a license is added, normal copyright applies and reuse permissions are not granted.


## Agent execution harness

The local server can attach bounded, read-only diagnostics, repository status, dependency summaries, and Binance public ticker observations to model context. These are observation adapters, not a general ReAct loop or a claim that the agents operate independently. Market data may be unavailable if Binance is unreachable.

Approvals are bound to a server-generated, single-use review ID and expire after 15 minutes. Decisions are written to a SHA-256 hash-chained JSONL receipt ledger under `.ravana-data/`. Approved execution is disabled by default; set `RAVANA_ENABLE_APPROVED_EXECUTION=true` in the local server environment to enable the supported paper trade, fixed allowlisted local checks, and deployment-intent recording. Paper trades use simulated USDC only and never submit exchange orders. Deployment approval records an intent manifest; it does not deploy software. The server binds to `127.0.0.1` by default and rejects non-local WebSocket origins.

Do not expose this development server to the public internet. GitHub Pages distributes the source ZIP only.
