# 🥷 Ninja Tag

A real-time, browser-based, server-authoritative 2-player 2D multiplayer tag game built with **Node.js**, **WebSockets**, **React**, and **HTML5 Canvas**.

🌐 **Live Demo**: [https://ninja-tag.vercel.app/](https://ninja-tag.vercel.app/)

---

## 🚀 Key Features & Architecture

- **60Hz Client-Side Prediction & Reconciliation**: Local player movement is simulated instantly on keypress using shared physics math (`shared/game/movement.js`), generating 1-to-1 sequence-numbered input commands sent at 60Hz.
- **Server Authority**: The server executes a fixed 60Hz physics simulation loop, handling authoritative movement, boundary clamping, tag transfers, and match timers.
- **Decoupled Snapshots & Remote Interpolation**: Server broadcasts authoritative snapshots at 20Hz. Remote players render smoothly at 60 FPS using a visual-only snapshot interpolation buffer (100ms render delay).
- **Server-Authoritative Match Timers**: Hosts select match durations (**20s**, **40s**, or **60s**). Expiration is evaluated server-side during the simulation tick — at timeout, the player who is IT loses.
- **Polished 2D Indie Visuals**: Layered 2D environment (sky, clouds, distant hills, ground with grass tufts, trees, rocks, bushes, flowers) with stylized ninja characters, pulsing IT markers, and a responsive full-viewport Canvas.

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

## 🧪 Automated Test Suites

### Master Acceptance Suite (Phase 4.7 Architecture)
```bash
npm test
# or: node test/acceptance.js
```
Runs 15 automated unit and end-to-end integration tests covering sequence generation, 60Hz input commands, ACK pruning, replay accuracy, deterministic movement, room isolation, and server-authoritative tagging.

### Timer Acceptance Suite (Phase 5.4 Server-Authoritative Timer)
```bash
node test/timer_acceptance.js
```
Runs 18 unit and integration tests covering match duration validation (20s/40s/60s), timer start/expiration lifecycle, winner/loser determination, and protocol integrity.

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
| `CREATE_ROOM` | `durationSeconds` (optional: 20, 40, 60) | Creates a new room with host-selected duration |
| `JOIN_ROOM` | `roomCode` | Joins an existing room by 5-character code |
| `INPUT` | `sequence`, `input` | Sends 60Hz sequence-numbered input state (`{ up, down, left, right }`) |

### Server → Client Messages

| Message Type | Payload | Description |
|--------------|---------|-------------|
| `ROOM_CREATED` | `roomCode`, `playerId`, `matchDurationSeconds` | Room creation confirmation |
| `ROOM_JOINED` | `roomCode`, `playerId` | Room join confirmation |
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
│   │   │   ├── LandingScreen.jsx   # Match duration selector & room creation/join
│   │   │   ├── JoinScreen.jsx      # Room code input
│   │   │   ├── LobbyScreen.jsx     # Waiting room screen
│   │   │   └── GameScreen.jsx      # Match viewport, HUD, and game-over overlay
│   │   ├── App.jsx                 # WebSocket event router & application state
│   │   └── main.jsx                # React entry point
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── server/                    # Node.js WebSocket game server
│   ├── src/
│   │   ├── game/
│   │   │   ├── Game.js             # Authoritative 60Hz simulation & match timer logic
│   │   │   ├── GameLoop.js         # Fixed-timestep loop (~4ms precision accumulator)
│   │   │   └── SnapshotGenerator.js# 20Hz snapshot constructor
│   │   ├── rooms/
│   │   │   ├── Room.js             # Room state & player map
│   │   │   └── RoomManager.js      # Room creation & lifecycle manager
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
│   ├── acceptance.js               # Phase 4.7 Master acceptance test suite
│   └── timer_acceptance.js         # Phase 5.4 Timer acceptance test suite
│
├── package.json               # Root scripts
└── README.md                  # Project documentation
```
