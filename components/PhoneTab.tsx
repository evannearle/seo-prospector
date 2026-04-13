/* eslint-disable react/no-unescaped-entities */
'use client'
import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { SIGNALS } from '@/lib/types'
import { loadSettings } from '@/components/SettingsTab'
import type { Lead, CallRecord, CallStatus, CallOutcome, TranscriptLine } from '@/lib/types'

interface QueueItem {
  leadId: string; lead: Lead; status: CallStatus; outcome: CallOutcome
  callId?: string; startedAt?: string; endedAt?: string; duration?: number
  recordingUrl?: string; transcript?: TranscriptLine[]; error?: string
}

// Live call script preview — mirrors what buildSystemPrompt does in the API
function buildScriptPreview(lead: Lead | null): string {
  const s = loadSettings()
  const niche   = lead?.niche || '[niche]'
  const city    = lead?.addr?.split(',')[0] || '[city]'
  const biz     = lead?.name || '[Business Name]'
  const sig1    = lead?.signals?.[0] ? (SIGNALS[lead.signals[0]]?.label || lead.signals[0]) : '[issue 1]'
  const sig2    = lead?.signals?.[1] ? (SIGNALS[lead.signals[1]]?.label || lead.signals[1]) : '[issue 2]'
  const caller  = s.callerName || 'Evan'
  const title   = s.callerTitle || 'Local SEO Specialist'
  const agency  = s.agencyName || 'your agency'
  const email   = s.callerEmail || '[email]'
  const link    = s.calendlyEventUrl || '[booking link]'
  const goal    = s.callGoal
  const noAns   = s.noAnswerBehavior
  const vp      = s.valueProposition
  const offer   = s.offerLine

  const openingScript = `━━━ OPENING ━━━
Pattern interrupt — never "how are you?" or "is this a bad time?"

"Hi, could I speak with the owner or manager of ${biz}?"

[Connected] — pause 1 second, then:
"Hey — ${caller} here. I'll be quick. I was actually just looking up ${niche}s in ${city} and I came across ${biz}. I noticed something on your Google listing I think you'd want to know about — do you have literally 60 seconds?"`

  const pitchScript =
    goal === 'book'
      ? `━━━ PITCH (problem-first framing) ━━━
[After they say yes to 60 seconds]
"So what I found is ${sig1} — and for a ${niche} in ${city}, that's typically the #1 reason businesses don't show up when someone searches nearby. And you also have ${sig2}. That combination is basically handing calls to your competitors."

[Let that land. Don't rush to fill silence.]

"We've helped a couple of ${niche}s in your area go from essentially invisible on Google to showing up in the top 3 — within about 90 days. More calls, no ad spend."

[Value prop:] "${vp}"`
      : goal === 'qualify'
      ? `━━━ QUALIFY FIRST ━━━
"Quick question — are you currently doing anything to improve your Google Maps visibility?"

[Listen — most say no or "not really"]

"That makes sense. I ask because I was looking at ${biz}'s listing and found ${sig1}. For a ${niche} in ${city}, that's the kind of thing that pushes you off the first page. I put together a quick audit — would it be helpful to see what I found?"`
      : `━━━ SOFT INTRO ━━━
"I found ${biz} while researching ${niche}s in ${city} and I'd love to offer you a completely free, no-obligation audit of your Google presence. I noticed ${sig1} — it's an easy fix and I can send you the whole breakdown by email. Would that be useful?"`

  const microCommit = `━━━ MICRO-COMMITMENT LADDER ━━━
Before making the ask, get a small yes:
"Can I ask — do you know roughly where you're showing up on Google Maps when someone searches for a ${niche} in ${city}?"

[Most say no] →
"That's actually really common. Would it be helpful if I showed you exactly where you stand and what it would take to fix it?"`

  const askScript = `━━━ THE ASK ━━━
"${offer}"

[Immediately] → ${s.calendlyEventUrl
    ? `"I have a few slots this week — let me grab them..."
→ Read next 3 available times from your Calendly
"Which of those works best for you?"`
    : `"Here's a quick link — ${link} — takes 30 seconds to grab a time."`}`

  const bookingScript = `━━━ TWO-OPTION CLOSE ━━━
Never: "Do you want to schedule?" (yes/no door)
Always: "Would earlier in the week or later in the week work better?"
Then offer specific times within their preference.

[When they confirm a slot:]
"Perfect — I've got you down for [time]. You'll receive a calendar invite shortly. Looking forward to it!"`

  const objections = `━━━ OBJECTION HANDLING (aikido — agree + redirect) ━━━
"Not interested" →
  "Completely fair. Can I just ask — do you know how many people search for a ${niche} in ${city} every month? It might surprise you." 
  [Still no] → "No problem. Would it be okay if I sent a quick summary of what I found to your email, just so you have it?"

"Already have someone" →
  "Oh great — out of curiosity, are they actively managing your Google Business Profile? I ask because I noticed ${sig1} — that's something that would typically be caught."

"Call me back later" →
  "Of course — when specifically? I want to make sure your audit is ready." [Pin to exact time — don't accept vague]

"How much does it cost?" →
  "The audit is completely free — no catch. If after seeing it you want to talk about working together, we can, but that's totally up to you." [Return to booking]

"Email me instead" →
  "Absolutely — what's the best email?" [Get it] → "What's your biggest challenge getting new customers right now?" [Qualify]

"Not a priority right now" →
  "I hear you — is that more of a budget thing or just timing?" [Diagnose real objection]`

  const vmScript = noAns === 'voicemail'
    ? `━━━ VOICEMAIL ━━━
"Hey, this is ${caller} from ${agency}. I was just researching ${niche}s in ${city} and found ${biz} — I noticed ${sig1?.toLowerCase()} on your listing, and that's likely costing you calls. Give me a quick call back or visit ${link}. Talk soon."`
    : `━━━ NO ANSWER ━━━
Hang up — do not leave a voicemail. Will retry on next run.`

  const closeScript = `━━━ GRACEFUL EXIT (if firm no after two attempts) ━━━
"I completely respect that. I'm going to send you a short summary of what I found anyway, just so you have it if things change. What's the best email for that?"
[Get email if possible] → "Thanks for your time — and good luck with the business."

Never burn the bridge. Today's no is often next quarter's yes.

Contact: ${email} | Max duration: ${Math.round(s.maxCallDurationSeconds / 60)} min`

  return [openingScript, pitchScript, microCommit, askScript, bookingScript, objections, vmScript, closeScript].join('\n\n')
}

