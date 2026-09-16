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
const FOOTSTEP_STRENGTH=1.5;
function emitFootstep(emit,x,y,dx,dy,side,confidence=1){
  // Place alternating impacts across the direction of travel in screen space.
  // Walk past and camera tracking share these stronger, distinct steps.
  const aspect=16/9,length=Math.hypot(dx*aspect,dy),offset=.012*side;
  const nx=length>0?-dy/length:0,ny=length>0?dx*aspect/length:1;
  emit(Math.max(.015,Math.min(.985,x+nx*offset/aspect)),Math.max(.015,Math.min(.985,y+ny*offset)),FOOTSTEP_STRENGTH*confidence);
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
      if(!p){p={id,x,y,targetX:x,targetY:y,lastX:x,lastY:y,nextPulse:0,lastTrail:-1,stepSide:1,seen:now,confidence:1};this.people.set(id,p);}
      p.targetX=x;p.targetY=y;p.seen=now;p.confidence=Number.isFinite(person.confidence)?Math.max(0,Math.min(1,person.confidence)):1;
    }
    for(const[id,p]of this.people)if(!seen.has(id))p.confidence=0;
  }
  tick(dt,now,emit,enabled=true){
    this.now=now;
    for(const[id,p]of this.people){
      if(now-p.seen>1.8){this.people.delete(id);continue;}
      const alpha=1-Math.exp(-dt/.15);
      p.x+=(p.targetX-p.x)*alpha;p.y+=(p.targetY-p.y)*alpha;
      if(!enabled||p.confidence<.25){p.lastX=p.x;p.lastY=p.y;p.nextPulse=now+.4;continue;}
      const distance=Math.hypot((p.x-p.lastX)*16/9,p.y-p.lastY);
      if(distance>.045&&now-p.lastTrail>=FOOTSTEP_CADENCE){
        // One distinct step per beat, even after a delayed camera update.
        emitFootstep(emit,p.x,p.y,p.x-p.lastX,p.y-p.lastY,p.stepSide,p.confidence);
        p.stepSide*=-1;
        p.lastX=p.x;p.lastY=p.y;p.lastTrail=now;p.nextPulse=now+1.7;
      }else if(now>=p.nextPulse){
        emit(p.x,p.y,.90*p.confidence);p.lastX=p.x;p.lastY=p.y;p.nextPulse=now+2.3;
      }
    }
  }
  positions(){return[...this.people.values()].filter(p=>p.confidence>=.25).map(p=>({id:p.id,x:p.x,y:p.y}));}
}
if(typeof module!=='undefined'&&module.exports)module.exports={PersonTracker,PeopleRippleSources,emitFootstep,FOOTSTEP_CADENCE,FOOTSTEP_STRENGTH};
