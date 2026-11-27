import {PROVIDERS,RULE_PROVIDERS,PROVIDER_NAMES,GHL_CALENDARS_VERSION,GHL_CONTACTS_VERSION,CALCOM_SLOTS_VERSION,CALCOM_BOOKINGS_VERSION,CALCOM_EVENT_TYPES_VERSION,
  normalizeCalendly,googleSlots,canBook,bookingRequest,bookingFingerprint,googleEventId,googleSlotFree,googleEventBody,googleBooked,calendlyLocation,calendlyAnswers,LOCATION_NAMES,
  bookingTag,microsoftFreeBusy,slotCollection,calcomStarts,ghlStarts,hubspotStarts,calcomAnswers,hubspotForm,splitName,videoName,microsoftEventBody,microsoftBooked,graphTime} from './calendar.mjs';
import {createHash} from 'node:crypto';

// Only provider APIs may receive tokens: the exact API hosts each provider uses, nothing wider.
// Redirects are rejected, not followed.
//  - Microsoft: login.microsoftonline.com (token), graph.microsoft.com (calendar). Cal.com: api.cal.com.
//  - GoHighLevel: services.leadconnectorhq.com. HubSpot: api.hubapi.com (app.hubspot.com is only the consent page in the browser).
export const HOSTS=new Set(['api.calendly.com','auth.calendly.com','oauth2.googleapis.com','openidconnect.googleapis.com','www.googleapis.com',
  'login.microsoftonline.com','graph.microsoft.com','api.cal.com','services.leadconnectorhq.com','api.hubapi.com']);

/** Remove anything credential-shaped (and emails) from a text that may reach an error, a log or a page. */
export function maskSecrets(text,secrets=[]){
  let t=String(text??'');
  for(const s of secrets)if(typeof s==='string'&&s.length>=8)t=t.split(s).join('[secret]');
  return t.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi,'Bearer [secret]').replace(/\bcal_[A-Za-z0-9_]{6,}/g,'[secret]').replace(/\bpit-[A-Za-z0-9-]{6,}/gi,'[secret]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+/g,'[secret]').replace(/[^\s@]+@[^\s@]+/g,'[email]');
}
function secretsOf(options){
  const out=[],auth=String(options?.headers?.Authorization||options?.headers?.authorization||'').replace(/^Bearer\s+/i,'');
  if(auth)out.push(auth);
  if(typeof options?.body==='string'&&!options.body.startsWith('{')){const p=new URLSearchParams(options.body);for(const k of ['client_secret','refresh_token','code','code_verifier'])if(p.get(k))out.push(p.get(k));}
  return out;
}

export async function providerJson(url,options={},fetchImpl=fetch) {
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||!HOSTS.has(parsed.hostname)||parsed.username||parsed.password||parsed.port)throw Error('Unapproved provider endpoint');
  const response=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok){
    // Keep the provider's own reason (Calendly {title,message,details}, Graph/Cal.com {error:{message}}, GHL {message:[…]},
    // HubSpot {message, errors}) so a 400 says what was wrong. Emails and credentials masked.
    let why='';try{const t=await response.text();const j=JSON.parse(t);why=[j.title,...[j.message].flat(),j.error_description,j.error?.message,typeof j.error==='string'?j.error:'',
      ...(Array.isArray(j.details)?j.details.map(d=>[d.parameter,d.message].filter(Boolean).join(': ')):[]),...(Array.isArray(j.errors)?j.errors.map(e=>e?.message):[])].filter(x=>typeof x==='string'&&x).join(' | ');}catch{}
    // HubSpot's token-info URL carries the token itself in its path.
    const inPath=parsed.pathname.startsWith('/oauth/v1/access-tokens/')?[decodeURIComponent(parsed.pathname.split('/').pop())]:[];
    why=maskSecrets(why,[...secretsOf(options),...inPath]).slice(0,300);
    const error=Error('Calendar provider request failed ('+response.status+')'+(why?': '+why:''));error.status=response.status;throw error;
  }
  const body=await response.text();if(body.length>2_000_000)throw Error('Calendar provider response too large');
  return body?JSON.parse(body):{};
}

const NEW_PROVIDERS=['microsoft','calcom','ghl','hubspot'];
const GRAPH='https://graph.microsoft.com/v1.0',GHL='https://services.leadconnectorhq.com',HUB='https://api.hubapi.com/scheduler/v3/meetings/meeting-links';
const UTC_PREFER={Prefer:'outlook.timezone="UTC"'};
const iso=t=>new Date(t).toISOString();
const validTz=tz=>{try{new Intl.DateTimeFormat('en-US',{timeZone:tz});return Boolean(tz);}catch{return false;}};
/** What the client chose: a change of any of these during a check means the answer is about another calendar. */
const selectionKey=c=>JSON.stringify([c.calendarIds||null,c.eventType||null,c.eventTypeId||null,c.calendarId||null,c.slug||null,c.durationMs||null,c.rules||null]);

/** The provider's list rows → the {id, name} choices on /calendar/select. */
export function choiceItems(provider,items){
  return items.map(x=>provider==='calendly'?{id:x.uri,name:x.name}:provider==='google'?{id:x.id,name:x.summary}:provider==='microsoft'?{id:x.id,name:x.name}
    :provider==='calcom'?{id:String(x.id),name:`${x.title}${x.lengthInMinutes?` (${x.lengthInMinutes} min)`:''}`}:provider==='ghl'?{id:x.id,name:x.name}:{id:x.slug,name:x.name||x.slug});
}

