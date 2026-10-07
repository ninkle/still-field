const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {PersonTracker,PeopleRippleSources,trackingDemo}=require('../src/person-tracking.js');
const {JumpDetector,jumpingDemo}=require('../src/jump-tracking.js');
const flush=()=>new Promise(setImmediate);

// Exercise the actual camera and microphone controllers together, passing the
// detector's boxes through the real person tracker and footstep sources.
function player(){
 let now=0,nextTimer=0,reader=null,clears=0,audioCalls=0,videoCalls=0;
 const timers=new Map(),elements=new Map(),sources=new PeopleRippleSources(),steps=[],reports=[];
 class Element{
  constructor(){this.listeners={};this.checked=true;this.value='feet';this.hidden=true;this.width=640;this.height=360;this.videoWidth=640;this.videoHeight=360;this.readyState=2;this.textContent='';this.classList={add(){},remove(){},contains:()=>false};}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  emit(type){return Promise.all((this.listeners[type]||[]).map(fn=>fn({target:this})));}
  getContext(){return new Proxy({},{get:()=>()=>{}});}pause(){}play(){return Promise.resolve();}
 }
 const element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const root=element('still-field-art');root.querySelector=element;root.querySelectorAll=()=>[];
 element('sf-camera-assets').textContent=JSON.stringify({model:{modelTopology:{},weightsManifest:[]},weights:'',tfjs:'',coco:''});
 const makeStream=()=>{const track=new Element();track.stopped=false;track.stop=()=>track.stopped=true;return{track,getTracks:()=>[track],getVideoTracks:()=>[track],getAudioTracks:()=>[track]};};
 const camera=makeStream(),mic=makeStream();
 class AudioContext{
  resume(){return Promise.resolve();}close(){return Promise.resolve();}
  createAnalyser(){return{fftSize:2048,getFloatTimeDomainData:a=>a.fill(Math.floor(now/350)%2?.035:.003)};}
  createMediaStreamSource(){return{connect(){}};}
 }
 const context={console,TextDecoder,Uint8Array,Float32Array,atob,URLSearchParams,AudioContext,performance:{now:()=>now},location:{search:'',protocol:'http:'},
  document:{getElementById:element,createElement:()=>new Element(),head:{appendChild(){}},addEventListener(){},hidden:false,fullscreenElement:null},
  navigator:{mediaDevices:{getUserMedia(c){if(c.video){videoCalls++;return Promise.resolve(camera);}audioCalls++;return Promise.resolve(mic);}}},
  setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:()=>1,cancelAnimationFrame(){},
  tf:{setBackend:async()=>{},ready:async()=>{},io:{fromMemory:a=>a}},
  cocoSsd:{load:async()=>({detect:async()=>{
   // Walking away from the camera moves upward in its image. The sensitive
   // jump update incorrectly silenced many of these ordinary footsteps.
   const t=Math.max(0,now/1000-1),box=[.35,.5-.05*t,.12,.4];
   return[{class:'person',score:.95,bbox:box.map((v,i)=>v*(i%2?180:320))}];
  }})},
 };
 const art={setPeople(people){reports.push(people);sources.update(people,now/1000);},clearPeople(){clears++;sources.clear();},jumpImpact(){},setLiveReader:r=>reader=r,configure(){}};
 context.window={StillField:art,StillFieldTracking:{PersonTracker,trackingDemo,JumpDetector,jumpingDemo},StillFieldSettings:{get:k=>({cameraDevice:'camera',micDevice:'mic',micGain:1,activity:.2})[k],refreshDevices(){}},tf:context.tf,cocoSsd:context.cocoSsd,addEventListener(){}};
 for(const file of ['src/installation.js','src/camera-controller.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
 async function advance(frames){
  for(let i=0;i<frames;i++){
   now+=1000/60;
   const due=[...timers].filter(([,t])=>t.at<=now);
   for(const[id,t]of due)if(timers.delete(id))t.fn();
   await flush();
   if(reader)assert(reader()>=0&&reader()<=1);
   sources.tick(1/60,now/1000,(x,y,strength,touch)=>{if(touch.kind==='footstep')steps.push({x,y,strength});});
  }
 }
 return{advance,steps,reports,camera,mic,cameraButton:element('[data-action="camera"]'),micButton:element('[data-action="mic"]'),
  state:()=>context.window.StillFieldCamera.getState(),get reader(){return reader;},get clears(){return clears;},get videoCalls(){return videoCalls;},get audioCalls(){return audioCalls;}};
}
(async()=>{
 const movement=player(),both=player();
 await movement.cameraButton.emit('click');await both.cameraButton.emit('click');await both.micButton.emit('click');
 await movement.advance(600);await both.advance(600);
 assert(movement.steps.length>=8,'Ordinary upward movement must keep producing walking footsteps with jumps enabled');
 assert.deepEqual(both.steps,movement.steps,'Active sound input does not replace or suppress camera footsteps');
 assert.equal(both.state().people,1);assert.equal(both.videoCalls,1);assert.equal(both.audioCalls,1);
 const before=both.clears;await both.micButton.emit('click');
 assert.equal(both.clears,before,'Stopping sound does not clear camera sources');assert(both.state().active);assert(!both.camera.track.stopped);
 await both.micButton.emit('click');const liveReader=both.reader;await both.cameraButton.emit('click');
 assert.equal(both.reader,liveReader,'Stopping the camera leaves microphone input intact');assert.equal(both.state().active,false);
 assert.equal(both.camera.track.stopped,true);
 console.log('Camera walking regression passed; footsteps are identical with sound on/off, and each input stops independently.');
})().catch(e=>{console.error(e);process.exitCode=1;});
