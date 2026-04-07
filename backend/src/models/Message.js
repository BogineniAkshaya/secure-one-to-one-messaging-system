import mongoose from 'mongoose';
import crypto from 'crypto';

const messageSchema = new mongoose.Schema({
  from: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  encryptedContent: {
    type: String,
    required: true
  },
  iv: {
    type: String,
    required: true
  },
  hmac: {
    type: String,
    required: true
  },
  timestamp: {
    type: String,
    required: true,
    default: () => new Date().toISOString()
  },
  
  keyIndex: {
    type: Number,
    default: 0
  },
  type: {
    type: String,
    default: 'text'
  },
  read: {
    type: Boolean,
    default: false
  },
  prevHash: {
    type: String,
    default: '0'
  },
  hash: {
    type: String
  }
});

messageSchema.index({ from: 1, to: 1, timestamp: -1 });

messageSchema.statics.generateHash = function(encryptedContent, timestamp, prevHash) {
  const dataToHash = prevHash + encryptedContent + timestamp;
  return crypto.createHash('sha256').update(dataToHash).digest('hex');
};

messageSchema.statics.getLastMessage = async function(userId1, userId2) {
  return await this.findOne({
    $or: [
      { from: userId1, to: userId2 },
      { from: userId2, to: userId1 }
    ]
  }).sort({ timestamp: -1 });
};

const Message = mongoose.model('Message', messageSchema);

export default Message;
