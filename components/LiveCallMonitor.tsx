'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import type { GlobalQueueItem } from '@/lib/globalState'
import { loadSettings } from '@/components/SettingsTab'

interface LiveLine { role: 'ai' | 'human'; text: string }

interface Props {
  item: GlobalQueueItem
  onClose: () => void
}

export default function LiveCallMonitor({ item, onClose }: Props) {
  const [lines, setLines]         = useState<LiveLine[]>([])
  const [listening, setListening] = useState(false)
  const [audioErr, setAudioErr]   = useState<string | null>(null)
  const [elapsed, setElapsed]     = useState(0)
  const [vapiStatus, setVapiStatus] = useState<string>(item.status)
  const [recordingUrl, setRecordingUrl] = useState<string | null>(item.recordingUrl || null)

  const wsRef       = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrollRef   = useRef<HTMLDivElement>(null)
  const startRef    = useRef(item.startedAt ? new Date(item.startedAt).getTime() : Date.now())

  const isActive = ['ringing', 'in-progress'].includes(item.status)
  const hasListenUrl = !!item.listenUrl

  // ── Elapsed timer ──
  useEffect(() => {
    if (!isActive) return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [isActive])

  // ── Transcript polling ──
  useEffect(() => {
    const { vapiApiKey } = loadSettings()
    if (!item.callId || !vapiApiKey) {
      // No call ID yet — show transcript from queue item if available
      if (item.transcript?.length) {
        setLines(item.transcript.map(l => ({ role: l.role as 'ai' | 'human', text: l.text })))
      }
      return
    }

    const poll = async () => {
      try {
        const resp = await fetch(`/api/calls?callId=${item.callId}&apiKey=${vapiApiKey}`)
        if (!resp.ok) return
        const data = await resp.json()

        setVapiStatus(data.status || item.status)
        if (data.artifact?.recordingUrl) setRecordingUrl(data.artifact.recordingUrl)

        // Try all transcript locations Vapi uses
        const raw =
          data.artifact?.transcript ||
          data.messages ||
          data.transcript ||
          []

        if (Array.isArray(raw) && raw.length > 0) {
          const parsed: LiveLine[] = raw
            .map((t: any) => ({
              role: ((t.role === 'assistant' || t.role === 'ai') ? 'ai' : 'human') as 'ai' | 'human',
              text: t.message || t.content || t.text || t.transcript || '',
            }))
            .filter((l: LiveLine) => l.text.trim())
          if (parsed.length > 0) setLines(parsed)
        }
      } catch {}
    }

    poll()
    const interval = isActive ? 2500 : 0
    if (interval) pollRef.current = setInterval(poll, interval)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [item.callId, isActive, item.status])

  // Seed from queue item transcript immediately
  useEffect(() => {
    if (lines.length === 0 && item.transcript?.length) {
      setLines(item.transcript.map(l => ({ role: l.role as 'ai' | 'human', text: l.text })))
    }
  }, [item.transcript])

  // Auto-scroll
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollTo(0, 99999), 50)
  }, [lines])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Listen-in via WebSocket PCM audio ──
  const startListening = useCallback(async () => {
    if (!item.listenUrl) { setAudioErr('No listen URL available for this call'); return }
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 })
      if (ctx.state === 'suspended') await ctx.resume()
      audioCtxRef.current = ctx

      const ws = new WebSocket(item.listenUrl)
      wsRef.current = ws
      ws.binaryType = 'arraybuffer'
      let nextPlayAt = ctx.currentTime

      ws.onopen  = () => { setListening(true); setAudioErr(null) }
      ws.onclose = () => setListening(false)
      ws.onerror = () => { setAudioErr('Audio stream disconnected'); setListening(false) }

      ws.onmessage = (e) => {
        if (!(e.data instanceof ArrayBuffer) || e.data.byteLength === 0) return
        const s16 = new Int16Array(e.data)
        const f32 = new Float32Array(s16.length)
        for (let i = 0; i < s16.length; i++) f32[i] = s16[i] / 32768

        const buf = ctx.createBuffer(1, f32.length, 16000)
        buf.getChannelData(0).set(f32)
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.connect(ctx.destination)
        const now = ctx.currentTime
        const start = Math.max(now, nextPlayAt)
        src.start(start)
        nextPlayAt = start + buf.duration
      }
    } catch (e: any) {
      setAudioErr(e.message || 'Could not start audio')
    }
  }, [item.listenUrl])

  const stopListening = useCallback(() => {
    wsRef.current?.close(); wsRef.current = null
    audioCtxRef.current?.close(); audioCtxRef.current = null
    setListening(false)
  }, [])

  useEffect(() => () => { stopListening() }, [stopListening])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const dur = item.duration || (isActive ? elapsed : 0)
  
  const outcomeColor: Record<string, string> = {
    booked: '#7c3aed', answered: '#16a34a', 'no-answer': '#dc2626',
    voicemail: '#d97706', 'not-interested': '#6b7280', callback: '#f59e0b', pending: '#9ca3af',
  }
  const oc = outcomeColor[item.outcome] || '#9ca3af'

  const liveStatus = isActive
    ? item.status === 'ringing' ? 'Ringing...' : '● Live call'
    : item.status === 'completed'
      ? item.outcome !== 'pending' ? item.outcome.replace('-', ' ') : 'Completed'
      : item.status

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: 660, maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.3)', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #f0f0ec', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: isActive ? '#16a34a' : '#d1d5db', flexShrink: 0,
            boxShadow: isActive ? '0 0 0 3px #dcfce7' : 'none',
            animation: isActive ? 'pulse-dot 1.5s ease-in-out infinite' : 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.lead.name}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{item.lead.phone} · {item.lead.addr?.split(',')[0]} · {item.lead.niche}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {dur > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{fmt(dur)}</span>}
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: `${oc}18`, color: oc }}>
              {liveStatus}
            </span>
            <button onClick={onClose} style={{ background: '#f4f4f2', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14, color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        </div>

        {/* ── Listen-in strip ── */}
        {isActive && (
          <div style={{ padding: '8px 20px', background: '#fafaf9', borderBottom: '1px solid #f0f0ec', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {!hasListenUrl ? (
              <span style={{ fontSize: 11, color: '#9ca3af', flex: 1 }}>
                Live audio not available — enable monitorPlan in your Vapi account or check your plan
              </span>
            ) : listening ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <WaveIcon />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>Listening live</span>
                </div>
                <span style={{ fontSize: 11, color: '#6b7280', flex: 1 }}>You can hear both sides of the call through your speakers</span>
                <button onClick={stopListening} style={dangerBtn}>Stop listening</button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 12, color: '#6b7280', flex: 1 }}>🎧 Live audio available — listen in silently without interrupting the call</span>
                <button onClick={startListening} style={primaryBtn}>🎧 Listen in</button>
              </>
            )}
            {audioErr && <span style={{ fontSize: 11, color: '#dc2626' }}>⚠ {audioErr}</span>}
          </div>
        )}

        {/* ── Transcript ── */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {isActive ? 'Live transcript' : 'Call transcript'}
            </span>
            {isActive && (
              <span style={{ fontSize: 10, color: '#16a34a' }}>· updates every 2.5s</span>
            )}
            {lines.length > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9ca3af' }}>{lines.length} lines</span>
            )}
          </div>

          {lines.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '40px 20px', color: '#9ca3af', textAlign: 'center' }}>
              {isActive ? (
                <>
                  <Spinner />
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Waiting for transcript...</div>
                  <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                    Lines appear as people speak.<br />Usually takes 10–20 seconds after the call connects.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>📋</div>
                  <div style={{ fontSize: 13 }}>No transcript captured for this call.</div>
                  {item.recordingUrl && <div style={{ fontSize: 11 }}>Recording is available below.</div>}
                </>
              )}
            </div>
          ) : (
            lines.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 52, flexShrink: 0, textAlign: 'right', paddingTop: 6,
                  fontSize: 10, fontWeight: 700, color: line.role === 'ai' ? '#2563eb' : '#374151' }}>
                  {line.role === 'ai' ? 'AI' : 'Prospect'}
                </div>
                <div style={{
                  flex: 1,
                  background: line.role === 'ai' ? '#eff6ff' : '#f6f6f4',
                  borderRadius: line.role === 'ai' ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                  padding: '8px 13px',
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: '#18181b',
                }}>
                  {line.text}
                </div>
              </div>
            ))
          )}

          {/* Typing indicator while call active and has content */}
          {isActive && lines.length > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', opacity: 0.5 }}>
              <div style={{ width: 52, flexShrink: 0 }} />
              <div style={{ background: '#eff6ff', borderRadius: '4px 12px 12px 12px', padding: '10px 13px' }}>
                <TypingDots />
              </div>
            </div>
          )}
        </div>

        {/* ── Footer stats ── */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0ec', background: '#fafaf9', flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: recordingUrl ? 12 : 0 }}>
            {[
              { l: 'Status',   v: vapiStatus || item.status },
              { l: 'Duration', v: dur > 0 ? fmt(dur) : '—' },
              { l: 'Score',    v: `${item.lead.score}/10` },
              { l: 'Outcome',  v: item.outcome !== 'pending' ? item.outcome.replace('-', ' ') : '—' },
            ].map(({ l, v }) => (
              <div key={l}>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#18181b', textTransform: 'capitalize' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Recording */}
          {recordingUrl && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Recording</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <audio controls src={recordingUrl} style={{ flex: 1, height: 36, borderRadius: 8 }} />
                <a href={recordingUrl} download style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none', fontWeight: 500, flexShrink: 0 }}>⬇ Download</a>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function WaveIcon() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 14 }}>
      {[4, 8, 12, 8, 4].map((h, i) => (
        <span key={i} style={{ width: 2, background: '#16a34a', borderRadius: 1, display: 'inline-block', height: h,
          animation: `wave 0.8s ease-in-out ${i * 0.1}s infinite` }} />
      ))}
    </div>
  )
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 14 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#93c5fd', display: 'inline-block',
          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
    </div>
  )
}

function Spinner() {
  return <div style={{ width: 28, height: 28, border: '2px solid #e4e4e0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
}

const primaryBtn: React.CSSProperties = {
  padding: '5px 13px', border: 'none', background: '#18181b', color: '#fff',
  borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', flexShrink: 0,
}
const dangerBtn: React.CSSProperties = {
  padding: '5px 13px', border: '1px solid #fca5a5', background: '#fff5f5', color: '#dc2626',
  borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', flexShrink: 0,
}
