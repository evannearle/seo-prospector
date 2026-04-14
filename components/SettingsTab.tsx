/* eslint-disable react/no-unescaped-entities */
'use client'
import { useState, useEffect } from 'react'

export interface AppSettings {
  // API keys
  googleMapsApiKey: string
  vapiApiKey: string
  vapiPhoneNumberId: string
  calendlyEventUrl: string
  calendlyToken: string

  // Agency identity
  agencyName: string
  callerName: string
  callerTitle: string
  callerEmail: string
  callerPhone: string

  // AI call behavior
  callGoal: string
  noAnswerBehavior: string
  maxCallDurationSeconds: number
  delayBetweenCallsSeconds: number
  callModel: string
  voiceProvider: string
  voiceId: string
  voiceSpeed: number
  voiceStability: number
  voiceSimilarityBoost: number
  voiceOptimizeLatency: number
  aiTemperature: number

  // Pitch customization
  pitchFocus: string
  valueProposition: string
  offerLine: string

  // Retries + automation
  retryDelayMinutes: number
  maxRetries: number

  // Email alerts
  alertEmail: string
  resendApiKey: string
  emailAlertsEnabled: boolean

  // CRM / webhook
  crmWebhookUrl: string
  crmPushOnBooked: boolean

  // Prospector defaults
  defaultNiche: string
  defaultLocation: string
  defaultMaxResults: string
  defaultMinScore: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  googleMapsApiKey: '',
  vapiApiKey: '',
  vapiPhoneNumberId: '',
  calendlyEventUrl: '',
  calendlyToken: '',
  agencyName: 'Genesee Marketing',
  callerName: 'Evan',
  callerTitle: 'Local SEO Specialist',
  callerEmail: 'evan@genesee.info',
  callerPhone: '',
  callGoal: 'book',
  noAnswerBehavior: 'voicemail',
  maxCallDurationSeconds: 600,
  delayBetweenCallsSeconds: 3,
  callModel: 'gpt-4o-mini',
  voiceProvider: 'vapi',
  voiceId: 'elliot',
  voiceSpeed: 1.1,
  voiceStability: 0.45,
  voiceSimilarityBoost: 0.75,
  voiceOptimizeLatency: 3,
  aiTemperature: 0.7,
  pitchFocus: 'google_maps',
  valueProposition: "We've helped local businesses just like yours go from page 3 to the top 3 on Google Maps — bringing in more calls and jobs without spending a dollar on ads.",
  offerLine: "I'd love to set up a quick 15-minute intro call with one of our SEO specialists. They'll walk through exactly what we found and what it would take to fix it.",
  retryDelayMinutes: 60,
  maxRetries: 3,
  alertEmail: '',
  resendApiKey: '',
  emailAlertsEnabled: true,
  crmWebhookUrl: '',
  crmPushOnBooked: true,
  defaultNiche: 'plumber',
  defaultLocation: 'Farmingdale, NY',
  defaultMaxResults: '40',
  defaultMinScore: '1',
}

export const SETTINGS_KEY = 'seo_prospector_settings_v1'

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { return DEFAULT_SETTINGS }
}

export function saveSettings(s: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid #f0f0ec', background: '#fafaf9' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#18181b' }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>{children}</div>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.4 }}>{hint}</div>}
    </div>
  )
}

