import { api } from './client.js';

/* ── 공통 코드 ───────────────────────────────── */
export const getCodes = () => api.get('/codes').then((r) => r.data);

/* ── 인증 / 회원가입 ─────────────────────────── */
export const checkDuplicate = (field, value) =>
  api.get('/auth/check', { params: { field, value } }).then((r) => r.data);
export const signup = (body) => api.post('/auth/signup', body).then((r) => r.data);
export const login = (body) => api.post('/auth/login', body).then((r) => r.data);
export const getMe = () => api.get('/auth/me').then((r) => r.data);

/* ── 기본선택 / 마이페이지 ───────────────────── */
export const saveProfile = (body) => api.post('/users/profile', body).then((r) => r.data);
export const getMyPage = () => api.get('/users/me/mypage').then((r) => r.data);
export const updateNotifications = (body) => api.patch('/users/me/notifications', body).then((r) => r.data);
export const getHistory = () => api.get('/users/me/history').then((r) => r.data);
export const getPartnerProfile = (id) => api.get(`/users/${id}/profile`).then((r) => r.data);

/* ── 매칭 ────────────────────────────────────── */
export const getHome = () => api.get('/matching/home').then((r) => r.data);
export const saveDraft = (body) => api.post('/matching/draft', body).then((r) => r.data);
export const startMatching = (id) => api.post(`/matching/${id}/start`).then((r) => r.data);
export const getCurrentMatching = () => api.get('/matching/current').then((r) => r.data);
export const getCandidates = (id, relax = false) =>
  api.get(`/matching/${id}/candidates`, { params: relax ? { relax: 1 } : {} }).then((r) => r.data);
export const getMatchingDiagnosis = (id) =>
  api.get(`/matching/${id}/diagnosis`).then((r) => r.data);
export const cancelMatching = (id) => api.post(`/matching/${id}/cancel`).then((r) => r.data);

/* ── 음식점 / 지도 ───────────────────────────── */
export const getRestaurants = (params) => api.get('/restaurants', { params }).then((r) => r.data);
export const getRestaurant = (id) => api.get(`/restaurants/${id}`).then((r) => r.data);
export const addRestaurant = (body) => api.post('/restaurants', body).then((r) => r.data);
export const getBuddies = (id) => api.get(`/restaurants/${id}/buddies`).then((r) => r.data);

/* ── 지도 마커("여기서 먹고싶어요") ──────────── */
export const getSpots = (params) => api.get('/spots', { params }).then((r) => r.data);
export const createSpot = (body) => api.post('/spots', body).then((r) => r.data);
export const getSpot = (id) => api.get(`/spots/${id}`).then((r) => r.data);
export const getSpotBuddies = (id) => api.get(`/spots/${id}/buddies`).then((r) => r.data);

/* ── 매칭 요청 / 보관함 ──────────────────────── */
export const createProposal = (body) => api.post('/proposals', body).then((r) => r.data);
export const getProposal = (id) => api.get(`/proposals/${id}`).then((r) => r.data);
export const getSentProposals = () => api.get('/proposals/sent').then((r) => r.data);
export const getInbox = () => api.get('/proposals').then((r) => r.data);
export const readProposal = (id) => api.post(`/proposals/${id}/read`).then((r) => r.data);
export const acceptProposal = (id) => api.post(`/proposals/${id}/accept`).then((r) => r.data);
export const declineProposal = (id) => api.post(`/proposals/${id}/decline`).then((r) => r.data);
export const cancelProposal = (id) => api.post(`/proposals/${id}/cancel`).then((r) => r.data);

/* ── AI 도우미 (홈 챗봇) ─────────────────────── */
export const getAssistantStatus = () => api.get('/assistant/status').then((r) => r.data);
export const getAssistantStarters = () => api.get('/assistant/starters').then((r) => r.data);
export const askAssistant = (message, history) =>
  api.post('/assistant/chat', { message, history }).then((r) => r.data);

/* ── 채팅 ────────────────────────────────────── */
export const getChatRooms = () => api.get('/chat/rooms').then((r) => r.data);
export const getChatRoom = (matchId) => api.get(`/chat/rooms/${matchId}`).then((r) => r.data);
export const getMessages = (matchId, before = 0) =>
  api.get(`/chat/rooms/${matchId}/messages`, { params: { before } }).then((r) => r.data);
export const sendMessage = (matchId, content) =>
  api.post(`/chat/rooms/${matchId}/messages`, { content }).then((r) => r.data);
export const getSuggestions = (matchId, refresh = false) =>
  api.get(`/chat/rooms/${matchId}/suggestions`, { params: refresh ? { refresh: 1 } : {} }).then((r) => r.data);
export const useSuggestion = (id) => api.post(`/chat/suggestions/${id}/use`).then((r) => r.data);
export const reportChat = (matchId, body) => api.post(`/chat/rooms/${matchId}/report`, body).then((r) => r.data);
export const closeChat = (matchId) => api.post(`/chat/rooms/${matchId}/close`).then((r) => r.data);
