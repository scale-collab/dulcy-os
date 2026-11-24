import {PROVIDERS,normalizeCalendly,googleSlots} from './calendar.mjs';
import {createHash} from 'node:crypto';

// Only provider APIs may receive tokens. Redirects are rejected, not followed.
const HOSTS=new Set(['api.calendly.com','auth.calendly.com','oauth2.googleapis.com','openidconnect.googleapis.com','www.googleapis.com']);
export async function providerJson(url,options={},fetchImpl=fetch) {
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||!HOSTS.has(parsed.hostname)||parsed.username||parsed.password||parsed.port)throw Error('Unapproved provider endpoint');
  const response=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok){const error=Error('Calendar provider request failed ('+response.status+')');error.status=response.status;throw error;}
  const body=await response.text();if(body.length>2_000_000)throw Error('Calendar provider response too large');
  return JSON.parse(body);
}

export class CalendarProvider {
  constructor({store,apps,fetchJson=providerJson,now=()=>Date.now()}){this.store=store;this.apps=apps;this.fetchJson=fetchJson;this.now=now;this.locks=new Map();}
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
      if(c.expiresAt>this.now()+60000)return c;
      const app=this.apps[c.provider],spec=PROVIDERS[c.provider];if(!app||!spec||!c.refreshToken)throw Error('Calendar must be reconnected');
      const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:c.refreshToken,client_id:app.clientId,client_secret:app.clientSecret});
      let result;
      try{result=await this.fetchJson(spec.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString()});}
      catch(error){if([400,401,403].includes(error.status))this.store.save({workspaceId:workspace,status:'Reconnect Required'},saved.revision);throw error;}
      if(!result.access_token||!(Number(result.expires_in)>0))throw Error('Calendar token refresh was incomplete');
      c={...c,accessToken:result.access_token,refreshToken:result.refresh_token||c.refreshToken,expiresAt:this.now()+Number(result.expires_in)*1000};
      this.store.save(c,saved.revision);return c;
    });
  }
  async choices(workspace){
    const c=await this.token(workspace),headers={Authorization:'Bearer '+c.accessToken},items=[];
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
    }else{
      const ids=[...new Set(selection.calendarIds||[])];
      if(!ids.length||ids.length>50||ids.some(id=>!items.some(x=>x.id===id&&!x.deleted)))throw Error('Choose accessible calendars');
      // Validate explicit scheduling rules without treating an empty calendar response as availability.
      const testStart=new Date(this.now()+3600000).toISOString(),testEnd=new Date(this.now()+7200000).toISOString();
      next={...c,calendarIds:ids,rules:selection.rules,status:'Connected'};
      googleSlots({connection:next,workspace,start:testStart,end:testEnd,rules:selection.rules,now:this.now(),response:{timeMin:testStart,timeMax:testEnd,calendars:Object.fromEntries(ids.map(id=>[id,{busy:[]}]))}});
    }
    const latest=this.store.get(workspace);
    // A token refresh may increment revision; a replacement account or disconnect cannot be overwritten.
    if(!latest||latest.connection.providerUserId!==c.providerUserId||latest.connection.accessToken!==c.accessToken||!['Connected','Selection Required'].includes(latest.connection.status))throw Error('Calendar connection changed; choose again');
    this.store.save(next,latest.revision);return this.status(workspace);
  }
  status(workspace){
    const s=this.store.get(workspace),c=s?.connection;
    return {workspaceId:workspace,status:c?.status||'Not Connected',provider:c?.provider||null,accountEmail:c?.accountEmail||null,eventName:c?.eventName||null,revision:s?.revision||0};
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
    }else{
      const response=await this.fetchJson('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({timeMin:start,timeMax:end,timeZone:c.rules.timezone,items:c.calendarIds.map(id=>({id}))})});
      result=googleSlots({connection:c,workspace,response,start,end,rules:c.rules,now:this.now()});
    }
    const latest=this.store.get(workspace)?.connection;
    if(!latest||latest.status!=='Connected'||latest.providerUserId!==c.providerUserId||JSON.stringify(latest.calendarIds)!==JSON.stringify(c.calendarIds)||latest.eventType!==c.eventType||JSON.stringify(latest.rules)!==JSON.stringify(c.rules))throw Error('Calendar changed during availability check');
    const eventType=c.provider==='calendly'?c.eventType:'google:'+workspace+':'+createHash('sha256').update(JSON.stringify([c.providerUserId,c.calendarIds,c.rules])).digest('hex').slice(0,16);
    return {...result,eventType,connection:{workspaceId:workspace,eventType,timezone:c.rules?.timezone||'America/New_York',provider:c.provider,status:'Connected'}};
  }
}
