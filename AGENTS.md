# AGENTS.md - SecureChat Development Guide

## Project Overview

SecureChat is a secure one-to-one messaging application with end-to-end encryption using AES-256-GCM, ECDH key exchange, and HMAC authentication.

## Tech Stack

- **Backend:** Node.js, Express, MongoDB (Mongoose)
- **Frontend:** React 18, Vite, React Router v6
- **Security:** AES-256-GCM, ECDH (P-256), HMAC-SHA256

---

## Build & Run Commands

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Backend

```bash
# Navigate to backend
cd backend

# Install dependencies
npm install

# Start development server (with auto-reload)
npm run dev

# Start production server
npm start

# Environment variables (.env)
PORT=5000
MONGODB_URI=mongodb://localhost:27017/securechat
JWT_SECRET=your-secret-key
NODE_ENV=development
```

### Frontend

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Running Both Simultaneously

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

---

## API Endpoints

### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login (returns JWT)
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/publicKey` - Update user's public key

### Users
- `GET /api/users` - List all users (excludes current user)
- `GET /api/users/:id` - Get user by ID

### Messages
- `GET /api/messages/:userId` - Get conversation with user
- `POST /api/messages` - Send encrypted message

**Headers:** `Authorization: Bearer <token>`

---

## Code Style Guidelines

### JavaScript/Node.js (Backend)

1. **Imports:** Use ES modules (`import`/`export`)
2. **Async/Await:** Always use async/await over callbacks
3. **Error Handling:** Wrap async routes in try/catch
4. **Naming:**
   - Variables/functions: camelCase
   - Classes: PascalCase
   - Constants: UPPER_SNAKE_CASE
5. **Strings:** Use template literals for string interpolation
6. **Objects:** Use destructuring where appropriate

### React (Frontend)

1. **Components:** Use functional components with hooks
2. **Naming:** PascalCase for components, camelCase for props
3. **State:** Use `useState` for local state, `useContext` for global
4. **Effects:** Use `useEffect` for side effects, include cleanup
5. **Lists:** Always provide unique `key` props
6. **Forms:** Use controlled components

### Security Practices

1. **Passwords:** Hash with bcrypt (12 rounds), never store plaintext
2. **Tokens:** JWT with expiration, store in httpOnly conceptually (here: localStorage)
3. **Validation:** Validate all user inputs server-side
4. **Error Messages:** Don't expose sensitive info in errors
5. **Encryption:** 
   - AES-256-GCM for message encryption
   - ECDH (P-256) for key exchange
   - HMAC-SHA256 for authentication

### Code Organization

```
backend/
├── src/
│   ├── config/       # Database config
│   ├── middleware/  # Express middleware (auth)
│   ├── models/      # Mongoose models
│   ├── routes/      # API routes
│   ├── services/   # Business logic (optional)
│   └── server.js   # Entry point

frontend/
├── src/
│   ├── components/ # Reusable UI components
│   ├── context/    # React contexts
│   ├── pages/      # Page components
│   ├── services/   # API & crypto services
│   ├── App.jsx     # Root component
│   └── main.jsx   # Entry point
```

### Git Conventions

- Branch: `feature/description` or `fix/description`
- Commits: Imperative mood ("Add feature" not "Added feature")
- Messages: First line < 72 chars, describe what/why

---

## Development Notes

### Cryptographic Flow

1. **Key Generation:** On login, generate ECDH key pair
2. **Public Key Exchange:** Store public key on server
3. **Shared Secret:** Both parties derive shared key using ECDH
4. **Encryption:** Messages encrypted with AES-256-GCM
5. **Authentication:** HMAC computed over ciphertext + IV + timestamp

### Database

- MongoDB required (local or Atlas)
- Connection string in `.env`
- Indexes created automatically by Mongoose

### Testing

```bash
# Backend - run server and test with curl or Postman
# Frontend - open http://localhost:5173
```

---

## Troubleshooting

- **MongoDB connection error:** Ensure MongoDB is running
- **CORS errors:** Check backend CORS configuration
- **JWT errors:** Token expires after 24h, re-login
- **Crypto errors:** Ensure both users have exchanged public keys
