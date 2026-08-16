import { useState, useEffect, useRef } from 'react';
import LandingScreen from './screens/LandingScreen.jsx';
import JoinScreen from './screens/JoinScreen.jsx';
import LobbyScreen from './screens/LobbyScreen.jsx';
import GameScreen from './screens/GameScreen.jsx';
import { wsClient } from './network/WebSocketClient.js';
import { networkState } from './network/NetworkState.js';
import {
  CLIENT_MESSAGES,
  SERVER_MESSAGES,
  ROOM_STATES
} from '../../shared/protocol/constants.js';

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [roomCode, setRoomCode] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [roomState, setRoomState] = useState(null);
  const [error, setError] = useState(null);

  // Game state
  const [gameState, setGameState] = useState(null);
  const [arena, setArena] = useState(null);
  const [gameEndReason, setGameEndReason] = useState(null);
  const handlersSet = useRef(false);

  useEffect(() => {
    if (handlersSet.current) return;
    handlersSet.current = true;

    wsClient.onMessage((msg) => {
      switch (msg.type) {
        case SERVER_MESSAGES.ROOM_CREATED:
          setRoomCode(msg.roomCode);
          setPlayerId(msg.playerId);
          setPlayerCount(msg.playerCount);
          setRoomState(msg.roomState);
          setScreen('lobby');
          setError(null);
          break;

        case SERVER_MESSAGES.ROOM_JOINED:
          setRoomCode(msg.roomCode);
          setPlayerId(msg.playerId);
          setPlayerCount(msg.playerCount);
          setRoomState(msg.roomState);
          setScreen('lobby');
          setError(null);
          break;

        case SERVER_MESSAGES.ROOM_STATE:
          setPlayerCount(msg.playerCount);
          setRoomState(msg.roomState);
          break;

        case SERVER_MESSAGES.GAME_STARTED:
          networkState.reset();
          setPlayerId(msg.yourPlayerId);
          setArena(msg.arena);
          setGameState({ players: msg.players, itPlayerId: msg.itPlayerId, tick: 0 });
          setGameEndReason(null);
          setScreen('game');
          break;

        case SERVER_MESSAGES.SNAPSHOT:
        case SERVER_MESSAGES.GAME_STATE:
          // Feed to NetworkState which validates ticks & input ACKs
          if (networkState.handleSnapshot(msg, playerId)) {
            setGameState(networkState.getLatestSnapshot());
          }
          break;

        case SERVER_MESSAGES.GAME_ENDED:
          setGameEndReason(msg.reason);
          break;

        case SERVER_MESSAGES.ERROR:
          setError(msg.message || 'An error occurred');
          break;

        default:
          console.warn('Unknown message type', msg.type);
      }
    });

    wsClient.onError(() => {
      setError('Connection error');
    });

    wsClient.onClose(() => {
      networkState.reset();
      setScreen('landing');
      setRoomCode(null);
      setPlayerId(null);
      setPlayerCount(0);
      setRoomState(null);
      setGameState(null);
      setArena(null);
      setGameEndReason(null);
    });
  }, [playerId]);

  const handleCreateGame = async () => {
    setError(null);
    try {
      await wsClient.connect();
      wsClient.send({ type: CLIENT_MESSAGES.CREATE_ROOM });
    } catch (e) {
      setError('Failed to connect to server');
    }
  };

  const handleJoinGameClick = () => {
    setError(null);
    setScreen('join');
  };

  const handleJoin = async (code) => {
    setError(null);
    try {
      await wsClient.connect();
      wsClient.send({ type: CLIENT_MESSAGES.JOIN_ROOM, roomCode: code });
    } catch (e) {
      setError('Failed to connect to server');
    }
  };

  const handleBack = () => {
    setError(null);
    setScreen('landing');
  };

  const handleLeaveGame = () => {
    wsClient.disconnect();
    networkState.reset();
    setScreen('landing');
    setRoomCode(null);
    setPlayerId(null);
    setPlayerCount(0);
    setRoomState(null);
    setGameState(null);
    setArena(null);
    setGameEndReason(null);
    setError(null);
  };

  let statusMessage = 'Connecting...';
  if (roomState === ROOM_STATES.WAITING_FOR_PLAYER) {
    statusMessage = 'Waiting for another player...';
  } else if (roomState === ROOM_STATES.FULL) {
    statusMessage = 'Both players connected!';
  }

  return (
    <div style={{ padding: '20px' }}>
      {screen === 'landing' && (
        <LandingScreen
          onCreateGame={handleCreateGame}
          onJoinGame={handleJoinGameClick}
        />
      )}

      {screen === 'join' && (
        <JoinScreen
          onJoin={handleJoin}
          onBack={handleBack}
          error={error}
        />
      )}

      {screen === 'lobby' && (
        <LobbyScreen
          roomCode={roomCode}
          playerCount={playerCount}
          statusMessage={statusMessage}
        />
      )}

      {screen === 'game' && (
        <GameScreen
          roomCode={roomCode}
          playerId={playerId}
          gameState={gameState}
          arena={arena}
          onLeave={handleLeaveGame}
          gameEndReason={gameEndReason}
        />
      )}

      {error && screen === 'landing' && (
        <div style={{ color: 'red', textAlign: 'center', marginTop: '20px' }}>{error}</div>
      )}
    </div>
  );
}
