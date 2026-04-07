import express from 'express';
import crypto from 'crypto';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// Helper: build the canonical string used for HMAC computation
const createHmacData = (msg) => {
  return JSON.stringify({
    encryptedContent: String(msg.encryptedContent),
    iv:               String(msg.iv),
    from:             String(msg.from),
    to:               String(msg.to),
    timestamp:        String(msg.timestamp),
    keyIndex:         Number(msg.keyIndex || 0),
  });
};

// Helper: compute HMAC-SHA256 synchronously, returns base64 string
const computeHmacSync = (data, secret) => {
  return crypto.createHmac('sha256', secret).update(data).digest('base64');
};

// GET /messages/:userId — fetch conversation with a user
router.get('/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const otherUser = await User.findById(userId);
    if (!otherUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const messages = await Message.find({
      $or: [
        { from: currentUserId, to: userId },
        { from: userId, to: currentUserId },
      ],
    })
      .sort({ timestamp: 1 })
      .limit(100);

    // Mark incoming unread messages as read
    await Message.updateMany(
      { from: userId, to: currentUserId, read: false },
      { read: true }
    );

    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /messages — send a message
router.post('/', auth, async (req, res) => {
  try {
    const { to, encryptedContent, iv, hmac, timestamp, keyIndex, type } = req.body;
    const from = req.user.id;

    // 1. Validate required fields first
    if (!to || !encryptedContent || !iv || !hmac) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // 2. Verify HMAC integrity
    const backendHmac = computeHmacSync(
      createHmacData({ encryptedContent, iv, from, to, timestamp, keyIndex }),
      process.env.SECRET_KEY
    );

    const clientHmacBuf  = Buffer.from(hmac, 'base64');
    const backendHmacBuf = Buffer.from(backendHmac, 'base64');

    if (
      clientHmacBuf.length !== backendHmacBuf.length ||
      !crypto.timingSafeEqual(clientHmacBuf, backendHmacBuf)
    ) {
      return res.status(400).json({ success: false, error: 'HMAC verification failed' });
    }

    // 3. Ensure recipient exists
    const recipient = await User.findById(to);
    if (!recipient) {
      return res.status(404).json({ success: false, error: 'Recipient not found' });
    }

    // 4. Build and save the message
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
      hash,
    });

    await message.save();

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;
