import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {beginConnection,exchangeConnection,workspaceId,seal,unseal} from './calendar.mjs';
import {CalendarProvider,providerJson} from './calendar-provider.mjs';

const digest=x=>createHash('sha256').update(String(x)).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));

// Admin calls must come from the authenticated n8n bridge. Client tickets can only
// configure the single workspace and account email that an operator invited.
export class CalendarFlow {
 constructor({store,apps,origin,fetchJson=providerJson,now=()=>Date.now(),log}){
  const u=new URL(origin);if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw Error('Fixed HTTPS origin required');
  this.store=store;this.apps=apps;this.origin=u.origin;this.now=now;this.fetchJson=fetchJson;
  this.provider=new CalendarProvider({store,apps,fetchJson,now,...(log?{log}:{})});
  store.db.exec(`CREATE TABLE IF NOT EXISTS calendar_invites(hash TEXT PRIMARY KEY,workspace TEXT NOT NULL,payload TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS calendar_sessions(hash TEXT PRIMARY KEY,workspace TEXT NOT NULL,payload TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS calendar_invite_requests(hash TEXT PRIMARY KEY,workspace TEXT NOT NULL,payload TEXT NOT NULL,expires INTEGER NOT NULL);`);
 }
 configured(provider){const a=this.apps[provider];return Boolean(a?.clientId&&a?.clientSecret);}
 requestInvite(input){
  const {workspace,requestId,provider,expectedEmail}=input;workspaceId(workspace);
  if(!/^[A-Za-z0-9_-]{12,100}$/.test(requestId||''))throw Error('Valid request ID required');
  const key=digest(workspace+':'+requestId),email=String(expectedEmail||'').trim().toLowerCase();
  const row=this.store.db.prepare('SELECT * FROM calendar_invite_requests WHERE hash=?').get(key);
  if(row){const previous=unseal(row.payload,this.store.key,workspace);if(previous.email!==email||previous.provider!==provider)throw Error('Request identity changed');if(row.expires<=this.now())throw Error('Request expired; create a new request');return previous.result;}
  const allowed=this.apps[provider]?.testEmails;
  if(Array.isArray(allowed)&&!allowed.map(x=>x.toLowerCase()).includes(email))throw Error('Provider is in private testing; account is not enabled');
  const result=this.invite({...input,expectedEmail:email});
  this.store.db.prepare('INSERT INTO calendar_invite_requests VALUES(?,?,?,?)').run(key,workspace,seal({email,provider,result},this.store.key,workspace),Date.parse(result.expiresAt));
  return result;
 }
 invite({workspace,provider,expectedEmail,label}){
  workspaceId(workspace);if(!this.configured(provider))throw Error('Provider application registration is required');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expectedEmail||''))throw Error('Client account email required');
  const existing=this.store.get(workspace),ticket=secret(),expires=this.now()+86400000;
  const p={workspace,provider,expectedEmail:expectedEmail.toLowerCase().trim(),label:String(label||'Your company').slice(0,150),revision:existing?.revision||0};
  this.store.db.prepare('INSERT INTO calendar_invites VALUES(?,?,?,?)').run(digest(ticket),workspace,seal(p,this.store.key,workspace),expires);
  return {url:this.origin+'/calendar/connect?ticket='+ticket,expiresAt:new Date(expires).toISOString(),workspaceId:workspace};
 }
 invitation(ticket){
  if(typeof ticket!=='string'||ticket.length>100)throw Error('Invalid invitation');
  const r=this.store.db.prepare('SELECT * FROM calendar_invites WHERE hash=?').get(digest(ticket));
  if(!r||r.expires<=this.now())throw Error('Invitation expired or already used');
  return unseal(r.payload,this.store.key,r.workspace);
 }
 start(ticket){
  const invited=this.invitation(ticket);if(!this.configured(invited.provider))throw Error('Provider application is not configured');
  const current=this.store.get(invited.workspace);if((current?.revision||0)!==invited.revision)throw Error('Connection changed; request a new invitation');
  const session=secret(),csrf=secret(),sessionHash=digest(session);
  const a=this.apps[invited.provider],started=beginConnection({...invited,clientId:a.clientId,redirectUri:this.origin+'/calendar/callback',now:this.now()});
  const pending={...started.pending,sessionHash,expectedRevision:invited.revision};
  this.store.db.exec('BEGIN IMMEDIATE');
  try{
   const deleted=this.store.db.prepare('DELETE FROM calendar_invites WHERE hash=? AND expires>?').run(digest(ticket),this.now());
   if(deleted.changes!==1)throw Error('Invitation already used');
   this.store.putState(started.state,pending);
   this.store.db.prepare('INSERT INTO calendar_sessions VALUES(?,?,?,?)').run(sessionHash,invited.workspace,seal({...invited,csrf,phase:'authorizing'},this.store.key,invited.workspace),this.now()+1800000);
   this.store.db.exec('COMMIT');
  }catch(e){this.store.db.exec('ROLLBACK');throw e;}
  return {session,authorizationUrl:started.authorizationUrl};
 }
 session(token){
  if(typeof token!=='string'||token.length>100)throw Error('Client session required');
  const r=this.store.db.prepare('SELECT * FROM calendar_sessions WHERE hash=?').get(digest(token));
  if(!r||r.expires<=this.now())throw Error('Client session expired');
  return {...unseal(r.payload,this.store.key,r.workspace),hash:r.hash};
 }
 async callback({session,state,code,error}){
  const s=this.session(session);
  // Inspect binding before consuming to prevent unrelated clients invalidating a state.
  const row=this.store.db.prepare('SELECT * FROM states WHERE hash=?').get(digest(state));
  if(!row)throw Error('Authorization expired or already used');
  const check=unseal(row.payload,this.store.key,row.workspace);
  if(!equal(check.sessionHash,s.hash)||s.workspace!==check.workspace||s.phase!=='authorizing')throw Error('Authorization session mismatch');
  const pending=this.store.consumeState(state,this.now());
  if(error)throw Error('Calendar authorization was declined. Request a fresh connection link.');
  const a=this.apps[pending.provider];
  const c=await exchangeConnection({pending,code,clientId:a.clientId,clientSecret:a.clientSecret,fetchJson:this.fetchJson,now:this.now()});
  this.store.save(c,pending.expectedRevision);
  this.store.db.prepare('UPDATE calendar_sessions SET payload=? WHERE hash=?').run(seal({...s,phase:'selection'},this.store.key,s.workspace),s.hash);
  return this.provider.status(s.workspace);
 }
 async choices(token){const s=this.session(token);if(s.phase!=='selection')throw Error('Authorize the calendar first');const {items}=await this.provider.choices(s.workspace);return {workspace:s.workspace,label:s.label,provider:s.provider,csrf:s.csrf,items:items.map(x=>s.provider==='calendly'?{id:x.uri,name:x.name}:{id:x.id,name:x.summary})};}
 async select(token,csrf,selection){
  const s=this.session(token);if(s.phase!=='selection'||!equal(csrf,s.csrf))throw Error('Invalid selection request');
  const c=this.store.get(s.workspace)?.connection;if(c?.accountEmail!==s.expectedEmail||c?.provider!==s.provider)throw Error('Account changed; reconnect');
  const result=await this.provider.select(s.workspace,selection);
  this.store.db.prepare('DELETE FROM calendar_sessions WHERE hash=?').run(s.hash);
  return result;
 }
}
