'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const server=require('../calendar-sync/goals-caldav-server.cjs');

test('CalDAV resource requests resolve to the encoded href stored by sync',()=>{
  const name='499a72fc751bb77ea513d6f2aa86c7ec@local.merytodo.ics';
  const href=server.PREFIX+encodeURIComponent(name);
  assert.equal(server.canonicalPath(href),href);
  assert.equal(server.canonicalPath(server.PREFIX+name),href);
  assert.equal(server.makeHref('http://127.0.0.1:18453'+href),href);
  assert.equal(server.makeHref(server.PREFIX+name),href);
});
