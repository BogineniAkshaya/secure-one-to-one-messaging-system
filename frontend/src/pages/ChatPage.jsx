import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import cryptoService from '../services/crypto'
import { getSocket, disconnectSocket } from '../services/socket'

export default function ChatPage() {
  const { user, logout, updatePublicKey } = useAuth()
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [messagesByUser, setMessagesByUser] = useState({})
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [cryptoReady, setCryptoReady] = useState(false)
  const [sharedKeys, setSharedKeys] = useState({})
  const [ratchetKeys, setRatchetKeys] = useState({})
  const [ratchetCounts, setRatchetCounts] = useState({})
  const messagesEndRef = useRef(null)
  const keyPairRef = useRef(null)
  const cryptoInitializedRef = useRef(false)
  const hasJoinedRef = useRef(false)
  const socketRef = useRef(null)
  const imageInputRef = useRef(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  const messages = selectedUser ? (messagesByUser[selectedUser._id] || []) : []

  // Use global socket instance
  useEffect(() => {
    const socket = getSocket()
    socketRef.current = socket
    
    return () => {
      socketRef.current = null
    }
  }, [])

  useEffect(() => {
    if (user && !cryptoInitializedRef.current) {
      const savedKeyPair = localStorage.getItem('keyPair')
      if (savedKeyPair) {
        const loadKeyPair = async () => {
          try {
            const { publicKey: pub64, privateKey: priv64 } = JSON.parse(savedKeyPair)
            
            const privateKey = await cryptoService.base64ToKey(priv64, 'private')
            const publicKey = await cryptoService.base64ToKey(pub64, 'public')
            
            keyPairRef.current = { 
              privateKey, 
              publicKey,
              publicKeyString: pub64
            }
            
            await updatePublicKey(pub64)
            
            setCryptoReady(true)
          } catch (e) {
            console.error('Failed to load keyPair, generating new one:', e)
            localStorage.removeItem('keyPair')
            cryptoInitializedRef.current = true
            initializeCrypto()
          }
        }
        loadKeyPair()
      } else {
        cryptoInitializedRef.current = true
        initializeCrypto()
      }
    }
  }, [user])

  useEffect(() => {
    if (cryptoReady) {
      fetchUsers()
      
      const interval = setInterval(() => {
        api.get('/users').then(response => {
          if (response.data.success) {
            setUsers(response.data.data)
          }
        })
      }, 5000)
      
      return () => clearInterval(interval)
    }
  }, [cryptoReady])

  useEffect(() => {
    if (!user || !socketRef.current) return
    
    // Emit join when socket connects
    const joinRoom = () => {
      if (!socketRef.current) return
      console.log('[Socket] Emitting join for user:', user._id)
      socketRef.current.emit('join', user._id)
      hasJoinedRef.current = true
    }
    
    if (socketRef.current.connected && !hasJoinedRef.current) {
      joinRoom()
    } else if (socketRef.current) {
      socketRef.current.once('connect', joinRoom)
    }
    
    return () => {
      if (socketRef.current) {
        socketRef.current.off('connect', joinRoom)
      }
    }
  }, [user])

  useEffect(() => {
    if (!socketRef.current) return
    
    const handleMessage = async (msg) => {
      console.log('Socket received new message:', msg)
      
      if (msg.from === user?._id) return
      
      const otherUserId = msg.from
      
      if (selectedUser && otherUserId === selectedUser._id) {
        let currentKey = ratchetKeys[otherUserId] || sharedKeys[otherUserId]
        
        if (!currentKey) {
          const otherUser = users.find(u => u._id === otherUserId)
          if (otherUser?.publicKey) {
            currentKey = await deriveSharedKey(otherUser)
          }
        }
        
        if (currentKey) {
          let decryptedContent
          try {
            if (!msg.hmac) {
              if (msg.type === 'image' || msg.type === 'audio') {
                const decryptedBuffer = await cryptoService.decryptData(msg.encryptedContent, currentKey, msg.iv)
                decryptedContent = URL.createObjectURL(new Blob([decryptedBuffer]))
              } else {
                decryptedContent = await cryptoService.decrypt(msg.encryptedContent, currentKey, msg.iv)
              }
              setMessagesByUser(prev => {
                const existing = prev[otherUserId] || []
                const exists = existing.some(m => m._id === msg._id)
                if (exists) return prev
                const newMsg = { ...msg, _id: msg._id, decryptedContent, isLegacy: true }
                return {
                  ...prev,
                  [otherUserId]: [...existing, newMsg].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                }
              })
              return
            }

            if (msg.type === 'image' || msg.type === 'audio') {
              const decryptedBuffer = await cryptoService.decryptData(msg.encryptedContent, currentKey, msg.iv)
              decryptedContent = URL.createObjectURL(new Blob([decryptedBuffer]))
            } else {
              decryptedContent = await cryptoService.decrypt(msg.encryptedContent, currentKey, msg.iv)
            }
            
            setMessagesByUser(prev => {
              const existing = prev[otherUserId] || []
              const exists = existing.some(m => m._id === msg._id)
              if (exists) return prev
              const newMsg = { ...msg, _id: msg._id, decryptedContent }
              return {
                ...prev,
                [otherUserId]: [...existing, newMsg].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
              }
            })
          } catch (e) {
            console.error('Immediate decryption failed:', e)
          }
        }
        
        setTimeout(() => fetchMessages(otherUserId), 100)
      }
    }

    socketRef.current.on('newMessage', handleMessage)

    return () => {
      if (socketRef.current) {
        socketRef.current.off('newMessage', handleMessage)
      }
    }
  }, [user, selectedUser])

  const loadPersistedKeys = async (userId) => {
    const storedSharedKey = localStorage.getItem(`sharedKey_${userId}`)
    const storedCount = parseInt(localStorage.getItem(`ratchetCount_${userId}`) || '0', 10)
    
    if (storedSharedKey) {
      try {
        const importedKey = await cryptoService.importRawKey(storedSharedKey)
        let currentKey = importedKey
        let currentIndex = 0
        
        while (currentIndex < storedCount) {
          currentKey = await cryptoService.deriveNextKey(currentKey)
          currentIndex++
        }
        
        setSharedKeys(prev => ({ ...prev, [userId]: importedKey }))
        setRatchetKeys(prev => ({ ...prev, [userId]: currentKey }))
        setRatchetCounts(prev => ({ ...prev, [userId]: storedCount }))
        return true
      } catch (e) {
        console.error('Failed to load persisted keys:', e)
      }
    }
    return false
  }

  useEffect(() => {
    if (!selectedUser || !cryptoReady) return

    const initChat = async () => {
      if (ratchetKeys[selectedUser._id] || sharedKeys[selectedUser._id]) {
        fetchMessages(selectedUser._id)
        return
      }

      const loaded = await loadPersistedKeys(selectedUser._id)
      if (!loaded && selectedUser.publicKey) {
        await deriveSharedKey(selectedUser)
      }
      fetchMessages(selectedUser._id)
    }

    initChat()
  }, [selectedUser, cryptoReady])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function initializeCrypto() { 
    try {
      const keyPair = await cryptoService.generateECDHKeyPair()
      
      const privateKey = await cryptoService.base64ToKey(keyPair.privateKey, 'private')
      const publicKey = await cryptoService.base64ToKey(keyPair.publicKey, 'public')
      
      keyPairRef.current = { 
        privateKey, 
        publicKey,
        publicKeyString: keyPair.publicKey
      }
      localStorage.setItem('keyPair', JSON.stringify(keyPair))
      
      await updatePublicKey(keyPair.publicKey)
      
      setCryptoReady(true)
    } catch (error) {
      console.error('[Crypto] Failed to initialize crypto:', error)
      cryptoInitializedRef.current = false
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users')
      if (response.data.success) {
        setUsers(response.data.data)
      }
    } catch (error) {
      console.error('[Chat] Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }

  const createHmacData = (msg) => {
  return JSON.stringify({
    encryptedContent: String(msg.encryptedContent),
    iv: String(msg.iv),
    from: String(msg.from),
    to: String(msg.to),
    timestamp: String(msg.timestamp),
    keyIndex: Number(msg.keyIndex || 0)
  });
};


  const verifyHashChain = async (messages) => {
    console.log('[HashChain] verifyHashChain called with', messages.length, 'messages')
    const sorted = [...messages].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime()
      const timeB = new Date(b.timestamp).getTime()
      if (timeA !== timeB) return timeA - timeB
      return (a._id || '').localeCompare(b._id || '')
    })
    const verified = []
    
    for (let i = 0; i < sorted.length; i++) {
      const msg = { ...sorted[i] }
      console.log(`[HashChain] Processing msg ${i}: prevHash=${msg.prevHash}, hash=${msg.hash?.slice(0,10)}...`)
      
      if (i === 0) {
        console.log(`[HashChain] First message: prevHash="${msg.prevHash}"`)
        if (!msg.hash || !msg.prevHash) {
          msg.chainVerified = null
        } else if (msg.prevHash !== '0') {
          console.log(`[HashChain] First message prevHash is not "0", marking as tampered`)
          msg.chainVerified = false
        } else {
          msg.chainVerified = true
        }
        verified.push(msg)
        continue
      }
      
      if (!msg.hash || !msg.prevHash) {
        msg.chainVerified = null
        verified.push(msg)
        continue
      }
      
      const prev = sorted[i - 1]
      if (!prev.hash) {
        msg.chainVerified = null
        verified.push(msg)
        continue
      }
      
      if (msg.prevHash !== prev.hash) {
        console.log(`[HashChain] Tampering detected: msg.prevHash=${msg.prevHash?.slice(0,10)}..., prev.hash=${prev.hash?.slice(0,10)}...`)
        msg.chainVerified = false
        verified.push(msg)
        continue
      }
      
      const dataToHash = msg.prevHash + msg.encryptedContent + msg.timestamp
      const expectedHash = await cryptoService.sha256(dataToHash)
      if (expectedHash !== msg.hash) {
        console.log(`[HashChain] Hash mismatch: expected=${expectedHash?.slice(0,10)}..., actual=${msg.hash?.slice(0,10)}...`)
      }
      msg.chainVerified = expectedHash === msg.hash
      verified.push(msg)
    }
    
    console.log('[HashChain] Verification complete, results:', verified.map(v => v.chainVerified))
    return verified
  }

  const fetchMessages = async (userId) => {
    try {
      const response = await api.get(`/messages/${userId}`)
      if (response.data.success) {
        console.log('[Fetch] Raw messages from server:', response.data.data.length)
        response.data.data.forEach((m, i) => {
          console.log(`[Fetch] Msg ${i}: _id=${m._id}, hash=${m.hash?.slice(0,10)}..., prevHash=${m.prevHash}`)
        })
        const decryptedMessages = await decryptMessages(response.data.data, userId)
        const sortedMsgs = decryptedMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        const verifiedMessages = await verifyHashChain(sortedMsgs)
        setMessagesByUser(prev => ({
          ...prev,
          [userId]: verifiedMessages
        }))
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    }
  }

  const deriveSharedKey = async (otherUser) => {
    if (!keyPairRef.current || !keyPairRef.current.privateKey) {
      return null
    }
    
    try {
      if (!otherUser.publicKey) {
        return null
      }
      
      const sharedKey = await cryptoService.deriveSharedKey(
        keyPairRef.current.privateKey,
        otherUser.publicKey
      )
      
      const exportedKey = await cryptoService.exportKey(sharedKey)
      localStorage.setItem(`sharedKey_${otherUser._id}`, exportedKey)
      localStorage.setItem(`ratchetCount_${otherUser._id}`, '0')
      
      setSharedKeys(prev => ({
        ...prev,
        [otherUser._id]: sharedKey
      }))
      setRatchetKeys(prev => ({
        ...prev,
        [otherUser._id]: sharedKey
      }))
      setRatchetCounts(prev => ({
        ...prev,
        [otherUser._id]: 0
      }))
      
      return sharedKey
    } catch (error) {
      console.error('[Crypto] Failed to derive shared key:', error)
      return null
    }
  }

  const decryptMessages = async (encryptedMessages, targetUserId) => {
    const decrypted = []
    let sortedMessages = [...encryptedMessages]
    sortedMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    
    for (const msg of sortedMessages) {
      try {
        const otherUserId = msg.from === user._id ? msg.to : msg.from
        
        let currentKey = sharedKeys[otherUserId]
        let currentIndex = 0

        if (!currentKey) {
          const otherUser = users.find(u => u._id === otherUserId)
          if (otherUser && otherUser.publicKey) {
            currentKey = await deriveSharedKey(otherUser)
          }
        }
        
        if (!currentKey) {
          decrypted.push({
            ...msg,
            decryptedContent: '[Unable to decrypt - key not available]'
          })
          continue
        }

        if (!msg.keyIndex) {
          if (!msg.hmac) {
            let decryptedContent
            if (msg.type === 'image' || msg.type === 'audio') {
              const decryptedBuffer = await cryptoService.decryptData(msg.encryptedContent, currentKey, msg.iv)
              decryptedContent = URL.createObjectURL(new Blob([decryptedBuffer]))
            } else {
              decryptedContent = await cryptoService.decrypt(msg.encryptedContent, currentKey, msg.iv)
            }
            decrypted.push({ ...msg, decryptedContent, isLegacy: true })
            continue
          }

          const keyBase64 = await cryptoService.exportKey(currentKey)
          const verifyData = createHmacData(msg)
          const hmacValid = await cryptoService.verifyHMAC(verifyData, keyBase64, msg.hmac)
          if (!hmacValid) {
            decrypted.push({ ...msg, decryptedContent: '[HMAC verification failed]' })
            continue
          }
          
          let decryptedContent
          if (msg.type === 'image' || msg.type === 'audio') {
            const decryptedBuffer = await cryptoService.decryptData(msg.encryptedContent, currentKey, msg.iv)
            decryptedContent = URL.createObjectURL(new Blob([decryptedBuffer]))
          } else {
            decryptedContent = await cryptoService.decrypt(msg.encryptedContent, currentKey, msg.iv)
          }
          decrypted.push({ ...msg, decryptedContent })
          continue
        }

        while (currentIndex < msg.keyIndex) {
          currentKey = await cryptoService.deriveNextKey(currentKey)
          currentIndex++
        }

        if (!msg.hmac) {
          let decryptedContent
          if (msg.type === 'image' || msg.type === 'audio') {
            const decryptedBuffer = await cryptoService.decryptData(msg.encryptedContent, currentKey, msg.iv)
            decryptedContent = URL.createObjectURL(new Blob([decryptedBuffer]))
          } else {
            decryptedContent = await cryptoService.decrypt(msg.encryptedContent, currentKey, msg.iv)
          }
          decrypted.push({ ...msg, decryptedContent, isLegacy: true })
          continue
        }

        const keyBase64 = await cryptoService.exportKey(currentKey)
        const verifyData = createHmacData(msg)
        const hmacValid = await cryptoService.verifyHMAC(verifyData, keyBase64, msg.hmac)

        if (!hmacValid) {
          decrypted.push({
            ...msg,
            decryptedContent: '[HMAC verification failed]'
          })
          continue
        }

        let decryptedContent
        if (msg.type === 'image' || msg.type === 'audio') {
          const decryptedBuffer = await cryptoService.decryptData(msg.encryptedContent, currentKey, msg.iv)
          decryptedContent = URL.createObjectURL(new Blob([decryptedBuffer]))
        } else {
          decryptedContent = await cryptoService.decrypt(msg.encryptedContent, currentKey, msg.iv)
        }

        decrypted.push({ ...msg, decryptedContent })
      } catch (error) {
        decrypted.push({
          ...msg,
          decryptedContent: '[Decryption failed]'
        })
      }
    }
    
    return decrypted
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedUser || sending) return
    
    let currentKey = ratchetKeys[selectedUser._id] || sharedKeys[selectedUser._id]
    
    if (!currentKey && selectedUser.publicKey) {
      currentKey = await deriveSharedKey(selectedUser)
    }
    
    if (!currentKey) {
      alert('Unable to establish secure connection.')
      return
    }

    setSending(true)

    try {
      const nextKey = await cryptoService.deriveNextKey(currentKey)
      const keyIndex = (ratchetCounts[selectedUser._id] || 0) + 1
      localStorage.setItem(`ratchetCount_${selectedUser._id}`, String(keyIndex))
      setRatchetKeys(prev => ({ ...prev, [selectedUser._id]: nextKey }))
      setRatchetCounts(prev => ({ ...prev, [selectedUser._id]: keyIndex }))

      const { encrypted, iv } = await cryptoService.encrypt(newMessage, nextKey)
      const keyBase64 = await cryptoService.exportKey(nextKey)
      
      const timestamp = new Date().toISOString()
      const from = user._id
      const to = selectedUser._id
      const messageData = {
        from,
        to,
        encryptedContent: encrypted,
        iv,
        timestamp,
        keyIndex
      }
      const hmacData = createHmacData(messageData)
      const hmac = await cryptoService.computeHMAC(hmacData, keyBase64)

      messageData.hmac = hmac

      socketRef.current?.emit('sendMessage', messageData)

      setMessagesByUser(prev => ({
        ...prev,
        [selectedUser._id]: [...(prev[selectedUser._id] || []), {
          ...messageData,
          decryptedContent: newMessage,
          _id: `temp_${Date.now()}`
        }]
      }))

      setNewMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !selectedUser || sending) return

    let currentKey = ratchetKeys[selectedUser._id] || sharedKeys[selectedUser._id]
    
    if (!currentKey && selectedUser.publicKey) {
      currentKey = await deriveSharedKey(selectedUser)
    }
    
    if (!currentKey) {
      alert('Unable to establish secure connection.')
      return
    }

    setSending(true)

    try {
      const compressedBuffer = await cryptoService.compressImage(file)
      const nextKey = await cryptoService.deriveNextKey(currentKey)
      const keyIndex = (ratchetCounts[selectedUser._id] || 0) + 1
      localStorage.setItem(`ratchetCount_${selectedUser._id}`, String(keyIndex))
      setRatchetKeys(prev => ({ ...prev, [selectedUser._id]: nextKey }))
      setRatchetCounts(prev => ({ ...prev, [selectedUser._id]: keyIndex }))

      const { encrypted, iv } = await cryptoService.encryptData(compressedBuffer, nextKey)
      const keyBase64 = await cryptoService.exportKey(nextKey)
      
      const timestamp = new Date().toISOString()
      const from = user._id
      const to = selectedUser._id
      const messageData = {
        from,
        to,
        encryptedContent: encrypted,
        iv,
        timestamp,
        keyIndex,
        type: 'image'
      }
      const hmacData = createHmacData(messageData)
      const hmac = await cryptoService.computeHMAC(hmacData, keyBase64)

      messageData.hmac = hmac

      socketRef.current?.emit('sendMessage', messageData)

      setMessagesByUser(prev => ({
        ...prev,
        [selectedUser._id]: [...(prev[selectedUser._id] || []), {
          ...messageData,
          _id: `temp_${Date.now()}`,
          imagePreview: URL.createObjectURL(file)
        }]
      }))

      setImagePreview(null)
    } catch (error) {
      console.error('Failed to send image:', error)
      alert('Failed to send image')
    } finally {
      setSending(false)
      if (imageInputRef.current) {
        imageInputRef.current.value = ''
      }
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }
      
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        await sendVoiceMessage()
      }
      
      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error('Failed to start recording:', error)
      alert('Microphone access denied')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const sendVoiceMessage = async () => {
    if (audioChunksRef.current.length === 0 || !selectedUser) return
    
    let currentKey = ratchetKeys[selectedUser._id] || sharedKeys[selectedUser._id]
    if (!currentKey && selectedUser.publicKey) {
      currentKey = await deriveSharedKey(selectedUser)
    }
    if (!currentKey) {
      alert('Unable to establish secure connection.')
      return
    }

    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const arrayBuffer = await audioBlob.arrayBuffer()
      
      const nextKey = await cryptoService.deriveNextKey(currentKey)
      const keyIndex = (ratchetCounts[selectedUser._id] || 0) + 1
      localStorage.setItem(`ratchetCount_${selectedUser._id}`, String(keyIndex))
      setRatchetKeys(prev => ({ ...prev, [selectedUser._id]: nextKey }))
      setRatchetCounts(prev => ({ ...prev, [selectedUser._id]: keyIndex }))

      const { encrypted, iv } = await cryptoService.encryptData(arrayBuffer, nextKey)
      const keyBase64 = await cryptoService.exportKey(nextKey)
      
      const timestamp = new Date().toISOString()
      const from = user._id
      const to = selectedUser._id
      const messageData = {
        from,
        to,
        encryptedContent: encrypted,
        iv,
        timestamp,
        keyIndex,
        type: 'audio'
      }
      const hmacData = createHmacData(messageData)
      const hmac = await cryptoService.computeHMAC(hmacData, keyBase64)

      messageData.hmac = hmac

      socketRef.current?.emit('sendMessage', messageData)

      setMessagesByUser(prev => ({
        ...prev,
        [selectedUser._id]: [...(prev[selectedUser._id] || []), {
          ...messageData,
          _id: `temp_${Date.now()}`,
          audioPreview: URL.createObjectURL(audioBlob)
        }]
      }))
    } catch (error) {
      console.error('Failed to send voice message:', error)
    }
    audioChunksRef.current = []
  }

  const handleDownloadImage = (msg) => {
    if (!msg.decryptedContent) return
    
    const link = document.createElement('a')
    link.href = msg.decryptedContent
    link.download = `encrypted-image-${Date.now()}.jpg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp)
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const getInitials = (username) => {
    return username?.slice(0, 2).toUpperCase() || '??'
  }

  if (loading) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="chat-page">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Contacts</h2>
          <div className="current-user">
            <span className="current-user-name">👤 {user?.username}</span>
            <button className="logout-btn" onClick={logout}>Logout</button>
          </div>
        </div>
        <div className="user-list">
          {users.map(u => (
            <div
              key={u._id}
              className={`user-item ${selectedUser?._id === u._id ? 'active' : ''}`}
              onClick={() => setSelectedUser(u)}
            >
              <div className="user-avatar">{getInitials(u.username)}</div>
              <div className="user-info">
                <div className="username">{u.username}</div>
              </div>
              <div className="online-indicator"></div>
            </div>
          ))}
        </div>
      </aside>

      <main className="chat-main">
        {selectedUser ? (
          <>
            <div className="chat-header">
              <div className="user-avatar">{getInitials(selectedUser.username)}</div>
              <h3>{selectedUser.username}</h3>
              <span className="encryption-badge">
                <span className="lock-icon">🔒</span>
                E2E Encrypted
              </span>
            </div>

            <div className="message-list">
              {messages.length === 0 ? (
                <div className="no-messages">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                <>
                  {messages.some(m => m.chainVerified === false) && (
                    <div style={{
                      background: '#ef4444',
                      color: 'white',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      marginBottom: '16px',
                      textAlign: 'center',
                      fontWeight: 'bold'
                    }}>
                      ⚠️ ATTENTION: Tampering detected in message chain!
                    </div>
                  )}
                  {messages.map((msg, idx) => (
                  <div
                    key={msg._id || idx}
                    className={`message ${msg.from === user._id ? 'sent' : 'received'}`}
                  >
                    <div className="message-content">
                      {msg.type === 'image' ? (
                        msg.imagePreview || msg.decryptedContent ? (
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <img 
                              src={msg.imagePreview || msg.decryptedContent} 
                              alt="Encrypted" 
                              style={{ maxWidth: '200px', maxHeight: '200px', borderRadius: '8px', cursor: 'pointer' }} 
                              onClick={() => handleDownloadImage(msg)}
                            />
                            <button
                              onClick={() => handleDownloadImage(msg)}
                              style={{
                                position: 'absolute',
                                bottom: '4px',
                                right: '4px',
                                background: 'rgba(0,0,0,0.6)',
                                border: 'none',
                                borderRadius: '4px',
                                color: 'white',
                                padding: '4px 8px',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                              title="Download Image"
                            >
                              ⬇️
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: '#888' }}>Loading image...</span>
                        )
                      ) : msg.type === 'audio' ? (
                        msg.audioPreview || msg.decryptedContent ? (
                          <audio controls src={msg.audioPreview || msg.decryptedContent} style={{ height: '36px' }} />
                        ) : (
                          <span style={{ color: '#888' }}>Loading audio...</span>
                        )
                      ) : (
                        msg.decryptedContent || msg.encryptedContent
                      )}
                      {msg.chainVerified === false && (
                        <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px', fontWeight: 'bold' }}>
                          ⚠️ Tampering detected
                        </div>
                      )}
                      {msg.chainVerified === true && (
                        <div style={{ color: '#22c55e', fontSize: '10px', marginTop: '2px', opacity: 0.7 }}>
                          ✓ Chain verified
                        </div>
                      )}
                      {msg.isLegacy && (
                        <div style={{ color: '#f59e0b', fontSize: '10px', marginTop: '2px', opacity: 0.7 }}>
                          Legacy message (not verified)
                        </div>
                      )}
                    </div>
                    <div className="message-time">
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                ))}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-container" onSubmit={handleSendMessage}>
              <input
                type="text"
                className="chat-input"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                disabled={sending}
              />
              <input
                type="file"
                ref={imageInputRef}
                accept="image/*"
                onChange={handleImageSelect}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="btn btn-secondary image-btn"
                onClick={() => imageInputRef.current?.click()}
                disabled={sending}
                title="Send Image"
              >
                <span style={{ fontSize: '18px' }}>📷</span>
              </button>
              {isRecording ? (
                <button
                  type="button"
                  className="btn btn-recording"
                  onClick={stopRecording}
                  title="Stop Recording"
                >
                  ⏹️
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary image-btn"
                  onClick={startRecording}
                  disabled={sending}
                  title="Record Voice"
                >
                  <span style={{ fontSize: '18px' }}>🎤</span>
                </button>
              )}
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={!newMessage.trim() || sending || isRecording}
              >
                {sending ? '...' : 'Send'}
              </button>
            </form>
          </>
        ) : (
          <div className="no-chat-selected">
            Select a conversation to start messaging
          </div>
        )}
      </main>
    </div>
  )
}
