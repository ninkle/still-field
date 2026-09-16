(() => {
  const root=document.getElementById('still-field-art');
  const art=window.StillField;
  if(!art) return;
  const status=root.querySelector('[role="status"]');
  const mic=root.querySelector('[data-action="mic"]');
  root.querySelectorAll('.sf-install').forEach(el=>el.hidden=false);
  const params=new URLSearchParams(location.search);
  if(params.has('quality')) art.setQuality(Number(params.get('quality')));
  async function full(){
    try {if(document.fullscreenElement) await document.exitFullscreen(); else await root.requestFullscreen();}
    catch(error){status.textContent='Use your browser’s full-screen command to display the artwork.';}
  }
  root.querySelector('[data-action="full"]').addEventListener('click',full);
  root.querySelector('canvas').addEventListener('dblclick',full);
  document.addEventListener('keydown',e=>{
    if(/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName))return;
    if(e.key.toLowerCase()==='f'){e.preventDefault();full();}
    if(e.code==='Space'){e.preventDefault();root.querySelector('[data-action="pause"]').click();}
  });
  let idle;
  root.addEventListener('pointermove',()=>{root.classList.remove('sf-idle');clearTimeout(idle);idle=setTimeout(()=>root.classList.add('sf-idle'),4000);});
  const settings=window.StillFieldSettings;
  let stream=null,context=null,micRun=0,micActive=false;
  function stopMic(){
    micRun++;micActive=false;
    art.setLiveReader(null);
    if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;
    if(context){context.close().catch(()=>{});context=null;}
    mic.textContent='Use microphone';art.configure({activity:settings?.get('activity')??.2});
  }
  mic.addEventListener('click',async()=>{
    if(micActive){stopMic();status.textContent='Microphone off. The artwork continues.';return;}
    const generation=++micRun;micActive=true;mic.textContent='Cancel microphone';
    try {
      if(!navigator.mediaDevices?.getUserMedia) throw new Error('needs-localhost');
      // Start Web Audio from this click, preserving the browser's gesture policy.
      context=new AudioContext();const audioReady=context.resume();
      audioReady.catch(()=>{});
      const deviceId=settings?.get('micDevice');
      const acquired=await navigator.mediaDevices.getUserMedia({audio:{...(deviceId?{deviceId:{exact:deviceId}}:{}),echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
      if(generation!==micRun){acquired.getTracks().forEach(track=>track.stop());return;}
      stream=acquired;await audioReady;if(generation!==micRun)return;
      const analyser=context.createAnalyser();analyser.fftSize=2048;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples=new Float32Array(analyser.fftSize);
      art.setLiveReader(()=>{
        analyser.getFloatTimeDomainData(samples);
        let sum=0;for(const x of samples)sum+=x*x;
        const rms=Math.sqrt(sum/samples.length);
        const db=20*Math.log10(Math.max(rms,1e-6));
        return Math.max(0,Math.min(1,(db+65)/40*(settings?.get('micGain')??1)));
      });
      stream.getAudioTracks()[0]?.addEventListener('ended',()=>{if(generation===micRun){stopMic();status.textContent='Microphone disconnected. Reconnect it and click Use microphone.';}},{once:true});
      settings?.refreshDevices();
      mic.textContent='Stop microphone';
      status.textContent='Microphone on · loudness only, processed here. No audio is saved or sent. Daylight is simulated.';
    } catch(error) {
      if(generation!==micRun)return;
      stopMic();
      status.textContent=error.name==='NotAllowedError'?'Microphone access was declined. Allow it in Chrome and macOS Privacy & Security to use sound.':error.name==='OverconstrainedError'||error.name==='NotFoundError'?'Selected microphone unavailable. Choose a connected microphone in Installation settings.':'Microphone unavailable. Open this player through the local launcher and check the selected input.';
    }
  });
  window.addEventListener('pagehide',stopMic,{once:true});
  // Opt-in local sensor bridge. The default artwork works entirely offline.
  if(params.get('sensors')==='1' && /^https?:$/.test(location.protocol)){
    let version=-1,wasLive=false;
    async function poll(){
      try {
        const response=await fetch('/api/input',{cache:'no-store',signal:AbortSignal.timeout(2500)});
        if(!response.ok) throw new Error('bridge unavailable');
        const data=await response.json();
        if(data.fresh){
          if(data.version!==version){art.setInputs(data.values);version=data.version;}
          if(!wasLive)status.textContent='Receiving live normalized sensor values from the local bridge.';
          wasLive=true;
        } else if(wasLive || version===-1){
          status.textContent='Waiting for sensor input. The artwork is running autonomously.';wasLive=false;version=0;
        }
      } catch(error){status.textContent='Sensor bridge unavailable. The artwork continues autonomously.';wasLive=false;}
      setTimeout(poll,1000);
    }
    poll();
  }
})();
