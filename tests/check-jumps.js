const assert=require('node:assert/strict');
const {JumpDetector,jumpingDemo,detectionProfile}=require('../src/jump-tracking.js');
const {PersonTracker,PeopleRippleSources}=require('../src/person-tracking.js');
const base=[.43,.20,.14,.62];
const track=(box,now,id=1)=>({id,raw:box,box,seen:now,confidence:1,score:.98});
function simulate(boxAt,{fps=10,seconds=10,enabled=true,score=.98,sensitivity='sensitive'}={}){
  const detector=new JumpDetector(),events=[],states=[];
  for(let i=0;i<=seconds*fps;i++){
    const now=i/fps,box=boxAt(now,i);
    events.push(...detector.update(box?[{...track(box,now),score}]:[],now,enabled,sensitivity).map(e=>({...e,time:now})));
    states.push({now,blocking:detector.get(1)?.blocking===true});
  }
  return {events,states,detector};
}
for(const fps of [4,5,8,10,15]){
  const {events}=simulate(t=>jumpingDemo(t).predictions[0].bbox.map((v,i)=>v/(i%2?360:640)),{fps});
  assert.equal(events.filter(e=>e.kind==='landing').length,3,`One landing per demo jump at ${fps} fps`);
  assert.equal(events.filter(e=>e.kind==='takeoff').length,3);
  for(const e of events){
    assert.deepEqual(e.box,base,'Impacts originate at the original standing position');
    if(e.kind==='landing')assert(e.strength>=2.5&&e.strength<=3&&e.radius>=18&&e.radius<=22);
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

const smallHop=t=>boxWithLift(liftAt(t,2,.6,.024));
for(const fps of [6,10,15]){
 assert.equal(simulate(smallHop,{fps,score:.42}).events.filter(e=>e.kind==='landing').length,1,'More sensitive mode catches small hops and lower-confidence people');
}
assert.equal(simulate(smallHop,{sensitivity:'standard'}).events.filter(e=>e.kind==='landing').length,0,'Standard remains available for reducing small false triggers');
const raisedArms=t=>{const lift=liftAt(t),arms=liftAt(t,1.9,.9,.11);return[base[0],base[1]-lift-arms,base[2],base[3]+arms];};
assert.equal(simulate(raisedArms).events.filter(e=>e.kind==='landing').length,1,'Raising arms during a jump can change the box height');
assert.equal(simulate((t,i)=>i===22?null:boxWithLift(liftAt(t))).events.filter(e=>e.kind==='landing').length,1,'One missed sample does not erase a jump');
const distant=t=>[.45,.45-liftAt(t,2,.6,.012),.07,.25];
assert.equal(simulate(distant,{score:.42}).events.filter(e=>e.kind==='landing').length,1,'Smaller full-body detections are eligible');
const intermittent=new PersonTracker(),forgiving=new JumpDetector();let forgivingEvents=[];
for(let i=0;i<60;i++){
 const now=i/10,b=boxWithLift(liftAt(now));
 const predictions=i===22?[]:[{class:'person',score:.42,bbox:b.map((v,j)=>v*(j%2?360:640))}];
 const people=intermittent.update(predictions,640,360,now,detectionProfile().score);
 forgivingEvents.push(...forgiving.update(people,now));
 if(i===20)assert.equal(forgiving.feedback,'Ready for a jump');
}
assert.equal(forgivingEvents.filter(e=>e.kind==='landing').length,1,'The full tracking pipeline survives one missed low-confidence detection');
const stale=new JumpDetector();let staleEvents=[];
for(let i=0;i<50;i++){
 const now=i/10,b=boxWithLift(i>=21&&i<=24?.06:0);
 const observation=track(b,now);if(i>21&&i<=24)observation.seen=2.1;
 staleEvents.push(...stale.update([observation],now));
}
assert.equal(staleEvents.filter(e=>e.kind==='landing').length,0,'Reusing an old raised box cannot confirm a flight');
console.log('Small hops, slower sampling, arm motion, distant people, brief missed samples and live readiness feedback passed.');
