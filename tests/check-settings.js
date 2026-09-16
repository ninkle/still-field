const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let stored=JSON.stringify({speed:.7,quality:3840,cameraDevice:'unplugged-logitech',mirror:false,autoCamera:false,jumps:false});
class Element{
 constructor(){this.listeners={};this.value='';this.checked=false;this.options=[];this.dataset={};}
 addEventListener(type,fn){this.listeners[type]=fn;}
 emit(type){return this.listeners[type]?.({target:this});}
 replaceChildren(...children){this.options=children;}add(option){this.options.push(option);}
}
const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
const slider=element('speed');slider.dataset.control='speed';
const root=element('still-field-art');root.querySelectorAll=()=>[slider];
let configured,quality,enumerations=0;
const context={console,URLSearchParams,location:{search:''},
 localStorage:{getItem:()=>stored,setItem:(key,value)=>stored=value},
 Option:class{constructor(text,value){this.text=text;this.value=value;}},
 document:{getElementById:element,addEventListener(){},body:{classList:{toggle(){}}}},
 navigator:{mediaDevices:{enumerateDevices:async()=>{enumerations++;return[{kind:'videoinput',deviceId:'another-camera',label:'Another camera'}];},addEventListener(){}}},
 window:{StillField:{configure:v=>configured={...v},setQuality:v=>quality=v}}};
vm.runInNewContext(fs.readFileSync('src/installation-settings.js','utf8'),context);
(async()=>{
 await new Promise(setImmediate);
 assert.equal(configured.speed,.7);assert.equal(quality,3840);
 assert.equal(element('sf-camera-mirror').checked,false);
 assert.equal(element('sf-auto-camera').checked,false);
 assert.equal(element('sf-camera-jumps').checked,false);
 element('sf-camera-jumps').checked=true;element('sf-camera-jumps').emit('change');
 assert.equal(JSON.parse(stored).jumps,true,'Jump detection preference is saved');
 assert.equal(element('sf-camera-device').value,'unplugged-logitech','Unavailable saved input must not silently switch cameras');
 assert(element('sf-camera-device').options.some(o=>/unavailable/.test(o.text)));
 slider.value='61';slider.emit('input');assert.equal(JSON.parse(stored).speed,.61);
 element('sf-quality').value='1920';element('sf-quality').emit('change');assert.equal(quality,1920);
 assert.equal(enumerations,1);
 console.log('Settings restore/save, quality choice, camera opt-in and missing-device preservation passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
