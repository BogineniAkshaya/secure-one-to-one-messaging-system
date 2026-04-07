# SecureChat - One-to-One Encrypted Messaging Application

## 1. Project Overview

**Project Name:** SecureChat  
**Project Type:** Full-stack Web Application  
**Core Functionality:** A secure one-to-one messaging application with end-to-end encryption using AES, Diffie-Hellman key exchange, and HMAC authentication.  
**Target Users:** Privacy-conscious users who need secure communication.

---

## 2. Tech Stack

### Backend
- **Runtime:** Node.js (v18+)
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose ODM
- **Authentication:** JWT (JSON Web Tokens)
- **Password Hashing:** bcrypt

### Frontend
- **Framework:** React 18 with Vite
- **Routing:** React Router v6
- **HTTP Client:** Axios
- **State Management:** React Context API

### Security Libraries
- **AES-256-GCM:** Message encryption
- **Diffie-Hellman:** Key exchange (ECDH - Elliptic Curve Diffie-Hellman)
- **HMAC-SHA256:** Message authentication
- **Web Crypto API:** Browser-side cryptographic operations

---

## 3. UI/UX Specification

### Color Palette
- **Primary:** `#0f172a` (Dark slate - main background)
- **Secondary:** `#1e293b` (Slate - cards/panels)
- **Accent:** `#06b6d4` (Cyan - buttons, highlights)
- **Accent Hover:** `#0891b2` (Darker cyan)
- **Text Primary:** `#f8fafc` (Off-white)
- **Text Secondary:** `#94a3b8` (Muted gray)
- **Success:** `#22c55e` (Green)
- **Error:** `#ef4444` (Red)
- **Border:** `#334155` (Slate border)

### Typography
- **Font Family:** `'JetBrains Mono', 'Fira Code', monospace` for code/encryption feel
- **Headings:** 700 weight
- **Body:** 400 weight, 16px base
- **Small:** 14px

### Layout Structure

#### Login/Register Pages
- Centered card (400px max-width)
- Logo/title at top
- Form fields below
- Subtle glow effect on card

#### Main Chat Layout
- **Left Sidebar (280px):** User list with online status
- **Main Chat Area (flex-grow):** Message thread
- **Header:** Current chat partner info

### Components

#### Buttons
- Primary: Cyan background, dark text, 8px padding, 6px border-radius
- Hover: Slight scale (1.02) and brightness increase
- Disabled: 50% opacity, no pointer events

#### Input Fields
- Dark background (`#0f172a`)
- Border: 1px solid `#334155`
- Focus: Cyan border glow
- Padding: 12px 16px

#### Message Bubbles
- Sent: Cyan background (`#06b6d4`), dark text, right-aligned
- Received: Slate background (`#1e293b`), light text, left-aligned
- Max-width: 70%
- Border-radius: 16px (with tail on sender side)
- Timestamp below in small muted text

#### User List Items
- Avatar placeholder (initials)
- Username
- Online indicator (green dot)
- Hover: Lighter background

### Animations
- Page transitions: Fade in (200ms)
- Message appear: Slide up + fade (150ms)
- Button hover: Transform scale (100ms ease)
- Loading spinner: Rotating circle

---

## 4. Functionality Specification

### Authentication

#### Registration
- Fields: username (unique), email (unique), password
- Password requirements: Min 8 characters
- Password hashed with bcrypt (12 rounds)
- Returns JWT token on success

#### Login
- Fields: email, password
- Returns JWT token (24h expiry)
- Token stored in localStorage

### User Management
- Get all users (for contact list)
- Get user by ID
- User schema: username, email, passwordHash, publicKey, createdAt
- Public key stored for DH key exchange

### Messaging

#### Message Schema
```
{
  from: ObjectId,
  to: ObjectId,
  encryptedContent: String (AES-256-GCM encrypted),
  iv: String (Base64),
  hmac: String (Base64),
  timestamp: Date,
  read: Boolean
}
```

#### End-to-End Encryption Flow
1. **Key Exchange (DH):**
   - Each user generates an ECDH key pair on login
   - Public keys stored in MongoDB
   - When chatting, both parties retrieve each other's public keys
   - Shared secret derived using ECDH

2. **Message Encryption (AES):**
   - Plaintext encrypted with AES-256-GCM
   - Random IV generated per message
   - IV sent alongside ciphertext

3. **Message Authentication (HMAC):**
   - HMAC-SHA256 computed over: ciphertext + IV + timestamp
   - Both parties verify HMAC before decrypting

#### API Endpoints

**Auth:**
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

**Users:**
- `GET /api/users` - List all users (except current)
- `GET /api/users/:id` - Get user by ID

**Messages:**
- `GET /api/messages/:userId` - Get conversation with user
- `POST /api/messages` - Send encrypted message

---

## 5. API Specification

### Base URL
`http://localhost:5000/api`

### Responses
- Success: `{ success: true, data: {...} }`
- Error: `{ success: false, error: "message" }`

### Headers
- `Authorization: Bearer <token>` for protected routes

---

## 6. Security Considerations

- Passwords never stored in plain text
- JWT tokens expire after 24 hours
- CORS configured for frontend origin
- Input validation on all endpoints
- HMAC verification before decryption
- Secure random IV for each message

---

## 7. Acceptance Criteria

1. User can register with username, email, password
2. User can login and receive JWT token
3. User can see list of other users
4. User can select another user and view conversation
5. User can send encrypted messages
6. Only intended recipient can decrypt messages
7. Messages display in real-time (with polling or refresh)
8. UI matches dark theme specification
9. Application handles errors gracefully

---

## 8. Project Structure

```
/crypto_project
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   └── Message.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── users.js
│   │   │   └── messages.js
│   │   ├── server.js
│   │   └── cryptoUtils.js
│   ├── package.json
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AuthForm.jsx
│   │   │   ├── Chat.jsx
│   │   │   ├── MessageList.jsx
│   │   │   ├── MessageInput.jsx
│   │   │   └── UserList.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   └── ChatPage.jsx
│   │   ├── services/
│   │   │   ├── api.js
│   │   │   └── crypto.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── AGENTS.md
```
