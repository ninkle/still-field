const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{
 constructor(){this.listeners={};this.textContent='';this.classList={add(){},remove(){}};}
 addEventListener(type,fn){this.listeners[type]=fn;}
 emit(type){return this.listeners[type]?.({target:this});}
}
const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
const root=element('root');root.querySelector=element;root.querySelectorAll=()=>[];
let calls=0,resolveMedia,stops=0,closes=0,reader=null,constraints,restored;
const track={stop(){stops++;},addEventListener(type,fn){this[type]=fn;}};
const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
class AudioContext{
 resume(){return Promise.resolve();}close(){closes++;return Promise.resolve();}
 createAnalyser(){return{fftSize:2048,getFloatTimeDomainData:a=>a.fill(.01)};}
 createMediaStreamSource(){return{connect(){}};}
}
const context={console,URLSearchParams,Float32Array,AudioContext,location:{search:'',protocol:'http:'},
 document:{getElementById:()=>root,addEventListener(){}},
 navigator:{mediaDevices:{getUserMedia(c){calls++;constraints=c;return new Promise(r=>resolveMedia=r);}}},
 setTimeout:()=>1,clearTimeout(){}};
context.window={StillField:{setLiveReader:r=>reader=r,configure:v=>restored=v},StillFieldSettings:{get:k=>({micDevice:'logitech-audio',micGain:1,activity:.35})[k],refreshDevices(){}},addEventListener(){}};
vm.runInNewContext(fs.readFileSync('src/installation.js','utf8'),context);
const button=element('[data-action="mic"]'),flush=()=>new Promise(setImmediate);
(async()=>{
 assert.equal(calls,0,'No microphone access on page load');
 const pending=button.emit('click');await flush();
 assert.equal(constraints.audio.deviceId.exact,'logitech-audio');
 assert.equal(constraints.audio.autoGainControl,false);
 await button.emit('click');resolveMedia(stream);await pending;
 assert.equal(stops,1,'Late microphone stream released after cancellation');
 assert.equal(reader,null);assert.equal(restored.activity,.35);
 const start=button.emit('click');await flush();resolveMedia(stream);await start;
 assert.equal(button.textContent,'Stop microphone');assert(reader()>=0&&reader()<=1);
 track.ended();assert.equal(stops,2);assert.equal(reader,null);assert.equal(closes,2);
 assert.match(element('[role="status"]').textContent,/disconnected/);
 console.log('Microphone selection, explicit start, pending cancellation, local loudness and unplug cleanup passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
