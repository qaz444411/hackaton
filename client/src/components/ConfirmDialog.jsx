import './ConfirmDialog.css';

/** 화면 중앙에 뜨는 확인 모달 (주황 테두리) */
export default function ConfirmDialog({ title, desc, confirmLabel = '확인', cancelLabel = '취소', onConfirm, onCancel }) {
  return (
    <div className="confirm-dialog__backdrop" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-dialog__title">{title}</p>
        {desc && <p className="confirm-dialog__desc">{desc}</p>}
        <div className="confirm-dialog__actions">
          <button type="button" className="confirm-dialog__btn confirm-dialog__btn--cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="confirm-dialog__btn confirm-dialog__btn--confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
