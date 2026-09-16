// Full-body box motion is an approximation of jumping, not a pose/foot-contact
// measurement. Favor missing an ambiguous jump over firing a spurious impact.
const JumpPersonTracker=typeof module!=='undefined'&&module.exports?require('./person-tracking.js').PersonTracker:PersonTracker;
class JumpDetector {
  constructor(){this.states=new Map();}
  clear(){this.states.clear();}
  get(id){return this.states.get(String(id));}
  update(tracks,now,enabled=true){
    if(!enabled){this.clear();return [];}
    const events=[],seen=new Set();
    for(const t of tracks.slice(0,8)){
      const id=String(t.id),box=t.raw||t.box;
      const valid=box?.length===4&&box.every(Number.isFinite)&&t.confidence>=.7&&t.score>=.6&&now-t.seen<.06;
      const full=valid&&box[0]>.005&&box[0]+box[2]<.995&&box[1]>.015&&box[1]+box[3]<.985&&box[3]>.18;
      const crowded=full&&tracks.some(other=>other.id!==t.id&&JumpPersonTracker.overlap(box,other.raw||other.box)>.4);
      if(!full||crowded){this.states.delete(id);continue;}
      seen.add(id);
      let s=this.states.get(id);
      if(!s){s={base:box.slice(),last:box.slice(),time:now,stable:0,phase:'calibrating',blocking:false,cooldown:0};this.states.set(id,s);continue;}
      const dt=now-s.time;if(dt<=0)continue;
      if(dt>.35){this.states.delete(id);continue;}
      const bottom=b=>b[1]+b[3],center=b=>b[0]+b[2]/2;
      const lift=(bottom(s.base)-bottom(box))/s.base[3],head=(s.base[1]-box[1])/s.base[3];
      const rise=(bottom(s.last)-bottom(box))/s.base[3]/dt;
      const drift=Math.abs(center(box)-center(s.base))/s.base[3];
      const ratio=box[3]/s.base[3],coherent=ratio>.78&&ratio<1.22&&Math.abs(lift-head)<.12;
      const stable=Math.abs(bottom(box)-bottom(s.last))/s.base[3]<.018&&Math.abs(center(box)-center(s.last))/s.base[3]<.035;
      s.time=now;s.last=box.slice();
      if(s.phase==='calibrating'){
        s.stable=stable?s.stable+dt:0;s.base=box.slice();
        if(s.stable>=.65)s.phase='grounded';
        continue;
      }
      if(s.phase==='cooldown'){
        s.blocking=now<s.cooldown;
        if(s.blocking)continue;
        s.phase='grounded';
      }
      if(s.phase==='grounded'){
        if(coherent&&drift<.10&&Math.min(lift,head)>.035&&rise>.14){
          s.phase='rising';s.blocking=true;s.started=now;s.peak=lift;s.samples=1;s.falling=false;
        }else{
          // Follow slow changes of depth/stance, but freeze the ground reference
          // as a possible takeoff begins. Arms alone cannot lift the foot edge.
          if(lift<.02||Math.abs(rise)<.10||!coherent||drift>=.10){const blend=1-Math.exp(-dt/.3);s.base=s.base.map((v,i)=>v+(box[i]-v)*blend);}
        }
        continue;
      }
      // After a confirmed flight, allow bent knees at landing. Crouching from
      // rest still cannot enter the airborne state because the feet never rise.
      const landingShape=s.phase==='airborne'&&ratio>.60&&ratio<1.30&&lift<.035;
      if((!coherent&&!landingShape)||drift>.14||now-s.started>1.3){this.states.delete(id);continue;}
      s.peak=Math.max(s.peak,lift);if(Math.min(lift,head)>.03)s.samples++;
      if(rise<-.10&&lift<s.peak-.012)s.falling=true;
      if(s.phase==='rising'&&s.samples>=2&&s.peak>.055&&now-s.started>=.055){
        s.phase='airborne';events.push({id,kind:'takeoff',box:s.base.slice(),strength:.28,radius:8});
      }
      if(s.phase==='airborne'&&s.falling&&lift<.025&&now-s.started>=.16){
        const weight=Math.max(0,Math.min(1,(s.peak-.055)/.12));
        events.push({id,kind:'landing',box:s.base.slice(),strength:1.9+.3*weight,radius:12+4*weight});
        s.phase='cooldown';s.cooldown=now+.18;s.blocking=true;
      }else if(s.phase==='rising'&&lift<.015){this.states.delete(id);}
    }
    for(const id of this.states.keys())if(!seen.has(id))this.states.delete(id);
    return events;
  }
}

function jumpingDemo(time){
  const t=time%14;let lift=0;
  for(const[start,duration,height]of [[2,.7,.065],[4,.65,.085],[6.2,.72,.10]]){
    const phase=(t-start)/duration;if(phase>0&&phase<1)lift=height*Math.sin(phase*Math.PI);
  }
  return {label:t<2?'Stand briefly to establish the ground':t<7?'Jumping in place · one ripple per landing':'Landing ripples soften and settle',
    predictions:[{class:'person',score:.98,bbox:[.43*640,(.20-lift)*360,.14*640,.62*360]}]};
}
if(typeof module!=='undefined'&&module.exports)module.exports={JumpDetector,jumpingDemo};
