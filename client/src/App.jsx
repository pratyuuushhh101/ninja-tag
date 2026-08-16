import { useState, useEffect, useRef, useCallback } from 'react';
import LandingScreen from './screens/LandingScreen.jsx';
import JoinScreen from './screens/JoinScreen.jsx';
import LobbyScreen from './screens/LobbyScreen.jsx';
import { wsClient } from './network/WebSocketClient.js';
import {
  CLIENT_MESSAGES,
  SERVER_MESSAGES,
  ROOM_STATES,
  MAX_PLAYERS_PER_ROOM
} from '../../shared/protocol/constants.js';

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [roomCode, setRoomCode] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [roomState, setRoomState] = useState(null);
  const [error, setError] = useState(null);
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
      setScreen('landing');
      setRoomCode(null);
      setPlayerId(null);
      setPlayerCount(0);
      setRoomState(null);
    });
  }, []);

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

      {error && screen === 'landing' && (
        <div style={{ color: 'red', textAlign: 'center', marginTop: '20px' }}>{error}</div>
      )}
    </div>
  );
}
