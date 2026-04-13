/* eslint-disable react/no-unescaped-entities */
'use client'
import { useState, useRef } from 'react'
import { useStore } from '@/lib/store'
import { SIGNALS } from '@/lib/types'
import { loadSettings } from '@/components/SettingsTab'
import type { Lead, WebAnalysis } from '@/lib/types'

declare global { interface Window { google: any; __gmapReady?: () => void } }

const NICHES = ['plumber','roofer','hvac contractor','electrician','landscaper','dentist','orthodontist','chiropractor','med spa','personal injury lawyer','custom']

const SIG_GROUPS = [
  { label: 'GMB profile signals',    color: '#ef4444', dotColor: '#ef4444', keys: ['fewReviews','lowRating','noWebsite','noPhone','noHours','fewPhotos'] },
  { label: 'Website quality signals', color: '#f59e0b', dotColor: '#f59e0b', keys: ['noSchema','noMeta','noMobile','noSSL','noCityMention','slowSite'] },
  { label: 'Competitive signals',     color: '#3b82f6', dotColor: '#3b82f6', keys: ['outrankedOnReviews','lowEngagement','chainDominates'] },
]

export default function ProspectorTab() {
  const { addLeads } = useStore()

  // Load defaults from settings
  const settings = loadSettings()
  const [niche, setNiche]       = useState(settings.defaultNiche || 'plumber')
  const [customNiche, setCustomNiche] = useState('')
  const [locations, setLocations] = useState<string[]>([settings.defaultLocation || 'Farmingdale, NY'])
  const [locInput, setLocInput] = useState('')
  const [maxR, setMaxR]         = useState(settings.defaultMaxResults || '40')
  const [minScore, setMinScore] = useState('1')
  const [currentLocIdx, setCurrentLocIdx] = useState(0)

  const [activeSigs, setActiveSigs] = useState<Set<string>>(new Set([
    'fewReviews','lowRating','noWebsite','noPhone','noHours','fewPhotos',
    'noSchema','noMeta','noMobile','noSSL','noCityMention','slowSite',
    'outrankedOnReviews','lowEngagement','chainDominates',
  ]))
  const [running, setRunning]   = useState(false)
  const [logLines, setLogLines] = useState<{cls:string,msg:string}[]>([])
  const [pct, setPct]           = useState(0)
  const [results, setResults]   = useState<Lead[]>([])
  const [filtered, setFiltered] = useState<Lead[]>([])
  const [filter, setFilter]     = useState('all')
  const [savedCount, setSavedCount] = useState(0)
  const logRef = useRef<HTMLDivElement>(null)
  const mapsReady = useRef(false)
  const svcRef = useRef<any>(null)
  const geoRef = useRef<any>(null)

  const actualNiche = niche === 'custom' ? customNiche : niche

  const toggleSig = (key: string) => {
    setActiveSigs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  const log = (cls: string, msg: string) => {
    setLogLines(prev => [...prev.slice(-30), { cls, msg }])
    setTimeout(() => logRef.current?.scrollTo(0, 99999), 50)
  }

  const loadMaps = (key: string): Promise<void> => new Promise((res, rej) => {
    mapsReady.current = false
    document.getElementById('gmap-sdk-pro')?.remove()
    window.__gmapReady = () => {
      mapsReady.current = true
      geoRef.current = new window.google.maps.Geocoder()
      svcRef.current = new window.google.maps.places.PlacesService(document.getElementById('gmap-div-pro')!)
      res()
    }
    const s = document.createElement('script')
    s.id = 'gmap-sdk-pro'; s.async = true
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=__gmapReady`
    s.onerror = () => rej(new Error('Failed to load Google Maps API. Check that Places API + Geocoding API are enabled.'))
    document.head.appendChild(s)
  })

  const geocode = (addr: string): Promise<any> => new Promise((res, rej) => {
    geoRef.current.geocode({ address: addr }, (r: any[], s: string) => {
      if (s === 'OK' && r.length) res(r[0].geometry.location)
      else rej(new Error(`Could not geocode "${addr}". Try "City, State" format.`))
    })
  })

  const nearbySearch = (latlng: any, keyword: string, max: number): Promise<any[]> => new Promise((res, rej) => {
    let all: any[] = []
    const doPage = (req: any) => {
      svcRef.current.nearbySearch(req, (results: any[], status: string, pag: any) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK) {
          all.push(...results)
          if (pag?.hasNextPage && all.length < max) setTimeout(() => pag.nextPage(), 2200)
          else res(all.slice(0, max))
        } else if (status === 'ZERO_RESULTS') res([])
        else rej(new Error(`Places API: ${status}. Make sure Places API is enabled.`))
      })
    }
    doPage({ location: latlng, radius: 25000, keyword })
  })

  const getDetails = (placeId: string): Promise<any> => new Promise(res => {
    svcRef.current.getDetails({
      placeId,
      fields: ['place_id','name','formatted_address','vicinity','formatted_phone_number','international_phone_number','website','url','rating','user_ratings_total','photos','opening_hours','business_status'],
    }, (place: any, status: string) => res(status === 'OK' ? place : null))
  })

  const analyzeWebsite = async (url: string, city: string): Promise<WebAnalysis> => {
    const fallback: WebAnalysis = { fetchOk: false, noSSL: !url.startsWith('https'), noSchema: null, noMeta: null, noMobile: null, noCityMention: null, slowSite: null }
    try {
      // Use our server-side API route — avoids CORS, rate limits, and unreliable proxies
      const resp = await Promise.race([
        fetch(`/api/analyze-website?url=${encodeURIComponent(url)}&city=${encodeURIComponent(city)}`),
        new Promise<never>((_, rj) => setTimeout(() => rj(new Error('timeout')), 12000))
      ])
      if (!(resp as Response).ok) return fallback
      return await (resp as Response).json()
    } catch {
      return fallback
    }
  }

  const scorePlace = (detail: any, all: any[], currentActiveSigs: Set<string>, webData?: WebAnalysis | null): Lead => {
    const sigs: string[] = []; let score = 0
    const add = (k: string) => {
      if (currentActiveSigs.has(k) && !sigs.includes(k)) {
        sigs.push(k)
        score += SIGNALS[k]?.pts || 0
      }
    }
    const reviews  = detail.user_ratings_total || 0
    const rating   = detail.rating || 0
    const photos   = (detail.photos || []).length
    const hasHours = !!(detail.opening_hours?.weekday_text?.length)
    const phone    = detail.formatted_phone_number || detail.international_phone_number || null
    const website  = detail.website || null

    // GMB signals — thresholds match signal labels
    if (reviews < 25)               add('fewReviews')   // "Under 25 reviews"
    if (rating > 0 && rating < 4.0) add('lowRating')    // "Rating below 4.0"
    if (!website)                   add('noWebsite')
    if (!phone)                     add('noPhone')
    if (!hasHours)                  add('noHours')
    if (photos < 5)                 add('fewPhotos')

    // Website signals (if web data available)
    if (webData?.noSSL)           add('noSSL')    // SSL check doesn't need fetchOk
    if (webData?.fetchOk) {
      if (webData.noSchema)       add('noSchema')
      if (webData.noMeta)         add('noMeta')
      if (webData.noMobile)       add('noMobile')
      if (webData.noCityMention)  add('noCityMention')
      if (webData.slowSite)       add('slowSite')
    }

    // Competitive signals
    const maxReviews = Math.max(...all.map(p => p.user_ratings_total || 0), 1)
    if (reviews > 0 && maxReviews / reviews >= 3)   add('outrankedOnReviews')  // 3x gap
    if (reviews < 20 && rating > 0 && rating < 4.3) add('lowEngagement')
    const chains = ['angi','homeadvisor','1-800','rooter','aspen dental','heartland','pacific dental','western dental','servpro']
    const top3Names = all.slice(0, 3).map(p => (p.name || '').toLowerCase())
    if (top3Names.some(n => chains.some(c => n.includes(c)))) add('chainDominates')

    return {
      id: `${detail.place_id}_${Date.now()}`,
      name: detail.name || 'Unknown',
      addr: detail.formatted_address || detail.vicinity || '',
      phone, website, rating, reviews, photos, hasHours,
      mapsUrl: detail.url || `https://www.google.com/maps/place/?q=place_id:${detail.place_id}`,
      placeId: detail.place_id, signals: sigs, score: Math.min(10, score),
      niche: actualNiche, status: 'new', savedAt: new Date().toISOString(),
      webData: webData || null,
    }
  }

  const run = async () => {
    const settings = loadSettings()
    const apiKey = settings.googleMapsApiKey
    if (!apiKey) {
      alert('No Google Maps API key found. Go to Settings and enter your key first.')
      return
    }
    if (!activeSigs.size) { alert('Toggle on at least one signal'); return }
    if (locations.length === 0) { alert('Add at least one location to search'); return }
    setRunning(true); setLogLines([]); setPct(0); setResults([]); setFiltered([]); setSavedCount(0)
    const allScored: Lead[] = []
    const seenPlaceIds = new Set<string>()
    try {
      mapsReady.current = false
      log('linfo', '→ Loading Google Maps SDK...')
      await loadMaps(apiKey)
      log('lok', '✓ Maps ready')

      for (let locIdx = 0; locIdx < locations.length; locIdx++) {
        const loc = locations[locIdx]
        setCurrentLocIdx(locIdx)
        const locPct = (locIdx / locations.length) * 100
        const locShare = 100 / locations.length

        log('linfo', `\n📍 Location ${locIdx + 1}/${locations.length}: ${loc}`)
        setPct(Math.round(locPct + locShare * 0.05))

        log('linfo', `→ Geocoding "${loc}"...`)
        const latlng = await geocode(loc)
        log('lok', '✓ Location found')
        setPct(Math.round(locPct + locShare * 0.1))

        log('linfo', `→ Searching for ${actualNiche}s...`)
        const places = await nearbySearch(latlng, actualNiche, parseInt(maxR))
        const newPlaces = places.filter(p => !seenPlaceIds.has(p.place_id))
        newPlaces.forEach(p => seenPlaceIds.add(p.place_id))
        log('lok', `✓ ${places.length} found, ${newPlaces.length} new (${places.length - newPlaces.length} duplicates skipped)`)
        setPct(Math.round(locPct + locShare * 0.2))
        const city = loc.split(',')[0].trim()
        const currentActiveSigs = new Set(Array.from(activeSigs))
        const webSigsOn = ['noSchema','noMeta','noMobile','noSSL','noCityMention','slowSite'].some(s => currentActiveSigs.has(s))

        for (let i = 0; i < newPlaces.length; i++) {
          const basic = newPlaces[i]
          const overallPct = Math.round(locPct + locShare * (0.2 + 0.75 * (i / Math.max(newPlaces.length, 1))))
          setPct(overallPct)
          log('linfo', `  → ${basic.name}`)
          const detail = await getDetails(basic.place_id)
          if (!detail) { log('lwarn', '  ⚠ Skipped'); continue }
          let webData: WebAnalysis | null = null
          if (detail.website) {
            if (webSigsOn) {
              webData = await analyzeWebsite(detail.website, city)
            } else {
              webData = { fetchOk: false, noSSL: !detail.website.startsWith('https'), noSchema: null, noMeta: null, noMobile: null, noCityMention: null, slowSite: null }
            }
          }
          const lead = scorePlace(detail, newPlaces, currentActiveSigs, webData)
          log('lok', `  ✓ ${lead.phone || 'no phone'} · score ${lead.score}/10 · ${lead.signals.length} signals`)
          if (lead.score >= parseInt(minScore)) allScored.push(lead)
        }
        log('lok', `✓ ${loc}: done`)
      } // end locations loop

      allScored.sort((a, b) => b.score - a.score || b.signals.length - a.signals.length)
      const deduped = allScored.filter((l, i, arr) => arr.findIndex(x => x.placeId === l.placeId) === i)
      addLeads(deduped)
      setSavedCount(deduped.length)
      setResults(deduped); setFiltered(deduped)
      log('lok', `✓ ${deduped.length} prospects across ${locations.length} location(s) · auto-saved`); setPct(100)
    } catch (e: any) { log('lerr', 'Error: ' + e.message) }
    finally { setRunning(false) }
  }

  const applyFilter = (f: string) => {
    setFilter(f)
    let r = [...results]
    if (f === 'crit') r = r.filter(p => p.score >= 8)
    else if (f === 'phone') r = r.filter(p => p.phone)
    else if (f === 'site') r = r.filter(p => p.website)
    else if (f === 'nosite') r = r.filter(p => !p.website)
    setFiltered(r)
  }

  const settings2 = loadSettings()
  const missingApiKey = !settings2.googleMapsApiKey

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '272px 1fr', flex: 1, overflow: 'hidden' }}>
      <div id="gmap-div-pro" style={{ width: 1, height: 1, position: 'absolute', top: -9999 }} />

      {/* Sidebar */}
      <aside style={{ background: '#fff', borderRight: '1px solid #e4e4e0', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #e4e4e0' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>SEO<span style={{ color: '#2563eb' }}>Prospector</span></div>
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>Finds businesses losing leads on Google · auto-saves all results</div>
        </div>

        {missingApiKey && (
          <div style={{ margin: '12px 14px 0', background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 8, padding: '9px 11px', fontSize: 11, color: '#991b1b', lineHeight: 1.5 }}>
            ⚠ No Google Maps API key. <a href="#" onClick={e => { e.preventDefault(); (window as any).__switchTab?.('settings') }} style={{ color: '#991b1b', fontWeight: 700 }}>Go to Settings →</a> to add your key.
          </div>
        )}

        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
          <Field label="Business type">
            <select value={niche} onChange={e => setNiche(e.target.value)} style={inputStyle}>
              {NICHES.map(n => <option key={n} value={n}>{n === 'custom' ? 'Custom...' : n.charAt(0).toUpperCase() + n.slice(1)}</option>)}
            </select>
            {niche === 'custom' && <input value={customNiche} onChange={e => setCustomNiche(e.target.value)} placeholder="Enter type" style={{ ...inputStyle, marginTop: 5 }} />}
          </Field>

          <Field label="Locations to scan">
            <div style={{ display: 'flex', gap: 5 }}>
              <input
                value={locInput}
                onChange={e => setLocInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && locInput.trim()) {
                    setLocations(prev => prev.includes(locInput.trim()) ? prev : [...prev, locInput.trim()])
                    setLocInput('')
                  }
                }}
                placeholder="City, State — press Enter to add"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => {
                  if (locInput.trim()) {
                    setLocations(prev => prev.includes(locInput.trim()) ? prev : [...prev, locInput.trim()])
                    setLocInput('')
                  }
                }}
                style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', color: '#374151', flexShrink: 0 }}>
                Add
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: locations.length > 0 ? 5 : 0 }}>
              {locations.map((l, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 99, padding: '2px 8px 2px 10px', fontSize: 11, color: '#1d4ed8', fontWeight: 500 }}>
                  {l}
                  <button onClick={() => setLocations(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93c5fd', fontSize: 13, lineHeight: 1, padding: '0 0 0 2px' }}>×</button>
                </div>
              ))}
            </div>
            {locations.length === 0 && <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 3 }}>Add at least one location</div>}
            {locations.length > 1 && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>Scanning {locations.length} locations · {parseInt(maxR) * locations.length} total max results</div>}
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Max results">
              <select value={maxR} onChange={e => setMaxR(e.target.value)} style={inputStyle}>
                  <option value="20">20</option>
                <option value="40">40</option>
                <option value="60">60</option>
                <option value="100">100</option>
                <option value="150">150</option>
                <option value="200">200</option>
              </select>
            </Field>
            <Field label="Min score (show all = 1+)">
              <select value={minScore} onChange={e => setMinScore(e.target.value)} style={inputStyle}>
                <option value="1">1+ (show all)</option>
                <option value="3">3+ (some issues)</option>
                <option value="5">5+ (priority only)</option>
                <option value="8">8+ (critical only)</option>
              </select>
            </Field>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #f0f0ec' }} />

          {SIG_GROUPS.map(({ label, color, keys }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.07em', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                {label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {keys.map(k => {
                  const on = activeSigs.has(k)
                  const sig = SIGNALS[k]
                  return (
                    <div key={k} onClick={() => toggleSig(k)} style={{ display: 'flex', alignItems: 'stretch', borderRadius: 7, border: `1.5px solid ${on ? color : '#e4e4e0'}`, overflow: 'hidden', cursor: 'pointer', background: on ? `${color}08` : '#fafaf9', transition: 'all .12s', userSelect: 'none' }}>
                      <div style={{ width: 30, minWidth: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: `1px solid ${on ? color + '44' : '#e4e4e0'}`, background: on ? `${color}20` : '#f4f4f2' }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${on ? color : '#d1d5db'}`, background: on ? color : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {on && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                      </div>
                      <div style={{ padding: '5px 8px', flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: on ? color : '#374151', lineHeight: 1.2 }}>{sig?.label}</div>
                        <div style={{ fontSize: 10, color: on ? `${color}99` : '#9ca3af', lineHeight: 1.2, marginTop: 1 }}>+{sig?.pts} pts</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <hr style={{ border: 'none', borderTop: '1px solid #f0f0ec' }} />

          <button onClick={run} disabled={running || missingApiKey} style={{ padding: 10, borderRadius: 8, border: 'none', background: '#18181b', color: '#fff', fontSize: 13, fontWeight: 600, cursor: running || missingApiKey ? 'not-allowed' : 'pointer', opacity: running || missingApiKey ? .4 : 1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            {running ? 'Scanning...' : 'Find & auto-save prospects'}
          </button>

          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 7, padding: '9px 11px', fontSize: 10, color: '#1d4ed8', lineHeight: 1.5 }}>
            API key is set in <strong>Settings</strong>. All results auto-save to Saved Leads.
          </div>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
        {(running || logLines.length > 0) && (
          <div style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 11, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{running ? 'Scanning...' : 'Complete'}</span>
              <div style={{ flex: 1, height: 3, background: '#e4e4e0', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#18181b', borderRadius: 99, width: pct + '%', transition: 'width .35s' }} />
              </div>
              <span style={{ fontSize: 10, color: '#9ca3af', minWidth: 26, textAlign: 'right' }}>{pct}%</span>
            </div>
            <div ref={logRef} style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 80, overflowY: 'auto' }}>
              {logLines.map((l, i) => <div key={i} style={{ color: l.cls === 'lok' ? '#16a34a' : l.cls === 'lwarn' ? '#d97706' : l.cls === 'lerr' ? '#dc2626' : '#2563eb' }}>{l.msg}</div>)}
            </div>
          </div>
        )}

        {results.length > 0 && (
          <>
            {savedCount > 0 && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#166534', fontWeight: 500 }}>
                ✓ {savedCount} prospects automatically saved to Saved Leads
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{results.length} prospects found</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{actualNiche}s · {locations.join(', ')} · sorted by opportunity score</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {[{ n: results.length, l: 'Total found', c: '#18181b' }, { n: results.filter(p => p.score >= 8).length, l: 'Critical (8–10)', c: '#dc2626' }, { n: results.filter(p => p.score >= 5 && p.score < 8).length, l: 'High (5–7)', c: '#d97706' }, { n: results.filter(p => p.phone).length, l: 'Have phone', c: '#16a34a' }].map(({ n, l, c }) => (
                <div key={l} style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: c, lineHeight: 1 }}>{n}</div>
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3 }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fff', border: '1px solid #e4e4e0', borderRadius: 10, padding: '9px 12px', flexWrap: 'wrap' }}>
              {[{ f: 'all', l: `All (${results.length})` }, { f: 'crit', l: `Critical (${results.filter(p => p.score >= 8).length})` }, { f: 'phone', l: `Has phone (${results.filter(p => p.phone).length})` }, { f: 'site', l: `Has website (${results.filter(p => p.website).length})` }, { f: 'nosite', l: `No website (${results.filter(p => !p.website).length})` }].map(({ f, l }) => (
                <button key={f} onClick={() => applyFilter(f)} style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: filter === f ? 700 : 500, border: '1px solid', borderColor: filter === f ? '#d1d5db' : '#e4e4e0', background: filter === f ? '#f4f4f2' : 'transparent', color: filter === f ? '#18181b' : '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map((p, i) => <ProspectCard key={p.placeId} p={p} niche={actualNiche} />)}
            </div>
          </>
        )}

        {results.length === 0 && !running && logLines.length === 0 && (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#f4f4f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#9ca3af" strokeWidth="1.5"><circle cx="7.5" cy="7.5" r="5.5" /><path d="M12 12l4 4" strokeLinecap="round" /></svg>
            </div>
            <div style={{ fontSize: 14, color: '#6b7280', fontWeight: 500, marginBottom: 5 }}>Ready to find prospects</div>
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
              {missingApiKey ? <>Add your Google Maps API key in <strong>Settings</strong> first.</> : <>Pick a niche, add locations, then click Find &amp; auto-save prospects.</>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ProspectCard({ p, niche }: { p: Lead; niche: string }) {
  const [showHook, setShowHook] = useState(false)
  const pri = p.score >= 8 ? '1' : p.score >= 5 ? '2' : '3'
  const sc  = p.score >= 8 ? '#dc2626' : p.score >= 5 ? '#d97706' : '#6b7280'
  const priColors: Record<string, { bg: string; color: string }> = { '1': { bg: '#fee2e2', color: '#991b1b' }, '2': { bg: '#fef3c7', color: '#78350f' }, '3': { bg: '#f4f4f2', color: '#6b7280' } }
  const sigC: Record<string, string> = { r: '#991b1b', a: '#78350f', b: '#1e3a8a' }
  const sigBg: Record<string, string> = { r: '#fee2e2', a: '#fef3c7', b: '#dbeafe' }
  const hook = buildHook(p, niche)

  return (
    <div style={{ background: '#fff', border: '1px solid #e4e4e0', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 9 }}>
        <div style={{ minWidth: 32, height: 32, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0, ...priColors[pri] }}>P{pri}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}><a href={p.mapsUrl} target="_blank" rel="noopener" style={{ color: '#18181b', textDecoration: 'none' }}>{p.name}</a></div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{p.addr}</div>
          <div style={{ display: 'flex', gap: 7, marginTop: 3, flexWrap: 'wrap' }}>
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
        {p.website && (() => { let h = p.website!; try { h = new URL(p.website!.startsWith('http') ? p.website! : 'https://' + p.website).hostname } catch (e) { } return <a href={p.website!.startsWith('http') ? p.website! : 'https://' + p.website} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f6f6f4', border: '1px solid #e4e4e0', borderRadius: 7, padding: '6px 10px', fontSize: 12, textDecoration: 'none', color: '#2563eb', fontWeight: 500, flex: 1, minWidth: 130 }}>🌐 {h}</a> })()}
        {!p.phone && !p.website && <span style={{ fontSize: 11, color: '#9ca3af', padding: '5px 0' }}>No contact info on Google profile</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 9 }}>
        {p.signals.map(s => { const sig = SIGNALS[s]; const c = sig?.color || 'r'; return <span key={s} style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 99, fontSize: 10, fontWeight: 600, background: sigBg[c], color: sigC[c] }}>{sig?.label || s}</span> })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, padding: '9px 10px', background: '#fafaf9', borderRadius: 8, border: '1px solid #f0f0ec', marginBottom: 9 }}>
        {[{ l: 'Reviews', v: p.reviews, c: p.reviews < 25 ? '#dc2626' : p.reviews < 50 ? '#d97706' : '#18181b' }, { l: 'Rating', v: p.rating > 0 ? p.rating.toFixed(1) : 'N/A', c: p.rating > 0 && p.rating < 4 ? '#dc2626' : p.rating > 0 && p.rating < 4.3 ? '#d97706' : '#18181b' }, { l: 'Photos', v: p.photos, c: p.photos < 5 ? '#d97706' : '#18181b' }, { l: 'Hours', v: p.hasHours ? 'Listed' : 'Missing', c: p.hasHours ? '#16a34a' : '#dc2626' }, { l: 'Phone', v: p.phone ? 'Yes' : 'No', c: p.phone ? '#16a34a' : '#dc2626' }, { l: 'Website', v: p.website ? 'Yes' : 'No', c: p.website ? '#16a34a' : '#dc2626' }].map(({ l, v, c }) => (
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', letterSpacing: '.07em', textTransform: 'uppercase' }}>{label}</div>{children}</div>
}

function buildHook(p: Lead, niche: string) {
  const city = p.addr.split(',')[0] || 'your area'
  const top = p.signals.slice(0, 2).map(s => SIGNALS[s]?.label?.toLowerCase() || s).join(' and ')
  const hs = [
    `Hi [Owner] — I found ${p.name} while searching for ${niche}s in ${city} and noticed ${top}. These are fixable issues costing you calls every week. I put together a free audit — worth a quick look?`,
    `Found ${p.name} on Google. With ${p.reviews} reviews${p.rating > 0 ? ` and a ${p.rating.toFixed(1)} star rating` : ''}, there's a real gap vs the top results in ${city}. I do free local SEO audits for ${niche}s — I'd love to share what I found.`,
    `Hi — ${p.name} isn't in the top 3 Google results for ${niche}s in ${city}. Main issues: ${p.signals.map(s => SIGNALS[s]?.label?.toLowerCase() || s).slice(0, 3).join(', ')}. All fixable. Free 15-min call — no pitch, just data.`,
  ]
  return hs[p.name.length % 3]
}

const inputStyle: React.CSSProperties = { fontSize: 13, fontFamily: 'inherit', color: '#18181b', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, padding: '7px 10px', width: '100%', outline: 'none' }
const btnSt: React.CSSProperties = { padding: '4px 11px', fontSize: 11, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontWeight: 500, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }
const btnDark: React.CSSProperties = { padding: '4px 11px', fontSize: 11, border: 'none', background: '#18181b', color: '#fff', fontWeight: 500, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }
