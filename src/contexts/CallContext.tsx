import { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import type { Socket } from 'socket.io-client'

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
      audio: true,
      video:
        type === 'video'
          ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode }
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

  const ensurePeerConnection = useCallback((targetEmpId: number): RTCPeerConnection => {
    if (peerConnectionRef.current) return peerConnectionRef.current
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
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

      if (identity && identity.empId > 0) {
        myEmpIdRef.current = identity.empId
        myDisplayNameRef.current = String(identity.displayName ?? '').trim()
      }
      if (!socket) return

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

      socket.on('call:error', onError)
      socket.on('call:initiated', onInitiated)
      socket.on('call:incoming', onIncoming)
      socket.on('call:answered', onAnswered)
      socket.on('call:rejected', onRejected)
      socket.on('call:ice-candidate', onIce)
      socket.on('call:ended', onEnded)

      detachListenersRef.current = () => {
        socket.off('call:error', onError)
        socket.off('call:initiated', onInitiated)
        socket.off('call:incoming', onIncoming)
        socket.off('call:answered', onAnswered)
        socket.off('call:rejected', onRejected)
        socket.off('call:ice-candidate', onIce)
        socket.off('call:ended', onEnded)
      }
    },
    [teardownCall],
  )

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
        const pc = ensurePeerConnection(calleeEmpId)
        for (const t of stream.getTracks()) pc.addTrack(t, stream)
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: type === 'video',
        })
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
        for (const t of stream.getTracks()) pc.addTrack(t, stream)
        const answer = await pc.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: type === 'video',
        })
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
  }, [incomingCall, inferCallTypeFromOffer, replaceVideoTrackOnPeerConnection])

  const clearError = useCallback(() => setCallError(''), [])

  useEffect(() => () => teardownCall(), [teardownCall])

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
