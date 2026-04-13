/* eslint-disable react/no-unescaped-entities */
'use client'
import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { SIGNALS } from '@/lib/types'
import type { Lead, CallRecord, CallStatus, CallOutcome, TranscriptLine } from '@/lib/types'

interface QueueItem {
  leadId: string; lead: Lead; status: CallStatus; outcome: CallOutcome
  callId?: string; startedAt?: string; endedAt?: string; duration?: number
  recordingUrl?: string; transcript?: TranscriptLine[]; error?: string
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
      <path d="M2 4l4 4 4-4" />
    </svg>
  )
}

function Section({ title, sub, children, defaultOpen = true }: { title: string; sub?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: '1px solid #e4e4e0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px', background: open ? '#fff' : '#fafaf9', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#18181b' }}>{title}</div>
          {sub && !open && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{sub}</div>}
        </div>
        <Chevron open={open} />
      </button>
      {open && (
        <div style={{ padding: '0 13px 12px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #f0f0ec' }}>
          <div style={{ height: 10 }} />
          {children}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', letterSpacing: '.07em', textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  )
}

function buildScript({ agencyName, callerName, bookingLink, callGoal, noAnswer, lead, hasCalendly }: {
  agencyName: string; callerName: string; bookingLink: string; callGoal: string
  noAnswer: string; lead?: Lead | null; hasCalendly: boolean
}) {
  const niche = lead?.niche || '[niche]'
  const city = lead?.addr?.split(',')[0] || '[city]'
  const bizName = lead?.name || '[Business Name]'
  const sig1 = lead?.signals?.[0] ? (SIGNALS[lead.signals[0]]?.label || lead.signals[0]) : '[issue 1]'
  const sig2 = lead?.signals?.[1] ? (SIGNALS[lead.signals[1]]?.label || lead.signals[1]) : '[issue 2]'
  const agency = agencyName || '[Agency Name]'
  const caller = callerName || '[Your Name]'
  const link = bookingLink || '[calendly link]'

  const opening = `OPENING
"Hi, may I please speak with the owner or manager of ${bizName}?"`

  const pitch =
    callGoal === 'book'
      ? `PITCH (if they answer)
"${caller} here from ${agency}. Quick call — I was looking up ${niche}s in ${city} and came across ${bizName} on Google. I noticed ${sig1.toLowerCase()} and ${sig2.toLowerCase()}. Those two things alone are likely costing you calls every week.

I specialize in getting ${niche}s into Google's top 3 in your area. I'm not here to sell you anything today — I'd just love to share a free audit I put together showing exactly what I found. Worth a quick look?"`
      : callGoal === 'qualify'
      ? `QUALIFY FIRST
"${caller} from ${agency}. Quick question — are you currently doing anything to improve your rankings on Google Maps?

[Listen]

That makes sense. I ask because I was researching ${niche}s in ${city} and found ${bizName}. I noticed ${sig1.toLowerCase()} — that's typically pushing businesses down in local search. I put together a free audit showing exactly what's holding you back. Would that be useful?"`
      : `SOFT INTRO
"${caller} from ${agency}. I found ${bizName} while researching ${niche}s in ${city} and wanted to offer you a completely free SEO audit — no pitch, no strings. I spotted a couple of things on your Google profile that are easy fixes. Happy to just email it over if you'd like?"`

  const booking = hasCalendly
    ? `BOOKING (when they agree)
The AI reads your next 3 available Calendly slots live:
"I have [Day] at [Time], [Day] at [Time], or [Day] at [Time] — which works best?"

When they pick one:
"Perfect — I've got you down for [their choice]. You'll get a calendar invite shortly. Looking forward to it!"`
    : `BOOKING (when they agree)
"I'll send you a link right now so you can grab a time that works — takes 30 seconds."
[Shares: ${link}]`

  const objections = `OBJECTION HANDLING
"Not interested" → "Totally fine — would it be okay if I just emailed you what I found? Zero obligation."
"We already have someone" → "Good to hear. Out of curiosity, are you showing up in the top 3 on Google Maps for ${niche}s in ${city}? I noticed ${sig1.toLowerCase()}."
"Call me back later" → "Of course — when's a good time? I'll have your full audit ready."
"How much does it cost?" → "The audit is 100% free. If you want to work together after seeing it, we can talk then — but there's no obligation at all."`

  const vmScript = noAnswer === 'voicemail'
    ? `VOICEMAIL (if no answer)
"Hi, this is ${caller} from ${agency}. I was researching ${niche}s in ${city} and found ${bizName} on Google. I noticed ${sig1.toLowerCase()} — that's likely costing you calls. I put together a free audit. Give me a call back or visit ${link}. Talk soon!"`
    : `NO ANSWER
Hangs up politely — no voicemail left. Will retry later.`

  const close = `CLOSE
If firm no: "Completely understand — thanks for your time. Have a great day!"
Max call duration: 10 minutes.`

  return [opening, pitch, booking, objections, vmScript, close].join('\n\n')
}

export default function PhoneTab({ queueIds, onQueueChange, settings }: { queueIds: string[]; onQueueChange: (ids: string[]) => void; settings?: import('@/components/SettingsTab').AppSettings | null }) {
  const { leads, addCall, updateCall } = useStore()
  const [apiKey, setApiKey]           = useState('')
  const [phoneId, setPhoneId]         = useState('')
  const [agencyName, setAgencyName]   = useState('Genesee Marketing')
  const [callerName, setCallerName]   = useState('Evan')
  const [bookingLink, setBookingLink] = useState('')
  const [calendlyToken, setCalendlyToken] = useState('')
  const [callGoal, setCallGoal]       = useState('book')
  const [noAnswer, setNoAnswer]       = useState('voicemail')
  const [queue, setQueue]             = useState<QueueItem[]>([])
  const [calling, setCalling]         = useState(false)
  const [selectedCall, setSelectedCall] = useState<QueueItem | null>(null)
  const [showScript, setShowScript]   = useState(false)
  const [previewLead, setPreviewLead] = useState<Lead | null>(null)
  const callingRef = useRef(false)

  // Sync settings into local state when settings change
  useEffect(() => {
    if (!settings) return
    if (settings.vapiApiKey)       setApiKey(settings.vapiApiKey)
    if (settings.vapiPhoneNumberId) setPhoneId(settings.vapiPhoneNumberId)
    if (settings.agencyName)       setAgencyName(settings.agencyName)
    if (settings.callerName)       setCallerName(settings.callerName)
    if (settings.calendlyEventUrl) setBookingLink(settings.calendlyEventUrl)
    if (settings.calendlyToken)    setCalendlyToken(settings.calendlyToken)
    if (settings.callGoal)         setCallGoal(settings.callGoal)
    if (settings.noAnswerBehavior) setNoAnswer(settings.noAnswerBehavior)
  }, [settings])

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
    if (!apiKey) { alert('Enter your Vapi API key'); return }
    if (!phoneId) { alert('Enter your Vapi Phone Number ID'); return }
    const waiting = queue.filter(q => q.status === 'queued')
    if (!waiting.length) { alert('No leads waiting in queue'); return }
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
              vapiApiKey: apiKey, phoneNumberId: phoneId,
              agencyName, callerName,
              callerTitle: settings?.callerTitle || '',
              callerEmail: settings?.callerEmail || '',
              bookingLink, calendlyToken,
              callGoal, noAnswerBehavior: noAnswer,
              pitchFocus: settings?.pitchFocus || 'google_maps',
              valueProposition: settings?.valueProposition || '',
              offerLine: settings?.offerLine || '',
              maxCallDurationSeconds: settings?.maxCallDurationSeconds || 600,
              voiceId: settings?.voiceId || 'pNInz6obpgDQGcFmaJgB',
              aiTemperature: settings?.aiTemperature ?? 0.7,
            }
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

        if (callId) await pollCallStatus(callId, item.leadId, callRecord.id)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        setQueue(prev => prev.map(q => q.leadId === item.leadId ? { ...q, status: 'failed', outcome: 'no-answer', error: msg } : q))
      }

      if (callingRef.current) await new Promise(r => setTimeout(r, 3000))
    }
    setCalling(false); callingRef.current = false
  }

  const pollCallStatus = async (callId: string, leadId: string, recordId: string) => {
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
      } catch { /* continue polling */ }
    }
  }

  const stopCalls = () => { callingRef.current = false; setCalling(false) }

  const waiting    = queue.filter(q => q.status === 'queued').length
  const inProgress = queue.filter(q => ['ringing', 'in-progress'].includes(q.status)).length
  const answered   = queue.filter(q => ['answered', 'booked', 'not-interested', 'callback'].includes(q.outcome)).length
  const booked     = queue.filter(q => q.outcome === 'booked').length

  const stBadge: Record<string, { label: string; bg: string; color: string }> = {
    queued:        { label: 'Waiting',     bg: '#f4f4f2', color: '#6b7280' },
    ringing:       { label: 'Ringing...', bg: '#dbeafe', color: '#1e3a8a' },
    'in-progress': { label: 'In call',    bg: '#dbeafe', color: '#1e3a8a' },
    completed:     { label: 'Done',        bg: '#dcfce7', color: '#166534' },
    failed:        { label: 'Failed',      bg: '#fee2e2', color: '#991b1b' },
  }
  const outBadge: Record<string, { label: string; bg: string; color: string }> = {
    pending:          { label: 'Pending',           bg: '#f4f4f2', color: '#6b7280' },
    answered:         { label: 'Answered',          bg: '#dcfce7', color: '#166534' },
    voicemail:        { label: 'Voicemail left',    bg: '#fef3c7', color: '#78350f' },
    'no-answer':      { label: 'No answer',         bg: '#fee2e2', color: '#991b1b' },
    booked:           { label: 'Booked!',           bg: '#ede9fe', color: '#5b21b6' },
    'not-interested': { label: 'Not interested',    bg: '#f4f4f2', color: '#6b7280' },
    callback:         { label: 'Callback',          bg: '#fef3c7', color: '#78350f' },
  }

  const scriptText = buildScript({ agencyName, callerName, bookingLink, callGoal, noAnswer, lead: previewLead, hasCalendly: !!calendlyToken })

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* ── Config sidebar ── */}
      <div style={{ width: 300, minWidth: 300, background: '#f6f6f4', borderRight: '1px solid #e4e4e0', overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>

        <Section title="Vapi credentials" sub="API key + phone ID" defaultOpen={true}>
          <Field label="Vapi API Key">
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="vapi_..." style={inp} />
            <div style={hint}>Get at <a href="https://app.vapi.ai" target="_blank" style={{ color: '#2563eb' }}>app.vapi.ai</a> → Dashboard → API Keys</div>
          </Field>
          <Field label="Phone Number ID">
            <input value={phoneId} onChange={e => setPhoneId(e.target.value)} placeholder="Phone Number ID from Vapi dashboard" style={inp} />
            <div style={hint}>In Vapi: Phone Numbers → copy the ID (not the raw number)</div>
          </Field>
        </Section>

        <Section title="Agent identity" sub="Name, agency, goal" defaultOpen={true}>
          <Field label="Your name">
            <input value={callerName} onChange={e => setCallerName(e.target.value)} style={inp} />
          </Field>
          <Field label="Agency name">
            <input value={agencyName} onChange={e => setAgencyName(e.target.value)} style={inp} />
          </Field>
          <Field label="Call goal">
            <select value={callGoal} onChange={e => setCallGoal(e.target.value)} style={inp}>
              <option value="book">Pitch + book a discovery call</option>
              <option value="qualify">Qualify first, then pitch</option>
              <option value="soft">Soft intro — offer free audit only</option>
            </select>
          </Field>
          <Field label="If no answer">
            <select value={noAnswer} onChange={e => setNoAnswer(e.target.value)} style={inp}>
              <option value="voicemail">Leave personalized voicemail</option>
              <option value="skip">Hang up — retry later</option>
            </select>
          </Field>
        </Section>

        <Section title="Calendly booking" sub="Auto-book calls from the AI" defaultOpen={false}>
          <Field label="Event URL">
            <input value={bookingLink} onChange={e => setBookingLink(e.target.value)} placeholder="https://calendly.com/evan/seo-audit" style={inp} />
          </Field>
          <Field label="Personal access token">
            <input type="password" value={calendlyToken} onChange={e => setCalendlyToken(e.target.value)} placeholder="Bearer token..." style={inp} />
            <div style={hint}>
              <a href="https://calendly.com/integrations/api_webhooks" target="_blank" style={{ color: '#2563eb' }}>calendly.com/integrations/api_webhooks</a> → Personal Access Token. Lets the AI read your live slots and confirm bookings on the call.
            </div>
          </Field>
          {calendlyToken && bookingLink && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 7, padding: '8px 10px', fontSize: 11, color: '#166534' }}>
              ✓ AI will read your next 3 open slots aloud and confirm the booking live on the call.
            </div>
          )}
        </Section>

        <Section title="Add leads to queue" sub="From your saved leads" defaultOpen={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
            {leads.filter(l => l.phone).length === 0 && (
              <div style={{ fontSize: 11, color: '#9ca3af', padding: '8px 0' }}>No leads with phone numbers yet. Run the Prospector first.</div>
            )}
            {leads.filter(l => l.phone).map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 7, border: '1px solid #e4e4e0', background: '#fff' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>{l.phone}</div>
                </div>
                <button onClick={() => addToQueue(l)} disabled={!!queue.find(q => q.leadId === l.id)}
                  style={{ fontSize: 10, padding: '3px 9px', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', background: queue.find(q => q.leadId === l.id) ? '#f4f4f2' : '#18181b', color: queue.find(q => q.leadId === l.id) ? '#9ca3af' : '#fff' }}>
                  {queue.find(q => q.leadId === l.id) ? 'Added' : 'Add'}
                </button>
              </div>
            ))}
          </div>
        </Section>

        <div style={{ height: 8 }} />
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Call script preview toggle */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e4e4e0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: '#6b7280', flex: 1 }}>
            {showScript ? 'Full call script — exactly what the AI says' : 'Queue · click any call to see transcript + recording'}
          </div>
          {showScript && leads.filter(l => l.signals?.length).length > 0 && (
            <select value={previewLead?.id || ''} onChange={e => setPreviewLead(leads.find(l => l.id === e.target.value) || null)}
              style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontFamily: 'inherit', outline: 'none' }}>
              {leads.filter(l => l.phone || l.signals?.length).map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
          <button onClick={() => setShowScript(s => !s)}
            style={{ fontSize: 11, padding: '5px 12px', border: '1px solid #d1d5db', background: showScript ? '#18181b' : '#fff', color: showScript ? '#fff' : '#6b7280', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
            {showScript ? 'Hide script' : 'Preview call script'}
          </button>
        </div>

        {showScript ? (
          /* ── Script preview ── */
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            <div style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 12, overflow: 'hidden', maxWidth: 720, margin: '0 auto' }}>
              <div style={{ padding: '13px 16px', borderBottom: '1px solid #f0f0ec', background: '#fafaf9', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: '#18181b' }}>
                  AI Call Script {previewLead ? `— personalized for ${previewLead.name}` : '— no lead selected'}
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 10, color: '#9ca3af' }}>Updates live as you change settings</div>
              </div>
              <pre style={{ padding: 20, fontSize: 12, lineHeight: 1.85, color: '#374151', whiteSpace: 'pre-wrap', fontFamily: "'SF Mono','Fira Code',monospace", margin: 0, background: '#fff' }}>
                {scriptText}
              </pre>
            </div>
          </div>
        ) : (
          /* ── Queue + transcript drawer ── */
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: selectedCall ? '1fr 360px' : '1fr', overflow: 'hidden' }}>

            {/* Queue */}
            <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Call Queue</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>AI calls each lead with their specific SEO issues · books directly into Calendly</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
                  <button onClick={() => setQueue([])} style={btnSt}>Clear</button>
                  {!calling
                    ? <button onClick={startCalls} disabled={!waiting} style={{ ...btnSt, background: '#16a34a', color: '#fff', border: 'none', opacity: waiting ? 1 : .4 }}>▶ Start calling</button>
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
                  <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500, marginBottom: 5 }}>No leads in queue</div>
                  <div style={{ fontSize: 12 }}>Add leads from the config panel, or send from Saved Leads.</div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {queue.map(item => {
                  const sti = stBadge[item.status] || stBadge.queued
                  const oi  = item.outcome !== 'pending' ? outBadge[item.outcome] : null
                  const active = ['ringing', 'in-progress'].includes(item.status)
                  const initials = item.lead.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
                  return (
                    <div key={item.leadId}
                      style={{ background: '#fff', border: `1px solid ${active ? '#93c5fd' : item.status === 'completed' ? '#86efac' : item.status === 'failed' ? '#fca5a5' : '#e4e4e0'}`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}
                      onClick={() => setSelectedCall(selectedCall?.leadId === item.leadId ? null : item)}>
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
                        <button onClick={e => { e.stopPropagation(); removeFromQueue(item.leadId) }}
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
                    { l: 'Duration', v: selectedCall.duration ? `${Math.floor(selectedCall.duration / 60)}:${String(selectedCall.duration % 60).padStart(2, '0')}` : '—' },
                    { l: 'Called at', v: selectedCall.startedAt ? new Date(selectedCall.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' },
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
                    {(selectedCall.lead.signals || []).map(s => {
                      const sig = SIGNALS[s]
                      const c: Record<string, string> = { r: '#991b1b', a: '#78350f', b: '#1e3a8a' }
                      const bg: Record<string, string> = { r: '#fee2e2', a: '#fef3c7', b: '#dbeafe' }
                      return <span key={s} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600, background: bg[sig?.color || 'r'], color: c[sig?.color || 'r'] }}>{sig?.label || s}</span>
                    })}
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                    {selectedCall.transcript?.length ? 'Transcript' : 'Transcript (available after call ends)'}
                  </div>
                  {selectedCall.transcript?.length ? (
                    <div style={{ background: '#f6f6f4', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 280, overflowY: 'auto' }}>
                      {selectedCall.transcript.map((line, i) => (
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

const inp:   React.CSSProperties = { fontSize: 13, fontFamily: 'inherit', color: '#18181b', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, padding: '7px 10px', width: '100%', outline: 'none' }
const hint:  React.CSSProperties = { fontSize: 10, color: '#9ca3af', marginTop: 3, lineHeight: 1.4 }
const btnSt: React.CSSProperties = { padding: '5px 11px', fontSize: 11, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontWeight: 500, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }
