(()=>{
  const art=window.StillField;if(!art)return;
  const {PersonTracker,trackingDemo,JumpDetector,jumpingDemo}=window.StillFieldTracking;
  const settings=window.StillFieldSettings;
  const root=document.getElementById('still-field-art'),button=root.querySelector('[data-action="camera"]');
  const demoButton=root.querySelector('[data-action="people-demo"]');
  const jumpDemoButton=root.querySelector('[data-action="jump-demo"]');
  const panel=document.getElementById('sf-camera-panel'),video=document.getElementById('sf-camera-video');
  const preview=document.getElementById('sf-camera-overlay'),ctx=preview.getContext('2d');
  const status=document.getElementById('sf-camera-status'),mirror=document.getElementById('sf-camera-mirror'),anchor=document.getElementById('sf-camera-anchor');
  const showPreview=document.getElementById('sf-camera-preview'),jumpToggle=document.getElementById('sf-camera-jumps'),tracker=new PersonTracker(),jumps=new JumpDetector();
  const sample=document.createElement('canvas');sample.width=320;sample.height=180;const sampleCtx=sample.getContext('2d');
  let stream=null,detector=null,loading=null,run=0,timer=0,active=false,displayedCount=-1,previewRaf=0,loadTimer=0;
  let healthTimer=0,retryTimer=0,recoveries=0,cameraDevice='',inference=null;
  let frameToken=null,frameSerial=0,consumedFrame=0,lastFrameAt=0,healthySince=0,stale=true,observationEpoch=0;
  let demo=false,demoKind='tracking',demoStart=0,detectMillis=0;
  const jumpsEnabled=()=>jumpToggle.checked&&anchor.value==='feet';
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
  function resetTracks(){tracker.clear();jumps.clear();art.clearPeople();displayedCount=-1;}
  function stop(message='Camera off'){
    run++;active=false;demo=false;clearTimeout(timer);clearTimeout(loadTimer);clearTimeout(healthTimer);clearTimeout(retryTimer);cancelAnimationFrame(previewRaf);
    if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;
    video.pause();video.srcObject=null;sampleCtx.clearRect(0,0,sample.width,sample.height);ctx.clearRect(0,0,preview.width,preview.height);
    resetTracks();button.textContent='Use camera';demoButton.textContent='Try tracking demo';jumpDemoButton.textContent='Try jump demo';button.disabled=false;status.textContent=message;
  }
  function frameCounter(){
    // Count decoded frames, not changes in pixels: a still person is valid input.
    // currentTime is a fallback for browsers without decoded-frame counters.
    const count=video.getVideoPlaybackQuality?.().totalVideoFrames;
    return Number.isFinite(count)?count:Number.isFinite(video.webkitDecodedFrameCount)?video.webkitDecodedFrameCount:video.currentTime;
  }
  function pollFrame(){
    const track=stream?.getVideoTracks()[0],token=frameCounter();
    if(!track||track.muted||track.readyState==='ended'||video.readyState<2||!video.videoWidth||!video.videoHeight)return;
    if(Number.isFinite(token)&&token!==frameToken){
      frameToken=token;frameSerial++;lastFrameAt=performance.now();
      if(stale){stale=false;displayedCount=-1;status.textContent='Camera on · looking for people';}
      if(!healthySince)healthySince=lastFrameAt;
    }
  }
  function discardStale(message){
    observationEpoch++;
    if(!stale){stale=true;resetTracks();ctx.clearRect(0,0,preview.width,preview.height);}
    healthySince=0;status.textContent=message;
  }
  function recover(message){
    if(!active||demo)return;
    const attempt=recoveries+1;
    stop();recoveries=attempt;
    if(attempt>3){status.textContent='Camera could not recover. Check the USB connection, then click Use camera.';return;}
    active=true;button.textContent='Cancel camera';status.textContent=`${message} · reconnecting (${attempt}/3)…`;
    const generation=run;
    retryTimer=setTimeout(()=>{if(active&&generation===run)openCamera(generation);},attempt*1000);
  }
  function watchCamera(generation){
    if(!active||demo||generation!==run)return;
    const now=performance.now();
    if(!document.hidden){
      pollFrame();
      // A pending inference cannot safely be cancelled/restarted on the same
      // model. Stop cleanly rather than piling up GPU jobs or retaining tracks.
      if(inference&&now-inference.started>10000){stop('Tracking stopped responding. Reload the player to restart the detector.');return;}
      if(now-lastFrameAt>2000)discardStale('Camera paused · waiting for fresh frames…');
      if(now-lastFrameAt>5000){recover('Camera stalled');return;}
      if(healthySince&&now-healthySince>30000)recoveries=0;
    }
    healthTimer=setTimeout(()=>watchCamera(generation),500);
  }
  function report(people){
    const events=jumps.update(people,performance.now()/1000,jumpsEnabled());
    const points=people.map(t=>{
      const jump=jumps.get(t.id),blocking=jump?.blocking===true;
      return {...PersonTracker.mapPoint(blocking?jump.base:t.box,mirror.checked,anchor.value),id:t.id,confidence:t.confidence,jumping:blocking};
    });
    art.setPeople(points);
    const crowd=1/Math.sqrt(Math.max(1,points.length));
    for(const event of events){
      const point=PersonTracker.mapPoint(event.box,mirror.checked,'feet');
      art.jumpImpact(point.x,point.y,event.strength*crowd,{kind:event.kind,radius:event.radius});
    }
    if(points.length!==displayedCount){displayedCount=points.length;status.textContent=demo?`Demo · ${points.length} simulated people`:`Camera on · ${points.length} ${points.length===1?'person':'people'} detected`;}
  }
  function draw(){
    if(!active)return;
    previewRaf=requestAnimationFrame(draw);
    if(!showPreview.checked||panel.hidden||document.fullscreenElement||document.body?.classList.contains('sf-display'))return;
    const w=preview.width,h=preview.height,tracks=tracker.visible(performance.now()/1000);
    ctx.clearRect(0,0,w,h);
    if(!demo&&!stale&&video.readyState>=2){ctx.save();if(mirror.checked){ctx.translate(w,0);ctx.scale(-1,1);}ctx.drawImage(video,0,0,w,h);ctx.restore();}
    else{ctx.fillStyle='#282d26';ctx.fillRect(0,0,w,h);ctx.fillStyle='#c7d0ba';ctx.font='14px system-ui';ctx.fillText(demo?'Simulated positions · no camera in use':'Waiting for fresh camera frames…',16,25);}
    for(const t of tracks){
      const[x,y,bw,bh]=t.box,left=mirror.checked?1-x-bw:x;
      ctx.strokeStyle='#e2ead7';ctx.lineWidth=1.5;ctx.strokeRect(left*w,y*h,bw*w,bh*h);
      const jump=jumps.get(t.id),p=PersonTracker.mapPoint(jump?.blocking?jump.base:t.box,mirror.checked,anchor.value),px=p.x*w,py=(1-p.y)*h;
      ctx.fillStyle='#e2ead7';ctx.beginPath();ctx.arc(px,py,5,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(px-11,py);ctx.lineTo(px+11,py);ctx.moveTo(px,py-11);ctx.lineTo(px,py+11);ctx.stroke();
    }
  }
  async function detect(generation){
    if(!active||generation!==run)return;
    const start=performance.now();
    try{
      if(document.hidden){timer=setTimeout(()=>detect(generation),350);return;}
      pollFrame();
      if(stale||frameSerial===consumedFrame||inference){timer=setTimeout(()=>detect(generation),80);return;}
      consumedFrame=frameSerial;
      const aspect=video.videoWidth/video.videoHeight;
      const desiredHeight=Math.round(320/aspect);
      if(sample.height!==desiredHeight){sample.height=desiredHeight;preview.height=Math.round(640/aspect);}
      sampleCtx.drawImage(video,0,0,sample.width,sample.height);
      const job={started:start,epoch:observationEpoch};inference=job;
      let boxes;
      try{boxes=await detector.detect(sample,20,.50);}finally{if(inference===job)inference=null;}
      if(!active||generation!==run)return;
      detectMillis=performance.now()-start;
      // A slow result or a frame captured before a hide/mute is no longer a
      // reliable observation of where somebody is standing now.
      if(!document.hidden&&!stale&&job.epoch===observationEpoch&&detectMillis<1500&&performance.now()-lastFrameAt<2000){
        tracker.maxAge=Math.max(1.2,Math.min(3,detectMillis/1000*2+.6));
        report(tracker.update(boxes,sample.width,sample.height,performance.now()/1000));
      }else if(!document.hidden)discardStale('Tracking is catching up · waiting for a fresh result…');
    }catch(e){if(generation===run){stop('Camera tracking stopped. Try again or use Chrome with graphics acceleration enabled.');console.error('Person detection failed:',e);}return;}
    timer=setTimeout(()=>detect(generation),Math.max(30,(jumpsEnabled()?100:250)-(performance.now()-start)));
  }
  async function start(){
    if(demo)stop();else if(active){stop();return;}
    if(loading){stop('Camera startup cancelled');return;}
    panel.hidden=false;button.textContent='Cancel camera';button.disabled=false;status.textContent='Starting local person detector…';
    const generation=++run;active=true;recoveries=0;cameraDevice=settings?.get('cameraDevice')||'';
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Object.assign(new Error('Camera requires localhost'),{name:'InsecureContext'});
      await model();if(generation!==run)return;
      await openCamera(generation);
    }catch(e){if(generation===run)startupError(e);}
  }
  function startupError(e){
    const message=e.name==='NotAllowedError'?'Camera access declined. Allow it in Chrome and macOS Privacy & Security to use tracking.':e.name==='NotFoundError'||e.name==='OverconstrainedError'?'Selected camera unavailable. Choose a connected camera in Installation settings.':e.name==='InsecureContext'?'Open the player through the local launcher to use the camera.':'Camera could not start. Check camera availability and try again.';
    stop(message);console.error('Camera startup failed:',e);
  }
  async function openCamera(generation){
    try{
      if(!recoveries)status.textContent='Allow the camera to start tracking people';
      // Do not time out the initial permission prompt. A recovery request is
      // already authorized; release a late stream if it outlives its attempt.
      if(recoveries)loadTimer=setTimeout(()=>{if(generation===run)recover('Camera did not reconnect');},15000);
      const acquired=await navigator.mediaDevices.getUserMedia({video:{...(cameraDevice?{deviceId:{exact:cameraDevice}}:{}),width:{ideal:640},height:{ideal:360},frameRate:{ideal:24,max:30},facingMode:'user'},audio:false});
      if(generation!==run){acquired.getTracks().forEach(track=>track.stop());return;}
      clearTimeout(loadTimer);stream=acquired;
      const track=stream.getVideoTracks()[0];
      if(!track)throw new Error('Camera returned no video track');
      cameraDevice=track.getSettings?.().deviceId||cameraDevice;
      track.addEventListener('ended',()=>{if(generation===run)recover('Camera disconnected');},{once:true});
      track.addEventListener('mute',()=>{if(generation===run)discardStale('Camera paused · waiting for fresh frames…');});
      video.srcObject=stream;frameToken=frameCounter();frameSerial=0;consumedFrame=0;stale=true;healthySince=0;
      loadTimer=setTimeout(()=>{if(generation===run)recover('Camera playback did not start');},10000);
      await video.play();if(generation!==run)return;
      clearTimeout(loadTimer);lastFrameAt=performance.now();
      settings?.refreshDevices();
      button.textContent='Stop camera';status.textContent='Camera on · waiting for fresh frames';resetTracks();draw();watchCamera(generation);detect(generation);
    }catch(e){
      if(generation!==run)return;
      if(recoveries&&e.name!=='NotAllowedError')recover('Camera unavailable');else startupError(e);
    }
  }
  button.addEventListener('click',start);
  mirror.addEventListener('change',resetTracks);
  anchor.addEventListener('change',()=>{jumpToggle.disabled=anchor.value!=='feet';resetTracks();});
  jumpToggle.addEventListener('change',resetTracks);
  jumpToggle.disabled=anchor.value!=='feet';
  showPreview.addEventListener('change',()=>{preview.hidden=!showPreview.checked;if(!showPreview.checked)ctx.clearRect(0,0,preview.width,preview.height);});
  window.addEventListener('pagehide',()=>{stop();},{once:true});
  document.addEventListener('visibilitychange',()=>{
    if(!active||demo)return;
    discardStale(document.hidden?'Camera tracking paused while the player is hidden':'Camera resuming · waiting for fresh frames…');
    // Ignore time spent in a background tab or asleep. Require a new frame on
    // return, allowing five seconds for normal camera playback to resume.
    lastFrameAt=performance.now();frameToken=frameCounter();consumedFrame=frameSerial;
  });
  // Explicit synthetic demo: exercises person positions and ripple trails
  // without obtaining a camera stream or pretending to have detected people.
  function startDemo(kind){
    if(demo&&demoKind===kind){stop('Demo stopped');return;}if(active)stop();
    active=true;demo=true;demoKind=kind;demoStart=performance.now()/1000;panel.hidden=false;preview.hidden=!showPreview.checked;button.textContent='Use camera';
    (kind==='jump'?jumpDemoButton:demoButton).textContent=kind==='jump'?'Stop jump demo':'Stop tracking demo';
    const generation=++run;
    function stepDemo(){
      if(generation!==run||!active)return;const now=performance.now()/1000,t=now-demoStart;
      const sample=(kind==='jump'?jumpingDemo:trackingDemo)(t);
      report(tracker.update(sample.predictions,640,360,now));
      status.textContent=kind==='jump'&&!jumpsEnabled()?'Jump demo · select Feet / full body and enable Detect jumps':`Demo · ${sample.label}`;timer=setTimeout(stepDemo,100);
    }
    stepDemo();draw();
  }
  demoButton.addEventListener('click',()=>startDemo('tracking'));
  jumpDemoButton.addEventListener('click',()=>startDemo('jump'));
  // Read-only state and an explicit fixture path support camera-free QA.
  window.StillFieldCamera={getState:()=>({active,demo,people:tracker.visible(performance.now()/1000).length,detectMillis,recoveries,stale:!demo&&stale}),async checkDetector(image){return(await model()).detect(image,20,.5);}};
  // The first launch stays camera-free. Automatic capture is an explicit saved choice.
  if(settings?.get('autoCamera'))start();
})();
