import './ToggleGroup.css';

/**
 * 2~3분할 선택 토글 (성별 / 예-아니오 / 정도 선택 등) — app/ 디자인 이식
 * @param {{value: string, label: string, emoji?: string}[]} options
 * @param {string} value
 * @param {(v: string) => void} onChange
 */
export default function ToggleGroup({ options, value, onChange }) {
  return (
    <div className="toggle-group">
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`toggle-group__btn${isActive ? ' toggle-group__btn--active' : ''}`}
            onClick={() => onChange?.(opt.value)}
          >
            {opt.emoji && <span className="toggle-group__emoji">{opt.emoji}</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
