(()=>{
  const art=window.StillField;if(!art)return;
  const {PersonTracker,trackingDemo}=window.StillFieldTracking;
  const settings=window.StillFieldSettings;
  const root=document.getElementById('still-field-art'),button=root.querySelector('[data-action="camera"]');
  const demoButton=root.querySelector('[data-action="people-demo"]');
  const panel=document.getElementById('sf-camera-panel'),video=document.getElementById('sf-camera-video');
  const preview=document.getElementById('sf-camera-overlay'),ctx=preview.getContext('2d');
  const status=document.getElementById('sf-camera-status'),mirror=document.getElementById('sf-camera-mirror'),anchor=document.getElementById('sf-camera-anchor');
  const showPreview=document.getElementById('sf-camera-preview'),tracker=new PersonTracker();
  const sample=document.createElement('canvas');sample.width=320;sample.height=180;const sampleCtx=sample.getContext('2d');
  let stream=null,detector=null,loading=null,run=0,timer=0,active=false,displayedCount=-1,previewRaf=0,loadTimer=0;
  let demo=false,demoStart=0,detectMillis=0;
  const bundled=document.getElementById('sf-camera-assets');
  function decode(base64){const binary=atob(base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
  async function model(){
    if(detector)return detector;if(loading)return loading;
    loading=(async()=>{
      const assets=JSON.parse(bundled.textContent);
      for(const key of ['tfjs','coco']){
        if(key==='tfjs'&&window.tf||key==='coco'&&window.cocoSsd)continue;
        const script=document.createElement('script');script.textContent=new TextDecoder().decode(decode(assets[key]));document.head.appendChild(script);
      }
      try{await tf.setBackend('webgl');await tf.ready();}catch(e){await tf.setBackend('cpu');await tf.ready();}
      const manifest=assets.model.weightsManifest;
      const artifacts={modelTopology:assets.model.modelTopology,weightSpecs:manifest.flatMap(group=>group.weights),weightData:decode(assets.weights).buffer,format:assets.model.format,generatedBy:assets.model.generatedBy,convertedBy:assets.model.convertedBy};
      detector=await cocoSsd.load({base:'lite_mobilenet_v2',modelUrl:tf.io.fromMemory(artifacts)});
      return detector;
    })();
    try{return await loading;}finally{loading=null;}
  }
  function resetTracks(){tracker.clear();art.clearPeople();displayedCount=-1;}
  function stop(message='Camera off'){
    run++;active=false;demo=false;clearTimeout(timer);clearTimeout(loadTimer);cancelAnimationFrame(previewRaf);
    if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;
    video.pause();video.srcObject=null;sampleCtx.clearRect(0,0,sample.width,sample.height);ctx.clearRect(0,0,preview.width,preview.height);
    resetTracks();button.textContent='Use camera';demoButton.textContent='Try tracking demo';button.disabled=false;status.textContent=message;
  }
  function report(people){
    const points=people.map(t=>({...PersonTracker.mapPoint(t.box,mirror.checked,anchor.value),id:t.id,confidence:t.confidence}));
    art.setPeople(points);
    if(points.length!==displayedCount){displayedCount=points.length;status.textContent=demo?`Demo · ${points.length} simulated people`:`Camera on · ${points.length} ${points.length===1?'person':'people'} detected`;}
  }
  function draw(){
    if(!active)return;
    previewRaf=requestAnimationFrame(draw);
    if(!showPreview.checked||panel.hidden||document.fullscreenElement||document.body?.classList.contains('sf-display'))return;
    const w=preview.width,h=preview.height,tracks=tracker.visible(performance.now()/1000);
    ctx.clearRect(0,0,w,h);
    if(!demo&&video.readyState>=2){ctx.save();if(mirror.checked){ctx.translate(w,0);ctx.scale(-1,1);}ctx.drawImage(video,0,0,w,h);ctx.restore();}
    else{ctx.fillStyle='#282d26';ctx.fillRect(0,0,w,h);ctx.fillStyle='#c7d0ba';ctx.font='14px system-ui';ctx.fillText('Simulated positions · no camera in use',16,25);}
    for(const t of tracks){
      const[x,y,bw,bh]=t.box,left=mirror.checked?1-x-bw:x;
      ctx.strokeStyle='#e2ead7';ctx.lineWidth=1.5;ctx.strokeRect(left*w,y*h,bw*w,bh*h);
      const p=PersonTracker.mapPoint(t.box,mirror.checked,anchor.value),px=p.x*w,py=(1-p.y)*h;
      ctx.fillStyle='#e2ead7';ctx.beginPath();ctx.arc(px,py,5,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(px-11,py);ctx.lineTo(px+11,py);ctx.moveTo(px,py-11);ctx.lineTo(px,py+11);ctx.stroke();
    }
  }
  async function detect(generation){
    if(!active||generation!==run)return;
    const start=performance.now();
    try{
      if(video.readyState<2){timer=setTimeout(()=>detect(generation),150);return;}
      if(document.hidden){timer=setTimeout(()=>detect(generation),350);return;}
      const aspect=video.videoWidth/video.videoHeight;
      const desiredHeight=Math.round(320/aspect);
      if(sample.height!==desiredHeight){sample.height=desiredHeight;preview.height=Math.round(640/aspect);}
      sampleCtx.drawImage(video,0,0,sample.width,sample.height);
      const boxes=await detector.detect(sample,20,.50);
      if(!active||generation!==run)return;
      detectMillis=performance.now()-start;
      tracker.maxAge=Math.max(1.2,Math.min(3,detectMillis/1000*2+.6));
      report(tracker.update(boxes,sample.width,sample.height,performance.now()/1000));
    }catch(e){if(generation===run){stop('Camera tracking stopped. Try again or use Chrome with graphics acceleration enabled.');console.error('Person detection failed:',e);}return;}
    timer=setTimeout(()=>detect(generation),Math.max(80,250-(performance.now()-start)));
  }
  async function start(){
    if(demo)stop();else if(active){stop();return;}
    if(loading){stop('Camera startup cancelled');return;}
    panel.hidden=false;button.textContent='Cancel camera';button.disabled=false;status.textContent='Starting local person detector…';
    const generation=++run;active=true;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Object.assign(new Error('Camera requires localhost'),{name:'InsecureContext'});
      await model();if(generation!==run)return;
      status.textContent='Allow the camera to start tracking people';
      const deviceId=settings?.get('cameraDevice');
      const acquired=await navigator.mediaDevices.getUserMedia({video:{...(deviceId?{deviceId:{exact:deviceId}}:{}),width:{ideal:640},height:{ideal:360},frameRate:{ideal:15,max:24},facingMode:'user'},audio:false});
      if(generation!==run){acquired.getTracks().forEach(track=>track.stop());return;}
      stream=acquired;video.srcObject=stream;await video.play();if(generation!==run)return;
      stream.getVideoTracks()[0].addEventListener('ended',()=>{if(generation===run)stop('Camera disconnected');},{once:true});
      settings?.refreshDevices();
      button.textContent='Stop camera';status.textContent='Camera on · looking for people';resetTracks();draw();detect(generation);
    }catch(e){
      if(generation!==run)return;
      const message=e.name==='NotAllowedError'?'Camera access declined. Allow it in Chrome and macOS Privacy & Security to use tracking.':e.name==='NotFoundError'||e.name==='OverconstrainedError'?'Selected camera unavailable. Choose a connected camera in Installation settings.':e.name==='InsecureContext'?'Open the player through the local launcher to use the camera.':'Camera could not start. Check camera availability and try again.';
      stop(message);console.error('Camera startup failed:',e);
    }
  }
  button.addEventListener('click',start);
  mirror.addEventListener('change',resetTracks);anchor.addEventListener('change',resetTracks);
  showPreview.addEventListener('change',()=>{preview.hidden=!showPreview.checked;if(!showPreview.checked)ctx.clearRect(0,0,preview.width,preview.height);});
  window.addEventListener('pagehide',()=>{stop();},{once:true});
  // Explicit synthetic demo: exercises person positions and ripple trails
  // without obtaining a camera stream or pretending to have detected people.
  demoButton.addEventListener('click',()=>{
    if(demo){stop('Demo stopped');return;}if(active)stop();
    active=true;demo=true;demoStart=performance.now()/1000;panel.hidden=false;preview.hidden=!showPreview.checked;button.textContent='Use camera';demoButton.textContent='Stop tracking demo';
    const generation=++run;
    function stepDemo(){
      if(generation!==run||!active)return;const now=performance.now()/1000,t=now-demoStart;
      const sample=trackingDemo(t);
      report(tracker.update(sample.predictions,640,360,now));
      status.textContent=`Demo · ${sample.label}`;timer=setTimeout(stepDemo,100);
    }
    stepDemo();draw();
  });
  // Read-only state and an explicit fixture path support camera-free QA.
  window.StillFieldCamera={getState:()=>({active,demo,people:tracker.visible(performance.now()/1000).length,detectMillis}),async checkDetector(image){return(await model()).detect(image,20,.5);}};
  // The first launch stays camera-free. Automatic capture is an explicit saved choice.
  if(settings?.get('autoCamera'))start();
})();
