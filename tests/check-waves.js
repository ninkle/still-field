const assert=require('node:assert/strict');
const Field=require('../src/wave-physics.js');
const make=()=>new Field(96,54,2.7);
function energy(f){let sum=0;for(let i=0;i<f.current.length;i++)sum+=f.current[i]*f.current[i];return sum;}
// Waves travel away from an impact rather than remaining a local pulse.
const travel=make();travel.disturb(.5,.5,1,4);
const probe=27*96+70,before=Math.abs(travel.current[probe]);
for(let i=0;i<65;i++)travel.step(.7,.15,0,false);
assert(Math.abs(travel.current[probe])>before+.001);
// Equal simultaneous waves share one field and obey superposition.
const left=make(),right=make(),combined=make();
left.disturb(.3,.5,1);right.disturb(.7,.5,1);
combined.disturb(.3,.5,1);combined.disturb(.7,.5,1);
for(let i=0;i<180;i++){left.step(.6,.2,0,false);right.step(.6,.2,0,false);combined.step(.6,.2,0,false);}
let error=0;for(let i=0;i<combined.current.length;i++)error=Math.max(error,Math.abs(combined.current[i]-left.current[i]-right.current[i]));
assert(error<1e-4,`superposition error ${error}`);
const low=make(),high=make();low.disturb(.5,.5,1);high.disturb(.5,.5,1);
for(let i=0;i<360;i++){low.step(.45,0,0,false);high.step(.45,1,0,false);}
assert(energy(high)<energy(low)*.2);
// Stress the two ends of the controls for 90 simulated seconds with repeated input.
for(const speed of [0,1])for(const damping of [0,1]){
  const f=make();
  for(let i=0;i<5400;i++){if(i%120===0)f.disturb(.5,.5,1.5);f.step(speed,damping,1);}
  assert(f.current.every(Number.isFinite));
  assert(Math.max(...f.current.map(Math.abs))<4);
}
console.log(`Wave propagation, interference, damping and 90-second stability checks passed; superposition error ${error.toExponential(2)}.`);

// Slowing the ambient field must not slow, energize or erase camera impacts.
const scene=new Field.RippleScene(96,54,2.7),reference=make();
reference.viscosity=scene.impacts.viscosity;reference.minimumDrag=scene.impacts.minimumDrag;
const seed=new Float32Array(96*54);
for(let y=0;y<54;y++)for(let x=0;x<96;x++)seed[y*96+x]=.2*Math.cos(Math.hypot(x-48,(y-27)*2.7)*.4);
scene.seed(seed,.58);
for(let i=0;i<1200;i++){
  if(i%120===0){scene.disturb(.3,.45,1.8,8);reference.disturb(.3,.45,1.8,8);}
  scene.step(.58,.04,i%2);reference.step(.58,.04,0,false);
}
assert.deepEqual(scene.impacts.current,reference.current,'Camera waves keep their original propagation regardless of ambient activity');
assert(scene.ambient.time>4.35&&scene.ambient.time<4.45,'20 real seconds advance the ambient field by about 4.4 seconds');
assert(scene.ambient.current.every(Number.isFinite));
const packed=new Uint8Array(96*54*4);scene.encode(packed);
let maxPackingError=0;
for(let i=0;i<seed.length;i++){
  const decoded=((packed[i*4]*256+packed[i*4+1])/65535-.5)*8;
  const expected=Math.max(-4,Math.min(4,scene.impacts.current[i]+scene.ambient.current[i]*.2));
  maxPackingError=Math.max(maxPackingError,Math.abs(decoded-expected));
  const rest=((packed[i*4+2]*256+packed[i*4+3])/65535-.5)*8;
  assert(Math.abs(rest-seed[i])<.00007,'Keep the measured source available for texture replacement');
}
assert(maxPackingError<.00007,'Ambient and person ripples combine in the rendered height field');
console.log('Slow ambient timing, independent camera propagation and combined rendering checks passed.');

// Presence eases out when a tracked room empties, but camera-free art stays alive.
const quiet=new Field.RippleScene(48,27),autonomous=new Field.RippleScene(48,27);
quiet.setPeople([],true);
for(let i=0;i<2700;i++){quiet.step(.58,.04);autonomous.step(.58,.04);}
assert(quiet.roomLevel<.05&&autonomous.roomLevel===1,'Only observed absence sends the room toward stillness');
quiet.setPeople([{id:'returning',x:.5,y:.5,confidence:1,settled:1}],true);
for(let i=0;i<720;i++)quiet.step(.58,.04);
assert(quiet.roomLevel>.95&&quiet.breaths.get('returning').amplitude>.4,'Arrival wakes the room and gradually builds a breathing ripple');
quiet.encode(new Uint8Array(48*27*4));
assert(quiet.breathing.some(v=>Math.abs(v)>.02),'Standing people contribute visible height');
const standingAmplitude=quiet.breaths.get('returning').amplitude;
quiet.setPeople([],true);quiet.step(.58,.04);
assert(quiet.breaths.get('returning').amplitude>standingAmplitude*.98,'Departure must not abruptly cut off the ripple');
for(let i=0;i<1200;i++)quiet.step(.58,.04);
assert.equal(quiet.breaths.size,0,'Departed breathing sources are eventually removed');

// Viscosity preferentially removes fine detail as a footstep ages.
const soft=make(),crisp=make();soft.viscosity=.18;
soft.disturb(.5,.5,1.8,4);crisp.disturb(.5,.5,1.8,4);
function roughness(f){let sum=0;for(let y=1;y<f.height-1;y++)for(let x=1;x<f.width-1;x++){const i=y*f.width+x;sum+=(f.current[i+1]-f.current[i])**2+(f.current[i+f.width]-f.current[i])**2;}return sum/Math.max(1e-12,energy(f));}
for(let i=0;i<240;i++){soft.step(.58,.04,0,false);crisp.step(.58,.04,0,false);}
assert(energy(soft)<energy(crisp)&&roughness(soft)<roughness(crisp),'An aged footstep loses sharp edges while its broader swell remains');
const agedEnergy=energy(soft);for(let i=0;i<600;i++)soft.step(.58,.04,0,false);
assert(energy(soft)<agedEnergy*.5,'Old footsteps dissipate rather than accumulating forever');
for(const speed of [0,1]){
 const busy=new Field.RippleScene(96,54);
 for(let i=0;i<3600;i++){
  if(i%20===0)for(let person=0;person<8;person++)busy.disturb(.12+person*.1,.25+(person%2)*.4,1.65/Math.sqrt(8),6.5);
  busy.step(speed,0,1);
 }
 assert(busy.impacts.current.every(Number.isFinite));
 assert(Math.max(...busy.impacts.current.map(Math.abs))<4,'A busy room remains bounded at the speed extremes');
}
console.log('Aging footsteps, breathing transitions, empty-room stillness and busy-room stability passed.');
