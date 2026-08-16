# Ninja Tag — Phase 1: Multiplayer Room & Lobby Foundation

A browser-based real-time multiplayer game foundation. Phase 1 implements the room/lobby system where two independent browser clients can create and join rooms via 5-character codes, with synchronized lobby state over WebSocket.

**There is no gameplay in Phase 1.** This phase establishes the multiplayer connection infrastructure.

## Architecture

```
React Client (Vite)
     |
     | JSON / WebSocket
     v
Node.js WebSocket Server (ws)
     |
     v
Room Manager (in-memory)
     |
     ├── Room A (K7PX2)
     │    ├── Player 1 (uuid)
     │    └── Player 2 (uuid)
     │
     └── Room B (P4M8Q)
          ├── Player 1 (uuid)
          └── (waiting)
```

## How to Run

### Prerequisites

- Node.js 20+

### Start the Server

```bash
cd server
npm install
npm start
```

Server runs on `http://localhost:3001`.

### Start the Client

```bash
cd client
npm install
npm run dev
```

Client runs on `http://localhost:5173`.

### Run Acceptance Tests

With the server running:

```bash
npm install   # (root, installs ws for tests)
npm test
```

## Project Structure

```
ninja-tag/
├── client/                    # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   └── GameCanvas.jsx       # Canvas placeholder
│   │   ├── screens/
│   │   │   ├── LandingScreen.jsx    # Create/Join buttons
│   │   │   ├── JoinScreen.jsx       # Room code input
│   │   │   └── LobbyScreen.jsx      # Lobby display
│   │   ├── network/
│   │   │   └── WebSocketClient.js   # WS connection manager
│   │   ├── App.jsx                  # Screen routing & state
│   │   ├── main.jsx                 # Entry point
│   │   └── index.css                # Minimal reset CSS
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── server/                    # Node.js WebSocket server
│   ├── src/
│   │   ├── rooms/
│   │   │   ├── Room.js              # Room class & broadcast
│   │   │   └── RoomManager.js       # In-memory room management
│   │   ├── network/
│   │   │   └── MessageHandler.js    # Protocol validation & dispatch
│   │   ├── utils/
│   │   │   ├── generateRoomCode.js  # Crypto-secure 5-char codes
│   │   │   └── generatePlayerId.js  # UUID player IDs
│   │   └── index.js                 # Server entry point
│   └── package.json
│
├── shared/                    # Shared protocol definitions
│   └── protocol/
│       └── constants.js             # Message types, states, errors
│
├── test/
│   └── acceptance.js                # All 8 acceptance tests
│
├── package.json               # Root scripts
└── README.md
```

## WebSocket Protocol

### Client → Server

| Type | Fields | Description |
|------|--------|-------------|
| `CREATE_ROOM` | — | Create a new room |
| `JOIN_ROOM` | `roomCode` | Join an existing room |

### Server → Client

| Type | Fields | Description |
|------|--------|-------------|
| `ROOM_CREATED` | `roomCode`, `playerId`, `roomState`, `playerCount` | Room created successfully |
| `ROOM_JOINED` | `roomCode`, `playerId`, `roomState`, `playerCount` | Joined room successfully |
| `ROOM_STATE` | `roomCode`, `roomState`, `playerCount` | Authoritative state update |
| `ERROR` | `code`, `message` | Error response |

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_MESSAGE` | Malformed message or unknown type |
| `INVALID_ROOM_CODE` | Bad format or missing room code |
| `ROOM_NOT_FOUND` | Room does not exist |
| `ROOM_FULL` | Room already has 2 players |
| `ALREADY_IN_ROOM` | Connection already in a room |
| `INVALID_STATE` | Invalid state transition |

## Manual Test Procedure

1. **Create room**: Open Browser A → Click "Create Game" → See room code and "1 / 2"
2. **Join room**: Open Browser B → Click "Join Game" → Enter code → Click "Join Game" → Both show "2 / 2"
3. **Invalid room**: Enter `ZZZZZ` → See "Room does not exist" error
4. **Full room**: With 2 players in room, open Browser C → Join same code → See "Room is full" error
5. **Disconnect**: Close Browser B → Browser A sees "1 / 2" and "Waiting for another player..."
6. **Empty cleanup**: Close all browsers in a room → Joining old code returns "Room does not exist"
7. **Room isolation**: Create two separate rooms → Players in one never receive messages from the other
8. **Duplicate protection**: While in a room, try Create or Join → See "Already in room" error

## Not Implemented (Phase 1 Scope)

- ❌ Gameplay, movement, physics, collisions
- ❌ Client-side prediction, reconciliation, interpolation
- ❌ Abilities, scoring, timers, rounds
- ❌ Database, authentication, accounts
- ❌ Reconnection, session persistence
- ❌ Chat, voice, spectators, matchmaking
