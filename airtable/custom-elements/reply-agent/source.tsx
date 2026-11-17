import React, {useEffect, useMemo, useState} from 'react';
import {initializeBlock, useBase, useCustomProperties, useRecords} from '@airtable/blocks/interface/ui';

const CLIENT_DRAFT_WORKSPACES = ["recaG8oBGaBKbWlns", "recZgKU0gdB9AIZ5x", "recbxOWoWWD8IN8Mn", "reciYGfy3bI9jsVDo", "recaSYeQ1KbhUGeAW", "recynyHPighsOPpjd", "recBP0AXQ0UYfTYz1"];
type AnyTable = any;
type AnyRecord = any;
type Tab = 'overview' | 'company' | 'calendar' | 'routing' | 'followups' | 'responses' | 'knowledge' | 'analytics';
type JsonObject = Record<string, any>;

const FIELDS = {
    key: 'fld54W6mFFiyDS2GL', workspaceName: 'fldO6QhPz8ReIGBxw', enabled: 'fldqI3VcgPUeWI60H',
    defaultMode: 'fldIIkTotAvrqi7WF', oooMode: 'fldcba1likLIMjkea', notInterested: 'fldYkwrmUogVgsI2N',
    confidence: 'fld7Bjd2KnCjOtGIK', maxReplies: 'fldnsRZgKXVv5NhRO', tone: 'fldSz9CysyrPqN2rA',
    length: 'fldmCrXWamoNOs17W', timezone: 'fldcBBsXcarCHKoI8', officeStart: 'fldQ4e50wL9lea4Cx',
    officeEnd: 'fldzgbnlcTlN4tQje', weekends: 'fldnXSFQCpdMnba7D', holidays: 'fldIzZ9lIwNHTyiig',
    calendarLink: 'fldK1cx8ZEqC5Xsff', followupInstructions: 'fldO50bAy4bBYiacE', companyContext: 'fldKu9AF0RuVTXJ5H',
    enabledTypes: 'flddSM1kupkCo49or', humanReview: 'fldmU2ih3L1NRprfm', calendarProvider: 'fldUajoXDZicmMJRt',
    calendarStatus: 'fldwRUzLewRqsUAti', agentFirst: 'fldwMzNcUDioaFW5C', agentLast: 'fldVnDq9NJxl82dXZ',
    companyUrl: 'fldeGz32IZ7B3nVk8', companyName: 'fldT97k4Feagaun6X', integrations: 'fldXwpm0C68gtn04z',
    objective: 'fldiQFAdqLnTTUClT', calendar: 'fldpfjITDZ7QlfKDw', routing: 'flduImNf3CFEgqddR',
    followups: 'fldr6fdz5OSC1AaK2', responses: 'fld7ACUDscpAqBAmQ', ccBcc: 'fld6IMBSfPS5VSTBy', knowledge: 'fldZorQ63FO9Y6zTC',
    handoffMode: 'fldssDmUzMyi4RahX',
    calendarRequest:'fldVSFHdZqjipZdpW',calendarResult:'fldKKuVzaRvoAFv7e',calendarSnapshot:'fldja89IBFvNhZVaN',
} as const;

const TABS: {id: Tab; label: string}[] = [
    {id:'overview',label:'Overview'}, {id:'company',label:'Company & Agent'}, {id:'calendar',label:'Calendar'},
    {id:'routing',label:'Reply Controls'}, {id:'followups',label:'Follow-ups'}, {id:'responses',label:'Response Style'},
    {id:'knowledge',label:'Knowledge Base'}, {id:'analytics',label:'Analytics'},
];

const INTENTS = ['Interested','Info Request','Meeting Request','Cost Objection','Process Objection','Not Interested','Out of Office','Check Back Later','Referred','Wrong Person','Unsubscribe','Hostile'];
const DEFAULT_GROUPS = [
    {name:'Interested replies', intents:['Interested','Info Request','Cost Objection','Process Objection'], mode:'Approval Required'},
    {name:'Meeting requests', intents:['Meeting Request'], mode:'Approval Required'},
    {name:'Follow-up later', intents:['Out of Office','Check Back Later'], mode:'Approval Required'},
    {name:'Soft no', intents:['Not Interested','Wrong Person'], mode:'Approval Required'},
    {name:'Delegated', intents:['Referred'], mode:'Approval Required'},
    {name:'Never reply', intents:['Unsubscribe','Hostile'], mode:'Do Not Reply'},
];
const DEFAULT_FOLLOWUPS = [
    {delay:1,unit:'days',calendar:false,slots:false,message:'Answer any unresolved question or fulfill an outstanding promise using approved information. Add a useful next step and one relevant question. Never use a generic bump, thank them for replying, or invent an asset or available time.'},
    {delay:2,unit:'days',calendar:false,slots:false,message:'Add one new proof point or useful insight connected to the prospect\'s reply. Do not repeat the first follow-up.'},
    {delay:3,unit:'days',calendar:false,slots:false,message:'Ask one direct, low-pressure question about whether this is worth revisiting or whether you should close the thread.'},
];

function getCustomProperties(base: ReturnType<typeof useBase>) {
    const table = base.tables.find(t => t?.name === 'Dulcy Reply Agent Settings');
    const clients = base.tables.find(t => t?.name === 'Workspace IDs');
    const onboarding = base.tables.find(t => t?.name === 'Onboarding');
    return [
        {key:'settingsTable',label:'Reply Agent settings',type:'table' as const,defaultValue:table},
        {key:'clientsTable',label:'Workspaces',type:'table' as const,defaultValue:clients},
        {key:'onboardingTable',label:'Onboarding',type:'table' as const,defaultValue:onboarding},
        {key:'analyticsTable',label:'Analytics',type:'table' as const,defaultValue:base.tables.find(t=>t?.name==='Reply Analytics Daily')},
    ];
}
function calendarPreferences(draft: JsonObject = {}, saved: JsonObject = {}) {
    const result = {...draft};
    for (const key of ['activeCalendars','connectionStatus','integrationNote','connectedAccount','connectionCheckedAt','connectionRevision','duration','buffer']) {
        if (Object.prototype.hasOwnProperty.call(saved,key)) result[key]=saved[key];
        else delete result[key];
    }
    return result;
}

function validateReplySettings(draft: JsonObject) {
    try { new Intl.DateTimeFormat('en-US',{timeZone:draft.timezone}).format(new Date()); }
    catch { throw Error('Choose a valid timezone, for example America/New_York.'); }
    if(!draft.timezone)throw Error('Timezone is required.');
    const time=/^([01]\d|2[0-3]):[0-5]\d$/;
    if(!time.test(draft.officeStart||'')||!time.test(draft.officeEnd||'')||draft.officeStart>=draft.officeEnd)
        throw Error('Office hours need a valid start time before the end time on the same day.');
    if(!Number.isFinite(Number(draft.confidence))||Number(draft.confidence)<0.5||Number(draft.confidence)>1)
        throw Error('Reply confidence must be between 50% and 100%.');
    if(draft.defaultMode&&draft.defaultMode!=='Approval Required')throw Error('Automatic sending is not enabled. Keep Human in the Loop selected.');
    if(draft.oooMode&&draft.oooMode!=='Approval Required')throw Error('Out-of-office sending requires human review.');
    for(const group of draft.routing?.groups||[])if(!['Approval Required','Do Not Reply'].includes(group.mode))throw Error('Choose Human in the Loop or Do not draft for '+group.name+'.');
    const limit=Number(draft.ccBcc?.autoDeactivateGeneration||0);
    if(!Number.isInteger(limit)||limit<0)throw Error('The generation limit must be a whole number of zero or more.');
    if(draft.objective?.goal==='Other'&&!String(draft.objective.customGoal||'').trim())throw Error('Describe your custom objective before saving.');
    const checkUrl=(value:any,label:string)=>{if(!String(value||'').trim())return;try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol))throw Error();}catch{throw Error(label+' must be a complete http or https link.');}};
    checkUrl(draft.calendarLink,'Calendar booking link');
    if(String(draft.calendarLink||'').trim()){const u=new URL(draft.calendarLink);if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||/^[\d.]+$/.test(u.hostname)||/\.(?:local|internal|localhost)$/.test(u.hostname))throw Error('Use a public HTTPS booking link without embedded account credentials.');}
    for(const [i,asset] of (draft.knowledge?.assets||[]).entries()){
        if(!String(asset.description||'').trim()||!String(asset.url||'').trim())throw Error('Add a description and link for asset '+(i+1)+', or remove it.');
        checkUrl(asset.url,'Asset '+(i+1));
    }
    if(draft.followups?.enabled&&!(draft.followups.steps||[]).length)throw Error('Add a follow-up step or disable the follow-up plan.');
    for(const [i,step] of (draft.followups?.steps||[]).entries()){
        if(!Number.isFinite(Number(step.delay))||Number(step.delay)<=0||Number(step.delay)>90||!['hours','days'].includes(step.unit))throw Error('Follow-up '+(i+1)+' needs a delay greater than zero and no more than 90 hours or days.');
        if(!String(step.message||'').trim())throw Error('Add instructions for follow-up '+(i+1)+', or remove it.');
    }
}

