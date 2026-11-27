import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {chmodSync} from 'node:fs';
import {workspaceId,seal,unseal} from './calendar.mjs';

// Dedicated private storage: tokens are never written into Airtable or n8n execution data.
export class CalendarStore {
  constructor(path,key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw Error('A 32-byte key must be configured');
    this.key=key;this.db=new DatabaseSync(path);
    if(path!==':memory:')chmodSync(path,0o600);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS states (hash TEXT PRIMARY KEY,workspace TEXT NOT NULL,payload TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS connections (workspace TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
    `);
  }
  putState(state,pending) {
    workspaceId(pending.workspace);
    if(!/^[A-Za-z0-9_-]{40,}$/.test(state)||!Number.isFinite(pending.expiresAt))throw Error('Invalid authorization state');
    this.db.prepare('INSERT INTO states(hash,workspace,payload,expires) VALUES(?,?,?,?)')
      .run(createHash('sha256').update(state).digest('hex'),pending.workspace,seal(pending,this.key,pending.workspace),pending.expiresAt);
  }
  consumeState(state,now=Date.now()) {
    if(typeof state!=='string'||state.length>256)throw Error('Invalid authorization state');
    // DELETE RETURNING is atomic: a parallel callback cannot reuse the authorization.
    const row=this.db.prepare('DELETE FROM states WHERE hash=? RETURNING *').get(createHash('sha256').update(state).digest('hex'));
    if(!row||row.expires<=now)throw Error('Authorization expired or already used');
    return unseal(row.payload,this.key,row.workspace);
  }
  get(workspace) {
    workspaceId(workspace);const row=this.db.prepare('SELECT * FROM connections WHERE workspace=?').get(workspace);
    return row?{connection:unseal(row.payload,this.key,workspace),revision:row.revision}:null;
  }
  save(connection,expectedRevision=0) {
    const workspace=workspaceId(connection.workspaceId),payload=seal(connection,this.key,workspace);
    if(expectedRevision===0){this.db.prepare('INSERT INTO connections(workspace,payload) VALUES(?,?)').run(workspace,payload);return 1;}
    const result=this.db.prepare('UPDATE connections SET payload=?,revision=revision+1 WHERE workspace=? AND revision=?').run(payload,workspace,expectedRevision);
    if(result.changes!==1)throw Error('Calendar changed during update; reload before saving');
    return expectedRevision+1;
  }
  disconnect(workspace,expectedRevision) {
    const old=this.get(workspace);if(!old||old.revision!==expectedRevision)throw Error('Calendar changed during disconnect');
    return this.save({workspaceId:workspace,status:'Disconnected'},expectedRevision);
  }
  close(){this.db.close();}
}
