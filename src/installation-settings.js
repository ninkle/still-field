(()=>{
  const art=window.StillField;if(!art)return;
  const key='still-field-installation-v1',root=document.getElementById('still-field-art');
  const defaults={speed:.58,damping:.04,motion:.75,activity:.2,quality:2560,mirror:true,anchor:'feet',preview:true,jumps:true,sensitivity:'sensitive',cameraDevice:'',micDevice:'',autoCamera:false,micGain:1};
  let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
  const values={...defaults};
  for(const k of ['speed','damping','motion','activity'])if(Number.isFinite(saved[k]))values[k]=Math.max(0,Math.min(1,saved[k]));
  for(const k of ['mirror','preview','autoCamera','jumps'])if(typeof saved[k]==='boolean')values[k]=saved[k];
  for(const k of ['cameraDevice','micDevice'])if(typeof saved[k]==='string')values[k]=saved[k];
  if([1920,2560,3840].includes(saved.quality))values.quality=saved.quality;
  if([.6,1,1.7].includes(saved.micGain))values.micGain=saved.micGain;
  if(['feet','center'].includes(saved.anchor))values.anchor=saved.anchor;
  if(['standard','sensitive'].includes(saved.sensitivity))values.sensitivity=saved.sensitivity;
  const status=document.getElementById('sf-settings-status');
  function save(){try{localStorage.setItem(key,JSON.stringify(values));}catch{status.textContent='Browser storage is unavailable. Settings will last only for this session.';}}
  function set(name,value){values[name]=value;save();}
  const byId=id=>document.getElementById(id);
  art.configure(values);art.setQuality(values.quality);
  root.querySelectorAll('input[data-control]').forEach(el=>el.addEventListener('input',()=>set(el.dataset.control,Number(el.value)/100)));
  const controls={quality:'sf-quality',micGain:'sf-mic-gain',mirror:'sf-camera-mirror',anchor:'sf-camera-anchor',preview:'sf-camera-preview',autoCamera:'sf-auto-camera',jumps:'sf-camera-jumps',sensitivity:'sf-camera-sensitivity'};
  for(const[name,id]of Object.entries(controls)){
    const el=byId(id),boolean=typeof values[name]==='boolean';
    if(boolean)el.checked=values[name];else el.value=String(values[name]);
    el.addEventListener('change',()=>{set(name,boolean?el.checked:['quality','micGain'].includes(name)?Number(el.value):el.value);if(name==='quality')art.setQuality(values.quality);});
  }
  byId('sf-camera-overlay').hidden=!values.preview;
  for(const[name,id]of Object.entries({cameraDevice:'sf-camera-device',micDevice:'sf-mic-device'})){
    byId(id).addEventListener('change',e=>set(name,e.target.value));
  }
  async function refreshDevices(){
    try{
      if(!navigator.mediaDevices?.enumerateDevices)return;
      const devices=await navigator.mediaDevices.enumerateDevices();
      for(const[name,id,kind,label]of [['cameraDevice','sf-camera-device','videoinput','camera'],['micDevice','sf-mic-device','audioinput','microphone']]){
        const select=byId(id);select.replaceChildren(new Option('System default '+label,''));
        const matching=devices.filter(d=>d.kind===kind&&d.deviceId);
        matching.forEach((d,i)=>select.add(new Option(d.label||`${label} ${i+1}`,d.deviceId)));
        if(values[name]&&!matching.some(d=>d.deviceId===values[name]))select.add(new Option('Saved device · unavailable or awaiting permission',values[name]));
        select.value=values[name];
      }
    }catch{status.textContent='Could not list devices. Allow access and try Refresh devices.';}
  }
  function displayMode(enabled){document.body.classList.toggle('sf-display',enabled);}
  byId('sf-display-mode').addEventListener('click',()=>displayMode(true));
  document.addEventListener('keydown',e=>{
    if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    if(e.key==='Escape'||e.key.toLowerCase()==='s'){displayMode(false);byId('sf-installation-settings').open=true;}
  });
  byId('sf-refresh-devices').addEventListener('click',refreshDevices);
  navigator.mediaDevices?.addEventListener?.('devicechange',refreshDevices);
  window.StillFieldSettings={get:name=>values[name],set,refreshDevices,displayMode};
  refreshDevices();
  if(new URLSearchParams(location.search).get('display')==='1')displayMode(true);
})();
