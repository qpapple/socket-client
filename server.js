const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// 방별 상태 저장
const roomState = {};

io.on('connection', (socket) => {
    console.log('✅ 새 유저 연결:', socket.id);

    // ✅ 방 입장
    socket.on('joinRoom', ({ roomId }) => {
        socket.join(roomId);
        console.log(`${socket.id} joined room: ${roomId}`);

        const room = roomState[roomId];

        // 세그먼트 보내기
        if (room?.segments?.length > 0) {
            socket.emit('syncSegments', room.segments);
        }

        // 룰렛 결과까지 있는 경우 같이 보내기
        if (room?.result !== undefined && room?.resultIndex !== undefined) {
            socket.emit('spinRoulette', {
                result: room.result,
                resultIndex: room.resultIndex,
                segments: room.segments,
            });
        }

        // ✅ 입장 시 기존 채팅 히스토리 보내기
        if (room?.chat && room.chat.length > 0) {
            socket.emit('chatHistory', room.chat);
            console.log(`📜 채팅 히스토리 전송: room=${roomId}, messages=${room.chat.length}`);
        }
    });

    // ✅ 룰렛 회전 요청 (방장 → 서버 → 전체)
    socket.on('spinRoulette', ({ roomId, segments }) => {
        if (!segments || !Array.isArray(segments) || segments.length === 0) return;

        // 먼저 segments 전체 동기화
        io.to(roomId).emit('syncSegments', segments);

        const resultIndex = Math.floor(Math.random() * segments.length);
        const result = segments[resultIndex];

        // 최신 상태 저장
        roomState[roomId] = {
            ...roomState[roomId],
            segments,
            result,
            resultIndex,
        };

        io.to(roomId).emit('spinRoulette', {
            result,
            resultIndex,
            segments,
        });

        console.log(`🎯 룰렛 스핀 전송: room=${roomId}, result="${result}" (index=${resultIndex})`);
    });

    // ✅ segments 동기화
    socket.on('syncSegments', ({ roomId, segments }) => {
        if (!roomId || !Array.isArray(segments)) return;

        roomState[roomId] = {
            ...roomState[roomId],
            segments,
        };

        io.to(roomId).emit('syncSegments', segments);
        console.log(`🔄 세그먼트 동기화: room=${roomId}, items=${segments.length}`);
    });

    // ✅ 채팅 메시지 수신 → 저장 후 브로드캐스트
    socket.on('chatMessage', ({ roomId, user, text }) => {
        if (!roomId || !text || !user) return;

        const message = {
            user,
            text,
            time: new Date().toISOString(),
        };

        // 채팅 저장
        if (!roomState[roomId]) {
            roomState[roomId] = {};
        }
        if (!roomState[roomId].chat) {
            roomState[roomId].chat = [];
        }
        roomState[roomId].chat.push(message);

        // 최근 100개만 유지
        if (roomState[roomId].chat.length > 100) {
            roomState[roomId].chat = roomState[roomId].chat.slice(-100);
        }

        // 브로드캐스트
        io.to(roomId).emit('chatMessage', message);
        console.log(`💬 채팅 전송: room=${roomId}, ${user}: ${text}`);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`✅ Socket server running on http://localhost:${PORT}`);
});
