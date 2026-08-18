// Comprueba el canal de voz: temporizado, contenido, vibracion, y las dos
// trampas que dejan la sesion muda en Android (gesto y voz no instalada).
const fs=require('fs'), vm=require('vm');
const code = fs.readFileSync(__dirname+'/../index.html','utf8').match(/<script>\n([\s\S]*?)<\/script>/)[1];

function mk(){return{textContent:'',innerHTML:'',className:'',classList:{add(){},remove(){},toggle(){}},
  addEventListener(e,f){this['on_'+e]=f;}};}

function mkPrep(){
  const btns=[0,30,60,120].map(v=>({getAttribute:()=>String(v),classList:{toggle(){}}}));
  const el=mk(); el.querySelectorAll=()=>btns; return el;
}
const localStorage={getItem:()=>null,setItem(){}};

function crear(voces){
  const els={}; for(const id of ['spm','chrono','quality','qtext','diag','warn','btnMain','btnChrono','btnReset','btnVoice']) els[id]=mk();
  els['prep']=mkPrep();
  const L={}, spoken=[], buzzes=[];
  const ctx={ now:0 };
  const speechSynthesis={speaking:false,pending:false,getVoices:()=>voces,
    addEventListener(){}, cancel(){}, resume(){}, pause(){},
    speak(u){ spoken.push({t:ctx.now/1000, text:u.text, voz:u.voice?u.voice.name:'(sistema)'}); }};
  function SpeechSynthesisUtterance(t){ this.text=t; }
  const sb={console,performance:{now:()=>ctx.now},
    document:{getElementById:i=>els[i],addEventListener(){},visibilityState:'visible'},
    navigator:{vibrate(p){ buzzes.push(p); return true; }}, localStorage,
    setInterval:()=>0,setTimeout:()=>0,Math,String,Number,Array,Float32Array,Float64Array,Object,JSON,Error,Promise,
    speechSynthesis,SpeechSynthesisUtterance};
  sb.window=sb; sb.window.DeviceMotionEvent=function(){}; sb.window.isSecureContext=true;
  sb.window.addEventListener=(n,f)=>{L[n]=f;}; sb.window.removeEventListener=n=>{delete L[n];};
  vm.createContext(sb); vm.runInContext(code, sb);
  return {ctx, els, L, spoken, buzzes, R:s=>vm.runInContext(s,sb)};
}

// Sesion en chaleco a 88 spm durante 100 s y luego 40 s a la deriva.
async function sesion(voces, prep){
  const s = crear(voces);
  s.ctx.now=0;
  s.R('setPrep(' + (prep||0) + ')');
  s.R('start()');
  // Chrome en Android solo desbloquea el audio si la primera locucion sale de
  // forma SINCRONA dentro del gesto. start() es async: si "listo" cae detras de
  // un await el navegador la descarta y la sesion entera queda muda.
  // Lo que importa no es QUE diga, sino que diga algo antes del primer await:
  // ahi es donde Chrome en Android desbloquea el audio de toda la sesion.
  const sincrona = s.spoken.length>0;
  await new Promise(r=>setImmediate(r));

  const g=[0.4,-9.7,0.6], f0=88/120; let nextTick=250;
  while(s.ctx.now < 140000 + (prep||0)*1000){
    s.ctx.now += 1000/60 + (Math.random()-0.5)*6;
    const t=s.ctx.now/1000;
    const t0=(prep||0);
    const y=(t>t0 && t<t0+100 ? 40*Math.sin(2*Math.PI*f0*t)+11*Math.sin(4*Math.PI*f0*t+.6) : 0)
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
  const check=(ok,linea)=>{ if(!ok) fallos++; console.log((ok?'  ok  ':' FALLO')+'  '+linea); };

  console.log('--- AVISOS DE CADENCIA (sin cuenta atras) ---');
  for(const [nombre,voces] of [['con voz es-ES',ES],['solo voz en-US',SOLO_EN],['sin voces',NINGUNA]]){
    const r = await sesion(voces, 0);
    const avisos = r.spoken.filter(x=>!['listo','parado','cancelado'].includes(x.text));
    const gaps = avisos.slice(1).map((x,i)=>x.t-avisos[i].t);
    const nums = avisos.map(x=>{ const m=/(\d+) paladas/.exec(x.text); return m?Number(m[1]):null; }).filter(n=>n!==null);
    const errMax = nums.length ? Math.max(...nums.map(n=>Math.abs(n-88))) : 99;
    // El tiempo cantado tiene que cuadrar con el momento en que se canta.
    const horas = avisos.map(x=>x.text.split(',')[0]);
    const esperadas = ['30 segundos','1 minuto','1 minuto 30','2 minutos'];
    check(r.sincrona && gaps.every(g=>Math.abs(g-30)<=0.6) && errMax<=3 &&
          avisos.some(x=>/sin señal/.test(x.text)) && r.buzzes.length>=avisos.length &&
          JSON.stringify(horas)===JSON.stringify(esperadas),
      nombre.padEnd(16)+' gesto='+(r.sincrona?'si':'NO')+
      '  ['+avisos.map(a=>a.text).join(' | ')+']'+
      '  voz='+(r.spoken[0]?r.spoken[0].voz:'-'));
  }

  console.log('--- CUENTA ATRAS DE 1 MIN ---');
  {
    const r = await sesion(ES, 60);
    const cuenta = r.spoken.filter(x=>x.t<62).map(x=>x.text);
    // El primer aviso debe salir dentro del gesto (desbloquea el audio) y decir
    // cuanto falta; luego los hitos; luego "ya" al arrancar la sesion.
    const hitos = ['empezamos en 1 minuto','30 segundos','10 segundos','3','2','1','ya'];
    check(r.sincrona && JSON.stringify(cuenta)===JSON.stringify(hitos),
      'hitos cantados      ['+cuenta.join(' | ')+']');

    // La sesion arranca en t=60, asi que el crono va 60 s por detras del reloj.
    const primera = r.spoken.find(x=>/paladas/.test(x.text));
    check(primera && Math.abs(primera.t-90)<1 && primera.text.indexOf('30 segundos,')===0,
      'primer aviso de cadencia  t='+(primera?primera.t.toFixed(1):'-')+'s  "'+(primera?primera.text:'-')+'"');
  }

  console.log('\n' + (fallos===0 ? 'VOZ OK' : 'FALLOS: '+fallos));
  process.exit(fallos ? 1 : 0);
})();
