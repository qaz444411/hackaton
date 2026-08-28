import './RangeSlider.css';

/**
 * 최소·최대 두 손잡이로 범위를 고르는 슬라이더 (가격대 등)
 * @param {number} min 전체 범위 최솟값
 * @param {number} max 전체 범위 최댓값
 * @param {number} step
 * @param {number} valueMin 현재 최솟값
 * @param {number} valueMax 현재 최댓값
 * @param {(v: number) => void} onChangeMin
 * @param {(v: number) => void} onChangeMax
 */
export default function RangeSlider({ min, max, step = 1, valueMin, valueMax, onChangeMin, onChangeMax }) {
  const pct = (v) => ((v - min) / (max - min)) * 100;
  const left = pct(valueMin);
  const right = pct(valueMax);
  // 두 손잡이가 겹칠 때 최댓값 쪽 손잡이가 항상 잡히도록, 최솟값이 범위의
  // 뒤쪽 절반에 있을 때만 최솟값 입력의 z-index 를 올려준다.
  const minOnTop = valueMin > (min + max) / 2;

  return (
    <div className="range-slider">
      <div className="range-slider__track" />
      <div className="range-slider__fill" style={{ left: `${left}%`, right: `${100 - right}%` }} />
      <input
        type="range" min={min} max={max} step={step} value={valueMin}
        onChange={(e) => onChangeMin(Number(e.target.value))}
        className="range-slider__input"
        style={{ zIndex: minOnTop ? 4 : 3 }}
        aria-label="최소값"
      />
      <input
        type="range" min={min} max={max} step={step} value={valueMax}
        onChange={(e) => onChangeMax(Number(e.target.value))}
        className="range-slider__input"
        style={{ zIndex: minOnTop ? 3 : 4 }}
        aria-label="최대값"
      />
    </div>
  );
}
