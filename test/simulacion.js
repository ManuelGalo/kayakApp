const fs=require('fs'), vm=require('vm');
const code = fs.readFileSync('/home/user/kayakApp/index.html','utf8').match(/<script>\n([\s\S]*?)<\/script>/)[1];
function mk(){return{textContent:'',innerHTML:'',className:'',classList:{add(){},remove(){},toggle(){}},addEventListener(){}};}
function mkPrep(){
  const btns=[0,30,60,120].map(v=>({getAttribute:()=>String(v),classList:{toggle(){}}}));
  const el=mk(); el.querySelectorAll=()=>btns; return el;
}
const localStorage={getItem:()=>null,setItem(){}};
const els={}; for(const id of ['spm','chrono','quality','qtext','diag','warn','btnMain','btnChrono','btnReset','btnVoice']) els[id]=mk();
els['prep']=mkPrep();
let now=0; const L={};
const sb={console,performance:{now:()=>now},document:{getElementById:i=>els[i],addEventListener(){},visibilityState:'visible'},
  navigator:{},localStorage,setInterval:()=>0,setTimeout:()=>0,Math,String,Number,Array,Float32Array,Float64Array,Object,JSON,Error,Promise};
sb.window=sb; sb.window.DeviceMotionEvent=function(){}; sb.window.isSecureContext=true;
sb.window.addEventListener=(n,f)=>{L[n]=f;}; sb.window.removeEventListener=n=>{delete L[n];};
vm.createContext(sb); vm.runInContext(code, sb);
const R=s=>vm.runInContext(s,sb);

const GRAV = { chaleco:[0.4,-9.7,0.6], cubierta:[0.3,-6.9,-6.9] };  // vertical vs 45 grados

let fails=0;
async function run({label, mount, spm, axisIdx, seconds=40, hz=60, noise=8, drift=25, gen, expect}){
  now=0; R('setPrep(0)'); R('start()'); await new Promise(r=>setImmediate(r));
  const g = GRAV[mount], dtNom=1000/hz; let nextTick=250;
  // chaleco: la dominante es el ciclo (spm/120). cubierta: es la palada (spm/60).
  const f0 = (mount==='chaleco' ? spm/120 : spm/60);
  const sig = gen || (t => 40*Math.sin(2*Math.PI*f0*t) + 11*Math.sin(4*Math.PI*f0*t+0.6));
  while(now < seconds*1000){
    now += dtNom + (Math.random()-0.5)*dtNom*0.4;
    const t=now/1000;
    const v=[0,0,0];
    v[axisIdx] = sig(t) + drift*Math.sin(2*Math.PI*0.25*t) + noise*(Math.random()-0.5);
    v[(axisIdx+1)%3] = drift*1.5*Math.sin(2*Math.PI*0.2*t) + noise*(Math.random()-0.5);
    v[(axisIdx+2)%3] = noise*(Math.random()-0.5);
    L['devicemotion']({
      rotationRate:{alpha:v[0],beta:v[1],gamma:v[2]},
      accelerationIncludingGravity:{x:g[0],y:g[1],z:g[2]}
    });
    while(now>=nextTick){ R('tick()'); nextTick+=250; }
  }
  const shown=els.spm.textContent, q=els.qtext.textContent, d=els.diag.textContent;
  R('stop()');
  const esperado = expect!==undefined ? expect : spm;
  const err = shown==='--' ? NaN : Math.abs(Number(shown)-spm);
  const ok = (esperado===null || esperado==='--') ? shown==='--' : (err<=3);
  if(!ok) fails++;
  console.log((ok?'  ok  ':' FALLO'), label.padEnd(32), 'esp='+String(esperado===null?'--':esperado).padStart(4),
              'medido='+shown.padStart(4), '|', q.padEnd(30), '|', d);
}

(async()=>{
  console.log('--- MONTAJE CHALECO (movil vertical, rotacion de tronco) ---');
  for(const spm of [56,60,72,85,100,120,140]) await run({label:'chaleco '+spm+' spm', mount:'chaleco', spm, axisIdx:1});
  // Por debajo del borde de banda del chaleco NO debe inventarse un numero.
  await run({label:'chaleco 45 spm (fuera de rango)', mount:'chaleco', spm:45, axisIdx:1, expect:'--'});
  console.log('--- MONTAJE CUBIERTA (movil a 45 grados, impulso por palada) ---');
  for(const spm of [50,60,72,85,100,120]) await run({label:'cubierta '+spm+' spm', mount:'cubierta', spm, axisIdx:2});
  console.log('--- OTROS EJES / CONDICIONES ---');
  await run({label:'chaleco eje X, sensor 25Hz', mount:'chaleco', spm:90, axisIdx:0, hz:25});
  await run({label:'cubierta eje X, ruido alto', mount:'cubierta', spm:96, axisIdx:0, noise:25, drift:60});
  await run({label:'chaleco eje Z, oleaje fuerte', mount:'chaleco', spm:78, axisIdx:2, drift:80});
  console.log('--- SIN PALADA (debe dar --) ---');
  await run({label:'chaleco parado', mount:'chaleco', spm:null, axisIdx:1, gen:()=>0, noise:30, drift:50});
  await run({label:'cubierta parado', mount:'cubierta', spm:null, axisIdx:2, gen:()=>0, noise:30, drift:50});
  console.log('--- A LA DERIVA: oleaje limpio, sin palar (debe dar --) ---');
  // Una sinusoide de oleaje sin ruido es MUY concentrada y llego a cantarse
  // como cadencia falsa. Debe quedar fuera por banda y por amplitud.
  for(const fw of [0.2, 0.25, 0.3]){
    await run({label:'deriva chaleco, oleaje '+fw+' Hz', mount:'chaleco', spm:null, axisIdx:1,
               gen:()=>0, noise:3, drift:25, expect:'--'});
    await run({label:'deriva cubierta, oleaje '+fw+' Hz', mount:'cubierta', spm:null, axisIdx:2,
               gen:()=>0, noise:3, drift:25, expect:'--'});
  }

  console.log('--- CAMBIO DE RITMO ---');
  await run({label:'chaleco 70 -> 105', mount:'chaleco', spm:105, axisIdx:1, seconds:60,
             gen:t=>40*Math.sin(2*Math.PI*(t<30?70/120:105/120)*t)});
  console.log(fails===0 ? '\nTODOS OK' : '\nFALLOS: '+fails);
})();
