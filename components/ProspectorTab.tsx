/* eslint-disable react/no-unescaped-entities */
'use client'
import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { SIGNALS } from '@/lib/types'
import type { Lead, WebAnalysis } from '@/lib/types'

declare global { interface Window { google: any; __gmapReady?: () => void } }

const NICHES = ['plumber','roofer','hvac contractor','electrician','landscaper','dentist','orthodontist','chiropractor','med spa','personal injury lawyer','custom']

const SIG_GROUPS = [
  { label: 'GMB profile signals', color: '#ef4444', keys: ['fewReviews','lowRating','noWebsite','noPhone','noHours','fewPhotos'] },
  { label: 'Website quality signals', color: '#f59e0b', keys: ['noSchema','noMeta','noMobile','noSSL','noCityMention','slowSite'] },
  { label: 'Competitive signals', color: '#3b82f6', keys: ['outrankedOnReviews','lowEngagement','chainDominates'] },
]

export default function ProspectorTab({ settings }: { settings?: import('@/components/SettingsTab').AppSettings | null }) {
  const { addLeads } = useStore()
  const [apiKey, setApiKey] = useState('')
  const [niche, setNiche] = useState('plumber')
  const [customNiche, setCustomNiche] = useState('')
  const [loc, setLoc] = useState('Farmingdale, NY')
  const [maxR, setMaxR] = useState('40')
  const [minScore, setMinScore] = useState('3')
  const [activeSigs, setActiveSigs] = useState<Set<string>>(new Set(['fewReviews','lowRating','noWebsite','noPhone','noHours','fewPhotos','noSchema','noMeta','noMobile','noSSL','noCityMention','slowSite','outrankedOnReviews','lowEngagement']))
  const [running, setRunning] = useState(false)
  const [logLines, setLogLines] = useState<{cls:string,msg:string}[]>([])
  const [pct, setPct] = useState(0)
  const [results, setResults] = useState<Lead[]>([])
  const [filtered, setFiltered] = useState<Lead[]>([])
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('score')
  const [savedCount, setSavedCount] = useState(0)
  const mapsReady = useRef(false)
  const svcRef = useRef<any>(null)
  const geoRef = useRef<any>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // Sync settings defaults on mount
  useEffect(() => {
    if (!settings) return
    if (settings.googleMapsApiKey) setApiKey(settings.googleMapsApiKey)
    if (settings.defaultNiche)     setNiche(settings.defaultNiche)
    if (settings.defaultLocation)  setLoc(settings.defaultLocation)
    if (settings.defaultMaxResults) setMaxR(settings.defaultMaxResults)
    if (settings.defaultMinScore)  setMinScore(settings.defaultMinScore)
  }, [settings])

  const actualNiche = niche === 'custom' ? customNiche : niche

  const toggleSig = (key: string) => {
    setActiveSigs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  const log = (cls: string, msg: string) => {
    setLogLines(prev => [...prev.slice(-30), {cls, msg}])
    setTimeout(() => logRef.current?.scrollTo(0, 99999), 50)
  }

  const loadMaps = (key: string): Promise<void> => new Promise((res, rej) => {
    mapsReady.current = false
    document.getElementById('gmap-sdk-pro')?.remove()
    window.__gmapReady = () => {
      mapsReady.current = true
      geoRef.current = new window.google.maps.Geocoder()
      const mapEl = document.getElementById('gmap-div-pro')!
      svcRef.current = new window.google.maps.places.PlacesService(mapEl)
      res()
    }
    const s = document.createElement('script')
    s.id = 'gmap-sdk-pro'; s.async = true
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=__gmapReady`
    s.onerror = () => rej(new Error('Failed to load Google Maps API'))
    document.head.appendChild(s)
  })

  const geocode = (addr: string): Promise<any> => new Promise((res, rej) => {
    geoRef.current.geocode({address: addr}, (r: any[], s: string) => {
      if (s === 'OK' && r.length) res(r[0].geometry.location)
      else rej(new Error(`Could not geocode "${addr}"`))
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
        else rej(new Error(`Places API: ${status}`))
      })
    }
    doPage({location: latlng, radius: 25000, keyword})
  })

  const getDetails = (placeId: string): Promise<any> => new Promise(res => {
    svcRef.current.getDetails({
      placeId,
      fields: ['place_id','name','formatted_address','vicinity','formatted_phone_number','international_phone_number','website','url','rating','user_ratings_total','photos','opening_hours','business_status'],
    }, (place: any, status: string) => res(status === 'OK' ? place : null))
  })

  const analyzeWebsite = async (url: string, city: string): Promise<WebAnalysis> => {
    const r: WebAnalysis = {fetchOk:false,noSSL:false,noSchema:null,noMeta:null,noMobile:null,noCityMention:null,slowSite:null}
    try {
      const full = url.startsWith('http') ? url : 'https://'+url
      r.noSSL = !full.startsWith('https')
      const t0 = Date.now()
      const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(full)}&t=${t0}`
      const resp = await Promise.race([fetch(proxy,{cache:'no-store'}), new Promise<never>((_,rj)=>setTimeout(()=>rj(new Error('timeout')),8000))])
      const elapsed = Date.now()-t0
      if (!resp.ok) return r
      const json = await (resp as Response).json()
      const html = (json.contents||'').toLowerCase()
      if (!html) return r
      r.fetchOk=true; r.slowSite=elapsed>3500
      r.noSchema=!html.includes('application/ld+json')&&!html.includes('schema.org')
      r.noMeta=!html.includes('name="description')&&!html.includes("name='description")
      r.noMobile=!html.includes('viewport')
      r.noCityMention=!html.includes(city.toLowerCase())
    } catch {}
    return r
  }

  const scorePlace = (detail: any, all: any[]): Lead => {
    const sigs: string[] = []; let score = 0
    const add = (k: string) => { if (activeSigs.has(k)) { sigs.push(k); score += SIGNALS[k]?.pts || 0 } }
    const reviews = detail.user_ratings_total||0, rating = detail.rating||0
    const photos = (detail.photos||[]).length, hasHours = !!(detail.opening_hours?.weekday_text?.length)
    const phone = detail.formatted_phone_number||detail.international_phone_number||null
    const website = detail.website||null
    if(reviews<25)add('fewReviews'); if(rating>0&&rating<4)add('lowRating')
    if(!website)add('noWebsite'); if(!phone)add('noPhone')
    if(!hasHours)add('noHours'); if(photos<5)add('fewPhotos')
    return {
      id: `${detail.place_id}_${Date.now()}`,
      name: detail.name||'Unknown', addr: detail.formatted_address||detail.vicinity||'',
      phone, website, rating, reviews, photos, hasHours,
      mapsUrl: detail.url||`https://www.google.com/maps/place/?q=place_id:${detail.place_id}`,
      placeId: detail.place_id, signals: sigs, score: Math.min(10,score),
      niche: actualNiche, status:'new', savedAt: new Date().toISOString(),
    }
  }

  const run = async () => {
    if (!apiKey) { alert('Enter your Google Maps API key'); return }
    if (!apiKey.startsWith('AIza')) { alert('Google API keys start with AIza'); return }
    if (!activeSigs.size) { alert('Toggle on at least one signal'); return }
    setRunning(true); setLogLines([]); setPct(0); setResults([]); setFiltered([]); setSavedCount(0)
    try {
      mapsReady.current = false
      log('linfo','→ Loading Google Maps SDK...')
      await loadMaps(apiKey)
      log('lok','✓ Maps ready'); setPct(10)
      log('linfo',`→ Geocoding "${loc}"...`)
      const latlng = await geocode(loc)
      log('lok','✓ Location found'); setPct(18)
      log('linfo',`→ Searching for ${actualNiche}s...`)
      const places = await nearbySearch(latlng, actualNiche, parseInt(maxR))
      if (!places.length) throw new Error('No results found')
      log('lok',`✓ ${places.length} businesses found`); setPct(25)
      const city = loc.split(',')[0].trim()
      const webSigs = ['noSchema','noMeta','noMobile','noSSL','noCityMention','slowSite'].some(s=>activeSigs.has(s))
      places.forEach(p=>p._reviews=p.user_ratings_total||0)
      const scored: Lead[] = []
      for (let i=0; i<places.length; i++) {
        const basic = places[i]
        setPct(25+Math.round((i/places.length)*65))
        log('linfo',`  → ${basic.name}`)
        const detail = await getDetails(basic.place_id)
        if (!detail) { log('lwarn','  ⚠ Skipped'); continue }
        let webData: WebAnalysis|null = null
        if (detail.website) {
          webData = webSigs ? await analyzeWebsite(detail.website, city) : {fetchOk:false,noSSL:!detail.website.startsWith('https'),noSchema:null,noMeta:null,noMobile:null,noCityMention:null,slowSite:null}
          // Apply website signals
          if (webData.fetchOk) {
            if (webData.noSchema&&activeSigs.has('noSchema')) { scored.push({...scorePlace(detail,places),signals:[...scorePlace(detail,places).signals,'noSchema']}); continue }
          }
        }
        const lead = { ...scorePlace(detail, places), webData }
        // Re-score with web signals
        if (webData?.fetchOk) {
          let extraScore = 0
          const extraSigs: string[] = []
          if (webData.noSchema&&activeSigs.has('noSchema')){extraSigs.push('noSchema');extraScore+=2}
          if (webData.noMeta&&activeSigs.has('noMeta')){extraSigs.push('noMeta');extraScore+=1}
          if (webData.noMobile&&activeSigs.has('noMobile')){extraSigs.push('noMobile');extraScore+=2}
          if (webData.noSSL&&activeSigs.has('noSSL')){extraSigs.push('noSSL');extraScore+=2}
          if (webData.noCityMention&&activeSigs.has('noCityMention')){extraSigs.push('noCityMention');extraScore+=1}
          if (webData.slowSite&&activeSigs.has('slowSite')){extraSigs.push('slowSite');extraScore+=1}
          lead.signals = [...new Set([...lead.signals,...extraSigs])]
          lead.score = Math.min(10, lead.score+extraScore)
        }
        log('lok',`  ✓ ${detail.formatted_phone_number||'no phone'} · score ${lead.score}/10`)
        if (lead.score >= parseInt(minScore)) scored.push(lead)
      }
      scored.sort((a,b)=>b.score-a.score||b.signals.length-a.signals.length)
      // AUTO-SAVE ALL
      addLeads(scored)
      setSavedCount(scored.length)
      setResults(scored); setFiltered(scored)
      log('lok',`✓ ${scored.length} prospects found & auto-saved`); setPct(100)
    } catch(e:any) { log('lerr','Error: '+e.message) }
    finally { setRunning(false) }
  }

  const applyFilter = (f: string) => {
    setFilter(f)
    let r = [...results]
    if (f==='crit') r=r.filter(p=>p.score>=8)
    else if (f==='phone') r=r.filter(p=>p.phone)
    else if (f==='site') r=r.filter(p=>p.website)
    else if (f==='nosite') r=r.filter(p=>!p.website)
    setFiltered(r)
  }

  return (
    <div style={{display:'grid',gridTemplateColumns:'284px 1fr',flex:1,overflow:'hidden'}}>
      <div id="gmap-div-pro" style={{width:1,height:1,position:'absolute',top:-9999}} />

      {/* Sidebar */}
      <aside style={{background:'#fff',borderRight:'1px solid #e4e4e0',overflowY:'auto',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'14px 16px 12px',borderBottom:'1px solid #e4e4e0'}}>
          <div style={{fontSize:14,fontWeight:700}}>SEO<span style={{color:'#2563eb'}}>Prospector</span></div>
          <div style={{fontSize:10,color:'#9ca3af',marginTop:1}}>Full GMB data · 15 intent signals · Auto-saves all results</div>
        </div>
        <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:11}}>
          <Field label="Google Maps API Key">
            <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="AIza..." style={inputStyle} />
            <div style={hintStyle}>Free at <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style={{color:'#2563eb'}}>Google Cloud Console</a>. Enable Places + Geocoding APIs.</div>
          </Field>

          <hr style={{border:'none',borderTop:'1px solid #f0f0ec'}} />

          <Field label="Business type">
            <select value={niche} onChange={e=>setNiche(e.target.value)} style={inputStyle}>
              {NICHES.map(n=><option key={n} value={n}>{n==='custom'?'Custom...':n.charAt(0).toUpperCase()+n.slice(1)}</option>)}
            </select>
            {niche==='custom'&&<input value={customNiche} onChange={e=>setCustomNiche(e.target.value)} placeholder="Enter type" style={{...inputStyle,marginTop:5}} />}
          </Field>

          <Field label="Location">
            <input value={loc} onChange={e=>setLoc(e.target.value)} placeholder="City, State" style={inputStyle} />
          </Field>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <Field label="Max results">
              <select value={maxR} onChange={e=>setMaxR(e.target.value)} style={inputStyle}>
                <option value="20">20</option><option value="40">40</option><option value="60">60</option>
              </select>
            </Field>
            <Field label="Min score">
              <select value={minScore} onChange={e=>setMinScore(e.target.value)} style={inputStyle}>
                <option value="1">1+</option><option value="3">3+</option><option value="5">5+</option><option value="8">8+</option>
              </select>
            </Field>
          </div>

          <hr style={{border:'none',borderTop:'1px solid #f0f0ec'}} />

          {SIG_GROUPS.map(({label,color,keys})=>(
            <div key={label}>
              <div style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.07em',display:'flex',alignItems:'center',gap:5,marginBottom:4}}>
                <span style={{width:6,height:6,borderRadius:'50%',background:color,flexShrink:0,display:'inline-block'}}/>
                {label}
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:3}}>
                {keys.map(k=>{
                  const on = activeSigs.has(k)
                  const sig = SIGNALS[k]
                  const borderCol = color
                  return (
                    <div key={k} onClick={()=>toggleSig(k)} style={{display:'flex',alignItems:'stretch',borderRadius:7,border:`1.5px solid ${on?borderCol:'#e4e4e0'}`,overflow:'hidden',cursor:'pointer',background:on?`${borderCol}08`:'#fafaf9',transition:'all .12s',userSelect:'none'}}>
                      <div style={{width:32,minWidth:32,display:'flex',alignItems:'center',justifyContent:'center',borderRight:`1px solid ${on?borderCol+'44':'#e4e4e0'}`,background:on?`${borderCol}22`:'#f4f4f2'}}>
                        <div style={{width:15,height:15,borderRadius:3,border:`1.5px solid ${on?borderCol:'#d1d5db'}`,background:on?borderCol:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}>
                          {on&&<svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2 2 4-4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                      </div>
                      <div style={{padding:'5px 8px',flex:1,minWidth:0}}>
                        <div style={{fontSize:11,fontWeight:600,color:on?borderCol:'#374151',lineHeight:1.2}}>{sig?.label}</div>
                        <div style={{fontSize:10,color:on?`${borderCol}99`:'#9ca3af',lineHeight:1.2,marginTop:1}}>+{sig?.pts} pts</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <hr style={{border:'none',borderTop:'1px solid #f0f0ec'}} />

          <button onClick={run} disabled={running} style={{...runBtnStyle,opacity:running?0.4:1,cursor:running?'not-allowed':'pointer'}}>
            {running ? 'Scanning...' : 'Find & auto-save prospects'}
          </button>

          <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:7,padding:'9px 11px',fontSize:10,color:'#1d4ed8',lineHeight:1.5}}>
            All found prospects are <strong>automatically saved</strong> to your Saved Leads tab. No manual clicking needed.
          </div>
        </div>
      </aside>

      {/* Main */}
      <div style={{flex:1,overflowY:'auto',padding:18,display:'flex',flexDirection:'column',gap:13}}>
        {/* Log */}
        {(running || logLines.length > 0) && (
          <div style={{background:'#fff',border:'1px solid #e4e4e0',borderRadius:11,padding:'12px 14px'}}>
            <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:6}}>
              <span style={{fontSize:12,fontWeight:600,flex:1}}>{running?'Scanning...':'Complete'}</span>
              <div style={{flex:1,height:3,background:'#e4e4e0',borderRadius:99,overflow:'hidden'}}>
                <div style={{height:'100%',background:'#18181b',borderRadius:99,width:pct+'%',transition:'width .35s'}}/>
              </div>
              <span style={{fontSize:10,color:'#9ca3af',minWidth:26,textAlign:'right'}}>{pct}%</span>
            </div>
            <div ref={logRef} style={{fontSize:11,color:'#6b7280',fontFamily:'monospace',display:'flex',flexDirection:'column',gap:1,maxHeight:80,overflowY:'auto'}}>
              {logLines.map((l,i)=>(
                <div key={i} style={{color:l.cls==='lok'?'#16a34a':l.cls==='lwarn'?'#d97706':l.cls==='lerr'?'#dc2626':'#2563eb'}}>{l.msg}</div>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <>
            {savedCount > 0 && (
              <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#166534',fontWeight:500}}>
                ✓ {savedCount} prospects automatically saved to Saved Leads tab
              </div>
            )}
            <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <div>
                <div style={{fontSize:15,fontWeight:700}}>{results.length} prospects found</div>
                <div style={{fontSize:11,color:'#9ca3af',marginTop:1}}>{actualNiche}s near {loc} · sorted by opportunity score</div>
              </div>
            </div>

            {/* Stats */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
              {[
                {n:results.length,l:'Total found',c:'#18181b'},
                {n:results.filter(p=>p.score>=8).length,l:'Critical (8–10)',c:'#dc2626'},
                {n:results.filter(p=>p.score>=5&&p.score<8).length,l:'High priority (5–7)',c:'#d97706'},
                {n:results.filter(p=>p.phone).length,l:'Have phone',c:'#16a34a'},
              ].map(({n,l,c})=>(
                <div key={l} style={{background:'#fff',border:'1px solid #e4e4e0',borderRadius:10,padding:'12px 14px'}}>
                  <div style={{fontSize:20,fontWeight:700,color:c,lineHeight:1}}>{n}</div>
                  <div style={{fontSize:10,color:'#6b7280',marginTop:3}}>{l}</div>
                </div>
              ))}
            </div>

            {/* Filter bar */}
            <div style={{display:'flex',alignItems:'center',gap:5,background:'#fff',border:'1px solid #e4e4e0',borderRadius:10,padding:'9px 12px',flexWrap:'wrap'}}>
              {[
                {f:'all',l:`All (${results.length})`},
                {f:'crit',l:`Critical (${results.filter(p=>p.score>=8).length})`},
                {f:'phone',l:`Has phone (${results.filter(p=>p.phone).length})`},
                {f:'site',l:`Has website (${results.filter(p=>p.website).length})`},
                {f:'nosite',l:`No website (${results.filter(p=>!p.website).length})`},
              ].map(({f,l})=>(
                <button key={f} onClick={()=>applyFilter(f)} style={{padding:'3px 9px',borderRadius:99,fontSize:11,fontWeight:filter===f?700:500,border:'1px solid',borderColor:filter===f?'#d1d5db':'#e4e4e0',background:filter===f?'#f4f4f2':'transparent',color:filter===f?'#18181b':'#6b7280',cursor:'pointer',fontFamily:'inherit'}}>
                  {l}
                </button>
              ))}
            </div>

            {/* Cards */}
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {filtered.map((p,i)=><ProspectCard key={p.placeId} p={p} niche={actualNiche} />)}
            </div>
          </>
        )}

        {results.length === 0 && !running && logLines.length === 0 && (
          <div style={{padding:'60px 20px',textAlign:'center',color:'#9ca3af'}}>
            <div style={{width:42,height:42,borderRadius:'50%',background:'#f4f4f2',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#9ca3af" strokeWidth="1.5"><circle cx="7.5" cy="7.5" r="5.5"/><path d="M12 12l4 4" strokeLinecap="round"/></svg>
            </div>
            <div style={{fontSize:14,color:'#6b7280',fontWeight:500,marginBottom:5}}>Ready to find prospects</div>
            <div style={{fontSize:12,lineHeight:1.5}}>Enter your API key, pick a niche + location,<br/>then click Find &amp; auto-save prospects.</div>
          </div>
        )}
      </div>
    </div>
  )
}

function ProspectCard({p, niche}: {p: Lead, niche: string}) {
  const [showHook, setShowHook] = useState(false)
  const pri = p.score>=8?'1':p.score>=5?'2':'3'
  const sc = p.score>=8?'#dc2626':p.score>=5?'#d97706':'#6b7280'
  const priColors: Record<string,{bg:string,color:string}> = {'1':{bg:'#fee2e2',color:'#991b1b'},'2':{bg:'#fef3c7',color:'#78350f'},'3':{bg:'#f4f4f2',color:'#6b7280'}}
  const sigColors: Record<string,string> = {r:'#991b1b',a:'#78350f',b:'#1e3a8a'}
  const sigBg: Record<string,string> = {r:'#fee2e2',a:'#fef3c7',b:'#dbeafe'}
  const hook = buildHook(p, niche)

  return (
    <div style={{background:'#fff',border:'1px solid #e4e4e0',borderRadius:12,padding:14}}>
      <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:9}}>
        <div style={{minWidth:32,height:32,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,flexShrink:0,...priColors[pri]}}>P{pri}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:700}}><a href={p.mapsUrl} target="_blank" rel="noopener" style={{color:'#18181b',textDecoration:'none'}}>{p.name}</a></div>
          <div style={{fontSize:11,color:'#9ca3af',marginTop:2}}>{p.addr}</div>
          <div style={{display:'flex',gap:7,marginTop:3,flexWrap:'wrap'}}>
            <a href={p.mapsUrl} target="_blank" rel="noopener" style={{color:'#2563eb',fontSize:10,fontWeight:500,textDecoration:'none'}}>Maps ↗</a>
            {p.website&&<a href={p.website.startsWith('http')?p.website:'https://'+p.website} target="_blank" rel="noopener" style={{color:'#2563eb',fontSize:10,fontWeight:500,textDecoration:'none'}}>Website ↗</a>}
          </div>
        </div>
        <div style={{textAlign:'right',flexShrink:0}}>
          <div style={{fontSize:20,fontWeight:700,color:sc,lineHeight:1}}>{p.score}</div>
          <div style={{fontSize:9,color:'#9ca3af',marginTop:1}}>/ 10 score</div>
        </div>
      </div>

      {/* Contact */}
      <div style={{display:'flex',gap:7,marginBottom:9,flexWrap:'wrap'}}>
        {p.phone&&<a href={`tel:${p.phone}`} style={{display:'flex',alignItems:'center',gap:6,background:'#f6f6f4',border:'1px solid #e4e4e0',borderRadius:7,padding:'6px 10px',fontSize:12,textDecoration:'none',color:'#16a34a',fontWeight:500,flex:1,minWidth:130}}><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2.5 2c0 6.5 3.5 9.5 9.5 9.5V9L9.5 8.5 9 10c-2.5-.7-4-3-4.5-5.5L6 4 4.5 2H2.5z" strokeLinecap="round"/></svg>{p.phone}</a>}
        {p.website&&(()=>{let h=p.website;try{h=new URL(p.website.startsWith('http')?p.website:'https://'+p.website).hostname}catch(e){}return<a href={p.website.startsWith('http')?p.website:'https://'+p.website} target="_blank" rel="noopener" style={{display:'flex',alignItems:'center',gap:6,background:'#f6f6f4',border:'1px solid #e4e4e0',borderRadius:7,padding:'6px 10px',fontSize:12,textDecoration:'none',color:'#2563eb',fontWeight:500,flex:1,minWidth:130}}><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6.5" cy="6.5" r="5"/><path d="M1.5 6.5h10M6.5 1.5c-1.5 2-2 3.5-2 5s.5 3 2 5" strokeLinecap="round"/></svg>{h}</a>})()}
        {!p.phone&&!p.website&&<span style={{fontSize:11,color:'#9ca3af',padding:'5px 0'}}>No contact info on Google profile</span>}
      </div>

      {/* Signal tags */}
      <div style={{display:'flex',flexWrap:'wrap',gap:3,marginBottom:9}}>
        {p.signals.map(s=>{const sig=SIGNALS[s];const c=sig?.color||'r';return<span key={s} style={{display:'inline-flex',alignItems:'center',padding:'2px 7px',borderRadius:99,fontSize:10,fontWeight:600,background:sigBg[c],color:sigColors[c]}}>{sig?.label||s}</span>})}
      </div>

      {/* Data grid */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:6,padding:'9px 10px',background:'#fafaf9',borderRadius:8,border:'1px solid #f0f0ec',marginBottom:9}}>
        {[
          {l:'Reviews',v:p.reviews,c:p.reviews<25?'#dc2626':p.reviews<50?'#d97706':'#18181b'},
          {l:'Rating',v:p.rating>0?p.rating.toFixed(1):'N/A',c:p.rating>0&&p.rating<4?'#dc2626':p.rating>0&&p.rating<4.3?'#d97706':'#18181b'},
          {l:'Photos',v:p.photos,c:p.photos<5?'#d97706':'#18181b'},
          {l:'Hours',v:p.hasHours?'Listed':'Missing',c:p.hasHours?'#16a34a':'#dc2626'},
          {l:'Phone',v:p.phone?'Yes':'No',c:p.phone?'#16a34a':'#dc2626'},
          {l:'Website',v:p.website?'Yes':'No',c:p.website?'#16a34a':'#dc2626'},
        ].map(({l,v,c})=>(
          <div key={l} style={{fontSize:10,color:'#9ca3af'}}>
            {l}<div style={{fontSize:13,fontWeight:700,marginTop:1,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',alignItems:'center',gap:7,paddingTop:9,borderTop:'1px solid #f0f0ec'}}>
        <span style={{fontSize:10,color:'#9ca3af',flex:1}}>Auto-saved ✓</span>
        <button onClick={()=>setShowHook(!showHook)} style={{...btnStyle}}>{showHook?'Hide hook':'View hook'}</button>
        <button onClick={()=>navigator.clipboard.writeText(hook)} style={{...btnDarkStyle}}>Copy hook</button>
      </div>
      {showHook&&<div style={{background:'#f6f6f4',borderRadius:7,padding:'9px 11px',fontSize:11,color:'#6b7280',lineHeight:1.7,marginTop:8,borderLeft:'2px solid #e4e4e0',fontStyle:'italic'}}>"{hook}"</div>}
    </div>
  )
}

function Field({label,children}: {label:string,children:React.ReactNode}) {
  return <div style={{display:'flex',flexDirection:'column',gap:4}}><div style={{fontSize:10,fontWeight:700,color:'#6b7280',letterSpacing:'.07em',textTransform:'uppercase'}}>{label}</div>{children}</div>
}

function buildHook(p: Lead, niche: string) {
  const city = p.addr.split(',')[0]||'your area'
  const top = p.signals.slice(0,2).map(s=>SIGNALS[s]?.label?.toLowerCase()||s).join(' and ')
  const hs = [
    `Hi [Owner] — I found ${p.name} while searching for ${niche}s in ${city} and noticed ${top}. These are fixable issues costing you calls every week. I put together a free audit — worth a quick look?`,
    `Found ${p.name} on Google. With ${p.reviews} reviews${p.rating>0?` and a ${p.rating.toFixed(1)} star rating`:''}, there's a clear gap vs the top results in ${city}. I specialize in local SEO for ${niche}s and do free audits — I'd love to share what I found.`,
    `Hi — ${p.name} isn't in the top 3 Google results for ${niche}s in ${city}. Main issues: ${p.signals.map(s=>SIGNALS[s]?.label?.toLowerCase()||s).slice(0,3).join(', ')}. All fixable. Free 15-min call — no pitch, just data.`,
  ]
  return hs[p.name.length%3]
}

const inputStyle: React.CSSProperties = {fontSize:13,fontFamily:'inherit',color:'#18181b',background:'#fff',border:'1px solid #d1d5db',borderRadius:7,padding:'7px 10px',width:'100%',outline:'none'}
const hintStyle: React.CSSProperties = {fontSize:10,color:'#9ca3af',marginTop:3,lineHeight:1.4}
const runBtnStyle: React.CSSProperties = {padding:10,borderRadius:8,border:'none',background:'#18181b',color:'#fff',fontSize:13,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:7,fontFamily:'inherit',width:'100%'}
const btnStyle: React.CSSProperties = {padding:'4px 11px',fontSize:11,border:'1px solid #d1d5db',background:'#fff',color:'#6b7280',fontWeight:500,borderRadius:7,cursor:'pointer',fontFamily:'inherit'}
const btnDarkStyle: React.CSSProperties = {padding:'4px 11px',fontSize:11,border:'none',background:'#18181b',color:'#fff',fontWeight:500,borderRadius:7,cursor:'pointer',fontFamily:'inherit'}
