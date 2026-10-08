'use strict';
const crypto = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');
const core = require('./goals-caldav-core.cjs');

class GoalCalDavStore {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS resources (
        href TEXT PRIMARY KEY, uid TEXT NOT NULL, item_id TEXT NOT NULL,
        ical TEXT NOT NULL, etag TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS changes (
        token INTEGER PRIMARY KEY AUTOINCREMENT, href TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('changed','deleted')), etag TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_state (
        item_id TEXT PRIMARY KEY, local_snapshot TEXT NOT NULL,
        remote_snapshot TEXT NOT NULL, remote_href TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS active_resource_uid ON resources(uid) WHERE deleted=0;');
  }
  etag(ical) { return '"' + crypto.createHash('sha256').update(ical).digest('hex') + '"'; }
  token() { return this.db.prepare('SELECT COALESCE(MAX(token),0) AS token FROM changes').get().token; }
  get(href) { return this.db.prepare('SELECT * FROM resources WHERE href=? AND deleted=0').get(href) || null; }
  byUid(uid) { return this.db.prepare('SELECT * FROM resources WHERE uid=? AND deleted=0').get(uid) || null; }
  resources() { return this.db.prepare('SELECT * FROM resources WHERE deleted=0 ORDER BY href').all(); }
  deletedSince(token) { return this.db.prepare("SELECT href,MAX(token) token FROM changes WHERE token>? AND status='deleted' GROUP BY href ORDER BY token").all(token); }
  changedSince(token) { return this.db.prepare("SELECT href,MAX(token) token FROM changes WHERE token>? AND status='changed' GROUP BY href ORDER BY token").all(token).map(x=>{const resource=this.get(x.href);return resource?{...resource,token:x.token}:null;}).filter(Boolean); }
  changesAfter(token) { return [...this.deletedSince(token).map(x=>({...x,status:'deleted'})), ...this.changedSince(token).map(x=>({...x,status:'changed'}))].sort((a,b)=>a.token-b.token); }
  put(href, item, ical) {
    const etag=this.etag(ical), now=new Date().toISOString(), uid=item.uid||core.uidFor(item.id);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const prior=this.db.prepare('SELECT href FROM resources WHERE (uid=? OR item_id=?) AND href<>? AND deleted=0').get(uid,item.id,href);
      if(prior) {
        this.db.prepare("UPDATE resources SET deleted=1,updated_at=? WHERE href=?").run(now,prior.href);
        this.db.prepare("INSERT INTO changes(href,status,etag) VALUES(?,'deleted','')").run(prior.href);
      }
      this.db.prepare(`INSERT INTO resources(href,uid,item_id,ical,etag,deleted,updated_at) VALUES(?,?,?,?,?,0,?)
        ON CONFLICT(href) DO UPDATE SET uid=excluded.uid,item_id=excluded.item_id,ical=excluded.ical,etag=excluded.etag,deleted=0,updated_at=excluded.updated_at`).run(href,uid,item.id,ical,etag,now);
      this.db.prepare("INSERT INTO changes(href,status,etag) VALUES(?,'changed',?)").run(href,etag);
      this.db.exec('COMMIT'); return {etag,token:this.token(),href};
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  delete(href) {
    const now=new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const prior=this.db.prepare('SELECT * FROM resources WHERE href=? AND deleted=0').get(href);
      if(!prior) { this.db.exec('COMMIT'); return {deleted:false,token:this.token()}; }
      this.db.prepare('UPDATE resources SET deleted=1,updated_at=? WHERE href=?').run(now,href);
      this.db.prepare("INSERT INTO changes(href,status,etag) VALUES(?,'deleted','')").run(href);
      this.db.exec('COMMIT'); return {deleted:true,token:this.token()};
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  state() {
    const out=Object.create(null);
    for(const row of this.db.prepare('SELECT * FROM sync_state').all()) out[row.item_id]={local:JSON.parse(row.local_snapshot),remote:JSON.parse(row.remote_snapshot),href:row.remote_href};
    return out;
  }
  saveState(entries) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('DELETE FROM sync_state');
      const insert=this.db.prepare('INSERT INTO sync_state(item_id,local_snapshot,remote_snapshot,remote_href) VALUES(?,?,?,?)');
      for(const [id,item] of Object.entries(entries)) insert.run(id,JSON.stringify(item.local),JSON.stringify(item.remote),item.href);
      this.db.exec('COMMIT');
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
module.exports={GoalCalDavStore};
