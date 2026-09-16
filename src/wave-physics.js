class RippleField {
  constructor(width=384,height=216,stretch=2.7) {
    this.width=width;this.height=height;this.stretch=stretch;
    this.current=new Float32Array(width*height);
    this.previous=new Float32Array(width*height);
    this.next=new Float32Array(width*height);
    this.rest=new Float32Array(width*height);
    this.edge=new Float32Array(width*height);
    this.sourceWeights=[];
    this.center=[.513333,.431953];this.time=0;this.drivePeriod=3.4;
    this.viscosity=0;this.minimumDrag=.05;
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
      const edge=Math.max(0,1-Math.min(x,y,width-1-x,height-1-y)/16);
      this.edge[y*width+x]=edge*edge*6;
      const dx=x-this.center[0]*(width-1),dy=(y-this.center[1]*(height-1))*stretch;
      const r2=(dx*dx+dy*dy)/64;
      if(r2<12)this.sourceWeights.push([y*width+x,Math.exp(-r2)]);
    }
  }
  sample(data,x,y){
    x=Math.max(0,Math.min(this.width-1.001,x));y=Math.max(0,Math.min(this.height-1.001,y));
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,i=iy*this.width+ix;
    return (data[i]*(1-fx)+data[i+1]*fx)*(1-fy)+(data[i+this.width]*(1-fx)+data[i+this.width+1]*fx)*fy;
  }
  seed(data,speed=.45){
    this.current.set(data);this.rest.set(data);
    const cx=this.center[0]*(this.width-1),cy=this.center[1]*(this.height-1),c=.25+speed*.35;
    // Seed an outward velocity from the measured rings, rather than starting
    // every ring at rest and splitting it into equal inward/outward waves.
    for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){
      const dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy*this.stretch);
      this.previous[y*this.width+x]=r>2?this.sample(data,x+dx/r*c,y+dy/r*c):data[y*this.width+x];
    }
  }
  disturb(u,v,strength=.7,radius=7){
    if(!Number.isFinite(u)||!Number.isFinite(v)||!Number.isFinite(strength))return;
    const cx=Math.max(.01,Math.min(.99,u))*(this.width-1),cy=Math.max(.01,Math.min(.99,v))*(this.height-1);
    const amp=Math.max(-2,Math.min(2,strength)),r=Math.max(3,Math.min(24,radius));
    for(let y=Math.max(1,Math.floor(cy-r*3/this.stretch));y<Math.min(this.height-1,cy+r*3/this.stretch);y++){
      for(let x=Math.max(1,Math.floor(cx-r*3));x<Math.min(this.width-1,cx+r*3);x++){
        const d=((x-cx)**2+((y-cy)*this.stretch)**2)/(r*r),pulse=amp*(1-d)*Math.exp(-d);
        const i=y*this.width+x;
        // A zero-net-volume displacement gives a crest and trough together.
        this.current[i]+=pulse;this.previous[i]+=pulse;
      }
    }
  }
  landing(u,v,strength=2.8,radius=20){
    if(![u,v,strength,radius].every(Number.isFinite))return;
    const cx=Math.max(.01,Math.min(.99,u))*(this.width-1),cy=Math.max(.01,Math.min(.99,v))*(this.height-1);
    const amp=Math.max(0,Math.min(3,strength)),r=Math.max(18,Math.min(22,radius)),extent=r*3;
    // A large compression and a separate crown distinguish a two-foot landing
    // from the small alternating footsteps. Both evolve in the shared solver.
    for(let y=Math.max(1,Math.floor(cy-extent/this.stretch));y<Math.min(this.height-1,cy+extent/this.stretch);y++){
      for(let x=Math.max(1,Math.floor(cx-extent));x<Math.min(this.width-1,cx+extent);x++){
        const distance=Math.hypot(x-cx,(y-cy)*this.stretch),d=(distance/r)**2,band=((distance-r*1.6)/(r*.24))**2;
        const pulse=amp*((1-d)*Math.exp(-d)+.55*(1-2*band)*Math.exp(-band)),i=y*this.width+x;
        this.current[i]+=pulse;this.previous[i]+=pulse;
      }
    }
  }
  step(speed=.45,damping=.28,drive=.2,driveEnabled=true){
    const w=this.width,h=this.height,a=this.current,b=this.previous,n=this.next;
    const c=.25+Math.max(0,Math.min(1,speed))*.35;
    const cx2=c*c,cy2=cx2/(this.stretch*this.stretch);
    const drag=this.minimumDrag+Math.max(0,Math.min(1,damping))**2*2.6;
    const viscosity=Math.max(0,Math.min(.18,this.viscosity)),vertical=1/(this.stretch*this.stretch);
    n.fill(0,0,w);n.fill(0,(h-1)*w);
    for(let y=1;y<h-1;y++){n[y*w]=0;n[y*w+w-1]=0;}
    // Fixed 1/60-second steps; Cx^2+Cy^2 < .42 over the whole control range.
    // Centered finite differences for h_tt + b h_t = cx^2 h_xx + cy^2 h_yy.
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const i=y*w+x,loss=(drag+this.edge[i])/120;
      const lapX=a[i-1]+a[i+1]-2*a[i],lapY=a[i-w]+a[i+w]-2*a[i];
      // Viscosity removes short wavelengths first: a crisp foot impression
      // expands into a softer ring and leaves a broad, slowly fading swell.
      const soften=viscosity?viscosity*(lapX-(b[i-1]+b[i+1]-2*b[i])+(lapY-(b[i-w]+b[i+w]-2*b[i]))*vertical):0;
      n[i]=(2*a[i]-(1-loss)*b[i]+cx2*lapX+cy2*lapY+soften)/(1+loss);
    }
    this.time+=1/60;
    const force=driveEnabled?Math.sin(this.time*2*Math.PI/this.drivePeriod)*(.0018+.004*drive):0;
    for(const [i,weight] of this.sourceWeights)n[i]+=force*weight;
    this.previous=a;this.current=n;this.next=b;
  }
  encode(bytes){
    encodeWaveHeights(bytes,this.current,this.rest);
  }
}

