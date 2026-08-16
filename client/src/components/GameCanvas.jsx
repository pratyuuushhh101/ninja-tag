import { useRef, useEffect, useCallback } from 'react';
import { PLAYER_RADIUS } from '../../../shared/protocol/constants.js';

export default function GameCanvas({ gameState, arena, playerId }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !arena) return;

    const ctx = canvas.getContext('2d');

    // Scale canvas to fit container while preserving aspect ratio
    const containerWidth = canvas.parentElement ? canvas.parentElement.clientWidth : arena.width;
    const scale = Math.min(containerWidth / arena.width, 1);
    canvas.width = arena.width * scale;
    canvas.height = arena.height * scale;
    ctx.scale(scale, scale);

    // Clear
    ctx.clearRect(0, 0, arena.width, arena.height);

    // Draw arena background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, arena.width, arena.height);

    // Draw arena border
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, arena.width - 2, arena.height - 2);

    if (!gameState || !gameState.players) return;

    // Draw players
    for (const player of gameState.players) {
      const isIt = player.id === gameState.itPlayerId;
      const isLocal = player.id === playerId;

      // Player circle
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);

      // Fill: blue for local, red for opponent (or distinguish differently)
      if (isLocal) {
        ctx.fillStyle = '#4488ff';
      } else {
        ctx.fillStyle = '#ff4444';
      }
      ctx.fill();

      // IT indicator: orange outline + label
      if (isIt) {
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 4;
        ctx.stroke();

        // "IT" label above player
        ctx.fillStyle = '#ff8800';
        ctx.font = 'bold 14px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('IT', player.x, player.y - PLAYER_RADIUS - 5);
      }

      // "YOU" label below local player
      if (isLocal) {
        ctx.fillStyle = '#aaa';
        ctx.font = '12px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('YOU', player.x, player.y + PLAYER_RADIUS + 5);
      }
    }

    animFrameRef.current = requestAnimationFrame(render);
  }, [gameState, arena, playerId]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }}
    />
  );
}
