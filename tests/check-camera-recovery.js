const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {PersonTracker,trackingDemo}=require('../src/person-tracking.js');
const {JumpDetector,jumpingDemo}=require('../src/jump-tracking.js');
const flush=()=>new Promise(setImmediate);
function fixture(){
 let now=1,nextTimer=0,calls=0,detectCalls=0,stops=0,clears=0,framesFlow=true,detectImpl=async()=>predictions,acquireImpl=null;
 const timers=new Map(),elements=new Map(),constraints=[],reports=[],streams=[];
 const predictions=[{class:'person',score:.98,bbox:[120,30,50,135]}];
 class Element{
  constructor(){this.listeners={};this.checked=true;this.value='feet';this.hidden=false;this.width=640;this.height=360;this.videoWidth=640;this.videoHeight=360;this.readyState=2;this.textContent='';this.frames=0;this.currentTime=0;}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  emit(type){return Promise.all((this.listeners[type]||[]).map(fn=>fn({target:this})));}
  getContext(){return new Proxy({},{get:()=>()=>{}});}
  getVideoPlaybackQuality(){return{totalVideoFrames:this.frames};}
  pause(){}play(){return Promise.resolve();}
 }
 const element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const root=element('still-field-art');root.querySelector=element;
 element('sf-camera-assets').textContent=JSON.stringify({model:{modelTopology:{},weightsManifest:[]},weights:'',tfjs:'',coco:''});
 const video=element('sf-camera-video'),document=new Element();
 Object.assign(document,{getElementById:element,createElement:()=>new Element(),head:{appendChild(){}},fullscreenElement:null,hidden:false});
 function makeStream(){
  const track=new Element();Object.assign(track,{readyState:'live',muted:false,stop(){this.readyState='ended';stops++;},getSettings:()=>({deviceId:'logitech'})});
  const stream={track,getTracks:()=>[track],getVideoTracks:()=>[track]};streams.push(stream);return stream;
 }
 const context={console,performance:{now:()=>now},TextDecoder,Uint8Array,atob,
  document,navigator:{mediaDevices:{getUserMedia(c){calls++;constraints.push(c);return acquireImpl?acquireImpl():Promise.resolve(makeStream());}}},
  setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
  requestAnimationFrame:()=>1,cancelAnimationFrame(){},
  tf:{setBackend:async()=>{},ready:async()=>{},io:{fromMemory:a=>a}},
  cocoSsd:{load:async()=>({detect(...args){detectCalls++;return detectImpl(...args);}})},
 };
 context.window={StillField:{setPeople:p=>reports.push(p),clearPeople(){clears++;},jumpImpact(){}},StillFieldTracking:{PersonTracker,trackingDemo,JumpDetector,jumpingDemo},StillFieldSettings:{get:key=>key==='cameraDevice'?'logitech':false,refreshDevices(){}},tf:context.tf,cocoSsd:context.cocoSsd,addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('src/camera-controller.js','utf8'),context);
 async function advance(ms){
  const end=now+ms;
  while(now<end){
   now=Math.min(end,now+50);
   if(framesFlow&&video.srcObject){video.frames++;video.currentTime+=.05;}
   const due=[...timers].filter(([,t])=>t.at<=now).sort((a,b)=>a[1].at-b[1].at);
   for(const[id,t]of due)if(timers.delete(id))t.fn();
   await flush();
  }
 }
 return{advance,element,video,document,streams,constraints,reports,makeStream,
  start:()=>element('[data-action="camera"]').emit('click'),state:()=>context.window.StillFieldCamera.getState(),
  status:()=>element('sf-camera-status').textContent,
  get calls(){return calls;},get detectCalls(){return detectCalls;},get stops(){return stops;},get clears(){return clears;},
  set framesFlow(v){framesFlow=v;},set detectImpl(fn){detectImpl=fn;},set acquireImpl(fn){acquireImpl=fn;},
 };
}
(async()=>{
 const f=fixture();await f.start();await f.advance(1000);
 assert(f.state().people===1&&f.detectCalls>=3,'Fresh stationary frames still detect a person');
 const detected=f.detectCalls;f.framesFlow=false;f.video.currentTime+=1;await f.advance(1000);
 assert.equal(f.detectCalls,detected,'Never infer the same decoded frame repeatedly');
 await f.advance(1500);assert.equal(f.state().people,0,'Stalled input clears remembered people');
 assert(f.state().stale);assert.match(f.status(),/fresh frames/);
 await f.advance(4000);assert.equal(f.calls,2,'A frozen video automatically reacquires the camera');
 assert.equal(f.stops,1,'Release the stalled stream before opening a new one');
 assert(f.constraints.every(c=>c.video.deviceId.exact==='logitech'),'Recovery stays on the selected camera');
 f.framesFlow=true;await f.advance(1000);assert.equal(f.state().people,1);
 assert.equal(f.state().stale,false);assert.equal(f.state().recoveries,1);
 await f.advance(31000);assert.equal(f.state().recoveries,0,'Sustained healthy playback resets the retry allowance');

 const stopped=fixture();await stopped.start();stopped.framesFlow=false;await stopped.advance(5500);
 assert.match(stopped.status(),/reconnecting/);await stopped.start();await stopped.advance(10000);
 assert.equal(stopped.calls,1,'Stop cancels a scheduled reconnect');assert.equal(stopped.state().active,false);

 const bounded=fixture();await bounded.start();bounded.framesFlow=false;await bounded.advance(40000);
 assert.equal(bounded.calls,4,'Only three automatic reconnect attempts');assert.equal(bounded.state().active,false);
 assert.match(bounded.status(),/could not recover/);

 const muted=fixture();await muted.start();await muted.advance(1000);
 muted.streams[0].track.muted=true;await muted.streams[0].track.emit('mute');assert.equal(muted.state().people,0);
 await muted.advance(1000);muted.streams[0].track.muted=false;await muted.advance(500);
 assert.equal(muted.calls,1,'A brief mute resumes without reopening the camera');assert.equal(muted.state().people,1);
 muted.streams[0].track.readyState='ended';await muted.streams[0].track.emit('ended');await muted.advance(1500);
 assert.equal(muted.calls,2,'A disconnected track also attempts recovery');

 const hidden=fixture();await hidden.start();await hidden.advance(1000);
 hidden.document.hidden=true;await hidden.document.emit('visibilitychange');hidden.framesFlow=false;await hidden.advance(60000);
 assert.equal(hidden.calls,1,'Background throttling does not trigger reconnects');assert.equal(hidden.state().people,0);
 hidden.document.hidden=false;await hidden.document.emit('visibilitychange');await hidden.advance(1000);
 assert.equal(hidden.calls,1,'Returning to the player gives playback a grace period');
 hidden.framesFlow=true;await hidden.advance(500);assert.equal(hidden.state().people,1);

 const hung=fixture();let resolveDetection;hung.detectImpl=()=>new Promise(r=>resolveDetection=r);
 await hung.start();await hung.advance(11500);
 assert.equal(hung.state().active,false);assert.match(hung.status(),/Reload the player/);
 assert.equal(hung.detectCalls,1,'A stuck detector must not accumulate concurrent inferences');
 resolveDetection([{class:'person',score:.99,bbox:[100,20,50,140]}]);await flush();assert.equal(hung.state().people,0,'A late inference cannot resurrect people after stop');

 const late=fixture();await late.start();late.framesFlow=false;let resolveAcquisition;
 late.acquireImpl=()=>new Promise(r=>resolveAcquisition=r);await late.advance(7000);
 assert.equal(late.calls,2);await late.start();const lateStream=late.makeStream();resolveAcquisition(lateStream);await flush();
 assert.equal(lateStream.track.readyState,'ended','A cancelled recovery releases its late stream');
 assert.equal(late.video.srcObject,null);

 const playback=fixture();playback.video.play=()=>new Promise(()=>{});
 playback.start();await flush();await playback.advance(11500);
 assert.equal(playback.calls,2,'A stuck video.play also gets bounded recovery');
 await playback.start();assert.equal(playback.state().active,false);

 const crossing=fixture();let resolveOldFrame;
 crossing.detectImpl=()=>new Promise(r=>resolveOldFrame=r);
 await crossing.start();await crossing.advance(100);
 crossing.document.hidden=true;await crossing.document.emit('visibilitychange');
 crossing.document.hidden=false;await crossing.document.emit('visibilitychange');await crossing.advance(500);
 resolveOldFrame([{class:'person',score:.99,bbox:[100,20,50,140]}]);await flush();
 assert.equal(crossing.reports.length,0,'An inference captured before hiding cannot become a fresh observation on resume');

 const fallback=fixture();fallback.video.getVideoPlaybackQuality=undefined;
 await fallback.start();await fallback.advance(1000);assert.equal(fallback.state().people,1,'Older browsers can use media time as a fallback');
 fallback.framesFlow=false;await fallback.advance(7000);assert.equal(fallback.calls,2);
 console.log('Camera freshness, still-person input, bounded reconnects, cancellation, mute/disconnect, background resume and hung-inference cleanup passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
