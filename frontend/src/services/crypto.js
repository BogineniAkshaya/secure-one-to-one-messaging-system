const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

async function generateKey() {
  return await crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

async function exportKey(key) {
  const exported = await crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64(exported);
}

async function importKey(keyData) {
  const keyBuffer = base64ToArrayBuffer(keyData);
  return await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

async function importRawKey(base64Key) {
  const keyBuffer = base64ToArrayBuffer(base64Key);
  return await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(plaintext, key) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  return {
    encrypted: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv)
  };
}

async function encryptData(dataBuffer, key) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    dataBuffer
  );

  return {
    encrypted: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv)
  };
}

async function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              blob.arrayBuffer().then(resolve).catch(reject);
            } else {
              reject(new Error('Failed to create blob'));
            }
          },
          file.type || 'image/jpeg',
          quality
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function decryptData(encryptedData, key, iv) {
  const encryptedBuffer = base64ToArrayBuffer(encryptedData);
  const ivBuffer = base64ToArrayBuffer(iv);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: ivBuffer },
    key,
    encryptedBuffer
  );

  return decrypted;
}

async function decrypt(encryptedData, key, iv) {
  const encryptedBuffer = base64ToArrayBuffer(encryptedData);
  const ivBuffer = base64ToArrayBuffer(iv);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: ivBuffer },
    key,
    encryptedBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

async function generateECDHKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );

  const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(publicKey),
    privateKey: arrayBufferToBase64(privateKey)
  };
}

async function deriveSharedKey(myPrivateKey, peerPublicKey) {
  let privateKey;
  
  if (typeof myPrivateKey === 'string') {
    const privateKeyBuffer = base64ToArrayBuffer(myPrivateKey);
    privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyBuffer,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    );
  } else {
    privateKey = myPrivateKey;
  }
  
  let publicKey;
  if (typeof peerPublicKey === 'string') {
    const publicKeyBuffer = base64ToArrayBuffer(peerPublicKey);
    publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyBuffer,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );
  } else {
    publicKey = peerPublicKey;
  }

  const sharedKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );

  return sharedKey;
}

async function base64ToKey(base64, type) {
  const buffer = base64ToArrayBuffer(base64)
  if (type === 'private') {
    return await crypto.subtle.importKey(
      'pkcs8',
      buffer,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    )
  } else {
    return await crypto.subtle.importKey(
      'spki',
      buffer,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    )
  }
}

async function computeHMAC(data, key) {
  const encoder = new TextEncoder();
  let keyData;
  
  if (typeof key === 'string') {
    keyData = base64ToArrayBuffer(key);
  } else {
    keyData = await crypto.subtle.exportKey('raw', key);
  }
  
  const hmacCryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', hmacCryptoKey, encoder.encode(data));
  return arrayBufferToBase64(signature);
}

async function verifyHMAC(data, key, hmac) {
  const computedHMAC = await computeHMAC(data, key);
  if (computedHMAC.length !== hmac.length) return false;
  
  const encoder = new TextEncoder();
  const computedBuffer = encoder.encode(computedHMAC);
  const hmacBuffer = encoder.encode(hmac);
  
  if (computedBuffer.length !== hmacBuffer.length) return false;
  
  let result = 0;
  for (let i = 0; i < computedBuffer.length; i++) {
    result |= computedBuffer[i] ^ hmacBuffer[i];
  }
  return result === 0;
}

async function deriveNextKey(currentKey) {
  const exported = await crypto.subtle.exportKey('raw', currentKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', exported);
  return await crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

async function deriveHmacKey(aesKey) {
  const exported = await crypto.subtle.exportKey('raw', aesKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', exported);
  return await crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function sha256(data) {
  const encoder = new TextEncoder();
  const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  let hashHex = '';
  for (let i = 0; i < hashArray.length; i++) {
    hashHex += hashArray[i].toString(16).padStart(2, '0');
  }
  return hashHex;
}

export const cryptoService = {
  generateKey,
  exportKey,
  importKey,
  importRawKey,
  encrypt,
  decrypt,
  encryptData,
  decryptData,
  compressImage,
  generateECDHKeyPair,
  deriveSharedKey,
  deriveNextKey,
  deriveHmacKey,
  computeHMAC,
  verifyHMAC,
  sha256,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  base64ToKey
};

export default cryptoService;
