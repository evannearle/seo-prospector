import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { lead, config } = await req.json()

    const {
      vapiApiKey, phoneNumberId, agencyName, callerName,
      bookingLink, callGoal, noAnswerBehavior,
    } = config

    if (!vapiApiKey) return NextResponse.json({ error: 'Missing Vapi API key' }, { status: 400 })
    if (!phoneNumberId) return NextResponse.json({ error: 'Missing phone number ID' }, { status: 400 })
    if (!lead.phone) return NextResponse.json({ error: 'Lead has no phone number' }, { status: 400 })

    const niche = lead.niche || 'business'
    const city = (lead.addr || '').split(',')[0] || 'your area'
    const sig1 = lead.signals?.[0] ? signalLabel(lead.signals[0]) : 'low Google visibility'
    const sig2 = lead.signals?.[1] ? signalLabel(lead.signals[1]) : 'incomplete profile'

    const goalInstruction =
      callGoal === 'book'
        ? `Your primary goal is to book a discovery call. If they're interested, share this link: ${bookingLink || 'your calendar link'}.`
        : callGoal === 'qualify'
        ? `First ask if they're currently doing anything to improve their Google rankings. Based on their answer, pivot to explaining what you found and offer a free audit.`
        : `Offer a completely free, no-obligation audit of their Google presence. Be very low pressure.`

    const vmInstruction =
      noAnswerBehavior === 'voicemail'
        ? `If you reach voicemail, leave a brief message: "Hi, this is ${callerName} from ${agencyName}. I was researching ${niche}s in ${city} and found ${lead.name}. I noticed ${sig1} which is likely costing you calls. I'll try you again — or you can reach us anytime. Thanks!"`
        : `If you reach voicemail, hang up politely after the greeting.`

    const body = {
      phoneNumberId,
      customer: { number: lead.phone, name: lead.name },
      assistantOverrides: {
        firstMessage: `Hi, may I please speak with the owner or manager of ${lead.name}?`,
        systemPrompt: `You are ${callerName}, a friendly local SEO specialist at ${agencyName}. You are calling ${lead.name}, a ${niche} business in ${city}.

Their Google profile has these specific problems you found: "${sig1}" and "${sig2}". These are real issues hurting their ranking — you are not making this up.

${goalInstruction}

Key talking points:
- You found their business while researching ${niche}s in ${city}
- You specifically noticed ${sig1} and ${sig2}
- You've helped similar businesses get into Google's top 3
- The audit is completely free, no strings attached
- Keep it under 3 minutes if possible

${vmInstruction}

Tone: conversational, confident, specific, never pushy. If they say no, thank them graciously and hang up.`,
        model: {
          provider: 'anthropic',
          model: 'claude-haiku-4-5',
          temperature: 0.7,
        },
        voice: {
          provider: '11labs',
          voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam
        },
        recordingEnabled: true,
        transcriptPlan: { enabled: true },
        endCallFunctionEnabled: true,
        dialKeypadFunctionEnabled: false,
      },
      metadata: {
        leadId: lead.id,
        leadName: lead.name,
        niche,
        city,
        signals: lead.signals?.join(','),
      },
    }

    const resp = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vapiApiKey}`,
      },
      body: JSON.stringify(body),
    })

    const data = await resp.json()

    if (!resp.ok) {
      return NextResponse.json({ error: data.message || 'Vapi API error', details: data }, { status: resp.status })
    }

    return NextResponse.json({ callId: data.id, status: data.status, ...data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  // Poll call status from Vapi
  const callId = req.nextUrl.searchParams.get('callId')
  const apiKey = req.nextUrl.searchParams.get('apiKey')
  if (!callId || !apiKey) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const resp = await fetch(`https://api.vapi.ai/call/${callId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const data = await resp.json()
  return NextResponse.json(data)
}

function signalLabel(key: string): string {
  const labels: Record<string, string> = {
    fewReviews: 'under 25 Google reviews', lowRating: 'a rating below 4.0 stars',
    noWebsite: 'no website on your Google profile', noPhone: 'no phone number listed on Google',
    noHours: 'no business hours on Google', fewPhotos: 'very few profile photos',
    noSchema: 'no schema markup on your website', noMeta: 'missing meta description',
    noMobile: 'your site not being mobile-friendly', noSSL: 'no HTTPS on your website',
    noCityMention: 'your city not mentioned on your website', slowSite: 'a slow website load time',
    outrankedOnReviews: 'competitors having far more reviews', lowEngagement: 'low review engagement',
    chainDominates: 'national chains dominating your local results',
  }
  return labels[key] || key
}