function field(table: AnyTable, id: string) { return table?.fields?.find((f:any)=>f?.id===id) ?? null; }
function namedField(table: AnyTable, names: string[]) { return names.map(name=>table?.fields?.find((f:any)=>f?.name===name)).find(Boolean) ?? null; }
function raw(record: AnyRecord, table: AnyTable, id: string): any {
    const f=field(table,id); if(!record||!f)return null;
    try{return record.getCellValue(f.id);}catch{return null;}
}
function text(record: AnyRecord, table: AnyTable, id: string): string {
    const value=raw(record,table,id);
    if(value==null)return '';
    if(typeof value==='string'||typeof value==='number')return String(value);
    if(value?.name)return value.name;
    return '';
}
function cellText(record: AnyRecord, table: AnyTable, names: string[]): string {
    const f=namedField(table,names); if(!record||!f)return '';
    try {
        const value=record.getCellValue(f.id);
        const unwrap=(v:any):string=>{
            if(v==null)return '';
            if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')return String(v).trim();
            if(Array.isArray(v))return v.map(unwrap).filter(Boolean).join(', ').trim();
            if(typeof v==='object'){
                for(const key of ['name','text','url','value','values']){
                    if(key in v){const result=unwrap(v[key]);if(result)return result;}
                }
            }
            return '';
        };
        const resolved=unwrap(value); if(resolved)return resolved;
        return record.getCellValueAsString?.(f.id)?.trim?.()||'';
    } catch { return ''; }
}
function linkedIds(value:any): string[] {
    const ids=new Set<string>();
    const visit=(v:any)=>{
        if(v==null)return;
        if(typeof v==='string'){
            if(v.startsWith('rec'))ids.add(v);
            return;
        }
        if(Array.isArray(v)){v.forEach(visit);return;}
        if(typeof v==='object'){
            if(typeof v.id==='string'&&v.id.startsWith('rec'))ids.add(v.id);
            if(Array.isArray(v.linkedRecordIds))v.linkedRecordIds.forEach(visit);
            if(v.valuesByLinkedRecordId&&typeof v.valuesByLinkedRecordId==='object')Object.keys(v.valuesByLinkedRecordId).forEach(visit);
            if('value' in v)visit(v.value);
            if('values' in v)visit(v.values);
        }
    };
    visit(value);
    return [...ids];
}
function splitName(value:string): {first:string;last:string} {
    const parts=String(value||'').trim().split(/\s+/).filter(Boolean);
    return {first:parts[0]||'',last:parts.slice(1).join(' ')};
}
function inheritedInstructions(onboarding:AnyRecord,onboardingTable:AnyTable): string {
    if(!onboarding||!onboardingTable)return '';
    const sections:[string,string[]][]=[
        ['OBJECTIVE',['How many sales appointments would you like to book per month?']],
        ['WHAT THE COMPANY SELLS',['What EXACTLY do you sell?','Walk us through your fulfillment process from beginning to end.']],
        ['PROBLEM IT SOLVES',['What problems typically cause someone to start looking for a solution like yours?','Before working with you, what were your clients doing to solve the problem your offer now solves?','How much time or energy were they spending on that approach?']],
        ['WHO IT IS FOR',['Who EXACTLY is your Target Market?','Industry of your ideal clients:','Additional Industry(s) of your ideal clients:','Company size of your ideal clients:','Estimated Annual Revenue of your ideal clients:','Job Title(s) of your ideal clients:','Location(s) of your ideal clients?','Is there anything else we should know about your ideal client?']],
        ['OFFER AND DIFFERENTIATION',['Why do clients choose you instead of competitors?','What is your risk reversal/guarantee?','How long does it typically take clients to see results?','Any other information you want to add about your offer?']],
        ['PRICING',['How does your pricing work?']],
        ['PROOF',['What are some notable case studies/client success stories that you can share?','Please type out any RESULTS you\'ve gotten for your clients.','What is your most recent CASE STUDY and what positive results did you achieve?','Client Interviews/Testimonials/Case Studies']],
        ['SALES AND RESPONSE CONTEXT',['Do you have a sales framework for cold leads?','Have you successfully closed clients from outbound before?','What did they find most appealing or different about your approach?','What other tools, freelancers, or solutions did they try before choosing you?']],
        ['ADDITIONAL NOTES',['Last question - Is there anything else that you would like to mention before we get started?']],
    ];
    return sections.map(([heading,names])=>{
        const rows=names.map(name=>[name,cellText(onboarding,onboardingTable,[name])] as const).filter(([,value])=>Boolean(value));
        return rows.length?heading+'\n'+rows.map(([name,value])=>name+': '+value).join('\n'):'';
    }).filter(Boolean).join('\n\n').slice(0,8500);
}
function parseJson(record: AnyRecord, table: AnyTable, id: string, fallback: JsonObject): JsonObject {
    try { const v=text(record,table,id); return v ? {...fallback,...JSON.parse(v)} : fallback; } catch { return fallback; }
}
function meetingFormatPreview(settings:any={},timezone='America/New_York',at='2026-10-12T17:00:00Z') {
 try {
  const date=new Date(at),value=(type:string)=>parts.find(p=>p.type===type)?.value||'';
  if(settings.customFormat!==true)return new Intl.DateTimeFormat('en-US',{timeZone:timezone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date);
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,weekday:settings.day==='Full'?'long':'short',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true,timeZoneName:'short'}).formatToParts(date);
  const weekday=settings.day==='None'?'':value('weekday');
  const numeric=new Intl.DateTimeFormat('en-US',{timeZone:timezone,month:'numeric',day:'numeric'}).format(date);
  const calendarDate=settings.date==='None'?'':settings.date==='Month D'?value('month')+' '+value('day'):numeric;
  const dayLabel=[weekday,calendarDate].filter(Boolean).join(', ');
  const meridiem=settings.ampm==='Uppercase'?value('dayPeriod').toUpperCase():value('dayPeriod').toLowerCase();
  const time=value('hour')+(settings.omitZero===true&&value('minute')==='00'?'':':'+value('minute'))+meridiem;
  const zone=settings.timezoneStyle==='None'?'':settings.timezoneStyle==='Uppercase'?value('timeZoneName').toUpperCase():value('timeZoneName').toLowerCase();
  const joiner=['@','at','-'].includes(settings.joiner)?settings.joiner:'@';
  return [dayLabel,dayLabel?joiner:'',time,zone].filter(Boolean).join(' ');
 } catch {return 'Choose a valid workspace timezone to preview the format.';}
}

function parseRecipientList(value:any):string[] {
 const tokens=(Array.isArray(value)?value.join('\n'):String(value||'')).split(/[,;\n]+/).map((v:string)=>v.trim()).filter(Boolean);
 const invalid=tokens.filter((v:string)=>! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v));
 if(invalid.length)throw Error('Check these email addresses: '+invalid.join(', '));
 return [...new Set(tokens.map((v:string)=>v.toLowerCase()))];
}

function Toggle({value,onChange,label,disabled=false}:{value:boolean;onChange:(v:boolean)=>void;label?:string;disabled?:boolean}) {
    return <button type="button" className={'toggle '+(value?'on':'')} disabled={disabled} onClick={()=>onChange(!value)} aria-pressed={value}><span/>{label&&<b>{label}</b>}</button>;
}
function Field({label,children,hint}:{label:string;children:React.ReactNode;hint?:string}) {
    return <label className="field"><span className="label">{label}</span>{children}{hint&&<small>{hint}</small>}</label>;
}
function Section({title,description,children}:{title:string;description?:string;children:React.ReactNode}) {
    return <section className="card"><div className="cardHead"><h3>{title}</h3>{description&&<p>{description}</p>}</div>{children}</section>;
}
function ModePicker({value,onChange}:{value:string;onChange:(v:string)=>void}) {
    const options=[{value:'Approval Required',label:'Human in the Loop'},{value:'Do Not Reply',label:'Do not draft'},{value:'Auto High Confidence',label:'Autopilot — not enabled'}];
    return <div className="segmented">{options.map(v=><button type="button" key={v.value} className={value===v.value?'active':''} disabled={v.value==='Auto High Confidence'} title={v.value==='Auto High Confidence'?'Automatic sending is not enabled. Human review remains required.':undefined} onClick={()=>onChange(v.value)}>{v.label}</button>)}</div>;
}
function controlLabel(value:string){return value==='Approval Required'?'Human in the Loop':value==='Auto High Confidence'||value==='Full Auto'||value==='Autopilot'?'Autopilot — High Confidence':value;}

// Aggregate only provider-backed, non-overlapping responder cohorts.
function aggregateDashboard(rows:any[],{workspaceId,from,to,responder='All'}:{workspaceId:string;from:string;to:string;responder?:string}){
 const groups=new Map<string,any>();
 for(const input of rows){const r=input.fields||input,key=r['Snapshot Key'];if(typeof key!=='string'||!key.startsWith('v2|')||r['Workspace Record ID']!==workspaceId||r['Responder Type']!==responder||r.Date<from||r.Date>to)continue;const old=groups.get(key);if(!old||String(r['Last Calculated At']||'')>String(old['Last Calculated At']||''))groups.set(key,r);}
 const selected=[...groups.values()],num=(v:any)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
 const sum=(key:string)=>selected.reduce((total,r)=>total+(num(r[key])??0),0);
 const weighted=(mean:string,count:string)=>{let total=0,n=0;for(const r of selected){const m=num(r[mean]),c=num(r[count]);if(m!==null&&c!==null&&c>0){total+=m*c;n+=c;}}return n?total/n:null;};
 const measured=sum('Measured First Responses'),positive=sum('Positive Replies'),ai=sum('AI Replies Sent'),human=sum('Human Replies Sent'),unknown=sum('Unknown Responder Replies');
 const bookingKnown=sum('Inbound Replies')>0&&selected.every(r=>num(r['Meetings Booked'])!==null&&num(r['Positive Meetings Booked'])!==null);
 return {rows:selected,conversations:sum('Inbound Replies'),positive,ai,human,unknown,unanswered:sum('Unanswered Replies'),review:sum('Human Review Count'),errors:sum('AI Errors'),measured,
 avgResponse:weighted('Avg First Response Minutes','Measured First Responses'),avgTouches:weighted('Avg Touchpoints to Meeting','Measured Meeting Touches'),avgBookingHours:weighted('Avg First Response to Booked Hours','Measured Booking Response Times'),
 meetings:bookingKnown?sum('Meetings Booked'):null,conversion:bookingKnown&&positive?sum('Positive Meetings Booked')/positive:null,sla:measured?sum('Responses Within 15 Minutes')/measured:null,automation:ai+human+unknown>0&&unknown===0?ai/(ai+human):null,
 coverage:selected.length&&selected.every(r=>r['Data Coverage']==='Complete')?'Complete':selected.length?(selected.every(r=>r['Data Coverage']==='Insufficient')?'Insufficient':'Partial'):'No data',updated:selected.map(r=>r['Last Calculated At']).filter(Boolean).sort().pop()||null};
}

