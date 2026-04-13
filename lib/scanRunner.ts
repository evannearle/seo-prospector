// Background scan runner — lives outside React, survives tab switches

import { scanState, notifyScan } from './globalState'
import type { Lead, WebAnalysis } from './types'
import { SIGNALS } from './types'

let mapsReady = false
let placesSvc: any = null
let geocoder: any = null

declare global { interface Window { google: any; __gmapReady?: () => void } }

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function loadMaps(apiKey: string): Promise<void> {
  return new Promise((res, rej) => {
    if (mapsReady && window.google?.maps) { res(); return }
    mapsReady = false
    document.getElementById('gmap-sdk-runner')?.remove()
    window.__gmapReady = () => {
      mapsReady = true
      geocoder = new window.google.maps.Geocoder()
      placesSvc = new window.google.maps.places.PlacesService(
        document.getElementById('gmap-div-runner') || document.createElement('div')
      )
      res()
    }
    const s = document.createElement('script')
    s.id = 'gmap-sdk-runner'; s.async = true
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=__gmapReady`
    s.onerror = () => rej(new Error('Failed to load Google Maps API'))
    document.head.appendChild(s)
  })
}

function geocode(addr: string): Promise<any> {
  return new Promise((res, rej) => {
    geocoder.geocode({ address: addr }, (r: any[], s: string) => {
      if (s === 'OK' && r.length) res(r[0].geometry.location)
      else rej(new Error(`Could not geocode "${addr}"`))
    })
  })
}

function nearbySearch(latlng: any, keyword: string, max: number): Promise<any[]> {
  return new Promise((res, rej) => {
    let all: any[] = []
    const doPage = (req: any) => {
      placesSvc.nearbySearch(req, (results: any[], status: string, pag: any) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK) {
          all.push(...results)
          if (pag?.hasNextPage && all.length < max) setTimeout(() => pag.nextPage(), 2200)
          else res(all.slice(0, max))
        } else if (status === 'ZERO_RESULTS') res([])
        else rej(new Error(`Places API: ${status}`))
      })
    }
    doPage({ location: latlng, radius: 25000, keyword })
  })
}

function getDetails(placeId: string): Promise<any> {
  return new Promise(res => {
    placesSvc.getDetails({
      placeId,
      fields: ['place_id','name','formatted_address','vicinity','formatted_phone_number','international_phone_number','website','url','rating','user_ratings_total','photos','opening_hours']
    }, (place: any, status: string) => res(status === 'OK' ? place : null))
  })
}

async function analyzeWebsite(url: string, city: string): Promise<WebAnalysis> {
  const r: WebAnalysis = { fetchOk: false, noSSL: false, noSchema: null, noMeta: null, noMobile: null, noCityMention: null, slowSite: null }
  try {
    const full = url.startsWith('http') ? url : 'https://' + url
    r.noSSL = !full.startsWith('https')
    const t0 = Date.now()
    const resp = await Promise.race([
      fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(full)}&t=${t0}`, { cache: 'no-store' }),
      new Promise<never>((_, rj) => setTimeout(() => rj(new Error('timeout')), 8000))
    ])
    const elapsed = Date.now() - t0
    if (!(resp as Response).ok) return r
    const json = await (resp as Response).json()
    const html = (json.contents || '').toLowerCase()
    if (!html) return r
    r.fetchOk = true; r.slowSite = elapsed > 3500
    r.noSchema = !html.includes('application/ld+json') && !html.includes('schema.org')
    r.noMeta = !html.includes('name="description') && !html.includes("name='description")
    r.noMobile = !html.includes('viewport')
    r.noCityMention = !html.includes(city.toLowerCase())
  } catch { }
  return r
}

function scorePlace(detail: any, all: any[], activeSigs: Set<string>, webData: WebAnalysis | null, niche: string): Lead {
  const sigs: string[] = []; let score = 0
  const add = (k: string) => {
    if (activeSigs.has(k) && !sigs.includes(k)) { sigs.push(k); score += SIGNALS[k]?.pts || 0 }
  }
  const reviews = detail.user_ratings_total || 0
  const rating = detail.rating || 0
  const photos = (detail.photos || []).length
  const hasHours = !!(detail.opening_hours?.weekday_text?.length)
  const phone = detail.formatted_phone_number || detail.international_phone_number || null
  const website = detail.website || null

  if (reviews < 25)             add('fewReviews')
  if (rating > 0 && rating < 4) add('lowRating')
  if (!website)                  add('noWebsite')
  if (!phone)                    add('noPhone')
  if (!hasHours)                 add('noHours')
  if (photos < 5)                add('fewPhotos')

  if (webData?.fetchOk) {
    if (webData.noSchema)      add('noSchema')
    if (webData.noMeta)        add('noMeta')
    if (webData.noMobile)      add('noMobile')
    if (webData.noCityMention) add('noCityMention')
    if (webData.slowSite)      add('slowSite')
  }
  if (webData?.noSSL) add('noSSL')

  const maxReviews = Math.max(...all.map(p => p.user_ratings_total || 0), 1)
  if (reviews > 0 && maxReviews / reviews >= 3) add('outrankedOnReviews')
  if (reviews < 15 && rating > 0 && rating < 4.2) add('lowEngagement')
  const chains = ['angi','homeadvisor','1-800','rooter','aspen dental','heartland','pacific dental','western dental']
  if (all.slice(0,3).some((p: any) => chains.some(c => (p.name||'').toLowerCase().includes(c)))) add('chainDominates')

  return {
    id: `${detail.place_id}_${Date.now()}`,
    name: detail.name || 'Unknown',
    addr: detail.formatted_address || detail.vicinity || '',
    phone, website, rating, reviews, photos, hasHours,
    mapsUrl: detail.url || `https://www.google.com/maps/place/?q=place_id:${detail.place_id}`,
    placeId: detail.place_id, signals: sigs, score: Math.min(10, score),
    niche, status: 'new', savedAt: new Date().toISOString(), webData: webData || null,
  }
}

export async function runScan(params: {
  apiKey: string; niche: string; locations: string[]; maxR: number
  minScore: number; activeSigs: Set<string>; webSigsOn: boolean
  onLeadFound: (lead: Lead) => void
}) {
  const { apiKey, niche, locations, maxR, minScore, activeSigs, webSigsOn, onLeadFound } = params

  scanState.status = 'running'
  scanState.pauseRequested = false
  scanState.stopRequested = false
  scanState.log = []
  scanState.pct = 0
  scanState.results = []
  scanState.savedCount = 0
  notifyScan()

  const log = (cls: string, msg: string) => {
    scanState.log = [...scanState.log.slice(-60), { cls, msg }]
    notifyScan()
  }

  const seenIds = new Set<string>()

  try {
    log('linfo', '→ Loading Google Maps...')
    await loadMaps(apiKey)
    log('lok', '✓ Maps ready')

    for (let locIdx = 0; locIdx < locations.length; locIdx++) {
      if (scanState.stopRequested) break
      while (scanState.pauseRequested && !scanState.stopRequested) await sleep(300)
      if (scanState.stopRequested) break

      const loc = locations[locIdx]
      scanState.currentLocation = loc
      const locPct = (locIdx / locations.length) * 100
      const locShare = 100 / locations.length

      log('linfo', `\n📍 ${locIdx+1}/${locations.length}: ${loc}`)
      scanState.pct = Math.round(locPct + locShare * 0.05)
      notifyScan()

      const latlng = await geocode(loc)
      log('lok', `✓ Geocoded`)
      scanState.pct = Math.round(locPct + locShare * 0.1)
      notifyScan()

      const places = await nearbySearch(latlng, niche, maxR)
      const newPlaces = places.filter(p => !seenIds.has(p.place_id))
      newPlaces.forEach(p => seenIds.add(p.place_id))
      log('lok', `✓ ${newPlaces.length} new businesses`)
      scanState.pct = Math.round(locPct + locShare * 0.2)
      notifyScan()

      const city = loc.split(',')[0].trim()

      for (let i = 0; i < newPlaces.length; i++) {
        if (scanState.stopRequested) break
        while (scanState.pauseRequested && !scanState.stopRequested) await sleep(300)
        if (scanState.stopRequested) break

        const basic = newPlaces[i]
        scanState.currentBiz = basic.name
        scanState.pct = Math.round(locPct + locShare * (0.2 + 0.75 * (i / Math.max(newPlaces.length, 1))))
        notifyScan()

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

        const lead = scorePlace(detail, newPlaces, activeSigs, webData, niche)
        log('lok', `  ✓ score ${lead.score}/10 · ${lead.signals.length} signals`)

        if (lead.score >= minScore) {
          scanState.results = [...scanState.results, lead]
          scanState.savedCount++
          onLeadFound(lead)
          notifyScan()
        }
      }

      log('lok', `✓ ${loc} complete`)
    }

    scanState.pct = 100
    scanState.status = scanState.stopRequested ? 'idle' : 'done'
    log('lok', `✓ ${scanState.savedCount} prospects found & saved`)
  } catch (e: any) {
    log('lerr', 'Error: ' + e.message)
    scanState.status = 'idle'
  }
  notifyScan()
}

export function pauseScan()  { scanState.pauseRequested = true;  scanState.status = 'paused'; notifyScan() }
export function resumeScan() { scanState.pauseRequested = false; scanState.status = 'running'; notifyScan() }
export function stopScan()   { scanState.stopRequested = true; scanState.status = 'idle'; notifyScan() }
