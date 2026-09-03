import { useRef, useEffect } from 'react';
import { PLAYER_RADIUS } from '../../../shared/protocol/constants.js';
import { prediction } from '../game/Prediction.js';

// ── Logical game world dimensions (read from constants, never modified) ──
const WORLD_W = 1000;
const WORLD_H = 600;

// ── Visual constants (rendering only — no gameplay effect) ──
const GROUND_Y = WORLD_H * 0.72;  // Where the grass line sits
const SKY_COLOR = '#5EC4E8';
const GROUND_COLOR = '#5A9E3E';
const GROUND_DARK = '#4A8A32';
const HILL_FAR = '#78B85A';
const HILL_MID = '#6AAE4E';
const CLOUD_COLOR = '#ffffff';

// ── Decorative element positions (visual only) ──
const BUSHES = [
  { x: 120, y: GROUND_Y + 8, w: 50, h: 30, color: '#3D8B2F' },
  { x: 480, y: GROUND_Y + 5, w: 40, h: 25, color: '#4A9E38' },
  { x: 780, y: GROUND_Y + 10, w: 55, h: 32, color: '#3D8B2F' },
  { x: 920, y: GROUND_Y + 6, w: 35, h: 22, color: '#4A9E38' },
];

const ROCKS = [
  { x: 310, y: GROUND_Y + 18, w: 28, h: 18, color: '#8E8E8E' },
  { x: 650, y: GROUND_Y + 20, w: 22, h: 14, color: '#9A9A9A' },
];

const FLOWERS = [
  { x: 200, y: GROUND_Y - 2, petalColor: '#FF6B8A', stemH: 18 },
  { x: 560, y: GROUND_Y - 2, petalColor: '#FFD93D', stemH: 14 },
  { x: 850, y: GROUND_Y - 2, petalColor: '#FF8A65', stemH: 16 },
];

const CLOUDS = [
  { x: 100, y: 60, r: 30 },
  { x: 350, y: 40, r: 25 },
  { x: 600, y: 70, r: 28 },
  { x: 850, y: 50, r: 22 },
];

const TREES = [
  { x: 70, trunkH: 60, crownR: 35 },
  { x: 940, trunkH: 55, crownR: 30 },
];

// ── Drawing helpers ──

function drawSky(ctx) {
  ctx.fillStyle = SKY_COLOR;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
}

function drawHills(ctx) {
  // Far hills
  ctx.fillStyle = HILL_FAR;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 20);
  ctx.quadraticCurveTo(150, GROUND_Y - 80, 300, GROUND_Y + 10);
  ctx.quadraticCurveTo(450, GROUND_Y - 50, 600, GROUND_Y + 15);
  ctx.quadraticCurveTo(800, GROUND_Y - 90, 1000, GROUND_Y + 5);
  ctx.lineTo(1000, GROUND_Y + 30);
  ctx.lineTo(0, GROUND_Y + 30);
  ctx.closePath();
  ctx.fill();

  // Mid hills
  ctx.fillStyle = HILL_MID;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 15);
  ctx.quadraticCurveTo(200, GROUND_Y - 40, 400, GROUND_Y + 10);
  ctx.quadraticCurveTo(700, GROUND_Y - 60, 1000, GROUND_Y + 10);
  ctx.lineTo(1000, GROUND_Y + 30);
  ctx.lineTo(0, GROUND_Y + 30);
  ctx.closePath();
  ctx.fill();
}

