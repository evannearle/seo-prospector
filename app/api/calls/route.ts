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
// Written as a real person would say them, not like a spec sheet

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
  noSSL:              'no HTTPS — your site shows not secure in Chrome',
  noCityMention:      'your city name barely appears on your own website',
  slowSite:           'a slow-loading website',
  outrankedOnReviews: 'competitors with way more reviews',
  lowEngagement:      'low review count and a rating that could hurt you',
  chainDominates:     'national chains taking up the top spots near you',
}

function naturalSigLabel(key: string, lead: { reviews?: number; rating?: number }): string {
  const base = SIGNAL_NATURAL[key] || key
  return base
    .replace('[COUNT]', String(lead?.reviews || ''))
    .replace('[RATING]', lead?.rating ? lead.rating.toFixed(1) : '')
}

// ── Build the AI system prompt ────────────────────────────────────────────────
function buildSystemPrompt(c: {
  callerName: string; callerTitle: string; agencyName: string; callerEmail: string
  niche: string; city: string; bizName: string
  reviews: number; rating: number
  sig1: string; sig2: string; allSigs: string[]
  callGoal: string; noAnswerBehavior: string
  valueProposition: string; offerLine: string
  bookingLink: string; slotsText: string; hasCalendly: boolean
  maxDurationSeconds: number; aiTemperature: number
}): string {

  // Build specific, natural-sounding observations about this business
  const reviewObs = c.reviews > 0
    ? c.reviews < 15
      ? `you've only got ${c.reviews} Google reviews`
      : c.reviews < 25
      ? `you're sitting at ${c.reviews} Google reviews`
      : `you've got ${c.reviews} reviews`
    : 'your review count is pretty thin'

  const ratingObs = c.rating > 0 && c.rating < 4.2
    ? ` and a ${c.rating.toFixed(1)}-star average`
    : ''

  const specificFindings = `${reviewObs}${ratingObs}, plus ${c.sig2}`

  // Booking instruction
  const bookingInstruction = c.hasCalendly && c.slotsText
    ? `When they agree to a call, say: "Let me grab a couple of times that are open..." then read out:
${c.slotsText}
Ask: "Any of those work?" When they pick one, confirm: "Perfect — I've got you down for [time], you'll get a calendar invite in a minute."`
    : c.bookingLink
    ? `When they agree, say: "I'll shoot you a link right now, takes about 30 seconds to grab a time." Share: ${c.bookingLink}`
    : `When they agree, arrange a time that works and confirm it clearly.`

  // Goal-specific approach
  const goalApproach =
    c.callGoal === 'book'
      ? `Your goal is to book a discovery call. Don't try to close a deal — just get them curious enough to want 15 minutes with you.`
      : c.callGoal === 'qualify'
      ? `Your goal is to qualify first — ask if they're doing anything for their Google rankings — then pitch based on what they say.`
      : `Your goal is to offer a free audit. Zero pressure. Success is them agreeing to receive it.`

  // No-answer
  const vmInstruction = c.noAnswerBehavior === 'voicemail'
    ? `If you reach voicemail, leave something like: "Hey, this is ${c.callerName} from ${c.agencyName} — I was looking at ${c.bizName} on Google and noticed ${c.sig1}, which is probably costing you a few calls a week. Give me a ring back, or grab a time at ${c.bookingLink || 'our site'}. Talk soon."`
    : `If no answer, hang up. Don't leave a voicemail.`

  return `You are ${c.callerName}, a ${c.callerTitle} at ${c.agencyName}. You're making an outbound call to ${c.bizName}, a ${c.niche} in ${c.city}.

You sound like a real person — not a script reader. You talk the way actual salespeople talk: natural pacing, some filler words, you pause, you listen, you react to what they say. You reference specific things you actually found about their business, not generic talking points.

━━━ WHAT YOU FOUND ━━━
You specifically looked up ${c.bizName} before calling and found:
- ${c.sig1}
- ${c.sig2}
${c.allSigs.slice(2).map(s => `- ${s}`).join('\n')}

Reference these naturally — "So I was looking at your listing and noticed..." not "I have identified the following issues."

━━━ YOUR GOAL ━━━
${goalApproach}

━━━ HOW TO OPEN ━━━
Never start with "How are you today?" or "Is this a bad time?" — both immediately signal telemarketer.

Instead:
"Hi, is the owner or manager around?"
[Connected] — take a breath, then:
"Hey — so my name's ${c.callerName}, I'll keep it real quick. I was actually just looking at ${c.niche}s in ${c.city} on Google and I came across ${c.bizName}. I found something on your listing I think you'd genuinely want to know about. You got like 60 seconds?"

━━━ AFTER THEY SAY YES ━━━
Lead with their pain, not your features. Be specific. Pause after you say it.

"So what I found is — ${specificFindings}. For a ${c.niche} in ${c.city}, that's basically what's keeping you off the first page when someone nearby searches right now."

[Pause. Let it land. Don't rush to fill the silence.]

"I've helped other ${c.niche}s fix this — usually within about 90 days they're showing up in the top 3 on Maps, more calls coming in, nothing extra on ads."

Then deliver your value prop naturally:
"${c.valueProposition}"

━━━ GET A SMALL YES FIRST ━━━
Before making your ask, get them nodding:
"Can I ask — do you actually know where ${c.bizName} shows up right now when someone in ${c.city} searches for a ${c.niche}?"
[They say no] → "Yeah, that's super common. Would it be helpful if I showed you exactly where you're at and what it'd take to fix it?"

━━━ THE ASK ━━━
"${c.offerLine}"

${bookingInstruction}

━━━ BOOKING CLOSE ━━━
Never ask "Do you want to book?" — that's a yes/no door.
Instead: "Would earlier in the week or a bit later work better for you?"
Then offer specific times. Two options max.

━━━ OBJECTIONS — sound human, not scripted ━━━

"Not interested" →
"Yeah, totally fair. Can I just ask — do you know how many people are searching for a ${c.niche} in ${c.city} every month? It's actually pretty high." [Still no] → "No worries — can I send you a quick email with what I found? Just so you've got it."

"We already have someone" →
"Oh nice — are they actively managing your Google Business Profile? I ask because I noticed ${c.sig1}, and that's usually something that gets caught." [Pause] → "Might be worth a second look just to make sure nothing's slipping through."

"Call me back later" →
"Sure — when exactly works? I want to have your full audit ready." [Get a specific time, don't accept vague.]

"How much does it cost?" →
"The audit's free — no catch. If after seeing it you want to talk about working together, great, but that's totally up to you." [Back to booking.]

"Just email me" →
"Absolutely — best email?" [Get it.] "Perfect. And so I can make it specific — what's the biggest pain right now around getting new customers?" [Qualify while you have them.]

"Not a priority right now" →
"I get that. Is that more of a timing thing or a budget thing?" [Diagnose the real objection.]

━━━ GRACEFUL EXIT ━━━
After two genuine attempts if they're a firm no:
"I completely get it. I'm going to shoot you a quick summary of what I found anyway — just so you've got it when the timing makes sense. Best email?"
[Get email if possible.] "Thanks for picking up — good luck with everything."

Never burn the bridge.

━━━ VOICEMAIL ━━━
${vmInstruction}

━━━ RULES ━━━
- Sound like a person, not a robot reading a script
- Use natural language: "I was looking at your listing", "I noticed", "I found", "you've got"
- Don't say "I have identified", "I have determined", "As per my research"
- Pause after landing problems — silence means they're thinking
- If they go off topic, go with it briefly, then bring it back
- If they ask your email: ${c.callerEmail}
- Max call: ${Math.round(c.maxDurationSeconds / 60)} minutes`
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { lead, config } = await req.json()
    const {
      vapiApiKey, phoneNumberId,
      agencyName = 'our agency',
      callerName = 'the team',
      callerTitle = 'Local SEO Specialist',
      callerEmail = '',
      bookingLink = '',
      calendlyToken = '',
      callGoal = 'book',
      noAnswerBehavior = 'voicemail',
      valueProposition = "We've helped local businesses just like yours go from invisible on Google to showing up in the top 3 on Maps — more calls coming in without touching the ad budget.",
      offerLine = "I'd love to set up a quick 15-minute call so we can walk through exactly what I found and what it would take to fix it.",
      maxCallDurationSeconds = 600,
      voiceId = 'pNInz6obpgDQGcFmaJgB',
      aiTemperature = 0.7,
    } = config

    if (!vapiApiKey)    return NextResponse.json({ error: 'Missing Vapi API key' }, { status: 400 })
    if (!phoneNumberId) return NextResponse.json({ error: 'Missing phone number ID' }, { status: 400 })
    if (!lead?.phone)   return NextResponse.json({ error: 'Lead has no phone number' }, { status: 400 })

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
      maxDurationSeconds: maxCallDurationSeconds, aiTemperature,
    })

    const body = {
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
      metadata: { leadId: lead.id, leadName: bizName, niche, city, signals: lead.signals?.join(','), availableSlots: slotsText || 'none' },
    }

    const resp = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vapiApiKey}` },
      body: JSON.stringify(body),
    })
    const data = await resp.json()
    if (!resp.ok) return NextResponse.json({ error: data.message || 'Vapi error', details: data }, { status: resp.status })

    return NextResponse.json({ callId: data.id, status: data.status, availableSlots: slotsText, ...data })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

// ── GET — poll status ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const callId = req.nextUrl.searchParams.get('callId')
  const apiKey = req.nextUrl.searchParams.get('apiKey')
  if (!callId || !apiKey) return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  const resp = await fetch(`https://api.vapi.ai/call/${callId}`, { headers: { Authorization: `Bearer ${apiKey}` } })
  return NextResponse.json(await resp.json())
}
