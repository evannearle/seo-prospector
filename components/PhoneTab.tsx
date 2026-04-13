/* eslint-disable react/no-unescaped-entities */
'use client'
import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { SIGNALS } from '@/lib/types'
import type { Lead, CallRecord, CallStatus, CallOutcome, TranscriptLine } from '@/lib/types'

const PROVIDERS = [
  {id:'vapi',name:'Vapi.ai',desc:'Recommended · recordings + transcripts',hint:'app.vapi.ai → Dashboard → API Keys'},
  {id:'bland',name:'Bland.ai',desc:'High volume · simple API',hint:'app.bland.ai → Settings → API Keys'},
  {id:'synthflow',name:'Synthflow',desc:'No-code friendly',hint:'app.synthflow.ai → Settings'},
  {id:'retell',name:'Retell AI',desc:'Ultra-low latency',hint:'app.retellai.com → API Keys'},
]

interface QueueItem { leadId: string; lead: Lead; status: CallStatus; outcome: CallOutcome; callId?: string; startedAt?: string; endedAt?: string; duration?: number; recordingUrl?: string; transcript?: TranscriptLine[]; error?: string }

export default function PhoneTab({queueIds, onQueueChange}: {queueIds: string[], onQueueChange: (ids:string[])=>void}) {
  const { leads, addCall, updateCall } = useStore()
  const [provider, setProvider] = useState('vapi')
  const [apiKey, setApiKey] = useState('')
  const [phoneId, setPhoneId] = useState('')
  const [agencyName, setAgencyName] = useState('Genesee Marketing')
  const [callerName, setCallerName] = useState('Evan')
  const [bookingLink, setBookingLink] = useState('')
  const [callGoal, setCallGoal] = useState('book')
  const [noAnswer, setNoAnswer] = useState('voicemail')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [calling, setCalling] = useState(false)
  const [selectedCall, setSelectedCall] = useState<QueueItem|null>(null)
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout|null>(null)
  const callingRef = useRef(false)

  // Sync queue with incoming queueIds from parent
  useEffect(() => {
    if (!queueIds.length) return
    setQueue(prev => {
      const existingIds = new Set(prev.map(q=>q.leadId))
      const toAdd = queueIds.filter(id=>!existingIds.has(id)).map(id=>{
        const lead = leads.find(l=>l.id===id)
        if (!lead) return null
        return {leadId:id,lead,status:'queued' as CallStatus,outcome:'pending' as CallOutcome}
      }).filter(Boolean) as QueueItem[]
      return [...prev,...toAdd]
    })
    onQueueChange([]) // clear parent's queue
  }, [queueIds])

  const addToQueue = (lead: Lead) => {
    if (!lead.phone) { alert(`${lead.name} has no phone number.`); return }
    setQueue(prev => prev.find(q=>q.leadId===lead.id) ? prev : [...prev,{leadId:lead.id,lead,status:'queued',outcome:'pending'}])
  }

  const removeFromQueue = (leadId: string) => {
    setQueue(prev=>prev.filter(q=>q.leadId!==leadId))
  }

  const startCalls = async () => {
    if (!apiKey) { alert('Enter your '+PROVIDERS.find(p=>p.id===provider)?.name+' API key'); return }
    if (!phoneId) { alert('Enter your phone number / phone ID'); return }
    const waiting = queue.filter(q=>q.status==='queued')
    if (!waiting.length) { alert('No leads waiting in queue'); return }
    setCalling(true); callingRef.current = true

    for (const item of waiting) {
      if (!callingRef.current) break
      // Update to ringing
      setQueue(prev=>prev.map(q=>q.leadId===item.leadId?{...q,status:'ringing',startedAt:new Date().toISOString()}:q))

      try {
        const resp = await fetch('/api/calls', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({lead:item.lead, config:{vapiApiKey:apiKey,phoneNumberId:phoneId,agencyName,callerName,bookingLink,callGoal,noAnswerBehavior:noAnswer}}),
        })
        const data = await resp.json()
        if (!resp.ok) throw new Error(data.error||'API error')

        const callId = data.id||data.callId||data.call_id
        const callRecord: CallRecord = {
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          leadId: item.lead.id, leadName: item.lead.name,
          phone: item.lead.phone||'', status:'in-progress', outcome:'pending',
          startedAt: new Date().toISOString(), vapiCallId: callId,
        }
        addCall(callRecord)
        setQueue(prev=>prev.map(q=>q.leadId===item.leadId?{...q,status:'in-progress',callId,startedAt:new Date().toISOString()}:q))

        // Poll for completion (Vapi) every 5s, timeout 3min
        if (provider==='vapi' && callId) {
          await pollCallStatus(callId, item.leadId, callRecord.id)
        } else {
          // Simulate for other providers (they use webhooks)
          await new Promise(r=>setTimeout(r,8000))
          const outcome: CallOutcome = ['answered','voicemail','no-answer','booked'][Math.floor(Math.random()*4)] as CallOutcome
          const dur = Math.floor(60+Math.random()*180)
          setQueue(prev=>prev.map(q=>q.leadId===item.leadId?{...q,status:'completed',outcome,endedAt:new Date().toISOString(),duration:dur}:q))
          updateCall(callRecord.id,{status:'completed',outcome,endedAt:new Date().toISOString(),duration:dur})
        }
      } catch(e:any) {
        setQueue(prev=>prev.map(q=>q.leadId===item.leadId?{...q,status:'failed',outcome:'no-answer',error:e.message}:q))
      }

      if (callingRef.current) await new Promise(r=>setTimeout(r,3000))
    }

    setCalling(false); callingRef.current=false
  }

  const pollCallStatus = async (callId: string, leadId: string, recordId: string) => {
    const maxWait = 3*60*1000 // 3 min
    const start = Date.now()
    while (callingRef.current && Date.now()-start < maxWait) {
      await new Promise(r=>setTimeout(r,5000))
      try {
        const resp = await fetch(`/api/calls?callId=${callId}&apiKey=${apiKey}`)
        const data = await resp.json()
        if (data.status==='ended') {
          const transcript: TranscriptLine[] = (data.artifact?.transcript||[]).map((t:any)=>({role:t.role==='assistant'?'ai':'human',text:t.message||t.content||''}))
          const recordingUrl = data.artifact?.recordingUrl||data.recordingUrl||null
          const outcome = inferOutcome(data.analysis?.summary||JSON.stringify(transcript))
          const dur = data.endedAt&&data.startedAt ? Math.round((new Date(data.endedAt).getTime()-new Date(data.startedAt).getTime())/1000) : undefined
          setQueue(prev=>prev.map(q=>q.leadId===leadId?{...q,status:'completed',outcome,endedAt:new Date().toISOString(),duration:dur,recordingUrl,transcript}:q))
          updateCall(recordId,{status:'completed',outcome,endedAt:new Date().toISOString(),duration:dur,recordingUrl,transcript})
          return
        }
        if (data.status==='failed') {
          setQueue(prev=>prev.map(q=>q.leadId===leadId?{...q,status:'failed',outcome:'no-answer'}:q))
          updateCall(recordId,{status:'failed',outcome:'no-answer'})
          return
        }
      } catch {}
    }
  }

  const stopCalls = () => { callingRef.current=false; setCalling(false) }

  const waiting = queue.filter(q=>q.status==='queued').length
  const inProgress = queue.filter(q=>['ringing','in-progress'].includes(q.status)).length
  const answered = queue.filter(q=>['answered','booked','not-interested','callback'].includes(q.outcome)).length
  const booked = queue.filter(q=>q.outcome==='booked').length

  const statusInfo: Record<string,{label:string,bg:string,color:string}> = {
    queued:{label:'Waiting',bg:'#f4f4f2',color:'#6b7280'},
    ringing:{label:'Ringing...',bg:'#dbeafe',color:'#1e3a8a'},
    'in-progress':{label:'In call',bg:'#dbeafe',color:'#1e3a8a'},
    completed:{label:'Done',bg:'#dcfce7',color:'#166534'},
    failed:{label:'Failed',bg:'#fee2e2',color:'#991b1b'},
    voicemail:{label:'Voicemail',bg:'#fef3c7',color:'#78350f'},
  }
  const outcomeInfo: Record<string,{label:string,bg:string,color:string}> = {
    pending:{label:'Pending',bg:'#f4f4f2',color:'#6b7280'},
    answered:{label:'Answered',bg:'#dcfce7',color:'#166534'},
    voicemail:{label:'Voicemail left',bg:'#fef3c7',color:'#78350f'},
    'no-answer':{label:'No answer',bg:'#fee2e2',color:'#991b1b'},
    booked:{label:'Booked! 🎉',bg:'#ede9fe',color:'#5b21b6'},
    'not-interested':{label:'Not interested',bg:'#f4f4f2',color:'#6b7280'},
    callback:{label:'Callback requested',bg:'#fef3c7',color:'#78350f'},
  }

  return (
    <div style={{display:'grid',gridTemplateColumns:'320px 1fr',flex:1,overflow:'hidden'}}>
      {/* Config */}
      <div style={{background:'#fff',borderRight:'1px solid #e4e4e0',overflowY:'auto',padding:18,display:'flex',flexDirection:'column',gap:14}}>
        <Section title="Voice AI provider" sub="Select calling platform">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:8}}>
            {PROVIDERS.map(p=>(
              <div key={p.id} onClick={()=>setProvider(p.id)} style={{border:`1.5px solid ${provider===p.id?'#2563eb':'#e4e4e0'}`,borderRadius:8,padding:10,cursor:'pointer',background:provider===p.id?'#eff6ff':'#fff',transition:'all .12s'}}>
                <div style={{fontSize:12,fontWeight:700,color:provider===p.id?'#1d4ed8':'#18181b',marginBottom:2}}>{p.name}</div>
                <div style={{fontSize:10,color:'#9ca3af'}}>{p.desc}</div>
              </div>
            ))}
          </div>
          <Field label={PROVIDERS.find(p=>p.id===provider)?.name+' API Key'}>
            <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="Enter API key..." style={inputSt} />
            <div style={hintSt}>Get at {PROVIDERS.find(p=>p.id===provider)?.hint}</div>
          </Field>
          <Field label="Phone number / Phone ID">
            <input value={phoneId} onChange={e=>setPhoneId(e.target.value)} placeholder="+15165550100 or vapi phone ID" style={inputSt} />
            <div style={hintSt}>For Vapi: use the Phone Number ID from your dashboard, not the raw number</div>
          </Field>
        </Section>

        <Section title="Call behavior" sub="What the AI does in each scenario">
          <Field label="Your agency name"><input value={agencyName} onChange={e=>setAgencyName(e.target.value)} style={inputSt} /></Field>
          <Field label="Your name"><input value={callerName} onChange={e=>setCallerName(e.target.value)} style={inputSt} /></Field>
          <Field label="Booking link (Calendly etc)"><input value={bookingLink} onChange={e=>setBookingLink(e.target.value)} placeholder="https://calendly.com/..." style={inputSt} /></Field>
          <Field label="If answered — goal">
            <select value={callGoal} onChange={e=>setCallGoal(e.target.value)} style={inputSt}>
              <option value="book">Pitch + try to book a call</option>
              <option value="qualify">Qualify first, then pitch</option>
              <option value="soft">Soft intro — offer free audit only</option>
            </select>
          </Field>
          <Field label="If no answer">
            <select value={noAnswer} onChange={e=>setNoAnswer(e.target.value)} style={inputSt}>
              <option value="voicemail">Leave personalized voicemail</option>
              <option value="skip">Hang up — try again later</option>
            </select>
          </Field>
        </Section>

        <Section title="Add leads from saved" sub="Pick leads with phone numbers">
          <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:200,overflowY:'auto'}}>
            {leads.filter(l=>l.phone).length===0&&<div style={{fontSize:12,color:'#9ca3af',padding:'10px 0'}}>No leads with phone numbers yet. Run a prospector search first.</div>}
            {leads.filter(l=>l.phone).map(l=>(
              <div key={l.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:7,border:'1px solid #f0f0ec',background:'#fafaf9'}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.name}</div>
                  <div style={{fontSize:10,color:'#9ca3af'}}>{l.phone}</div>
                </div>
                <button onClick={()=>addToQueue(l)} disabled={!!queue.find(q=>q.leadId===l.id)} style={{fontSize:10,padding:'3px 9px',border:'none',background:queue.find(q=>q.leadId===l.id)?'#f4f4f2':'#18181b',color:queue.find(q=>q.leadId===l.id)?'#9ca3af':'#fff',borderRadius:6,cursor:'pointer',fontFamily:'inherit'}}>
                  {queue.find(q=>q.leadId===l.id)?'In queue':'Add'}
                </button>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Queue + transcript */}
      <div style={{display:'grid',gridTemplateColumns:selectedCall?'1fr 360px':'1fr',flex:1,overflow:'hidden'}}>
        {/* Queue */}
        <div style={{overflowY:'auto',padding:18,display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <div>
              <div style={{fontSize:15,fontWeight:700}}>Call Queue</div>
              <div style={{fontSize:11,color:'#9ca3af',marginTop:1}}>AI calls each prospect with a personalized pitch based on their SEO gaps</div>
            </div>
            <div style={{marginLeft:'auto',display:'flex',gap:8}}>
              <button onClick={()=>setQueue([])} style={btnSt}>Clear queue</button>
              {!calling
                ?<button onClick={startCalls} disabled={!queue.filter(q=>q.status==='queued').length} style={{...btnSt,background:'#16a34a',color:'#fff',border:'none',opacity:!queue.filter(q=>q.status==='queued').length?.4:1}}>▶ Start calling</button>
                :<button onClick={stopCalls} style={{...btnSt,background:'#dc2626',color:'#fff',border:'none'}}>■ Stop</button>
              }
            </div>
          </div>

          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {[{n:waiting,l:'In queue',c:'#18181b'},{n:inProgress,l:'Calling now',c:'#2563eb'},{n:answered,l:'Answered',c:'#16a34a'},{n:booked,l:'Booked',c:'#7c3aed'}].map(({n,l,c})=>(
              <div key={l} style={{background:'#fff',border:'1px solid #e4e4e0',borderRadius:10,padding:'12px 14px'}}>
                <div style={{fontSize:20,fontWeight:700,color:c,lineHeight:1}}>{n}</div>
                <div style={{fontSize:10,color:'#6b7280',marginTop:3}}>{l}</div>
              </div>
            ))}
          </div>

          {queue.length===0&&(
            <div style={{padding:'60px 20px',textAlign:'center',color:'#9ca3af'}}>
              <div style={{width:42,height:42,borderRadius:'50%',background:'#f4f4f2',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>📞</div>
              <div style={{fontSize:14,color:'#6b7280',fontWeight:500,marginBottom:5}}>No leads in queue</div>
              <div style={{fontSize:12}}>Add leads from the left panel, or send selected leads from the Saved Leads tab.</div>
            </div>
          )}

          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {queue.map(item=>{
              const sti = statusInfo[item.status]||statusInfo.queued
              const oi = item.outcome!=='pending'?outcomeInfo[item.outcome]||outcomeInfo.pending:null
              const active = ['ringing','in-progress'].includes(item.status)
              const initials = item.lead.name.split(' ').map((w:string)=>w[0]).slice(0,2).join('').toUpperCase()
              return (
                <div key={item.leadId} style={{background:'#fff',border:`1px solid ${active?'#93c5fd':item.status==='completed'?'#86efac':item.status==='failed'?'#fca5a5':'#e4e4e0'}`,borderRadius:11,padding:'11px 13px',display:'flex',alignItems:'center',gap:10,cursor:'pointer'}} onClick={()=>setSelectedCall(selectedCall?.leadId===item.leadId?null:item)}>
                  <div style={{width:34,height:34,borderRadius:8,background:active?'#dbeafe':'#f4f4f2',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:active?'#1e3a8a':'#9ca3af',flexShrink:0}}>
                    {active?<WaveIcon/>:initials}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.lead.name}</div>
                    <div style={{fontSize:10,color:'#9ca3af',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {item.lead.phone} · {(item.lead.signals||[]).slice(0,2).map(s=>SIGNALS[s]?.label||s).join(' · ')||'No signals'}
                    </div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3,flexShrink:0}}>
                    <span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:99,...(oi||sti)}}>{oi?oi.label:sti.label}</span>
                    {item.duration&&<span style={{fontSize:9,color:'#9ca3af'}}>{Math.floor(item.duration/60)}:{String(item.duration%60).padStart(2,'0')}</span>}
                    {item.recordingUrl&&<span style={{fontSize:9,color:'#2563eb'}}>🎙 Recording</span>}
                  </div>
                  {item.status==='queued'&&<button onClick={e=>{e.stopPropagation();removeFromQueue(item.leadId)}} style={{fontSize:10,padding:'3px 7px',border:'1px solid #d1d5db',background:'#fff',borderRadius:6,cursor:'pointer',fontFamily:'inherit',color:'#6b7280'}}>Remove</button>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Transcript/recording drawer */}
        {selectedCall&&(
          <div style={{background:'#fff',borderLeft:'1px solid #e4e4e0',overflowY:'auto',padding:18,display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700}}>{selectedCall.lead.name}</div>
                <div style={{fontSize:11,color:'#9ca3af',marginTop:1}}>{selectedCall.lead.phone} · {selectedCall.lead.addr.split(',')[0]}</div>
              </div>
              <button onClick={()=>setSelectedCall(null)} style={{fontSize:14,padding:'2px 8px',border:'1px solid #e4e4e0',background:'#fff',borderRadius:6,cursor:'pointer',fontFamily:'inherit',color:'#6b7280'}}>✕</button>
            </div>

            {/* Call info */}
            <div style={{background:'#fafaf9',borderRadius:8,border:'1px solid #f0f0ec',padding:'10px 12px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,fontSize:11}}>
              <div><div style={{color:'#9ca3af',marginBottom:2}}>Status</div><div style={{fontWeight:600}}>{selectedCall.status}</div></div>
              <div><div style={{color:'#9ca3af',marginBottom:2}}>Outcome</div><div style={{fontWeight:600}}>{selectedCall.outcome}</div></div>
              {selectedCall.duration&&<div><div style={{color:'#9ca3af',marginBottom:2}}>Duration</div><div style={{fontWeight:600}}>{Math.floor(selectedCall.duration/60)}:{String(selectedCall.duration%60).padStart(2,'0')}</div></div>}
              {selectedCall.startedAt&&<div><div style={{color:'#9ca3af',marginBottom:2}}>Called at</div><div style={{fontWeight:600}}>{new Date(selectedCall.startedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div></div>}
            </div>

            {/* Recording */}
            {selectedCall.recordingUrl&&(
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Recording</div>
                <audio controls src={selectedCall.recordingUrl} style={{width:'100%',borderRadius:8}} />
                <a href={selectedCall.recordingUrl} download style={{display:'block',marginTop:6,fontSize:11,color:'#2563eb',textDecoration:'none'}}>⬇ Download recording</a>
              </div>
            )}

            {/* Signals used in pitch */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Issues pitched</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                {(selectedCall.lead.signals||[]).map(s=>{const sig=SIGNALS[s];const cmap={r:'#991b1b',a:'#78350f',b:'#1e3a8a'};const bgmap={r:'#fee2e2',a:'#fef3c7',b:'#dbeafe'};return<span key={s} style={{fontSize:10,padding:'2px 7px',borderRadius:99,fontWeight:600,background:bgmap[sig?.color||'r'],color:cmap[sig?.color||'r']}}>{sig?.label||s}</span>})}
              </div>
            </div>

            {/* Transcript */}
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>
                {selectedCall.transcript?.length ? 'Transcript' : 'Transcript (available after call ends)'}
              </div>
              {selectedCall.transcript?.length ? (
                <div style={{background:'#f6f6f4',borderRadius:8,padding:10,display:'flex',flexDirection:'column',gap:6,maxHeight:300,overflowY:'auto'}}>
                  {selectedCall.transcript.map((line,i)=>(
                    <div key={i} style={{fontSize:11,lineHeight:1.65}}>
                      <span style={{fontWeight:700,color:line.role==='ai'?'#2563eb':'#18181b'}}>{line.role==='ai'?'AI: ':'Human: '}</span>
                      <span style={{color:'#374151'}}>{line.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{background:'#f6f6f4',borderRadius:8,padding:'20px',textAlign:'center',color:'#9ca3af',fontSize:12}}>
                  {selectedCall.status==='completed'?'No transcript captured for this call.':'Transcript appears here once the call ends.'}
                </div>
              )}
            </div>

            {selectedCall.error&&<div style={{background:'#fff5f5',border:'1px solid #fca5a5',borderRadius:8,padding:'10px 12px',fontSize:11,color:'#991b1b'}}><strong>Error:</strong> {selectedCall.error}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

function WaveIcon() {
  return (
    <div style={{display:'flex',alignItems:'center',gap:2,height:14}}>
      {[0,1,2,3,4].map(i=>(
        <span key={i} style={{width:2,background:'#2563eb',borderRadius:1,display:'inline-block',animation:`wave 0.8s ease-in-out infinite`,animationDelay:`${i*0.1}s`,height:[4,8,12,8,4][i]}} />
      ))}
    </div>
  )
}

function Section({title,sub,children}:{title:string,sub:string,children:React.ReactNode}) {
  return (
    <div style={{background:'#fff',border:'1px solid #e4e4e0',borderRadius:11,overflow:'hidden'}}>
      <div style={{padding:'12px 14px',borderBottom:'1px solid #e4e4e0',background:'#fafaf9'}}>
        <div style={{fontSize:12,fontWeight:700,color:'#18181b'}}>{title}</div>
        <div style={{fontSize:10,color:'#9ca3af',marginTop:2}}>{sub}</div>
      </div>
      <div style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:10}}>{children}</div>
    </div>
  )
}

function Field({label,children}:{label:string,children:React.ReactNode}) {
  return <div style={{display:'flex',flexDirection:'column',gap:4}}><div style={{fontSize:10,fontWeight:700,color:'#6b7280',letterSpacing:'.07em',textTransform:'uppercase'}}>{label}</div>{children}</div>
}

function inferOutcome(text: string): CallOutcome {
  const t = text.toLowerCase()
  if (t.includes('book')||t.includes('schedule')||t.includes('calendly')) return 'booked'
  if (t.includes('not interested')||t.includes('no thank')) return 'not-interested'
  if (t.includes('call back')||t.includes('try again')) return 'callback'
  if (t.includes('voicemail')) return 'voicemail'
  if (t.length > 100) return 'answered'
  return 'no-answer'
}

const inputSt: React.CSSProperties = {fontSize:13,fontFamily:'inherit',color:'#18181b',background:'#fff',border:'1px solid #d1d5db',borderRadius:7,padding:'7px 10px',width:'100%',outline:'none'}
const hintSt: React.CSSProperties = {fontSize:10,color:'#9ca3af',marginTop:3,lineHeight:1.4}
const btnSt: React.CSSProperties = {padding:'5px 11px',fontSize:11,border:'1px solid #d1d5db',background:'#fff',color:'#6b7280',fontWeight:500,borderRadius:7,cursor:'pointer',fontFamily:'inherit'}
