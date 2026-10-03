'use strict';
const {DatabaseSync}=require('node:sqlite');
class SyncStore {
  constructor(file) {
    this.db=new DatabaseSync(file);
    const version=this.db.prepare('PRAGMA user_version').get().user_version;
    if(version>1) {this.db.close();throw new Error('未対応の同期データベースです。');}
    this.db.exec(`
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS sync_items (
        item_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK(kind IN ('TASKS','LOG')),
        local_snapshot TEXT NOT NULL,
        remote_snapshot TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS conflicts (
        item_id TEXT PRIMARY KEY,
        local_snapshot TEXT,
        remote_snapshot TEXT,
        reason TEXT NOT NULL,
        detected_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS sync_runs (
        run_id INTEGER PRIMARY KEY,
        finished_at TEXT NOT NULL,
        operation_counts TEXT NOT NULL,
        error_count INTEGER NOT NULL
      ) STRICT;
      PRAGMA user_version=1;
    `);
  }
  load() {
    const calendar=this.db.prepare("SELECT value FROM metadata WHERE key='calendar_id'").get();
    const entries=Object.create(null);
    for(const row of this.db.prepare('SELECT * FROM sync_items').all()) entries[row.item_id]={eventId:row.event_id,local:JSON.parse(row.local_snapshot),remote:JSON.parse(row.remote_snapshot)};
    return {version:1,calendarId:calendar?.value,entries};
  }
  save(state,result) {
    const now=new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare("INSERT INTO metadata(key,value) VALUES('calendar_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(state.calendarId);
      this.db.exec('DELETE FROM sync_items; DELETE FROM conflicts;');
      const insert=this.db.prepare('INSERT INTO sync_items VALUES(?,?,?,?,?,?)');
      for(const [id,entry] of Object.entries(state.entries)) insert.run(id,entry.eventId,entry.local.kind,JSON.stringify(entry.local),JSON.stringify(entry.remote),now);
      const conflict=this.db.prepare('INSERT INTO conflicts VALUES(?,?,?,?,?)');
      for(const item of result.operations.filter(x=>x.action==='conflict')) conflict.run(item.id,JSON.stringify(item.local||null),JSON.stringify(item.remote||null),item.remote?.unsupported||'both_sides_changed',now);
      const counts={};for(const item of result.operations) counts[item.action]=(counts[item.action]||0)+1;
      this.db.prepare('INSERT INTO sync_runs(finished_at,operation_counts,error_count) VALUES(?,?,?)').run(now,JSON.stringify(counts),result.errors.length);
      this.db.exec('COMMIT');
    } catch(error) {this.db.exec('ROLLBACK');throw error;}
  }
  close() {this.db.close();}
}
module.exports={SyncStore};
