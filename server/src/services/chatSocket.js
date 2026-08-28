import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool, one } from '../db/pool.js';

/** 채팅 실시간 전송 (Socket.IO). REST 와 같은 테이블/트리거를 그대로 탄다. */
export function attachChatSocket(server) {
  const io = new Server(server, { cors: { origin: config.clientOrigin } });

  io.use((socket, next) => {
    try {
      socket.user = jwt.verify(socket.handshake.auth?.token, config.jwt.secret);
      next();
    } catch { next(new Error('unauthorized')); }
  });

  io.on('connection', (socket) => {
    // 개인 알림용(보관함 신규 요청 등). 특정 채팅방과 무관하게 항상 들어간다.
    socket.join(`user:${socket.user.id}`);

    socket.on('room:join', async (matchId) => {
      const ok = await one('SELECT 1 AS ok FROM match_participant WHERE match_id=:m AND user_id=:u',
        { m: matchId, u: socket.user.id });
      if (ok) socket.join(`room:${matchId}`);
    });

    socket.on('message:send', async ({ matchId, content }, ack) => {
      try {
        const [ins] = await pool.execute(
          `INSERT INTO chat_message (match_id, sender_id, message_type, content)
           VALUES (:m, :u, 'TEXT', :c)`,
          { m: matchId, u: socket.user.id, c: content });
        const msg = await one('SELECT * FROM chat_message WHERE id=:id', { id: ins.insertId });
        io.to(`room:${matchId}`).emit('message:new', msg);
        ack?.({ ok: true, message: msg });

        // 상대가 지금 이 채팅방을 안 보고 있어도(다른 화면/탭) 브라우저 알림을 띄울 수 있게
        // 개인 방(user:상대ID)에도 따로 알린다. room:${matchId} 는 방을 연 사람만 듣는다.
        const other = await one(
          `SELECT mp.user_id, u.nickname AS senderNickname
             FROM match_participant mp JOIN users u ON u.id = :sender
            WHERE mp.match_id = :m AND mp.user_id <> :sender`,
          { m: matchId, sender: socket.user.id });
        if (other) {
          io.to(`user:${other.user_id}`).emit('chat:new', {
            matchId, senderNickname: other.senderNickname, preview: content.slice(0, 80),
          });
        }
      } catch (e) {
        ack?.({ ok: false, message: e.sqlMessage || e.message });
      }
    });
  });

  return io;
}
