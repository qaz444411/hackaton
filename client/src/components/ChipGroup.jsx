/**
 * 단일/다중 선택 칩. 취향 선택·MBTI·관심사·시간대 전부 이걸 쓴다.
 * options: [{ value, label }]
 */
export default function ChipGroup({ options, value, onChange, multiple = false, max = 3 }) {
  const selected = multiple ? value || [] : value;

  const toggle = (v) => {
    if (!multiple) return onChange(v === value ? null : v);
    if (selected.includes(v)) return onChange(selected.filter((x) => x !== v));
    if (selected.length >= max) return;
    onChange([...selected, v]);
  };

  return (
    <div className="chip-grid">
      {options.map((o) => {
        const on = multiple ? selected.includes(o.value) : selected === o.value;
        return (
          <button
            key={o.value}
            type="button"
            className="chip"
            aria-pressed={on}
            disabled={multiple && !on && selected.length >= max}
            onClick={() => toggle(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
