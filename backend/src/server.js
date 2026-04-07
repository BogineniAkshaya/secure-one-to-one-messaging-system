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
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true
  }
});

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'SecureChat API is running' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    error: 'Something went wrong!' 
  });
});

const PORT = process.env.PORT || 5000;

io.on('connection', (socket) => {
  socket.on('join', (userId) => {
    if (socket.userId === userId) return
    socket.userId = userId
    socket.join(userId)
    console.log('User joined:', userId)
  });

  socket.on('sendMessage', async (messageData) => {
    try {
      console.log('[Socket] sendMessage received:', messageData)
      const { to, encryptedContent, iv, hmac, timestamp, keyIndex, type } = messageData;
      const from = messageData.from;

      const Message = (await import('./models/Message.js')).default;
      const timestampToUse = timestamp || new Date().toISOString();
      const lastMessage = await Message.getLastMessage(from, to);
      const prevHash = lastMessage?.hash || '0';
      const hash = Message.generateHash(encryptedContent, timestampToUse, prevHash);

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
      console.log('[Socket] Message saved with hash chain, emitting to:', to)

      io.to(to).emit('newMessage', message);
      console.log('[Socket] newMessage emitted')
    } catch (error) {
      console.error('Socket message error:', error);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('User disconnected:', reason, 'socketId:', socket.id);
  });
});

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
