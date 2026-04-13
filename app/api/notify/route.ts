import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { lead, call, config } = await req.json()
    const { alertEmail, resendApiKey, agencyName = 'SEO Prospector', callerName = 'Your AI caller' } = config

    if (!alertEmail) return NextResponse.json({ error: 'No alert email configured' }, { status: 400 })
    if (!resendApiKey) return NextResponse.json({ error: 'No Resend API key configured' }, { status: 400 })

    const duration = call.duration
      ? `${Math.floor(call.duration / 60)}:${String(call.duration % 60).padStart(2, '0')}`
      : 'N/A'

    const signalPills = (lead.signals || [])
      .map((s: string) => `<span style="display:inline-block;padding:2px 8px;border-radius:99px;background:#fee2e2;color:#991b1b;font-size:12px;font-weight:600;margin:2px 2px 2px 0">${s}</span>`)
      .join('')

    const transcriptHtml = (call.transcript || []).slice(0, 6).map((line: { role: string; text: string }) =>
      `<div style="margin-bottom:6px;font-size:12px;line-height:1.5">
        <span style="font-weight:700;color:${line.role === 'ai' ? '#2563eb' : '#18181b'}">${line.role === 'ai' ? 'AI: ' : 'Prospect: '}</span>
        <span style="color:#374151">${line.text}</span>
      </div>`
    ).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f6f4;margin:0;padding:24px">
<div style="max-width:560px;margin:0 auto">

  <div style="background:#18181b;border-radius:12px 12px 0 0;padding:20px 24px">
    <div style="color:#fff;font-size:18px;font-weight:700">🎉 New booking confirmed</div>
    <div style="color:#a1a1aa;font-size:12px;margin-top:3px">${agencyName} · AI Phone System · ${new Date().toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</div>
  </div>

  <div style="background:#fff;border:1px solid #e4e4e0;border-top:none;border-radius:0 0 12px 12px;padding:24px">

    <div style="margin-bottom:20px">
      <div style="font-size:22px;font-weight:700;color:#18181b">${lead.name}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:3px">${lead.addr || ''}</div>
      ${lead.niche ? `<span style="display:inline-block;margin-top:6px;padding:2px 10px;border-radius:99px;background:#eff6ff;color:#2563eb;font-size:12px;font-weight:600;text-transform:capitalize">${lead.niche}</span>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px">
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 14px">
        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Phone</div>
        <div style="font-size:15px;font-weight:700;color:#16a34a">${lead.phone || '—'}</div>
      </div>
      <div style="background:#f6f6f4;border-radius:8px;padding:12px 14px">
        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Website</div>
        <div style="font-size:12px;font-weight:600;word-break:break-all">${lead.website ? `<a href="${lead.website.startsWith('http')?lead.website:'https://'+lead.website}" style="color:#2563eb;text-decoration:none">${lead.website}</a>` : '—'}</div>
      </div>
    </div>

    ${lead.mapsUrl ? `<a href="${lead.mapsUrl}" style="display:block;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;font-size:12px;color:#1d4ed8;text-decoration:none;margin-bottom:18px;font-weight:500">🗺 View ${lead.name} on Google Maps →</a>` : ''}

    <div style="background:#faf5ff;border:1px solid #d8b4fe;border-radius:8px;padding:14px 16px;margin-bottom:18px">
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Call summary</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div><div style="font-size:10px;color:#9ca3af;margin-bottom:2px">Outcome</div><div style="font-size:14px;font-weight:700;color:#7c3aed">Booked 🎉</div></div>
        <div><div style="font-size:10px;color:#9ca3af;margin-bottom:2px">Duration</div><div style="font-size:14px;font-weight:700;color:#18181b">${duration}</div></div>
        <div><div style="font-size:10px;color:#9ca3af;margin-bottom:2px">Lead score</div><div style="font-size:14px;font-weight:700;color:#dc2626">${lead.score || '—'}/10</div></div>
      </div>
      ${(call.retryCount || 0) > 0 ? `<div style="margin-top:8px;font-size:11px;color:#9ca3af">Booked on retry attempt #${call.retryCount}</div>` : ''}
      ${call.recordingUrl ? `<div style="margin-top:10px"><a href="${call.recordingUrl}" style="font-size:12px;color:#7c3aed;text-decoration:none;font-weight:600">🎙 Listen to recording →</a></div>` : ''}
    </div>

    ${signalPills ? `<div style="margin-bottom:18px">
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">SEO issues pitched on this call</div>
      <div>${signalPills}</div>
    </div>` : ''}

    ${transcriptHtml ? `<div style="background:#f6f6f4;border-radius:8px;padding:14px 16px;margin-bottom:18px">
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Call transcript preview</div>
      ${transcriptHtml}
      ${(call.transcript||[]).length > 6 ? `<div style="font-size:11px;color:#9ca3af;margin-top:6px">+ ${(call.transcript||[]).length - 6} more lines in the app</div>` : ''}
    </div>` : ''}

    <div style="border-top:1px solid #f0f0ec;padding-top:14px;font-size:11px;color:#9ca3af">
      Sent automatically by ${agencyName} AI Phone System
    </div>
  </div>
</div>
</body></html>`

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: `${agencyName} Alerts <onboarding@resend.dev>`,
        to: [alertEmail],
        subject: `🎉 Booked: ${lead.name} — ${lead.niche || 'prospect'} in ${(lead.addr || '').split(',')[0] || 'your area'}`,
        html,
      }),
    })

    const data = await resp.json()
    if (!resp.ok) return NextResponse.json({ error: data.message || 'Resend error', details: data }, { status: resp.status })
    return NextResponse.json({ ok: true, emailId: data.id })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
