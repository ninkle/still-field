// Full-body box motion is an approximation of jumping, not a pose/foot-contact
// measurement. Require a rise and return, while tolerating normal box wobble.
const JumpPersonTracker=typeof module!=='undefined'&&module.exports?require('./person-tracking.js').PersonTracker:PersonTracker;
function detectionProfile(sensitivity='sensitive'){
  return sensitivity==='standard'?{score:.50,lift:.045,start:.028,height:.16}:{score:.38,lift:.030,start:.018,height:.11};
}
class JumpDetector {
  constructor(){this.states=new Map();this.feedback='Stand briefly with your head and feet visible';}
  clear(){this.states.clear();this.feedback='Stand briefly with your head and feet visible';}
  get(id){return this.states.get(String(id));}
  update(tracks,now,enabled=true,sensitivity='sensitive'){
    if(!enabled){this.clear();return [];}
    const events=[],seen=new Set(),profile=detectionProfile(sensitivity);let eligible=0,cropped=0,crowdedCount=0;
    for(const t of tracks.slice(0,8)){
      const id=String(t.id),box=t.raw||t.box;
      // A tracker may retain a predicted person for a missed sample. Do not
      // treat that old box as another airborne sample or erase a short flight.
      if(now-t.seen>.06){if(this.states.has(id)&&now-this.states.get(id).time<=.45)seen.add(id);continue;}
      const valid=box?.length===4&&box.every(Number.isFinite)&&t.confidence>=.5&&t.score>=profile.score;
      const full=valid&&box[0]>.002&&box[0]+box[2]<.998&&box[1]>.006&&box[1]+box[3]<.995&&box[3]>profile.height;
      const crowded=full&&tracks.some(other=>other.id!==t.id&&JumpPersonTracker.overlap(box,other.raw||other.box)>.4);
      if(!full||crowded){if(valid&&!full)cropped++;if(crowded)crowdedCount++;this.states.delete(id);continue;}
      seen.add(id);eligible++;
      let s=this.states.get(id);
      if(!s){s={base:box.slice(),last:box.slice(),time:now,stable:0,phase:'calibrating',blocking:false,cooldown:0};this.states.set(id,s);continue;}
      const dt=now-s.time;if(dt<=0)continue;
      if(dt>.45){this.states.delete(id);continue;}
      const bottom=b=>b[1]+b[3],center=b=>b[0]+b[2]/2;
      const lift=(bottom(s.base)-bottom(box))/s.base[3],head=(s.base[1]-box[1])/s.base[3];
      const rise=(bottom(s.last)-bottom(box))/s.base[3]/dt;
      const drift=Math.abs(center(box)-center(s.base))/s.base[3];
      const ratio=box[3]/s.base[3],coherent=ratio>.65&&ratio<1.45&&Math.abs(lift-head)<.32;
      const stable=Math.abs(bottom(box)-bottom(s.last))/s.base[3]<.045&&Math.abs(center(box)-center(s.last))/s.base[3]<.05;
      const minimumLift=Math.max(profile.lift,.006/s.base[3]);
      s.time=now;s.last=box.slice();
      if(s.phase==='calibrating'){
        s.stable=stable?s.stable+dt:0;s.base=box.slice();
        if(s.stable>=.4)s.phase='grounded';
        continue;
      }
      if(s.phase==='cooldown'){
        s.blocking=now<s.cooldown;
        if(s.blocking)continue;
        s.phase='grounded';
      }
      if(s.phase==='grounded'){
        if(coherent&&drift<.13&&lift>profile.start&&head>.008&&rise>.09){
          s.phase='rising';s.blocking=true;s.started=now;s.peak=lift;s.samples=1;s.falling=false;
        }else{
          // Follow slow changes of depth/stance, but freeze the ground reference
          // as a possible takeoff begins. Arms alone cannot lift the foot edge.
          if(lift<profile.start*.65||Math.abs(rise)<.07||!coherent||drift>=.13){const blend=1-Math.exp(-dt/.4);s.base=s.base.map((v,i)=>v+(box[i]-v)*blend);}
        }
        continue;
      }
      // After a confirmed flight, allow bent knees at landing. Crouching from
      // rest still cannot enter the airborne state because the feet never rise.
      const landingShape=s.phase==='airborne'&&ratio>.55&&ratio<1.45&&lift<.05;
      if((!coherent&&!landingShape)||drift>.20||now-s.started>1.5){this.states.delete(id);continue;}
      s.peak=Math.max(s.peak,lift);if(lift>profile.start*.8&&head>.005)s.samples++;
      if(rise<-.07&&lift<s.peak-.008)s.falling=true;
      if(s.phase==='rising'&&s.samples>=2&&s.peak>minimumLift&&now-s.started>=.05){
        s.phase='airborne';events.push({id,kind:'takeoff',box:s.base.slice(),strength:.28,radius:8});
      }
      if(s.phase==='airborne'&&s.falling&&lift<Math.min(.04,s.peak*.55)&&now-s.started>=.14){
        const weight=Math.max(0,Math.min(1,(s.peak-minimumLift)/.12));
        events.push({id,kind:'landing',box:s.base.slice(),strength:2.5+.5*weight,radius:18+4*weight});
        s.phase='cooldown';s.cooldown=now+.18;s.blocking=true;
      }else if(s.phase==='rising'&&lift<profile.start*.5){this.states.delete(id);}
    }
    for(const[id,s]of this.states)if(!seen.has(id)&&now-s.time>.45)this.states.delete(id);
    const states=[...this.states.values()];
    this.feedback=events.some(e=>e.kind==='landing')?'Landing detected':states.some(s=>s.phase==='airborne')?'Airborne · waiting for landing':states.some(s=>s.phase==='grounded'||s.phase==='cooldown')?'Ready for a jump':eligible?'Stand briefly to set the ground':crowdedCount?'Separate overlapping people for jumps':cropped?'Keep your head and feet inside the camera view':'Looking for a full-body view';
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
if(typeof module!=='undefined'&&module.exports)module.exports={JumpDetector,jumpingDemo,detectionProfile};
