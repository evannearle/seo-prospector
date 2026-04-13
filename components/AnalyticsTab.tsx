/* eslint-disable react/no-unescaped-entities */
'use client'
import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { computeAnalytics } from '@/lib/analytics'
import { SIGNALS } from '@/lib/types'
import type { Lead, CallRecord } from '@/lib/types'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const COLORS = ['#2563eb','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#65a30d','#ea580c']

export default function AnalyticsTab() {
  const { leads, calls } = useStore()
  const [drillDown, setDrillDown] = useState<{type:string,value:string}|null>(null)
  const [dateRange, setDateRange] = useState('30')

  const analytics = useMemo(() => computeAnalytics(leads, calls), [leads, calls])

  const drillLeads = useMemo(() => {
    if (!drillDown) return []
    if (drillDown.type === 'niche') return leads.filter(l=>l.niche===drillDown.value)
    if (drillDown.type === 'status') return leads.filter(l=>(l.status||'new')===drillDown.value)
    if (drillDown.type === 'signal') {
      const sigKey = Object.entries(SIGNALS).find(([,v])=>v.label===drillDown.value)?.[0]
      return sigKey ? leads.filter(l=>l.signals?.includes(sigKey)) : []
    }
    if (drillDown.type === 'score') {
      const [min,max] = drillDown.value.split('–').map(Number)
      return leads.filter(l=>l.score>=min&&l.score<=max)
    }
    return []
  }, [drillDown, leads])

  const drillCalls = useMemo(() => {
    if (!drillDown) return []
    if (drillDown.type === 'outcome') return calls.filter(c=>c.outcome===drillDown.value)
    if (drillDown.type === 'day') return calls.filter(c=>c.startedAt?.slice(0,10)===drillDown.value)
    return []
  }, [drillDown, calls])

  if (leads.length === 0 && calls.length === 0) {
    return (
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,color:'#9ca3af'}}>
        <div style={{width:52,height:52,borderRadius:'50%',background:'#f4f4f2',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>📊</div>
        <div style={{fontSize:15,fontWeight:600,color:'#6b7280'}}>No data yet</div>
        <div style={{fontSize:13,textAlign:'center',lineHeight:1.6}}>Run a prospector search to start building your analytics.<br/>Call data appears here once you start making AI calls.</div>
      </div>
    )
  }

  const callsByDaySliced = analytics.callsByDay.slice(-parseInt(dateRange))

  return (
    <div style={{flex:1,overflowY:'auto',padding:20,display:'flex',flexDirection:'column',gap:16}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:15,fontWeight:700}}>Analytics Dashboard</div>
          <div style={{fontSize:11,color:'#9ca3af',marginTop:1}}>Real-time insights · click any chart to drill down</div>
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
          <select value={dateRange} onChange={e=>setDateRange(e.target.value)} style={{fontSize:11,padding:'5px 9px',border:'1px solid #d1d5db',borderRadius:7,background:'#fff',color:'#6b7280',fontFamily:'inherit',outline:'none'}}>
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
          </select>
          {drillDown && (
            <button onClick={()=>setDrillDown(null)} style={{fontSize:11,padding:'5px 11px',border:'1px solid #d1d5db',background:'#fff',color:'#6b7280',borderRadius:7,cursor:'pointer',fontFamily:'inherit'}}>
              ← Clear drill-down
            </button>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10}}>
        {[
          {n:analytics.totalLeads,l:'Total leads',c:'#18181b',sub:'All time'},
          {n:analytics.totalCalls,l:'Calls made',c:'#2563eb',sub:'All time'},
          {n:analytics.answerRate+'%',l:'Answer rate',c:'#16a34a',sub:`${calls.filter(c=>['answered','booked','not-interested','callback'].includes(c.outcome)).length} answered`},
          {n:analytics.bookingRate+'%',l:'Booking rate',c:'#7c3aed',sub:`${calls.filter(c=>c.outcome==='booked').length} booked`},
          {n:analytics.voicemailRate+'%',l:'Voicemail rate',c:'#d97706',sub:`${calls.filter(c=>c.outcome==='voicemail').length} voicemails`},
          {n:analytics.avgScore,l:'Avg. lead score',c:'#dc2626',sub:'Out of 10'},
        ].map(({n,l,c,sub})=>(
          <div key={l} style={{background:'#fff',border:'1px solid #e4e4e0',borderRadius:10,padding:'12px 14px'}}>
            <div style={{fontSize:22,fontWeight:700,color:c,lineHeight:1}}>{n}</div>
            <div style={{fontSize:10,color:'#18181b',fontWeight:600,marginTop:4}}>{l}</div>
            <div style={{fontSize:10,color:'#9ca3af',marginTop:2}}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Calls over time */}
      <div style={{background:'#fff',border:'1px solid #e4e4e0',borderRadius:12,padding:'16px 18px'}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Calls over time</div>
        <div style={{fontSize:11,color:'#9ca3af',marginBottom:14}}>Click a bar to see calls on that day</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={callsByDaySliced} onClick={(d:any)=>d?.activePayload?.[0] && setDrillDown({type:'day',value:d.activePayload[0].payload.date})}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" />
            <XAxis dataKey="date" tick={{fontSize:10,fill:'#9ca3af'}} tickFormatter={v=>v.slice(5)} />
            <YAxis tick={{fontSize:10,fill:'#9ca3af'}} allowDecimals={false} />
            <Tooltip contentStyle={{fontSize:11,borderRadius:8,border:'1px solid #e4e4e0'}} labelFormatter={v=>`Date: ${v}`} />
            <Bar dataKey="calls" fill="#e0e7ff" name="Total calls" radius={[3,3,0,0]} />
            <Bar dataKey="answered" fill="#2563eb" name="Answered" radius={[3,3,0,0]} />
            <Bar dataKey="booked" fill="#7c3aed" name="Booked" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Row: signal breakdown + score distribution */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>

        {/* Signal breakdown */}
        <div style={{background:'#fff',border:'1px solid #e4e4e0',borderRadius:12,padding:'16px 18px'}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Signal breakdown</div>
          <div style={{fontSize:11,color:'#9ca3af',marginBottom:14}}>Most common issues across your leads · click to drill down</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {analytics.signalBreakdown.map((item,i)=>(
              <div key={item.signal} onClick={()=>setDrillDown({type:'signal',value:item.signal})} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',padding:'5px 8px',borderRadius:7,background:drillDown?.value===item.signal?'#eff6ff':'transparent',transition:'background .12s'}}>
                <div style={{fontSize:11,color:'#374151',flex:1,fontWeight:500}}>{item.signal}</div>
                <div style={{width:120,height:6,background:'#f0f0ec',borderRadius:99,overflow:'hidden',flexShrink:0}}>
                  <div style={{height:'100%',background:COLORS[i%COLORS.length],borderRadius:99,width:item.pct+'%',transition:'width .3s'}} />
                </div>
                <div style={{fontSize:11,color:'#6b7280',minWidth:40,textAlign:'right'}}>{item.count} <span style={{color:'#9ca3af'}}>({item.pct}%)</span></div>
              </div>
            ))}
            {analytics.signalBreakdown.length===0&&<div style={{fontSize:12,color:'#9ca3af',padding:'20px 0',textAlign:'center'}}>No signal data yet</div>}
          </div>
        </div>

        {/* Score distribution */}
        <div style={{background:'#fff',border:'1px solid #e4e4e0',borderRadius:12,padding:'16px 18px'}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Score distribution</div>
          <div style={{fontSize:11,color:'#9ca3af',marginBottom:14}}>Lead quality breakdown · click to see leads in range</div>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={analytics.scoreDistribution} onClick={(d:any)=>d?.activePayload?.[0] && setDrillDown({type:'score',value:d.activePayload[0].payload.range})}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" />
              <XAxis dataKey="range" tick={{fontSize:10,fill:'#9ca3af'}} />
              <YAxis tick={{fontSize:10,fill:'#9ca3af'}} allowDecimals={false} />
              <Tooltip contentStyle={{fontSize:11,borderRadius:8,border:'1px solid #e4e4e0'}} />
              <Bar dataKey="count" name="Leads" radius={[3,3,0,0]}>
                {analytics.scoreDistribution.map((entry,i)=>(
                  <Cell key={i} fill={['#dc2626','#d97706','#f59e0b','#6b7280'][i]||'#6b7280'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{display:'flex',gap:10,marginTop:8,justifyContent:'center',flexWrap:'wrap'}}>
            {[{l:'Critical 8–10',c:'#dc2626'},{l:'High 6–7',c:'#d97706'},{l:'Mid 4–5',c:'#f59e0b'},{l:'Low 1–3',c:'#6b7280'}].map(({l,c})=>(
              <div key={l} style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'#6b7280'}}>
                <span style={{width:8,height:8,borderRadius:2,background:c,display:'inline-block'}} />{l}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row: status + niche + call outcomes */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>

        {/* Lead status */}
        <div style={{background:'#fff',border:'1px solid #e4e4e0',borderRadius:12,padding:'16px 18px'}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Lead status</div>
          <div style={{fontSize:11,color:'#9ca3af',marginBottom:14}}>Click to filter leads by status</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={analytics.statusBreakdown} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={60} onClick={(d:any)=>setDrillDown({type:'status',value:d.status})}>
                {analytics.statusBreakdown.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{fontSize:11,borderRadius:8,border:'1px solid #e4e4e0'}} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:4}}>
            {analytics.statusBreakdown.map((item,i)=>(
              <div key={item.status} onClick={()=>setDrillDown({type:'status',value:item.status})} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',padding:'3px 6px',borderRadius:6,background:drillDown?.value===item.status?'#f0f6ff':'transparent'}}>
                <span style={{width:8,height:8,borderRadius:2,background:COLORS[i%COLORS.length],display:'inline-block',flexShrink:0}} />
                <span style={{fontSize:11,flex:1}}>{item.status}</span>
                <span style={{fontSize:11,color:'#6b7280',fontWeight:600}}>{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Niche breakdown */}
        <div style={{background:'#fff',border:'1px solid #e4e4e0',borderRadius:12,padding:'16px 18px'}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>By niche</div>
          <div style={{fontSize:11,color:'#9ca3af',marginBottom:14}}>Click to see leads in that niche</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {analytics.nicheBreakdown.length===0&&<div style={{fontSize:12,color:'#9ca3af',padding:'20px 0',textAlign:'center'}}>No data yet</div>}
            {analytics.nicheBreakdown.map((item,i)=>(
              <div key={item.niche} onClick={()=>setDrillDown({type:'niche',value:item.niche})} style={{cursor:'pointer',padding:'8px 10px',borderRadius:8,border:'1px solid',borderColor:drillDown?.value===item.niche?'#2563eb':'#f0f0ec',background:drillDown?.value===item.niche?'#eff6ff':'#fafaf9',transition:'all .12s'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                  <span style={{fontSize:11,fontWeight:600,textTransform:'capitalize',flex:1}}>{item.niche}</span>
                  <span style={{fontSize:10,color:'#6b7280'}}>{item.count} leads</span>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <div style={{flex:1,height:4,background:'#e4e4e0',borderRadius:99,overflow:'hidden'}}>
                    <div style={{height:'100%',background:COLORS[i%COLORS.length],borderRadius:99,width:((item.avgScore/10)*100)+'%'}} />
                  </div>
                  <span style={{fontSize:10,color:'#6b7280',minWidth:50,textAlign:'right'}}>avg {item.avgScore}/10</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Call outcomes */}
        <div style={{background:'#fff',border:'1px solid #e4e4e0',borderRadius:12,padding:'16px 18px'}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Call outcomes</div>
          <div style={{fontSize:11,color:'#9ca3af',marginBottom:14}}>Click to see calls by outcome</div>
          {calls.length === 0 ? (
            <div style={{fontSize:12,color:'#9ca3af',padding:'30px 0',textAlign:'center'}}>No calls made yet</div>
          ) : (
            <>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {[
                  {k:'answered',l:'Answered',c:'#16a34a'},
                  {k:'booked',l:'Booked',c:'#7c3aed'},
                  {k:'voicemail',l:'Voicemail',c:'#d97706'},
                  {k:'no-answer',l:'No answer',c:'#dc2626'},
                  {k:'not-interested',l:'Not interested',c:'#6b7280'},
                  {k:'callback',l:'Callback',c:'#0891b2'},
                ].map(({k,l,c})=>{
                  const count = calls.filter(call=>call.outcome===k).length
                  const pct = calls.length>0?Math.round(count/calls.length*100):0
                  return (
                    <div key={k} onClick={()=>setDrillDown({type:'outcome',value:k})} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',padding:'4px 6px',borderRadius:6,background:drillDown?.value===k?'#f0f6ff':'transparent',transition:'background .12s'}}>
                      <span style={{width:8,height:8,borderRadius:'50%',background:c,flexShrink:0}} />
                      <span style={{fontSize:11,flex:1}}>{l}</span>
                      <div style={{width:60,height:4,background:'#f0f0ec',borderRadius:99,overflow:'hidden'}}>
                        <div style={{height:'100%',background:c,borderRadius:99,width:pct+'%'}} />
                      </div>
                      <span style={{fontSize:11,color:'#6b7280',minWidth:28,textAlign:'right'}}>{count}</span>
                    </div>
                  )
                })}
              </div>
              <div style={{marginTop:12,paddingTop:10,borderTop:'1px solid #f0f0ec'}}>
                <div style={{fontSize:10,color:'#9ca3af',marginBottom:4}}>Recent calls</div>
                {analytics.recentCalls.slice(0,3).map(c=>(
                  <div key={c.id} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 0',borderBottom:'0.5px solid #f0f0ec',fontSize:11}}>
                    <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#374151'}}>{c.leadName}</span>
                    <span style={{color:c.outcome==='booked'?'#7c3aed':c.outcome==='answered'?'#16a34a':c.outcome==='voicemail'?'#d97706':'#9ca3af',fontSize:10,fontWeight:600}}>{c.outcome}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Top prospects */}
      <div style={{background:'#fff',border:'1px solid #e4e4e0',borderRadius:12,padding:'16px 18px'}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Top 5 prospects by score</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10}}>
          {analytics.topProspects.map(p=>{
            const sc=p.score>=8?'#dc2626':p.score>=5?'#d97706':'#6b7280'
            const scBg=p.score>=8?'#fee2e2':p.score>=5?'#fef3c7':'#f4f4f2'
            return (
              <div key={p.placeId} style={{background:'#fafaf9',border:'1px solid #f0f0ec',borderRadius:10,padding:'12px 14px'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                  <span style={{fontSize:16,fontWeight:700,color:sc}}>{p.score}</span>
                  <span style={{fontSize:10,color:'#9ca3af'}}>/10</span>
                </div>
                <div style={{fontSize:11,fontWeight:600,marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</div>
                <div style={{fontSize:10,color:'#9ca3af',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.addr.split(',')[0]}</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                  {p.signals.slice(0,2).map(s=>{
                    const sig=SIGNALS[s];const cmap:{r:string,a:string,b:string}={r:'#991b1b',a:'#78350f',b:'#1e3a8a'};const bgmap:{r:string,a:string,b:string}={r:'#fee2e2',a:'#fef3c7',b:'#dbeafe'}
                    return<span key={s} style={{fontSize:9,padding:'1px 5px',borderRadius:99,fontWeight:600,background:bgmap[sig?.color||'r'],color:cmap[sig?.color||'r']}}>{sig?.label||s}</span>
                  })}
                </div>
                {p.phone&&<div style={{fontSize:10,color:'#16a34a',marginTop:6,fontWeight:500}}>{p.phone}</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Drill-down panel */}
      {drillDown && (drillLeads.length > 0 || drillCalls.length > 0) && (
        <div style={{background:'#fff',border:'2px solid #2563eb',borderRadius:12,padding:'16px 18px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:700,flex:1}}>
              Drill-down: {drillDown.value} {drillLeads.length>0?`(${drillLeads.length} leads)`:``} {drillCalls.length>0?`(${drillCalls.length} calls)`:``}
            </div>
            <button onClick={()=>setDrillDown(null)} style={{fontSize:11,padding:'4px 10px',border:'1px solid #d1d5db',background:'#fff',borderRadius:6,cursor:'pointer',fontFamily:'inherit',color:'#6b7280'}}>Close</button>
          </div>
          {drillLeads.length > 0 && (
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {drillLeads.slice(0,8).map(l=>(
                <div key={l.placeId} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,border:'1px solid #f0f0ec',background:'#fafaf9'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      <a href={l.mapsUrl} target="_blank" rel="noopener" style={{color:'#18181b',textDecoration:'none'}}>{l.name}</a>
                    </div>
                    <div style={{fontSize:10,color:'#9ca3af',marginTop:1}}>{l.addr.split(',').slice(0,2).join(',')}</div>
                  </div>
                  {l.phone&&<a href={`tel:${l.phone}`} style={{fontSize:11,color:'#16a34a',textDecoration:'none',fontWeight:500,flexShrink:0}}>{l.phone}</a>}
                  <span style={{fontSize:11,fontWeight:700,color:l.score>=8?'#dc2626':l.score>=5?'#d97706':'#6b7280',flexShrink:0}}>{l.score}/10</span>
                </div>
              ))}
              {drillLeads.length>8&&<div style={{fontSize:11,color:'#9ca3af',textAlign:'center',padding:'6px 0'}}>+{drillLeads.length-8} more leads in Saved Leads tab</div>}
            </div>
          )}
          {drillCalls.length > 0 && (
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {drillCalls.slice(0,8).map(c=>(
                <div key={c.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,border:'1px solid #f0f0ec',background:'#fafaf9'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600}}>{c.leadName}</div>
                    <div style={{fontSize:10,color:'#9ca3af',marginTop:1}}>{c.phone} · {c.startedAt?new Date(c.startedAt).toLocaleString():''}</div>
                  </div>
                  {c.duration&&<span style={{fontSize:11,color:'#6b7280',flexShrink:0}}>{Math.floor(c.duration/60)}:{String(c.duration%60).padStart(2,'0')}</span>}
                  {c.recordingUrl&&<a href={c.recordingUrl} target="_blank" rel="noopener" style={{fontSize:10,color:'#2563eb',textDecoration:'none',flexShrink:0}}>🎙 Recording</a>}
                  <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:99,background:c.outcome==='booked'?'#ede9fe':c.outcome==='answered'?'#dcfce7':c.outcome==='voicemail'?'#fef3c7':'#fee2e2',color:c.outcome==='booked'?'#5b21b6':c.outcome==='answered'?'#166534':c.outcome==='voicemail'?'#78350f':'#991b1b',flexShrink:0}}>{c.outcome}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
