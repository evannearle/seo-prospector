/* eslint-disable react/no-unescaped-entities */
'use client'
import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { SIGNALS } from '@/lib/types'
import type { Lead, LeadStatus } from '@/lib/types'

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New', called: 'Called', noans: 'No answer', booked: 'Booked', skip: 'Skipped'
}
const STATUS_COLORS: Record<LeadStatus, { bg: string; color: string }> = {
  new:    { bg: '#dbeafe', color: '#1e40af' },
  called: { bg: '#dcfce7', color: '#166534' },
  noans:  { bg: '#fef3c7', color: '#78350f' },
  booked: { bg: '#ede9fe', color: '#5b21b6' },
  skip:   { bg: '#f4f4f2', color: '#6b7280' },
}

type SortKey = 'name' | 'addr' | 'score' | 'reviews' | 'rating' | 'status' | 'savedAt' | 'niche' | 'signals'

const NICHES = ['plumber','roofer','hvac contractor','electrician','landscaper','dentist','orthodontist','chiropractor','med spa','personal injury lawyer']
const SIGNAL_COLORS = { r: '#991b1b', a: '#78350f', b: '#1e3a8a' }
const SIGNAL_BGS    = { r: '#fee2e2', a: '#fef3c7', b: '#dbeafe' }

export default function LeadsTab({ onSendToPhone }: { onSendToPhone: (ids: string[]) => void }) {
  const { leads, updateLeadStatus, deleteLead, clearLeads } = useStore()

  // ── Sort ──
  const [sortKey, setSortKey] = useState<SortKey>('savedAt')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  // ── Filters ──
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterNiche,  setFilterNiche]  = useState<string>('all')
  const [filterScore,  setFilterScore]  = useState<string>('all')  // 'all' | '8+' | '5-7' | '1-4'
  const [filterPhone,  setFilterPhone]  = useState<boolean>(false)
  const [filterSig,    setFilterSig]    = useState<string>('all')

  // ── Selection ──
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const doSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortKey(k); setSortDir(-1) }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return leads
      .filter(l => {
        if (q && ![ l.name, l.addr, l.phone || '', l.website || '', l.niche || '' ].join(' ').toLowerCase().includes(q)) return false
        if (filterStatus !== 'all' && (l.status || 'new') !== filterStatus) return false
        if (filterNiche  !== 'all' && l.niche !== filterNiche) return false
        if (filterPhone  && !l.phone) return false
        if (filterSig    !== 'all' && !(l.signals || []).includes(filterSig)) return false
        if (filterScore  === '8+')  return l.score >= 8
        if (filterScore  === '5-7') return l.score >= 5 && l.score <= 7
        if (filterScore  === '1-4') return l.score >= 1 && l.score <= 4
        return true
      })
      .sort((a, b) => {
        let av: string | number = '', bv: string | number = ''
        if (sortKey === 'signals') { av = (a.signals || []).length; bv = (b.signals || []).length }
        else { av = (a as any)[sortKey] ?? ''; bv = (b as any)[sortKey] ?? '' }
        if (av == null) return 1
        if (bv == null) return -1
        return sortDir * (typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv)))
      })
  }, [leads, search, sortKey, sortDir, filterStatus, filterNiche, filterPhone, filterSig, filterScore])

  const allSigsInLeads = useMemo(() => {
    const seen = new Set<string>()
    leads.forEach(l => (l.signals || []).forEach(s => seen.add(s)))
    return Array.from(seen)
  }, [leads])

  const nichesInLeads = useMemo(() => {
    const seen = new Set<string>()
    leads.forEach(l => l.niche && seen.add(l.niche))
    return Array.from(seen)
  }, [leads])

  const toggleSelect = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleAll = () => setSelected(prev =>
    prev.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(l => l.id))
  )

  const selectedArr   = Array.from(selected)
  const selectedLeads = leads.filter(l => selected.has(l.id))

  const clearFilters = () => {
    setSearch(''); setFilterStatus('all'); setFilterNiche('all')
    setFilterScore('all'); setFilterPhone(false); setFilterSig('all')
  }
  const hasActiveFilters = search || filterStatus !== 'all' || filterNiche !== 'all' || filterScore !== 'all' || filterPhone || filterSig !== 'all'

  const exportCSV = () => {
    const rows = (selected.size > 0 ? selectedLeads : leads)
    const h = ['Name','Address','Phone','Website','Google Maps','Reviews','Rating','Photos','Hours','Signals','Score','Status','Niche','Saved']
    const csv = [h, ...rows.map(l => [
      l.name, l.addr, l.phone || '', l.website || '', l.mapsUrl, l.reviews,
      l.rating > 0 ? l.rating.toFixed(1) : 'N/A', l.photos, l.hasHours ? 'Yes' : 'No',
      (l.signals || []).map(s => SIGNALS[s]?.label || s).join('; '),
      l.score, l.status || 'new', l.niche || '', l.savedAt ? new Date(l.savedAt).toLocaleDateString() : ''
    ])].map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `seo_leads_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const SortTh = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th onClick={() => doSort(k)} style={thBase}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
        {children}
        <span style={{ fontSize: 9, color: sortKey === k ? '#2563eb' : '#d1d5db', lineHeight: 1 }}>
          {sortKey === k ? (sortDir > 0 ? '▲' : '▼') : '⇅'}
        </span>
      </span>
    </th>
  )

  // ─── stat pills ───
  const statCounts = useMemo(() => ({
    all: leads.length,
    new: leads.filter(l => (l.status || 'new') === 'new').length,
    called: leads.filter(l => l.status === 'called').length,
    booked: leads.filter(l => l.status === 'booked').length,
    crit: leads.filter(l => l.score >= 8).length,
    phone: leads.filter(l => !!l.phone).length,
  }), [leads])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: '#f6f6f4' }}>

      {/* ── Top toolbar ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e4e4e0', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Saved Leads</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>All prospects auto-saved from prospector runs</div>
        </div>
        <span style={{ fontSize: 11, color: '#6b7280', background: '#f4f4f2', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>{filtered.length} / {leads.length}</span>
        <div style={{ flex: 1, minWidth: 140 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, city, phone, niche..."
            style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 7, width: '100%', fontFamily: 'inherit', outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {selected.size > 0 && <>
            <button onClick={() => { selectedArr.forEach(id => updateLeadStatus(id, 'called')); setSelected(new Set()) }} style={btnSt}>Mark called</button>
            <button onClick={() => { selectedArr.forEach(id => updateLeadStatus(id, 'booked')); setSelected(new Set()) }} style={btnSt}>Mark booked</button>
            <button onClick={() => { onSendToPhone(selectedLeads.filter(l => l.phone).map(l => l.id)); setSelected(new Set()) }} style={{ ...btnSt, background: '#2563eb', color: '#fff', border: 'none' }}>
              Send to phone ({selected.size}) ↗
            </button>
            <button onClick={() => { if (confirm(`Delete ${selected.size} leads?`)) { selectedArr.forEach(id => deleteLead(id)); setSelected(new Set()) } }} style={{ ...btnSt, background: '#dc2626', color: '#fff', border: 'none' }}>Delete</button>
          </>}
          <button onClick={() => exportCSV()} style={btnSt}>
            {selected.size > 0 ? `Export ${selected.size}` : 'Export CSV'}
          </button>
          <button onClick={() => { if (confirm('Clear all saved leads?')) { clearLeads(); setSelected(new Set()) } }} style={btnSt}>Clear all</button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e4e4e0', padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>

        {/* Quick status pills */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {([
            { v: 'all',    l: `All (${statCounts.all})` },
            { v: 'new',    l: `New (${statCounts.new})` },
            { v: 'called', l: `Called (${statCounts.called})` },
            { v: 'booked', l: `Booked (${statCounts.booked})` },
          ] as { v: string; l: string }[]).map(({ v, l }) => (
            <button key={v} onClick={() => setFilterStatus(v)}
              style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: filterStatus === v ? 700 : 500, border: '1px solid', borderColor: filterStatus === v ? '#2563eb' : '#e4e4e0', background: filterStatus === v ? '#eff6ff' : 'transparent', color: filterStatus === v ? '#2563eb' : '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 18, background: '#e4e4e0', flexShrink: 0 }} />

        {/* Score filter */}
        <select value={filterScore} onChange={e => setFilterScore(e.target.value)} style={selSt}>
          <option value="all">All scores</option>
          <option value="8+">Critical (8–10)</option>
          <option value="5-7">High (5–7)</option>
          <option value="1-4">Low (1–4)</option>
        </select>

        {/* Niche filter */}
        {nichesInLeads.length > 1 && (
          <select value={filterNiche} onChange={e => setFilterNiche(e.target.value)} style={selSt}>
            <option value="all">All niches</option>
            {nichesInLeads.map(n => <option key={n} value={n}>{n.charAt(0).toUpperCase() + n.slice(1)}</option>)}
          </select>
        )}

        {/* Signal filter */}
        {allSigsInLeads.length > 0 && (
          <select value={filterSig} onChange={e => setFilterSig(e.target.value)} style={selSt}>
            <option value="all">All signals</option>
            {allSigsInLeads.map(s => <option key={s} value={s}>{SIGNALS[s]?.label || s}</option>)}
          </select>
        )}

        {/* Phone only toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: filterPhone ? '#16a34a' : '#6b7280', cursor: 'pointer', fontWeight: filterPhone ? 600 : 400, userSelect: 'none' }}>
          <input type="checkbox" checked={filterPhone} onChange={e => setFilterPhone(e.target.checked)} style={{ accentColor: '#16a34a', cursor: 'pointer' }} />
          Has phone
        </label>

        {hasActiveFilters && (
          <button onClick={clearFilters} style={{ fontSize: 11, padding: '3px 9px', border: '1px solid #fca5a5', background: '#fff5f5', color: '#dc2626', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
            ✕ Clear filters
          </button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          {selected.size > 0 && <span style={{ marginLeft: 6, color: '#2563eb', fontWeight: 600 }}>· {selected.size} selected</span>}
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {leads.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: 14, color: '#6b7280', fontWeight: 500, marginBottom: 5 }}>No saved leads yet</div>
            <div style={{ fontSize: 12 }}>Run a search in the Prospector tab — all results auto-save here.</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500, marginBottom: 5 }}>No leads match your filters</div>
            <button onClick={clearFilters} style={{ fontSize: 12, padding: '5px 14px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Clear all filters</button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ ...thBase, width: 36 }}>
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll} style={{ cursor: 'pointer', accentColor: '#2563eb' }} />
                </th>
                <SortTh k="name">Business</SortTh>
                <SortTh k="niche">Niche</SortTh>
                <SortTh k="addr">Location</SortTh>
                <th style={thBase}>Phone</th>
                <th style={thBase}>Website</th>
                <SortTh k="score">Score</SortTh>
                <SortTh k="reviews">Reviews</SortTh>
                <SortTh k="rating">Rating</SortTh>
                <SortTh k="signals">Signals</SortTh>
                <SortTh k="status">Status</SortTh>
                <SortTh k="savedAt">Saved</SortTh>
                <th style={thBase}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => {
                const status = (l.status || 'new') as LeadStatus
                const sc = STATUS_COLORS[status] || STATUS_COLORS.new
                const scoreColor = l.score >= 8 ? '#dc2626' : l.score >= 5 ? '#d97706' : '#6b7280'
                const scoreBg    = l.score >= 8 ? '#fee2e2' : l.score >= 5 ? '#fef3c7' : '#f4f4f2'
                let host = ''
                if (l.website) { try { host = new URL(l.website.startsWith('http') ? l.website : 'https://' + l.website).hostname } catch { host = l.website } }
                const dt = l.savedAt ? new Date(l.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
                const isSelected = selected.has(l.id)
                return (
                  <tr key={l.id}
                    style={{ background: isSelected ? '#eff6ff' : undefined, transition: 'background .08s' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#fafaf9' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = '' }}>
                    <td style={tdBase}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(l.id)} style={{ cursor: 'pointer', accentColor: '#2563eb' }} />
                    </td>
                    <td style={tdBase}>
                      <a href={l.mapsUrl} target="_blank" rel="noopener" style={{ color: '#18181b', textDecoration: 'none', fontWeight: 600 }}>{l.name}</a>
                    </td>
                    <td style={{ ...tdBase, color: '#6b7280', fontSize: 11 }}>
                      {l.niche ? l.niche.charAt(0).toUpperCase() + l.niche.slice(1) : '—'}
                    </td>
                    <td style={{ ...tdBase, color: '#9ca3af', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.addr.split(',').slice(0, 2).join(',')}
                    </td>
                    <td style={tdBase}>
                      {l.phone
                        ? <a href={`tel:${l.phone}`} style={{ color: '#16a34a', textDecoration: 'none', fontWeight: 500 }}>{l.phone}</a>
                        : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ ...tdBase, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {host
                        ? <a href={l.website!.startsWith('http') ? l.website! : 'https://' + l.website} target="_blank" rel="noopener" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>{host}</a>
                        : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={tdBase}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 20, borderRadius: 4, fontSize: 10, fontWeight: 700, background: scoreBg, color: scoreColor }}>
                        {l.score}
                      </span>
                    </td>
                    <td style={{ ...tdBase, color: l.reviews < 25 ? '#dc2626' : '#18181b' }}>{l.reviews}</td>
                    <td style={{ ...tdBase, color: l.rating > 0 && l.rating < 4 ? '#dc2626' : '#18181b' }}>
                      {l.rating > 0 ? l.rating.toFixed(1) : '—'}
                    </td>
                    <td style={tdBase}>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 200 }}>
                        {(l.signals || []).slice(0, 3).map(s => {
                          const sig = SIGNALS[s]
                          const c = sig?.color || 'r'
                          return (
                            <span key={s} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 99, fontWeight: 600, background: SIGNAL_BGS[c as keyof typeof SIGNAL_BGS], color: SIGNAL_COLORS[c as keyof typeof SIGNAL_COLORS] }}>
                              {sig?.label || s}
                            </span>
                          )
                        })}
                        {(l.signals || []).length > 3 && <span style={{ fontSize: 9, color: '#9ca3af' }}>+{(l.signals || []).length - 3}</span>}
                      </div>
                    </td>
                    <td style={tdBase}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600, ...sc }}>
                        {STATUS_LABELS[status]}
                      </span>
                    </td>
                    <td style={{ ...tdBase, color: '#9ca3af', fontSize: 11 }}>{dt}</td>
                    <td style={tdBase}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <select defaultValue="" onChange={e => { if (e.target.value) { updateLeadStatus(l.id, e.target.value as LeadStatus); e.target.value = '' } }}
                          style={{ fontSize: 11, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 6, color: '#6b7280', background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
                          <option value="">Status...</option>
                          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <button onClick={() => { if (confirm('Remove this lead?')) deleteLead(l.id) }}
                          style={{ fontSize: 10, padding: '3px 8px', border: 'none', background: '#dc2626', color: '#fff', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const thBase: React.CSSProperties = { background: '#f6f6f4', borderBottom: '1px solid #e4e4e0', padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#6b7280', letterSpacing: '.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }
const tdBase: React.CSSProperties = { padding: '9px 12px', borderBottom: '.5px solid #f0f0ec', verticalAlign: 'middle', whiteSpace: 'nowrap' }
const btnSt:  React.CSSProperties = { padding: '5px 11px', fontSize: 11, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontWeight: 500, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }
const selSt:  React.CSSProperties = { fontSize: 11, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }
