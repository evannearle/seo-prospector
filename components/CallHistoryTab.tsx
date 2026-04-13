/* eslint-disable react/no-unescaped-entities */
'use client'
import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { SIGNALS } from '@/lib/types'
import type { CallRecord, TranscriptLine } from '@/lib/types'

const OUTCOME_META: Record<string, { label: string; bg: string; color: string }> = {
  pending:        { label: 'Pending',          bg: '#f4f4f2', color: '#6b7280' },
  answered:       { label: 'Answered',         bg: '#dcfce7', color: '#166534' },
  voicemail:      { label: 'Voicemail left',   bg: '#fef3c7', color: '#78350f' },
  'no-answer':    { label: 'No answer',        bg: '#fee2e2', color: '#991b1b' },
  booked:         { label: 'Booked',           bg: '#ede9fe', color: '#5b21b6' },
  'not-interested':{ label: 'Not interested',  bg: '#f4f4f2', color: '#6b7280' },
  callback:       { label: 'Callback',         bg: '#fef3c7', color: '#78350f' },
  failed:         { label: 'Failed',           bg: '#fee2e2', color: '#991b1b' },
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  completed:    { label: 'Completed',   color: '#16a34a' },
  failed:       { label: 'Failed',      color: '#dc2626' },
  'in-progress':{ label: 'In progress', color: '#2563eb' },
  ringing:      { label: 'Ringing',     color: '#2563eb' },
  queued:       { label: 'Queued',      color: '#6b7280' },
  voicemail:    { label: 'Voicemail',   color: '#d97706' },
}

type SortKey = 'startedAt' | 'leadName' | 'outcome' | 'duration'

