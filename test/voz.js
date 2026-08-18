// Comprueba el canal de voz: temporizado, contenido, vibracion, y las dos
// trampas que dejan la sesion muda en Android (gesto y voz no instalada).
const fs=require('fs'), vm=require('vm');
const code = fs.readFileSync(__dirname+'/../index.html','utf8').match(/<script>\n([\s\S]*?)<\/script>/)[1];

function mk(){return{textContent:'',innerHTML:'',className:'',classList:{add(){},remove(){},toggle(){}},
  addEventListener(e,f){this['on_'+e]=f;}};}

function crear(voces){
  const els={}; for(const id of ['spm','chrono','quality','qtext','diag','warn','btnMain','btnChrono','btnReset','btnVoice']) els[id]=mk();
  const L={}, spoken=[], buzzes=[];
  const ctx={ now:0 };
  const speechSynthesis={speaking:false,pending:false,getVoices:()=>voces,
    addEventListener(){}, cancel(){}, resume(){}, pause(){},
    speak(u){ spoken.push({t:ctx.now/1000, text:u.text, voz:u.voice?u.voice.name:'(sistema)'}); }};
  function SpeechSynthesisUtterance(t){ this.text=t; }
  const sb={console,performance:{now:()=>ctx.now},
    document:{getElementById:i=>els[i],addEventListener(){},visibilityState:'visible'},
    navigator:{vibrate(p){ buzzes.push(p); return true; }},
    setInterval:()=>0,setTimeout:()=>0,Math,String,Number,Array,Float32Array,Float64Array,Object,JSON,Error,Promise,
    speechSynthesis,SpeechSynthesisUtterance};
  sb.window=sb; sb.window.DeviceMotionEvent=function(){}; sb.window.isSecureContext=true;
  sb.window.addEventListener=(n,f)=>{L[n]=f;}; sb.window.removeEventListener=n=>{delete L[n];};
  vm.createContext(sb); vm.runInContext(code, sb);
  return {ctx, els, L, spoken, buzzes, R:s=>vm.runInContext(s,sb)};
}

// Sesion en chaleco a 88 spm durante 100 s y luego 40 s a la deriva.
async function sesion(voces){
  const s = crear(voces);
  s.ctx.now=0;
  s.R('start()');
  // Chrome en Android solo desbloquea el audio si la primera locucion sale de
  // forma SINCRONA dentro del gesto. start() es async: si "listo" cae detras de
  // un await el navegador la descarta y la sesion entera queda muda.
  const sincrona = s.spoken.length>0 && s.spoken[0].text==='listo';
  await new Promise(r=>setImmediate(r));

  const g=[0.4,-9.7,0.6], f0=88/120; let nextTick=250;
  while(s.ctx.now < 140000){
    s.ctx.now += 1000/60 + (Math.random()-0.5)*6;
    const t=s.ctx.now/1000;
    const y=(t<100 ? 40*Math.sin(2*Math.PI*f0*t)+11*Math.sin(4*Math.PI*f0*t+.6) : 0)
            + 25*Math.sin(2*Math.PI*0.25*t) + 8*(Math.random()-0.5);
    s.L['devicemotion']({rotationRate:{alpha:0,beta:y,gamma:0},
                         accelerationIncludingGravity:{x:g[0],y:g[1],z:g[2]}});
    while(s.ctx.now>=nextTick){ s.R('tick()'); nextTick+=250; }
  }
  s.R('stop()');
  return {sincrona, spoken:s.spoken, buzzes:s.buzzes};
}

const ES=[{lang:'es-ES',name:'Spanish'},{lang:'en-US',name:'English'}];
const SOLO_EN=[{lang:'en-US',name:'English'}];   // movil sin voz espanola instalada
const NINGUNA=[];                                 // motor TTS aun sin cargar voces

(async()=>{
  let fallos=0;
  for(const [nombre,voces] of [['con voz es-ES',ES],['solo voz en-US',SOLO_EN],['sin voces',NINGUNA]]){
    const r = await sesion(voces);
    const avisos = r.spoken.filter(s=>s.text!=='listo' && s.text!=='parado');
    const gaps = avisos.slice(1).map((s,i)=>s.t-avisos[i].t);
    const nums = avisos.filter(s=>/^\d+$/.test(s.text)).map(s=>Number(s.text));
    const errMax = nums.length ? Math.max(...nums.map(n=>Math.abs(n-88))) : 99;
    const ok = r.sincrona && gaps.every(g=>Math.abs(g-30)<=0.6) && errMax<=3 &&
               avisos.some(s=>s.text==='sin señal') && r.buzzes.length===avisos.length;
    if(!ok) fallos++;
    console.log((ok?'  ok  ':' FALLO') + '  ' + nombre.padEnd(16) +
      ' gesto=' + (r.sincrona?'si':'NO') +
      '  avisos=[' + avisos.map(a=>a.text).join(', ') + ']' +
      '  cada ' + gaps.map(g=>g.toFixed(0)).join('/') + 's' +
      '  voz=' + (r.spoken[0]?r.spoken[0].voz:'-') +
      '  vibra=' + r.buzzes.length);
  }
  console.log('\n' + (fallos===0 ? 'VOZ OK' : 'FALLOS: '+fallos));
  process.exit(fallos ? 1 : 0);
})();
