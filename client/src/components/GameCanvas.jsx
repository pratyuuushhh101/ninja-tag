import { useRef, useEffect } from 'react';

export default function GameCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Draw background
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw text
    ctx.fillStyle = '#fff';
    ctx.font = '24px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Waiting for game...', canvas.width / 2, canvas.height / 2);
    
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      width={800} 
      height={600} 
      style={{ display: 'block', margin: '20px auto', background: '#333', maxWidth: '100%' }}
    />
  );
}
