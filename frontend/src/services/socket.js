import { io } from 'socket.io-client'

const SOCKET_URL = 'https://secure-one-to-one-messaging-system.onrender.com'

let socketInstance = null

export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'], // Fix 1: Explicit transport fallback
    })

    socketInstance.on('connect', () => {
      console.log('[Socket] Connected:', socketInstance.id)
    })

    socketInstance.on('connect_error', (err) => {
      // Fix 2: Missing error handler — without this, unhandled errors can crash the app
      console.error('[Socket] Connection error:', err.message)
    })

    socketInstance.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason)

      // Fix 3: Handle server-initiated disconnects that won't auto-reconnect
      if (reason === 'io server disconnect') {
        socketInstance.connect()
      }
    })
  }

  return socketInstance
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect()
    socketInstance = null
  }
}

// Fix 4: Added a reset/reconnect utility — useful when auth state changes (e.g. login/logout)
export function resetSocket() {
  disconnectSocket()
  return getSocket()
}