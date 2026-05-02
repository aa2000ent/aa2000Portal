import { useEffect, useRef, useState, useCallback } from 'react'
import { useCall } from '../contexts/CallContext'

function useCallTimer(active: boolean) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active) { setSeconds(0); return }
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [active])
  const m = String(Math.floor(seconds / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase() || '?'
}

/** Attach stream to a video/audio element via callback ref — works even when element mounts after stream is ready. */
function useStreamRef(stream: MediaStream | null) {
  const elRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)

  const callbackRef = useCallback((el: HTMLVideoElement | HTMLAudioElement | null) => {
    elRef.current = el
    if (!el) return
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream
      void (el as HTMLVideoElement).play().catch(() => {})
    }
  }, [stream])

  // If stream changes after element is already mounted, update srcObject
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream
      void (el as HTMLVideoElement).play().catch(() => {})
    } else if (!stream) {
      el.srcObject = null
    }
  }, [stream])

  return callbackRef
}

export default function CallPopup() {
  const {
    callPhase, callError, incomingCall, callPeerName, callType,
    cameraFacingMode,
    localStream, remoteStream,
    acceptCall, rejectCall, endCall, switchCamera, clearError,
  } = useCall()

  const timer = useCallTimer(callPhase === 'in_call')
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)

  const localVideoRef = useStreamRef(localStream) as (el: HTMLVideoElement | null) => void
  const remoteVideoRef = useStreamRef(remoteStream) as (el: HTMLVideoElement | null) => void
  const remoteAudioRef = useStreamRef(remoteStream) as (el: HTMLAudioElement | null) => void

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [uiFullscreen, setUiFullscreen] = useState(false)
  const videoCardRef = useRef<HTMLDivElement | null>(null)
  const [controlsHidden, setControlsHidden] = useState(false)
  const hideTimerRef = useRef<number | null>(null)

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  const bumpControls = useCallback(() => {
    setControlsHidden(false)
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(() => {
      setControlsHidden(true)
    }, 5000)
  }, [])

  const toggleFullscreen = async () => {
    const root = videoCardRef.current
    if (!root) return

    // Native fullscreen (if supported).
    try {
      if (!document.fullscreenElement && typeof root.requestFullscreen === 'function') {
        await root.requestFullscreen()
        return
      }
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        await document.exitFullscreen()
        return
      }
    } catch {
      // Fall back to CSS fullscreen
    }

    setUiFullscreen((v) => !v)
  }

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // Auto-dismiss error after 4 seconds
  useEffect(() => {
    if (!callError) return
    const t = window.setTimeout(clearError, 4000)
    return () => window.clearTimeout(t)
  }, [callError, clearError])

  // Reset mute/cam state when call ends
  useEffect(() => {
    if (callPhase === 'idle') { setMuted(false); setCamOff(false) }
  }, [callPhase])

  // Auto-hide video call controls after inactivity.
  useEffect(() => {
    const activeVideo = callPhase === 'in_call' && (callType === 'video')
    if (!activeVideo) {
      setControlsHidden(false)
      clearHideTimer()
      return
    }

    bumpControls()
    return () => {
      clearHideTimer()
    }
  }, [callPhase, callType, bumpControls])

  const handleMute = () => {
    setMuted((m) => {
      const next = !m
      if (localStream) for (const t of localStream.getAudioTracks()) t.enabled = !next
      return next
    })
  }

  const handleCamToggle = () => {
    setCamOff((c) => {
      const next = !c
      if (localStream) for (const t of localStream.getVideoTracks()) t.enabled = !next
      return next
    })
  }

  if (callPhase === 'idle' && !callError) return null

  const peerName = callPeerName || (incomingCall ? String(incomingCall.callerName ?? `Employee ${incomingCall.callerId}`) : 'Unknown')
  const wantsVideo =
    callType === 'video' ||
    (!!incomingCall && (incomingCall.callType ?? 'audio') === 'video')
  const isVideoActive = wantsVideo
  const isInCall = callPhase === 'in_call'
  const isIncoming = callPhase === 'ringing' && !!incomingCall
  const isCalling = callPhase === 'calling' || (callPhase === 'ringing' && !incomingCall)

  return (
    <div className="call-popup-overlay" role="dialog" aria-modal="true" aria-label="Call">

      {/* Error toast */}
      {callError && (
        <div className="call-error-toast" role="alert">
          <span>{callError}</span>
          <button type="button" onClick={clearError} aria-label="Dismiss">×</button>
        </div>
      )}

      {callPhase !== 'idle' && (
        <div
          ref={wantsVideo && (isInCall || isCalling || isIncoming) ? videoCardRef : undefined}
          className={`call-popup-card ${
            wantsVideo && (isInCall || isCalling || isIncoming) ? 'call-popup-card--video' : ''
          } ${uiFullscreen ? 'call-popup-card--ui-fullscreen' : ''} ${
            wantsVideo && (isCalling || isIncoming) && !isInCall ? 'call-popup-card--video-shell' : ''
          }`}
          onMouseMove={isInCall && wantsVideo ? bumpControls : undefined}
          onMouseDown={isInCall && wantsVideo ? bumpControls : undefined}
          onTouchStart={isInCall && wantsVideo ? bumpControls : undefined}
          onKeyDown={isInCall && wantsVideo ? bumpControls : undefined}
        >
          {/* ── Video call: connected (both sides — remote main, local PiP) ── */}
          {isInCall && wantsVideo && (
            <div className="call-video-stage" onClick={bumpControls} role="presentation">
              <video ref={remoteVideoRef} className="call-video-remote" autoPlay playsInline />
              <video
                ref={localVideoRef}
                className={`call-video-local ${cameraFacingMode === 'user' ? 'call-video-local--mirrored' : ''}`}
                autoPlay
                playsInline
                muted
              />
              <div className="call-video-label call-video-label--pip" aria-hidden>
                You
              </div>
              <div className="call-video-header">
                <span className="call-peer-name call-peer-name--video">{peerName}</span>
                <span className="call-status-label call-status-label--video">{timer}</span>
              </div>
            </div>
          )}

          {/* ── Video: outgoing ring — caller already has camera on (shows self + waiting) ── */}
          {!isInCall && isCalling && wantsVideo && (
            <div className="call-video-stage call-video-stage--dialing">
              <div className="call-video-remote call-video-remote--placeholder">
                <span className="call-video-placeholder-msg">Waiting for answer…</span>
              </div>
              <video
                ref={localVideoRef}
                className={`call-video-local ${cameraFacingMode === 'user' ? 'call-video-local--mirrored' : ''}`}
                autoPlay
                playsInline
                muted
              />
              <div className="call-video-label call-video-label--pip" aria-hidden>
                You
              </div>
              <div className="call-video-header">
                <span className="call-peer-name call-peer-name--video">{peerName}</span>
                <span className="call-status-label call-status-label--video">Calling…</span>
              </div>
            </div>
          )}

          {/* Hidden remote audio for pure audio calls */}
          {!wantsVideo && <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />}

          {/* ── Avatar + status (audio-only, or ringing video until accepted) ── */}
          {!((isInCall && wantsVideo) || (isCalling && wantsVideo)) && (
            <div className="call-popup-info">
              <div className={`call-avatar-wrap ${isIncoming ? 'call-avatar-wrap--ring' : ''}`}>
                <div className="call-avatar">{getInitials(peerName)}</div>
                {isIncoming && (
                  <>
                    <div className="call-ring call-ring--1" />
                    <div className="call-ring call-ring--2" />
                    <div className="call-ring call-ring--3" />
                  </>
                )}
              </div>
              <p className="call-peer-name">{peerName}</p>
              <p className="call-status-label">
                {isIncoming
                  ? `Incoming ${isVideoActive ? 'video' : 'voice'} call`
                  : isCalling
                    ? 'Calling...'
                    : isInCall
                      ? `${isVideoActive ? 'Video' : 'Voice'} call · ${timer}`
                      : ''}
              </p>
            </div>
          )}

          {/* ── Controls ──────────────────────────────── */}
          <div className={`call-controls ${controlsHidden && isInCall && wantsVideo ? 'call-controls--hidden' : ''}`}>

            {isIncoming && (
              <>
                <button type="button" className="call-btn call-btn--accept" onClick={() => void acceptCall()} aria-label="Accept call">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  <span>Accept</span>
                </button>
                <button type="button" className="call-btn call-btn--reject" onClick={rejectCall} aria-label="Decline call">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13.73 21a2 2 0 0 1-3.46 0l-8-13.5A2 2 0 0 1 4 5h16a2 2 0 0 1 1.73 3l-8 13z" transform="rotate(135 12 12)"/>
                    <line x1="18" y1="6" x2="6" y2="18" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                    <line x1="6" y1="6" x2="18" y2="18" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                  <span>Decline</span>
                </button>
              </>
            )}

            {isCalling && (
              <button type="button" className="call-btn call-btn--reject" onClick={endCall} aria-label="Cancel call">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                <span>Cancel</span>
              </button>
            )}

            {isInCall && (
              <>
                <button
                  type="button"
                  className={`call-btn call-btn--mute ${muted ? 'active' : ''}`}
                  onClick={handleMute}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="1" y1="1" x2="23" y2="23"/>
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .68-.1 1.33-.27 1.95"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  )}
                  <span>{muted ? 'Unmute' : 'Mute'}</span>
                </button>

                {isVideoActive && (
                  <button
                    type="button"
                    className={`call-btn call-btn--mute ${camOff ? 'active' : ''}`}
                    onClick={handleCamToggle}
                    aria-label={camOff ? 'Turn on camera' : 'Turn off camera'}
                  >
                    {camOff ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="1" y1="1" x2="23" y2="23"/>
                        <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h1a2 2 0 0 1 2 2v9.34"/>
                        <path d="M7.5 8a4 4 0 1 0 5.66 5.66"/>
                      </svg>
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M23 7 16 12 23 17V7z"/>
                        <rect x="1" y="5" width="15" height="14" rx="2"/>
                      </svg>
                    )}
                    <span>{camOff ? 'Cam On' : 'Cam Off'}</span>
                  </button>
                )}

                {isVideoActive && (
                  <button
                    type="button"
                    className="call-btn call-btn--mute"
                    onClick={() => void switchCamera()}
                    aria-label="Switch camera"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 7l-7 5 7 5V7z" />
                      <rect x="1" y="5" width="15" height="14" rx="2" />
                      <path d="M7 9l-2 2 2 2" />
                      <path d="M9 11H5" />
                      <path d="M10 15l2-2-2-2" />
                      <path d="M12 13h4" />
                    </svg>
                    <span>Flip</span>
                  </button>
                )}

                {isVideoActive && (
                  <button
                    type="button"
                    className={`call-btn call-btn--mute ${isFullscreen ? 'active' : ''}`}
                    onClick={() => void toggleFullscreen()}
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  >
                    {isFullscreen ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                        <path d="M16 3h3a2 2 0 0 1 2 2v3" />
                        <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
                        <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                      </svg>
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                        <path d="M16 3h3a2 2 0 0 1 2 2v3" />
                        <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
                        <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                      </svg>
                    )}
                    <span>{(isFullscreen || uiFullscreen) ? 'Exit' : 'Full'}</span>
                  </button>
                )}

                <button type="button" className="call-btn call-btn--end" onClick={endCall} aria-label="End call">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.34 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.45-2.81m-2.5-2.5a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91"/>
                    <line x1="23" y1="1" x2="1" y2="23" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                  <span>End</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
