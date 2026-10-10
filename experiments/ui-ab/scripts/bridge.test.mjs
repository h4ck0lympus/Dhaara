import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoSchema, fixture, fixtureInterpreter, DEMO_CLOCK } from '../dist-host/frontend/src/model.js';
test('Malformed and privileged storage payloads rejected',()=>{
 const demo=fixture();assert.ok(DemoSchema.safeParse(demo).success);
 for(const invalid of [{...demo,shell:'touch /tmp/test'},{...demo,version:2},{...demo,tasks:[{...demo.tasks[0],command:'execute'}]},{...demo,draft:{id:'x',raw:'x'.repeat(4001)}},{...demo,cat:'overlay'}])assert.equal(DemoSchema.safeParse(invalid).success,false);
});
test('Unsafe attachments and duplicate identity rejected',()=>{
 const demo=fixture();const file={id:'image',name:'unsafe',data:'file:///etc/passwd'};
 assert.equal(DemoSchema.safeParse({...demo,capture:{...demo.capture,images:[file]}}).success,false);
 assert.equal(DemoSchema.safeParse({...demo,tasks:[demo.tasks[0],demo.tasks[0]]}).success,false);
});
test('Coarse interpretation never fabricates an exact instant',async()=>{
 const known=await fixtureInterpreter.interpret('leetcode by tonight',DEMO_CLOCK);
 assert.equal(known.kind,'fixture');assert.equal(known.title,'Practice LeetCode');assert.equal(known.deadline,'Tonight');assert.equal(Object.keys(known).length,4);
 const unknown=await fixtureInterpreter.interpret('call a friend on Friday',DEMO_CLOCK);
 assert.equal(unknown.kind,'unavailable');assert.equal(unknown.title,'call a friend on Friday');assert.equal(unknown.deadline,undefined);
});
