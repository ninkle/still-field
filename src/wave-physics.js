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
  step(speed=.45,damping=.28,drive=.2,driveEnabled=true){
    const w=this.width,h=this.height,a=this.current,b=this.previous,n=this.next;
    const c=.25+Math.max(0,Math.min(1,speed))*.35;
    const cx2=c*c,cy2=cx2/(this.stretch*this.stretch);
    const drag=.05+Math.max(0,Math.min(1,damping))**2*2.6;
    n.fill(0,0,w);n.fill(0,(h-1)*w);
    for(let y=1;y<h-1;y++){n[y*w]=0;n[y*w+w-1]=0;}
    // Fixed 1/60-second steps; Cx^2+Cy^2 < .42 over the whole control range.
    // Centered finite differences for h_tt + b h_t = cx^2 h_xx + cy^2 h_yy.
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const i=y*w+x,loss=(drag+this.edge[i])/120;
      n[i]=(2*a[i]-(1-loss)*b[i]+cx2*(a[i-1]+a[i+1]-2*a[i])+cy2*(a[i-w]+a[i+w]-2*a[i]))/(1+loss);
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

function encodeWaveHeights(bytes,current,rest,ambient=null,ambientStrength=0){
  for(let i=0;i<current.length;i++){
    // RG = combined evolving height, BA = measured original height, both 16-bit.
    const height=current[i]+(ambient?ambient[i]*ambientStrength:0);
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
    this.ambient.drivePeriod=4.5;
    this.ambientRemainder=0;
  }
  seed(data,speed=.58){
    this.ambient.seed(data,.22);
    this.impacts.seed(new Float32Array(data.length),speed);
    this.ambientRemainder=0;
  }
  disturb(x,y,strength,radius){this.impacts.disturb(x,y,strength,radius);}
  step(speed,damping,activity=.2){
    // People keep a responsive propagation speed. The central field advances
    // at 22% time, with a roughly 20-second breath and restrained relief.
    this.impacts.step(speed,damping,0,false);
    this.ambientRemainder+=.22;
    while(this.ambientRemainder>=1){
      this.ambient.step(.22,.18,Math.min(.35,Math.max(0,activity)));
      this.ambientRemainder-=1;
    }
  }
  encode(bytes){encodeWaveHeights(bytes,this.impacts.current,this.ambient.rest,this.ambient.current,.20);}
}
if(typeof module!=='undefined' && module.exports){module.exports=RippleField;module.exports.RippleScene=RippleScene;}
