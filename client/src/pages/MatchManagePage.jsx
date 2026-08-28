import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { getCurrentMatching, cancelMatching } from '../api/endpoints.js';
import './MatchManagePage.css';

/**
 * 매칭 관리 — 내가 올린 밥친구 모집.
 * 사용자당 활성 매칭 요청은 1건만 허용되므로(uq_matching_request_active) 최대 1개가 보인다.
 */
export default function MatchManagePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: current } = useQuery({ queryKey: ['matching', 'current'], queryFn: getCurrentMatching });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const placeName = current?.restaurant_name || current?.spot_label;
  const recruitingCount = current?.restaurant_recruiting_count ?? current?.spot_recruiting_count ?? 0;

  const remove = async () => {
    if (!current) return;
    setDeleting(true);
    try {
      await cancelMatching(current.id);
      qc.invalidateQueries({ queryKey: ['matching', 'current'] });
      qc.invalidateQueries({ queryKey: ['home'] });
    } catch (e) {
      alert(e.response?.data?.message || '삭제하지 못했어요.');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="screen">
      <AppBar title="매칭 관리" onBack={() => nav('/mypage')} />
      <div className="screen__body">
        <p className="mm__eyebrow">내가 올린 밥친구 모집</p>

        {current ? (
          <div className="mm__card">
            <div className="mm__card-top">
              <div className="mm__card-name-row">
                <strong>{placeName || '랜덤 매칭'}</strong>
                <span className="mm__badge">모집 중</span>
              </div>
              <button type="button" className="mm__delete" onClick={() => setConfirmDelete(true)}>
                삭제
              </button>
            </div>
            <p className="mm__when">{current.meal_time} · {current.food_type}</p>
            {recruitingCount > 0 && (
              <p className="mm__recruit">{recruitingCount}명이 밥친구를 찾고 있어요</p>
            )}
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 16 }}>지금 올려둔 밥친구 모집이 없어요.</p>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="모집을 삭제할까요?"
          desc={`${placeName ? `${placeName}에서 올린 ` : ''}${current?.meal_time} 밥친구 모집이 삭제돼요.`}
          confirmLabel={deleting ? '삭제하는 중…' : '모집 삭제'}
          cancelLabel="모집 유지"
          onCancel={() => !deleting && setConfirmDelete(false)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
