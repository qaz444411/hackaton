import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { notFound, errorHandler } from './middlewares/error.js';
import { attachChatSocket } from './services/chatSocket.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import matchingRoutes from './routes/matching.routes.js';
import restaurantRoutes from './routes/restaurant.routes.js';
import spotRoutes from './routes/spot.routes.js';
import proposalRoutes from './routes/proposal.routes.js';
import chatRoutes from './routes/chat.routes.js';
import codeRoutes from './routes/code.routes.js';
import assistantRoutes from './routes/assistant.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

// 프로필 사진 등 업로드 파일 정적 서빙. nginx가 /api/ 를 그대로 이 서버로
// 넘겨주므로 /api 프리픽스 아래 둬야 프론트 프록시 설정을 그대로 탄다.
app.use('/api/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/matching', matchingRoutes);
app.use('/api/restaurants', restaurantRoutes);   // ← 카카오 지도 API 프록시가 여기 들어간다
app.use('/api/spots', spotRoutes);               // ← 지도에 직접 찍는 "여기서 먹고싶어요" 마커
app.use('/api/proposals', proposalRoutes);
app.use('/api/chat', chatRoutes);                // ← 제미나이 추천 질문이 여기 들어간다
app.use('/api/codes', codeRoutes);
app.use('/api/assistant', assistantRoutes);      // ← 홈 화면 AI 도우미 (제미나이)

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
const io = attachChatSocket(server);
app.set('io', io);   // REST 라우트에서도 실시간 알림(보관함 등)을 쏠 수 있게
server.listen(config.port, () => console.log(`API on http://localhost:${config.port}`));
