import { NextRequest, NextResponse } from 'next/server'

// ── Calendly ─────────────────────────────────────────────────────────────────
async function getCalendlyUser(token: string) {
  const r = await fetch('https://api.calendly.com/users/me', { headers: { Authorization: `Bearer ${token}` } })
  return (await r.json()).resource
}
async function getEventTypeUri(token: string, url: string): Promise<string | null> {
  try {
    const user = await getCalendlyUser(token)
    const slug = url.split('/').pop()
    const r = await fetch(
      `https://api.calendly.com/event_types?organization=${encodeURIComponent(user.current_organization)}&active=true&count=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    return (await r.json()).collection?.find((e: { scheduling_url: string; uri: string }) =>
      e.scheduling_url?.includes(slug || '')
    )?.uri || null
  } catch { return null }
}
async function getAvailableSlots(token: string, uri: string) {
  const start = new Date()
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
  const r = await fetch(
    `https://api.calendly.com/event_type_available_times?event_type=${encodeURIComponent(uri)}&start_time=${start.toISOString()}&end_time=${end.toISOString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return ((await r.json()).collection || []).slice(0, 3) as { start_time: string }[]
}
function formatSlots(slots: { start_time: string }[]) {
  return slots.map((s, i) => {
    const dt = new Date(s.start_time)
    return `${i + 1}) ${dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
  }).join('\n')
}

// ── Natural signal descriptions ───────────────────────────────────────────────
const SIGNAL_NATURAL: Record<string, string> = {
  fewReviews:         'only [COUNT] Google reviews',
  lowRating:          'a [RATING]-star rating on Google',
  noWebsite:          'no website linked on your Google listing',
  noPhone:            'no phone number on your Google listing',
  noHours:            'no business hours listed on Google',
  fewPhotos:          'only a handful of photos on your profile',
  noSchema:           'no structured data on your website',
  noMeta:             'missing meta descriptions on your site',
  noMobile:           'a website that is not mobile-friendly',
  noSSL:              'no HTTPS security on your website',
  noCityMention:      'your city name barely appears on your own website',
  slowSite:           'a slow-loading website',
  outrankedOnReviews: 'competitors with way more reviews than you',
  lowEngagement:      'low review count and a rating that could hurt you',
  chainDominates:     'national chains dominating your local results',
}
function naturalSigLabel(key: string, lead: { reviews?: number; rating?: number }): string {
  return (SIGNAL_NATURAL[key] || key)
    .replace('[COUNT]', String(lead?.reviews || ''))
    .replace('[RATING]', lead?.rating ? lead.rating.toFixed(1) : '')
}

// ── Build system prompt ───────────────────────────────────────────────────────
function buildSystemPrompt(c: {
  callerName: string; callerTitle: string; agencyName: string; callerEmail: string
  niche: string; city: string; bizName: string; reviews: number; rating: number
  sig1: string; sig2: string; allSigs: string[]
  callGoal: string; noAnswerBehavior: string
  valueProposition: string; offerLine: string
  bookingLink: string; slotsText: string; hasCalendly: boolean
  maxDurationSeconds: number
}): string {
  const reviewObs = c.reviews > 0
    ? c.reviews < 15 ? `you have only ${c.reviews} Google reviews`
      : c.reviews < 25 ? `you are sitting at ${c.reviews} Google reviews`
      : `you have ${c.reviews} reviews`
    : 'your review count is pretty thin'
  const ratingObs = c.rating > 0 && c.rating < 4.2 ? ` and a ${c.rating.toFixed(1)}-star average` : ''
  const specificFindings = `${reviewObs}${ratingObs}, plus ${c.sig2}`

  const bookingInstruction = c.hasCalendly && c.slotsText
    ? `When they agree to a call, say naturally: "Let me grab a couple of times that are open..." then read:\n${c.slotsText}\nAsk: "Any of those work?" When they pick one: "Perfect, I have got you down for [time], you will get a calendar invite shortly."`
    : c.bookingLink
    ? `When they agree, say: "I will text you a quick link right now, takes about 30 seconds to grab a time." Share: ${c.bookingLink}`
    : `When they agree, confirm a specific time and date with them directly.`

  const goalApproach = c.callGoal === 'book'
    ? `Your goal is to book a discovery call. Do not try to close a deal. Just get them curious and willing to spend 15 minutes with you.`
    : c.callGoal === 'qualify'
    ? `First ask if they are doing anything for their Google rankings, then pitch based on what they say.`
    : `Offer a completely free audit. Zero pressure.`

  const vmInstruction = c.noAnswerBehavior === 'voicemail'
    ? `If you reach voicemail, leave: "Hey, this is ${c.callerName} from ${c.agencyName}. I was looking at ${c.bizName} on Google and noticed ${c.sig1}, which is probably costing you a few calls a week. Give me a ring back or grab a time at ${c.bookingLink || 'our website'}. Talk soon."`
    : `If no answer, hang up politely. Do not leave a voicemail.`

  return `You are ${c.callerName}, a ${c.callerTitle} at ${c.agencyName}. You are making an outbound sales call to ${c.bizName}, a ${c.niche} in ${c.city}.

You sound like a real person, not a script reader. Natural pacing, you listen, you react. Reference specific things you actually found.

WHAT YOU FOUND ABOUT ${c.bizName.toUpperCase()}:
- ${c.sig1}
- ${c.sig2}
${c.allSigs.slice(2).map(s => `- ${s}`).join('\n')}

YOUR GOAL: ${goalApproach}

OPENING (never say "how are you today" or "is this a bad time"):
"Hi, is the owner or manager around?"
[Connected] Pause naturally, then:
"Hey, my name is ${c.callerName}, I will keep it real quick. I was just looking at ${c.niche}s in ${c.city} on Google and I came across ${c.bizName}. I found something on your listing I think you would want to know about. You got about 60 seconds?"

AFTER THEY SAY YES (lead with their pain, be specific, pause after):
"So what I found is that ${specificFindings}. For a ${c.niche} in ${c.city}, that is basically what keeps businesses off the first page when someone nearby is searching right now."
[Pause. Let it sit. Do not rush.]
"I have helped other ${c.niche}s fix exactly this and get into the top 3 on Google Maps within about 90 days. More calls, nothing extra on ads."
"${c.valueProposition}"

MICRO-COMMITMENT (before the big ask):
"Can I ask, do you actually know where ${c.bizName} shows up right now when someone in ${c.city} searches for a ${c.niche}?"
[They say no] "Yeah, that is really common. Would it help if I showed you exactly where you stand and what it would take to fix it?"

THE ASK:
"${c.offerLine}"
${bookingInstruction}

BOOKING CLOSE:
Never ask "do you want to book?" Instead: "Would earlier in the week or a bit later work better?"
Then give two specific options.

OBJECTIONS:
"Not interested" -> "Totally fair. Can I just ask, do you know how many people search for a ${c.niche} in ${c.city} every month?" [Still no] -> "No worries, can I send a quick email with what I found?"
"Already have someone" -> "Oh good, are they actively managing your Google Business Profile? I ask because I noticed ${c.sig1}."
"Call me back" -> "Sure, when exactly works? I want to have your audit ready." [Get a specific time]
"How much?" -> "The audit is completely free, no catch." [Back to booking]
"Email me" -> "Sure, best email?" [Get it] "What is your biggest challenge getting new customers right now?"

GRACEFUL EXIT (firm no after two attempts):
"I completely get it. I will send a quick summary of what I found anyway, just so you have it. Best email?"
Never burn the bridge.

VOICEMAIL: ${vmInstruction}

RULES:
- Sound human: "I was looking at your listing", "I noticed", not "I have identified"
- Pause after landing the problem, do not fill silence immediately  
- Keep total call under ${Math.round(c.maxDurationSeconds / 60)} minutes
- If they ask your email: ${c.callerEmail}`
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { lead, config } = body

    // Detailed validation with specific error messages for debugging
    const validationErrors: string[] = []
    if (!config?.vapiApiKey)    validationErrors.push('vapiApiKey is missing or empty')
    if (!config?.phoneNumberId) validationErrors.push('phoneNumberId is missing or empty (this should map from vapiPhoneNumberId in settings)')
    if (!lead?.phone)           validationErrors.push(`lead.phone is missing (lead: ${lead?.name || 'unknown'})`)

    if (validationErrors.length > 0) {
      console.error('Calls API validation failed:', validationErrors)
      console.error('Config received:', JSON.stringify({
        hasVapiKey: !!config?.vapiApiKey,
        vapiKeyPrefix: config?.vapiApiKey?.slice(0, 8) + '...',
        hasPhoneId: !!config?.phoneNumberId,
        phoneIdValue: config?.phoneNumberId,
        leadPhone: lead?.phone,
        leadName: lead?.name,
      }))
      return NextResponse.json({
        error: validationErrors[0],
        allErrors: validationErrors,
        debug: {
          hasVapiApiKey: !!config?.vapiApiKey,
          hasPhoneNumberId: !!config?.phoneNumberId,
          phoneNumberIdValue: config?.phoneNumberId || null,
          hasLeadPhone: !!lead?.phone,
          configKeys: config ? Object.keys(config) : [],
        }
      }, { status: 400 })
    }

    const {
      vapiApiKey, phoneNumberId,
      agencyName = 'our agency', callerName = 'the team',
      callerTitle = 'Local SEO Specialist', callerEmail = '',
      bookingLink = '', calendlyToken = '',
      callGoal = 'book', noAnswerBehavior = 'voicemail',
      valueProposition = "We have helped local businesses just like yours go from invisible on Google to showing up in the top 3 on Maps, bringing in more calls without spending a dollar on ads.",
      offerLine = "I would love to set up a quick 15-minute call so we can walk through exactly what I found and what it would take to fix it.",
      maxCallDurationSeconds = 600,
      voiceId = 'pNInz6obpgDQGcFmaJgB',
      aiTemperature = 0.7,
    } = config

    const niche   = lead.niche || 'business'
    const city    = (lead.addr || '').split(',')[0] || 'your area'
    const bizName = lead.name || 'your business'
    const reviews = lead.reviews || 0
    const rating  = lead.rating  || 0
    const sigs    = (lead.signals || []).map((k: string) => naturalSigLabel(k, { reviews, rating }))
    const sig1    = sigs[0] || 'low Google visibility'
    const sig2    = sigs[1] || 'an incomplete Google profile'

    // Fetch Calendly slots
    let slotsText = ''
    if (calendlyToken && bookingLink) {
      try {
        const etUri = await getEventTypeUri(calendlyToken, bookingLink)
        if (etUri) {
          const slots = await getAvailableSlots(calendlyToken, etUri)
          if (slots.length) slotsText = formatSlots(slots)
        }
      } catch { /* fall back to link */ }
    }

    const systemPrompt = buildSystemPrompt({
      callerName, callerTitle, agencyName, callerEmail,
      niche, city, bizName, reviews, rating,
      sig1, sig2, allSigs: sigs,
      callGoal, noAnswerBehavior, valueProposition, offerLine,
      bookingLink, slotsText, hasCalendly: !!(calendlyToken && bookingLink && slotsText),
      maxDurationSeconds: maxCallDurationSeconds,
    })

    console.log('Dispatching Vapi call:', {
      phoneNumberId,
      toNumber: lead.phone,
      bizName,
      vapiKeyPrefix: vapiApiKey.slice(0, 8) + '...',
    })

    const vapiBody = {
      phoneNumberId,
      customer: { number: lead.phone, name: bizName },
      assistantOverrides: {
        firstMessage: `Hi, is the owner or manager around?`,
        systemPrompt,
        model: { provider: 'anthropic', model: 'claude-haiku-4-5', temperature: aiTemperature },
        voice: { provider: '11labs', voiceId },
        recordingEnabled: true,
        transcriptPlan: { enabled: true },
        endCallFunctionEnabled: true,
        silenceTimeoutSeconds: 30,
        maxDurationSeconds: maxCallDurationSeconds,
      },
      metadata: { leadId: lead.id, leadName: bizName, niche, city, signals: lead.signals?.join(',') },
    }

    const resp = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vapiApiKey}` },
      body: JSON.stringify(vapiBody),
    })

    const data = await resp.json()

    if (!resp.ok) {
      console.error('Vapi API error:', resp.status, JSON.stringify(data))
      return NextResponse.json({
        error: data.message || `Vapi error ${resp.status}`,
        vapiError: data,
        hint: resp.status === 400
          ? 'Check that your phoneNumberId is the ID from Vapi dashboard (not the raw phone number), and that your API key is correct.'
          : resp.status === 401
          ? 'Vapi API key is invalid or expired.'
          : undefined
      }, { status: resp.status })
    }

    console.log('Vapi call dispatched successfully:', data.id, 'status:', data.status)
    return NextResponse.json({ callId: data.id, status: data.status, ...data })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Calls route exception:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ── GET — poll status ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const callId = req.nextUrl.searchParams.get('callId')
  const apiKey = req.nextUrl.searchParams.get('apiKey')
  if (!callId || !apiKey) return NextResponse.json({ error: 'Missing callId or apiKey params' }, { status: 400 })

  const resp = await fetch(`https://api.vapi.ai/call/${callId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const data = await resp.json()

  if (!resp.ok) {
    console.error('Vapi poll error:', resp.status, JSON.stringify(data))
  }

  return NextResponse.json(data)
}
