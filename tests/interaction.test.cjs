const {test}=require('node:test');
const assert=require('node:assert/strict');
const interaction=import('../src/particles/interaction.mjs');

test('Contact picks the first real point layer, and misses empty space',async()=>{
  const {ParticleField}=await interaction;
  const field=new ParticleField(new Float32Array([0,0,1,0,0,-1,.12,0,1,2,0,1]));
  assert.equal(field.raycast([0,0,3],[0,0,-1]).index,0);
  assert.equal(field.raycast([1,0,3],[0,0,-1]),null);
  field.brush([0,0,1],[0,0,-1],[0,0,0],0,.7,1/60,true);
  field.step(1/60);
  assert.ok(field.offsets[2]<0,'Contact changes actual Z, not camera projection');
  assert.deepEqual(Array.from(field.offsets.subarray(3,6)),[0,0,0],'Rear layer along the same ray is not affected');
  assert.deepEqual(Array.from(field.offsets.subarray(9,12)),[0,0,0],'Distant part of the same work stays fixed');
});

test('Local springs are bounded, retain inertia and settle back to unchanged source geometry',async()=>{
  const {ParticleField,MAX_DISPLACEMENT}=await interaction;
  const rest=new Float32Array([0,0,0,.1,.1,0,0,0,1]);
  const original=rest.slice(),field=new ParticleField(rest);
  for(let i=0;i<120;i++){field.brush([0,0,0],[0,0,-1],[4,0,0],1,100,1/60);field.step(1/60);assert.ok(field.peakOffset<=MAX_DISPLACEMENT+1e-6);}
  const before=field.offsets.slice();field.step(1/60);
  assert.notDeepEqual(field.offsets,before,'Motion has velocity / memory after release');
  for(let i=0;i<360;i++)field.step(1/60);
  assert.equal(field.active.length,0);assert.ok(field.offsets.every(v=>v===0));
  assert.deepEqual(rest,original,'Reference coordinates are never overwritten');
});

test('All local interaction modes are finite and respect XYZ influence radius',async()=>{
  const {ParticleField}=await interaction;
  for(let mode=0;mode<4;mode++){
    const field=new ParticleField(new Float32Array([.1,.05,0,0,.1,.1,0,0,.8]));
    field.brush([0,0,0],[0,0,-1],[.2,0,0],mode,.7,1/60,true);
    field.step(1/60);
    assert.ok(field.offsets.every(Number.isFinite));
    assert.deepEqual(Array.from(field.offsets.subarray(6,9)),[0,0,0]);
  }
});
