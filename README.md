# 🥷 Ninja Tag

A real-time, browser-based, server-authoritative 2-player 2D multiplayer tag game built with **Node.js**, **WebSockets**, **React**, and **HTML5 Canvas**.

🌐 **Live Demo**: [https://ninja-tag.vercel.app/](https://ninja-tag.vercel.app/)

---

## 🚀 Key Features & Architecture

- **🎮 Dual Play Modes**:
  - **Play vs Bot**: Instantly jump into a match against a server-authoritative virtual bot with intelligent chase/flee AI and wall-repulsion navigation. No second player needed!
  - **Play with Friends (Multiplayer)**: Create a custom waiting room with a shareable 5-character code and play head-to-head with another human player.
- **⚡ 60Hz Client-Side Prediction & Reconciliation**: Local player movement is simulated instantly on keypress using shared physics math (`shared/game/movement.js`), generating 1-to-1 sequence-numbered input commands sent at 60Hz.
- **🖥️ Server Authority**: The server executes a fixed 60Hz physics simulation loop, handling authoritative movement, boundary clamping, tag transfers, separation knockbacks, and match timers.
- **🔄 Infinite Tag Exchange & Separation Knockback**:
  - **80px Knockback Impulse**: On tag, both players are pushed 80px apart along their collision axis (160px total separation) to prevent overlapping re-tags.
  - **1.5s (90 ticks) Immunity Cooldown**: Gives the newly tagged runner time to turn and flee, enabling endless back-and-forth tagging throughout the match.
  - **Responsive Collision Detection**: Generous collision threshold (48px) and tight 50ms visual interpolation so tags trigger the instant players visually touch.
- **🤖 Server-Authoritative Bot AI**:
  - Normalized chase and flee vectors based on whether the bot is IT.
  - Dynamic wall-repulsion forces (up to strength 5 vs base 1) within a 120px boundary margin to prevent getting trapped in corners or stuck along borders.
- **⏱️ Server-Authoritative Match Timers**: Hosts select match durations (**20s**, **40s**, or **60s**). Expiration is evaluated server-side during the simulation tick — at timeout, the player who is IT loses.
- **🎨 Mario Retro Arcade Aesthetic**: NES-inspired 8-bit styling featuring `'Press Start 2P'` typography, crisp pixel drop shadows, classic palette (Sky Blue, Mario Red, Coin Yellow), and custom game-over screens (`YOU WON!` / `BOT WON!`).

---

## 🛠️ Architecture Overview

```text
React Frontend (Vercel)                               Node.js Backend (Render)
───────────────────────                               ───────────────────────
  InputManager                                          MessageHandler
    │ (WASD / Arrow keys @ 60Hz)                          │ (Sequence validation & queue)
    ▼                                                     ▼
  Prediction Engine (60Hz loop)                        Server Simulation (60Hz loop)
    ├─ 1. Predict local position                          ├─ 1. Process queued 60Hz inputs
    ├─ 2. Queue sequence command                          ├─ 2. simulatePlayerMovement(x, y, dt)
    └─ 3. Send INPUT(seq, input) over WS ─────────────►   ├─ 3. Tag collisions & IT transfers
                                                          ├─ 4. Server-authoritative timer check
  Reconciliation Engine                                   └─ 5. Snapshot Generator (20Hz)
    ├─ 1. Receive SNAPSHOT ◄───────────────────────────────┤    (tick, x, y, ACK, serverTime)
    ├─ 2. Prune pending inputs <= ACK                      └─ 6. GAME_ENDED on expiration
    ├─ 3. Reset local position to server (x,y)
    └─ 4. Replay unacknowledged commands
```

---

## 💻 Local Development

### Prerequisites
- Node.js 18+ or 20+ LTS

### 1. Start the Server
```bash
cd server
npm install
npm start
```
*Server runs on `http://localhost:3001` (WebSocket on port `3001`).*

### 2. Start the Client
```bash
cd client
npm install
npm run dev
```
*Client runs on `http://localhost:5173`.*

---

## 🧪 Automated Test Suites (38 Tests Passing)

### 1. Bot & Single-Player Acceptance Suite
```bash
node test/bot_acceptance.js
```
Runs 5 automated unit and integration tests covering:
- Instant bot room creation and `GAME_STARTED` dispatch
- 60Hz bot AI movement and position updates
- Authoritative match expiration and win/loss resolution
- Infinite back-and-forth tag exchange across multiple cycles
- Bot AI wall deflection and boundary navigation

### 2. Match Timer Acceptance Suite
```bash
node test/timer_acceptance.js
```
Runs 18 unit and integration tests covering match duration validation (20s/40s/60s), timer start/expiration lifecycle, winner/loser determination, and protocol integrity.

### 3. Master 60Hz Acceptance Suite
```bash
npm test
# or: node test/acceptance.js
```
Runs 15 automated unit and end-to-end integration tests covering sequence generation, 60Hz input commands, ACK pruning, replay accuracy, deterministic movement, room isolation, and server-authoritative tagging.

---

## 🌐 Production Deployment

### Frontend (Vercel)
- **Framework**: Vite
- **Root Directory**: `client`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variable**:
  ```env
  VITE_WS_URL=wss://ninja-tag-server.onrender.com
  ```

### Backend (Render)
- **Service Type**: Web Service (Node.js)
- **Root Directory**: `.` (Repository root)
- **Build Command**: `cd server && npm install`
- **Start Command**: `node server/src/index.js`
- **Environment Variable**: `PORT` (automatically assigned by Render)

---

## 📡 WebSocket Protocol

### Client → Server Messages

| Message Type | Parameters | Description |
|--------------|------------|-------------|
| `CREATE_BOT_ROOM` | `durationSeconds` (20, 40, 60) | Creates an instant single-player room against a virtual bot |
| `CREATE_ROOM` | `durationSeconds` (optional: 20, 40, 60) | Creates a multiplayer room with host-selected duration |
| `JOIN_ROOM` | `roomCode` | Joins an existing room by 5-character code |
| `INPUT` | `sequence`, `input` | Sends 60Hz sequence-numbered input state (`{ up, down, left, right }`) |

### Server → Client Messages

| Message Type | Payload | Description |
|--------------|---------|-------------|
| `ROOM_CREATED` | `roomCode`, `playerId`, `matchDurationSeconds` | Room creation confirmation |
| `ROOM_JOINED` | `roomCode`, `playerId` | Room join confirmation |
| `ROOM_STATE` | `roomCode`, `roomState`, `playerCount` | Lobby status update |
| `GAME_STARTED` | `yourPlayerId`, `players`, `itPlayerId`, `arena`, `matchDurationSeconds`, `serverTime` | Match start notification |
| `SNAPSHOT` | `tick`, `players`, `itPlayerId`, `serverTime` | 20Hz authoritative snapshot with input ACKs |
| `GAME_ENDED` | `reason`, `winnerId`, `loserId` | Terminal game result (`TIME_EXPIRED` or `PLAYER_DISCONNECTED`) |
| `ERROR` | `message` | Error response |

---

## 📂 Project Structure

```text
ninja-tag/
├── client/                    # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   └── GameCanvas.jsx       # 60 FPS HTML5 Canvas renderer with remote interpolation
│   │   ├── game/
│   │   │   ├── InputManager.js     # Keyboard event listener & input state builder
│   │   │   └── Prediction.js       # 60Hz prediction & reconciliation engine
│   │   ├── network/
│   │   │   ├── NetworkState.js     # Sequence & ACK tracking
│   │   │   └── WebSocketClient.js  # WSS connection manager
│   │   ├── screens/
│   │   │   ├── LandingScreen.jsx   # Dual-mode selector (Bot vs Friends) & durations
│   │   │   ├── JoinScreen.jsx      # Mario-styled room code entry
│   │   │   ├── LobbyScreen.jsx     # Waiting room with shareable code & LEAVE option
│   │   │   └── GameScreen.jsx      # Match viewport, HUD, and custom game-over overlay
│   │   ├── App.jsx                 # WebSocket event router & application state
│   │   ├── index.css               # Mario NES 8-bit styling & 'Press Start 2P' font
│   │   └── main.jsx                # React entry point
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── server/                    # Node.js WebSocket game server
│   ├── src/
│   │   ├── game/
│   │   │   ├── Game.js             # 60Hz simulation, Bot AI, knockback, and timer logic
│   │   │   ├── GameLoop.js         # Fixed-timestep loop (~4ms precision accumulator)
│   │   │   └── SnapshotGenerator.js# 20Hz snapshot constructor
│   │   ├── rooms/
│   │   │   ├── Room.js             # Room state & player map
│   │   │   └── RoomManager.js      # Room creation (human & bot) & lifecycle manager
│   │   ├── network/
│   │   │   └── MessageHandler.js   # Protocol message router & validation
│   │   └── index.js                # HTTP + WebSocket server entry point
│   └── package.json
│
├── shared/                    # Shared client/server code
│   ├── game/
│   │   └── movement.js             # Deterministic movement physics simulation
│   └── protocol/
│       └── constants.js            # Message types, arena dimensions, speeds, rates
│
├── test/
│   ├── acceptance.js               # Phase 4.7 Master acceptance test suite (15 tests)
│   ├── timer_acceptance.js         # Phase 5.4 Timer acceptance test suite (18 tests)
│   └── bot_acceptance.js           # Play vs Bot & Infinite Tag acceptance suite (5 tests)
│
├── package.json               # Root scripts
└── README.md                  # Project documentation
```