export class CalendarProvider {
  constructor({store,apps,fetchJson=providerJson,now=()=>Date.now(),log=x=>process.stdout.write(JSON.stringify({at:new Date().toISOString(),...x})+'\n')}){this.store=store;this.apps=apps;this.fetchJson=fetchJson;this.now=now;this.log=log;this.locks=new Map();}
  async locked(workspace,fn){
    const previous=this.locks.get(workspace)||Promise.resolve();let unlock;
    const next=new Promise(r=>unlock=r);this.locks.set(workspace,next);
    await previous;
    try{return await fn();}finally{unlock();if(this.locks.get(workspace)===next)this.locks.delete(workspace);}
  }
  async token(workspace){
    return this.locked(workspace,async()=>{
      const saved=this.store.get(workspace);if(!saved||!['Connected','Selection Required'].includes(saved.connection.status))throw Error('Calendar is not connected');
      let c=saved.connection;
      // A pasted key (Cal.com, GoHighLevel) has no refresh: it works until revoked (a 401 then marks Reconnect Required).
      if(c.credential==='key'||c.expiresAt>this.now()+60000)return c;
      const app=this.apps[c.provider],spec=PROVIDERS[c.provider];if(!app||!spec||!c.refreshToken)throw Error('Calendar must be reconnected');
      const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:c.refreshToken,client_id:app.clientId,client_secret:app.clientSecret});
      // Microsoft's v2 token endpoint takes the scopes on a refresh too.
      if(c.provider==='microsoft')body.set('scope',spec.scopes.join(' '));
      let result;
      try{result=await this.fetchJson(spec.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString()});}
      catch(error){if([400,401,403].includes(error.status))this.store.save({workspaceId:workspace,provider:c.provider,accountEmail:c.accountEmail,status:'Reconnect Required'},saved.revision);throw error;}
      if(!result.access_token||!(Number(result.expires_in)>0))throw Error('Calendar token refresh was incomplete');
      c={...c,accessToken:result.access_token,refreshToken:result.refresh_token||c.refreshToken,expiresAt:this.now()+Number(result.expires_in)*1000};
      this.store.save(c,saved.revision);return c;
    });
  }
  /** One provider call with this connection's credential. A pasted key that is refused (401) marks the connection Reconnect Required. */
  async api(c,workspace,url,{method='GET',body,headers={}}={}){
    try{return await this.fetchJson(url,{method,headers:{Authorization:'Bearer '+c.accessToken,...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});}
    catch(e){if(e.status===401&&c.credential==='key')this.lostCredential(workspace,c);throw e;}
  }
  lostCredential(workspace,c){
    try{const s=this.store.get(workspace);if(s?.connection?.accessToken===c.accessToken)this.store.save({workspaceId:workspace,provider:c.provider,accountEmail:c.accountEmail,status:'Reconnect Required'},s.revision);}catch{/* a parallel change wins */}
  }
  /** Follow a provider's "next page" links (at most 20 pages). */
  async pages(c,workspace,first,rows,next,headers={}){
    const out=[],seen=new Set();let url=first;
    while(url){
      const r=await this.api(c,workspace,url,{headers});const list=rows(r);if(!Array.isArray(list))throw Error('Calendar list unavailable');
      out.push(...list);url=next(r)||null;
      if(url){if(seen.has(url)||seen.size>=20)throw Error('Calendar list pagination incomplete');seen.add(url);}
    }
    return out;
  }
  async choices(workspace){
    const c=await this.token(workspace);let items;
    if(c.provider==='calendly'||c.provider==='google'){
      const headers={Authorization:'Bearer '+c.accessToken};items=[];
      let next=null;const seen=new Set();
      do{
        const url=new URL(c.provider==='calendly'?'https://api.calendly.com/event_types':'https://www.googleapis.com/calendar/v3/users/me/calendarList');
        if(c.provider==='calendly'){url.searchParams.set('user',c.providerUserId);url.searchParams.set('active','true');url.searchParams.set('count','100');}
        if(next)url.searchParams.set(c.provider==='calendly'?'page_token':'pageToken',next);
        const r=await this.fetchJson(url.href,{headers});
        const rows=c.provider==='calendly'?r.collection:r.items;if(!Array.isArray(rows))throw Error('Calendar list unavailable');
        items.push(...rows);next=c.provider==='calendly'?r.pagination?.next_page_token:r.nextPageToken;
        if(next){if(seen.has(next)||seen.size>=20)throw Error('Calendar list pagination incomplete');seen.add(next);}
      }while(next);
    }else if(c.provider==='microsoft'){
      items=await this.pages(c,workspace,GRAPH+'/me/calendars?$select=id,name,canEdit&$top=100',r=>r?.value,r=>r?.['@odata.nextLink']);
    }else if(c.provider==='calcom'){
      const r=await this.api(c,workspace,'https://api.cal.com/v2/event-types',{headers:{'cal-api-version':CALCOM_EVENT_TYPES_VERSION}});
      if(!Array.isArray(r?.data))throw Error('Calendar list unavailable');
      // Only the connected user's own event types (ownerId), never a team member's.
      items=r.data.filter(x=>x&&x.id!=null&&(x.ownerId==null||String(x.ownerId)===String(c.providerUserId)));
    }else if(c.provider==='ghl'){
      const r=await this.api(c,workspace,GHL+'/calendars/?locationId='+encodeURIComponent(c.locationId),{headers:{Version:GHL_CALENDARS_VERSION}});
      if(!Array.isArray(r?.calendars))throw Error('Calendar list unavailable');
      items=r.calendars.filter(x=>x?.id&&x.isActive!==false&&(!x.locationId||x.locationId===c.locationId));
    }else if(c.provider==='hubspot'){
      items=await this.pages(c,workspace,HUB+'?limit=100',r=>r?.results,r=>r?.paging?.next?.after?HUB+'?limit=100&after='+encodeURIComponent(r.paging.next.after):null);
    }else throw Error('Unsupported provider');
    return {connection:c,items};
  }
  async select(workspace,selection){
    const before=this.store.get(workspace);if(!before)throw Error('Connect an account first');
    const {connection:c,items}=await this.choices(workspace);
    if(c.providerUserId!==before.connection.providerUserId)throw Error('Account changed during calendar selection');
    let next;
    if(c.provider==='calendly'){
      const event=items.find(x=>x.uri===selection.eventType&&x.active===true);
      if(!event)throw Error('Choose an event type owned by the connected account');
      next={...c,eventType:event.uri,eventName:event.name,schedulingUrl:event.scheduling_url,status:'Connected'};
    }else if(RULE_PROVIDERS.includes(c.provider)){
      const ids=[...new Set(selection.calendarIds||[])];
      if(!ids.length||ids.length>50||ids.some(id=>!items.some(x=>x.id===id&&!x.deleted)))throw Error('Choose accessible calendars');
      // Validate explicit scheduling rules without treating an empty calendar response as availability.
      const testStart=new Date(this.now()+3600000).toISOString(),testEnd=new Date(this.now()+7200000).toISOString();
      next={...c,calendarIds:ids,rules:selection.rules,status:'Connected'};
      googleSlots({connection:next,workspace,start:testStart,end:testEnd,rules:selection.rules,now:this.now(),response:{timeMin:testStart,timeMax:testEnd,calendars:Object.fromEntries(ids.map(id=>[id,{busy:[]}]))}});
    }else{
      // One meeting type / calendar / meeting link: its own availability rules live in the provider.
      const id=String(selection.eventType||''),timezone=String(selection.timezone||c.timezone||'').trim();
      if(!validTz(timezone))throw Error('A valid time zone is required');
      const pick=choiceItems(c.provider,items).findIndex(x=>x.id===id);
      if(!id||pick<0)throw Error('Choose a calendar owned by the connected account');
      const x=items[pick];
      if(c.provider==='calcom')next={...c,eventTypeId:String(x.id),eventName:x.title,eventMinutes:Number(x.lengthInMinutes)||null,schedulingUrl:x.bookingUrl||null,timezone,status:'Connected'};
      else if(c.provider==='ghl'){
        const minutes=(Number(x.slotDuration)||0)*(x.slotDurationUnit==='hours'?60:1);
        next={...c,calendarId:x.id,eventName:x.name,eventMinutes:minutes||null,timezone,status:'Connected'};
      }else{
        const info=await this.api(c,workspace,HUB+'/book/'+encodeURIComponent(x.slug)+'?timezone=UTC');
        // durations are int64 like meetingDurationMillis (milliseconds); a small number is read as minutes (UNKNOWN: never seen).
        let ms=Number(info?.customParams?.durations?.[0]);if(ms>0&&ms<10000)ms*=60000;
        if(!(ms>0))throw Error('The meeting link has no meeting length');
        next={...c,slug:x.slug,eventName:x.name||x.slug,schedulingUrl:x.link||null,durationMs:ms,eventMinutes:Math.round(ms/60000),timezone,status:'Connected'};
      }
    }
    const latest=this.store.get(workspace);
    // A token refresh may increment revision; a replacement account or disconnect cannot be overwritten.
    if(!latest||latest.connection.providerUserId!==c.providerUserId||latest.connection.accessToken!==c.accessToken||!['Connected','Selection Required'].includes(latest.connection.status))throw Error('Calendar connection changed; choose again');
    this.store.save(next,latest.revision);return this.status(workspace);
  }
  status(workspace){
    const s=this.store.get(workspace),c=s?.connection;
    // A connection made before booking existed (read scopes only), or one that lost a permission, says so; never fails silently.
    const booking=!c?'not_connected':c.status==='Reconnect Required'?'reconnect':c.status!=='Connected'?'not_connected':canBook(c)?'ready':'reconnect';
    const label=booking==='ready'?'Connected – booking allowed':c?.status==='Connected'?'Connected – reconnect to allow booking'
      :c?.status==='Reconnect Required'?'Reconnect required – the calendar access expired or lost a permission; send the client a new calendar link':(c?.status||'Not Connected');
    return {workspaceId:workspace,status:c?.status||'Not Connected',provider:c?.provider||null,providerName:PROVIDER_NAMES[c?.provider]||null,accountEmail:c?.accountEmail||null,eventName:c?.eventName||null,revision:s?.revision||0,
      canBook:booking==='ready',booking,label,timezone:c?.rules?.timezone||c?.timezone||null};
  }
  /** Outlook busy times on the selected calendars, in Google's free/busy shape. */
  async microsoftBusy(c,workspace,timeMin,timeMax){
    const out={};
    for(const id of c.calendarIds){
      const u=new URL(GRAPH+'/me/calendars/'+encodeURIComponent(id)+'/calendarView');
      u.search=new URLSearchParams({startDateTime:timeMin,endDateTime:timeMax,$select:'start,end,showAs,isCancelled',$top:'250'}).toString();
      out[id]=await this.pages(c,workspace,u.href,r=>r?.value,r=>r?.['@odata.nextLink'],UTC_PREFER);
    }
    return microsoftFreeBusy(out,timeMin,timeMax);
  }
  /** Bookable start times from a provider that keeps its own availability rules (Cal.com, GoHighLevel, HubSpot). */
  async providerStarts(c,workspace,start,end){
    if(c.provider==='calcom'){
      const u=new URL('https://api.cal.com/v2/slots');u.search=new URLSearchParams({eventTypeId:String(c.eventTypeId),start,end,timeZone:'UTC'}).toString();
      return calcomStarts(await this.api(c,workspace,u.href,{headers:{'cal-api-version':CALCOM_SLOTS_VERSION}}));
    }
    if(c.provider==='ghl'){
      // startDate/endDate are epoch milliseconds (OpenAPI example 1548898600000); the range may not exceed 31 days.
      const u=new URL(GHL+'/calendars/'+encodeURIComponent(c.calendarId)+'/free-slots');u.search=new URLSearchParams({startDate:String(Date.parse(start)),endDate:String(Date.parse(end)),timezone:'UTC'}).toString();
      return ghlStarts(await this.api(c,workspace,u.href,{headers:{Version:GHL_CALENDARS_VERSION}}));
    }
    if(c.provider==='hubspot'){
      // The availability page is a month view (monthOffset 0 = this month). UNKNOWN: whether "this month" follows the
      // timezone parameter; we ask in UTC and filter by exact instants, so a window over a month end reads both months.
      const month=t=>{const d=new Date(t);return d.getUTCFullYear()*12+d.getUTCMonth();};
      const first=month(Date.parse(start))-month(this.now()),last=Math.min(month(Date.parse(end))-month(this.now()),first+2),starts=[];
      for(let k=Math.max(0,first);k<=last;k++)starts.push(...hubspotStarts(await this.api(c,workspace,HUB+'/book/availability-page/'+encodeURIComponent(c.slug)+'?timezone=UTC&monthOffset='+k),c.durationMs));
      return starts;
    }
    throw Error('Unsupported provider');
  }
  async availability(workspace,{start,end}){
    const c=await this.token(workspace);if(c.status!=='Connected')throw Error('Select a calendar first');
    const headers={Authorization:'Bearer '+c.accessToken};let result;
    if(c.provider==='calendly'){
      if(!/^https:\/\/api\.calendly\.com\/event_types\/[A-Za-z0-9-]+$/.test(c.eventType||''))throw Error('Invalid saved event type');
      const event=(await this.fetchJson(c.eventType,{headers})).resource;
      const url=new URL('https://api.calendly.com/event_type_available_times');url.search=new URLSearchParams({event_type:c.eventType,start_time:start,end_time:end}).toString();
      const response=await this.fetchJson(url.href,{headers});
      result=normalizeCalendly({connection:c,workspace,event,response,start,end,now:this.now()});
    }else if(c.provider==='google'){
      const response=await this.fetchJson('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({timeMin:start,timeMax:end,timeZone:c.rules.timezone,items:c.calendarIds.map(id=>({id}))})});
      result=googleSlots({connection:c,workspace,response,start,end,rules:c.rules,now:this.now()});
    }else if(c.provider==='microsoft'){
      const response=await this.microsoftBusy(c,workspace,start,end);
      result=googleSlots({connection:c,workspace,response,start,end,rules:c.rules,now:this.now()});
    }else{
      const from=Date.parse(start),until=Date.parse(end);
      if(!(from>this.now()&&until>from&&until-from<=7*86400_000))throw Error('Invalid availability window');
      result=slotCollection({connection:c,workspace,starts:await this.providerStarts(c,workspace,start,end),start,end,now:this.now()});
    }
    const latest=this.store.get(workspace)?.connection;
    if(!latest||latest.status!=='Connected'||latest.providerUserId!==c.providerUserId||selectionKey(latest)!==selectionKey(c))throw Error('Calendar changed during availability check');
    const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,16);
    const eventType=c.provider==='calendly'?c.eventType:c.provider==='google'?'google:'+workspace+':'+hash([c.providerUserId,c.calendarIds,c.rules]):c.provider+':'+workspace+':'+hash([c.providerUserId,selectionKey(c)]);
    return {...result,eventType,connection:{workspaceId:workspace,eventType,timezone:c.rules?.timezone||c.timezone||'America/New_York',provider:c.provider,status:'Connected',canBook:canBook(c)}};
  }

  /** Is this exact slot free right now (live provider read)? {free, reason: '' | taken | outside_hours | notice}. */
  async slotFree(c,workspace,req){
    const headers={Authorization:'Bearer '+c.accessToken};
    if(RULE_PROVIDERS.includes(c.provider)){
      const buffer=c.rules.bufferMinutes*60000;
      const timeMin=new Date(Date.parse(req.start)-buffer).toISOString(),timeMax=new Date(Date.parse(req.end)+buffer).toISOString();
      const response=c.provider==='google'
        ?await this.fetchJson('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({timeMin,timeMax,timeZone:c.rules.timezone,items:c.calendarIds.map(id=>({id}))})})
        :await this.microsoftBusy(c,workspace,timeMin,timeMax);
      return googleSlotFree({connection:c,workspace,response,start:req.start,end:req.end,rules:c.rules,now:this.now()});
    }
    if(c.provider==='calendly'){
      const event=(await this.fetchJson(c.eventType,{headers})).resource;
      const until=new Date(Date.parse(req.start)+60000).toISOString();
      const url=new URL('https://api.calendly.com/event_type_available_times');url.search=new URLSearchParams({event_type:c.eventType,start_time:req.start,end_time:until}).toString();
      const r=normalizeCalendly({connection:c,workspace,event,response:await this.fetchJson(url.href,{headers}),start:req.start,end:until,now:this.now()});
      return r.collection.some(x=>x.start_time===req.start)?{free:true,reason:'',event}:{free:false,reason:'taken',event};
    }
    // Providers with their own rules: the exact start must be one of their bookable times (asked over the next 24 hours).
    const until=new Date(Date.parse(req.start)+86400000).toISOString();
    const r=slotCollection({connection:c,workspace,starts:await this.providerStarts(c,workspace,req.start,until),start:req.start,end:until,now:this.now()});
    return r.collection.some(x=>x.start_time===req.start)?{free:true,reason:''}:{free:false,reason:'taken'};
  }

  /**
   * Book one agreed time on this workspace's own calendar (Alex 2026-11-27). Steps, in order:
   * 1. the same idempotency key never books twice (it returns the first booking);
   * 2. live re-check of that exact slot: not free → {booked:false, reason:'taken'};
   * 3. the provider booking: Google event + Meet (Google sends the invite); Calendly POST /invitees; Outlook event
   *    (+ Teams when allowed; Graph sends the invite); Cal.com POST /v2/bookings; GoHighLevel contact upsert +
   *    appointment; HubSpot meeting-link book. Each provider sends its own confirmation.
   */
  async book(workspace,input){
    const req=bookingRequest({...input,workspace},this.now()),fp=bookingFingerprint(req);
    const c=await this.token(workspace);
    if(c.status!=='Connected')return {booked:false,reason:'not_connected',message:'Calendar is not connected'};
    if(!canBook(c))return {booked:false,reason:'reconnect',message:'Connected – reconnect to allow booking'};
    return this.locked('book:'+workspace,async()=>{
      const prior=this.store.booking(workspace,req.idempotencyKey);
      if(prior&&prior.fingerprint!==fp)throw Error('This idempotency key was used for another booking');
      if(prior?.status==='booked')return {...prior.result,idempotent:true};
      try{
        if(c.provider==='google')return await this.bookGoogle(workspace,c,req,fp,prior);
        if(c.provider==='calendly')return await this.bookCalendly(workspace,c,req,fp,prior);
        if(c.provider==='microsoft')return await this.bookMicrosoft(workspace,c,req,fp,prior);
        if(c.provider==='calcom')return await this.bookCalcom(workspace,c,req,fp,prior);
        if(c.provider==='ghl')return await this.bookGhl(workspace,c,req,fp,prior);
        if(c.provider==='hubspot')return await this.bookHubspot(workspace,c,req,fp,prior);
        throw Error('Unsupported provider');
      }catch(e){
        // A refused write (403) on the new providers = the credential lacks the booking permission: booking is
        // switched off for this connection and the status says "reconnect" (nothing was booked).
        if(e.status===403&&NEW_PROVIDERS.includes(c.provider)){
          this.bookingRefused(workspace,c);
          return {booked:false,reason:'reconnect',message:`${PROVIDER_NAMES[c.provider]} refused the booking: the connection is missing the booking permission. Reconnect the calendar (new link from HQ).`};
        }
        throw e;
      }
    });
  }
  bookingRefused(workspace,c){
    try{const s=this.store.get(workspace);if(s?.connection?.accessToken===c.accessToken)this.store.save({...s.connection,canBook:false},s.revision);}catch{/* a parallel change wins */}
  }
  async bookGoogle(workspace,c,req,fp,prior){
    if(!Array.isArray(c.calendarIds)||!c.calendarIds.length)throw Error('Choose calendars before booking');
    if(!req.end)req.end=new Date(Date.parse(req.start)+c.rules.durationMinutes*60000).toISOString();
    const id=googleEventId(workspace,req.idempotencyKey);
    // An earlier attempt may have created the event before it could record it: adopt it.
    if(prior?.status==='pending'){const found=await this.googleEvent(c,id,req);if(found)return this.finish(workspace,req,fp,found);}
    const check=await this.slotFree(c,workspace,req);
    if(!check.free)return {booked:false,reason:check.reason||'taken'};
    this.store.putBooking(workspace,req.idempotencyKey,'pending',{fingerprint:fp,start:req.start},this.now());
    let ev;
    try{ev=await this.fetchJson('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',{method:'POST',headers:{Authorization:'Bearer '+c.accessToken,'Content-Type':'application/json'},body:JSON.stringify(googleEventBody(req,id))});}
    catch(e){
      if(e.status===409){const found=await this.googleEvent(c,id,req);if(found)return this.finish(workspace,req,fp,found);}
      if(e.status&&e.status<500&&e.status!==409)this.store.dropBooking(workspace,req.idempotencyKey);
      throw e;
    }
    return this.finish(workspace,req,fp,googleBooked(ev,req));
  }
  async bookCalendly(workspace,c,req,fp,prior){
    // Calendly has no idempotency key on POST /invitees: an attempt whose outcome is unknown is looked up
    // (scheduled_events:read) and adopted; without that permission it is never retried blindly.
    const canRead=Array.isArray(c.scopes)&&c.scopes.includes('scheduled_events:read');
    if(prior?.status==='pending'){
      if(!canRead)return {booked:false,reason:'uncertain',message:'An earlier booking attempt for this key has an unknown outcome; check the Calendly calendar before booking again'};
      const found=await this.calendlyEvent(c,req);
      if(found)return this.finish(workspace,req,fp,found);
    }
    const check=await this.slotFree(c,workspace,req);
    if(!check.free)return {booked:false,reason:'taken'};
    const location=calendlyLocation(check.event);
    const answers=calendlyAnswers(check.event,req);
    this.store.putBooking(workspace,req.idempotencyKey,'pending',{fingerprint:fp,start:req.start},this.now());
    let r;
    try{r=await this.fetchJson('https://api.calendly.com/invitees',{method:'POST',headers:{Authorization:'Bearer '+c.accessToken,'Content-Type':'application/json'},body:JSON.stringify({event_type:c.eventType,start_time:req.start,invitee:{name:req.name,email:req.email,timezone:req.timezone},...(location?{location}:{}),...(answers.length?{questions_and_answers:answers}:{})})});}
    catch(e){if(e.status&&e.status<500)this.store.dropBooking(workspace,req.idempotencyKey);throw e;}
    const inv=r?.resource||{};
    const minutes=Number(check.event?.duration)||0;
    // The meeting's own join link, when we may read scheduled events (best effort: the booking is already made).
    let joinUrl=null;
    if(canRead&&/^https:\/\/api\.calendly\.com\/scheduled_events\/[A-Za-z0-9-]+$/.test(String(inv.event||''))){
      try{joinUrl=(await this.fetchJson(inv.event,{headers:{Authorization:'Bearer '+c.accessToken}}))?.resource?.location?.join_url||null;}catch{joinUrl=null;}
    }
    return this.finish(workspace,req,fp,{booked:true,provider:'calendly',eventId:String(inv.event||inv.uri||''),inviteeUri:inv.uri||null,htmlLink:null,meetLink:joinUrl,
      cancelUrl:inv.cancel_url||null,rescheduleUrl:inv.reschedule_url||null,start:req.start,end:req.end||(minutes?new Date(Date.parse(req.start)+minutes*60000).toISOString():null),
      timezone:req.timezone,location:location?LOCATION_NAMES[location.kind]||null:null});
  }
  /** Outlook: an event on the default calendar. Graph's transactionId (from the key) stops a retried POST making a second event. */
  async bookMicrosoft(workspace,c,req,fp,prior){
    if(!Array.isArray(c.calendarIds)||!c.calendarIds.length)throw Error('Choose calendars before booking');
    if(!req.end)req.end=new Date(Date.parse(req.start)+c.rules.durationMinutes*60000).toISOString();
    const tx=bookingTag(workspace,req.idempotencyKey);
    if(prior?.status==='pending'){const found=await this.microsoftEvent(c,workspace,tx,req);if(found)return this.finish(workspace,req,fp,found);}
    const check=await this.slotFree(c,workspace,req);
    if(!check.free)return {booked:false,reason:check.reason||'taken'};
    // Teams only when this calendar allows it (work/school accounts); a personal account gets no conferencing.
    const cal=await this.api(c,workspace,GRAPH+'/me/calendar?$select=id,allowedOnlineMeetingProviders');
    const teams=Array.isArray(cal?.allowedOnlineMeetingProviders)&&cal.allowedOnlineMeetingProviders.includes('teamsForBusiness');
    this.store.putBooking(workspace,req.idempotencyKey,'pending',{fingerprint:fp,start:req.start},this.now());
    let ev;
    try{ev=await this.api(c,workspace,GRAPH+'/me/events',{method:'POST',body:microsoftEventBody(req,tx,teams)});}
    catch(e){
      if(e.status===409){const found=await this.microsoftEvent(c,workspace,tx,req);if(found)return this.finish(workspace,req,fp,found);}
      if(e.status&&e.status<500&&e.status!==409)this.store.dropBooking(workspace,req.idempotencyKey);
      throw e;
    }
    return this.finish(workspace,req,fp,microsoftBooked(ev,req));
  }
  /** The Outlook event an earlier attempt made for this key (same transactionId), or null. */
  async microsoftEvent(c,workspace,tx,req){
    const u=new URL(GRAPH+'/me/calendar/calendarView');
    u.search=new URLSearchParams({startDateTime:req.start,endDateTime:new Date(Date.parse(req.start)+60000).toISOString(),$select:'id,start,end,attendees,transactionId,webLink,onlineMeeting,isCancelled',$top:'50'}).toString();
    const events=await this.pages(c,workspace,u.href,r=>r?.value,r=>r?.['@odata.nextLink'],UTC_PREFER);
    const ev=events.find(e=>e?.transactionId===tx);
    if(!ev)return null;
    if(ev.isCancelled)throw Error('The event for this booking key was cancelled; book with a new key');
    if(graphTime(ev.start)!==Date.parse(req.start)||!(ev.attendees||[]).some(a=>String(a?.emailAddress?.address).toLowerCase()===req.email))throw Error('An event with this booking id exists for another time or attendee');
    return microsoftBooked(ev,req);
  }
  /** Cal.com: POST /v2/bookings. No idempotency key there, so the booking carries a tag in its metadata and a lost answer is looked up. */
  async bookCalcom(workspace,c,req,fp,prior){
    const tag=bookingTag(workspace,req.idempotencyKey);
    if(prior?.status==='pending'){const found=await this.calcomBooking(c,workspace,req,tag);if(found)return this.finish(workspace,req,fp,found);}
    const check=await this.slotFree(c,workspace,req);
    if(!check.free)return {booked:false,reason:'taken'};
    const et=(await this.api(c,workspace,'https://api.cal.com/v2/event-types/'+encodeURIComponent(c.eventTypeId),{headers:{'cal-api-version':CALCOM_EVENT_TYPES_VERSION}}))?.data;
    const answers=calcomAnswers(et,req);
    this.store.putBooking(workspace,req.idempotencyKey,'pending',{fingerprint:fp,start:req.start},this.now());
    let r;
    try{r=await this.api(c,workspace,'https://api.cal.com/v2/bookings',{method:'POST',headers:{'cal-api-version':CALCOM_BOOKINGS_VERSION},body:{start:req.start,eventTypeId:Number(c.eventTypeId),
      attendee:{name:req.name,email:req.email,timeZone:req.timezone,...(req.phone?{phoneNumber:req.phone}:{})},...(Object.keys(answers).length?{bookingFieldsResponses:answers}:{}),metadata:{dulcyBooking:tag}}});}
    catch(e){if(e.status&&e.status<500)this.store.dropBooking(workspace,req.idempotencyKey);throw e;}
    return this.finish(workspace,req,fp,calcomBooked(r?.data,req,et?.lengthInMinutes||c.eventMinutes));
  }
  async calcomBooking(c,workspace,req,tag){
    const u=new URL('https://api.cal.com/v2/bookings');
    u.search=new URLSearchParams({attendeeEmail:req.email,afterStart:new Date(Date.parse(req.start)-60000).toISOString(),beforeEnd:new Date(Date.parse(req.start)+86400000).toISOString(),take:'20'}).toString();
    const r=await this.api(c,workspace,u.href,{headers:{'cal-api-version':CALCOM_BOOKINGS_VERSION}});
    const b=(Array.isArray(r?.data)?r.data:[]).find(x=>x?.metadata?.dulcyBooking===tag&&!['cancelled','rejected'].includes(String(x.status).toLowerCase()));
    return b?calcomBooked(b,req,c.eventMinutes):null;
  }
  /** GoHighLevel: upsert the contact (POST /contacts/upsert), then the appointment on the chosen calendar. */
  async bookGhl(workspace,c,req,fp,prior){
    if(prior?.status==='pending'&&prior.contactId){
      // The appointment POST may have gone through before its answer was lost. Look it up when the token may read events.
      if(!c.canReadEvents)return {booked:false,reason:'uncertain',message:'An earlier booking attempt for this key has an unknown outcome; check the GoHighLevel calendar before booking again'};
      const found=await this.ghlEvent(c,workspace,req,prior.contactId);
      if(found)return this.finish(workspace,req,fp,found);
    }
    const check=await this.slotFree(c,workspace,req);
    if(!check.free)return {booked:false,reason:'taken'};
    const end=req.end||(c.eventMinutes?new Date(Date.parse(req.start)+c.eventMinutes*60000).toISOString():null);
    this.store.putBooking(workspace,req.idempotencyKey,'pending',{fingerprint:fp,start:req.start},this.now());
    const {first,last}=splitName(req.name);
    let contact;
    // No appointment exists yet, so a failed upsert can always be retried from scratch.
    try{contact=(await this.api(c,workspace,GHL+'/contacts/upsert',{method:'POST',headers:{Version:GHL_CONTACTS_VERSION},body:{locationId:c.locationId,email:req.email,name:req.name,firstName:first,...(last!=='-'?{lastName:last}:{}),...(req.phone?{phone:req.phone}:{}),source:'Dulcy reply agent'}}))?.contact;}
    catch(e){this.store.dropBooking(workspace,req.idempotencyKey);throw e;}
    if(!contact?.id){this.store.dropBooking(workspace,req.idempotencyKey);throw Error('GoHighLevel did not return the contact');}
    this.store.putBooking(workspace,req.idempotencyKey,'pending',{fingerprint:fp,start:req.start,contactId:String(contact.id)},this.now());
    let appt;
    // toNotify true: the calendar's own confirmations and automations run. Free-slot validation stays on, so GHL refuses a taken time itself.
    try{appt=await this.api(c,workspace,GHL+'/calendars/events/appointments',{method:'POST',headers:{Version:GHL_CALENDARS_VERSION},body:{calendarId:c.calendarId,locationId:c.locationId,contactId:String(contact.id),
      startTime:req.start,...(end?{endTime:end}:{}),title:req.title,appointmentStatus:'confirmed',toNotify:true,...(req.description?{description:req.description}:{})}});}
    catch(e){if(e.status&&e.status<500)this.store.dropBooking(workspace,req.idempotencyKey);throw e;}
    return this.finish(workspace,req,fp,ghlBooked(appt,req,end));
  }
  async ghlEvent(c,workspace,req,contactId){
    const t=Date.parse(req.start),u=new URL(GHL+'/calendars/events');
    u.search=new URLSearchParams({locationId:c.locationId,calendarId:c.calendarId,startTime:String(t-60000),endTime:String(t+60000)}).toString();
    const r=await this.api(c,workspace,u.href,{headers:{Version:GHL_CALENDARS_VERSION}});
    const ev=(Array.isArray(r?.events)?r.events:[]).find(e=>String(e?.contactId)===contactId&&Date.parse(e?.startTime)===t&&!['cancelled','invalid'].includes(String(e?.appointmentStatus)));
    return ev?ghlBooked(ev,req,ev.endTime?iso(Date.parse(ev.endTime)):null):null;
  }
  /** HubSpot: POST /scheduler/v3/meetings/meeting-links/book (HubSpot sends its own confirmation). No idempotency key and no read-back scope. */
  async bookHubspot(workspace,c,req,fp,prior){
    if(prior?.status==='pending')return {booked:false,reason:'uncertain',message:'An earlier booking attempt for this key has an unknown outcome; check the HubSpot calendar before booking again'};
    const info=await this.api(c,workspace,HUB+'/book/'+encodeURIComponent(c.slug)+'?timezone=UTC');
    const form=hubspotForm(info,req);
    const check=await this.slotFree(c,workspace,req);
    if(!check.free)return {booked:false,reason:'taken'};
    // likelyAvailableUserIds is required by the schema; the link's own members are sent (UNKNOWN: exact semantics).
    const users=[...new Set((info?.allUsersBusyTimes||[]).map(u=>u?.meetingsUser?.userId).filter(Boolean).map(String))];
    const {first,last}=splitName(req.name);
    this.store.putBooking(workspace,req.idempotencyKey,'pending',{fingerprint:fp,start:req.start},this.now());
    let r;
    try{r=await this.api(c,workspace,HUB+'/book',{method:'POST',body:{slug:c.slug,firstName:first,lastName:last,email:req.email,startTime:req.start,duration:c.durationMs,
      timezone:req.timezone,locale:'en-us',formFields:form.formFields,legalConsentResponses:form.legalConsentResponses,likelyAvailableUserIds:users}});}
    catch(e){if(e.status&&e.status<500)this.store.dropBooking(workspace,req.idempotencyKey);throw e;}
    const meet=/^https:\/\//.test(String(r?.webConferenceUrl||''))?r.webConferenceUrl:null;
    return this.finish(workspace,req,fp,{booked:true,provider:'hubspot',eventId:String(r?.calendarEventId||''),htmlLink:null,meetLink:meet,
      start:r?.start?iso(Date.parse(r.start)):req.start,end:r?.end?iso(Date.parse(r.end)):iso(Date.parse(req.start)+c.durationMs),timezone:req.timezone,location:videoName(meet)||(r?.location?'See invite':null)});
  }
  /** The Calendly meeting this prospect already has at exactly this time (an earlier attempt whose answer was lost). */
  async calendlyEvent(c,req){
    const url=new URL('https://api.calendly.com/scheduled_events');
    url.search=new URLSearchParams({user:c.providerUserId,invitee_email:req.email,min_start_time:req.start,max_start_time:new Date(Date.parse(req.start)+60000).toISOString(),status:'active',count:'10'}).toString();
    const r=await this.fetchJson(url.href,{headers:{Authorization:'Bearer '+c.accessToken}});
    const ev=(Array.isArray(r?.collection)?r.collection:[]).find(e=>Date.parse(e?.start_time)===Date.parse(req.start)&&(!c.eventType||e?.event_type===c.eventType));
    if(!ev)return null;
    return {booked:true,provider:'calendly',eventId:String(ev.uri||''),inviteeUri:null,htmlLink:null,meetLink:ev.location?.join_url||null,cancelUrl:null,rescheduleUrl:null,
      start:req.start,end:ev.end_time?new Date(ev.end_time).toISOString():req.end,timezone:req.timezone,location:LOCATION_NAMES[ev.location?.type]||null};
  }
  async googleEvent(c,id,req){
    let ev;
    try{ev=await this.fetchJson('https://www.googleapis.com/calendar/v3/calendars/primary/events/'+id,{headers:{Authorization:'Bearer '+c.accessToken}});}
    catch(e){if(e.status===404||e.status===410)return null;throw e;}
    if(ev?.status==='cancelled')throw Error('The event for this booking key was cancelled; book with a new key');
    if(Date.parse(ev?.start?.dateTime)!==Date.parse(req.start)||!(ev?.attendees||[]).some(a=>String(a.email).toLowerCase()===req.email))throw Error('An event with this booking id exists for another time or attendee');
    return googleBooked(ev,req);
  }
  finish(workspace,req,fp,result){
    this.store.putBooking(workspace,req.idempotencyKey,'booked',{fingerprint:fp,start:req.start,result},this.now());
    // Every booking is logged (no prospect email in the log).
    this.log({event:'booking',workspace,provider:result.provider,eventId:result.eventId,start:result.start});
    return {...result,idempotent:false};
  }
}

function calcomBooked(b,req,minutes){
  const link=[b?.meetingUrl,b?.location].find(x=>/^https:\/\//.test(String(x||'')))||null;
  return {booked:true,provider:'calcom',eventId:String(b?.uid||b?.id||''),htmlLink:null,meetLink:link,
    start:b?.start?iso(Date.parse(b.start)):req.start,end:b?.end?iso(Date.parse(b.end)):(req.end||(minutes?iso(Date.parse(req.start)+minutes*60000):null)),
    timezone:req.timezone,location:videoName(link)||(b?.location?'See invite':null)};
}
function ghlBooked(a,req,end){
  const link=/^https:\/\//.test(String(a?.address||''))?a.address:null;
  return {booked:true,provider:'ghl',eventId:String(a?.id||''),htmlLink:null,meetLink:link,start:a?.startTime?iso(Date.parse(a.startTime)):req.start,
    end:a?.endTime?iso(Date.parse(a.endTime)):end,timezone:req.timezone,location:videoName(link)||(a?.address?'See invite':null)};
}
