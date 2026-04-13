/* eslint-disable react/no-unescaped-entities */
'use client'
import { useState, useEffect } from 'react'
import { schedulerState } from '@/lib/globalState'
import { startScheduler, addSchedule, removeSchedule, toggleSchedule } from '@/lib/scheduler'
import { retryNoAnswers } from '@/lib/callRunner'
import { callState } from '@/lib/globalState'
import type { ScheduledRun } from '@/lib/globalState'

export default function SchedulerTab() {
  const [schedules, setSchedules] = useState<ScheduledRun[]>([...schedulerState.schedules])
  const [queue, setQueue]         = useState([...callState.queue])
  const [form, setForm]           = useState({ type: 'calls', schedule: 'daily', timeHH: 9, timeMM: 0, label: '' })
  const [retrying, setRetrying]   = useState(false)
  const [retryResult, setRetryResult] = useState<string | null>(null)

  useEffect(() => {
    const update = () => { setSchedules([...schedulerState.schedules]) }
    const updateQ = () => { setQueue([...callState.queue]) }
    schedulerState.listeners.add(update)
    callState.listeners.add(updateQ)
    startScheduler()
    update(); updateQ()
    return () => { schedulerState.listeners.delete(update); callState.listeners.delete(updateQ) }
  }, [])

  const handleAdd = () => {
    const label = form.label || `${form.type === 'calls' ? 'Call run' : 'Scan run'} at ${String(form.timeHH).padStart(2,'0')}:${String(form.timeMM).padStart(2,'0')}`
    addSchedule({ type: form.type as 'scan'|'calls', schedule: form.schedule as 'once'|'daily'|'weekdays', timeHH: form.timeHH, timeMM: form.timeMM, label, enabled: true })
    setForm({ type: 'calls', schedule: 'daily', timeHH: 9, timeMM: 0, label: '' })
  }

  const handleRetry = async () => {
    setRetrying(true); setRetryResult(null)
    const count = await retryNoAnswers()
    setRetrying(false)
    setRetryResult(count > 0 ? `✓ ${count} leads requeued for retry` : 'No no-answer or voicemail calls to retry')
  }

  const noAnswerCount = queue.filter(q => q.outcome === 'no-answer' || q.outcome === 'voicemail').length
  const bookedCount   = queue.filter(q => q.outcome === 'booked').length
  const crmPushed     = queue.filter(q => q.crmPushed).length

  const fmt12 = (hh: number, mm: number) => {
    const ampm = hh >= 12 ? 'PM' : 'AM'
    const h = hh % 12 || 12
    return `${h}:${String(mm).padStart(2,'0')} ${ampm}`
  }

  const fmtNext = (iso?: string) => {
    if (!iso) return '—'
    const d = new Date(iso)
    const now = new Date()
    const diffMs = d.getTime() - now.getTime()
    const diffMins = Math.round(diffMs / 60000)
    if (diffMins < 1) return 'Any moment'
    if (diffMins < 60) return `in ${diffMins}m`
    if (diffMins < 1440) return `in ${Math.round(diffMins/60)}h`
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#f6f6f4', padding: 24 }}>
      <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Header */}
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Automation & Scheduler</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>Schedule scan and call runs · retry no-answers · monitor CRM push activity</div>
        </div>

        {/* Quick stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            { n: queue.length,      l: 'Total in queue',    c: '#18181b' },
            { n: noAnswerCount,     l: 'No answer / VM',    c: '#d97706' },
            { n: bookedCount,       l: 'Booked',            c: '#7c3aed' },
            { n: crmPushed,         l: 'Pushed to CRM',     c: '#16a34a' },
          ].map(({ n, l, c }) => (
            <div key={l} style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 10, padding: '13px 16px' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: c, lineHeight: 1 }}>{n}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Retry no-answers */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Retry no-answers</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, lineHeight: 1.5 }}>
            Requeue all no-answer and voicemail calls from the current session. Delay and max retries are set in Settings.
            Leads that have hit their retry limit won't be requeued.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={handleRetry} disabled={retrying || noAnswerCount === 0}
              style={{ padding: '9px 20px', border: 'none', background: noAnswerCount > 0 ? '#d97706' : '#f4f4f2', color: noAnswerCount > 0 ? '#fff' : '#9ca3af', borderRadius: 8, cursor: noAnswerCount > 0 ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
              {retrying ? 'Requeueing...' : `↻ Retry ${noAnswerCount} no-answer${noAnswerCount !== 1 ? 's' : ''}`}
            </button>
            {retryResult && <span style={{ fontSize: 12, color: retryResult.startsWith('✓') ? '#16a34a' : '#6b7280', fontWeight: 500 }}>{retryResult}</span>}
          </div>
        </div>

        {/* Scheduled runs */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0ec', background: '#fafaf9', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Scheduled runs</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Automatically trigger call runs at set times — works even when you switch tabs</div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af' }}>Scheduler is {schedulerState.timerHandle ? 'active' : 'inactive'}</span>
          </div>

          {/* Add new schedule */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0ec', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em' }}>Type</div>
              <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} style={selSt}>
                <option value="calls">AI Call run</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em' }}>Frequency</div>
              <select value={form.schedule} onChange={e => setForm(f => ({...f, schedule: e.target.value}))} style={selSt}>
                <option value="once">One time</option>
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays only</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em' }}>Time</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="number" value={form.timeHH} onChange={e => setForm(f => ({...f, timeHH: Math.max(0, Math.min(23, parseInt(e.target.value)||0))}))} min={0} max={23} style={{ ...selSt, width: 54 }} />
                <span style={{ color: '#9ca3af', fontWeight: 600 }}>:</span>
                <input type="number" value={form.timeMM} onChange={e => setForm(f => ({...f, timeMM: Math.max(0, Math.min(59, parseInt(e.target.value)||0))}))} min={0} max={59} step={15} style={{ ...selSt, width: 54 }} />
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{fmt12(form.timeHH, form.timeMM)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em' }}>Label (optional)</div>
              <input value={form.label} onChange={e => setForm(f => ({...f, label: e.target.value}))} placeholder="e.g. Morning call run" style={{ ...selSt, flex: 1 }} />
            </div>
            <button onClick={handleAdd} style={{ padding: '8px 16px', border: 'none', background: '#18181b', color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', flexShrink: 0 }}>
              + Add schedule
            </button>
          </div>

          {/* Schedule list */}
          {schedules.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>⏰</div>
              <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500, marginBottom: 4 }}>No scheduled runs yet</div>
              <div style={{ fontSize: 12 }}>Add one above to automatically trigger call runs at set times.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {schedules.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: '0.5px solid #f0f0ec' }}>
                  <div onClick={() => toggleSchedule(s.id)} style={{ width: 38, height: 22, borderRadius: 99, background: s.enabled ? '#18181b' : '#e4e4e0', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: s.enabled ? 19 : 3, transition: 'left .2s' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                      {s.schedule === 'once' ? 'One time' : s.schedule === 'daily' ? 'Every day' : 'Weekdays'} at {fmt12(s.timeHH, s.timeMM)}
                      {s.lastRan && <span style={{ marginLeft: 8 }}>· last ran {new Date(s.lastRan).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: s.enabled ? '#2563eb' : '#9ca3af', fontWeight: 500 }}>
                      {s.enabled ? `Next: ${fmtNext(s.nextRun)}` : 'Disabled'}
                    </div>
                  </div>
                  <button onClick={() => removeSchedule(s.id)} style={{ fontSize: 11, padding: '4px 9px', border: '1px solid #fca5a5', background: '#fff5f5', color: '#dc2626', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CRM activity log */}
        {queue.some(q => q.crmPushed || q.outcome === 'booked') && (
          <div style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0ec', background: '#fafaf9' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>CRM push log</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Booked leads sent to your webhook endpoint</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {queue.filter(q => q.outcome === 'booked').map(item => (
                <div key={item.leadId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: '0.5px solid #f0f0ec' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{item.lead.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{item.lead.phone} · {item.lead.niche} · score {item.lead.score}/10</div>
                  </div>
                  {item.duration && <span style={{ fontSize: 11, color: '#6b7280' }}>{Math.floor(item.duration/60)}:{String(item.duration%60).padStart(2,'0')}</span>}
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: item.crmPushed ? '#dcfce7' : '#fef3c7', color: item.crmPushed ? '#166534' : '#78350f' }}>
                    {item.crmPushed ? '✓ Sent to CRM' : 'Booked — CRM pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How it works */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>How automation works</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            {[
              { icon: '🔄', title: 'Retry logic', body: 'No-answers and voicemails get requeued automatically after your set delay. Click "Retry no-answers" or let the scheduler trigger it. Each lead is retried up to your max — then marked exhausted.' },
              { icon: '⏰', title: 'Scheduled calls', body: 'Add a daily or weekday call run at a specific time. The scheduler checks every 30 seconds. It fires even if you\'re on a different tab — calls run in the background.' },
              { icon: '🔗', title: 'CRM push', body: 'When a call is marked "Booked", the lead + call data is immediately POSTed to your webhook URL. Works with GoHighLevel, Zapier, Make, or any endpoint that accepts JSON.' },
            ].map(({ icon, title, body }) => (
              <div key={title} style={{ background: '#fafaf9', border: '1px solid #f0f0ec', borderRadius: 9, padding: '13px 14px' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>{title}</div>
                <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

const selSt: React.CSSProperties = { fontSize: 13, fontFamily: 'inherit', color: '#18181b', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, padding: '7px 10px', outline: 'none' }