export default function CallHistoryTab() {
  const { calls, clearCalls } = useStore()
  const [search, setSearch]         = useState('')
  const [filterOutcome, setFilterOutcome] = useState('all')
  const [sortKey, setSortKey]       = useState<SortKey>('startedAt')
  const [sortDir, setSortDir]       = useState<1 | -1>(-1)
  const [selected, setSelected]     = useState<CallRecord | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return calls
      .filter(c => {
        if (q && !`${c.leadName} ${c.phone}`.toLowerCase().includes(q)) return false
        if (filterOutcome !== 'all' && c.outcome !== filterOutcome) return false
        return true
      })
      .sort((a, b) => {
        if (sortKey === 'duration') return sortDir * ((a.duration || 0) - (b.duration || 0))
        const av = String((a as any)[sortKey] || '')
        const bv = String((b as any)[sortKey] || '')
        return sortDir * av.localeCompare(bv)
      })
  }, [calls, search, filterOutcome, sortKey, sortDir])

  const doSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 1 ? -1 : 1)
    else { setSortKey(k); setSortDir(-1) }
  }

  const fmtDur = (s?: number) => s ? `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` : '—'
  const fmtTime = (iso?: string) => iso
    ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—'

  // Summary stats
  const stats = useMemo(() => ({
    total:    calls.length,
    booked:   calls.filter(c => c.outcome === 'booked').length,
    answered: calls.filter(c => ['answered','booked','not-interested','callback'].includes(c.outcome)).length,
    noAnswer: calls.filter(c => c.outcome === 'no-answer').length,
    voicemail: calls.filter(c => c.outcome === 'voicemail').length,
    avgDur:   calls.filter(c => c.duration).length
      ? Math.round(calls.filter(c => c.duration).reduce((s,c) => s + (c.duration||0), 0) / calls.filter(c => c.duration).length)
      : 0,
  }), [calls])

  const exportCSV = () => {
    const h = ['Business','Phone','Status','Outcome','Started','Duration','Recording','Vapi ID']
    const rows = filtered.map(c => [
      c.leadName, c.phone, c.status, c.outcome,
      c.startedAt ? new Date(c.startedAt).toLocaleString() : '',
      fmtDur(c.duration),
      c.recordingUrl || '',
      c.vapiCallId || '',
    ])
    const csv = [h,...rows].map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `call_history_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const SortTh = ({ k, label }: { k: SortKey; label: string }) => (
    <th onClick={() => doSort(k)} style={thBase}>
      <span style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer' }}>
        {label}
        <span style={{ fontSize:9, color: sortKey===k ? '#2563eb' : '#d1d5db' }}>
          {sortKey===k ? (sortDir>0 ? '▲' : '▼') : '⇅'}
        </span>
      </span>
    </th>
  )

  return (
    <div style={{ display:'flex', flex:1, overflow:'hidden', background:'#f6f6f4' }}>

      {/* ── Main list ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Stats row */}
        <div style={{ background:'#fff', borderBottom:'1px solid #e4e4e0', padding:'12px 18px', display:'flex', gap:10, alignItems:'center', flexShrink:0, flexWrap:'wrap' }}>
          {[
            { n: stats.total,     l: 'Total calls',   c: '#18181b' },
            { n: stats.answered,  l: 'Answered',       c: '#16a34a' },
            { n: stats.booked,    l: 'Booked',         c: '#7c3aed' },
            { n: stats.noAnswer,  l: 'No answer',      c: '#dc2626' },
            { n: stats.voicemail, l: 'Voicemail left', c: '#d97706' },
            { n: fmtDur(stats.avgDur), l: 'Avg duration', c: '#2563eb' },
          ].map(({ n, l, c }) => (
            <div key={l} style={{ background:'#f6f6f4', borderRadius:8, padding:'8px 12px', minWidth:90 }}>
              <div style={{ fontSize:18, fontWeight:700, color:c as string, lineHeight:1 }}>{n}</div>
              <div style={{ fontSize:10, color:'#6b7280', marginTop:3 }}>{l}</div>
            </div>
          ))}
          <div style={{ marginLeft:'auto', display:'flex', gap:7 }}>
            <button onClick={exportCSV} style={btnSt}>Export CSV</button>
            <button onClick={() => { if (confirm('Clear all call history?')) clearCalls() }} style={btnSt}>Clear history</button>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ background:'#fff', borderBottom:'1px solid #e4e4e0', padding:'8px 18px', display:'flex', alignItems:'center', gap:8, flexShrink:0, flexWrap:'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search business name or phone..."
            style={{ fontSize:12, padding:'6px 10px', border:'1px solid #d1d5db', borderRadius:7, width:220, fontFamily:'inherit', outline:'none' }} />
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
            {['all','booked','answered','voicemail','no-answer','not-interested','callback'].map(o => {
              const meta = o === 'all' ? null : OUTCOME_META[o]
              return (
                <button key={o} onClick={() => setFilterOutcome(o)}
                  style={{ padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight: filterOutcome===o ? 700 : 500,
                    border:'1px solid', borderColor: filterOutcome===o ? (meta?.color || '#18181b') : '#e4e4e0',
                    background: filterOutcome===o ? (meta?.bg || '#f4f4f2') : 'transparent',
                    color: filterOutcome===o ? (meta?.color || '#18181b') : '#6b7280',
                    cursor:'pointer', fontFamily:'inherit' }}>
                  {o === 'all' ? `All (${calls.length})` : meta?.label + ` (${calls.filter(c => c.outcome===o).length})`}
                </button>
              )
            })}
          </div>
          <div style={{ marginLeft:'auto', fontSize:11, color:'#9ca3af' }}>{filtered.length} result{filtered.length!==1?'s':''}</div>
        </div>

        {/* Table */}
        <div style={{ flex:1, overflow:'auto' }}>
          {calls.length === 0 ? (
            <div style={{ padding:60, textAlign:'center', color:'#9ca3af' }}>
              <div style={{ fontSize:24, marginBottom:12 }}>📞</div>
              <div style={{ fontSize:14, color:'#6b7280', fontWeight:500, marginBottom:5 }}>No call history yet</div>
              <div style={{ fontSize:12, lineHeight:1.6 }}>
                Every call made through the AI Phone System is saved here automatically.<br />
                Start a call run in the AI Phone System tab to see results here.
              </div>
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead style={{ position:'sticky', top:0, zIndex:10 }}>
                <tr>
                  <SortTh k="startedAt" label="Date / Time" />
                  <SortTh k="leadName"  label="Business" />
                  <th style={thBase}>Phone</th>
                  <SortTh k="outcome"   label="Outcome" />
                  <th style={thBase}>Status</th>
                  <SortTh k="duration"  label="Duration" />
                  <th style={thBase}>Recording</th>
                  <th style={thBase}>Transcript</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const om = OUTCOME_META[c.outcome] || OUTCOME_META.pending
                  const sm = STATUS_META[c.status] || { label: c.status, color: '#6b7280' }
                  const isSelected = selected?.id === c.id
                  return (
                    <tr key={c.id}
                      onClick={() => setSelected(isSelected ? null : c)}
                      style={{ cursor:'pointer', background: isSelected ? '#eff6ff' : undefined }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#fafaf9' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = '' }}>
                      <td style={{ ...tdBase, color:'#6b7280', fontSize:11, whiteSpace:'nowrap' }}>
                        {fmtTime(c.startedAt)}
                      </td>
                      <td style={tdBase}>
                        <div style={{ fontWeight:600, color:'#18181b' }}>{c.leadName}</div>
                      </td>
                      <td style={{ ...tdBase, color:'#6b7280' }}>
                        {c.phone ? <a href={`tel:${c.phone}`} style={{ color:'#16a34a', textDecoration:'none', fontWeight:500 }} onClick={e => e.stopPropagation()}>{c.phone}</a> : '—'}
                      </td>
                      <td style={tdBase}>
                        <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 9px', borderRadius:99, fontSize:10, fontWeight:600, background:om.bg, color:om.color }}>
                          {om.label}
                        </span>
                      </td>
                      <td style={{ ...tdBase, color: sm.color, fontSize:11, fontWeight:500 }}>{sm.label}</td>
                      <td style={{ ...tdBase, color:'#6b7280', fontVariantNumeric:'tabular-nums' }}>{fmtDur(c.duration)}</td>
                      <td style={tdBase}>
                        {c.recordingUrl
                          ? <a href={c.recordingUrl} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
                              style={{ color:'#2563eb', textDecoration:'none', fontSize:11, fontWeight:500 }}>🎙 Listen</a>
                          : <span style={{ color:'#d1d5db' }}>—</span>}
                      </td>
                      <td style={tdBase}>
                        {c.transcript?.length
                          ? <span style={{ color:'#2563eb', fontSize:11, fontWeight:500 }}>{c.transcript.length} lines</span>
                          : <span style={{ color:'#d1d5db' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Detail drawer ── */}
      {selected && (
        <div style={{ width:380, minWidth:380, background:'#fff', borderLeft:'1px solid #e4e4e0', overflowY:'auto', display:'flex', flexDirection:'column', gap:14, padding:18 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:15, fontWeight:700 }}>{selected.leadName}</div>
              <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>
                {selected.phone} · {fmtTime(selected.startedAt)}
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={{ fontSize:13, padding:'2px 8px', border:'1px solid #e4e4e0', background:'#fff', borderRadius:6, cursor:'pointer', color:'#6b7280' }}>✕</button>
          </div>

          {/* Outcome + stats */}
          <div style={{ background:'#fafaf9', border:'1px solid #f0f0ec', borderRadius:9, padding:'12px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, fontSize:12 }}>
            {[
              { l:'Outcome',    v: (OUTCOME_META[selected.outcome]||OUTCOME_META.pending).label,  c: (OUTCOME_META[selected.outcome]||OUTCOME_META.pending).color },
              { l:'Status',     v: (STATUS_META[selected.status]||{label:selected.status}).label,  c: (STATUS_META[selected.status]||{color:'#6b7280'}).color },
              { l:'Duration',   v: fmtDur(selected.duration), c: '#18181b' },
              { l:'Called at',  v: fmtTime(selected.startedAt), c: '#18181b' },
              { l:'Ended at',   v: fmtTime(selected.endedAt), c: '#18181b' },
              { l:'Vapi call ID', v: selected.vapiCallId ? selected.vapiCallId.slice(0,16)+'...' : '—', c: '#9ca3af' },
            ].map(({ l, v, c }) => (
              <div key={l}>
                <div style={{ fontSize:10, color:'#9ca3af', marginBottom:2 }}>{l}</div>
                <div style={{ fontWeight:600, color: c, fontSize:12, wordBreak:'break-all' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Recording */}
          {selected.recordingUrl && (
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:7 }}>Recording</div>
              <audio controls src={selected.recordingUrl} style={{ width:'100%', borderRadius:8 }} />
              <a href={selected.recordingUrl} download style={{ display:'block', marginTop:6, fontSize:11, color:'#2563eb', textDecoration:'none' }}>⬇ Download recording</a>
            </div>
          )}

          {/* Transcript */}
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:7 }}>
              {selected.transcript?.length ? `Transcript (${selected.transcript.length} lines)` : 'Transcript'}
            </div>
            {selected.transcript?.length ? (
              <div style={{ background:'#f6f6f4', borderRadius:8, padding:12, display:'flex', flexDirection:'column', gap:6, maxHeight:340, overflowY:'auto' }}>
                {selected.transcript.map((line: TranscriptLine, i: number) => (
                  <div key={i} style={{ fontSize:12, lineHeight:1.65 }}>
                    <span style={{ fontWeight:700, color: line.role==='ai' ? '#2563eb' : '#18181b' }}>
                      {line.role==='ai' ? 'AI: ' : 'Prospect: '}
                    </span>
                    <span style={{ color:'#374151' }}>{line.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background:'#f6f6f4', borderRadius:8, padding:20, textAlign:'center', color:'#9ca3af', fontSize:12 }}>
                {selected.status==='completed' ? 'No transcript captured for this call.' : 'Transcript available after call ends.'}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:7 }}>Notes</div>
            <CallNotes call={selected} />
          </div>
        </div>
      )}
    </div>
  )
}

// Inline editable notes per call
function CallNotes({ call }: { call: CallRecord }) {
  const { updateCall } = useStore()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(call.notes || '')

  const save = () => {
    updateCall(call.id, { notes: val })
    setEditing(false)
  }

  if (editing) return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <textarea value={val} onChange={e => setVal(e.target.value)} autoFocus
        style={{ fontSize:12, fontFamily:'inherit', border:'1px solid #2563eb', borderRadius:7, padding:'8px 10px', resize:'vertical', minHeight:80, outline:'none', lineHeight:1.5 }} />
      <div style={{ display:'flex', gap:6 }}>
        <button onClick={save} style={{ fontSize:11, padding:'4px 12px', border:'none', background:'#18181b', color:'#fff', borderRadius:6, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>Save</button>
        <button onClick={() => { setVal(call.notes||''); setEditing(false) }} style={{ fontSize:11, padding:'4px 10px', border:'1px solid #d1d5db', background:'#fff', color:'#6b7280', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
      </div>
    </div>
  )

  return (
    <div onClick={() => setEditing(true)} style={{ background:'#f6f6f4', borderRadius:7, padding:'9px 11px', fontSize:12, color: call.notes ? '#374151' : '#9ca3af', lineHeight:1.6, cursor:'pointer', minHeight:44, border:'1px solid transparent', transition:'border .12s' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#d1d5db')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
      {call.notes || 'Click to add notes...'}
    </div>
  )
}

const thBase: React.CSSProperties = { background:'#f6f6f4', borderBottom:'1px solid #e4e4e0', padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:'#6b7280', letterSpacing:'.05em', textTransform:'uppercase', whiteSpace:'nowrap' }
const tdBase: React.CSSProperties = { padding:'10px 14px', borderBottom:'.5px solid #f0f0ec', verticalAlign:'middle' }
const btnSt:  React.CSSProperties = { padding:'5px 11px', fontSize:11, border:'1px solid #d1d5db', background:'#fff', color:'#6b7280', fontWeight:500, borderRadius:7, cursor:'pointer', fontFamily:'inherit' }