const inp: React.CSSProperties = { fontSize: 13, fontFamily: 'inherit', color: '#18181b', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 11px', width: '100%', outline: 'none', transition: 'border-color .15s, box-shadow .15s' }
const selStyle: React.CSSProperties = { ...inp }
const textArea: React.CSSProperties = { ...inp, resize: 'vertical', minHeight: 72, lineHeight: 1.55 }

export default function SettingsTab() {
  const [s, setS] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})

  useEffect(() => { setS(loadSettings()) }, [])

  const set = (k: keyof AppSettings, v: string | number) => setS(prev => ({ ...prev, [k]: v }))

  const save = () => {
    saveSettings(s)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const toggleShow = (k: string) => setShowKeys(prev => ({ ...prev, [k]: !prev[k] }))

  const KeyField = ({ label, field, placeholder, hint }: { label: string; field: keyof AppSettings; placeholder: string; hint?: string }) => (
    <Field label={label} hint={hint}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type={showKeys[field as string] ? 'text' : 'password'}
          value={s[field] as string}
          onChange={e => set(field, e.target.value)}
          placeholder={placeholder}
          style={{ ...inp, flex: 1, fontFamily: s[field] ? 'monospace' : 'inherit', fontSize: s[field] ? 12 : 13 }}
        />
        <button
          onClick={() => toggleShow(field as string)}
          style={{ padding: '0 10px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 11, color: '#6b7280', fontFamily: 'inherit', flexShrink: 0 }}>
          {showKeys[field as string] ? 'Hide' : 'Show'}
        </button>
      </div>
    </Field>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#f6f6f4' }}>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 20px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Settings</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>All settings saved to your browser · never sent to any server</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {saved && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Saved</span>}
            <button onClick={save} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#18181b', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Save settings
            </button>
          </div>
        </div>

        {/* ── API Keys ── */}
        <Section title="API Keys" sub="Stored locally in your browser — never transmitted to any third party">
          <Row>
            <KeyField label="Google Maps API Key" field="googleMapsApiKey" placeholder="AIza..."
              hint="Enable Places API + Geocoding API at console.cloud.google.com" />
            <KeyField label="Vapi API Key" field="vapiApiKey" placeholder="vapi_..."
              hint="Get at app.vapi.ai → Dashboard → API Keys" />
          </Row>
          <Row>
            <KeyField label="Vapi Phone Number ID" field="vapiPhoneNumberId" placeholder="Phone Number ID from Vapi"
              hint="In Vapi: Phone Numbers → copy the ID (not the raw number)" />
            <KeyField label="Calendly Personal Access Token" field="calendlyToken" placeholder="Bearer token..."
              hint="calendly.com/integrations/api_webhooks → Personal Access Token" />
          </Row>
          <Field label="Calendly Event URL">
            <input value={s.calendlyEventUrl} onChange={e => set('calendlyEventUrl', e.target.value)}
              placeholder="https://calendly.com/evan/seo-audit" style={inp} />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>The specific event link prospects use to book. When both token + URL are set, the AI reads live available slots on the call.</div>
          </Field>
        </Section>

        {/* ── Agency Identity ── */}
        <Section title="Agency identity" sub="Used in the AI caller's script and voicemail">
          <Row>
            <Field label="Agency name">
              <input value={s.agencyName} onChange={e => set('agencyName', e.target.value)} style={inp} />
            </Field>
            <Field label="Caller name">
              <input value={s.callerName} onChange={e => set('callerName', e.target.value)} style={inp} />
            </Field>
          </Row>
          <Row>
            <Field label="Caller title" hint="Used in introductions — e.g. 'Local SEO Specialist'">
              <input value={s.callerTitle} onChange={e => set('callerTitle', e.target.value)} style={inp} />
            </Field>
            <Field label="Caller email" hint="Shared if prospect asks for more info">
              <input value={s.callerEmail} onChange={e => set('callerEmail', e.target.value)} placeholder="evan@genesee.info" style={inp} />
            </Field>
          </Row>
        </Section>

        {/* ── AI Pitch Settings ── */}
        <Section title="AI pitch & call script" sub="Controls exactly what the AI says to convince prospects to book">
          <Row>
            <Field label="Call goal">
              <select value={s.callGoal} onChange={e => set('callGoal', e.target.value)} style={selStyle}>
                <option value="book">Pitch + book a discovery call</option>
                <option value="qualify">Qualify first, then pitch</option>
                <option value="soft">Soft intro — offer free audit only</option>
              </select>
            </Field>
            <Field label="If no answer">
              <select value={s.noAnswerBehavior} onChange={e => set('noAnswerBehavior', e.target.value)} style={selStyle}>
                <option value="voicemail">Leave personalized voicemail</option>
                <option value="skip">Hang up — retry later</option>
              </select>
            </Field>
          </Row>

          <Field label="Pitch focus — what problems the AI leads with">
            <select value={s.pitchFocus} onChange={e => set('pitchFocus', e.target.value)} style={selStyle}>
              <option value="google_maps">Google Maps ranking (local pack)</option>
              <option value="reviews">Review count and rating gap</option>
              <option value="website">Website SEO issues</option>
              <option value="all">All detected issues — most specific</option>
            </select>
          </Field>

          <Field label="Your value proposition" hint="1–2 sentences. The AI uses this verbatim to explain why you can help.">
            <textarea value={s.valueProposition} onChange={e => set('valueProposition', e.target.value)} style={textArea} />
          </Field>

          <Field label="Offer line — what the AI asks them to do" hint="This is the ask at the end of the pitch. Keep it low-friction.">
            <textarea value={s.offerLine} onChange={e => set('offerLine', e.target.value)} style={textArea} />
          </Field>

          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '11px 14px', fontSize: 12, color: '#1d4ed8', lineHeight: 1.65 }}>
            <strong>How the AI uses this:</strong> When it reaches a prospect, it immediately references their specific problems found by the prospector (e.g. "I noticed you only have 8 reviews and your site isn't showing up on Google Maps for plumbers in Farmingdale"). Then it delivers your value proposition, then your offer line. The goal is always to book an intro call with your team — not to close on the spot.
          </div>
        </Section>

        {/* ── AI Voice Settings ── */}
        <Section title="AI voice & call behavior" sub="Voice, speed, quality — all adjustable. Changes take effect on the next call.">

          {/* Voice identity */}
          <Row>
            <Field label="Voice provider" hint="ElevenLabs (11labs) has the most natural voices for sales calls.">
              <select value={s.voiceProvider} onChange={e => set('voiceProvider', e.target.value)} style={selStyle}>
                <option value="vapi">Vapi (built-in) — recommended</option>
                  <option value="11labs">ElevenLabs (11labs)</option>
                <option value="openai">OpenAI</option>
                <option value="playht">PlayHT</option>
                <option value="azure">Azure</option>
              </select>
            </Field>
            <Field label="Voice ID" hint="Vapi voices: elliot · savannah · rohan · emma · clara · nico · kai · neil · ElevenLabs: paste voiceId from elevenlabs.io">
              <input value={s.voiceId} onChange={e => set('voiceId', e.target.value)}
                placeholder="elliot" style={inp} />
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                Current: {s.voiceId || 'none set'}{['elliot','savannah','rohan','emma','clara','nico','kai','neil'].includes(s.voiceId) ? ' (Vapi built-in)' : s.voiceProvider === '11labs' ? ' (ElevenLabs)' : ''}
              </div>
            </Field>
          </Row>

          {/* Speed & quality sliders */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Slider label="Voice speed" hint="1.0 = normal · 1.1–1.2 = natural fast · 0.9 = slow"
              min={0.7} max={1.4} step={0.05} value={s.voiceSpeed}
              onChange={v => set('voiceSpeed', v)}
              display={`${s.voiceSpeed}x`}
              markers={[{ v: 0.9, l: 'slow' }, { v: 1.0, l: 'normal' }, { v: 1.15, l: 'natural' }, { v: 1.3, l: 'fast' }]} />
            <Slider label="Stability" hint="Lower = more expressive/variable · Higher = more consistent"
              min={0.1} max={1.0} step={0.05} value={s.voiceStability}
              onChange={v => set('voiceStability', v)}
              display={`${s.voiceStability}`}
              markers={[{ v: 0.2, l: 'expressive' }, { v: 0.5, l: 'balanced' }, { v: 0.8, l: 'stable' }]} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Slider label="Similarity boost" hint="How closely to match the original voice character"
              min={0.1} max={1.0} step={0.05} value={s.voiceSimilarityBoost}
              onChange={v => set('voiceSimilarityBoost', v)}
              display={`${s.voiceSimilarityBoost}`}
              markers={[{ v: 0.3, l: 'loose' }, { v: 0.75, l: 'recommended' }, { v: 1.0, l: 'strict' }]} />
            <Field label="Latency optimization (0–4)" hint="Higher = lower audio delay but slightly lower quality. 3 is the sweet spot for phone calls.">
              <div style={{ display: 'flex', gap: 8 }}>
                {[0,1,2,3,4].map(n => (
                  <button key={n} onClick={() => set('voiceOptimizeLatency', n)}
                    style={{ flex: 1, padding: '8px 0', border: `1.5px solid ${s.voiceOptimizeLatency === n ? '#18181b' : '#e4e4e0'}`,
                      borderRadius: 7, background: s.voiceOptimizeLatency === n ? '#18181b' : '#fff',
                      color: s.voiceOptimizeLatency === n ? '#fff' : '#374151',
                      fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {n}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>0 = best quality · 4 = lowest latency</div>
            </Field>
          </div>

          {/* AI model and temp */}
          <Row>
            <Field label="Call AI model" hint="Brain of the call. GPT-4o Mini is fast and costs less.">
              <select value={s.callModel} onChange={e => set('callModel', e.target.value)} style={selStyle}>
                <option value="gpt-4o-mini">GPT-4o Mini — fast, recommended</option>
                <option value="gpt-4o">GPT-4o — smarter, costs more</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
              </select>
            </Field>
            <Slider label="AI temperature" hint="0 = consistent/robotic · 0.7 = natural · 1.0 = creative"
              min={0} max={1.0} step={0.1} value={s.aiTemperature}
              onChange={v => set('aiTemperature', v)}
              display={`${s.aiTemperature}`}
              markers={[{ v: 0.3, l: 'consistent' }, { v: 0.7, l: 'natural' }, { v: 1.0, l: 'creative' }]} />
          </Row>

          {/* Call timing */}
          <Row>
            <Field label="Max call duration (seconds)" hint="Auto-hangs up after this. 600 = 10 min.">
              <input type="number" value={s.maxCallDurationSeconds}
                onChange={e => set('maxCallDurationSeconds', parseInt(e.target.value))} min={60} max={1800} style={inp} />
            </Field>
            <Field label="Delay between calls (seconds)" hint="Pause between each call in a queue run.">
              <input type="number" value={s.delayBetweenCallsSeconds}
                onChange={e => set('delayBetweenCallsSeconds', parseInt(e.target.value))} min={1} max={60} style={inp} />
            </Field>
          </Row>

          <div style={{ background: '#fafaf9', border: '1px solid #f0f0ec', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: '#6b7280', lineHeight: 1.6 }}>
            <strong>Recommended for sales calls:</strong> Vapi Elliot voice (no 11labs needed) · or ElevenLabs Layla (oWAxZDx7w5VEj9dCyTzz) with Speed 1.1 · Stability 0.45 · Similarity 0.75 · Latency 3
          </div>
        </Section>

        {/* ── Retry & Automation ── */}
        <Section title="Retry & automation" sub="Automatically retry no-answer calls and schedule runs">
          <Row>
            <Field label="Retry delay (minutes)" hint="How long to wait before retrying a no-answer call">
              <input type="number" value={s.retryDelayMinutes} onChange={e => set('retryDelayMinutes', parseInt(e.target.value))} min={15} max={1440} style={inp} />
            </Field>
            <Field label="Max retries per lead" hint="Stop retrying after this many no-answer attempts">
              <input type="number" value={s.maxRetries} onChange={e => set('maxRetries', parseInt(e.target.value))} min={1} max={10} style={inp} />
            </Field>
          </Row>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '11px 14px', fontSize: 12, color: '#1d4ed8', lineHeight: 1.65 }}>
            <strong>How retries work:</strong> After a call run completes, click "Retry no-answers" in the AI Phone tab to requeue all no-answer and voicemail results. Leads are only retried up to the max you set here, then marked as exhausted.
          </div>
        </Section>

        {/* ── Email alerts ── */}
        <Section title="Booking alert emails" sub="Get an email every time a call is booked — includes prospect info, transcript, and recording link">
          <Field label="Enable booking alerts">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={s.emailAlertsEnabled} onChange={e => set('emailAlertsEnabled', e.target.checked as any)} style={{ accentColor: '#2563eb', cursor: 'pointer' }} />
              Send an email alert every time a call outcome is "Booked"
            </label>
          </Field>
          <Row>
            <Field label="Alert email address" hint="Where to send booking notifications">
              <input value={s.alertEmail} onChange={e => set('alertEmail', e.target.value)} placeholder="evan@genesee.info" style={inp} />
            </Field>
            <KeyField label="Resend API Key" field="resendApiKey" placeholder="re_..."
              hint="Free at resend.com — 3,000 emails/month. Create API key at resend.com/api-keys" />
          </Row>
          {s.emailAlertsEnabled && s.alertEmail && s.resendApiKey && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '11px 14px', fontSize: 12, color: '#166534', lineHeight: 1.65 }}>
              ✓ Alerts active — every booking sends to <strong>{s.alertEmail}</strong> with prospect info, call duration, SEO issues pitched, and transcript preview.
            </div>
          )}
          {s.emailAlertsEnabled && (!s.alertEmail || !s.resendApiKey) && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '11px 14px', fontSize: 12, color: '#92400e', lineHeight: 1.65 }}>
              ⚠ Enter your alert email and Resend API key above to enable alerts. Get a free Resend key at <a href="https://resend.com/api-keys" target="_blank" style={{ color: '#92400e' }}>resend.com/api-keys</a>.
            </div>
          )}
        </Section>

        {/* ── CRM / Webhook ── */}
        <Section title="CRM & webhook push" sub="Auto-send booked leads to your CRM or any webhook endpoint">
          <Field label="Webhook URL" hint="Paste your GHL, Zapier, Make, or custom endpoint. Called immediately when a call is marked Booked.">
            <input value={s.crmWebhookUrl} onChange={e => set('crmWebhookUrl', e.target.value)} placeholder="https://hooks.zapier.com/..." style={inp} />
          </Field>
          <Field label="Auto-push on booked">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={s.crmPushOnBooked} onChange={e => set('crmPushOnBooked', e.target.checked as any)} style={{ accentColor: '#2563eb', cursor: 'pointer' }} />
              Automatically push lead + call data to webhook when outcome is "Booked"
            </label>
          </Field>
          {s.crmWebhookUrl && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '11px 14px', fontSize: 12, color: '#166534', lineHeight: 1.65 }}>
              <strong>Payload sent on booking:</strong><br />
              <code style={{ fontSize: 11, fontFamily: 'monospace' }}>{"{ event: 'call.booked', lead: { name, phone, address, website, niche, score, signals }, call: { outcome, duration, recordingUrl, retryCount } }"}</code>
            </div>
          )}
        </Section>

        {/* ── Prospector Defaults ── */}
        <Section title="Prospector defaults"
 sub="Pre-fills the search form when you open the app">
          <Row>
            <Field label="Default niche">
              <select value={s.defaultNiche} onChange={e => set('defaultNiche', e.target.value)} style={selStyle}>
                {['plumber','roofer','hvac contractor','electrician','landscaper','dentist','orthodontist','chiropractor','med spa','personal injury lawyer'].map(n => (
                  <option key={n} value={n}>{n.charAt(0).toUpperCase()+n.slice(1)}</option>
                ))}
              </select>
            </Field>
            <Field label="Default location">
              <input value={s.defaultLocation} onChange={e => set('defaultLocation', e.target.value)} placeholder="Farmingdale, NY" style={inp} />
            </Field>
          </Row>
          <Row>
            <Field label="Default max results">
              <select value={s.defaultMaxResults} onChange={e => set('defaultMaxResults', e.target.value)} style={selStyle}>
                <option value="20">20</option>
                <option value="40">40</option>
                <option value="60">60</option>
                <option value="100">100</option>
                <option value="150">150</option>
                <option value="200">200</option>
              </select>
            </Field>
            <Field label="Default minimum score">
              <select value={s.defaultMinScore} onChange={e => set('defaultMinScore', e.target.value)} style={selStyle}>
                <option value="1">1+ (show all)</option><option value="3">3+ (balanced)</option>
                <option value="5">5+ (priority only)</option><option value="8">8+ (critical only)</option>
              </select>
            </Field>
          </Row>
        </Section>

        {/* Save again at bottom */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          {saved && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ All settings saved</span>}
          <button onClick={save} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#18181b', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Save settings
          </button>
        </div>
      </div>
    </div>
  )
}

function Slider({ label, hint, min, max, step, value, onChange, display, markers }: {
  label: string; hint?: string; min: number; max: number; step: number
  value: number; onChange: (v: number) => void; display: string
  markers?: { v: number; l: string }[]
}) {
  return (
    <Field label={label} hint={hint}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))} style={{ flex: 1, accentColor: '#18181b' }} />
        <span style={{ fontSize: 13, fontWeight: 700, minWidth: 38, textAlign: 'right', color: '#18181b' }}>{display}</span>
      </div>
      {markers && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          {markers.map(m => (
            <button key={m.v} onClick={() => onChange(m.v)}
              style={{ fontSize: 10, color: Math.abs(value - m.v) < 0.01 ? '#2563eb' : '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0 2px', fontWeight: Math.abs(value - m.v) < 0.01 ? 700 : 400 }}>
              {m.l}
            </button>
          ))}
        </div>
      )}
    </Field>
  )
}