function drawClouds(ctx) {
  ctx.fillStyle = CLOUD_COLOR;
  for (const c of CLOUDS) {
    // 3-circle cluster
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x - c.r * 0.7, c.y + 4, c.r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x + c.r * 0.8, c.y + 3, c.r * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGround(ctx) {
  // Main ground fill
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, GROUND_Y, WORLD_W, WORLD_H - GROUND_Y);

  // Darker dirt strip at the bottom
  ctx.fillStyle = GROUND_DARK;
  ctx.fillRect(0, WORLD_H - 30, WORLD_W, 30);

  // Grass tufts along the ground line
  ctx.fillStyle = '#4CAF50';
  for (let x = 0; x < WORLD_W; x += 12) {
    const h = 6 + Math.sin(x * 0.3) * 3;
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(x + 4, GROUND_Y - h);
    ctx.lineTo(x + 8, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTrees(ctx) {
  for (const t of TREES) {
    const baseY = GROUND_Y;
    // Trunk
    ctx.fillStyle = '#8B6F47';
    const tw = 14;
    ctx.fillRect(t.x - tw / 2, baseY - t.trunkH, tw, t.trunkH);

    // Crown (layered circles for chunky look)
    ctx.fillStyle = '#2E7D32';
    ctx.beginPath();
    ctx.arc(t.x, baseY - t.trunkH - t.crownR * 0.3, t.crownR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#388E3C';
    ctx.beginPath();
    ctx.arc(t.x - t.crownR * 0.4, baseY - t.trunkH - t.crownR * 0.1, t.crownR * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(t.x + t.crownR * 0.4, baseY - t.trunkH, t.crownR * 0.65, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBushes(ctx) {
  for (const b of BUSHES) {
    ctx.fillStyle = b.color;
    // Main ellipse
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Secondary smaller bump
    ctx.beginPath();
    ctx.ellipse(b.x + b.w * 0.3, b.y - 3, b.w * 0.3, b.h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRocks(ctx) {
  for (const r of ROCKS) {
    ctx.fillStyle = r.color;
    // Rounded rectangle approximation
    const rx = r.w * 0.3;
    ctx.beginPath();
    ctx.moveTo(r.x - r.w / 2 + rx, r.y - r.h / 2);
    ctx.lineTo(r.x + r.w / 2 - rx, r.y - r.h / 2);
    ctx.quadraticCurveTo(r.x + r.w / 2, r.y - r.h / 2, r.x + r.w / 2, r.y - r.h / 2 + rx);
    ctx.lineTo(r.x + r.w / 2, r.y + r.h / 2);
    ctx.lineTo(r.x - r.w / 2, r.y + r.h / 2);
    ctx.lineTo(r.x - r.w / 2, r.y - r.h / 2 + rx);
    ctx.quadraticCurveTo(r.x - r.w / 2, r.y - r.h / 2, r.x - r.w / 2 + rx, r.y - r.h / 2);
    ctx.closePath();
    ctx.fill();
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.ellipse(r.x - 2, r.y - r.h * 0.15, r.w * 0.25, r.h * 0.2, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFlowers(ctx) {
  for (const f of FLOWERS) {
    // Stem
    ctx.strokeStyle = '#388E3C';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(f.x, f.y - f.stemH);
    ctx.stroke();
    // Petals
    ctx.fillStyle = f.petalColor;
    const pr = 4;
    for (let a = 0; a < 5; a++) {
      const angle = (a / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(f.x + Math.cos(angle) * pr, f.y - f.stemH + Math.sin(angle) * pr, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Center
    ctx.fillStyle = '#FFF176';
    ctx.beginPath();
    ctx.arc(f.x, f.y - f.stemH, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawArenaBorder(ctx) {
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, WORLD_W - 3, WORLD_H - 3);
}

// ── Ninja character drawing ──

function drawNinja(ctx, x, y, bodyColor, headbandColor, isIt, isLocal, tick) {
  const r = PLAYER_RADIUS; // 20 — gameplay radius
  const headR = r * 0.75;  // 15
  const bodyH = r * 0.6;   // 12
  const bodyW = r * 0.7;   // 14

  // Shadow beneath
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(x, y + r + 2, r * 0.6, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // IT indicator — pulsing orange ring on the ground
  if (isIt) {
    const pulse = 0.85 + 0.15 * Math.sin((tick || 0) * 0.15);
    ctx.strokeStyle = '#FF8C00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y + r + 2, r * 0.8 * pulse, 5 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Legs (simple lines)
  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  // Left leg
  ctx.beginPath();
  ctx.moveTo(x - 5, y + bodyH * 0.3);
  ctx.lineTo(x - 7, y + r);
  ctx.stroke();
  // Right leg
  ctx.beginPath();
  ctx.moveTo(x + 5, y + bodyH * 0.3);
  ctx.lineTo(x + 7, y + r);
  ctx.stroke();

  // Body (rounded rect shape)
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Arms (simple lines)
  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = 3.5;
  // Left arm
  ctx.beginPath();
  ctx.moveTo(x - bodyW / 2, y);
  ctx.lineTo(x - r * 0.85, y - 4);
  ctx.stroke();
  // Right arm
  ctx.beginPath();
  ctx.moveTo(x + bodyW / 2, y);
  ctx.lineTo(x + r * 0.85, y - 4);
  ctx.stroke();

  // Head (circle)
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(x, y - bodyH * 0.4, headR, 0, Math.PI * 2);
  ctx.fill();

  // Headband
  ctx.fillStyle = headbandColor;
  ctx.fillRect(x - headR - 2, y - bodyH * 0.4 - 3, headR * 2 + 4, 6);
  // Headband tails
  ctx.strokeStyle = headbandColor;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + headR + 2, y - bodyH * 0.4 - 2);
  ctx.lineTo(x + headR + 10, y - bodyH * 0.4 - 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + headR + 2, y - bodyH * 0.4 + 1);
  ctx.lineTo(x + headR + 8, y - bodyH * 0.4 + 5);
  ctx.stroke();

  // Eyes (white ovals with dark pupils)
  const eyeY = y - bodyH * 0.4 + 2;
  // Left eye
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x - 5, eyeY, 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.arc(x - 4, eyeY, 2, 0, Math.PI * 2);
  ctx.fill();
  // Right eye
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x + 5, eyeY, 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.arc(x + 6, eyeY, 2, 0, Math.PI * 2);
  ctx.fill();

  // IT marker — orange triangle above head
  if (isIt) {
    ctx.fillStyle = '#FF8C00';
    const triY = y - bodyH * 0.4 - headR - 14;
    ctx.beginPath();
    ctx.moveTo(x, triY - 8);
    ctx.lineTo(x - 7, triY + 4);
    ctx.lineTo(x + 7, triY + 4);
    ctx.closePath();
    ctx.fill();
  }

  // Label beneath character
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(isLocal ? 'YOU' : 'RIVAL', x, y + r + 10);
}

// ── HUD drawing ──

function drawHUD(ctx, isIt, roomCode) {
  // Role badge — top left
  const badgeText = isIt ? 'YOU ARE IT!' : 'RUN!';
  const badgeBg = isIt ? '#E65100' : '#1565C0';
  ctx.font = 'bold 16px system-ui';
  const textW = ctx.measureText(badgeText).width;
  const px = 10, py = 6;

  // Badge background
  ctx.fillStyle = badgeBg;
  const bx = 14, by = 12;
  const bw = textW + px * 2, bh = 28;
  ctx.beginPath();
  ctx.moveTo(bx + 6, by);
  ctx.lineTo(bx + bw - 6, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + 6);
  ctx.lineTo(bx + bw, by + bh - 6);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - 6, by + bh);
  ctx.lineTo(bx + 6, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - 6);
  ctx.lineTo(bx, by + 6);
  ctx.quadraticCurveTo(bx, by, bx + 6, by);
  ctx.closePath();
  ctx.fill();

  // Badge text
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, bx + px, by + bh / 2 + 1);

  // Room code — top right
  if (roomCode) {
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('ROOM ' + roomCode, WORLD_W - 14, 16);
  }
}

// ── Snapshot buffer for remote player interpolation ──
const RENDER_DELAY_MS = 100; // Interpolation delay for remote players
const MAX_BUFFER_SIZE = 5;   // Keep only the latest N snapshots

// ── Main component ──

export default function GameCanvas({ gameState, arena, playerId, roomCode }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);

  // Refs for latest state — RAF loop reads these without closure dependency
  const gameStateRef = useRef(null);
  const arenaRef = useRef(null);
  const playerIdRef = useRef(null);
  const roomCodeRef = useRef(null);

  // Snapshot buffer for remote player interpolation (visual only)
  const snapshotBufferRef = useRef([]);

  // Keep refs in sync with props
  useEffect(() => { arenaRef.current = arena; }, [arena]);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);

  // When gameState changes, update ref AND append to snapshot buffer
  useEffect(() => {
    gameStateRef.current = gameState;

    if (gameState && gameState.players) {
      const buffer = snapshotBufferRef.current;
      buffer.push({
        state: gameState,
        receivedAt: performance.now()
      });
      // Keep buffer bounded
      while (buffer.length > MAX_BUFFER_SIZE) {
        buffer.shift();
      }
    }
  }, [gameState]);

  // Stable render function — created once, reads from refs
  useEffect(() => {
    function render() {
      const canvas = canvasRef.current;
      const currentArena = arenaRef.current;

      if (!canvas || !currentArena) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;

      // Scale canvas to fill its container while preserving 1000:600 aspect ratio
      const container = canvas.parentElement;
      const containerW = container ? container.clientWidth : WORLD_W;
      const containerH = container ? container.clientHeight : WORLD_H;
      const scaleX = containerW / WORLD_W;
      const scaleY = containerH / WORLD_H;
      const scale = Math.min(scaleX, scaleY);

      const cssW = WORLD_W * scale;
      const cssH = WORLD_H * scale;

      // Update canvas backing store only when size actually changes
      const targetW = Math.floor(cssW * dpr);
      const targetH = Math.floor(cssH * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      ctx.save();
      ctx.scale(scale * dpr, scale * dpr);

      // ── Layer 1: Sky ──
      drawSky(ctx);

      // ── Layer 2: Clouds ──
      drawClouds(ctx);

      // ── Layer 3: Distant hills ──
      drawHills(ctx);

      // ── Layer 4: Ground ──
      drawGround(ctx);

      // ── Layer 5: Trees ──
      drawTrees(ctx);

      // ── Layer 6: Decorative elements ──
      drawBushes(ctx);
      drawRocks(ctx);
      drawFlowers(ctx);

      // ── Layer 7: Arena boundary (subtle) ──
      drawArenaBorder(ctx);

      // ── Layer 8: Players ──
      const currentGameState = gameStateRef.current;
      const currentPlayerId = playerIdRef.current;

      if (currentGameState && currentGameState.players) {
        const tick = currentGameState.tick || 0;
        const buffer = snapshotBufferRef.current;
        const now = performance.now();
        const targetTime = now - RENDER_DELAY_MS;

        for (const player of currentGameState.players) {
          const isIt = player.id === currentGameState.itPlayerId;
          const isLocal = player.id === currentPlayerId;

          let posX = player.x;
          let posY = player.y;

          if (isLocal && prediction.predictedPosition) {
            // LOCAL PLAYER: 60Hz predicted position from Prediction singleton
            posX = prediction.predictedPosition.x;
            posY = prediction.predictedPosition.y;
          } else if (!isLocal && buffer.length >= 2) {
            // REMOTE PLAYER: interpolate between buffered snapshots
            // Find snapshots A and B such that A.receivedAt <= targetTime <= B.receivedAt
            let snapA = null;
            let snapB = null;

            for (let i = buffer.length - 1; i >= 1; i--) {
              if (buffer[i - 1].receivedAt <= targetTime && buffer[i].receivedAt >= targetTime) {
                snapA = buffer[i - 1];
                snapB = buffer[i];
                break;
              }
            }

            if (snapA && snapB) {
              // Find this player in both snapshots
              const playerA = snapA.state.players.find(p => p.id === player.id);
              const playerB = snapB.state.players.find(p => p.id === player.id);

              if (playerA && playerB) {
                const span = snapB.receivedAt - snapA.receivedAt;
                const alpha = span > 0 ? Math.min(1, Math.max(0, (targetTime - snapA.receivedAt) / span)) : 1;
                posX = playerA.x + (playerB.x - playerA.x) * alpha;
                posY = playerA.y + (playerB.y - playerA.y) * alpha;
              }
            } else if (buffer.length >= 1) {
              // targetTime is beyond newest snapshot — render newest position directly (no extrapolation)
              const newest = buffer[buffer.length - 1];
              const newestPlayer = newest.state.players.find(p => p.id === player.id);
              if (newestPlayer) {
                posX = newestPlayer.x;
                posY = newestPlayer.y;
              }
            }
          }

          const bodyColor = isLocal ? '#2979FF' : '#E53935';
          const headbandColor = isLocal ? '#1565C0' : '#B71C1C';

          drawNinja(ctx, posX, posY, bodyColor, headbandColor, isIt, isLocal, tick);
        }
      }

      // ── Layer 9: HUD ──
      const isIt = currentGameState && currentGameState.itPlayerId === currentPlayerId;
      drawHUD(ctx, isIt, roomCodeRef.current);

      ctx.restore();

      animFrameRef.current = requestAnimationFrame(render);
    }

    // Start the RAF loop once on mount
    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []); // Empty deps — RAF created once, never recreated

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      }}
    />
  );
}