function encodeWaveHeights(bytes,current,rest,ambient=null,ambientStrength=0,breathing=null){
  for(let i=0;i<current.length;i++){
    // RG = combined evolving height, BA = measured original height, both 16-bit.
    const height=current[i]+(ambient?ambient[i]*ambientStrength:0)+(breathing?breathing[i]:0);
    const live=Math.round((Math.max(-4,Math.min(4,height))/8+.5)*65535);
    const original=Math.round((rest[i]/8+.5)*65535);
    bytes[i*4]=live>>8;bytes[i*4+1]=live&255;bytes[i*4+2]=original>>8;bytes[i*4+3]=original&255;
  }
}

class RippleScene {
  constructor(width=384,height=216,stretch=2.7){
    this.width=width;this.height=height;
    this.ambient=new RippleField(width,height,stretch);
    this.impacts=new RippleField(width,height,stretch);
    this.impacts.viscosity=.18;this.impacts.minimumDrag=.24;
    this.ambient.drivePeriod=4.5;
    this.ambientRemainder=0;
    this.people=[];this.roomObserved=false;this.roomLevel=1;this.quietSeconds=0;
    this.breaths=new Map();this.breathing=new Float32Array(width*height);
  }
  seed(data,speed=.58){
    this.ambient.seed(data,.22);
    this.impacts.seed(new Float32Array(data.length),speed);
    this.ambientRemainder=0;
  }
  disturb(x,y,strength,radius){this.impacts.disturb(x,y,strength,radius);}
  landing(x,y,strength,radius){this.impacts.landing(x,y,strength,radius);}
  setPeople(people,observed=false){
    this.people=people.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.confidence>=.25).slice(0,8);
    this.roomObserved=observed;
  }
  updatePresence(){
    const dt=1/60,occupied=this.people.length>0;
    this.quietSeconds=this.roomObserved&&!occupied?this.quietSeconds+dt:0;
    const level=this.quietSeconds>5?.025:1;
    this.roomLevel+=(level-this.roomLevel)*(1-Math.exp(-dt/(level<this.roomLevel?10:3)));
    for(const b of this.breaths.values())b.target=0;
    const crowd=1/Math.sqrt(Math.max(1,this.people.length));
    for(const p of this.people){
      const id=String(p.id);let b=this.breaths.get(id);
      if(!b){
        if(this.breaths.size>=24)this.breaths.delete(this.breaths.keys().next().value);
        const phase=[...id].reduce((sum,c)=>sum+c.charCodeAt(0),0)*.8;
        b={x:p.x,y:p.y,phase,amplitude:0,target:0};this.breaths.set(id,b);
      }
      b.x+=(p.x-b.x)*(1-Math.exp(-dt/.3));b.y+=(p.y-b.y)*(1-Math.exp(-dt/.3));
      b.target=.45*Math.max(0,Math.min(1,p.settled||0))*Math.min(1,p.confidence)*crowd;
    }
    for(const[id,b]of this.breaths){
      b.amplitude+=(b.target-b.amplitude)*(1-Math.exp(-dt/(b.target>b.amplitude?1.3:1.8)));
      b.phase+=dt*2*Math.PI/9;
      if(!b.target&&b.amplitude<.0001)this.breaths.delete(id);
    }
  }
  step(speed,damping,activity=.2){
    // People keep a responsive propagation speed. The central field advances
    // at 22% time, with a roughly 20-second breath and restrained relief.
    this.updatePresence();
    this.impacts.step(speed,damping,0,false);
    this.ambientRemainder+=.22*(.12+.88*this.roomLevel);
    while(this.ambientRemainder>=1){
      this.ambient.step(.22,.18,Math.min(.35,Math.max(0,activity)));
      this.ambientRemainder-=1;
    }
  }
  encode(bytes){
    this.breathing.fill(0);
    const w=this.width,h=this.height,stretch=this.ambient.stretch;
    for(const b of this.breaths.values()){
      const breath=.55+.45*Math.sin(b.phase),radius=17+2*Math.sin(b.phase),amp=b.amplitude*breath;
      const cx=b.x*(w-1),cy=b.y*(h-1);
      for(let y=Math.max(1,Math.floor(cy-radius*3/stretch));y<Math.min(h-1,cy+radius*3/stretch);y++){
        for(let x=Math.max(1,Math.floor(cx-radius*3));x<Math.min(w-1,cx+radius*3);x++){
          const d=((x-cx)**2+((y-cy)*stretch)**2)/(radius*radius);
          this.breathing[y*w+x]+=amp*(1-d)*Math.exp(-d);
        }
      }
    }
    encodeWaveHeights(bytes,this.impacts.current,this.ambient.rest,this.ambient.current,.20*(.05+.95*this.roomLevel),this.breathing);
  }
}
if(typeof module!=='undefined' && module.exports){module.exports=RippleField;module.exports.RippleScene=RippleScene;}
