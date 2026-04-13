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
  voiceId: string
  aiTemperature: number

  // Pitch customization
  pitchFocus: string
  valueProposition: string
  offerLine: string

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
  voiceId: 'pNInz6obpgDQGcFmaJgB',
  aiTemperature: 0.7,
  pitchFocus: 'google_maps',
  valueProposition: "We've helped local businesses just like yours go from page 3 to the top 3 on Google Maps — bringing in more calls and jobs without spending a dollar on ads.",
  offerLine: "I'd love to set up a quick 15-minute intro call with one of our SEO specialists. They'll walk through exactly what we found and what it would take to fix it.",
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
        <Section title="AI voice & call behavior" sub="Technical settings for the Vapi call agent">
          <Row>
            <Field label="Max call duration (seconds)" hint="Calls auto-end after this. 600 = 10 min.">
              <input type="number" value={s.maxCallDurationSeconds} onChange={e => set('maxCallDurationSeconds', parseInt(e.target.value))} min={60} max={1800} style={inp} />
            </Field>
            <Field label="Delay between calls (seconds)" hint="Pause between each call in a queue run.">
              <input type="number" value={s.delayBetweenCallsSeconds} onChange={e => set('delayBetweenCallsSeconds', parseInt(e.target.value))} min={1} max={60} style={inp} />
            </Field>
          </Row>
          <Row>
            <Field label="AI voice (ElevenLabs voice ID)" hint="Default is 'Adam' (pNInz6obpgDQGcFmaJgB). Find more at elevenlabs.io.">
              <input value={s.voiceId} onChange={e => set('voiceId', e.target.value)} style={inp} />
            </Field>
            <Field label="AI temperature (0 = consistent, 1 = creative)" hint="0.7 is the sweet spot for natural, confident calls.">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="range" min={0} max={1} step={0.1} value={s.aiTemperature}
                  onChange={e => set('aiTemperature', parseFloat(e.target.value))} style={{ flex: 1 }} />
                <span style={{ fontSize: 13, fontWeight: 600, minWidth: 28, textAlign: 'right' }}>{s.aiTemperature}</span>
              </div>
            </Field>
          </Row>
        </Section>

        {/* ── Prospector Defaults ── */}
        <Section title="Prospector defaults" sub="Pre-fills the search form when you open the app">
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
                <option value="20">20</option><option value="40">40</option><option value="60">60</option>
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
