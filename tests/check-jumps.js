const assert=require('node:assert/strict');
const {JumpDetector,jumpingDemo}=require('../src/jump-tracking.js');
const {PersonTracker,PeopleRippleSources}=require('../src/person-tracking.js');
const base=[.43,.20,.14,.62];
const track=(box,now,id=1)=>({id,raw:box,box,seen:now,confidence:1,score:.98});
function simulate(boxAt,{fps=10,seconds=10,enabled=true}={}){
  const detector=new JumpDetector(),events=[],states=[];
  for(let i=0;i<=seconds*fps;i++){
    const now=i/fps,box=boxAt(now,i);
    events.push(...detector.update(box?[track(box,now)]:[],now,enabled).map(e=>({...e,time:now})));
    states.push({now,blocking:detector.get(1)?.blocking===true});
  }
  return {events,states,detector};
}
for(const fps of [8,10,15]){
  const {events}=simulate(t=>jumpingDemo(t).predictions[0].bbox.map((v,i)=>v/(i%2?360:640)),{fps});
  assert.equal(events.filter(e=>e.kind==='landing').length,3,`One landing per demo jump at ${fps} fps`);
  assert.equal(events.filter(e=>e.kind==='takeoff').length,3);
  for(const e of events){
    assert.deepEqual(e.box,base,'Impacts originate at the original standing position');
    if(e.kind==='landing')assert(e.strength>=1.9&&e.strength<=2.2&&e.radius>=12&&e.radius<=16);
  }
}
const liftAt=(t,start=2,duration=.6,height=.08)=>{const u=(t-start)/duration;return u>0&&u<1?height*Math.sin(Math.PI*u):0;};
const boxWithLift=lift=>[base[0],base[1]-lift,base[2],base[3]];
const negatives={
  jitter:t=>[base[0]+.002*Math.sin(t*17),base[1]+.004*Math.sin(t*19),base[2],base[3]+.003*Math.cos(t*21)],
  crouching:t=>{const bend=liftAt(t,2,.8,.15);return[base[0],base[1]+bend,base[2],base[3]-bend];},
  arms:t=>{const arms=liftAt(t,2,.8,.12);return[base[0],base[1]-arms,base[2],base[3]+arms];},
  walking:t=>[.1+t*.05,base[1]+.006*Math.sin(t*7),base[2],base[3]],
  cropped:t=>[base[0],.42-liftAt(t),base[2],.58],
  singleSpike:(t,i)=>boxWithLift(i===22?.09:0),
  lostDuringFlight:t=>t>2.15&&t<2.65?null:boxWithLift(liftAt(t)),
  jumpBeforeCalibration:t=>boxWithLift(liftAt(t,.1,.6)),
};
for(const[name,fixture]of Object.entries(negatives))assert.equal(simulate(fixture).events.filter(e=>e.kind==='landing').length,0,`${name} must not trigger a landing`);
assert.equal(simulate(t=>boxWithLift(liftAt(t)),{enabled:false}).events.length,0);
assert.equal(simulate(t=>boxWithLift(liftAt(t)),{fps:2}).events.length,0,'Large sample gaps must disarm the detector');
const bentLanding=simulate(t=>{const lift=liftAt(t);const bend=t>=2.6&&t<2.9?.10:0;return[base[0],base[1]-lift+bend,base[2],base[3]-bend];});
assert.equal(bentLanding.events.filter(e=>e.kind==='landing').length,1,'Bent knees on a confirmed landing are allowed');
const repeating=simulate(t=>boxWithLift(liftAt(t,2,.5)+liftAt(t,2.75,.5)+liftAt(t,3.5,.5)));
assert.equal(repeating.events.filter(e=>e.kind==='landing').length,3,'Repeated hops remain distinct');
const overlap=new JumpDetector();
let overlapEvents=[];
for(let i=0;i<60;i++){const now=i/10,b=boxWithLift(liftAt(now));overlapEvents.push(...overlap.update([track(b,now,1),track(b,now,2)],now));}
assert.equal(overlapEvents.length,0,'Overlapping people should not create ambiguous jumps');

// Run the real box tracker, jump detector and footstep sources together.
const tracker=new PersonTracker(),jumps=new JumpDetector(),sources=new PeopleRippleSources(),steps=[];
let jumpEvents=[];
for(let i=0;i<540;i++){
 const now=i/60;
 if(i%6===0){
  const tracks=tracker.update(jumpingDemo(now).predictions,640,360,now);
  jumpEvents.push(...jumps.update(tracks,now));
  sources.update(tracks.map(t=>{const jump=jumps.get(t.id);return{...PersonTracker.mapPoint(jump?.blocking?jump.base:t.box),id:t.id,confidence:t.confidence,jumping:jump?.blocking===true};}),now);
 }
 sources.tick(1/60,now,(x,y,strength,touch)=>steps.push(touch));
}
assert.equal(jumpEvents.filter(e=>e.kind==='landing').length,3,'The real tracker preserves repeated jump detections');
assert.equal(steps.filter(s=>s.kind==='footstep').length,0,'Takeoff and landing do not also emit walking footsteps');
jumps.clear();assert.equal(jumps.states.size,0);
console.log('Jump timing, repeated landings, bent-knee returns, false-positive guards and footstep suppression passed.');
