/* eslint-disable react/no-unescaped-entities */
'use client'
import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/lib/store'
import { SIGNALS } from '@/lib/types'
import { loadSettings } from '@/components/SettingsTab'
import { scanState, notifyScan } from '@/lib/globalState'
import { runScan, pauseScan, resumeScan, stopScan } from '@/lib/scanRunner'
import type { Lead } from '@/lib/types'

const NICHES = ['plumber','roofer','hvac contractor','electrician','landscaper','dentist','orthodontist','chiropractor','med spa','personal injury lawyer','custom']

const SIG_GROUPS = [
  { label: 'GMB profile signals',    color: '#ef4444', keys: ['fewReviews','lowRating','noWebsite','noPhone','noHours','fewPhotos'] },
  { label: 'Website quality signals', color: '#f59e0b', keys: ['noSchema','noMeta','noMobile','noSSL','noCityMention','slowSite'] },
  { label: 'Competitive signals',     color: '#3b82f6', keys: ['outrankedOnReviews','lowEngagement','chainDominates'] },
]

export default function ProspectorTab() {
  const { addLeads, upsertLead } = useStore()
  const settings = loadSettings()

  const [niche, setNiche]       = useState(settings.defaultNiche || 'plumber')
  const [customNiche, setCustomNiche] = useState('')
  const [locations, setLocations] = useState<string[]>([settings.defaultLocation || 'Farmingdale, NY'])
  const [locInput, setLocInput] = useState('')
  const [maxR, setMaxR]         = useState(settings.defaultMaxResults || '40')
  const [minScore, setMinScore] = useState('1')
  const [activeSigs, setActiveSigs] = useState<Set<string>>(new Set([
    'fewReviews','lowRating','noWebsite','noPhone','noHours','fewPhotos',
    'noSchema','noMeta','noMobile','noSSL','noCityMention','slowSite',
    'outrankedOnReviews','lowEngagement','chainDominates',
  ]))

  // Mirror global scan state into local state for re-renders
  const [scanStatus, setScanStatus] = useState(scanState.status)
  const [logLines, setLogLines]     = useState(scanState.log)
  const [pct, setPct]               = useState(scanState.pct)
  const [results, setResults]       = useState<Lead[]>(scanState.results)
  const [filter, setFilter]         = useState('all')
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Subscribe to global scan state changes
    const update = () => {
      setScanStatus(scanState.status)
      setLogLines([...scanState.log])
      setPct(scanState.pct)
      setResults([...scanState.results])
      setTimeout(() => logRef.current?.scrollTo(0, 99999), 50)
    }
    scanState.listeners.add(update)
    update() // sync on mount in case scan is already running
    return () => { scanState.listeners.delete(update) }
  }, [])

  const actualNiche = niche === 'custom' ? customNiche : niche
  const running = scanStatus === 'running'
  const paused  = scanStatus === 'paused'
  const busy    = running || paused

  const settings2 = loadSettings()
  const missingApiKey = !settings2.googleMapsApiKey

  const toggleSig = (key: string) => {
    if (busy) return
    setActiveSigs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  const addLocation = () => {
    const t = locInput.trim()
    if (t && !locations.includes(t)) setLocations(prev => [...prev, t])
    setLocInput('')
  }

  const startScan = () => {
    const s = loadSettings()
    if (!s.googleMapsApiKey) { alert('Add your Google Maps API key in Settings first.'); return }
    if (!activeSigs.size)    { alert('Toggle on at least one signal'); return }
    if (!locations.length)   { alert('Add at least one location'); return }

    const webSigsOn = ['noSchema','noMeta','noMobile','noSSL','noCityMention','slowSite'].some(k => activeSigs.has(k))

    runScan({
      apiKey: s.googleMapsApiKey,
      niche: actualNiche,
      locations,
      maxR: parseInt(maxR),
      minScore: parseInt(minScore),
      activeSigs: new Set(activeSigs),
      webSigsOn,
      onLeadFound: (lead) => {
        upsertLead(lead)
      },
    })
  }

  const filtered = results.filter(p => {
    if (filter === 'crit')   return p.score >= 8
    if (filter === 'phone')  return !!p.phone
    if (filter === 'site')   return !!p.website
    if (filter === 'nosite') return !p.website
    return true
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '272px 1fr', flex: 1, overflow: 'hidden' }}>
      {/* Hidden div for PlacesService */}
      <div id="gmap-div-runner" style={{ width: 1, height: 1, position: 'absolute', top: -9999 }} />

      {/* ── Sidebar ── */}
      <aside style={{ background: '#fff', borderRight: '1px solid #e4e4e0', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #e4e4e0' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>SEO<span style={{ color: '#2563eb' }}>Prospector</span></div>
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>Finds businesses losing leads on Google · runs in background</div>
        </div>

        {missingApiKey && (
          <div style={{ margin: '10px 14px 0', background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 11px', fontSize: 11, color: '#991b1b', lineHeight: 1.5 }}>
            ⚠ No Google Maps API key — add it in <strong>Settings</strong>
          </div>
        )}

        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>

          <Field label="Business type">
            <select value={niche} onChange={e => setNiche(e.target.value)} style={inp} disabled={busy}>
              {NICHES.map(n => <option key={n} value={n}>{n === 'custom' ? 'Custom...' : n.charAt(0).toUpperCase() + n.slice(1)}</option>)}
            </select>
            {niche === 'custom' && <input value={customNiche} onChange={e => setCustomNiche(e.target.value)} placeholder="Enter type" style={{ ...inp, marginTop: 5 }} disabled={busy} />}
          </Field>

          <Field label="Locations to scan">
            <div style={{ display: 'flex', gap: 5 }}>
              <input value={locInput} onChange={e => setLocInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLocation() } }}
                placeholder="City, State — press Enter"
                style={{ ...inp, flex: 1 }} disabled={busy} />
              <button onClick={addLocation} disabled={busy}
                style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', color: '#374151', flexShrink: 0 }}>
                Add
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: locations.length ? 5 : 0 }}>
              {locations.map((l, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 99, padding: '2px 8px 2px 10px', fontSize: 11, color: '#1d4ed8', fontWeight: 500 }}>
                  {l}
                  {!busy && <button onClick={() => setLocations(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93c5fd', fontSize: 13, lineHeight: 1, padding: '0 0 0 2px' }}>×</button>}
                </div>
              ))}
            </div>
            {locations.length === 0 && <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 3 }}>Add at least one location</div>}
            {locations.length > 1 && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
              {locations.length} locations · up to {parseInt(maxR) * locations.length} results
            </div>}
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Results / location">
              <select value={maxR} onChange={e => setMaxR(e.target.value)} style={inp} disabled={busy}>
                <option value="20">20</option>
                <option value="40">40</option>
                <option value="60">60</option>
                <option value="100">100</option>
                <option value="150">150</option>
                <option value="200">200</option>
              </select>
            </Field>
            <Field label="Min score">
              <select value={minScore} onChange={e => setMinScore(e.target.value)} style={inp} disabled={busy}>
                <option value="1">1+ (all)</option>
                <option value="3">3+</option>
                <option value="5">5+</option>
                <option value="8">8+</option>
              </select>
            </Field>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #f0f0ec' }} />

          {SIG_GROUPS.map(({ label, color, keys }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.07em', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />{label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {keys.map(k => {
                  const on = activeSigs.has(k)
                  const sig = SIGNALS[k]
                  return (
                    <div key={k} onClick={() => toggleSig(k)}
                      style={{ display: 'flex', alignItems: 'stretch', borderRadius: 7, border: `1.5px solid ${on ? color : '#e4e4e0'}`, overflow: 'hidden', cursor: busy ? 'default' : 'pointer', background: on ? `${color}08` : '#fafaf9', userSelect: 'none', opacity: busy ? .6 : 1 }}>
                      <div style={{ width: 30, minWidth: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: `1px solid ${on ? color + '44' : '#e4e4e0'}`, background: on ? `${color}20` : '#f4f4f2' }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${on ? color : '#d1d5db'}`, background: on ? color : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {on && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                      </div>
                      <div style={{ padding: '5px 8px', flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: on ? color : '#374151', lineHeight: 1.2 }}>{sig?.label}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af', lineHeight: 1.2, marginTop: 1 }}>+{sig?.pts} pts</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <hr style={{ border: 'none', borderTop: '1px solid #f0f0ec' }} />

          {/* Action buttons */}
          {!busy && (
            <button onClick={startScan} disabled={missingApiKey}
              style={{ padding: 10, borderRadius: 8, border: 'none', background: '#18181b', color: '#fff', fontSize: 13, fontWeight: 600, cursor: missingApiKey ? 'not-allowed' : 'pointer', opacity: missingApiKey ? .4 : 1, fontFamily: 'inherit', width: '100%' }}>
              Find &amp; auto-save prospects
            </button>
          )}

          {busy && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              {running && (
                <button onClick={pauseScan}
                  style={{ padding: '9px 0', borderRadius: 8, border: '1.5px solid #d97706', background: '#fffbeb', color: '#92400e', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ⏸ Pause
                </button>
              )}
              {paused && (
                <button onClick={resumeScan}
                  style={{ padding: '9px 0', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ▶ Resume
                </button>
              )}
              <button onClick={stopScan}
                style={{ padding: '9px 0', borderRadius: 8, border: '1.5px solid #fca5a5', background: '#fff5f5', color: '#991b1b', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                ⏹ Stop
              </button>
            </div>
          )}

          {busy && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 7, padding: '8px 11px', fontSize: 11, color: '#1d4ed8', lineHeight: 1.5 }}>
              {paused ? '⏸ Paused — switch tabs freely, scan will resume here' : '🔄 Running in background — switch tabs freely'}
            </div>
          )}

          {!busy && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 7, padding: '8px 11px', fontSize: 10, color: '#1d4ed8', lineHeight: 1.5 }}>
              API key is in <strong>Settings</strong>. All results auto-save to Saved Leads.
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>

        {/* Log / progress */}
        {(busy || logLines.length > 0) && (
          <div style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 11, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>
                {paused ? '⏸ Paused' : running ? `Scanning${scanState.currentBiz ? ` — ${scanState.currentBiz}` : '...'}` : pct === 100 ? 'Complete' : 'Stopped'}
              </span>
              <div style={{ flex: 1, height: 3, background: '#e4e4e0', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: paused ? '#d97706' : '#18181b', borderRadius: 99, width: pct + '%', transition: 'width .35s' }} />
              </div>
              <span style={{ fontSize: 10, color: '#9ca3af', minWidth: 26, textAlign: 'right' }}>{pct}%</span>
            </div>
            <div ref={logRef} style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 80, overflowY: 'auto' }}>
              {logLines.slice(-20).map((l, i) => <div key={i} style={{ color: l.cls === 'lok' ? '#16a34a' : l.cls === 'lwarn' ? '#d97706' : l.cls === 'lerr' ? '#dc2626' : '#2563eb' }}>{l.msg}</div>)}
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#166534', fontWeight: 500 }}>
              ✓ {results.length} prospect{results.length !== 1 ? 's' : ''} found & saved to Saved Leads
              {busy && <span style={{ color: '#16a34a', marginLeft: 6 }}>· still scanning...</span>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{results.length} prospects</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                  {actualNiche}s · {locations.join(', ')} · sorted by score
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {[
                { n: results.length,                                    l: 'Total found',   c: '#18181b' },
                { n: results.filter(p => p.score >= 8).length,         l: 'Critical (8+)', c: '#dc2626' },
                { n: results.filter(p => p.score >= 5 && p.score < 8).length, l: 'High (5–7)', c: '#d97706' },
                { n: results.filter(p => p.phone).length,              l: 'Have phone',    c: '#16a34a' },
              ].map(({ n, l, c }) => (
                <div key={l} style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: c, lineHeight: 1 }}>{n}</div>
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3 }}>{l}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {[
                { f: 'all',    l: `All (${results.length})` },
                { f: 'crit',   l: `Critical (${results.filter(p => p.score >= 8).length})` },
                { f: 'phone',  l: `Has phone (${results.filter(p => p.phone).length})` },
                { f: 'site',   l: `Website (${results.filter(p => p.website).length})` },
                { f: 'nosite', l: `No website (${results.filter(p => !p.website).length})` },
              ].map(({ f, l }) => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: filter === f ? 700 : 500, border: '1px solid', borderColor: filter === f ? '#d1d5db' : '#e4e4e0', background: filter === f ? '#f4f4f2' : 'transparent', color: filter === f ? '#18181b' : '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {l}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(p => <ProspectCard key={p.placeId} p={p} niche={actualNiche} />)}
            </div>
          </>
        )}

        {results.length === 0 && !busy && logLines.length === 0 && (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#f4f4f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#9ca3af" strokeWidth="1.5"><circle cx="7.5" cy="7.5" r="5.5" /><path d="M12 12l4 4" strokeLinecap="round" /></svg>
            </div>
            <div style={{ fontSize: 14, color: '#6b7280', fontWeight: 500, marginBottom: 5 }}>Ready to scan</div>
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
              {missingApiKey ? <>Add your Google Maps API key in <strong>Settings</strong> first.</> : <>Pick a niche, add locations, hit Find. Scan runs in the background — switch tabs freely.</>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Prospect card (unchanged) ─────────────────────────────────────────────────
function ProspectCard({ p, niche }: { p: Lead; niche: string }) {
  const [showHook, setShowHook] = useState(false)
  const pri = p.score >= 8 ? '1' : p.score >= 5 ? '2' : '3'
  const sc  = p.score >= 8 ? '#dc2626' : p.score >= 5 ? '#d97706' : '#6b7280'
  const priCol: Record<string, { bg: string; color: string }> = { '1': { bg: '#fee2e2', color: '#991b1b' }, '2': { bg: '#fef3c7', color: '#78350f' }, '3': { bg: '#f4f4f2', color: '#6b7280' } }
  const sigC: Record<string, string>  = { r: '#991b1b', a: '#78350f', b: '#1e3a8a' }
  const sigBg: Record<string, string> = { r: '#fee2e2', a: '#fef3c7', b: '#dbeafe' }
  const hook = buildHook(p, niche)

  return (
    <div style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 9 }}>
        <div style={{ minWidth: 32, height: 32, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0, ...priCol[pri] }}>P{pri}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            <a href={p.mapsUrl} target="_blank" rel="noopener" style={{ color: '#18181b', textDecoration: 'none' }}>{p.name}</a>
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{p.addr}</div>
          <div style={{ display: 'flex', gap: 7, marginTop: 3 }}>
            <a href={p.mapsUrl} target="_blank" rel="noopener" style={{ color: '#2563eb', fontSize: 10, fontWeight: 500, textDecoration: 'none' }}>Maps ↗</a>
            {p.website && <a href={p.website.startsWith('http') ? p.website : 'https://' + p.website} target="_blank" rel="noopener" style={{ color: '#2563eb', fontSize: 10, fontWeight: 500, textDecoration: 'none' }}>Website ↗</a>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: sc, lineHeight: 1 }}>{p.score}</div>
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1 }}>/ 10 score</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 7, marginBottom: 9, flexWrap: 'wrap' }}>
        {p.phone && <a href={`tel:${p.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f6f6f4', border: '1px solid #e4e4e0', borderRadius: 7, padding: '6px 10px', fontSize: 12, textDecoration: 'none', color: '#16a34a', fontWeight: 500, flex: 1, minWidth: 130 }}>📞 {p.phone}</a>}
        {p.website && (() => {
          let h = p.website!
          try { h = new URL(p.website!.startsWith('http') ? p.website! : 'https://' + p.website).hostname } catch { }
          return <a href={p.website!.startsWith('http') ? p.website! : 'https://' + p.website} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f6f6f4', border: '1px solid #e4e4e0', borderRadius: 7, padding: '6px 10px', fontSize: 12, textDecoration: 'none', color: '#2563eb', fontWeight: 500, flex: 1, minWidth: 130 }}>🌐 {h}</a>
        })()}
        {!p.phone && !p.website && <span style={{ fontSize: 11, color: '#9ca3af' }}>No contact info on Google</span>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 9 }}>
        {p.signals.map(s => { const sig = SIGNALS[s]; const c = sig?.color || 'r'; return <span key={s} style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 99, fontSize: 10, fontWeight: 600, background: sigBg[c], color: sigC[c] }}>{sig?.label || s}</span> })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, padding: '9px 10px', background: '#fafaf9', borderRadius: 8, border: '1px solid #f0f0ec', marginBottom: 9 }}>
        {[
          { l: 'Reviews', v: p.reviews, c: p.reviews < 25 ? '#dc2626' : p.reviews < 50 ? '#d97706' : '#18181b' },
          { l: 'Rating',  v: p.rating > 0 ? p.rating.toFixed(1) : 'N/A', c: p.rating > 0 && p.rating < 4 ? '#dc2626' : '#18181b' },
          { l: 'Photos',  v: p.photos, c: p.photos < 5 ? '#d97706' : '#18181b' },
          { l: 'Hours',   v: p.hasHours ? 'Listed' : 'Missing', c: p.hasHours ? '#16a34a' : '#dc2626' },
          { l: 'Phone',   v: p.phone ? 'Yes' : 'No', c: p.phone ? '#16a34a' : '#dc2626' },
          { l: 'Website', v: p.website ? 'Yes' : 'No', c: p.website ? '#16a34a' : '#dc2626' },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ fontSize: 10, color: '#9ca3af' }}>{l}<div style={{ fontSize: 13, fontWeight: 700, marginTop: 1, color: c }}>{v}</div></div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingTop: 9, borderTop: '1px solid #f0f0ec' }}>
        <span style={{ fontSize: 10, color: '#9ca3af', flex: 1 }}>Auto-saved ✓</span>
        <button onClick={() => setShowHook(!showHook)} style={btnSt}>{showHook ? 'Hide hook' : 'View hook'}</button>
        <button onClick={() => navigator.clipboard.writeText(hook)} style={btnDark}>Copy hook</button>
      </div>
      {showHook && <div style={{ background: '#f6f6f4', borderRadius: 7, padding: '9px 11px', fontSize: 11, color: '#6b7280', lineHeight: 1.7, marginTop: 8, borderLeft: '2px solid #e4e4e0', fontStyle: 'italic' }}>"{hook}"</div>}
    </div>
  )
}

