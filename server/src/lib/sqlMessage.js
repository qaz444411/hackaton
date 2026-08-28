/**
 * DB 트리거/프로시저가 SIGNAL SQLSTATE '45000' 로 던지는 영문 메시지를
 * REST(errorHandler)와 소켓(chatSocket) 양쪽에서 똑같이 한국어로 옮긴다.
 * 매핑에 없는 새 메시지는 원문 그대로 노출 — 영어가 섞이더라도 완전히 숨는 것보단 낫다.
 */
const RULES = [
  [/already has an active match/, '이미 확정된 매칭이 있어서 진행할 수 없어요.'],
  [/chat_room \d+: not open/, '종료된 대화방이에요.'],
  [/proposal expired/, '이미 만료된 요청이에요. 상대에게 다시 요청해 달라고 해보세요.'],
  [/proposal is not PENDING/, '이미 처리된 요청이에요.'],
  [/proposal not found/, '요청을 찾을 수 없어요.'],
  [/requester request is not SEARCHING/, '상대가 매칭을 취소했거나 이미 다른 분과 확정됐어요.'],
  [/participants must be the proposal requester and receiver/, '요청 정보가 올바르지 않아요.'],
  [/rows cannot be deleted/, '처리할 수 없는 요청이에요.'],
  [/rows are immutable/, '처리할 수 없는 요청이에요.'],
  [/invalid transition/, '이미 처리된 매칭이에요. 새로고침해 주세요.'],
];

export function translateSignal(msg) {
  if (!msg) return msg;
  const hit = RULES.find(([re]) => re.test(msg));
  return hit ? hit[1] : msg;
}
