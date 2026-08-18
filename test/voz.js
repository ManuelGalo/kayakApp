const fs=require('fs'), vm=require('vm');
const code = fs.readFileSync('/home/user/kayakApp/index.html','utf8').match(/<script>\n([\s\S]*?)<\/script>/)[1];
function mk(){return{textContent:'',innerHTML:'',className:'',classList:{add(){},remove(){},toggle(){}},
  addEventListener(e,f){this['on_'+e]=f;}};}
const els={}; for(const id of ['spm','chrono','quality','qtext','diag','warn','btnMain','btnChrono','btnReset','btnVoice']) els[id]=mk();
let now=0; const L={}; const spoken=[];
const speechSynthesis={speaking:false,pending:false,getVoices:()=>[{lang:'es-ES',name:'Spanish'}],
  addEventListener(){}, cancel(){}, speak(u){ spoken.push({t:now/1000, text:u.text, lang:u.lang}); }};
function SpeechSynthesisUtterance(t){ this.text=t; }
const sb={console,performance:{now:()=>now},document:{getElementById:i=>els[i],addEventListener(){},visibilityState:'visible'},
  navigator:{},setInterval:()=>0,setTimeout:()=>0,Math,String,Number,Array,Float32Array,Float64Array,Object,JSON,Error,Promise,
  speechSynthesis,SpeechSynthesisUtterance};
sb.window=sb; sb.window.DeviceMotionEvent=function(){}; sb.window.isSecureContext=true;
sb.window.addEventListener=(n,f)=>{L[n]=f;}; sb.window.removeEventListener=n=>{delete L[n];};
vm.createContext(sb); vm.runInContext(code, sb);
const R=s=>vm.runInContext(s,sb);

(async()=>{
  // Sesion en chaleco a 88 spm durante 100 s, luego 40 s parado (sin palar).
  now=0; R('start()'); await new Promise(r=>setImmediate(r));
  const g=[0.4,-9.7,0.6], f0=88/120; let nextTick=250;
  while(now < 140000){
    now += 1000/60 + (Math.random()-0.5)*6;
    const t=now/1000;
    const palando = t < 100;
    const y = (palando ? 40*Math.sin(2*Math.PI*f0*t) + 11*Math.sin(4*Math.PI*f0*t+.6) : 0)
              + 25*Math.sin(2*Math.PI*0.25*t) + 8*(Math.random()-0.5);
    L['devicemotion']({rotationRate:{alpha:0,beta:y,gamma:0},
                       accelerationIncludingGravity:{x:g[0],y:g[1],z:g[2]}});
    while(now>=nextTick){ R('tick()'); nextTick+=250; }
  }
  R('stop()');
  console.log('Locuciones (t en s desde INICIAR):');
  for(const s of spoken) console.log('  t=' + s.t.toFixed(1).padStart(6) + 's  "' + s.text + '"  [' + s.lang + ']');

  const avisos = spoken.filter(s=>s.text!=='listo' && s.text!=='parado');
  const gaps = avisos.slice(1).map((s,i)=>s.t-avisos[i].t);
  const malos = gaps.filter(g=>Math.abs(g-30)>0.6);
  console.log('\nintervalo entre avisos: ' + gaps.map(g=>g.toFixed(1)).join(', ') + ' s');
  console.log('primer aviso a los ' + avisos[0].t.toFixed(1) + ' s');
  const numeros = avisos.filter(s=>/^\d+$/.test(s.text)).map(s=>Number(s.text));
  const err = numeros.map(n=>Math.abs(n-88));
  console.log('cadencias cantadas: ' + numeros.join(', ') + '  (real 88, error max ' + Math.max(...err) + ')');
  console.log('avisos "sin señal" tras dejar de palar: ' + avisos.filter(s=>s.text==='sin señal').length);
  console.log('\n' + (malos.length===0 && Math.max(...err)<=3 && avisos.some(s=>s.text==='sin señal')
    ? 'VOZ OK' : 'REVISAR'));
})();