function buildHook(p: Lead, niche: string) {
  const city = p.addr.split(',')[0] || 'your area'
  const top  = p.signals.slice(0, 2).map(s => SIGNALS[s]?.label?.toLowerCase() || s).join(' and ')
  const hs   = [
    `Hi — I came across ${p.name} while looking up ${niche}s in ${city} and noticed ${top}. Easy fixes that are probably costing you calls every week. Happy to send over a free audit if you're open to it?`,
    `Found ${p.name} on Google. ${p.reviews} review${p.reviews !== 1 ? 's' : ''}${p.rating > 0 ? ` and a ${p.rating.toFixed(1)} star rating` : ''} — there's a real gap between you and the top spots in ${city}. I do free audits for ${niche}s, no strings attached.`,
    `Hey — ${p.name} isn't coming up in the top 3 for ${niche}s in ${city}. Main culprits: ${p.signals.slice(0, 3).map(s => SIGNALS[s]?.label?.toLowerCase() || s).join(', ')}. All fixable. Free 15-min call — just data, no pitch.`,
  ]
  return hs[p.name.length % 3]
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', letterSpacing: '.07em', textTransform: 'uppercase' }}>{label}</div>{children}</div>
}

const inp: React.CSSProperties    = { fontSize: 13, fontFamily: 'inherit', color: '#18181b', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, padding: '7px 10px', width: '100%', outline: 'none' }
const btnSt: React.CSSProperties  = { padding: '4px 11px', fontSize: 11, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontWeight: 500, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }
const btnDark: React.CSSProperties = { padding: '4px 11px', fontSize: 11, border: 'none', background: '#18181b', color: '#fff', fontWeight: 500, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }
