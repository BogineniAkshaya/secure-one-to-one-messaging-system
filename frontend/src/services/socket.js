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
      reconnectionDelay: 1000
    })

    socketInstance.on('connect', () => {
      console.log('[Socket] Connected:', socketInstance.id)
    })

    socketInstance.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason)
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