import { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import callerRingtoneSrc from '../assets/ringtone/caller.mp3'
import receiverRingtoneSrc from '../assets/ringtone/reciever.mp3'
import { getPortalAccountId, getPortalEmpId, getPortalUsername, isPortalSessionActive } from '../api/client'
import { fetchEmployees } from '../api/employees'
import { getBaseUrl } from '../api/config'

export type CallPhase = 'idle' | 'calling' | 'ringing' | 'in_call'
export type CallType = 'audio' | 'video'

export type SocketCallIncoming = {
  callId: string
  callerId: number
  callerName?: string
  offer: RTCSessionDescriptionInit
  callType?: CallType
}

export type CallerIdentityBinding = {
  empId: number
  displayName: string
}

export type CameraFacingMode = 'user' | 'environment'

type CallContextValue = {
  callPhase: CallPhase
  callError: string
  incomingCall: SocketCallIncoming | null
  callPeerName: string
  callType: CallType
  cameraFacingMode: CameraFacingMode
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  /** Single shared chat socket (`ChatPage`): attach signalling listeners — no separate IO client. */
  bindCallSocket: (socket: Socket | null, identity: CallerIdentityBinding | null) => void
  startCall: (calleeEmpId: number, calleeName: string, type?: CallType) => Promise<void>
  acceptCall: () => Promise<void>
  rejectCall: () => void
  endCall: () => void
  switchCamera: () => Promise<void>
  clearError: () => void
}

const CallContext = createContext<CallContextValue | null>(null)

export function CallProvider({ children }: { children: ReactNode }) {
  const [callPhase, setCallPhase] = useState<CallPhase>('idle')
  const [callError, setCallError] = useState('')
  const [incomingCall, setIncomingCall] = useState<SocketCallIncoming | null>(null)
  const [callPeerName, setCallPeerName] = useState('')
  const [callType, setCallType] = useState<CallType>('audio')
  const [cameraFacingMode, setCameraFacingMode] = useState<CameraFacingMode>('user')
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)

  const socketRef = useRef<Socket | null>(null)
  const internalSocketRef = useRef<Socket | null>(null)
  const callPhaseRef = useRef<CallPhase>('idle')
  const callTypeRef = useRef<CallType>('audio')
  const currentCallIdRef = useRef<string | null>(null)
  const currentCallPeerEmpIdRef = useRef<number | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  /** Accumulates remote MediaStreamTracks (Unified Plan often omits `streams[0]` on ontrack). */
  const remoteMergedStreamRef = useRef<MediaStream | null>(null)
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([])
  const myEmpIdRef = useRef<number | null>(null)
  const myDisplayNameRef = useRef<string>('')
  const detachListenersRef = useRef<(() => void) | null>(null)
  const facingModeRef = useRef<CameraFacingMode>('user')
  const callerToneRef = useRef<HTMLAudioElement | null>(null)
  const receiverToneRef = useRef<HTMLAudioElement | null>(null)
  const ensureInternalSocketRef = useRef<(() => void) | null>(null)

  const buildSocketBaseUrl = (): string => {
    const raw = String(import.meta.env.VITE_SOCKET_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? '').trim()
    if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, '')
    try {
      const base = getBaseUrl()
      if (/^https?:\/\//i.test(base)) return base.replace(/\/$/, '')
    } catch {
      /* ignore */
    }
    return window.location.origin
  }

  const inferCallTypeFromOffer = (offer: RTCSessionDescriptionInit | undefined): CallType => {
    const sdp = String(offer?.sdp ?? '')
    // If the offer includes a video m-line, it’s a video call (some servers don’t forward `callType`).
    return /m=video\b/i.test(sdp) ? 'video' : 'audio'
  }

  useEffect(() => {
    callPhaseRef.current = callPhase
  }, [callPhase])
  useEffect(() => {
    callTypeRef.current = callType
  }, [callType])
  useEffect(() => {
    facingModeRef.current = cameraFacingMode
  }, [cameraFacingMode])

  const stopRingtone = useCallback((target: 'caller' | 'receiver' | 'all' = 'all') => {
    const stop = (audio: HTMLAudioElement | null) => {
      if (!audio) return
      audio.pause()
      audio.currentTime = 0
    }
    if (target === 'caller') {
      stop(callerToneRef.current)
      return
    }
    if (target === 'receiver') {
      stop(receiverToneRef.current)
      return
    }
    stop(callerToneRef.current)
    stop(receiverToneRef.current)
  }, [])

  const playRingtone = useCallback((target: 'caller' | 'receiver') => {
    const ref = target === 'caller' ? callerToneRef : receiverToneRef
    if (!ref.current) {
      const audio = new Audio(target === 'caller' ? callerRingtoneSrc : receiverRingtoneSrc)
      audio.loop = true
      audio.preload = 'auto'
      ref.current = audio
    }
    const audio = ref.current
    if (!audio) return
    audio.currentTime = 0
    void audio.play().catch(() => {
      // Autoplay may be blocked until user interaction.
    })
  }, [])

  useEffect(() => {
    const isIncomingRinging = callPhase === 'ringing' && Boolean(incomingCall)
    const isOutgoingRinging = (callPhase === 'calling' || callPhase === 'ringing') && !incomingCall

    if (isIncomingRinging) {
      stopRingtone('caller')
      playRingtone('receiver')
      return
    }
    if (isOutgoingRinging) {
      stopRingtone('receiver')
      playRingtone('caller')
      return
    }
    stopRingtone('all')
  }, [callPhase, incomingCall, playRingtone, stopRingtone])

  const teardownCall = useCallback(() => {
    const pc = peerConnectionRef.current
    if (pc) {
      pc.onicecandidate = null
      pc.ontrack = null
      pc.close()
    }
    peerConnectionRef.current = null
    pendingIceRef.current = []
    remoteMergedStreamRef.current = null
    currentCallIdRef.current = null
    currentCallPeerEmpIdRef.current = null
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) t.stop()
      localStreamRef.current = null
    }
    setLocalStream(null)
    setRemoteStream(null)
    setCallPhase('idle')
    setCallPeerName('')
    setCallType('audio')
    setIncomingCall(null)
  }, [])

  const ensureMediaStream = useCallback(async (type: CallType): Promise<MediaStream> => {
    const existing = localStreamRef.current
    if (existing) {
      const hasAudio = existing.getAudioTracks().length > 0
      const hasVideo = existing.getVideoTracks().length > 0
      if (type === 'audio' && hasAudio) return existing
      if (type === 'video' && hasAudio && hasVideo) return existing
      for (const t of existing.getTracks()) t.stop()
      localStreamRef.current = null
      setLocalStream(null)
    }
    const facingMode = facingModeRef.current
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
        channelCount: 1,
        googEchoCancellation: true,
        googAutoGainControl: true,
        googNoiseSuppression: false,
        googHighpassFilter: true,
        googTypingNoiseDetection: true,
      } as any,
      video:
        type === 'video'
          ? {
              width: { ideal: 1920, max: 1920 },
              height: { ideal: 1080, max: 1080 },
              frameRate: { ideal: 30, max: 60 },
              facingMode,
            }
          : false,
    })
    localStreamRef.current = stream
    setLocalStream(stream)
    return stream
  }, [])

  const replaceVideoTrackOnPeerConnection = useCallback(async (newTrack: MediaStreamTrack) => {
    const pc = peerConnectionRef.current
    if (!pc) return
    const sender = pc.getSenders().find((s) => s.track?.kind === 'video') ?? null
    if (sender) {
      try {
        await sender.replaceTrack(newTrack)
      } catch {
        // ignore — some browsers require renegotiation; local preview still updates.
      }
    }
  }, [])

  const tuneRealtimeSender = useCallback(async (sender: RTCRtpSender) => {
    try {
      const params = sender.getParameters()
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
      
      const isVideo = sender.track?.kind === 'video'
      
      for (const enc of params.encodings) {
        if (isVideo) {
          // Allow up to 10 Mbps for truly "raw" camera quality if the network allows
          enc.maxBitrate = 10_000_000 
          enc.maxFramerate = 60
          ;(enc as any).networkPriority = 'high'
          ;(enc as any).priority = 'high'
        } else {
          // High fidelity audio (Opus)
          enc.maxBitrate = 256_000
        }
      }
      
      // 'maintain-resolution' ensures the recipient gets the full pixels even if framerate drops slightly
      ;(params as any).degradationPreference = 'maintain-resolution'
      await sender.setParameters(params)
    } catch {
      // Ignore if unsupported by browser.
    }
  }, [])

  const configureTrackHints = (stream: MediaStream) => {
    try {
      for (const t of stream.getTracks()) {
        if (t.kind === 'video') (t as any).contentHint = 'motion'
        if (t.kind === 'audio') (t as any).contentHint = 'speech'
      }
    } catch {
      /* ignore */
    }
  }

  const ensurePeerConnection = useCallback((targetEmpId: number): RTCPeerConnection => {
    if (peerConnectionRef.current) return peerConnectionRef.current
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ],
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 10,
    })
    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      socketRef.current?.emit('call:ice-candidate', { targetId: targetEmpId, candidate: e.candidate })
    }
    pc.ontrack = (e) => {
      const track = e.track
      if (!remoteMergedStreamRef.current) remoteMergedStreamRef.current = new MediaStream()
      const ms = remoteMergedStreamRef.current
      if (!ms.getTracks().some((t) => t.id === track.id)) ms.addTrack(track)
      track.addEventListener('ended', () => {
        try {
          ms.removeTrack(track)
        } catch {
          /* ignore */
        }
        const tracks = ms.getTracks()
        setRemoteStream(tracks.length > 0 ? new MediaStream(tracks) : null)
      })
      setRemoteStream(new MediaStream(ms.getTracks()))
    }
    peerConnectionRef.current = pc
    return pc
  }, [])

  const bindCallSocket = useCallback(
    (socket: Socket | null, identity: CallerIdentityBinding | null) => {
      detachListenersRef.current?.()
      detachListenersRef.current = null
      socketRef.current = socket

      // If we're switching to an external socket (ChatPage), shut down the internal one to avoid double ringing.
      if (socket && internalSocketRef.current && socket !== internalSocketRef.current) {
        try { internalSocketRef.current.disconnect() } catch {}
        internalSocketRef.current = null
      }

      if (identity && identity.empId > 0) {
        myEmpIdRef.current = identity.empId
        myDisplayNameRef.current = String(identity.displayName ?? '').trim()
      }
      if (!socket) {
        // ChatPage unmounted — immediately re-establish the internal call socket
        // so calls still ring on other pages without requiring a focus change.
        queueMicrotask(() => ensureInternalSocketRef.current?.())
        return
      }

      const onError = (p: { message?: string }) => {
        setCallError(String(p?.message ?? 'Call failed.').trim() || 'Call failed.')
        teardownCall()
      }
      const onInitiated = (p: { callId?: string }) => {
        if (p?.callId) currentCallIdRef.current = p.callId
        setCallPhase('ringing')
      }
      const onIncoming = (p: SocketCallIncoming) => {
        if (callPhaseRef.current !== 'idle') {
          socket.emit('call:reject', { callId: p.callId, callerId: p.callerId })
          return
        }
        const inferred = p.callType ?? inferCallTypeFromOffer(p.offer)
        setIncomingCall({ ...p, callType: inferred })
        setCallPhase('ringing')
        setCallType(inferred)
        setCallPeerName(String(p.callerName ?? `Employee ${p.callerId}`))
        currentCallIdRef.current = p.callId
        currentCallPeerEmpIdRef.current = Number(p.callerId)
      }
      const onAnswered = async (p: { callId?: string; answer?: RTCSessionDescriptionInit }) => {
        const pc = peerConnectionRef.current
        if (!pc || !p?.answer) return
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(p.answer))
          for (const c of pendingIceRef.current) await pc.addIceCandidate(new RTCIceCandidate(c))
          pendingIceRef.current = []
          setCallPhase('in_call')
        } catch {
          setCallError('Failed to establish call.')
          teardownCall()
        }
      }
      const onRejected = () => {
        setCallError('Call was rejected.')
        teardownCall()
      }
      const onIce = async (p: { candidate?: RTCIceCandidateInit }) => {
        if (!p?.candidate) return
        const pc = peerConnectionRef.current
        if (!pc) {
          pendingIceRef.current.push(p.candidate)
          return
        }
        try {
          if (pc.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(p.candidate))
          else pendingIceRef.current.push(p.candidate)
        } catch {
          /* ignore */
        }
      }
      const onEnded = () => teardownCall()

      const onChatMessage = (evt: any) => {
        // Do not notify if they are actively looking at the chat page
        const isChatPath = window.location.pathname.includes('/chat')
        const isActiveChatWindow = isChatPath && document.visibilityState === 'visible'
        
        // Do not notify for our own messages sent from another session
        const myEmpId = myEmpIdRef.current
        const senderEmpId = Number(evt.senderEmpID)
        const isOwnMessage = myEmpId && myEmpId > 0 && senderEmpId === myEmpId

        if (isActiveChatWindow || isOwnMessage) return

        const senderName = String(evt.senderName ?? evt.sender ?? 'Employee').trim()
        const text = String(evt.message ?? evt.text ?? evt.content ?? 'Sent a new message').trim()

        if (Notification.permission === 'granted') {
          new Notification(`New message from ${senderName}`, { body: text })
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then((perm) => {
            if (perm === 'granted') {
              new Notification(`New message from ${senderName}`, { body: text })
            }
          })
        }
      }

      socket.on('call:error', onError)
      socket.on('call:initiated', onInitiated)
      socket.on('call:incoming', onIncoming)
      socket.on('call:answered', onAnswered)
      socket.on('call:rejected', onRejected)
      socket.on('call:ice-candidate', onIce)
      socket.on('call:ended', onEnded)

      // Chat notifications
      socket.on('message', onChatMessage)
      socket.on('chat_message', onChatMessage)
      socket.on('new_message', onChatMessage)
      socket.on('receive_message', onChatMessage)
      socket.on('receiveMessage', onChatMessage)
      socket.on('conversation_message', onChatMessage)

      detachListenersRef.current = () => {
        socket.off('call:error', onError)
        socket.off('call:initiated', onInitiated)
        socket.off('call:incoming', onIncoming)
        socket.off('call:answered', onAnswered)
        socket.off('call:rejected', onRejected)
        socket.off('call:ice-candidate', onIce)
        socket.off('call:ended', onEnded)
        
        socket.off('message', onChatMessage)
        socket.off('chat_message', onChatMessage)
        socket.off('new_message', onChatMessage)
        socket.off('receive_message', onChatMessage)
        socket.off('receiveMessage', onChatMessage)
        socket.off('conversation_message', onChatMessage)
      }
    },
    [teardownCall],
  )

  // Keep calls ringing even when ChatPage isn't mounted by maintaining a lightweight internal socket.
  useEffect(() => {
    let cancelled = false
    let retryTimer: number | null = null

    const ensureInternal = async () => {
      if (cancelled) return
      if (!isPortalSessionActive()) return
      if (socketRef.current) return // ChatPage already bound a socket
      if (internalSocketRef.current) return

      // Resolve my employee id for call registration.
      const sessionEmpId = getPortalEmpId()
      const accId = Number(getPortalAccountId() ?? 0)
      const username = String(getPortalUsername() ?? '').trim().toLowerCase()

      let empId = sessionEmpId ?? null
      let displayName = username
      if (!empId) {
        const employees = await fetchEmployees().catch(() => [])
        if (cancelled) return
        const me =
          (accId > 0 ? employees.find((e) => Number(e.accId ?? 0) === accId) : undefined) ||
          (username ? employees.find((e) => String(e.email ?? '').trim().toLowerCase() === username) : undefined) ||
          (username ? employees.find((e) => String(e.name ?? '').trim().toLowerCase() === username) : undefined)
        if (me?.id) empId = Number(me.id)
        displayName = String(me?.name ?? '').trim() || username
      }

      if (!empId || empId <= 0) {
        // Not logged in / no Emp_ID yet — retry briefly.
        retryTimer = window.setTimeout(ensureInternal, 1200)
        return
      }

      myEmpIdRef.current = empId
      myDisplayNameRef.current = displayName

      const socket = io(buildSocketBaseUrl(), {
        transports: ['polling', 'websocket'],
        withCredentials: true,
        timeout: 4000,
        reconnection: true,
        reconnectionAttempts: 50,
        reconnectionDelay: 500,
        reconnectionDelayMax: 3000,
      })
      internalSocketRef.current = socket
      bindCallSocket(socket, { empId, displayName })

      socket.on('connect', () => {
        socket.emit('call:register', { employeeID: empId })
        socket.emit('join', { employeeID: empId })
        socket.emit('join', { employeeId: empId })
        socket.emit('join', empId)
        socket.emit('joinRoom', { employeeID: empId })
        socket.emit('joinRoom', { employeeId: empId })
        socket.emit('joinRoom', empId)
        socket.emit('join_room', { employeeID: empId })
        socket.emit('join_room', { employeeId: empId })
        socket.emit('join_room', empId)
        socket.emit('join', `emp_${empId}`)
        socket.emit('joinRoom', `emp_${empId}`)
      })
    }

    ensureInternalSocketRef.current = () => {
      void ensureInternal()
    }

    void ensureInternal()
    const onFocus = () => { void ensureInternal() }
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      ensureInternalSocketRef.current = null
      window.removeEventListener('focus', onFocus)
      if (retryTimer) window.clearTimeout(retryTimer)
      try { internalSocketRef.current?.disconnect() } catch {}
      internalSocketRef.current = null
    }
  }, [bindCallSocket])

  const mungeSdpForHighQuality = (sdp: string): string => {
    // 1. Force the bitrate to 10Mbps (10000kbps) via x-google fmtp
    // We set start-bitrate to 5000 so it's clear IMMEDIATELY without ramp-up
    let newSdp = sdp.replace(/a=fmtp:(\d+) (.*)/g, (match, pt, params) => {
      if (params.indexOf('x-google-max-bitrate') === -1) {
        return `a=fmtp:${pt} ${params};x-google-max-bitrate=10000;x-google-min-bitrate=2000;x-google-start-bitrate=5000`
      }
      return match
    })

    // 2. Add b=AS:10000 (Application Specific bitrate) to tell the sender we can RECEIVE 10Mbps
    // This is the standard way to request higher quality from the other side.
    if (newSdp.indexOf('m=video') !== -1) {
      newSdp = newSdp.replace(/(m=video.*\r?\n)/g, '$1b=AS:10000\r\n')
    }

    return newSdp
  }

  const startCall = useCallback(
    async (calleeEmpId: number, calleeName: string, type: CallType = 'audio') => {
      setCallError('')
      if (callPhaseRef.current !== 'idle') return
      const callerId = myEmpIdRef.current
      if (!(calleeEmpId > 0) || !(callerId && callerId > 0)) {
        setCallError('Cannot resolve employee IDs.')
        return
      }
      const socket = socketRef.current
      if (!socket?.connected) {
        setCallError('Not connected.')
        return
      }
      currentCallPeerEmpIdRef.current = calleeEmpId
      setCallPeerName(calleeName)
      setCallType(type)
      try {
        const stream = await ensureMediaStream(type)
        configureTrackHints(stream)
        const pc = ensurePeerConnection(calleeEmpId)
        for (const t of stream.getTracks()) {
          const sender = pc.addTrack(t, stream)
          if (t.kind === 'video') void tuneRealtimeSender(sender)
        }
        let offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: type === 'video',
          voiceActivityDetection: false,
        } as any)
        
        if (offer.sdp) {
          offer = { ...offer, sdp: mungeSdpForHighQuality(offer.sdp) } as any
        }

        await pc.setLocalDescription(offer)
        setCallPhase('calling')
        socket.emit('call:offer', {
          callerId,
          calleeId: calleeEmpId,
          callerName: myDisplayNameRef.current,
          offer,
          callType: type,
        })
      } catch {
        setCallError('Microphone/camera access denied.')
        teardownCall()
      }
    },
    [ensureMediaStream, ensurePeerConnection, teardownCall],
  )

  const acceptCall = useCallback(async () => {
    const incoming = incomingCall
    if (!incoming) return
    const socket = socketRef.current
    if (!socket?.connected) {
      setCallError('Not connected.')
      teardownCall()
      return
    }
    const type = incoming.callType ?? inferCallTypeFromOffer(incoming.offer)
    setCallType(type)
    try {
        const pc = ensurePeerConnection(incoming.callerId)
        await pc.setRemoteDescription(new RTCSessionDescription(incoming.offer))
        const stream = await ensureMediaStream(type)
        configureTrackHints(stream)
        for (const t of stream.getTracks()) {
          const sender = pc.addTrack(t, stream)
          if (t.kind === 'video') void tuneRealtimeSender(sender)
        }
        let answer = await pc.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: type === 'video',
          voiceActivityDetection: false,
        } as any)

        if (answer.sdp) {
          answer = { ...answer, sdp: mungeSdpForHighQuality(answer.sdp) } as any
        }

        await pc.setLocalDescription(answer)
      for (const c of pendingIceRef.current) await pc.addIceCandidate(new RTCIceCandidate(c))
      pendingIceRef.current = []
      socket.emit('call:answer', {
        callId: incoming.callId,
        callerId: incoming.callerId,
        answer,
      })
      setIncomingCall(null)
      setCallPhase('in_call')
    } catch {
      setCallError('Failed to answer call.')
      teardownCall()
    }
  }, [incomingCall, ensureMediaStream, ensurePeerConnection, teardownCall])

  const rejectCall = useCallback(() => {
    const incoming = incomingCall
    if (!incoming) return
    socketRef.current?.emit('call:reject', { callId: incoming.callId, callerId: incoming.callerId })
    setIncomingCall(null)
    setCallPhase('idle')
    setCallPeerName('')
  }, [incomingCall])

  const endCall = useCallback(() => {
    const targetId = currentCallPeerEmpIdRef.current
    const callId = currentCallIdRef.current
    if (targetId && callId) socketRef.current?.emit('call:end', { callId, targetId })
    teardownCall()
  }, [teardownCall])

  const switchCamera = useCallback(async () => {
    // Only meaningful for video-capable calls.
    if (callTypeRef.current !== 'video' && !(incomingCall && (incomingCall.callType ?? inferCallTypeFromOffer(incomingCall.offer)) === 'video')) {
      return
    }
    const current = facingModeRef.current
    const next: CameraFacingMode = current === 'user' ? 'environment' : 'user'
    setCameraFacingMode(next)
    facingModeRef.current = next

    const existing = localStreamRef.current
    // Acquire a fresh video track for the requested facing mode.
    const fresh = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: next },
    })
    const newVideoTrack = fresh.getVideoTracks()[0]
    if (!newVideoTrack) return
    try { (newVideoTrack as any).contentHint = 'motion' } catch {}

    if (existing) {
      for (const t of existing.getVideoTracks()) {
        try { t.stop() } catch {}
        try { existing.removeTrack(t) } catch {}
      }
      existing.addTrack(newVideoTrack)
      localStreamRef.current = existing
      setLocalStream(new MediaStream(existing.getTracks()))
    } else {
      localStreamRef.current = fresh
      setLocalStream(fresh)
    }

    await replaceVideoTrackOnPeerConnection(newVideoTrack)
    const pc = peerConnectionRef.current
    const sender = pc?.getSenders().find((s) => s.track?.kind === 'video')
    if (sender) void tuneRealtimeSender(sender)
  }, [incomingCall, inferCallTypeFromOffer, replaceVideoTrackOnPeerConnection])

  const clearError = useCallback(() => setCallError(''), [])

  useEffect(
    () => () => {
      stopRingtone('all')
      teardownCall()
    },
    [stopRingtone, teardownCall],
  )

  const value = useMemo(
    () => ({
      callPhase,
      callError,
      incomingCall,
      callPeerName,
      callType,
      cameraFacingMode,
      localStream,
      remoteStream,
      bindCallSocket,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      switchCamera,
      clearError,
    }),
    [
      callPhase,
      callError,
      incomingCall,
      callPeerName,
      callType,
      cameraFacingMode,
      localStream,
      remoteStream,
      bindCallSocket,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      switchCamera,
      clearError,
    ],
  )

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>
}

export function useCall() {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used within CallProvider')
  return ctx
}
