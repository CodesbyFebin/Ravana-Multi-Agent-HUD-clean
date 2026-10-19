# RAVANA Integration Status

This inventory reflects the React application and Express server in this repository. “Backend” means the single local Node.js process; it does not imply a hosted or multi-instance service.

## Mounted panels

| Panel | Current source and mode | Persistence / route | Remaining work |
| --- | --- | --- | --- |
| Queen command console | One Gemini-backed request path; selected role is prompt context | `POST /api/chat`; WebSocket `/live`; review via `POST /api/adversarial-review`; optional TTS via `POST /api/tts` | No independent agent workers, hosted auth, or public API deployment |
| Agent swarm cards | Ten UI identities; status events update cards, commands use the shared orchestrator | React state; `/live` `agent_status` events | Implement worker processes/queues before claiming multi-agent execution |
| Task board | Local Express API when available; session-only on static Pages | `GET/POST /api/tasks`, `PATCH /api/tasks/:taskId`; `.ravana-data/tasks.json`; `tasks_sync` WebSocket event | Multi-user identity, database transactions, server-side authorization, task deletion/retention |
| Paper portfolio | Simulated USDC portfolio, local only | `GET /api/portfolio`; `.ravana-data/portfolio.json` | Durable shared database and independent financial reconciliation; no live trading |
| Market ticker | Public read-only Binance quotes with a short in-process cache | `GET /api/market/tickers` | Provider health/metrics; external dependency may be unavailable |
| Claw strategy profiles | Static inactive profiles plus current paper portfolio snapshot | `GET /api/trading/claw-bots`; WebSocket snapshot | No bot strategy loop, order execution, or custody |
| Treasury view | Re-labels the paper portfolio as a paper treasury; not a separate vault | `GET /api/portfolio` | No treasury ledger, wallet connection, or profit sweep |
| Episodic memory search | Local daily paper-activity summaries | `GET /api/memory/search`; `.ravana-data/episodic-memories.json` | Search is local and keyword-based; no hosted database or vector index |
| User memory vault | Redacts supported secrets/PII before saving; session-only on static Pages | `GET/POST /api/memories`; `.ravana-data/user-memories.json` | User accounts, access controls, encryption/key management, retention/deletion controls |
| DevOps / host telemetry | Measures the local Node process host; unconfigured integrations are shown disconnected | WebSocket `/live`; `GET /api/status` | Docker, CI, remote cluster, scanner, network throughput and latency adapters |
| Tools and harness | Bounded local read-only diagnostics and explicit local execution gates | `/api/status`; tool calls inside the server | Independent workers, remote CI, container orchestration, external skills |
| Communications and intelligence | Disconnected status cards; no sample inbox or threat feed | No provider routes | OAuth/token storage and provider-specific connectors |
| Executive tools | Browser timer and notes | Notes in browser `localStorage`; timer in React state | Shared storage, calendar, notifications, and account sync |
| Model status | Static Gemini metadata; activity reflects successful requests | React/server process memory; `/live` model status | Provider availability verification, real pricing, and additional provider adapters |

The UI includes other shell and overlay components (reactor canvas, callouts, review modal, settings, and proactive drawer). The current React source does not define a 37-item panel inventory. Do not describe the grouped components as 37 independently wired widgets without adding and verifying such an inventory.

## API and security boundary

The Express process binds to loopback only. It refuses a non-loopback `HOST` because it has no user authentication. HTTP requests with an `Origin` header and WebSocket connections are checked against exact local origins plus `ALLOWED_ORIGINS`. Requests without an `Origin` are allowed for local non-browser clients. This is a local development boundary, not production authentication or a public hosting configuration.

All current persistence is single-process local JSON files under `.ravana-data` except browser notes/session state and ephemeral agent/model/review state. It is not PostgreSQL, not shared between instances, and not a hosted service. Back up the data directory before upgrades and do not expose the server to the internet.

## Tests

`npm test` covers unit behavior and file-store persistence/redaction. Local HTTP smoke verification covers task create/update, server-side memory redaction, and exact-origin rejection. GitHub Pages deploys only the Vite static frontend; it cannot run these APIs or the WebSocket server.
