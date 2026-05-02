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

type CallContextValue = {
  callPhase: CallPhase
  callError: string
  incomingCall: SocketCallIncoming | null
  callPeerName: string
  callType: CallType
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  /** Single shared chat socket (`ChatPage`): attach signalling listeners — no separate IO client. */
  bindCallSocket: (socket: Socket | null, identity: CallerIdentityBinding | null) => void
  startCall: (calleeEmpId: number, calleeName: string, type?: CallType) => Promise<void>
  acceptCall: () => Promise<void>
  rejectCall: () => void
  endCall: () => void
  clearError: () => void
}

const CallContext = createContext<CallContextValue | null>(null)

export function CallProvider({ children }: { children: ReactNode }) {
  const [callPhase, setCallPhase] = useState<CallPhase>('idle')
  const [callError, setCallError] = useState('')
  const [incomingCall, setIncomingCall] = useState<SocketCallIncoming | null>(null)
  const [callPeerName, setCallPeerName] = useState('')
  const [callType, setCallType] = useState<CallType>('audio')
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

  useEffect(() => {
    callPhaseRef.current = callPhase
  }, [callPhase])
  useEffect(() => {
    callTypeRef.current = callType
  }, [callType])

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
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video:
        type === 'video'
          ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
          : false,
    })
    localStreamRef.current = stream
    setLocalStream(stream)
    return stream
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
        setIncomingCall(p)
        setCallPhase('ringing')
        setCallType(p.callType ?? 'audio')
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
    const type = incoming.callType ?? 'audio'
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

  const clearError = useCallback(() => setCallError(''), [])

  useEffect(() => () => teardownCall(), [teardownCall])

  const value = useMemo(
    () => ({
      callPhase,
      callError,
      incomingCall,
      callPeerName,
      callType,
      localStream,
      remoteStream,
      bindCallSocket,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      clearError,
    }),
    [
      callPhase,
      callError,
      incomingCall,
      callPeerName,
      callType,
      localStream,
      remoteStream,
      bindCallSocket,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
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
