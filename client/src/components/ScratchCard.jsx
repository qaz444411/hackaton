import { useEffect, useRef, useState } from 'react';
import './ScratchCard.css';

const COLS = 12;
const ROWS = 7;
const REVEAL_RATIO = 0.28; // 이 비율만큼 긁으면 나머지는 한 번에 걷어낸다 —
// 너무 높으면(0.45 로 해봤더니) 두어 번 쓱쓱 긁는 정도로는 안 열려서 낮췄다.

/**
 * 랜덤 메뉴 복권 — 서버가 이미 정해둔 메뉴(prize)를 캔버스로 가려뒀다가,
 * 손가락/마우스로 긁으면 지워지는 진짜 복권 UI. 서버에서 값이 이미 확정된
 * 채로 오므로(chat.routes.js /rooms/:matchId/lottery) 누가 먼저 긁든,
 * 언제 긁든 둘 다 항상 같은 메뉴를 보게 된다 — 여긴 순수 표시/연출만 담당한다.
 */
export default function ScratchCard({ prize }) {
  const canvasRef = useRef(null);
  const [revealed, setRevealed] = useState(false);
  const scratched = useRef(new Set());
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || revealed) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#D8D0BE');
    grad.addColorStop(1, '#B7AD93');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '600 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎟️ 긁어서 확인', width / 2, height / 2);
  }, [revealed]);

  const pointFromEvent = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches?.[0];
    const cx = t ? t.clientX : e.clientX;
    const cy = t ? t.clientY : e.clientY;
    return {
      x: (cx - rect.left) * (canvas.width / rect.width),
      y: (cy - rect.top) * (canvas.height / rect.height),
    };
  };

  const scratchAt = (x, y) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();

    const col = Math.min(COLS - 1, Math.max(0, Math.floor((x / canvas.width) * COLS)));
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor((y / canvas.height) * ROWS)));
    scratched.current.add(`${col}-${row}`);
    if (scratched.current.size >= COLS * ROWS * REVEAL_RATIO) setRevealed(true);
  };

  const onDown = (e) => { drawing.current = true; const { x, y } = pointFromEvent(e); scratchAt(x, y); };
  const onMove = (e) => {
    if (!drawing.current) return;
    e.preventDefault(); // 캔버스 위에서 드래그할 때 화면이 같이 스크롤되지 않게
    const { x, y } = pointFromEvent(e);
    scratchAt(x, y);
  };
  const onUp = () => { drawing.current = false; };

  return (
    <div className="scratch-card">
      <div className="scratch-card__prize">
        <span className="scratch-card__emoji" aria-hidden="true">🍽️</span>
        <strong className="scratch-card__menu">{prize}</strong>
        <span className="scratch-card__hint">오늘은 이거 어때요?</span>
      </div>
      {!revealed && (
        <canvas
          ref={canvasRef}
          className="scratch-card__canvas"
          width={210} height={112}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        />
      )}
    </div>
  );
}