export default function PhoneTab({ queueIds, onQueueChange }: { queueIds: string[]; onQueueChange: (ids: string[]) => void }) {
  const { leads, addCall, updateCall } = useStore()
  const [queue, setQueue]             = useState<QueueItem[]>([])
  const [calling, setCalling]         = useState(false)
  const [selectedCall, setSelectedCall] = useState<QueueItem | null>(null)
  const [showScript, setShowScript]   = useState(false)
  const [previewLead, setPreviewLead] = useState<Lead | null>(null)
  const callingRef = useRef(false)

  const settings = loadSettings()
  const missingConfig = !settings.vapiApiKey || !settings.vapiPhoneNumberId

  useEffect(() => {
    if (!queueIds.length) return
    setQueue(prev => {
      const existing = new Set(Array.from(prev.map(q => q.leadId)))
      const toAdd = queueIds.filter(id => !existing.has(id)).map(id => {
        const lead = leads.find(l => l.id === id)
        if (!lead) return null
        return { leadId: id, lead, status: 'queued' as CallStatus, outcome: 'pending' as CallOutcome }
      }).filter(Boolean) as QueueItem[]
      return [...prev, ...toAdd]
    })
    onQueueChange([])
  }, [queueIds])

  useEffect(() => {
    if (leads.length > 0 && !previewLead) setPreviewLead(leads[0])
  }, [leads])

  const addToQueue = (lead: Lead) => {
    if (!lead.phone) { alert(`${lead.name} has no phone number.`); return }
    setQueue(prev => prev.find(q => q.leadId === lead.id) ? prev : [...prev, { leadId: lead.id, lead, status: 'queued', outcome: 'pending' }])
  }

  const removeFromQueue = (leadId: string) => setQueue(prev => prev.filter(q => q.leadId !== leadId))

  const startCalls = async () => {
    const s = loadSettings()
    if (!s.vapiApiKey)        { alert('Add your Vapi API key in Settings first.'); return }
    if (!s.vapiPhoneNumberId) { alert('Add your Vapi Phone Number ID in Settings first.'); return }
    const waiting = queue.filter(q => q.status === 'queued')
    if (!waiting.length) { alert('No leads waiting in queue.'); return }
    setCalling(true); callingRef.current = true

    for (const item of waiting) {
      if (!callingRef.current) break
      setQueue(prev => prev.map(q => q.leadId === item.leadId ? { ...q, status: 'ringing', startedAt: new Date().toISOString() } : q))
      try {
        const resp = await fetch('/api/calls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead: item.lead,
            config: {
              vapiApiKey:            s.vapiApiKey,
              phoneNumberId:         s.vapiPhoneNumberId,
              agencyName:            s.agencyName,
              callerName:            s.callerName,
              callerTitle:           s.callerTitle,
              callerEmail:           s.callerEmail,
              bookingLink:           s.calendlyEventUrl,
              calendlyToken:         s.calendlyToken,
              callGoal:              s.callGoal,
              noAnswerBehavior:      s.noAnswerBehavior,
              valueProposition:      s.valueProposition,
              offerLine:             s.offerLine,
              maxCallDurationSeconds: s.maxCallDurationSeconds,
              voiceId:               s.voiceId,
              aiTemperature:         s.aiTemperature,
            },
          }),
        })
        const data = await resp.json()
        if (!resp.ok) throw new Error(data.error || 'Vapi API error')
        const callId = data.id || data.callId || data.call_id
        const callRecord: CallRecord = {
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          leadId: item.lead.id, leadName: item.lead.name,
          phone: item.lead.phone || '', status: 'in-progress', outcome: 'pending',
          startedAt: new Date().toISOString(), vapiCallId: callId,
        }
        addCall(callRecord)
        setQueue(prev => prev.map(q => q.leadId === item.leadId ? { ...q, status: 'in-progress', callId, startedAt: new Date().toISOString() } : q))
        if (callId) await pollCallStatus(callId, item.leadId, callRecord.id, s.vapiApiKey)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        setQueue(prev => prev.map(q => q.leadId === item.leadId ? { ...q, status: 'failed', outcome: 'no-answer', error: msg } : q))
      }
      if (callingRef.current) await new Promise(r => setTimeout(r, (s.delayBetweenCallsSeconds || 3) * 1000))
    }
    setCalling(false); callingRef.current = false
  }

  const pollCallStatus = async (callId: string, leadId: string, recordId: string, apiKey: string) => {
    const maxWait = 3 * 60 * 1000; const start = Date.now()
    while (callingRef.current && Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 5000))
      try {
        const resp = await fetch(`/api/calls?callId=${callId}&apiKey=${apiKey}`)
        const data = await resp.json()
        if (data.status === 'ended') {
          const transcript: TranscriptLine[] = (data.artifact?.transcript || []).map((t: { role: string; message?: string; content?: string }) => ({ role: t.role === 'assistant' ? 'ai' : 'human', text: t.message || t.content || '' }))
          const recordingUrl = data.artifact?.recordingUrl || null
          const outcome = inferOutcome(data.analysis?.summary || JSON.stringify(transcript))
          const dur = data.endedAt && data.startedAt ? Math.round((new Date(data.endedAt).getTime() - new Date(data.startedAt).getTime()) / 1000) : undefined
          setQueue(prev => prev.map(q => q.leadId === leadId ? { ...q, status: 'completed', outcome, endedAt: new Date().toISOString(), duration: dur, recordingUrl, transcript } : q))
          updateCall(recordId, { status: 'completed', outcome, endedAt: new Date().toISOString(), duration: dur, recordingUrl, transcript })
          return
        }
        if (data.status === 'failed') {
          setQueue(prev => prev.map(q => q.leadId === leadId ? { ...q, status: 'failed', outcome: 'no-answer' } : q))
          updateCall(recordId, { status: 'failed', outcome: 'no-answer' }); return
        }
      } catch { /* keep polling */ }
    }
  }

  const stopCalls = () => { callingRef.current = false; setCalling(false) }

  const waiting    = queue.filter(q => q.status === 'queued').length
  const inProgress = queue.filter(q => ['ringing', 'in-progress'].includes(q.status)).length
  const answered   = queue.filter(q => ['answered', 'booked', 'not-interested', 'callback'].includes(q.outcome)).length
  const booked     = queue.filter(q => q.outcome === 'booked').length

  const stBadge: Record<string, { label: string; bg: string; color: string }> = {
    queued:        { label: 'Waiting',    bg: '#f4f4f2', color: '#6b7280' },
    ringing:       { label: 'Ringing...', bg: '#dbeafe', color: '#1e3a8a' },
    'in-progress': { label: 'In call',   bg: '#dbeafe', color: '#1e3a8a' },
    completed:     { label: 'Done',       bg: '#dcfce7', color: '#166534' },
    failed:        { label: 'Failed',     bg: '#fee2e2', color: '#991b1b' },
  }
  const outBadge: Record<string, { label: string; bg: string; color: string }> = {
    pending:          { label: 'Pending',         bg: '#f4f4f2', color: '#6b7280' },
    answered:         { label: 'Answered',        bg: '#dcfce7', color: '#166534' },
    voicemail:        { label: 'Voicemail left',  bg: '#fef3c7', color: '#78350f' },
    'no-answer':      { label: 'No answer',       bg: '#fee2e2', color: '#991b1b' },
    booked:           { label: 'Booked!',         bg: '#ede9fe', color: '#5b21b6' },
    'not-interested': { label: 'Not interested',  bg: '#f4f4f2', color: '#6b7280' },
    callback:         { label: 'Callback',        bg: '#fef3c7', color: '#78350f' },
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* ── Left: Add leads panel ── */}
      <div style={{ width: 260, minWidth: 260, background: '#fff', borderRight: '1px solid #e4e4e0', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Add to queue</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>Leads with phone numbers from your saved list</div>
        </div>

        {missingConfig && (
          <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 8, padding: '9px 11px', fontSize: 11, color: '#991b1b', lineHeight: 1.5 }}>
            ⚠ Missing Vapi credentials. Go to <strong>Settings</strong> to add your API key and Phone Number ID.
          </div>
        )}

        {!missingConfig && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '9px 11px', fontSize: 11, color: '#166534', lineHeight: 1.5 }}>
            ✓ Vapi configured · {settings.agencyName} · {settings.callerName}
            {settings.calendlyEventUrl && <><br />✓ Calendly auto-booking enabled</>}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {leads.filter(l => l.phone).length === 0 && (
            <div style={{ fontSize: 11, color: '#9ca3af', padding: '12px 0', textAlign: 'center' }}>
              No leads with phone numbers yet.<br />Run the Prospector first.
            </div>
          )}
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
                <button onClick={() => addToQueue(l)} disabled={inQ}
                  style={{ fontSize: 10, padding: '3px 8px', border: 'none', borderRadius: 5, cursor: inQ ? 'default' : 'pointer', fontFamily: 'inherit', background: inQ ? '#dcfce7' : '#18181b', color: inQ ? '#166534' : '#fff', flexShrink: 0 }}>
                  {inQ ? '✓' : 'Add'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Main: queue + script toggle ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e4e4e0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1, fontSize: 12, color: '#6b7280' }}>
            {showScript ? 'Full call script — exactly what the AI says, personalized per lead' : 'Queue · click any call to see transcript + recording'}
          </div>
          {showScript && leads.length > 0 && (
            <select value={previewLead?.id || ''} onChange={e => setPreviewLead(leads.find(l => l.id === e.target.value) || null)}
              style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontFamily: 'inherit', outline: 'none' }}>
              <option value="">— No lead selected —</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <button onClick={() => setShowScript(s => !s)}
            style={{ fontSize: 11, padding: '5px 12px', border: '1px solid #d1d5db', background: showScript ? '#18181b' : '#fff', color: showScript ? '#fff' : '#6b7280', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
            {showScript ? 'Hide script' : 'Preview call script'}
          </button>
        </div>

        {showScript ? (
          /* Script preview */
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            <div style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 12, overflow: 'hidden', maxWidth: 760, margin: '0 auto' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0ec', background: '#fafaf9', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
                <div style={{ fontSize: 12, fontWeight: 700 }}>AI Call Script {previewLead ? `— ${previewLead.name}` : '— select a lead above'}</div>
                <div style={{ marginLeft: 'auto', fontSize: 10, color: '#9ca3af' }}>Reflects your current Settings · updates live</div>
              </div>
              <pre style={{ padding: 20, fontSize: 12, lineHeight: 1.9, color: '#374151', whiteSpace: 'pre-wrap', fontFamily: "'SF Mono','Fira Code',monospace", margin: 0 }}>
                {buildScriptPreview(previewLead)}
              </pre>
            </div>
          </div>
        ) : (
          /* Queue + transcript */
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: selectedCall ? '1fr 360px' : '1fr', overflow: 'hidden' }}>
            <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Call Queue</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>AI pitches each lead using their specific SEO issues · books directly into Calendly if configured</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
                  <button onClick={() => setQueue([])} style={btnSt}>Clear queue</button>
                  {!calling
                    ? <button onClick={startCalls} disabled={!waiting || missingConfig} style={{ ...btnSt, background: '#16a34a', color: '#fff', border: 'none', opacity: waiting && !missingConfig ? 1 : .4 }}>▶ Start calling</button>
                    : <button onClick={stopCalls} style={{ ...btnSt, background: '#dc2626', color: '#fff', border: 'none' }}>■ Stop</button>
                  }
                </div>
              </div>

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
                  <div style={{ fontSize: 24, marginBottom: 10 }}>📞</div>
                  <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500, marginBottom: 5 }}>Queue is empty</div>
                  <div style={{ fontSize: 12 }}>Add leads from the left panel, or select leads in Saved Leads and click "Send to AI Phone".</div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {queue.map(item => {
                  const sti = stBadge[item.status] || stBadge.queued
                  const oi  = item.outcome !== 'pending' ? outBadge[item.outcome] : null
                  const active = ['ringing', 'in-progress'].includes(item.status)
                  const initials = item.lead.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
                  return (
                    <div key={item.leadId} onClick={() => setSelectedCall(selectedCall?.leadId === item.leadId ? null : item)}
                      style={{ background: '#fff', border: `1px solid ${active ? '#93c5fd' : item.status === 'completed' ? '#86efac' : item.status === 'failed' ? '#fca5a5' : '#e4e4e0'}`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 7, background: active ? '#dbeafe' : '#f4f4f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: active ? '#1e3a8a' : '#9ca3af', flexShrink: 0 }}>
                        {active ? <WaveIcon /> : initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.lead.name}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.lead.phone} · {(item.lead.signals || []).slice(0, 2).map(s => SIGNALS[s]?.label || s).join(' · ') || 'No signals'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, ...(oi || sti) }}>{oi ? oi.label : sti.label}</span>
                        {item.duration && <span style={{ fontSize: 9, color: '#9ca3af' }}>{Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}</span>}
                        {item.recordingUrl && <span style={{ fontSize: 9, color: '#2563eb' }}>🎙 Recording</span>}
                      </div>
                      {item.status === 'queued' && (
                        <button onClick={e => { e.stopPropagation(); removeFromQueue(item.leadId) }} style={{ fontSize: 10, padding: '3px 7px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', color: '#6b7280' }}>×</button>
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
                  {[{ l: 'Status', v: selectedCall.status }, { l: 'Outcome', v: selectedCall.outcome }, { l: 'Duration', v: selectedCall.duration ? `${Math.floor(selectedCall.duration / 60)}:${String(selectedCall.duration % 60).padStart(2, '0')}` : '—' }, { l: 'Called at', v: selectedCall.startedAt ? new Date(selectedCall.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' }].map(({ l, v }) => (
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
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Issues pitched on this call</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(selectedCall.lead.signals || []).map(s => {
                      const sig = SIGNALS[s]; const c: Record<string, string> = { r: '#991b1b', a: '#78350f', b: '#1e3a8a' }; const bg: Record<string, string> = { r: '#fee2e2', a: '#fef3c7', b: '#dbeafe' }
                      return <span key={s} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600, background: bg[sig?.color || 'r'], color: c[sig?.color || 'r'] }}>{sig?.label || s}</span>
                    })}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                    {selectedCall.transcript?.length ? 'Transcript' : 'Transcript (available after call ends)'}
                  </div>
                  {selectedCall.transcript?.length ? (
                    <div style={{ background: '#f6f6f4', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 300, overflowY: 'auto' }}>
                      {selectedCall.transcript.map((line, i) => (
                        <div key={i} style={{ fontSize: 11, lineHeight: 1.65 }}>
                          <span style={{ fontWeight: 700, color: line.role === 'ai' ? '#2563eb' : '#18181b' }}>{line.role === 'ai' ? 'AI: ' : 'Human: '}</span>
                          <span style={{ color: '#374151' }}>{line.text}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ background: '#f6f6f4', borderRadius: 8, padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                      {selectedCall.status === 'completed' ? 'No transcript captured for this call.' : 'Transcript appears here once the call ends.'}
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
      {[4, 8, 12, 8, 4].map((h, i) => (
        <span key={i} style={{ width: 2, background: '#2563eb', borderRadius: 1, display: 'inline-block', height: h, animation: `wave 0.8s ease-in-out ${i * 0.1}s infinite` }} />
      ))}
    </div>
  )
}

function inferOutcome(text: string): CallOutcome {
  const t = text.toLowerCase()
  if (t.includes('book') || t.includes('schedule') || t.includes('calendly')) return 'booked'
  if (t.includes('not interested') || t.includes('no thank')) return 'not-interested'
  if (t.includes('call back') || t.includes('try again')) return 'callback'
  if (t.includes('voicemail')) return 'voicemail'
  if (t.length > 100) return 'answered'
  return 'no-answer'
}

const btnSt: React.CSSProperties = { padding: '5px 11px', fontSize: 11, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontWeight: 500, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }
