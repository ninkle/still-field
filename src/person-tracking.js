class PersonTracker {
  constructor(){this.tracks=[];this.nextId=1;this.maxAge=1.6;}
  clear(){this.tracks=[];}
  static overlap(a,b){
    const w=Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]));
    const h=Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
    return w*h/Math.max(.0001,a[2]*a[3]+b[2]*b[3]-w*h);
  }
  update(predictions,width,height,now,threshold=.55){
    this.tracks=this.tracks.filter(t=>now-t.seen<this.maxAge);
    const detections=predictions.filter(p=>p.class==='person'&&p.score>=threshold&&p.bbox?.length===4&&p.bbox.every(Number.isFinite)).map(p=>{
      const[x,y,w,h]=p.bbox,left=Math.max(0,x/width),top=Math.max(0,y/height);
      return {box:[left,top,Math.min(1,(x+w)/width)-left,Math.min(1,(y+h)/height)-top],score:p.score};
    }).filter(p=>p.box[2]>.025&&p.box[3]>.06).sort((a,b)=>b.score-a.score).slice(0,8);
    const pairs=[];
    this.tracks.forEach((t,ti)=>detections.forEach((d,di)=>{
      const dt=Math.min(.7,Math.max(0,now-t.seen)),b=d.box;
      const dx=(b[0]+b[2]/2)-(t.raw[0]+t.raw[2]/2+t.vx*dt);
      const dy=(b[1]+b[3]/2)-(t.raw[1]+t.raw[3]/2+t.vy*dt);
      const distance=Math.hypot(dx,dy),iou=PersonTracker.overlap(t.raw,b);
      if(distance<.12+Math.min(.24,dt*.35)||iou>.08)pairs.push({ti,di,cost:distance+.08*(1-iou)});
    }));
    pairs.sort((a,b)=>a.cost-b.cost);
    const usedTracks=new Set(),usedDetections=new Set();
    for(const p of pairs){
      if(usedTracks.has(p.ti)||usedDetections.has(p.di))continue;
      usedTracks.add(p.ti);usedDetections.add(p.di);
      const t=this.tracks[p.ti],d=detections[p.di],dt=Math.max(.02,now-t.seen),alpha=1-Math.exp(-dt/.18);
      const vx=((d.box[0]+d.box[2]/2)-(t.raw[0]+t.raw[2]/2))/dt;
      const vy=((d.box[1]+d.box[3]/2)-(t.raw[1]+t.raw[3]/2))/dt;
      t.vx=t.vx*.5+Math.max(-1,Math.min(1,vx))*.5;t.vy=t.vy*.5+Math.max(-1,Math.min(1,vy))*.5;
      t.box=t.box.map((v,i)=>v+(d.box[i]-v)*alpha);t.raw=d.box;t.score=d.score;t.seen=now;t.hits++;
    }
    detections.forEach((d,i)=>{if(!usedDetections.has(i)&&this.tracks.length<8)this.tracks.push({id:this.nextId++,box:d.box.slice(),raw:d.box.slice(),score:d.score,seen:now,hits:1,vx:0,vy:0});});
    return this.visible(now);
  }
  visible(now){return this.tracks.filter(t=>t.hits>=2&&now-t.seen<this.maxAge).map(t=>({...t,confidence:Math.min(1,Math.max(0,1-(now-t.seen)/this.maxAge))}));}
  static mapPoint(box,mirror=true,anchor='feet'){
    const x=box[0]+box[2]/2,y=box[1]+box[3]*(anchor==='center'?.5:.97);
    return {x:Math.max(.015,Math.min(.985,mirror?1-x:x)),y:Math.max(.015,Math.min(.985,1-y))};
  }
}

const FOOTSTEP_CADENCE=.32;
function movementTouch(speed=.22){
  // Speed is measured in screen heights/second, not real-world walking speed.
  const t=Math.max(0,Math.min(1,(speed-.03)/.25)),mix=t*t*(3-2*t);
  return {strength:.85+.8*mix,radius:12-5.5*mix,cadence:.62-(.62-FOOTSTEP_CADENCE)*mix};
}
function emitFootstep(emit,x,y,dx,dy,side,confidence=1,speed=.22){
  // Place alternating impacts across the direction of travel in screen space.
  // Walk past and camera tracking share these stronger, distinct steps.
  const aspect=16/9,length=Math.hypot(dx*aspect,dy),offset=.012*side,touch=movementTouch(speed);
  const nx=length>0?-dy/length:0,ny=length>0?dx*aspect/length:1;
  emit(Math.max(.015,Math.min(.985,x+nx*offset/aspect)),Math.max(.015,Math.min(.985,y+ny*offset)),touch.strength*confidence,{kind:'footstep',radius:touch.radius});
}

class PeopleRippleSources {
  constructor(){this.people=new Map();this.now=0;}
  clear(){this.people.clear();}
  update(people,now){
    const seen=new Set();
    for(const person of people.slice(0,8)){
      if(!Number.isFinite(person.x)||!Number.isFinite(person.y)||person.id==null)continue;
      const id=String(person.id),x=Math.max(.015,Math.min(.985,person.x)),y=Math.max(.015,Math.min(.985,person.y));seen.add(id);
      let p=this.people.get(id);
      if(!p){p={id,x,y,targetX:x,targetY:y,lastX:x,lastY:y,motionX:x,motionY:y,lastMotion:now,lastTrail:-1,stepSide:1,seen:now,confidence:1,speed:0,settled:0};this.people.set(id,p);}
      p.targetX=x;p.targetY=y;p.seen=now;p.confidence=Number.isFinite(person.confidence)?Math.max(0,Math.min(1,person.confidence)):1;
    }
    for(const[id,p]of this.people)if(!seen.has(id))p.confidence=0;
  }
  tick(dt,now,emit,enabled=true){
    this.now=now;
    const crowd=1/Math.sqrt(Math.max(1,[...this.people.values()].filter(p=>p.confidence>=.25&&now-p.seen<=1.8).length));
    for(const[id,p]of this.people){
      if(now-p.seen>1.8){this.people.delete(id);continue;}
      const alpha=1-Math.exp(-dt/.15),oldX=p.x,oldY=p.y;
      p.x+=(p.targetX-p.x)*alpha;p.y+=(p.targetY-p.y)*alpha;
      if(!enabled||p.confidence<.25){p.lastX=p.x;p.lastY=p.y;p.motionX=p.x;p.motionY=p.y;p.lastMotion=now;p.speed=0;continue;}
      const speed=Math.min(.8,Math.hypot((p.x-oldX)*16/9,p.y-oldY)/Math.max(.001,dt));
      p.speed+=(speed-p.speed)*(1-Math.exp(-dt/.4));
      // A position deadband allows a stationary person's box to wobble without
      // restarting their settling transition on every camera update.
      if(Math.hypot((p.x-p.motionX)*16/9,p.y-p.motionY)>.02){p.lastMotion=now;p.motionX=p.x;p.motionY=p.y;}
      const settle=Math.max(0,Math.min(1,(now-p.lastMotion-.9)/1.8));
      p.settled+=(settle-p.settled)*(1-Math.exp(-dt/(settle>p.settled?.8:.25)));
      const distance=Math.hypot((p.x-p.lastX)*16/9,p.y-p.lastY);
      if(distance>.045&&now-p.lastTrail>=movementTouch(p.speed).cadence){
        // One distinct step per beat, even after a delayed camera update.
        emitFootstep(emit,p.x,p.y,p.x-p.lastX,p.y-p.lastY,p.stepSide,p.confidence*crowd,p.speed);
        p.stepSide*=-1;
        p.lastX=p.x;p.lastY=p.y;p.lastTrail=now;
      }
    }
  }
  positions(){return[...this.people.values()].filter(p=>p.confidence>=.25).map(p=>({id:p.id,x:p.x,y:p.y,confidence:p.confidence,settled:p.settled,speed:p.speed}));}
}

function trackingDemo(time){
  const t=time%66;
  let x1,x2,label;
  if(t<10){x1=.08+t*.018;x2=.70-t*.04;label='Slow and brisk walking';}
  else if(t<14){x1=.26+(t-10)*.10;x2=.30;label='Picking up the pace';}
  else if(t<25){x1=.66;x2=.30;label='Settling into breathing ripples';}
  else if(t<31){x1=.66+(t-25)*.045;x2=.30-(t-25)*.045;label='Leaving the room';}
  else return {predictions:[],label:'Empty room · gradually becoming still'};
  return {label,predictions:[{class:'person',score:.98,bbox:[x1*640,.20*360,.10*640,.62*360]},{class:'person',score:.97,bbox:[x2*640,.34*360,.10*640,.42*360]}]};
}
if(typeof module!=='undefined'&&module.exports)module.exports={PersonTracker,PeopleRippleSources,emitFootstep,movementTouch,trackingDemo,FOOTSTEP_CADENCE};
