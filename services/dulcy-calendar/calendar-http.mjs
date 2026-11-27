import {timingSafeEqual} from 'node:crypto';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page=(title,body)=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Dulcy</title><style>body{font:17px system-ui;background:#f5f3ff;color:#172033;margin:0;padding:36px 16px}main{max-width:640px;margin:auto;background:white;padding:32px;border-radius:18px}h1{font-size:28px}.brand{color:#732bd8;font-weight:700}label{display:block;margin:18px 0}input:not([type=checkbox]),select{box-sizing:border-box;width:100%;padding:12px;border:1px solid #cbd2df;border-radius:8px}button{padding:14px 22px;border:0;border-radius:9px;background:#732bd8;color:white;font:inherit;cursor:pointer}.muted{color:#58677a}small{display:block;margin-top:12px}</style><main><p class="brand">Dulcy</p><h1>${esc(title)}</h1>${body}</main></html>`;
const hidden=(k,v)=>`<input type="hidden" name="${esc(k)}" value="${esc(v)}">`;
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16384)throw Error('Request too large');}return req.headers['content-type']?.startsWith('application/json')?JSON.parse(raw||'{}'):new URLSearchParams(raw);}
function auth(req,token){const v=req.headers.authorization||'',wanted='Bearer '+token;return token.length>=32&&v.length===wanted.length&&timingSafeEqual(Buffer.from(v),Buffer.from(wanted));}
function cookie(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Secure-dulcy-calendar='))?.split('=')[1];}

export function calendarHandler({flow,adminToken,readerToken,inviterToken}){
 if(typeof adminToken!=='string'||adminToken.length<32)throw Error('Private bridge authentication required');
 return async(req,res)=>{
  const send=(status,content,type='text/html; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type});res.end(content);};
  const json=(status,value)=>send(status,JSON.stringify(value),'application/json');
  // Keep same-origin form Origin available; never include ticket paths in Referer.
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','strict-origin');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://accounts.google.com https://auth.calendly.com; frame-ancestors 'none'; base-uri 'none'");
  try{
   const u=new URL(req.url,flow.origin);
   if(u.pathname==='/calendar/health'&&req.method==='GET')return json(200,{ok:true});
   if(u.pathname.startsWith('/calendar/admin/')){
    const isAdmin=auth(req,adminToken),isReader=typeof readerToken==='string'&&readerToken.length>=32&&auth(req,readerToken);
    const isInviter=typeof inviterToken==='string'&&inviterToken.length>=32&&auth(req,inviterToken);
    if(!isAdmin&&!isReader&&!isInviter)return json(401,{error:'Unauthorized'});
    if(isInviter&&!isAdmin&&!isReader&&u.pathname!=='/calendar/admin/request-invite')return json(403,{error:'Invitation-only credential'});
    if(!isAdmin&&!isInviter&&!['/calendar/admin/status','/calendar/admin/availability'].includes(u.pathname))return json(403,{error:'Read-only credential'});
    if(req.method!=='POST')return json(405,{error:'POST required'});
    const b=await body(req);if(b instanceof URLSearchParams)return json(415,{error:'JSON required'});
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
    return send(200,page('Connect your calendar',`<p>Connect ${esc(i.provider==='google'?'Google Calendar':'Calendly')} for <b>${esc(i.label)}</b>.</p><p>Sign in as <b>${esc(i.expectedEmail)}</b>. Dulcy will read calendar availability so your reply agent can suggest suitable meeting times.</p><p class="muted">This connection does not send emails, create bookings, or edit calendar events.</p><form method="post" action="/calendar/start">${hidden('ticket',ticket)}<button>Continue to ${i.provider==='google'?'Google':'Calendly'}</button></form>`));
   }
   if(u.pathname==='/calendar/start'&&req.method==='POST'){
    const b=await body(req),r=flow.start(b.get('ticket'));
    res.setHeader('Set-Cookie',`__Secure-dulcy-calendar=${r.session}; HttpOnly; Secure; SameSite=Lax; Path=/calendar; Max-Age=1800`);
    res.writeHead(303,{Location:r.authorizationUrl});return res.end();
   }
   if(u.pathname==='/calendar/callback'&&req.method==='GET'){
    await flow.callback({session:cookie(req),state:u.searchParams.get('state'),code:u.searchParams.get('code'),error:u.searchParams.get('error')});
    res.writeHead(303,{Location:'/calendar/select'});return res.end();
   }
   if(u.pathname==='/calendar/select'&&req.method==='GET'){
    const c=await flow.choices(cookie(req));let fields;
    if(c.provider==='calendly')fields=`<label>Meeting type<select required name="eventType"><option value="">Choose a meeting type</option>${c.items.map(i=>`<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</select></label>`;
    else fields=`<p>Select the calendars whose busy times should block availability.</p>${c.items.map(i=>`<label><input type="checkbox" name="calendarId" value="${esc(i.id)}"> ${esc(i.name)}</label>`).join('')}<label>Time zone (for example America/New_York)<input required name="timezone" placeholder="Europe/London"></label><label>Working days (Mon,Tue,Wed,Thu,Fri)<input required name="days" value="Mon,Tue,Wed,Thu,Fri"></label><label>Start of working day<input required type="time" name="start" value="09:00"></label><label>End of working day<input required type="time" name="end" value="17:00"></label><label>Meeting length in minutes<input required type="number" min="5" max="240" name="durationMinutes" value="30"></label><label>Buffer between meetings in minutes<input required type="number" min="0" max="120" name="bufferMinutes" value="15"></label><label>Minimum advance notice in minutes<input required type="number" min="0" name="noticeMinutes" value="60"></label>`;
    return send(200,page('Choose availability',`<p>${esc(c.label)}</p><form method="post" action="/calendar/select">${hidden('csrf',c.csrf)}${fields}<button>Save calendar connection</button></form><small>These rules control available time suggestions. They do not enable automatic booking or email sending.</small>`));
   }
   if(u.pathname==='/calendar/select'&&req.method==='POST'){
    const b=await body(req),s=flow.session(cookie(req));const selection=s.provider==='calendly'?{eventType:b.get('eventType')}:{calendarIds:b.getAll('calendarId'),rules:{timezone:b.get('timezone'),days:b.get('days').split(',').map(x=>x.trim()),start:b.get('start'),end:b.get('end'),durationMinutes:Number(b.get('durationMinutes')),bufferMinutes:Number(b.get('bufferMinutes')),noticeMinutes:Number(b.get('noticeMinutes'))}};
    await flow.select(cookie(req),b.get('csrf'),selection);
    res.setHeader('Set-Cookie','__Secure-dulcy-calendar=; HttpOnly; Secure; SameSite=Lax; Path=/calendar; Max-Age=0');
    return send(200,page('Calendar connected','<p>Your account and calendar selection are saved. You can close this page.</p><p class="muted">Your team can now verify availability from the Reply Agent. Automatic booking and email sending remain unchanged.</p>'));
   }
   send(404,page('Page not found','<p>Use the calendar connection link from your Dulcy team.</p>'));
  }catch(e){
   // Never expose provider payloads, credentials, authorization codes, or stack traces.
   send(400,page('Connection needs attention','<p>The connection could not be completed. Check that you used the invited account and a current connection link. Ask your Dulcy team for a fresh link if needed.</p>'));
  }
 };
}
