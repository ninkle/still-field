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
