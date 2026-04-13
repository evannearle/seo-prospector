/* eslint-disable react/no-unescaped-entities */
'use client'
import { useState, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { SIGNALS } from '@/lib/types'
import { loadSettings } from '@/components/SettingsTab'
import { callState, addToCallQueue, notifyCall } from '@/lib/globalState'
import { startCallRunner, pauseCallRunner, resumeCallRunner, stopCallRunner, retryNoAnswers } from '@/lib/callRunner'
import type { GlobalQueueItem } from '@/lib/globalState'
import type { Lead, TranscriptLine } from '@/lib/types'

// ── Script preview ────────────────────────────────────────────────────────────
function buildScriptPreview(lead: Lead | null): string {
  const s  = loadSettings()
  const niche   = lead?.niche || '[niche]'
  const city    = lead?.addr?.split(',')[0] || '[city]'
  const biz     = lead?.name || '[Business Name]'
  const sig1    = lead?.signals?.[0] ? (SIGNALS[lead.signals[0]]?.label || lead.signals[0]) : '[issue 1]'
  const sig2    = lead?.signals?.[1] ? (SIGNALS[lead.signals[1]]?.label || lead.signals[1]) : '[issue 2]'
  const caller  = s.callerName  || 'Evan'
  const agency  = s.agencyName  || 'your agency'
  const email   = s.callerEmail || '[email]'
  const link    = s.calendlyEventUrl || '[booking link]'
  const goal    = s.callGoal
  const noAns   = s.noAnswerBehavior
  const vp      = s.valueProposition
  const offer   = s.offerLine
  const reviews = lead?.reviews || 0
  const rating  = lead?.rating  || 0

  // Build a natural, specific opening based on actual data
  const reviewNote = reviews > 0
    ? reviews < 15
      ? `only ${reviews} reviews on Google`
      : reviews < 25
      ? `just ${reviews} Google reviews`
      : `${reviews} reviews`
    : 'a small review count'

  const ratingNote = rating > 0 && rating < 4
    ? ` and a ${rating.toFixed(1)}-star average`
    : ''

  const specific = `${reviewNote}${ratingNote}`

  const openBlock = `━━━ OPENING — Pattern interrupt, never "how are you today?" ━━━

"Hi, is the owner or manager around?"

[Connected — pause naturally, don't rush]

"Hey — so my name's ${caller}, I'll keep it short. I was actually just poking around Google looking at ${niche}s in ${city} and I came across ${biz}. I found something on your listing I think you'd want to know about — do you have like 60 seconds?"`

  const pitchBlock =
    goal === 'book'
      ? `━━━ PITCH — Problem first, then credibility, then ask ━━━

[After they say yes — speak naturally, don't read]

"So what I noticed is — ${biz} has ${specific}. For a ${niche} in ${city}, that's basically the main reason a business doesn't show up when someone nearby searches for a ${niche} right now. And you've also got ${sig2.toLowerCase()} which compounds it.

[Pause — let it land, don't fill the silence immediately]

I've helped other ${niche}s in [similar city] fix exactly this and go from nowhere on Maps to showing up in the top 3 inside about 90 days. More calls, nothing extra on ads.

[Value prop, conversational:] ${vp}"`
      : goal === 'qualify'
      ? `━━━ QUALIFY FIRST ━━━

"Quick question before I say anything else — are you guys doing anything right now to work on your Google Maps rankings?"

[Listen — most say no or "not really"]

"Yeah, that's pretty common actually. I ask because I was looking at ${biz}'s listing and I spotted ${sig1.toLowerCase()} — for a ${niche} in ${city} that's the kind of thing that quietly kills your visibility. I've got a quick audit I can walk you through — would that be worth 10 minutes?"`
      : `━━━ SOFT INTRO ━━━

"Hey, I'll be totally upfront — I'm not trying to sell you anything right now. I was researching ${niche}s in ${city} and I noticed a couple of things on ${biz}'s Google listing that are probably hurting your rankings. I'd love to just email you over what I found — completely free. Would that be useful?"`

  const microBlock = `━━━ MICRO-COMMITMENT — Small yes before the big ask ━━━

"Can I ask — do you actually know where ${biz} shows up right now when someone in ${city} searches for a ${niche}?"

[They almost always say no]

"Yeah, most business owners don't. That's actually the problem — would it be helpful if I showed you exactly where you're at and what it would take to move up?"`

  const askBlock = `━━━ THE ASK — Use this exact language ━━━

"${offer}"

[Immediately after — don't pause here or they'll fill it]

${s.calendlyEventUrl
    ? `"Let me grab some times from my calendar real quick..."
→ Read the next 3 available Calendly slots naturally
"I've got [day] at [time], [day] at [time], or [day] at [time] — any of those work for you?"`
    : `"Here's a link — ${link} — takes 30 seconds to grab a time that works."`}`

  const twoOptionBlock = `━━━ BOOKING CLOSE — Two options, never yes/no ━━━

Never: "Do you want to book a call?" (binary — they can say no)
Always: "Would earlier in the week or a bit later work better?"
→ Then give specific times within what they say.

When they confirm:
"Perfect — I'll have everything pulled up and ready. You'll get the calendar invite in a few minutes."`

  const objectionsBlock = `━━━ OBJECTIONS — Agree first, then redirect ━━━

"Not interested"
→ "Totally fair. Can I just ask — do you know roughly how many people are searching for a ${niche} in ${city} every month? It's actually pretty high." [If still no] → "No worries — can I shoot you a quick email with what I found? Just so you have it."

"We already have someone doing that"
→ "Oh good — are they actively managing your Google Business Profile? I ask because I noticed ${sig1.toLowerCase()} and that's something that usually gets caught." [Pause] → "Might be worth a quick second look just to make sure nothing's slipping."

"Call me back another time"
→ "Sure — when exactly works? I want to make sure I've got your full audit ready." [Get a specific time, don't accept vague]

"How much does it cost?"
→ "The audit is totally free — zero catch. If you want to talk about working together after you see it, great, but that's completely up to you." [Back to booking]

"Just email me"
→ "Absolutely — what's the best email?" [Get it] → "Perfect. And just so I can make it specific to you — what's the biggest challenge you're dealing with around getting new customers right now?" [Qualify while you have them]`

  const vmBlock = noAns === 'voicemail'
    ? `━━━ VOICEMAIL — Short, specific, curious ━━━

"Hey, this is ${caller} from ${agency}. I was looking up ${niche}s in ${city} and came across ${biz} — I noticed ${sig1.toLowerCase()} on your listing and that's typically costing businesses in your position a few calls a week. Worth a quick chat. Give me a call back or grab a time at ${link}. Talk soon."`
    : `━━━ NO ANSWER ━━━

Hang up — no voicemail. Will retry on next run.`

  const closeBlock = `━━━ GRACEFUL EXIT — Plant a seed, never burn a bridge ━━━

[After two gentle attempts and still a no]

"I completely get it — not the right time. I'm going to send you a quick summary of what I found anyway, just so you've got it when it makes sense. What's a good email?"

[Get email if possible, then:]

"Thanks for picking up — good luck with everything."

Contact if they ask: ${email}
Max duration: ${Math.round(s.maxCallDurationSeconds / 60)} min`

  return [openBlock, pitchBlock, microBlock, askBlock, twoOptionBlock, objectionsBlock, vmBlock, closeBlock].join('\n\n')
}

export default function PhoneTab({ queueIds, onQueueChange }: { queueIds: string[]; onQueueChange: (ids: string[]) => void }) {
  const { leads } = useStore()
  const [callStatus, setCallStatus] = useState(callState.status)
  const [queue, setQueue]           = useState<GlobalQueueItem[]>([...callState.queue])
  const [selectedCall, setSelectedCall] = useState<GlobalQueueItem | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [testResult, setTestResult] = useState<{ok: boolean; msg: string; detail?: string} | null>(null)
  const [showScript, setShowScript] = useState(false)
  const [previewLead, setPreviewLead] = useState<Lead | null>(null)

  const settings = loadSettings()
  // Detailed config validation
  const configIssues: string[] = []
  if (!settings.vapiApiKey) configIssues.push('Vapi API key is missing')
  if (!settings.vapiPhoneNumberId) configIssues.push('Vapi Phone Number ID is missing — this is the ID from Vapi dashboard, NOT the raw phone number like +15165550100')
  const missingConfig = configIssues.length > 0

  // Subscribe to global call state
  useEffect(() => {
    const update = () => {
      setCallStatus(callState.status)
      setQueue([...callState.queue])
      // Sync selectedCall if it exists
      if (selectedCall) {
        const updated = callState.queue.find(q => q.leadId === selectedCall.leadId)
        if (updated) setSelectedCall({ ...updated })
      }
    }
    callState.listeners.add(update)
    update()
    return () => { callState.listeners.delete(update) }
  }, [selectedCall?.leadId])

  // Sync incoming queueIds from parent (Saved Leads "Send to Phone")
  useEffect(() => {
    if (!queueIds.length) return
    queueIds.forEach(id => {
      const lead = leads.find(l => l.id === id)
      if (lead) addToCallQueue(lead)
    })
    onQueueChange([])
  }, [queueIds])

  useEffect(() => {
    if (leads.length > 0 && !previewLead) setPreviewLead(leads[0])
  }, [leads])

  const addToQ = (lead: Lead) => {
    if (!lead.phone) { alert(`${lead.name} has no phone number.`); return }
    addToCallQueue(lead)
  }

  const removeFromQ = (leadId: string) => {
    const idx = callState.queue.findIndex(q => q.leadId === leadId)
    if (idx >= 0) { callState.queue.splice(idx, 1); notifyCall() }
  }

  const clearQueue = () => {
    callState.queue = []
    notifyCall()
  }

  const testConfig = async () => {
    setTestResult(null)
    const s = loadSettings()
    const issues: string[] = []
    if (!s.vapiApiKey) issues.push('Vapi API key missing')
    if (!s.vapiPhoneNumberId) issues.push('Vapi Phone Number ID missing')
    if (issues.length > 0) { setTestResult({ ok: false, msg: issues.join(', ') }); return }

    // Hit the Vapi API directly to validate credentials
    try {
      const resp = await fetch('https://api.vapi.ai/phone-number', {
        headers: { Authorization: `Bearer ${s.vapiApiKey}` }
      })
      const data = await resp.json()
      if (!resp.ok) {
        setTestResult({ ok: false, msg: `Vapi API key invalid (${resp.status})`, detail: data.message || JSON.stringify(data).slice(0, 120) })
        return
      }
      // Check phone number ID exists in their account
      const numbers = Array.isArray(data) ? data : (data.results || [])
      const match = numbers.find((n: any) => n.id === s.vapiPhoneNumberId)
      if (!match) {
        const ids = numbers.map((n: any) => `${n.id} (${n.number || 'no number'})`).join(', ')
        setTestResult({ ok: false, msg: 'Phone Number ID not found in your Vapi account', detail: `IDs in your account: ${ids || 'none found'}` })
        return
      }
      setTestResult({ ok: true, msg: `Connected! Found phone number: ${match.number || match.id}` })
    } catch (e: any) {
      setTestResult({ ok: false, msg: 'Network error testing Vapi credentials', detail: e.message })
    }
  }

  const handleStart = () => {
    const s = loadSettings()
    if (!s.vapiApiKey)        { alert('Add your Vapi API key in Settings first.'); return }
    if (!s.vapiPhoneNumberId) { alert('Add your Vapi Phone Number ID in Settings first.'); return }
    if (!callState.queue.filter(q => q.status === 'queued').length) { alert('No leads waiting in queue.'); return }
    startCallRunner(s.vapiApiKey)
  }

  const handleRetry = async () => {
    setRetrying(true)
    const count = await retryNoAnswers()
    setRetrying(false)
    if (count === 0) alert('No no-answer or voicemail calls to retry. All leads have either been reached or hit their retry limit.')
  }

  const running = callStatus === 'running'
  const paused  = callStatus === 'paused'
  const busy    = running || paused

  const waiting    = queue.filter(q => q.status === 'queued').length
  const inProgress = queue.filter(q => ['ringing', 'in-progress'].includes(q.status)).length
  const answered   = queue.filter(q => ['answered','booked','not-interested','callback'].includes(q.outcome)).length
  const booked     = queue.filter(q => q.outcome === 'booked').length

  const stBadge: Record<string, { label: string; bg: string; color: string }> = {
    queued:        { label: 'Waiting',    bg: '#f4f4f2', color: '#6b7280' },
    ringing:       { label: 'Ringing...', bg: '#dbeafe', color: '#1e3a8a' },
    'in-progress': { label: 'In call',   bg: '#dbeafe', color: '#1e3a8a' },
    completed:     { label: 'Done',       bg: '#dcfce7', color: '#166534' },
    failed:        { label: 'Failed',     bg: '#fee2e2', color: '#991b1b' },
  }
  const outBadge: Record<string, { label: string; bg: string; color: string }> = {
    pending:          { label: 'Pending',        bg: '#f4f4f2', color: '#6b7280' },
    answered:         { label: 'Answered',       bg: '#dcfce7', color: '#166534' },
    voicemail:        { label: 'Voicemail left', bg: '#fef3c7', color: '#78350f' },
    'no-answer':      { label: 'No answer',      bg: '#fee2e2', color: '#991b1b' },
    booked:           { label: 'Booked! 🎉',     bg: '#ede9fe', color: '#5b21b6' },
    'not-interested': { label: 'Not interested', bg: '#f4f4f2', color: '#6b7280' },
    callback:         { label: 'Callback',       bg: '#fef3c7', color: '#78350f' },
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* ── Left: Add leads ── */}
      <div style={{ width: 260, minWidth: 260, background: '#fff', borderRight: '1px solid #e4e4e0', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Add to queue</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>Saved leads with phone numbers</div>
        </div>

        {missingConfig ? (
          <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: '#991b1b', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, marginBottom: 5 }}>⚠ Cannot start calls — config issues:</div>
            {configIssues.map((issue, i) => (
              <div key={i} style={{ marginBottom: 3 }}>• {issue}</div>
            ))}
            <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid #fca5a5', color: '#7f1d1d', fontSize: 10 }}>
              Fix these in the <strong>Settings</strong> tab. For Phone Number ID: go to app.vapi.ai → Phone Numbers → copy the ID shown under the number (looks like a UUID, not a phone number).
            </div>
          </div>
        ) : (
          <>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '9px 11px', fontSize: 11, color: '#166534', lineHeight: 1.5 }}>
              ✓ Vapi API key set<br />
              ✓ Phone Number ID: {settings.vapiPhoneNumberId?.slice(0, 8)}...<br />
              ✓ Caller: {settings.callerName} @ {settings.agencyName}<br />
              {settings.calendlyEventUrl && <span>✓ Calendly booking enabled</span>}
            </div>
            <button onClick={testConfig} style={{ fontSize: 11, padding: '5px 11px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', color: '#374151', fontWeight: 500 }}>
              Test Vapi connection ↗
            </button>
            {testResult && (
              <div style={{ background: testResult.ok ? '#f0fdf4' : '#fff5f5', border: `1px solid ${testResult.ok ? '#86efac' : '#fca5a5'}`, borderRadius: 8, padding: '9px 11px', fontSize: 11, color: testResult.ok ? '#166534' : '#991b1b', lineHeight: 1.6 }}>
                {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
                {testResult.detail && <div style={{ marginTop: 4, fontSize: 10, opacity: 0.8, wordBreak: 'break-all' }}>{testResult.detail}</div>}
              </div>
            )}
          </>
        )}

        {leads.filter(l => l.phone).length === 0 ? (
          <div style={{ fontSize: 11, color: '#9ca3af', padding: '12px 0', textAlign: 'center' }}>No leads with phone numbers yet.<br />Run the Prospector first.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            {leads.filter(l => l.phone).map(l => {
              const inQ = !!queue.find(q => q.leadId === l.id)
              const scoreC = l.score >= 8 ? '#dc2626' : l.score >= 5 ? '#d97706' : '#6b7280'
              return (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, border: `1px solid ${inQ ? '#86efac' : '#e4e4e0'}`, background: inQ ? '#f0fdf4' : '#fafaf9' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{l.phone}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: scoreC, flexShrink: 0 }}>{l.score}</span>
                  <button onClick={() => addToQ(l)} disabled={inQ}
                    style={{ fontSize: 10, padding: '3px 8px', border: 'none', borderRadius: 5, cursor: inQ ? 'default' : 'pointer', fontFamily: 'inherit', background: inQ ? '#dcfce7' : '#18181b', color: inQ ? '#166534' : '#fff', flexShrink: 0 }}>
                    {inQ ? '✓' : 'Add'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e4e4e0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1, fontSize: 12, color: '#6b7280' }}>
            {showScript ? 'Full call script — word for word, updates with your Settings' : `Queue · ${busy ? (paused ? '⏸ Paused' : '📞 Calling in background...') : 'click Start to begin'}`}
          </div>
          {showScript && leads.length > 0 && (
            <select value={previewLead?.id || ''} onChange={e => setPreviewLead(leads.find(l => l.id === e.target.value) || null)}
              style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontFamily: 'inherit', outline: 'none' }}>
              <option value="">— no lead selected —</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <button onClick={() => setShowScript(s => !s)}
            style={{ fontSize: 11, padding: '5px 12px', border: '1px solid #d1d5db', background: showScript ? '#18181b' : '#fff', color: showScript ? '#fff' : '#6b7280', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
            {showScript ? 'Hide script' : 'Preview call script'}
          </button>
        </div>

        {showScript ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            <div style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 12, overflow: 'hidden', maxWidth: 760, margin: '0 auto' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0ec', background: '#fafaf9', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
                <div style={{ fontSize: 12, fontWeight: 700 }}>
                  AI Call Script {previewLead ? `— ${previewLead.name}` : '— select a lead above'}
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 10, color: '#9ca3af' }}>Updates live as Settings change</div>
              </div>
              <pre style={{ padding: 20, fontSize: 12, lineHeight: 1.9, color: '#374151', whiteSpace: 'pre-wrap', fontFamily: "'SF Mono','Fira Code',monospace", margin: 0 }}>
                {buildScriptPreview(previewLead)}
              </pre>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: selectedCall ? '1fr 360px' : '1fr', overflow: 'hidden' }}>

            {/* Queue */}
            <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Call Queue</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                    AI pitches each lead using their specific issues · books into Calendly if configured · runs in background
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  <button onClick={clearQueue} disabled={busy} style={{ ...btnSt, opacity: busy ? .5 : 1 }}>Clear</button>
                  <button onClick={handleRetry} disabled={busy || retrying}
                    style={{ ...btnSt, opacity: busy || retrying ? .5 : 1 }}
                    title="Requeue no-answer and voicemail calls for retry">
                    {retrying ? 'Requeueing...' : '↻ Retry no-answers'}
                  </button>
                  {!busy && <button onClick={handleStart} disabled={!waiting || missingConfig}
                    style={{ ...btnSt, background: '#16a34a', color: '#fff', border: 'none', opacity: waiting && !missingConfig ? 1 : .4 }}>
                    ▶ Start calling
                  </button>}
                  {running && <button onClick={pauseCallRunner} style={{ ...btnSt, background: '#d97706', color: '#fff', border: 'none' }}>⏸ Pause</button>}
                  {paused  && <button onClick={resumeCallRunner} style={{ ...btnSt, background: '#16a34a', color: '#fff', border: 'none' }}>▶ Resume</button>}
                  {busy    && <button onClick={stopCallRunner}  style={{ ...btnSt, background: '#dc2626', color: '#fff', border: 'none' }}>⏹ Stop</button>}
                </div>
              </div>

              {busy && (
                <div style={{ background: paused ? '#fffbeb' : '#eff6ff', border: `1px solid ${paused ? '#fde68a' : '#bfdbfe'}`, borderRadius: 8, padding: '9px 13px', fontSize: 11, color: paused ? '#92400e' : '#1d4ed8' }}>
                  {paused ? '⏸ Paused — switch tabs freely, calls resume when you click Resume' : '📞 Calling in background — you can switch tabs without interrupting calls'}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {[{ n: waiting, l: 'In queue', c: '#18181b' }, { n: inProgress, l: 'Calling now', c: '#2563eb' }, { n: answered, l: 'Answered', c: '#16a34a' }, { n: booked, l: 'Booked', c: '#7c3aed' }].map(({ n, l, c }) => (
                  <div key={l} style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 10, padding: '11px 13px' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: c, lineHeight: 1 }}>{n}</div>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3 }}>{l}</div>
                  </div>
                ))}
              </div>

              {queue.length === 0 && (
                <div style={{ padding: '50px 20px', textAlign: 'center', color: '#9ca3af' }}>
                  <div style={{ fontSize: 22, marginBottom: 10 }}>📞</div>
                  <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500, marginBottom: 5 }}>Queue is empty</div>
                  <div style={{ fontSize: 12 }}>Add leads from the left panel, or select leads in Saved Leads → Send to AI Phone.</div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {queue.map(item => {
                  const sti  = stBadge[item.status] || stBadge.queued
                  const oi   = item.outcome !== 'pending' ? outBadge[item.outcome] : null
                  const active = ['ringing','in-progress'].includes(item.status)
                  const initials = item.lead.name.split(' ').map((w: string) => w[0]).slice(0,2).join('').toUpperCase()
                  return (
                    <div key={item.leadId}
                      onClick={() => setSelectedCall(selectedCall?.leadId === item.leadId ? null : item)}
                      style={{ background: '#fff', border: `1px solid ${active ? '#93c5fd' : item.status === 'completed' ? '#86efac' : item.status === 'failed' ? '#fca5a5' : '#e4e4e0'}`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 7, background: active ? '#dbeafe' : '#f4f4f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: active ? '#1e3a8a' : '#9ca3af', flexShrink: 0 }}>
                        {active ? <WaveIcon /> : initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.lead.name}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.lead.phone} · {(item.lead.signals||[]).slice(0,2).map(s=>SIGNALS[s]?.label||s).join(' · ')||'No signals'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, ...(oi||sti) }}>{oi ? oi.label : sti.label}</span>
                        {item.duration && <span style={{ fontSize: 9, color: '#9ca3af' }}>{Math.floor(item.duration/60)}:{String(item.duration%60).padStart(2,'0')}</span>}
                        {item.recordingUrl && <span style={{ fontSize: 9, color: '#2563eb' }}>🎙 Recording</span>}
                        {item.crmPushed && <span style={{ fontSize: 9, color: '#16a34a' }}>✓ CRM</span>}
                        {(item.retryCount || 0) > 0 && <span style={{ fontSize: 9, color: '#9ca3af' }}>retry {item.retryCount}</span>}
                        {item.error && <span style={{ fontSize: 9, color: '#dc2626', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', marginTop: 2 }} title={item.error}>⚠ {item.error}</span>}
                      </div>
                      {item.status === 'queued' && (
                        <button onClick={e => { e.stopPropagation(); removeFromQ(item.leadId) }}
                          style={{ fontSize: 10, padding: '3px 7px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', color: '#6b7280' }}>×</button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Transcript drawer */}
            {selectedCall && (
              <div style={{ background: '#fff', borderLeft: '1px solid #e4e4e0', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedCall.lead.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{selectedCall.lead.phone} · {selectedCall.lead.addr?.split(',')[0]}</div>
                  </div>
                  <button onClick={() => setSelectedCall(null)} style={{ fontSize: 13, padding: '2px 8px', border: '1px solid #e4e4e0', background: '#fff', borderRadius: 6, cursor: 'pointer', color: '#6b7280' }}>✕</button>
                </div>

                <div style={{ background: '#fafaf9', borderRadius: 8, border: '1px solid #f0f0ec', padding: '9px 11px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, fontSize: 11 }}>
                  {[
                    { l: 'Status',   v: selectedCall.status },
                    { l: 'Outcome',  v: selectedCall.outcome },
                    { l: 'Duration', v: selectedCall.duration ? `${Math.floor(selectedCall.duration/60)}:${String(selectedCall.duration%60).padStart(2,'0')}` : '—' },
                    { l: 'Called at', v: selectedCall.startedAt ? new Date(selectedCall.startedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—' },
                  ].map(({ l, v }) => (
                    <div key={l}><div style={{ color: '#9ca3af', marginBottom: 2 }}>{l}</div><div style={{ fontWeight: 600 }}>{v}</div></div>
                  ))}
                </div>

                {selectedCall.recordingUrl && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Recording</div>
                    <audio controls src={selectedCall.recordingUrl} style={{ width: '100%', borderRadius: 8 }} />
                    <a href={selectedCall.recordingUrl} download style={{ display: 'block', marginTop: 5, fontSize: 11, color: '#2563eb', textDecoration: 'none' }}>⬇ Download</a>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Issues pitched</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(selectedCall.lead.signals||[]).map(s => {
                      const sig = SIGNALS[s]
                      const c: Record<string,string>  = { r: '#991b1b', a: '#78350f', b: '#1e3a8a' }
                      const bg: Record<string,string> = { r: '#fee2e2', a: '#fef3c7', b: '#dbeafe' }
                      return <span key={s} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600, background: bg[sig?.color||'r'], color: c[sig?.color||'r'] }}>{sig?.label||s}</span>
                    })}
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                    {selectedCall.transcript?.length ? 'Transcript' : 'Transcript (available after call ends)'}
                  </div>
                  {selectedCall.transcript?.length ? (
                    <div style={{ background: '#f6f6f4', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 300, overflowY: 'auto' }}>
                      {selectedCall.transcript.map((line: TranscriptLine, i: number) => (
                        <div key={i} style={{ fontSize: 11, lineHeight: 1.65 }}>
                          <span style={{ fontWeight: 700, color: line.role === 'ai' ? '#2563eb' : '#18181b' }}>{line.role === 'ai' ? 'AI: ' : 'Human: '}</span>
                          <span style={{ color: '#374151' }}>{line.text}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ background: '#f6f6f4', borderRadius: 8, padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                      {selectedCall.status === 'completed' ? 'No transcript captured.' : 'Transcript appears here once the call ends.'}
                    </div>
                  )}
                </div>

                {selectedCall.error && (
                  <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 8, padding: '9px 11px', fontSize: 11, color: '#991b1b' }}>
                    <strong>Error:</strong> {selectedCall.error}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function WaveIcon() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 14 }}>
      {[4,8,12,8,4].map((h,i) => (
        <span key={i} style={{ width: 2, background: '#2563eb', borderRadius: 1, display: 'inline-block', height: h, animation: `wave 0.8s ease-in-out ${i*0.1}s infinite` }} />
      ))}
    </div>
  )
}

const btnSt: React.CSSProperties = { padding: '5px 11px', fontSize: 11, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontWeight: 500, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }
