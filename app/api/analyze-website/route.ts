import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url  = req.nextUrl.searchParams.get('url')
  const city = req.nextUrl.searchParams.get('city') || ''
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  const result = {
    fetchOk: false, noSSL: false,
    noSchema: null as boolean|null, noMeta: null as boolean|null,
    noMobile: null as boolean|null, noCityMention: null as boolean|null, slowSite: null as boolean|null,
  }

  try {
    const full = url.startsWith('http') ? url : 'https://' + url
    result.noSSL = !full.startsWith('https')
    const t0 = Date.now()
    const resp = await Promise.race([
      fetch(full, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAuditBot/1.0)', Accept: 'text/html' },
        redirect: 'follow',
      }),
      new Promise<never>((_, rj) => setTimeout(() => rj(new Error('timeout')), 10000))
    ])
    const elapsed = Date.now() - t0
    if (!(resp as Response).ok) return NextResponse.json(result)
    const html = (await (resp as Response).text()).toLowerCase()
    if (!html) return NextResponse.json(result)
    result.fetchOk    = true
    result.slowSite   = elapsed > 3500
    result.noSchema   = !html.includes('application/ld+json') && !html.includes('schema.org') && !html.includes('itemtype')
    result.noMeta     = !html.includes('name="description') && !html.includes("name='description")
    result.noMobile   = !html.includes('viewport')
    result.noCityMention = city ? !html.includes(city.toLowerCase()) : null
  } catch { /* fetchOk stays false */ }

  return NextResponse.json(result)
}
