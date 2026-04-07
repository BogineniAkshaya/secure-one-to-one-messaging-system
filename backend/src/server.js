import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import messageRoutes from './routes/messages.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// ✅ Allowed origins (IMPORTANT)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://secure-one-to-one-messaging-system-1.onrender.com'
];

// ✅ Socket.IO CORS
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

// ✅ Express CORS
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());

// ✅ Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// ✅ Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'SecureChat API is running' });
});

// ✅ Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Something went wrong!'
  });
});

const PORT = process.env.PORT || 5000;

// ✅ Socket logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (userId) => {
    if (socket.userId === userId) return;
    socket.userId = userId;
    socket.join(userId);
    console.log('User joined:', userId);
  });

  socket.on('sendMessage', async (messageData) => {
    try {
      console.log('[Socket] sendMessage received:', messageData);

      const { to, encryptedContent, iv, hmac, timestamp, keyIndex, type } = messageData;
      const from = messageData.from;

      const Message = (await import('./models/Message.js')).default;

      const timestampToUse = timestamp || new Date().toISOString();
      const lastMessage = await Message.getLastMessage(from, to);
      const prevHash = lastMessage?.hash || '0';

      const hash = Message.generateHash(
        encryptedContent,
        timestampToUse,
        prevHash
      );

      const message = new Message({
        from,
        to,
        encryptedContent,
        iv,
        hmac,
        timestamp: timestampToUse,
        keyIndex: keyIndex || 0,
        type: type || 'text',
        prevHash,
        hash
      });

      await message.save();

      console.log('[Socket] Message saved, emitting...');
      io.to(to).emit('newMessage', message);

    } catch (error) {
      console.error('Socket message error:', error);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('User disconnected:', reason, 'socketId:', socket.id);
  });
});

// ✅ Start server
const startServer = async () => {
  try {
    await connectDB();

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();