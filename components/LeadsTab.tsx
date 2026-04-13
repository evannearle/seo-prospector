'use client'
import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { SIGNALS } from '@/lib/types'
import type { Lead, LeadStatus } from '@/lib/types'

const STATUS_LABELS: Record<LeadStatus,string> = {new:'New',called:'Called',noans:'No answer',booked:'Booked',skip:'Skipped'}
const STATUS_COLORS: Record<LeadStatus,{bg:string,color:string}> = {
  new:{bg:'#dbeafe',color:'#1e40af'},called:{bg:'#dcfce7',color:'#166534'},
  noans:{bg:'#fef3c7',color:'#78350f'},booked:{bg:'#ede9fe',color:'#5b21b6'},skip:{bg:'#f4f4f2',color:'#6b7280'}
}

export default function LeadsTab({onSendToPhone}: {onSendToPhone: (ids:string[])=>void}) {
  const { leads, updateLeadStatus, deleteLead, clearLeads } = useStore()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<keyof Lead>('savedAt')
  const [sortDir, setSortDir] = useState(-1)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return leads
      .filter(l => !q || [l.name,l.addr,l.phone||'',l.website||''].join(' ').toLowerCase().includes(q))
      .sort((a,b) => {
        const av = a[sortKey] as any, bv = b[sortKey] as any
        if (av == null) return 1; if (bv == null) return -1
        return sortDir * (typeof av === 'number' ? av-bv : String(av).localeCompare(String(bv)))
      })
  }, [leads, search, sortKey, sortDir])

  const doSort = (key: keyof Lead) => {
    if (sortKey===key) setSortDir(d=>d*-1); else {setSortKey(key);setSortDir(-1)}
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n=new Set(Array.from(prev)); n.has(id)?n.delete(id):n.add(id); return n })
  }
  const toggleAll = () => {
    setSelected(prev => prev.size===filtered.length ? new Set() : new Set(filtered.map(l=>l.id)))
  }

  const exportCSV = () => {
    const h = ['Name','Address','Phone','Website','Google Maps','Reviews','Rating','Photos','Hours','Signals','Score','Status','Saved']
    const rows = leads.map(l=>[l.name,l.addr,l.phone||'',l.website||'',l.mapsUrl,l.reviews,l.rating>0?l.rating.toFixed(1):'N/A',l.photos,l.hasHours?'Yes':'No',(l.signals||[]).map(s=>SIGNALS[s]?.label||s).join('; '),l.score,l.status,l.savedAt?new Date(l.savedAt).toLocaleDateString():''])
    const csv = [h,...rows].map(r=>r.map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv)
    a.download=`seo_leads_${new Date().toISOString().slice(0,10)}.csv`; a.click()
  }

  const selectedArr = [...selected]
  const selectedLeads = filtered.filter(l=>selected.has(l.id))

  const Th = ({k,children}: {k?:keyof Lead,children:React.ReactNode}) => (
    <th onClick={k?()=>doSort(k):undefined} style={{background:'#f6f6f4',borderBottom:'1px solid #e4e4e0',padding:'9px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:'#6b7280',letterSpacing:'.05em',textTransform:'uppercase',whiteSpace:'nowrap',cursor:k?'pointer':'default',userSelect:'none'}}>
      {children}{k&&sortKey===k?(sortDir>0?' ↑':' ↓'):''}
    </th>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 18px',background:'#fff',borderBottom:'1px solid #e4e4e0',flexShrink:0,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:14,fontWeight:700}}>Saved Leads</div>
          <div style={{fontSize:11,color:'#9ca3af',marginTop:1}}>All prospects auto-saved from prospector searches</div>
        </div>
        <span style={{fontSize:12,color:'#9ca3af',background:'#f4f4f2',padding:'2px 8px',borderRadius:99}}>{leads.length} leads</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, city, phone..." style={{padding:'6px 10px',border:'1px solid #d1d5db',borderRadius:7,fontSize:12,width:220,fontFamily:'inherit',outline:'none'}} />
        <div style={{display:'flex',gap:7,marginLeft:'auto',flexWrap:'wrap'}}>
          {selected.size>0&&<>
            <button onClick={()=>{selectedArr.forEach(id=>updateLeadStatus(id,'called'));setSelected(new Set())}} style={btnStyle}>Mark called</button>
            <button onClick={()=>{selectedArr.forEach(id=>updateLeadStatus(id,'booked'));setSelected(new Set())}} style={btnStyle}>Mark booked</button>
            <button onClick={()=>{onSendToPhone(selectedLeads.filter(l=>l.phone).map(l=>l.id));setSelected(new Set())}} style={{...btnStyle,background:'#2563eb',color:'#fff',border:'none'}}>Send to AI Phone ({selected.size}) ↗</button>
            <button onClick={()=>{if(confirm(`Delete ${selected.size} leads?`)){selectedArr.forEach(id=>deleteLead(id));setSelected(new Set())}}} style={{...btnStyle,background:'#dc2626',color:'#fff',border:'none'}}>Delete</button>
          </>}
          <button onClick={clearLeads} style={btnStyle}>Clear all</button>
          <button onClick={exportCSV} style={{...btnStyle,background:'#2563eb',color:'#fff',border:'none'}}>Export CSV</button>
        </div>
      </div>

      {/* Table */}
      <div style={{flex:1,overflow:'auto'}}>
        {leads.length === 0 ? (
          <div style={{padding:60,textAlign:'center',color:'#9ca3af'}}>
            <div style={{fontSize:14,color:'#6b7280',fontWeight:500,marginBottom:5}}>No saved leads yet</div>
            <div style={{fontSize:12}}>Run a search in the Prospector tab — all results auto-save here.</div>
          </div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead style={{position:'sticky',top:0,zIndex:10}}>
              <tr>
                <th style={{...thBase,width:36}}><input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0} onChange={toggleAll} style={{cursor:'pointer',accentColor:'#2563eb'}} /></th>
                <Th k="name">Business</Th>
                <Th k="addr">Location</Th>
                <th style={thBase}>Phone</th>
                <th style={thBase}>Website</th>
                <Th k="score">Score</Th>
                <Th k="reviews">Reviews</Th>
                <Th k="rating">Rating</Th>
                <th style={thBase}>Signals</th>
                <Th k="status">Status</Th>
                <Th k="savedAt">Saved</Th>
                <th style={thBase}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => {
                const status = (l.status||'new') as LeadStatus
                const sc = STATUS_COLORS[status]||STATUS_COLORS.new
                const scoreColor = l.score>=8?'#dc2626':l.score>=5?'#d97706':'#6b7280'
                const scoreScoreBg = l.score>=8?'#fee2e2':l.score>=5?'#fef3c7':'#f4f4f2'
                let host=''
                if(l.website){try{host=new URL(l.website.startsWith('http')?l.website:'https://'+l.website).hostname}catch(e){host=l.website}}
                const dt = l.savedAt ? new Date(l.savedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''
                return (
                  <tr key={l.id} style={{cursor:'default'}} onMouseEnter={e=>(e.currentTarget.style.background='#fafaf9')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                    <td style={tdBase}><input type="checkbox" checked={selected.has(l.id)} onChange={()=>toggleSelect(l.id)} style={{cursor:'pointer',accentColor:'#2563eb'}} /></td>
                    <td style={tdBase}><a href={l.mapsUrl} target="_blank" rel="noopener" style={{color:'#18181b',textDecoration:'none',fontWeight:600}}>{l.name}</a></td>
                    <td style={{...tdBase,color:'#9ca3af',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.addr.split(',').slice(0,2).join(',')}</td>
                    <td style={tdBase}>{l.phone?<a href={`tel:${l.phone}`} style={{color:'#16a34a',textDecoration:'none',fontWeight:500}}>{l.phone}</a>:<span style={{color:'#d1d5db'}}>—</span>}</td>
                    <td style={{...tdBase,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{host?<a href={l.website!.startsWith('http')?l.website!:'https://'+l.website} target="_blank" rel="noopener" style={{color:'#2563eb',textDecoration:'none',fontWeight:500}}>{host}</a>:<span style={{color:'#d1d5db'}}>—</span>}</td>
                    <td style={tdBase}><span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:28,height:20,borderRadius:4,fontSize:10,fontWeight:700,background:scoreScoreBg,color:scoreColor}}>{l.score}</span></td>
                    <td style={{...tdBase,color:l.reviews<25?'#dc2626':'#18181b'}}>{l.reviews}</td>
                    <td style={{...tdBase,color:l.rating>0&&l.rating<4?'#dc2626':'#18181b'}}>{l.rating>0?l.rating.toFixed(1):'—'}</td>
                    <td style={tdBase}>
                      <div style={{display:'flex',gap:3,flexWrap:'wrap',maxWidth:180}}>
                        {(l.signals||[]).slice(0,2).map(s=>{const sig=SIGNALS[s];const cmap={r:'#991b1b',a:'#78350f',b:'#1e3a8a'};const bgmap={r:'#fee2e2',a:'#fef3c7',b:'#dbeafe'};return<span key={s} style={{fontSize:9,padding:'1px 5px',borderRadius:99,fontWeight:600,background:bgmap[sig?.color||'r'],color:cmap[sig?.color||'r']}}>{sig?.label||s}</span>})}
                      </div>
                    </td>
                    <td style={tdBase}><span style={{display:'inline-flex',alignItems:'center',padding:'2px 8px',borderRadius:99,fontSize:10,fontWeight:600,...sc}}>{STATUS_LABELS[status]}</span></td>
                    <td style={{...tdBase,color:'#9ca3af',fontSize:11}}>{dt}</td>
                    <td style={tdBase}>
                      <div style={{display:'flex',gap:5}}>
                        <select defaultValue="" onChange={e=>{if(e.target.value){updateLeadStatus(l.id,e.target.value as LeadStatus);e.target.value=''}}} style={{fontSize:11,padding:'3px 6px',border:'1px solid #d1d5db',borderRadius:6,color:'#6b7280',background:'#fff',fontFamily:'inherit',outline:'none'}}>
                          <option value="">Status...</option>
                          {Object.entries(STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                        </select>
                        <button onClick={()=>{if(confirm('Remove this lead?'))deleteLead(l.id)}} style={{fontSize:10,padding:'3px 8px',border:'none',background:'#dc2626',color:'#fff',borderRadius:6,cursor:'pointer',fontFamily:'inherit'}}>×</button>
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

const thBase: React.CSSProperties = {background:'#f6f6f4',borderBottom:'1px solid #e4e4e0',padding:'9px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:'#6b7280',letterSpacing:'.05em',textTransform:'uppercase',whiteSpace:'nowrap'}
const tdBase: React.CSSProperties = {padding:'10px 12px',borderBottom:'.5px solid #f0f0ec',verticalAlign:'middle',whiteSpace:'nowrap'}
const btnStyle: React.CSSProperties = {padding:'5px 11px',fontSize:11,border:'1px solid #d1d5db',background:'#fff',color:'#6b7280',fontWeight:500,borderRadius:7,cursor:'pointer',fontFamily:'inherit'}