function ReplyAnalytics({table,records,workspaceId}:{table:any;records:any[];workspaceId:string}) {
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const [from,setFrom]=useState(()=>new Date(Date.now()-30*86400000).toISOString().slice(0,10));
    const [to,setTo]=useState(today);
    const [responder,setResponder]=useState('All');
    const rows=useMemo(()=>records.map(r=>({fields:Object.fromEntries((table?.fields||[]).map((f:any)=>{let value;try{value=r.getCellValue(f.id)}catch{value=null}return [f.name,value?.name??value]}))})),[records,table]);
    const stats=aggregateDashboard(rows,{workspaceId,from,to,responder});
    const value=(n:any,suffix='')=>n==null?'Not verified':new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(n)+suffix;
    const rate=(n:any)=>n==null?'Not verified':value(n*100,'%');
    if(!table)return <Section title="Reply analytics"><p className="warning">Select Reply Analytics Daily in the Analytics custom property to connect reporting.</p></Section>;
    return <>
      <Section title="Reply performance" description="Conversations grouped by their first human reply date. Automatic replies and bounces are excluded.">
        <div className="row" style={{marginBottom:18,flexWrap:'wrap'}}>{[7,30,90].map(days=><button type="button" className="save" key={days} onClick={()=>{setFrom(new Date(Date.now()-(days-1)*86400000).toISOString().slice(0,10));setTo(today)}}>Last {days} days</button>)}</div>
        <div className="grid3"><Field label="From (New York date)"><input aria-label="Analytics start date" type="date" value={from} max={to} onInput={e=>setFrom(e.currentTarget.value)} onChange={e=>setFrom(e.target.value)}/></Field><Field label="Through (New York date)"><input aria-label="Analytics end date" type="date" value={to} min={from} max={today} onInput={e=>setTo(e.currentTarget.value)} onChange={e=>setTo(e.target.value)}/></Field><Field label="First responder"><select aria-label="Analytics responder" value={responder} onChange={e=>setResponder(e.target.value)}><option>All</option><option>AI</option><option>Human</option></select></Field></div>
        <div className="preview"><b>Coverage: {stats.coverage}.</b> {stats.updated?'Updated '+new Date(stats.updated).toLocaleString()+'. ':'No verified snapshots for this selection. '}These are observed conversations; historical import is still incomplete. AI and Human filters assign a conversation to its first confirmed responder. Unknown authors and unanswered conversations appear under All.</div>
      </Section>
      <div className="stats"><div><span>Human-reply conversations</span><b>{value(stats.conversations)}</b></div><div><span>Positive conversations</span><b>{value(stats.positive)}</b></div><div><span>Awaiting first reply</span><b>{value(stats.unanswered)}</b></div><div><span>Measured first responses</span><b>{value(stats.measured)}</b></div></div>
      <Section title="Response speed" description="Weighted by measured conversations, not by days. Times include evenings and weekends."><div className="stats"><div><span>Average first response</span><b>{value(stats.avgResponse,' min')}</b></div><div><span>Responded within 15 min</span><b>{rate(stats.sla)}</b></div><div><span>Human review</span><b>{value(stats.review)}</b></div><div><span>Agent errors</span><b>{value(stats.errors)}</b></div></div></Section>
      <Section title="Replies and meetings" description="Sent replies require provider confirmation. Meetings require booking evidence; a Won label alone is not enough."><div className="stats"><div><span>AI replies sent</span><b>{value(stats.ai)}</b></div><div><span>Human replies sent</span><b>{value(stats.human)}</b></div><div><span>Replies with unknown author</span><b>{value(stats.unknown)}</b></div><div><span>AI share of sent replies</span><b>{rate(stats.automation)}</b></div><div><span>Confirmed meetings</span><b>{value(stats.meetings)}</b></div><div><span>Positive → meeting</span><b>{rate(stats.conversion)}</b></div><div><span>Reply touches to meeting</span><b>{value(stats.avgTouches)}</b></div><div><span>First response → booking</span><b>{value(stats.avgBookingHours,' hr')}</b></div></div></Section>
      <Section title="Daily breakdown" description="A lead can have separate conversations. These counts are conversations, not deduplicated people across dates."><div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left',borderCollapse:'collapse'}}><thead><tr>{['First reply date','Conversations','Positive','Measured responses','Avg response (min)','Coverage'].map(s=><th key={s} style={{padding:10,borderBottom:'1px solid #ddd'}}>{s}</th>)}</tr></thead><tbody>{stats.rows.sort((a:any,b:any)=>b.Date.localeCompare(a.Date)).map((r:any)=><tr key={r['Snapshot Key']}>{[r.Date,r['Inbound Replies'],r['Positive Replies'],r['Measured First Responses'],value(r['Avg First Response Minutes']),r['Data Coverage']].map((v:any,i:number)=><td key={i} style={{padding:10,borderBottom:'1px solid #eee'}}>{v??'—'}</td>)}</tr>)}</tbody></table>{!stats.rows.length&&<p className="muted">No verified data for this client and date range.</p>}</div></Section>
    </>;
}

function DulcyReplyAgent() {
    const base=useBase();
    const {customPropertyValueByKey}=useCustomProperties(getCustomProperties);
    const settingsTable=(customPropertyValueByKey.settingsTable as AnyTable)||base.tables.find(t=>t?.name==='Dulcy Reply Agent Settings');
    const clientsTable=(customPropertyValueByKey.clientsTable as AnyTable)||base.tables.find(t=>t?.name==='Workspace IDs');
    const onboardingTable=(customPropertyValueByKey.onboardingTable as AnyTable)||base.tables.find(t=>t?.name==='Onboarding');
    if(!settingsTable) throw new Error('Select the Dulcy Reply Agent Settings table in custom properties.');
    const records=(useRecords(settingsTable)??[]).filter((r:any)=>r?.id);
    const clientRecords=(useRecords(clientsTable??settingsTable)??[]).filter((r:any)=>r?.id);
    const onboardingRecords=(useRecords(onboardingTable??settingsTable)??[]).filter((r:any)=>r?.id);
    const analyticsTable=(customPropertyValueByKey.analyticsTable as AnyTable)||base.tables.find(t=>t?.name==='Reply Analytics Daily');
    const analyticsRecords=useRecords(analyticsTable??settingsTable)??[];
    const [tab,setTab]=useState<Tab>('overview');
    const [selectedId,setSelectedId]=useState('');
    const selected=records.find((r:any)=>r.id===selectedId)||(!selectedId?records[0]:null)||null;
    const pendingWorkspaceId=selectedId.startsWith('workspace:')?selectedId.slice('workspace:'.length):'';
    const pendingWorkspace=clientRecords.find((r:any)=>r.id===pendingWorkspaceId)||null;
    const [draft,setDraft]=useState<JsonObject>({});
    const [dirty,setDirty]=useState(false);
    const [saving,setSaving]=useState(false);
    const [notice,setNotice]=useState('');
    const [connectionEmail,setConnectionEmail]=useState('');
    const [requestingConnection,setRequestingConnection]=useState(false);
    useEffect(()=>{setConnectionEmail('');},[selected?.id]);
    const connectionRequest=parseJson(selected,settingsTable,FIELDS.calendarRequest,{});
    const connectionResult=parseJson(selected,settingsTable,FIELDS.calendarResult,{});
    const connectionSnapshot=parseJson(selected,settingsTable,FIELDS.calendarSnapshot,{});
    const requestMatches=Boolean(connectionRequest.requestId&&connectionResult.requestId===connectionRequest.requestId);
    const connectionUrl=requestMatches&&connectionResult.status==='Ready'&&Date.parse(connectionResult.expiresAt)>Date.now()&&/^https:\/\/n8n\.dulcy\.io\/calendar\/connect\?ticket=[A-Za-z0-9_-]{40,100}$/.test(connectionResult.url||'')?connectionResult.url:'';
    const requestPending=Boolean(connectionRequest.requestId&&!requestMatches&&Date.parse(connectionRequest.requestedAt)>Date.now()-86400000);
    const [templateIntent,setTemplateIntent]=useState('Interested');

    const workspaceRecordIdField=namedField(settingsTable,['Workspace Record ID']);
    const clientStatusField=namedField(clientsTable,['Client Status','Status','Account Status']);
    const selectedWorkspace=useMemo(()=>{
        if(!selected||!clientsTable)return null;
        const linkedId=String(raw(selected,settingsTable,workspaceRecordIdField?.id)||'').trim();
        const settingName=String(text(selected,settingsTable,FIELDS.workspaceName)||text(selected,settingsTable,FIELDS.key)||'').trim().toLowerCase();
        return linkedId?clientRecords.find((r:any)=>r.id===linkedId)||null:null;
    },[selected?.id,clientRecords,clientsTable,workspaceRecordIdField?.id]);
    const selectedOnboarding=useMemo(()=>{
        if(!selectedWorkspace||!clientsTable||!onboardingTable)return null;
        const link=namedField(clientsTable,['Onboarding']);
        const lookup=namedField(clientsTable,['onboarding_record_id (from Onboarding)','Onboarding Record ID']);
        const ids=[
            ...(link?linkedIds(raw(selectedWorkspace,clientsTable,link.id)):[]),
            ...(lookup?linkedIds(raw(selectedWorkspace,clientsTable,lookup.id)):[]),
        ];
        const safeOnboarding=onboardingRecords.filter((r:any)=>r.id!=='recYN3TEsGGlKpM6L');
        const reverse=namedField(onboardingTable,['Workspace IDs']);
        const matchesWorkspace=(r:any)=>Boolean(reverse&&linkedIds(raw(r,onboardingTable,reverse.id)).includes(selectedWorkspace.id));
        const direct=safeOnboarding.find((r:any)=>ids.includes(r.id)&&matchesWorkspace(r));
        if(direct)return direct;
        return reverse?safeOnboarding.find((r:any)=>linkedIds(raw(r,onboardingTable,reverse.id)).includes(selectedWorkspace.id))||null:null;
    },[selectedWorkspace?.id,onboardingRecords,onboardingTable,clientsTable]);
    const inherited=useMemo(()=>{
        const sender=cellText(selectedOnboarding,onboardingTable,['Who takes the sales calls on your team? (This will be who the outreach is sent on behalf of)','Full Name']);
        const person=splitName(sender);
        return {
            agentFirst:person.first,
            agentLast:person.last,
            companyName:cellText(selectedWorkspace,clientsTable,['Brand Name'])||cellText(selectedOnboarding,onboardingTable,['Company Name'])||String(selectedWorkspace?.name||''),
            companyUrl:cellText(selectedOnboarding,onboardingTable,['Website Link']),
            companyContext:inheritedInstructions(selectedOnboarding,onboardingTable),
        };
    },[selectedWorkspace?.id,selectedOnboarding?.id,onboardingTable]);

    useEffect(()=>{ if(!selectedId&&records[0])setSelectedId(records[0].id); },[records.length,selectedId]);
    useEffect(()=>{
        if(!selected)return;
        const objective=parseJson(selected,settingsTable,FIELDS.objective,{goal:'Schedule a Meeting',customGoal:'',dncEnabled:false,dncSource:'',dncPrivacy:'Private',dncColumn:'STOP_RESPONSE',dncSyncMinutes:3,language:'English'});
        const integrations=parseJson(selected,settingsTable,FIELDS.integrations,{emailBison:{connected:true,label:'Workspace'},smartlead:{connected:false},instantly:{connected:false},heyreach:{connected:false}});
        const calendar=parseJson(selected,settingsTable,FIELDS.calendar,{activeCalendars:[],disableTimes:true,disableLinks:true,customFormat:false,day:'Short',date:'MM/DD',joiner:'@',ampm:'Lowercase',timezoneStyle:'Lowercase',omitZero:true,autoBookProspectLink:false,bookingOnBehalfName:'',bookingOnBehalfTitle:'',requiredFields:[]});
        const routing=parseJson(selected,settingsTable,FIELDS.routing,{groups:DEFAULT_GROUPS,sameDayAlerts:true,alertOwner:'',roundRobin:false,roundRobinOwners:[]});
        const followups=parseJson(selected,settingsTable,FIELDS.followups,{enabled:true,skipWeekends:true,skipHolidays:true,ignoreCalendar:false,steps:DEFAULT_FOLLOWUPS});
        const responses=parseJson(selected,settingsTable,FIELDS.responses,{notInterestedEnabled:Boolean(raw(selected,settingsTable,FIELDS.notInterested)),notInterestedMode:'Dynamic AI',notInterestedInstructions:'Send one thoughtful, friendly response. Ask for brief feedback without pressure. Stop after this final courtesy nudge.',aggressiveness:1,finalCourtesyNudge:false,adaptiveTemplates:true,templates:{},delegatedEnabled:true,newDelegatedEmail:true,disableDelegatedOOO:true});
        const ccBcc=parseJson(selected,settingsTable,FIELDS.ccBcc,{ccEnabled:false,cc:[],bccEnabled:false,bcc:[],bccEvents:['Meeting Request'],autoDeactivateGeneration:0,autoDeactivateSend:Number(raw(selected,settingsTable,FIELDS.maxReplies)||3)});
        const knowledge=parseJson(selected,settingsTable,FIELDS.knowledge,{enabled:true,assets:[]});
        setDraft({
            workspaceName:text(selected,settingsTable,FIELDS.workspaceName), enabled:Boolean(raw(selected,settingsTable,FIELDS.enabled)),
            defaultMode:text(selected,settingsTable,FIELDS.defaultMode)||'Approval Required', oooMode:text(selected,settingsTable,FIELDS.oooMode)||'Approval Required',
            confidence:Number(raw(selected,settingsTable,FIELDS.confidence)||0.92), maxReplies:Number(raw(selected,settingsTable,FIELDS.maxReplies)||5),
            tone:text(selected,settingsTable,FIELDS.tone)||'Warm', length:text(selected,settingsTable,FIELDS.length)||'Brief',
            timezone:text(selected,settingsTable,FIELDS.timezone)||'America/New_York', officeStart:text(selected,settingsTable,FIELDS.officeStart)||'09:00', officeEnd:text(selected,settingsTable,FIELDS.officeEnd)||'18:00',
            calendarLink:text(selected,settingsTable,FIELDS.calendarLink), companyContext:text(selected,settingsTable,FIELDS.companyContext),
            calendarProvider:text(selected,settingsTable,FIELDS.calendarProvider)||'Calendly', calendarStatus:text(selected,settingsTable,FIELDS.calendarStatus),
            handoffMode:text(selected,settingsTable,FIELDS.handoffMode)||'Disabled',
            agentFirst:text(selected,settingsTable,FIELDS.agentFirst),agentLast:text(selected,settingsTable,FIELDS.agentLast),companyUrl:text(selected,settingsTable,FIELDS.companyUrl),companyName:text(selected,settingsTable,FIELDS.companyName),
            objective,integrations,calendar,routing,followups,responses,ccBcc,knowledge,ccInput:(ccBcc.cc||[]).join(", "),bccInput:(ccBcc.bcc||[]).join(", "),
        }); setDirty(false); setNotice('');
    },[selected?.id]);

    const set=(key:string,value:any)=>{setDraft((d:any)=>({...d,[key]:value}));setDirty(true);};
    const setNested=(key:string,patch:JsonObject)=>set(key,{...(draft[key]||{}),...patch});
    const workspaceOptions=useMemo(()=>{
        if(!clientsTable)return records.map((r:any)=>({id:r.id,name:text(r,settingsTable,FIELDS.workspaceName)||text(r,settingsTable,FIELDS.key)||r.id,provisioned:true}));
        const activeClients=clientStatusField?clientRecords.filter((r:any)=>{
            const value=raw(r,clientsTable,clientStatusField.id); const status=typeof value==='string'?value:value?.name;
            return String(status||'').trim().toLowerCase()==='active';
        }):clientRecords;
        return activeClients.map((client:any)=>{
            const clientName=String(client.name||client.id).trim().toLowerCase();
            const match=records.find((setting:any)=>{
                const linkedId=String(raw(setting,settingsTable,workspaceRecordIdField?.id)||'');
                const settingName=String(text(setting,settingsTable,FIELDS.workspaceName)||text(setting,settingsTable,FIELDS.key)||'').trim().toLowerCase();
                return linkedId===client.id||(!linkedId&&Boolean(clientName)&&settingName===clientName);
            });
            return {id:match?.id||'workspace:'+client.id,name:client.name||client.id,provisioned:Boolean(match)};
        }).sort((a:any,b:any)=>a.name.localeCompare(b.name));
    },[records,clientRecords,clientsTable,clientStatusField?.id,workspaceRecordIdField?.id]);

    async function requestCalendarConnection(){
        if(!selected||requestingConnection)return;
        setRequestingConnection(true);setNotice('');
        try{
            const email=connectionEmail.trim().toLowerCase();
            if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter the calendar owner’s email address.');
            if(!selectedWorkspace)throw Error('This agent needs a verified workspace before connecting a calendar.');
            if(!field(settingsTable,FIELDS.calendarRequest))throw Error('Calendar connection fields are not available on this interface yet.');
            const request={requestId:crypto.randomUUID(),provider:'google',email,requestedAt:new Date().toISOString()};
            const changes={[FIELDS.calendarRequest]:JSON.stringify(request)};
            if(!settingsTable.hasPermissionToUpdateRecord(selected,changes))throw Error('You do not have permission to request a connection for this workspace.');
            await settingsTable.updateRecordAsync(selected.id,changes);
            setNotice('Connection requested. A sign-in link will appear here within five minutes. No invitation email is sent.');
        }catch(e:any){setNotice(e?.message||'Could not request a calendar connection');}finally{setRequestingConnection(false);}
    }

    async function createPausedAgent(){
        if(!pendingWorkspace||!workspaceRecordIdField)return;
        setSaving(true);setNotice('');
        try{
            const u:any={}; const put=(id:string,value:any)=>{if(field(settingsTable,id))u[id]=value;};
            put(FIELDS.key,pendingWorkspace.id); put(FIELDS.workspaceName,pendingWorkspace.name||pendingWorkspace.id); put(FIELDS.enabled,false);
            put(FIELDS.defaultMode,{name:'Approval Required'}); put(FIELDS.oooMode,{name:'Approval Required'}); put(FIELDS.confidence,0.92); put(FIELDS.maxReplies,5); put(FIELDS.handoffMode,{name:'Disabled'});
            u[workspaceRecordIdField.id]=pendingWorkspace.id;
            const newId=await settingsTable.createRecordAsync(u); setSelectedId(newId); setNotice('Paused agent created. Complete provisioning before enabling it.');
        }catch(e:any){setNotice(e?.message||'Could not create agent settings');}finally{setSaving(false);}
    }

    async function save(){
        if(!selected)return; setSaving(true);setNotice('');
        try{
            for(const id of [FIELDS.integrations,FIELDS.objective,FIELDS.calendar,FIELDS.routing,FIELDS.followups,FIELDS.responses,FIELDS.ccBcc,FIELDS.knowledge]){
                const saved=text(selected,settingsTable,id);
                if(saved.trim())try{const parsed=JSON.parse(saved);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();}catch{throw Error('A saved settings section is malformed. Repair it before saving to avoid replacing existing settings.');}
            }
            validateReplySettings(draft);
            const recipients={...draft.ccBcc,cc:parseRecipientList(draft.ccInput),bcc:parseRecipientList(draft.bccInput)};
            if(recipients.ccEnabled&&!recipients.cc.length)throw Error('Add at least one CC email or turn Auto CC off.');
            if(recipients.bccEnabled&&!recipients.bcc.length)throw Error('Add at least one BCC email or turn Auto BCC off.');
            for(const kind of ['cc','bcc'])if(recipients[kind+'Enabled']&&recipients[kind+'Scope']==='selected'&&!(recipients[kind+'Types']||[]).length)throw Error('Select at least one '+kind.toUpperCase()+' reply type.');
            const u:any={}; const put=(id:string,value:any)=>{if(field(settingsTable,id))u[id]=value;};
            put(FIELDS.workspaceName,draft.workspaceName||null); put(FIELDS.enabled,Boolean(draft.enabled));
            put(FIELDS.defaultMode,{name:draft.defaultMode}); put(FIELDS.oooMode,{name:draft.oooMode}); put(FIELDS.handoffMode,{name:draft.handoffMode||'Disabled'});
            put(FIELDS.confidence,Number(draft.confidence)||0); put(FIELDS.maxReplies,Number(draft.maxReplies)||0);
            put(FIELDS.tone,{name:draft.tone}); put(FIELDS.length,{name:draft.length}); put(FIELDS.timezone,draft.timezone||null);
            put(FIELDS.officeStart,draft.officeStart||null); put(FIELDS.officeEnd,draft.officeEnd||null); put(FIELDS.calendarLink,draft.calendarLink||null);
            // Calendar identity and connection status are managed by the connection service, not preference saves.
            put(FIELDS.companyContext,draft.companyContext||null); put(FIELDS.agentFirst,draft.agentFirst||null); put(FIELDS.agentLast,draft.agentLast||null);
            put(FIELDS.companyUrl,draft.companyUrl||null); put(FIELDS.companyName,draft.companyName||null);
            put(FIELDS.weekends,Boolean(draft.followups?.skipWeekends)); put(FIELDS.holidays,Boolean(draft.followups?.skipHolidays));
            put(FIELDS.notInterested,Boolean(draft.responses?.notInterestedEnabled));
            for(const [id,key] of [[FIELDS.integrations,'integrations'],[FIELDS.objective,'objective'],[FIELDS.calendar,'calendar'],[FIELDS.routing,'routing'],[FIELDS.followups,'followups'],[FIELDS.responses,'responses'],[FIELDS.ccBcc,'ccBcc'],[FIELDS.knowledge,'knowledge']] as const) put(id,JSON.stringify(key==='ccBcc'?recipients:key==='calendar'?calendarPreferences(draft.calendar,JSON.parse(text(selected,settingsTable,FIELDS.calendar)||'{}')):(draft[key]||{}),null,2));
            await settingsTable.updateRecordAsync(selected.id,u); setDirty(false);setNotice('Saved');
        }catch(e:any){setNotice(e?.message||'Could not save');}finally{setSaving(false);}
    }

    if(!selected)return <div className="app"><style>{CSS}</style><header><div><div className="eyebrow">INBOX MANAGEMENT</div><h1>Dulcy Reply Agent</h1><p>Select a workspace to configure its reply agent.</p></div><div className="actions"><select value={selectedId} onChange={e=>{if(dirty){setNotice("Save your changes before switching workspaces.");return;}setSelectedId(e.target.value)}}><option value="" disabled>Select workspace</option>{workspaceOptions.map((w:any)=><option key={w.id} value={w.id}>{w.name}{w.provisioned?'':' — Not set up'}</option>)}</select></div></header>{pendingWorkspace?<main>
        <div className="preview"><b>Approval-only pilot.</b> Dulcy can draft replies and follow-ups. Review a specific reply in Inbox Manager before sending. Configured client workspaces support draft-only previews. New workspaces require a client-context test before activation. Calendar access requires authorization. Autopilot and automatic booking are not enabled.</div><Section title={pendingWorkspace.name||'Workspace'} description="This workspace does not have reply-agent settings yet."><p className="muted">Create a paused settings record now. The agent will remain off until provisioning and a controlled test are complete.</p><button className="save" disabled={saving} onClick={createPausedAgent}>{saving?'Creating…':'Create paused agent'}</button></Section></main>:<div className="empty">Choose a workspace above.</div>}</div>;
    const resolved={
        agentFirst:String(draft.agentFirst||inherited.agentFirst||''),
        agentLast:String(draft.agentLast||inherited.agentLast||''),
        companyName:String(draft.companyName||inherited.companyName||draft.workspaceName||''),
        companyUrl:String(draft.companyUrl||inherited.companyUrl||''),
        companyContext:String(draft.companyContext||inherited.companyContext||''),
    };
    const sourceMeta=(key:string)=><div className="overrideMeta"><span className={'sourceBadge '+(draft[key]?'manual':'inherited')}>{draft[key]?'Manual override':'Inherited from onboarding'}</span>{draft[key]&&<button type="button" className="textButton" onClick={()=>set(key,'')}>Use inherited value</button>}</div>;
    const groups=draft.routing?.groups||DEFAULT_GROUPS; const steps=draft.followups?.steps||[]; const assets=draft.knowledge?.assets||[];
    return <div className="app"><style>{CSS}</style>
        <header><div><div className="eyebrow">INBOX MANAGEMENT</div><h1>Dulcy Reply Agent</h1><p>Configure how each workspace classifies, drafts, approves, and follows up with replies.</p></div><div className="actions"><select value={selected.id} onChange={e=>{if(dirty){setNotice("Save your changes before switching workspaces.");return;}setSelectedId(e.target.value)}}>{workspaceOptions.map((w:any)=><option key={w.id} value={w.id}>{w.name}{w.provisioned?'':' — Not set up'}</option>)}</select><button className="save" onClick={save} disabled={!dirty||saving}>{saving?'Saving…':dirty?'Save changes':'Saved'}</button></div></header>
        {notice&&<div className={'notice '+(notice==='Saved'?'ok':'bad')}>{notice}</div>}
        <nav>{TABS.map(t=><button key={t.id} className={tab===t.id?'active':''} onClick={()=>setTab(t.id)}>{t.label}</button>)}</nav>
        <main>
        <div className="preview"><b>{selectedWorkspace?.id==='recJx0WwHsdsvcVIN'?'Dulcy approval-required pilot.':'Client draft-only mode.'}</b> {selectedWorkspace?.id==='recJx0WwHsdsvcVIN'?'Review each draft in Inbox Manager before approving a send.':'New eligible replies and due follow-ups receive AI drafts in the existing Inbox Manager pages, when the agent and saved follow-up plan are on. Review and send manually using your existing inbox controls. Automatic client sending is off.'} Autopilot and automatic booking are not enabled.</div>
        {tab==='analytics'&&<ReplyAnalytics table={analyticsTable} records={analyticsRecords} workspaceId={selectedWorkspace?.id||''}/>}
        {tab==='overview'&&<>
            <div className="stats"><div><span>Agent status</span><b>{draft.enabled?'Enabled':'Paused'}</b></div><div><span>Default control</span><b>{selectedWorkspace?.id==='recJx0WwHsdsvcVIN'?controlLabel(draft.defaultMode):'Draft only — no agent sending'}</b></div><div><span>Review confidence</span><b>{Math.round((draft.confidence||0)*100)}%</b></div><div><span>Automatic reply cap</span><b>{draft.maxReplies||0}</b></div></div>
            <Section title="Reply Agent" description="Master control for this workspace."><div className="row between"><div><b>{draft.workspaceName||'Workspace'}</b><p className="muted">{draft.enabled?(selectedWorkspace?.id==='recJx0WwHsdsvcVIN'?'The agent can classify and draft. Sending requires review and approval in Inbox Manager.':'Reply drafting is on. Due follow-ups are drafted when your saved plan is enabled. Client agent sending is blocked; review and send manually using the existing inbox controls.'):'The agent is fully off. Replies can still appear in Inbox Manager, but no AI draft, follow-up, or automatic send will run.'}</p></div><Toggle disabled={selectedWorkspace?.id!=='recJx0WwHsdsvcVIN'&&!CLIENT_DRAFT_WORKSPACES.includes(selectedWorkspace?.id||'')} value={Boolean(draft.enabled)} onChange={v=>set('enabled',v)} label={draft.enabled?'On':'Off'}/></div></Section>
            <Section title="Generate a fresh draft" description="Open the conversation in New Replies, Positive Replies, Follow Ups or Meeting Requested. In AI review action, choose Resume to regenerate the latest eligible reply. The record updates after the new draft or hold decision has been checked. Clear or save any manual Custom Reply first; manual work is never overwritten. Resume does not send a message.">{null}</Section><Section title="Quick controls"><div className="grid3"><Field label="Default mode"><select value={draft.defaultMode} onChange={e=>set('defaultMode',e.target.value)}><option value="Approval Required">Human in the Loop</option><option value="Auto High Confidence" disabled>Autopilot — not enabled in pilot</option></select></Field><Field label="Out-of-office mode"><select value={draft.oooMode} onChange={e=>set('oooMode',e.target.value)}><option value="Approval Required">Human in the Loop</option><option disabled>Auto Send</option></select></Field><Field label="Reply confidence review threshold"><input type="range" min="50" max="100" value={Math.round((draft.confidence||0)*100)} onChange={e=>set('confidence',Number(e.target.value)/100)}/><b>{Math.round((draft.confidence||0)*100)}%</b></Field><Field label="Automatic reply cap" hint="Saved for a future automatic-send rollout. Every pilot reply requires approval."><input type="number" disabled min="1" max="25" value={draft.maxReplies||5} onChange={e=>set('maxReplies',Number(e.target.value))}/></Field></div></Section>
        </>}
        {tab==='company'&&<>
            <Section title="Workspace and onboarding context" description="Company, offer, service, sender, and onboarding details are loaded automatically from the selected Workspace ID and its linked Onboarding record."><div className="preview"><b>Source of truth:</b> Workspace IDs → linked Onboarding record → Reply Agent overrides</div><div className="resolvedGrid"><div><span>Agent</span><b>{[resolved.agentFirst,resolved.agentLast].filter(Boolean).join(' ')||'No sender found in onboarding'}</b></div><div><span>Company</span><b>{resolved.companyName||'No company found in onboarding'}</b></div><div><span>Company URL</span><b>{resolved.companyUrl||'No website found in onboarding'}</b></div><div><span>Instructions</span><b>{resolved.companyContext?'Loaded and available below':'No onboarding instructions found'}</b></div></div></Section>
            <Section title="Agent identity" description="The inherited sender is shown below. Editing a field creates a manual override for this workspace."><div className="grid2"><Field label="Agent first name">{sourceMeta('agentFirst')}<input value={resolved.agentFirst} placeholder="No first name found" onChange={e=>set('agentFirst',e.target.value)}/></Field><Field label="Agent last name">{sourceMeta('agentLast')}<input value={resolved.agentLast} placeholder="No last name found" onChange={e=>set('agentLast',e.target.value)}/></Field></div></Section>
            <Section title="Company and agent instructions" description="Inherited from the linked onboarding record and kept under 8,500 characters. Editing any field creates a workspace-specific override."><div className="grid2"><Field label="Company name">{sourceMeta('companyName')}<input value={resolved.companyName} placeholder="No company found" onChange={e=>set('companyName',e.target.value)}/></Field><Field label="Company URL">{sourceMeta('companyUrl')}<input value={resolved.companyUrl} placeholder="No website found" onChange={e=>set('companyUrl',e.target.value)}/></Field></div><Field label={'Inbox manager instructions ('+resolved.companyContext.length.toLocaleString()+' / 8,500 characters)'}>{sourceMeta('companyContext')}<textarea rows={18} maxLength={8500} placeholder="No onboarding instructions found" value={resolved.companyContext} onChange={e=>set('companyContext',e.target.value)}/></Field><small className="muted">The agent uses the inherited onboarding context unless a manual override is saved here. Missing facts remain unknown and must never be invented.</small></Section>
            <Section title="Inbox integration" description="Connection preferences only. These switches do not connect accounts. EmailBison must have a verified workspace mapping; HeyReach replies are not enabled by this board."><div className="integrationGrid">{[['emailBison','Email Bison'],['heyreach','HeyReach / LinkedIn']].map(([key,label])=>{const item=draft.integrations?.[key]||{};return <div className={'integration '+(item.connected?'connected':'')} key={key}><div><b>{label}</b><small>{item.connected?'Requested — connection must be verified':'Not requested'}</small></div><Toggle value={Boolean(item.connected)} onChange={v=>setNested('integrations',{[key]:{...item,connected:v}})}/></div>})}</div></Section>
            <Section title="Objective"><div className="grid2"><Field label="Primary objective"><select value={draft.objective?.goal||'Schedule a Meeting'} onChange={e=>setNested('objective',{goal:e.target.value})}><option>Schedule a Meeting</option><option>Other</option></select></Field><Field label="Language"><select value={draft.objective?.language||'English'} onChange={e=>setNested('objective',{language:e.target.value})}><option>English</option><option>Spanish</option><option>French</option><option>German</option></select></Field></div>{draft.objective?.goal==='Other'&&<Field label="Define the custom objective" hint="For example: signup, free trial, application, assessment, or another conversion action."><textarea rows={4} value={draft.objective?.customGoal||''} onChange={e=>setNested('objective',{customGoal:e.target.value})}/></Field>}<div className="row between line"><div><b>Google Sheet stop-response list</b><p className="muted">Sheet sync is not connected in this pilot. Use Airtable DNC and unsubscribe suppression; those remain active.</p></div><Toggle disabled value={Boolean(draft.objective?.dncEnabled)} onChange={v=>setNested('objective',{dncEnabled:v})}/></div>{draft.objective?.dncEnabled&&<div className="grid2"><Field label="Google Sheet URL"><input value={draft.objective?.dncSource||''} onChange={e=>setNested('objective',{dncSource:e.target.value})}/></Field><Field label="Privacy"><select value={draft.objective?.dncPrivacy||'Private'} onChange={e=>setNested('objective',{dncPrivacy:e.target.value})}><option>Private</option><option>Public</option></select></Field></div>}</Section>
        </>}
        {tab==='calendar'&&<>
            <Section title="Calendar connection" description="An enabled saved public booking link can be shared without connecting a calendar. Specific meeting times require an authorized client calendar and a fresh lookup. Disabling booking links does not disable approved reference assets. Automatic booking is not enabled."><div className="grid2"><Field label="Availability connection"><div className="preview">{text(selected,settingsTable,FIELDS.calendarProvider)||'Not Connected'}<small>Set by the authorized calendar connection. A booking link can use a different provider.</small></div></Field><Field label="Calendar booking link" hint="Only this saved HTTPS link can be shared when booking links are enabled. This does not authorize automatic sending or booking."><input value={draft.calendarLink||''} onChange={e=>set('calendarLink',e.target.value)}/></Field></div>{(draft.calendar?.requiredFields||[]).length>0&&<div className="warning"><b>Booking warning</b> Required custom fields: {draft.calendar.requiredFields.join(', ')}. These fields must be collected before booking. No automatic booking is enabled; link sharing follows the reply policy.</div>}</Section>
            <Section title="Connection details" description="The calendar owner must authorize access and choose calendars and working hours."><p>{connectionSnapshot.checkedAt?(connectionSnapshot.status==='Connected'?'The calendar owner has connected '+(connectionSnapshot.accountEmail||'their account')+'. Availability follows their saved calendar selection and working hours.':'Connection status: '+connectionSnapshot.status+'. The owner must complete authorization and calendar selection before times can be suggested.'):(parseJson(selected,settingsTable,FIELDS.calendar,{}).integrationNote||'No authorized availability connection is recorded for this workspace.')}</p><div className="preview"><b>Google calendar connection</b><p>Enter the calendar owner’s email to prepare a private sign-in link for this workspace. The owner chooses which calendars block meeting times and confirms their hours. Creating a link does not grant calendar access.</p><div className="grid2"><Field label="Calendar owner email"><input type="email" value={connectionEmail} onChange={e=>setConnectionEmail(e.target.value)} placeholder="name@company.com"/></Field><div><button type="button" className="secondary" disabled={requestingConnection||!connectionEmail.trim()} onClick={requestCalendarConnection}>{requestingConnection?'Requesting…':'Create Google connection link'}</button></div></div>{requestPending&&<p role="status">Preparing the link for {connectionRequest.email}. Allow up to five minutes.</p>}{connectionUrl&&<p><a href={connectionUrl} target="_blank" rel="noopener noreferrer">Continue to Google sign-in for {connectionRequest.email} ↗</a><small>One-time link. Expires {new Date(connectionResult.expiresAt).toLocaleString()}. Share only with this calendar owner.</small></p>}{requestMatches&&connectionResult.status==='Needs Attention'&&<p className="warning">{connectionResult.message||'The connection needs attention. Contact your administrator.'}</p>}{requestMatches&&connectionResult.status==='Ready'&&!connectionUrl&&!(connectionSnapshot.status==='Connected'&&String(connectionSnapshot.accountEmail||'').toLowerCase()===String(connectionRequest.email||'').toLowerCase())&&<p className="warning">This link has expired or is unavailable. Request a new connection link.</p>}<p className="muted">Google calendar connections are available by private invitation. The invited owner must sign in with the email shown above and authorize read-only calendar-list and availability access. Calendly authorization is not yet available.</p>{connectionSnapshot.checkedAt&&<p className="muted">Connection checked {new Date(connectionSnapshot.checkedAt).toLocaleString()}{connectionSnapshot.accountEmail?' · '+connectionSnapshot.accountEmail:''}. Status refreshes about every five minutes.</p>}</div></Section><Section title="Availability and booking controls"><div className="preview"><b>Connection status:</b> {text(selected,settingsTable,FIELDS.calendarStatus)||'Not Connected'}. Saved status; availability is checked again for each draft and approved send. Saving preferences does not connect a calendar or reserve a meeting.</div><div className="toggleList"><span>Disable suggested meeting times <Toggle value={Boolean(draft.calendar?.disableTimes)} onChange={v=>setNested('calendar',{disableTimes:v})}/></span><span>Disable booking links <Toggle value={Boolean(draft.calendar?.disableLinks)} onChange={v=>setNested('calendar',{disableLinks:v})}/></span><span>Auto-book from a prospect's calendar link (not connected) <Toggle disabled value={Boolean(draft.calendar?.autoBookProspectLink)} onChange={v=>setNested('calendar',{autoBookProspectLink:v})}/></span></div><div className="grid2 line"><Field label="Book on behalf of (optional name)"><input value={draft.calendar?.bookingOnBehalfName||''} onChange={e=>setNested('calendar',{bookingOnBehalfName:e.target.value})}/></Field><Field label="Designation / role (optional)"><input placeholder="Head of Product" value={draft.calendar?.bookingOnBehalfTitle||''} onChange={e=>setNested('calendar',{bookingOnBehalfTitle:e.target.value})}/></Field></div></Section>
            <Section title="Meeting time format"><div className="row between"><p className="muted">Control how proposed availability appears in replies.</p><Toggle value={Boolean(draft.calendar?.customFormat)} onChange={v=>setNested('calendar',{customFormat:v})}/></div>{draft.calendar?.customFormat&&<><div className="formatGrid"><Field label="Day"><select value={draft.calendar?.day||'Short'} onChange={e=>setNested('calendar',{day:e.target.value})}><option>Short</option><option>Full</option><option>None</option></select></Field><Field label="Date"><select value={draft.calendar?.date||'MM/DD'} onChange={e=>setNested('calendar',{date:e.target.value})}><option>MM/DD</option><option>Month D</option><option>None</option></select></Field><Field label="Joiner"><select value={draft.calendar?.joiner||'@'} onChange={e=>setNested('calendar',{joiner:e.target.value})}><option>@</option><option>at</option><option>-</option></select></Field><Field label="AM/PM"><select value={draft.calendar?.ampm||'Lowercase'} onChange={e=>setNested('calendar',{ampm:e.target.value})}><option>Lowercase</option><option>Uppercase</option></select></Field><Field label="Timezone"><select value={draft.calendar?.timezoneStyle||'Lowercase'} onChange={e=>setNested('calendar',{timezoneStyle:e.target.value})}><option>Lowercase</option><option>Uppercase</option><option>None</option></select></Field></div><label className="checkline"><input type="checkbox" checked={Boolean(draft.calendar?.omitZero)} onChange={e=>setNested('calendar',{omitZero:e.target.checked})}/> Omit :00 when the time is on the hour</label><div className="preview"><b>Format preview:</b> {meetingFormatPreview(draft.calendar,draft.timezone||'America/New_York')}<small>Illustrative time only, not calendar availability.</small></div></>}</Section>
        </>}
        {tab==='routing'&&<>
            <Section title="Client reply handoff" description="Use this when the client will take ownership of the email conversation themselves."><div className="grid2"><Field label="Handoff mode"><select value={draft.handoffMode||'Disabled'} onChange={e=>set('handoffMode',e.target.value)}><option value="Disabled">Disabled — Dulcy handles replies</option><option value="After First Agent Reply">After first agent reply</option><option value="All Replies">All replies — hand off immediately</option></select></Field><div className="preview"><b>Handoff behavior:</b> {(draft.handoffMode||'Disabled')==='Disabled'?'Replies continue through the Dulcy Reply Agent and Inbox Manager.':(draft.handoffMode==='After First Agent Reply'?'Dulcy sends the first response, then the thread receives the Handoff tag and leaves both queues.':'The first incoming reply is tagged Handoff immediately and never enters either queue.')}</div></div></Section>
            <Section title="Reply control by classification" description="Choose whether each category produces a draft for human review or no draft. The main agent switch stops all drafting. Automatic sending remains locked. Unsubscribe and hostile replies always stop automatically."><div className="routingTable"><div className="routingHeader"><span>Group</span><span>Reply types</span><span>Control</span></div>{groups.filter((g:any)=>g.name!=='Never reply').map((g:any)=>{const i=groups.findIndex((x:any)=>x.name===g.name);return <div className="routingRow" key={g.name}><b>{g.name}</b><div className="chips">{g.intents.map((x:string)=><span key={x}>{x}</span>)}</div><ModePicker value={g.mode} onChange={v=>{const n=[...groups];n[i]={...g,mode:v};setNested('routing',{groups:n})}}/></div>})}</div></Section>
            <Section title="Same-day call instructions" description="Same-day call requests are flagged from the latest reply and routed to the dedicated inbox-manager Slack channel after the matching review decision is saved. Existing stop, spam and ownership rules still apply."><div className="row between"><div><b>Notify the inbox manager about urgent call requests</b><p className="muted">Sends one deduplicated internal alert for a verified urgent request. This does not call the prospect or send an email.</p></div><Toggle value={Boolean(draft.routing?.sameDayAlerts)} onChange={v=>setNested('routing',{sameDayAlerts:v})}/></div><div className="grid2"><Field label="Default owner"><input value={draft.routing?.alertOwner||''} onChange={e=>setNested('routing',{alertOwner:e.target.value})}/><p className="muted">{draft.routing?.alertOwner===draft.routing?.alertOwnerResolvedLabel&&draft.routing?.alertOwnerSlackId?'Resolved owner: '+(draft.routing.alertOwnerName||draft.routing.alertOwner)+'.':'No verified person is linked to this owner label. Alerts go to the workspace channel without a personal mention.'}</p></Field><Field label="Round robin — not connected"><div className="inlineControl"><Toggle disabled value={Boolean(draft.routing?.roundRobin)} onChange={v=>setNested('routing',{roundRobin:v})}/><span>{draft.routing?.roundRobin?'Enabled':'Off'}</span></div></Field></div></Section>
            <Section title="Automatic reply limits"><div className="grid2"><Field label="Stop generating after N agent replies"><input type="number" min="0" value={draft.ccBcc?.autoDeactivateGeneration||0} onChange={e=>setNested('ccBcc',{autoDeactivateGeneration:Number(e.target.value)})}/><small>Counts confirmed agent replies in this conversation, including follow-ups. At the limit, drafting pauses for review. 0 means no generation limit; other safeguards still apply.</small></Field><Field label="Automatic send cap — not active in pilot"><input type="number" disabled min="0" value={draft.maxReplies||0} onChange={e=>set('maxReplies',Number(e.target.value))}/></Field></div></Section>
        </>}
        {tab==='followups'&&<>
            <Section title="Follow-up plan" description="Enabled plans prepare drafts after a confirmed tracked reply, or a saved return/contact-after date. Dulcy drafts require approval; client drafts are sent manually. Client-owned or handed-off conversations, booked meetings, opt-outs and closed threads are excluded. A new reply cancels the old follow-up. Previously sent conversations are not automatically enrolled."><div className="row between"><b>Enable follow-up plan</b><Toggle value={Boolean(draft.followups?.enabled)} onChange={v=>setNested('followups',{enabled:v})}/></div><div className="toggleList"><span>Keep follow-ups within weekdays <Toggle value={Boolean(draft.followups?.skipWeekends)} onChange={v=>setNested('followups',{skipWeekends:v})}/></span><span>Exclude US holidays <Toggle value={Boolean(draft.followups?.skipHolidays)} onChange={v=>setNested('followups',{skipHolidays:v})}/></span><span>Skip calendar check — not supported <Toggle disabled value={Boolean(draft.followups?.ignoreCalendar)} onChange={v=>setNested('followups',{ignoreCalendar:v})}/></span></div></Section>
            {steps.map((s:any,i:number)=><Section key={i} title={'Follow-up '+(i+1)}><div className="followHead"><span>Prepare after</span><input type="number" min="1" value={s.delay} onChange={e=>{const n=[...steps];n[i]={...s,delay:Number(e.target.value)};setNested('followups',{steps:n})}}/><select value={s.unit} onChange={e=>{const n=[...steps];n[i]={...s,unit:e.target.value};setNested('followups',{steps:n})}}><option>hours</option><option>days</option></select><label><input type="checkbox" checked={Boolean(s.calendar)} onChange={e=>{const n=[...steps];n[i]={...s,calendar:e.target.checked};setNested('followups',{steps:n})}}/> Allow calendar link</label><label><input type="checkbox" checked={Boolean(s.slots)} onChange={e=>{const n=[...steps];n[i]={...s,slots:e.target.checked};setNested('followups',{steps:n})}}/> Allow two verified slots</label><button className="danger" onClick={()=>setNested('followups',{steps:steps.filter((_:any,j:number)=>j!==i)})}>Remove</button></div><textarea rows={4} value={s.message} onChange={e=>{const n=[...steps];n[i]={...s,message:e.target.value};setNested('followups',{steps:n})}}/></Section>)}
            <button className="secondary" onClick={()=>setNested('followups',{steps:[...steps,{delay:2,unit:'days',calendar:false,slots:false,message:''}]})}>+ Add follow-up</button>
        </>}
        {tab==='responses'&&<>
            <Section title="Tone and length"><div className="grid3"><Field label="Response tone"><select value={draft.tone||'Warm'} onChange={e=>set('tone',e.target.value)}><option>Warm</option><option>Laid Back</option><option>Professional</option><option>Direct</option></select></Field><Field label="Response length"><select value={draft.length||'Brief'} onChange={e=>set('length',e.target.value)}><option>Very Brief</option><option>Brief</option><option>Standard</option></select></Field><Field label="Office hours"><div className="pair"><input type="time" value={draft.officeStart||'09:00'} onChange={e=>set('officeStart',e.target.value)}/><input type="time" value={draft.officeEnd||'18:00'} onChange={e=>set('officeEnd',e.target.value)}/></div></Field></div></Section>
            <Section title="Not interested response"><div className="row between"><div><b>Reply once to “No thanks”</b><p className="muted">A light final nudge or feedback request, never an argument.</p></div><Toggle value={Boolean(draft.responses?.notInterestedEnabled)} onChange={v=>setNested('responses',{notInterestedEnabled:v})}/></div><div className="grid2"><Field label="Generation"><select value={draft.responses?.notInterestedMode||'Dynamic AI'} onChange={e=>setNested('responses',{notInterestedMode:e.target.value})}><option>Dynamic AI</option><option>Template</option></select></Field><Field label={'Sales aggressiveness: '+(draft.responses?.aggressiveness||1)}><input type="range" min="1" max="2" value={draft.responses?.aggressiveness||1} onChange={e=>setNested('responses',{aggressiveness:Number(e.target.value)})}/></Field></div><Field label="Instructions"><textarea rows={7} value={draft.responses?.notInterestedInstructions||''} onChange={e=>setNested('responses',{notInterestedInstructions:e.target.value})}/></Field><div className="row between line"><div><b>Final courtesy nudge</b><p className="muted">Guidance for the permitted final response. This does not schedule an additional message.</p></div><Toggle value={Boolean(draft.responses?.finalCourtesyNudge)} onChange={v=>setNested('responses',{finalCourtesyNudge:v})}/></div></Section>
            <Section title="Adaptive templates" description="Optional templates by classification. Dynamic context can still personalize the final reply."><div className="row between"><b>Enable adaptive templates</b><Toggle value={Boolean(draft.responses?.adaptiveTemplates)} onChange={v=>setNested('responses',{adaptiveTemplates:v})}/></div><Field label="Classification"><select value={templateIntent} onChange={e=>setTemplateIntent(e.target.value)}>{INTENTS.map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Template response"><textarea rows={6} placeholder="Hey {{first_name}}, …" value={draft.responses?.templates?.[templateIntent]||''} onChange={e=>setNested('responses',{templates:{...(draft.responses?.templates||{}),[templateIntent]:e.target.value}})}/></Field></Section>
            <Section title="CC, BCC and delegated replies"><div className="grid2"><Field label="Auto CC recipients"><input placeholder="email@company.com, …" value={draft.ccInput??''} onChange={e=>set('ccInput',e.target.value)}/></Field><Field label="Auto BCC recipients"><input placeholder="email@company.com, …" value={draft.bccInput??''} onChange={e=>set('bccInput',e.target.value)}/></Field></div><div className="toggleList"><span>Enable Auto CC <Toggle value={Boolean(draft.ccBcc?.ccEnabled)} onChange={v=>setNested('ccBcc',{ccEnabled:v})}/></span><span>Enable Auto BCC <Toggle value={Boolean(draft.ccBcc?.bccEnabled)} onChange={v=>setNested('ccBcc',{bccEnabled:v})}/></span><span>Respond to delegated emails <Toggle value={Boolean(draft.responses?.delegatedEnabled)} onChange={v=>setNested('responses',{delegatedEnabled:v})}/></span><span>New email to a referred contact — requires human review <Toggle disabled value={Boolean(draft.responses?.newDelegatedEmail)} onChange={v=>setNested('responses',{newDelegatedEmail:v})}/></span><span>Do not delegate OOO replies <Toggle value={Boolean(draft.responses?.disableDelegatedOOO)} onChange={v=>setNested('responses',{disableDelegatedOOO:v})}/></span></div><p className="muted">CC/BCC copies are added when a reply is sent. They do not send a separate notification when an incoming email arrives.</p>{(['cc','bcc'] as const).map(kind=>draft.ccBcc?.[kind+'Enabled']&&<div key={kind} style={{marginTop:16}}><Field label={kind.toUpperCase()+' reply types'}><select value={draft.ccBcc?.[kind+'Scope']||'all'} onChange={e=>setNested('ccBcc',{[kind+'Scope']:e.target.value,[kind+'Types']:draft.ccBcc?.[kind+'Types']||['Interested','Meeting Request']})}><option value="all">All replies</option><option value="selected">Only selected reply types</option></select></Field>{draft.ccBcc?.[kind+'Scope']==='selected'&&<div className="grid2">{INTENTS.map(type=><label key={type} style={{display:'flex',gap:8,alignItems:'center',padding:8}}><input type="checkbox" style={{width:16,height:16,flexShrink:0}} aria-label={kind.toUpperCase()+' '+type} checked={(draft.ccBcc?.[kind+'Types']||[]).includes(type)} onChange={e=>{const types=draft.ccBcc?.[kind+'Types']||[];setNested('ccBcc',{[kind+'Types']:e.target.checked?[...types,type]:types.filter((t:string)=>t!==type)})}}/>{type}</label>)}</div>}</div>)}</Section>
        </>}
        {tab==='knowledge'&&<>
            <Section title="Knowledge base" description="Reference assets for relevant replies. Adding a link here does not approve a campaign promise or mark a requested custom video ready; missing or unapproved promised assets still require review."><div className="row between"><b>Allow the agent to share approved assets</b><Toggle value={Boolean(draft.knowledge?.enabled)} onChange={v=>setNested('knowledge',{enabled:v})}/></div></Section>
            {assets.map((a:any,i:number)=><Section key={i} title={'Asset '+(i+1)}><div className="grid2"><Field label="Description"><textarea rows={3} value={a.description||''} onChange={e=>{const n=[...assets];n[i]={...a,description:e.target.value};setNested('knowledge',{assets:n})}}/></Field><Field label="Link"><input value={a.url||''} onChange={e=>{const n=[...assets];n[i]={...a,url:e.target.value};setNested('knowledge',{assets:n})}}/></Field></div><button className="danger" onClick={()=>setNested('knowledge',{assets:assets.filter((_:any,j:number)=>j!==i)})}>Remove asset</button></Section>)}
            <button className="secondary" onClick={()=>setNested('knowledge',{assets:[...assets,{description:'',url:''}]})}>+ Add case study, video, or document</button>
        </>}
        </main>
    </div>;
}

class Boundary extends React.Component<{children:React.ReactNode},{error:string}>{state={error:''};static getDerivedStateFromError(e:any){return{error:e?.message||String(e)}}render(){return this.state.error?<div className="fatal"><h2>DULCY REPLY AGENT ERROR</h2><p>{this.state.error}</p></div>:this.props.children}}

const CSS=`
*{box-sizing:border-box}body{margin:0;background:#f7f8fc;color:#111827;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.app{min-height:100vh}.app header{background:white;border-bottom:1px solid #e4e7ef;padding:26px 34px;display:flex;justify-content:space-between;align-items:center;gap:24px;position:sticky;top:0;z-index:5}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.14em;color:#7c3aed}.app h1{font-size:30px;margin:3px 0}.app header p,.cardHead p,.muted{color:#667085;margin:5px 0}.actions{display:flex;gap:10px;align-items:center}.actions select{min-width:220px}.save,.secondary{border:0;background:#6d28d9;color:white;padding:12px 18px;border-radius:10px;font-weight:800;cursor:pointer}.save:disabled{background:#d8dce6;color:#687083}.secondary{display:block;margin:14px auto 40px}.notice{margin:12px 34px 0;padding:10px 14px;border-radius:9px}.notice.ok{background:#ecfdf3;color:#067647}.notice.bad{background:#fef3f2;color:#b42318}.app nav{background:white;display:flex;gap:4px;padding:0 34px;border-bottom:1px solid #e4e7ef;overflow:auto}.app nav button{border:0;background:transparent;padding:15px 14px;font-weight:700;color:#667085;white-space:nowrap;border-bottom:3px solid transparent}.app nav button.active{color:#6d28d9;border-bottom-color:#7c3aed}.app main{max-width:1440px;margin:0 auto;padding:26px 34px 80px}.card{background:white;border:1px solid #e1e5ed;border-radius:16px;padding:24px;margin-bottom:18px;box-shadow:0 1px 3px #1018280d}.cardHead{border-bottom:1px solid #edf0f5;padding-bottom:16px;margin-bottom:20px}.card h3{margin:0;font-size:19px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}.stats>div{background:white;border:1px solid #e1e5ed;border-radius:14px;padding:18px}.stats span{display:block;color:#667085;font-size:12px;font-weight:700}.stats b{display:block;margin-top:8px;font-size:20px}.grid2,.grid3{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.grid3{grid-template-columns:repeat(3,minmax(0,1fr))}.field{display:block;margin-bottom:18px}.label{display:block;font-weight:750;font-size:13px;margin-bottom:7px}.field small{display:block;color:#667085;margin-top:5px}.app input,.app select,.app textarea{width:100%;border:1px solid #cfd5df;border-radius:9px;background:white;padding:11px 12px;color:#111827;font:inherit}.app textarea{resize:vertical}.app input:focus,.app select:focus,.app textarea:focus{outline:2px solid #c4b5fd;border-color:#7c3aed}.row{display:flex;align-items:center;gap:14px}.between{justify-content:space-between}.line{border-top:1px solid #edf0f5;margin-top:14px;padding-top:18px}.toggle{border:0;background:#d7dbe3;border-radius:999px;width:48px;height:27px;padding:3px;cursor:pointer;flex:0 0 auto}.toggle span{display:block;width:21px;height:21px;background:white;border-radius:50%;box-shadow:0 1px 4px #0003;transition:.18s}.toggle.on{background:#6d28d9}.toggle.on span{transform:translateX(21px)}.toggle b{position:absolute;left:-9999px}.segmented{display:flex;border:1px solid #d5dae3;border-radius:9px;overflow:hidden;width:max-content;max-width:100%}.segmented button{border:0;border-right:1px solid #d5dae3;background:white;padding:9px 11px;color:#596273;white-space:nowrap}.segmented button:last-child{border-right:0}.segmented button.active{background:#ede9fe;color:#5b21b6;font-weight:800}.integrationGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.integration{border:1px solid #dce1e9;border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center}.integration.connected{border-color:#86efac;background:#f0fdf4}.integration small{display:block;color:#667085;margin-top:5px}.warning{background:#fffaeb;border:1px solid #fedf89;color:#93370d;padding:14px;border-radius:10px}.toggleList{display:flex;flex-wrap:wrap;gap:12px;margin-top:16px}.toggleList>span,.inlineControl{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e1e5ed;border-radius:10px}.preview{background:#eff6ff;color:#1d4ed8;padding:14px;border-radius:10px}.routingTable{display:grid;gap:0}.routingHeader,.routingRow{display:grid;grid-template-columns:1.1fr 2fr 1.5fr;gap:14px;align-items:center;padding:12px;border-bottom:1px solid #e8ebf1}.routingHeader{color:#667085;font-size:12px;font-weight:800;text-transform:uppercase}.chips{display:flex;flex-wrap:wrap;gap:6px}.chips span{background:#f2f4f7;padding:5px 8px;border-radius:999px;font-size:12px}.followHead{display:grid;grid-template-columns:auto 80px 110px 1fr 1fr auto;gap:10px;align-items:center;margin-bottom:14px}.followHead label{display:flex;gap:7px;align-items:center}.followHead label input{width:auto}.danger{border:1px solid #fda29b;background:white;color:#b42318;border-radius:8px;padding:9px 12px;cursor:pointer}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}.empty,.fatal{padding:40px}.fatal{margin:30px;border:1px solid #fda29b;background:#fef3f2;border-radius:12px}.fatal h2{color:#b42318}.fatal p{white-space:pre-wrap}.app input[type=range]{padding:0;accent-color:#7c3aed}
.resolvedGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}.resolvedGrid>div{border:1px solid #dbe3ef;border-radius:10px;padding:12px;background:#fafbff}.resolvedGrid span{display:block;color:#667085;font-size:11px;font-weight:800;text-transform:uppercase;margin-bottom:5px}.formatGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.checkline{display:flex;align-items:center;gap:8px;margin:2px 0 14px}.checkline input{width:auto}
.overrideMeta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:-1px 0 8px}.sourceBadge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800}.sourceBadge.inherited{background:#ecfdf3;color:#067647}.sourceBadge.manual{background:#f3e8ff;color:#6b21a8}.textButton{border:0;background:transparent;color:#6d28d9;font-size:12px;font-weight:800;padding:4px;cursor:pointer}.textButton:hover{text-decoration:underline}
@media(max-width:900px){.app header{position:static;align-items:flex-start;flex-direction:column}.actions{width:100%;flex-wrap:wrap}.actions select{flex:1}.stats,.grid2,.grid3,.integrationGrid,.resolvedGrid,.formatGrid{grid-template-columns:1fr}.routingHeader{display:none}.routingRow{grid-template-columns:1fr}.followHead{grid-template-columns:1fr 1fr}.followHead>span{grid-column:1/-1}.app main{padding:20px 14px}.app header,.app nav{padding-left:16px;padding-right:16px}}
`;

initializeBlock({interface:()=> <Boundary><DulcyReplyAgent/></Boundary>});
