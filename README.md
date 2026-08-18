# Prototipo de cadencia de palada

Mide la cadencia de palada (spm) en tiempo real con el giroscopio del móvil.
HTML + JavaScript puro, sin frameworks, sin dependencias, sin instalación.

Todo el prototipo es **`index.html`**. Un solo fichero.

---

## Cómo probarlo en el móvil

Chrome en Android **solo entrega datos del giroscopio en contexto seguro**
(`https://` o `localhost`). Abrir el fichero con `file://` no funciona: la
página carga pero no llega ninguna muestra. Tres opciones:

**1. Servidor local con https (recomendado para el agua)**

```bash
python3 serve.py --https
```

Abre en el móvil la URL `https://<ip-del-portátil>:8443` que imprime el
script. La primera vez Chrome avisa del certificado autofirmado:
*Configuración avanzada → Acceder a…*. El portátil y el móvil tienen que
estar en la misma red.

**2. GitHub Pages** — la más cómoda para salir al agua sin portátil

*Settings → Pages → Source: Deploy from a branch → rama `claude/new-session-0kqvzh`,
carpeta `/ (root)`.* En un minuto tienes
`https://manuelgalo.github.io/kayakApp/` en el móvil.

Ojo: **este repositorio es privado, y Pages sobre repos privados requiere
GitHub Pro**. Con cuenta gratuita hay que hacer el repo público
(*Settings → General → Danger Zone → Change visibility*). El prototipo no
contiene nada sensible, así que es una opción razonable.

**3. Cable USB + localhost**

Con el móvil conectado por USB y depuración activada, en `chrome://inspect`
del portátil se puede redirigir un puerto: entonces `http://localhost:8000`
en el móvil sí es contexto seguro. Sirve con `python3 serve.py`.

---

## Uso

1. Coloca el móvil (chaleco en vertical, o soporte de cubierta).
2. **INICIAR**. El cronómetro arranca solo si estaba a cero.
3. Los primeros ~8 s calibra montaje y eje; después ~12 s más para llenar la
   ventana de análisis. A partir de ahí el número es continuo.
4. Pala. El número grande es la cadencia media de los últimos 12 s.

El cronómetro tiene sus propios botones (▶/⏸ y ↺) e ignora la detección.

### Voz: la cadencia cantada cada 30 s

Con el móvil en el bolsillo del chaleco no se ve la pantalla, así que **la voz
es el único canal durante la sesión**. Cada 30 segundos dice la cadencia
("ochenta y ocho"). Además:

- Al pulsar INICIAR dice **"listo"** — confirma el arranque sin mirar, y de
  paso desbloquea el audio (Android exige un gesto del usuario para poder
  hablar después).
- Si pierde la señal dice **"sin señal"** en vez de callarse: dentro del
  chaleco, un silencio es indistinguible de una avería.
- **Vibra** a la vez que habla (una pulsación con la cadencia, tres cortas al
  perder la señal). Se nota a través del chaleco, y si vibra pero no se oye ya
  sabes que el problema es el audio y no la detección.
- El botón 🔊 la silencia.

Si no se oye nada, la línea gris de diagnóstico lo dice: `voz off` (silenciada),
`voz NO SOPORTADA` (navegador sin Web Speech API), `voz sin voces` (el motor TTS
del móvil no tiene ninguna instalada) o `voz N sin sonar` (el navegador rechazó
la locución). Con `voz es` o `voz sistema` el problema es de volumen.

Se oye por el altavoz desde el bolsillo en agua tranquila, pero con viento un
auricular (uno solo, por seguridad) va mucho mejor. Sube el volumen de
*multimedia* antes de salir — la voz sale por ese canal, no por el de llamada.

### Indicador de calidad

| Estado | Significado |
|---|---|
| **Señal buena** (verde) | Pico espectral limpio y los dos métodos de medida coinciden. |
| **Señal débil** (ámbar) | Hay número, pero con ruido o poca concentración. Orientativo. |
| **Sin cadencia detectable** (rojo) | No hay componente periódica clara. Muestra `--` en vez de inventar un número. |

La línea gris de abajo es diagnóstico: montaje, eje elegido, fuente, frecuencia
real de muestreo, concentración del pico y discrepancia entre los dos métodos.

