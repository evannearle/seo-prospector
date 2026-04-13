'use client'
import { useState, useEffect } from 'react'
import { scanState } from '@/lib/globalState'
import { callState } from '@/lib/globalState'
import { pauseScan, resumeScan, stopScan } from '@/lib/scanRunner'
import { pauseCallRunner, resumeCallRunner, stopCallRunner } from '@/lib/callRunner'

export default function StatusBar() {
  const [scan, setScan]   = useState({ status: scanState.status, pct: scanState.pct, biz: scanState.currentBiz, loc: scanState.currentLocation, count: scanState.savedCount })
  const [calls, setCalls] = useState({ status: callState.status, waiting: 0, done: 0, booked: 0 })

  useEffect(() => {
    const updateScan = () => setScan({
      status: scanState.status,
      pct:    scanState.pct,
      biz:    scanState.currentBiz,
      loc:    scanState.currentLocation,
      count:  scanState.savedCount,
    })
    const updateCalls = () => setCalls({
      status:  callState.status,
      waiting: callState.queue.filter(q => q.status === 'queued').length,
      done:    callState.queue.filter(q => ['completed','failed'].includes(q.status)).length,
      booked:  callState.queue.filter(q => q.outcome === 'booked').length,
    })
    scanState.listeners.add(updateScan)
    callState.listeners.add(updateCalls)
    updateScan(); updateCalls()
    return () => { scanState.listeners.delete(updateScan); callState.listeners.delete(updateCalls) }
  }, [])

  const scanBusy  = scan.status === 'running' || scan.status === 'paused'
  const callBusy  = calls.status === 'running' || calls.status === 'paused'
  if (!scanBusy && !callBusy) return null

  return (
    <div style={{ background: '#18181b', color: '#fff', padding: '0 18px', display: 'flex', alignItems: 'center', gap: 16, height: 34, flexShrink: 0, fontSize: 11 }}>

      {/* Scan indicator */}
      {scanBusy && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {scan.status === 'running' && <PulsingDot color="#22c55e" />}
            {scan.status === 'paused'  && <span style={{ color: '#fbbf24', fontSize: 10 }}>⏸</span>}
            <span style={{ color: '#a1a1aa', fontWeight: 500 }}>Scan</span>
          </div>
          <div style={{ flex: 1, maxWidth: 140, height: 2, background: '#3f3f46', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: scan.status === 'paused' ? '#fbbf24' : '#22c55e', width: scan.pct + '%', transition: 'width .4s' }} />
          </div>
          <span style={{ color: '#71717a', fontSize: 10 }}>{scan.pct}%</span>
          {scan.biz && <span style={{ color: '#a1a1aa', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scan.biz}</span>}
          <span style={{ color: '#16a34a', fontWeight: 600 }}>{scan.count} saved</span>
          <div style={{ display: 'flex', gap: 5 }}>
            {scan.status === 'running' && <Chip onClick={pauseScan}  label="⏸ Pause" color="#fbbf24" />}
            {scan.status === 'paused'  && <Chip onClick={resumeScan} label="▶ Resume" color="#22c55e" />}
            <Chip onClick={stopScan} label="⏹" color="#f87171" />
          </div>
        </div>
      )}

      {scanBusy && callBusy && <div style={{ width: 1, height: 16, background: '#3f3f46' }} />}

      {/* Call indicator */}
      {callBusy && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {calls.status === 'running' && <PulsingDot color="#3b82f6" />}
            {calls.status === 'paused'  && <span style={{ color: '#fbbf24', fontSize: 10 }}>⏸</span>}
            <span style={{ color: '#a1a1aa', fontWeight: 500 }}>Calls</span>
          </div>
          <span style={{ color: '#71717a' }}>{calls.waiting} queued</span>
          {calls.done > 0 && <span style={{ color: '#71717a' }}>· {calls.done} done</span>}
          {calls.booked > 0 && <span style={{ color: '#c084fc', fontWeight: 600 }}>· {calls.booked} booked 🎉</span>}
          <div style={{ display: 'flex', gap: 5 }}>
            {calls.status === 'running' && <Chip onClick={pauseCallRunner}  label="⏸ Pause" color="#fbbf24" />}
            {calls.status === 'paused'  && <Chip onClick={resumeCallRunner} label="▶ Resume" color="#22c55e" />}
            <Chip onClick={stopCallRunner} label="⏹" color="#f87171" />
          </div>
        </div>
      )}
    </div>
  )
}

function PulsingDot({ color }: { color: string }) {
  return (
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', animation: 'pulse-dot 1.5s ease-in-out infinite' }} />
  )
}

function Chip({ onClick, label, color }: { onClick: () => void; label: string; color: string }) {
  return (
    <button onClick={onClick} style={{ padding: '2px 8px', borderRadius: 5, border: `1px solid ${color}33`, background: `${color}15`, color, fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
      {label}
    </button>
  )
}
