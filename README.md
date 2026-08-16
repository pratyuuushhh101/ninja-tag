# Ninja Tag — Phase 4.4: Client-Side Prediction & Server Reconciliation

A real-time, browser-based authoritative 2-player multiplayer tag game built with Node.js, WebSockets, React, and HTML5 Canvas.

Features deterministic 60Hz server simulation, sequence-numbered client input streaming (~30Hz), 20Hz decoupled authoritative snapshots, and zero-latency client-side prediction with server reconciliation.

---

## Architecture

```text
React Client (Vite)                               Node.js Server (ws)
───────────────────                               ───────────────────
  InputManager                                      MessageHandler
    │ (WASD / Arrows state @ ~30Hz)                   │ (Validates sequence > lastReceived)
    ▼                                                 ▼
  Prediction Engine (60Hz loop)                    Server Physics Loop (60Hz accumulator)
    ├─ 1. Predict local movement                       ├─ 1. simulatePlayerMovement(x, y, input, FIXED_DT)
    ├─ 2. Queue sequence input command                 ├─ 2. Circle collision & IT role transfers
    └─ 3. Send INPUT(seq, input) over WS ──────────►  └─ 3. Snapshot Generator (20Hz)
                                                           │ (tick, (x,y), lastProcessedInput ACK)
  Reconciliation Engine                                    │
    ├─ 1. Receive SNAPSHOT ◄──────────────────────────────┘
    ├─ 2. Prune pending inputs <= ACK
    ├─ 3. Reset local position to server (x,y)
    └─ 4. Replay unacknowledged input versions
```

---

## Technical Highlights

- **Server Authority**: The server is the 100% single source of truth for physics calculations, arena boundaries, circle collisions, and IT role assignments.
- **Client Prediction**: Local player movement executes immediately at 60Hz on keypress using shared physics equations (`shared/game/movement.js`), eliminating perceived network latency.
- **Deterministic Reconciliation**: When server snapshots arrive at 20Hz, acknowledged inputs (`sequence <= lastProcessedInput`) are pruned, the local player snaps to the server position, and remaining unacknowledged input versions are replayed for their exact tick counts.
- **Sequence ACK Protocol**: Input sequence numbers represent input-state versions (`sequence`). Server updates `lastProcessedInputSequence` only when a simulation tick actually uses that state.

---

## How to Run

### Prerequisites

- Node.js 20+

### Start the Server

```bash
cd server
npm install
npm start
```
*Server starts on `http://localhost:3001` (WebSocket port `3001`).*

### Start the Client

```bash
cd client
npm install
npm run dev
```
*Client starts on `http://localhost:5173`.*

### Run Acceptance Tests

With the server running:

```bash
npm install   # (root, installs dependencies)
npm test
```

---

## Project Structure

```text
ninja-tag/
├── client/                    # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   └── GameCanvas.jsx       # 60Hz Canvas rendering engine
│   │   ├── game/
│   │   │   ├── InputManager.js     # Keyboard event capture & ~30Hz stream
│   │   │   └── Prediction.js       # 60Hz prediction & server reconciliation
│   │   ├── network/
│   │   │   ├── NetworkState.js     # Sequence & snapshot tick tracking
│   │   │   └── WebSocketClient.js  # WS connection manager
│   │   ├── screens/
│   │   │   ├── LandingScreen.jsx   # Create/Join selection
│   │   │   ├── JoinScreen.jsx      # Room code entry
│   │   │   ├── LobbyScreen.jsx     # Lobby waiting display
│   │   │   └── GameScreen.jsx      # Active game HUD & canvas
│   │   ├── App.jsx                 # Routing, WS handlers & state
│   │   ├── main.jsx                # Entry point
│   │   └── index.css               # Clean styling
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── server/                    # Node.js WebSocket server
│   ├── src/
│   │   ├── game/
│   │   │   ├── Game.js             # Authoritative 60Hz physics & collision
│   │   │   ├── GameLoop.js         # Deterministic performance.now() loop
│   │   │   └── SnapshotGenerator.js# 20Hz snapshot broadcaster
│   │   ├── rooms/
│   │   │   ├── Room.js             # Room management & broadcast
│   │   │   └── RoomManager.js      # Room creation & lookup
│   │   ├── network/
│   │   │   └── MessageHandler.js   # Message dispatch & input sequence ACK
│   │   ├── utils/
│   │   │   ├── generateRoomCode.js # 5-character room code generator
│   │   │   └── generatePlayerId.js # UUID generator
│   │   └── index.js                # Server entry point
│   └── package.json
│
├── shared/                    # Shared code between client & server
│   ├── game/
│   │   └── movement.js             # Shared simulatePlayerMovement engine
│   └── protocol/
│       └── constants.js            # Message types, speeds, rates
│
├── test/
│   └── acceptance.js               # Acceptance test suite (11 tests)
│
├── package.json              # Root test runner scripts
└── README.md
```

---

## WebSocket Protocol

### Client → Server

| Type | Fields | Description |
|------|--------|-------------|
| `CREATE_ROOM` | — | Create a new game room |
| `JOIN_ROOM` | `roomCode` | Join an existing game room |
| `INPUT` | `sequence`, `input` | Sequence-numbered input state (`{ up, down, left, right }`) |

### Server → Client

| Type | Fields | Description |
|------|--------|-------------|
| `ROOM_CREATED` | `roomCode`, `playerId`, `roomState`, `playerCount` | Room creation response |
| `ROOM_JOINED` | `roomCode`, `playerId`, `roomState`, `playerCount` | Room join response |
| `GAME_STARTED` | `yourPlayerId`, `players`, `itPlayerId`, `arena`, `tick` | Game start notification |
| `SNAPSHOT` | `tick`, `players`, `itPlayerId` | 20Hz snapshot (`players` contains `lastProcessedInput` ACK) |
| `GAME_ENDED` | `reason` | Game over notification |
| `ERROR` | `message` | Error response |

---

## Gameplay Mechanics

- **Arena**: 1000px × 600px clamped boundary.
- **Player Speed**: 250 px/s with normalized diagonal vectors ($dx / \sqrt{dx^2 + dy^2}$).
- **Player Radius**: 20px circle (Tag transfer on overlap $\le 40$px).
- **IT Role**: One player is IT (orange). Tagging another player transfers IT with an anti-flicker unlock distance requirement.
