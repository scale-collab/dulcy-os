import {timingSafeEqual} from 'node:crypto';
import {PASTE_PROVIDERS,PROVIDER_NAMES} from './calendar.mjs';
import {maskSecrets} from './calendar-provider.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page=(title,body)=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Dulcy</title><style>body{font:17px system-ui;background:#f5f3ff;color:#172033;margin:0;padding:36px 16px}main{max-width:640px;margin:auto;background:white;padding:32px;border-radius:18px}h1{font-size:28px}.brand{color:#732bd8;font-weight:700}label{display:block;margin:18px 0}input:not([type=checkbox]),select{box-sizing:border-box;width:100%;padding:12px;border:1px solid #cbd2df;border-radius:8px}button{padding:14px 22px;border:0;border-radius:9px;background:#732bd8;color:white;font:inherit;cursor:pointer}.muted{color:#58677a}small{display:block;margin-top:12px}.error{background:#fdecec;color:#8a1c1c;padding:12px;border-radius:8px}ol{padding-left:22px}li{margin:6px 0}</style><main><p class="brand">Dulcy</p><h1>${esc(title)}</h1>${body}</main></html>`;
const hidden=(k,v)=>`<input type="hidden" name="${esc(k)}" value="${esc(v)}">`;
const PROMISE='Dulcy will read calendar availability so your reply agent can suggest suitable meeting times, and when a prospect agrees a time, add that one meeting to your calendar and invite them.';
const LIMITS='Dulcy only creates the meetings your prospects agree to, inside your working hours. It does not read your event details, send emails from your account, or change other events.';
const SIGN_IN={google:'Google',microsoft:'Microsoft',calendly:'Calendly',hubspot:'HubSpot'};
/** Providers where the client picks ONE meeting type / calendar / link (its own availability rules apply). */
const PICK_ONE={calcom:'Event type',ghl:'Calendar',hubspot:'Meeting link'};
// Where the client finds the key, step by step (Cal.com: Settings → Developer → API keys; GoHighLevel: a Private Integration).
const KEY_STEPS={
 calcom:email=>`<ol><li>Sign in to <b>Cal.com</b> as <b>${esc(email)}</b>.</li><li>Go to <b>Settings → Developer → API keys</b>.</li><li>Click <b>New</b> (or <b>+ Add</b>), name it <b>Dulcy</b>, and choose <b>Never expires</b> (or the longest option).</li><li>Click <b>Save</b>, copy the key (it starts with <code>cal_</code>) and paste it below.</li></ol>`,
 ghl:()=>`<ol><li>Open your <b>GoHighLevel</b> sub-account (the one with your booking calendar).</li><li>Go to <b>Settings → Private Integrations</b> and click <b>Create new Integration</b>. Name it <b>Dulcy</b>.</li><li>Tick these scopes: <b>View Calendars</b> (calendars.readonly), <b>View Calendar Events</b> (calendars/events.readonly), <b>Edit Calendar Events</b> (calendars/events.write) and <b>Edit Contacts</b> (contacts.write).</li><li>Click <b>Create</b>, copy the token and paste it below.</li><li>Your <b>Location ID</b> is in <b>Settings → Business Profile</b> (it is also the part after <code>/location/</code> in the address bar).</li></ol>`,
};
function keyPage(ticket,i,error){
 const name=PROVIDER_NAMES[i.provider];
 const extra=i.provider==='ghl'?`<label>Location ID<input required name="locationId" autocomplete="off" spellcheck="false" maxlength="64"></label>`:'';
 return page('Connect your calendar',`<p>Connect ${esc(name)} for <b>${esc(i.label)}</b>. ${PROMISE}</p>${error?`<p class="error">${esc(error)}</p>`:''}${KEY_STEPS[i.provider](i.expectedEmail)}<form method="post" action="/calendar/start">${hidden('ticket',ticket)}<label>${i.provider==='ghl'?'Private Integration token':'API key'}<input required type="password" name="apiKey" autocomplete="off" spellcheck="false" maxlength="4000"></label>${extra}<button>Connect ${esc(name)}</button></form><p class="muted">${LIMITS} The key is stored encrypted and is never shown again. To stop Dulcy at any time, delete the key in ${esc(name)}.</p>`);
}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16384)throw Error('Request too large');}return req.headers['content-type']?.startsWith('application/json')?JSON.parse(raw||'{}'):new URLSearchParams(raw);}
function auth(req,token){const v=req.headers.authorization||'',wanted='Bearer '+token;return token.length>=32&&v.length===wanted.length&&timingSafeEqual(Buffer.from(v),Buffer.from(wanted));}
function cookie(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Secure-dulcy-calendar='))?.split('=')[1];}

// Who may call what under /calendar/admin/. Only the booker token can book: a read-only caller (and
// the admin bridge, which never needs to) can never create an event.
const READ=['/calendar/admin/status','/calendar/admin/availability'];
export const ROUTES=Object.freeze({
 admin:['/calendar/admin/request-invite','/calendar/admin/invite','/calendar/admin/disconnect',...READ],
 reader:READ,
 inviter:['/calendar/admin/request-invite'],
 booker:[...READ,'/calendar/admin/book'],
});
const ok=t=>typeof t==='string'&&t.length>=32;

export function calendarHandler({flow,adminToken,readerToken,inviterToken,bookerToken,log=x=>console.error(JSON.stringify({at:new Date().toISOString(),...x}))}){
 if(typeof adminToken!=='string'||adminToken.length<32)throw Error('Private bridge authentication required');
 // Matched in this order: a booker token that equals another token is never treated as the booker.
 const tokens=[['admin',adminToken],['reader',readerToken],['inviter',inviterToken],['booker',bookerToken]].filter(([,t])=>ok(t));
 const known=new Set(Object.values(ROUTES).flat());
 return async(req,res)=>{
  const send=(status,content,type='text/html; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type});res.end(content);};
  const json=(status,value)=>send(status,JSON.stringify(value),'application/json');
  // Keep same-origin form Origin available; never include ticket paths in Referer.
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','strict-origin');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https:; frame-ancestors 'none'; base-uri 'none'");
  try{
   const u=new URL(req.url,flow.origin);
   if(u.pathname==='/calendar/health'&&req.method==='GET')return json(200,{ok:true});
   if(u.pathname.startsWith('/calendar/admin/')){
    const role=tokens.find(([,t])=>auth(req,t))?.[0];
    if(!role)return json(401,{error:'Unauthorized'});
    if(!known.has(u.pathname))return json(404,{error:'Not found'});
    if(!ROUTES[role].includes(u.pathname)){
     if(u.pathname==='/calendar/admin/book')return json(403,{error:'Booking credential required'});
     return json(403,{error:role==='inviter'?'Invitation-only credential':'Read-only credential'});
    }
    if(req.method!=='POST')return json(405,{error:'POST required'});
    const b=await body(req);if(b instanceof URLSearchParams)return json(415,{error:'JSON required'});
    if(u.pathname==='/calendar/admin/book'){
     try{return json(200,await flow.provider.book(b.workspace,b));}
     // Provider trouble (5xx, timeouts) = 502 so the engine retries with the same key; a bad request = 400.
     catch(e){log({level:'error',route:u.pathname,error:maskSecrets(String(e?.message||e)).slice(0,200)});return json((e.status?e.status>=500:/timeout|abort|fetch failed/i.test(String(e.message)))?502:400,{booked:false,error:maskSecrets(String(e.message||e)).slice(0,200)});}
    }
    if(u.pathname==='/calendar/admin/request-invite')return json(200,flow.requestInvite(b));
    if(u.pathname==='/calendar/admin/invite')return json(200,flow.invite(b));
    if(u.pathname==='/calendar/admin/status')return json(200,flow.provider.status(b.workspace));
    if(u.pathname==='/calendar/admin/availability')return json(200,await flow.provider.availability(b.workspace,{start:b.start,end:b.end}));
    if(u.pathname==='/calendar/admin/disconnect'){flow.store.disconnect(b.workspace,b.revision);return json(200,flow.provider.status(b.workspace));}
    return json(404,{error:'Not found'});
   }
   if(req.method==='POST'&&req.headers.origin!==flow.origin)return send(403,page('Connection not changed','<p>Please use the original Dulcy connection page.</p>'));
   if(u.pathname==='/calendar/connect'&&req.method==='GET'){
    const ticket=u.searchParams.get('ticket'),i=flow.invitation(ticket);
    if(PASTE_PROVIDERS.includes(i.provider))return send(200,keyPage(ticket,i,''));
    const name=PROVIDER_NAMES[i.provider]||'your calendar',short=SIGN_IN[i.provider]||name;
    return send(200,page('Connect your calendar',`<p>Connect ${esc(name)} for <b>${esc(i.label)}</b>.</p><p>Sign in as <b>${esc(i.expectedEmail)}</b>. ${PROMISE}</p><p class="muted">${LIMITS}</p><form method="post" action="/calendar/start">${hidden('ticket',ticket)}<button>Continue to ${esc(short)}</button></form>`));
   }
   if(u.pathname==='/calendar/start'&&req.method==='POST'){
    const b=await body(req),ticket=b.get('ticket'),i=flow.invitation(ticket);
    let r;
    if(PASTE_PROVIDERS.includes(i.provider)){
     // Same-origin POST (Origin checked above) with the one-time ticket. The key is checked, sealed and never shown again.
     try{r=await flow.startKey(ticket,{apiKey:b.get('apiKey'),locationId:b.get('locationId')});}
     catch(e){
      log({level:'error',route:'/calendar/start',error:maskSecrets(String(e?.message||e)).slice(0,200)});
      return send(e?.public?(e.status>=500?502:400):400,keyPage(ticket,i,e?.public?e.message:'The key could not be checked. Try again, or ask your Dulcy team for a fresh link.'));
     }
     res.setHeader('Set-Cookie',`__Secure-dulcy-calendar=${r.session}; HttpOnly; Secure; SameSite=Lax; Path=/calendar; Max-Age=1800`);
     res.writeHead(303,{Location:'/calendar/select'});return res.end();
    }
    r=flow.start(ticket);
    res.setHeader('Set-Cookie',`__Secure-dulcy-calendar=${r.session}; HttpOnly; Secure; SameSite=Lax; Path=/calendar; Max-Age=1800`);
    res.writeHead(303,{Location:r.authorizationUrl});return res.end();
   }
   if(u.pathname==='/calendar/callback'&&req.method==='GET'){
    await flow.callback({session:cookie(req),state:u.searchParams.get('state'),code:u.searchParams.get('code'),error:u.searchParams.get('error')});
    res.writeHead(303,{Location:'/calendar/select'});return res.end();
   }
   if(u.pathname==='/calendar/select'&&req.method==='GET'){
    const c=await flow.choices(cookie(req));let fields;
    // Nothing to pick (no meeting link / event type / calendar yet): say what to create instead of an empty list (2026-11-27, HubSpot test).
    if((c.provider==='calendly'||PICK_ONE[c.provider])&&!c.items.length){
     const what={calendly:'an active event type in Calendly',calcom:'an event type in Cal.com',ghl:'an active calendar in this GoHighLevel sub-account',hubspot:'a meeting link in HubSpot (Sales → Meetings → Create meeting link)'}[c.provider];
     return send(200,page('Nothing to choose yet',`<p>${esc(c.label)}</p><p>Your account is connected, but it has no ${esc(PICK_ONE[c.provider]?.toLowerCase()||'meeting type')} yet. Create ${esc(what)}, then reload this page (within 30 minutes) to choose it.</p>`));
    }
    if(c.provider==='calendly')fields=`<label>Meeting type<select required name="eventType"><option value="">Choose a meeting type</option>${c.items.map(i=>`<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</select></label>`;
    else if(PICK_ONE[c.provider])fields=`<label>${esc(PICK_ONE[c.provider])}<select required name="eventType"><option value="">Choose one</option>${c.items.map(i=>`<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</select></label><label>Your time zone (for example America/New_York)<input required name="timezone" value="${esc(c.timezone)}" placeholder="America/New_York"></label><small>Its own availability settings (hours, length, buffers) decide which times are offered and booked.</small>`;
    else fields=`<p>Select the calendars whose busy times should block availability.</p>${c.items.map(i=>`<label><input type="checkbox" name="calendarId" value="${esc(i.id)}"> ${esc(i.name)}</label>`).join('')}<label>Time zone (for example America/New_York)<input required name="timezone" placeholder="Europe/London"></label><label>Working days (Mon,Tue,Wed,Thu,Fri)<input required name="days" value="Mon,Tue,Wed,Thu,Fri"></label><label>Start of working day<input required type="time" name="start" value="09:00"></label><label>End of working day<input required type="time" name="end" value="17:00"></label><label>Meeting length in minutes<input required type="number" min="5" max="240" name="durationMinutes" value="30"></label><label>Buffer between meetings in minutes<input required type="number" min="0" max="120" name="bufferMinutes" value="15"></label><label>Minimum advance notice in minutes<input required type="number" min="0" name="noticeMinutes" value="60"></label>`;
    const where=c.provider==='calendly'||PICK_ONE[c.provider]?'Meetings are booked on the one you choose.':'Meetings go on your main calendar.';
    return send(200,page('Choose availability',`<p>${esc(c.label)}</p><form method="post" action="/calendar/select">${hidden('csrf',c.csrf)}${fields}<button>Save calendar connection</button></form><small>These rules control which times are suggested and booked. ${where}</small>`));
   }
   if(u.pathname==='/calendar/select'&&req.method==='POST'){
    const b=await body(req),s=flow.session(cookie(req));
    const selection=s.provider==='calendly'?{eventType:b.get('eventType')}:PICK_ONE[s.provider]?{eventType:b.get('eventType'),timezone:b.get('timezone')}
     :{calendarIds:b.getAll('calendarId'),rules:{timezone:b.get('timezone'),days:String(b.get('days')||'').split(',').map(x=>x.trim()),start:b.get('start'),end:b.get('end'),durationMinutes:Number(b.get('durationMinutes')),bufferMinutes:Number(b.get('bufferMinutes')),noticeMinutes:Number(b.get('noticeMinutes'))}};
    await flow.select(cookie(req),b.get('csrf'),selection);
    res.setHeader('Set-Cookie','__Secure-dulcy-calendar=; HttpOnly; Secure; SameSite=Lax; Path=/calendar; Max-Age=0');
    return send(200,page('Calendar connected','<p>Your account and calendar selection are saved. You can close this page.</p><p class="muted">Your Dulcy reply agent can now offer your open times and book the ones your prospects agree to.</p>'));
   }
   send(404,page('Page not found','<p>Use the calendar connection link from your Dulcy team.</p>'));
  }catch(e){
   // Never expose provider payloads, credentials, authorization codes, or stack traces.
   // The reason is logged for the operator: the route only (no query: tickets and codes live there)
   // and the error text, which never holds tokens, codes or emails.
   log({level:'error',route:String(req.url||'').split('?')[0].slice(0,80),error:maskSecrets(String(e?.message||e)).slice(0,200)});
   // Authenticated bridge callers get a short JSON reason instead of the client page.
   if(String(req.url||'').startsWith('/calendar/admin/'))return json(400,{error:maskSecrets(String(e?.message||'Request failed')).slice(0,200)});
   send(400,page('Connection needs attention','<p>The connection could not be completed. Check that you used the invited account and a current connection link. Ask your Dulcy team for a fresh link if needed.</p>'));
  }
 };
}