---

## Cómo funciona

```
DeviceMotionEvent.rotationRate
  → remuestreo uniforme a 50 Hz (interpolación lineal; el sensor llega irregular)
  → dos bancos de filtros por eje (biquads Butterworth de orden 2)
       banda PALADA  0,8–3,0 Hz
       banda CICLO   0,3–2,0 Hz
  → elección automática del eje con más energía en la banda activa
     (+ reevaluación cada 5 s con histéresis 1,6×, por si el móvil se mueve)
  → ventana deslizante de 12 s:
       a) frecuencia dominante: barrido Goertzel + interpolación parabólica
       b) frecuencia por cruces por cero (control cruzado → calidad)
  → spm = f × 60 × (2 si la dominante es el ciclo izquierda+derecha)
  → mediana de las 5 últimas estimaciones
  → voz cada 30 s (Web Speech API, es-ES)
```

**Rango medible:** 40–180 spm en cubierta, **55–180 spm en chaleco**. El límite
inferior del chaleco no es arbitrario: como allí la frecuencia dominante es la
mitad del ritmo, una cadencia de 50 spm cae en 0,42 Hz, justo encima del
oleaje. Y en agua tranquila el oleaje es una sinusoide tan limpia que se cuela
como cadencia perfectamente creíble — la primera versión llegó a cantar "42"
veinte segundos después de dejar de palar. Antes que dar un número inventado,
el prototipo dice `--`.

Sin GPS, sin Bluetooth, sin login, sin base de datos, sin grabación, sin
gráficas, sin navegación.

### La ambigüedad del ×2, y cómo se resuelve

Las especificaciones lo apuntan ("dividido por 2 si se detecta el ciclo
completo…"). En la práctica es el único punto delicado del algoritmo:

- **Chaleco**, móvil vertical: el giroscopio ve la rotación del tronco. El
  ciclo izquierda+derecha es **una** oscilación, así que la frecuencia
  dominante es la **mitad** del ritmo de palada.
- **Cubierta**, móvil inclinado: hay un impulso del barco por **cada** palada,
  así que la dominante **ya es** el ritmo de palada.

Los dos casos producen exactamente la misma forma de onda. No se pueden
separar mirando la señal — a 0,75 Hz, 90 spm en chaleco y 45 spm en cubierta
son indistinguibles. Lo que sí los distingue es la **orientación del móvil**,
que es justo lo que diferencia los dos montajes: el prototipo mide el vector
gravedad durante la calibración y elige chaleco si el móvil está a menos de
35° de la vertical.

Si en el agua el número sale sistemáticamente al doble o a la mitad, **toca la
línea gris de diagnóstico** para forzar el otro montaje (aparece un `*` al
lado). Es la única interacción oculta que tiene la pantalla, y existe
precisamente para no perder una sesión de validación por esto.

---

## Comprobación en simulación

`test/simulacion.js` carga el script real de `index.html` en un DOM falso y le
inyecta señal sintética (muestreo irregular, oleaje lento, ruido, armónicos)
para los dos montajes:

```bash
node test/simulacion.js   # 26 casos: cadencia, montajes, ejes y falsos positivos
node test/voz.js          # voz: temporizado, contenido, vibración y gesto
```

`simulacion.js` cubre 50–140 spm en ambos montajes, los tres ejes, sensor lento
(25 Hz), oleaje fuerte, barco a la deriva con oleaje limpio (debe dar `--`),
cadencia fuera de rango y cambios de ritmo a mitad de sesión. `voz.js`
comprueba que canta a los 30, 60 y 90 s, que el número es el correcto, que
avisa al perder la señal, y las dos trampas que dejan la sesión muda en
Android: que la primera locución salga **dentro del gesto** del usuario (con un
`await` por medio, Chrome la descarta y ya no habla en toda la sesión) y que
siga hablando en un móvil sin voz española instalada.

No sustituyen a la prueba en el agua: validan el algoritmo, no la física real
de la palada.

---

## Criterio de éxito

Si en aguas tranquilas el número se aproxima a la cadencia que percibes
mientras palas, y se mantiene razonablemente estable, el sistema funciona y se
pasa a la fase siguiente: contador manual de paladas, grabación a CSV y ajuste
fino del filtro con datos reales.
