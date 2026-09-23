import assert from 'node:assert/strict';
const origin='http://127.0.0.1:4318';
const call=(path,body)=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body||{})});
const title='Workstation setup '+Date.now();
try {
await call('/restore');await new Promise(r=>setTimeout(r,150));
let r=await call('/submit',{title});assert.equal(r.status,201);const saved=await r.json();assert.equal(saved.record.value,'User request: '+title);
await call('/readonly');await new Promise(r=>setTimeout(r,150));
r=await call('/submit',{title:'Blocked '+title});assert.equal(r.status,503);assert.match((await r.json()).message,/refusing writes/);
r=await call('/submit',{title:''});assert.equal(r.status,400);
const records=await(await fetch('http://127.0.0.1:4319/records')).json();assert.ok(records.submitted.some(x=>x.id===saved.record.id));assert.ok(!records.submitted.some(x=>x.value==='User request: Blocked '+title));
assert.equal((await fetch(origin+'/submit',{method:'POST',headers:{Origin:'https://example.com'},body:'{}'})).status,403);
console.log('Passed: saved request read-back, failed write absent, blank-input validation, cross-origin rejection.');
} finally {await call('/restore');}
