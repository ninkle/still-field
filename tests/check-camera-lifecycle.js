const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {PersonTracker}=require('../src/person-tracking.js');
class Element{
 constructor(){this.listeners={};this.checked=true;this.value='feet';this.hidden=true;this.width=640;this.height=360;this.videoWidth=640;this.videoHeight=360;this.readyState=2;this.textContent='';}
 addEventListener(type,fn){this.listeners[type]=fn;}
 emit(type){return this.listeners[type]?.({target:this});}
 getContext(){return new Proxy({},{get:()=>()=>{}});}
 pause(){}play(){return Promise.resolve();}
}
const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
const root=element('still-field-art');root.querySelector=s=>element(s);
element('sf-camera-assets').textContent=JSON.stringify({model:{modelTopology:{},weightsManifest:[]},weights:'',tfjs:'',coco:''});
let cameraCalls=0,resolveCamera,stops=0,clearCalls=0,lastConstraints;
const mediaTrack={stop(){stops++;},addEventListener(){}};
const stream={getTracks:()=>[mediaTrack],getVideoTracks:()=>[mediaTrack]};
const art={setPeople(){},clearPeople(){clearCalls++;}};
const context={console,performance,TextDecoder,Uint8Array,atob,PersonTracker,
  document:{getElementById:element,createElement:()=>new Element(),head:{appendChild(){}},fullscreenElement:null,hidden:false},
  navigator:{mediaDevices:{getUserMedia(constraints){lastConstraints=constraints;cameraCalls++;return new Promise(r=>resolveCamera=r);}}},
  setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},
  tf:{setBackend:async()=>{},ready:async()=>{},io:{fromMemory:a=>a}},
  cocoSsd:{load:async()=>({detect:async()=>[]})},
};
context.window={StillField:art,StillFieldTracking:{PersonTracker},StillFieldSettings:{get:key=>key==='cameraDevice'?'selected-logitech':false,refreshDevices(){}},tf:context.tf,cocoSsd:context.cocoSsd,addEventListener(){}};
vm.runInNewContext(fs.readFileSync('src/camera-controller.js','utf8'),context);
const flush=()=>new Promise(setImmediate),button=element('[data-action="camera"]');
(async()=>{
 assert.equal(cameraCalls,0,'Camera must remain off on page load');
 const pending=button.emit('click');await flush();assert.equal(cameraCalls,1);
 assert.equal(lastConstraints.video.deviceId.exact,'selected-logitech');
 assert.equal(lastConstraints.audio,false);
 await button.emit('click');resolveCamera(stream);await pending;
 assert.equal(stops,1,'Cancelled permission request must release any late stream');
 assert.equal(context.window.StillFieldCamera.getState().active,false);
 const start=button.emit('click');await flush();resolveCamera(stream);await start;await flush();
 assert.equal(button.textContent,'Stop camera');
 await button.emit('click');assert.equal(stops,2);assert(clearCalls>0);
 assert.equal(element('sf-camera-video').srcObject,null);
 console.log('Camera stays off initially; cancellation releases late streams; stop releases the camera, clears video and removes ripple sources.');
})().catch(e=>{console.error(e);process.exitCode=1;});
