'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import type { GlobalQueueItem } from '@/lib/globalState'
import { loadSettings } from '@/components/SettingsTab'

interface LiveLine { role: 'ai' | 'human'; text: string; ts: number }

interface Props {
  item: GlobalQueueItem
  onClose: () => void
}

export default function LiveCallMonitor({ item, onClose }: Props) {
  const [lines, setLines]           = useState<LiveLine[]>([])
  const [listening, setListening]   = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [callData, setCallData]     = useState<any>(null)
  const [elapsed, setElapsed]       = useState(0)

  const wsRef       = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const scrollRef   = useRef<HTMLDivElement>(null)
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef    = useRef(Date.now())

  const isActive = ['ringing', 'in-progress'].includes(item.status)

  // ── Elapsed timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return
    startRef.current = item.startedAt ? new Date(item.startedAt).getTime() : Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [isActive, item.startedAt])

  // ── Transcript polling ─────────────────────────────────────────────────────
  useEffect(() => {
    const { vapiApiKey } = loadSettings()
    if (!item.callId || !vapiApiKey) return

    const poll = async () => {
      try {
        const resp = await fetch(`/api/calls?callId=${item.callId}&apiKey=${vapiApiKey}`)
        if (!resp.ok) return
        const data = await resp.json()
        setCallData(data)

        // Extract transcript from Vapi response
        const raw = data.artifact?.transcript || data.transcript || []
        if (raw.length > 0) {
          const parsed: LiveLine[] = raw.map((t: any, i: number) => ({
            role: t.role === 'assistant' ? 'ai' : 'human',
            text: t.message || t.content || t.text || '',
            ts: i,
          })).filter((l: LiveLine) => l.text)
          setLines(parsed)
        }

        // Also try messages array format
        const msgs = data.messages || []
        if (msgs.length > 0 && raw.length === 0) {
          const parsed: LiveLine[] = msgs
            .filter((m: any) => m.role === 'assistant' || m.role === 'user')
            .map((m: any, i: number) => ({
              role: m.role === 'assistant' ? 'ai' : 'human',
              text: m.content || m.message || '',
              ts: i,
            })).filter((l: LiveLine) => l.text)
          setLines(parsed)
        }
      } catch {}
    }

    poll()
    if (isActive) {
      pollRef.current = setInterval(poll, 2500)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [item.callId, isActive])

  // Auto-scroll transcript
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 99999)
  }, [lines])

  // Show transcript from queue item if polling hasn't got any yet
  useEffect(() => {
    if (lines.length === 0 && item.transcript && item.transcript.length > 0) {
      setLines(item.transcript.map((l, i) => ({ role: l.role as 'ai' | 'human', text: l.text, ts: i })))
    }
  }, [item.transcript])

  // ── Listen-in via WebSocket ────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (!item.listenUrl) {
      setAudioError('No listen URL — call may have ended or monitor was not enabled')
      return
    }
    try {
      // Create AudioContext
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 })
      audioCtxRef.current = ctx
      if (ctx.state === 'suspended') await ctx.resume()

      const ws = new WebSocket(item.listenUrl)
      wsRef.current = ws
      ws.binaryType = 'arraybuffer'

      let nextPlayTime = ctx.currentTime

      ws.onopen = () => { setListening(true); setAudioError(null) }

      ws.onmessage = (e) => {
        if (!(e.data instanceof ArrayBuffer)) return
        const raw = new Int16Array(e.data)
        if (raw.length === 0) return

        // Convert S16LE PCM → Float32
        const float = new Float32Array(raw.length)
        for (let i = 0; i < raw.length; i++) float[i] = raw[i] / 32768

        const buf = ctx.createBuffer(1, float.length, 16000)
        buf.getChannelData(0).set(float)

        const src = ctx.createBufferSource()
        src.buffer = buf
        src.connect(ctx.destination)

        const now = ctx.currentTime
        const playAt = Math.max(now, nextPlayTime)
        src.start(playAt)
        nextPlayTime = playAt + buf.duration
      }

      ws.onerror = () => setAudioError('WebSocket connection failed')
      ws.onclose = () => { setListening(false) }
    } catch (e: any) {
      setAudioError(e.message || 'Failed to start audio')
    }
  }, [item.listenUrl])

  const stopListening = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    setListening(false)
  }, [])

  useEffect(() => () => { stopListening() }, [stopListening])

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const statusColor = item.status === 'in-progress' ? '#16a34a'
    : item.status === 'ringing' ? '#2563eb'
    : item.status === 'completed' ? '#6b7280'
    : '#dc2626'

  const outcomeColors: Record<string, string> = {
    booked: '#7c3aed', answered: '#16a34a', 'no-answer': '#dc2626',
    voicemail: '#d97706', 'not-interested': '#6b7280', callback: '#d97706', pending: '#9ca3af',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 16, width: 640, maxWidth: '95vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0ec', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, flexShrink: 0,
            animation: isActive ? 'pulse-dot 1.5s ease-in-out infinite' : 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.lead.name}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
              {item.lead.phone} · {item.lead.addr?.split(',')[0]} · {item.lead.niche}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {isActive && (
              <div style={{ fontSize: 13, fontWeight: 700, color: statusColor, fontVariantNumeric: 'tabular-nums' }}>
                {fmtTime(elapsed)}
              </div>
            )}
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 99,
              background: `${outcomeColors[item.outcome] || '#9ca3af'}18`,
              color: outcomeColors[item.outcome] || '#9ca3af' }}>
              {item.status === 'in-progress' ? 'Live call' : item.status === 'ringing' ? 'Ringing...' : item.outcome !== 'pending' ? item.outcome : item.status}
            </span>
            <button onClick={onClose} style={{ fontSize: 16, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}>✕</button>
          </div>
        </div>

        {/* Listen-in bar */}
        {isActive && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid #f0f0ec', background: '#fafaf9', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, fontSize: 12, color: '#6b7280' }}>
              {listening ? (
                <span style={{ color: '#16a34a', fontWeight: 600 }}>🎧 Listening live — you can hear the call through your speakers</span>
              ) : item.listenUrl ? (
                'Live audio available — click to listen in silently'
              ) : (
                'Live audio not available for this call'
              )}
            </div>
            {item.listenUrl && !listening && (
              <button onClick={startListening}
                style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#18181b', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                🎧 Listen in
              </button>
            )}
            {listening && (
              <button onClick={stopListening}
                style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #fca5a5', background: '#fff5f5', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Stop listening
              </button>
            )}
            {audioError && <span style={{ fontSize: 11, color: '#dc2626' }}>⚠ {audioError}</span>}
          </div>
        )}

        {/* Live transcript */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }} ref={scrollRef}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
            {isActive ? 'Live transcript' : 'Call transcript'}
            {isActive && <span style={{ marginLeft: 6, color: '#16a34a', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· updating every 2.5s</span>}
          </div>

          {lines.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '40px 0', color: '#9ca3af' }}>
              {isActive ? (
                <>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid #e4e4e0', borderTopColor: '#2563eb', animation: 'spin 1s linear infinite' }} />
                  <div style={{ fontSize: 13 }}>Waiting for transcript...</div>
                  <div style={{ fontSize: 11 }}>Lines appear as people speak. May take 10–15 seconds to populate.</div>
                </>
              ) : (
                <div style={{ fontSize: 13 }}>No transcript captured for this call.</div>
              )}
            </div>
          )}

          {lines.map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 48, flexShrink: 0, fontSize: 10, fontWeight: 700, textAlign: 'right', paddingTop: 3,
                color: line.role === 'ai' ? '#2563eb' : '#374151' }}>
                {line.role === 'ai' ? 'AI' : 'Prospect'}
              </div>
              <div style={{ flex: 1, background: line.role === 'ai' ? '#eff6ff' : '#f6f6f4',
                borderRadius: line.role === 'ai' ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                padding: '8px 12px', fontSize: 13, lineHeight: 1.5, color: '#18181b' }}>
                {line.text}
              </div>
            </div>
          ))}

          {isActive && lines.length > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', opacity: 0.5 }}>
              <div style={{ width: 48, fontSize: 10, fontWeight: 700, textAlign: 'right', color: '#9ca3af' }}>AI</div>
              <div style={{ background: '#eff6ff', borderRadius: '4px 12px 12px 12px', padding: '8px 12px' }}>
                <TypingDots />
              </div>
            </div>
          )}
        </div>

        {/* Footer — call stats */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0ec', background: '#fafaf9', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flexShrink: 0 }}>
          {[
            { l: 'Status', v: item.status },
            { l: 'Duration', v: item.duration ? fmtTime(item.duration) : isActive ? fmtTime(elapsed) : '—' },
            { l: 'Lead score', v: `${item.lead.score}/10` },
            { l: 'Outcome', v: item.outcome !== 'pending' ? item.outcome : '—' },
          ].map(({ l, v }) => (
            <div key={l}>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#18181b' }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Recording (after call ends) */}
        {item.recordingUrl && (
          <div style={{ padding: '0 20px 16px', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Recording</div>
            <audio controls src={item.recordingUrl} style={{ width: '100%', borderRadius: 8 }} />
          </div>
        )}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 16 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#93c5fd', display: 'inline-block',
          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
    </div>
  )
}
