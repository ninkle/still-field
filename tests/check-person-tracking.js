const assert=require('node:assert/strict');
const {PersonTracker,PeopleRippleSources,emitFootstep,movementTouch,trackingDemo,FOOTSTEP_CADENCE}=require('../src/person-tracking.js');
const person=(x,y=.2)=>({class:'person',score:.95,bbox:[x*640,y*360,80,210]});
const t=new PersonTracker();
assert.equal(t.update([person(.1),person(.65)],640,360,0).length,0);
const start=t.update([person(.105),person(.65)],640,360,.25);assert.equal(start.length,2);
const firstId=start[0].id;
const moved=t.update([person(.65),person(.15)],640,360,.5);assert.equal(moved.find(p=>p.box[0]<.3).id,firstId);
assert.equal(t.visible(3).length,0);
const box=[.1,.2,.2,.6],mirrored=PersonTracker.mapPoint(box,true),plain=PersonTracker.mapPoint(box,false);
assert(Math.abs(mirrored.x-.8)<1e-10);assert(Math.abs(plain.x-.2)<1e-10);assert(Math.abs(mirrored.y-.218)<1e-10);
const s=new PeopleRippleSources(),emitted=[];
const emit=(...args)=>emitted.push(args);
for(let i=0;i<360;i++){
 const now=i/60;if(i%15===0)s.update([{id:1,x:.3,y:.6},{id:2,x:.7,y:.4}],now);
 s.tick(1/60,now,emit);
}
assert.equal(emitted.length,0,'Standing people breathe continuously instead of firing repeated impacts');
assert(s.positions().every(p=>p.settled>.95),'Stationary people settle gently into breathing ripples');
const stationary=emitted.length;
for(let i=360;i<480;i++){
 const now=i/60;if(i%6===0)s.update([{id:1,x:.3+(i-360)/120*.3,y:.6},{id:2,x:.7,y:.4}],now);
 s.tick(1/60,now,emit);
}
assert(emitted.length>=stationary+5,'Moving people should leave distinct steps');
assert(emitted.every(p=>p[0]>=0&&p[0]<=1&&p[1]>=0&&p[1]<=1));
const beforePause=emitted.length;s.tick(.1,8.1,emit,false);assert.equal(emitted.length,beforePause);
s.update([],8.1);s.tick(.1,8.2,emit);assert.equal(emitted.length,beforePause);
s.tick(.1,10.5,emit);assert.equal(s.people.size,0);
// Sampled camera movement should produce separated left/right impacts,
// independent of the rendering rate and without bursty interpolation dots.
for(const fps of [15,30,60]){
 const gait=new PeopleRippleSources(),steps=[];
 for(let i=0;i<fps*4;i++){
  const now=i/fps;
  if(i%Math.max(1,Math.round(fps/4))===0)gait.update([{id:'walker',x:.2+now*.12,y:.5}],now);
  gait.tick(1/fps,now,(x,y,strength,touch)=>{if(touch?.kind==='footstep')steps.push({x,y,now,strength,radius:touch.radius});});
 }
 assert(steps.length>=8&&steps.length<=12,`Expected a walking cadence at ${fps} fps`);
 for(let i=1;i<steps.length;i++){
  assert(steps[i].now-steps[i-1].now>=FOOTSTEP_CADENCE-1e-9,'No simultaneous or rapid catch-up steps');
  assert((steps[i].y-.5)*(steps[i-1].y-.5)<0,'Feet alternate across the path');
  assert(steps[i].x>steps[i-1].x,'Steps advance with the person');
 }
}
const jitter=new PeopleRippleSources(),jitterSteps=[];
for(let i=0;i<360;i++){
 const now=i/60;
 if(i%15===0)jitter.update([{id:'standing',x:.5+Math.sin(i)*.006,y:.5+Math.cos(i)*.006}],now);
 jitter.tick(1/60,now,(x,y,strength,touch)=>{if(touch?.kind==='footstep')jitterSteps.push([x,y]);});
}
assert.equal(jitterSteps.length,0,'Stationary detection jitter should not create footsteps');
assert(jitter.positions()[0].settled>.9,'Camera jitter must not prevent a stationary person from settling');
const vertical=[];emitFootstep((...p)=>vertical.push(p),.5,.5,0,1,1);emitFootstep((...p)=>vertical.push(p),.5,.6,0,1,-1);
assert(vertical[0][0]<.5&&vertical[1][0]>.5,'Foot offsets rotate with vertical movement');
const gentle=movementTouch(.04),brisk=movementTouch(.28),extreme=movementTouch(20);
assert(gentle.radius>brisk.radius&&gentle.strength<brisk.strength&&gentle.cadence>brisk.cadence,'Slow movement is broad and gentle; brisk movement is tighter and stronger');
assert.deepEqual(extreme,brisk,'Brisk movement has a ceiling rather than escalating without limit');
const transition=new PeopleRippleSources();
for(let i=0;i<720;i++){
 const now=i/60,x=.1+Math.min(now,4)*.12;
 if(i%15===0)transition.update([{id:1,x,y:.5}],now);
 transition.tick(1/60,now,()=>{});
 if(i===210)assert(transition.positions()[0].settled<.05,'Walking does not produce a settled breathing ripple');
}
assert(transition.positions()[0].settled>.95,'A person who stops moving settles');
for(let i=720;i<810;i++){
 const now=i/60;if(i%15===0)transition.update([{id:1,x:.58-(now-12)*.18,y:.5}],now);
 transition.tick(1/60,now,()=>{});
}
assert(transition.positions()[0].settled<.05,'Walking again releases the standing ripple');
assert(trackingDemo(3).predictions.length===2&&trackingDemo(20).predictions.length===2&&trackingDemo(45).predictions.length===0,'Demo covers movement, settling and an empty room');
console.log('Tracking, movement-dependent footsteps, settling, jitter suppression, pause and cleanup passed.');
