import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

export function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

export function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

export function decrypt(encryptedData, key, iv, authTag) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'base64')
  );

  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function computeHmacSync(data, keyBase64) {
  const hmac = crypto.createHmac('sha256', Buffer.from(keyBase64, 'base64'));
  hmac.update(data);
  return hmac.digest('base64');
}
  const encoder = new TextEncoder()

  const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )

  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(data)
  )

  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

export function verifyHmac(data, key, hmac) {
  const computed = computeHmac(data, key);
  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(hmac)
  );
}

export function generateKeyPair() {
  return crypto.generateKeyPairSync('x25519', {
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
}

export function deriveSharedKey(privateKey, publicKey) {
  const ecdh = crypto.createECDH('x25519');
  ecdh.setPrivateKey(privateKey, 'base64');

  const peerKey = crypto.createPublicKey(publicKey);
  const sharedSecret = ecdh.computeSecret(peerKey.export({ type: 'spki', format: 'der' }));

  return crypto.createHash('sha256').update(sharedSecret).digest();
}

export function importKey(pem, type) {
  return crypto.createPublicKey(pem);
}

export function arrayBufferToBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

export function base64ToArrayBuffer(base64) {
  return Buffer.from(base64, 'base64');
}
