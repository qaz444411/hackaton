import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import http from 'http';
import { config } from './config.js';
import { notFound, errorHandler } from './middlewares/error.js';
import { attachChatSocket } from './services/chatSocket.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import matchingRoutes from './routes/matching.routes.js';
import restaurantRoutes from './routes/restaurant.routes.js';
import proposalRoutes from './routes/proposal.routes.js';
import chatRoutes from './routes/chat.routes.js';
import codeRoutes from './routes/code.routes.js';

const app = express();
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/matching', matchingRoutes);
app.use('/api/restaurants', restaurantRoutes);   // ← 카카오 지도 API 프록시가 여기 들어간다
app.use('/api/proposals', proposalRoutes);
app.use('/api/chat', chatRoutes);                // ← 제미나이 추천 질문이 여기 들어간다
app.use('/api/codes', codeRoutes);

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
attachChatSocket(server);
server.listen(config.port, () => console.log(`API on http://localhost:${config.port}`));
