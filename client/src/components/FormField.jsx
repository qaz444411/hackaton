import './FormField.css';

/**
 * 라벨 + 인풋 필드 (로그인/회원가입 공통) — app/ 디자인 이식
 * @param {string} label
 * @param {string} type
 * @param {string} placeholder
 * @param {string} value
 * @param {(v: string) => void} onChange
 * @param {React.ReactNode} suffix 인풋 우측 아이콘/버튼 (비밀번호 보기 등)
 * @param {React.ReactNode} action 인풋 옆 별도 버튼 (중복체크 등) — wrap row 생성
 * @param {string} hint 인풋 아래 보조 안내문
 * @param {'default'|'active'|'error'} variant 테두리 강조 상태
 */
export default function FormField({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  suffix,
  action,
  hint,
  variant = 'default',
  ...rest
}) {
  const inputWrap = (
    <span className={`field__input-wrap field__input-wrap--${variant}`}>
      <input
        className="field__input"
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        {...rest}
      />
      {suffix}
    </span>
  );

  return (
    <label className="field">
      {label && <span className="field__label">{label}</span>}
      {action ? (
        <span className="field__row">
          {inputWrap}
          {action}
        </span>
      ) : (
        inputWrap
      )}
      {hint && <span className={`field__hint field__hint--${variant}`}>{hint}</span>}
    </label>
  );
}
