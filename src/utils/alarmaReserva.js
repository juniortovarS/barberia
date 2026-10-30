import { useCallback, useEffect, useRef, useState } from 'react';
import { sonarAviso } from './eventosAdmin';

// 🔔 Alarma de "nueva reserva" para el panel: una voz de mujer repite el aviso con un timbre entre cada repetición.
// Suena hasta que el admin acepta o rechaza la reserva (el panel llama a detener), como máximo DURACION_MS.
// Los navegadores solo permiten hablar/sonar si la página ya fue tocada: por eso existe "Activar alarma".

export const DURACION_MS = 45000;
// Lo que tarda una frase con su timbre (~6 s): si queda menos, no se empieza otra
const MARGEN_FRASE_MS = 7000;
const CLAVE_ACTIVADA = 'alarma-reserva-activada';
const CLAVE_VOZ = 'alarma-reserva-voz';

const leer = (clave, porDefecto) => {
  try { return localStorage.getItem(clave) ?? porDefecto; } catch { return porDefecto; }
};
const guardar = (clave, valor) => {
  try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ }
};

// Voz de MUJER en español, lo más humana posible (estilo asistente tipo Alexa):
// 1º voces neuronales "Natural/Online" de Microsoft Edge (Camila es-PE, Dalia es-MX…),
// 2º "Google español" de Chrome, 3º voces del sistema (Sabina, Helena, Laura, Paulina…). Entre iguales gana Latinoamérica.
// Nombres de las voces FEMENINAS en español de Windows, macOS, Chrome y las neuronales de Edge.
// Solo se usan voces de esta lista: nunca suena una voz de hombre.
const MUJERES = [
  'camila', 'dalia', 'paloma', 'salome', 'elena', 'ximena', 'catalina', 'valentina', 'renata', 'larissa', 'elvira',
  'abril', 'candela', 'carlota', 'nuria', 'marina', 'beatriz', 'andrea', 'belkys', 'karla', 'marta', 'teresa',
  'ramona', 'tania', 'margarita', 'paola', 'irene', 'estrella', 'laia', 'triana', 'vera', 'lia', 'yolanda', 'maria', 'maría',
  'sabina', 'paulina', 'helena', 'laura', 'monica', 'mónica', 'soledad', 'marisol', 'lucia', 'lucía', 'esperanza',
  'angelica', 'angélica', 'francisca', 'isabela', 'google',
];
const LATAM = ['es-pe', 'es-mx', 'es-us', 'es-419', 'es-co', 'es-ar', 'es-cl'];

const esNatural = (v) => /natural|online|neural/i.test(v?.name || '');
const esDeMujer = (v) => MUJERES.some((m) => new RegExp(`\\b${m}\\b`, 'i').test(v.name));

const puntaje = (v) => {
  const idioma = v.lang.toLowerCase();
  let p = 0;
  if (esNatural(v)) p += 20; // las neuronales suenan como una persona
  if (/google/i.test(v.name)) p += 8; // "Google español" de Chrome: femenina y bastante natural
  if (idioma === 'es-pe') p += 3;
  else if (LATAM.includes(idioma)) p += 2;
  return p;
};

// Voces de MUJER en español disponibles en ESTE navegador, de la más humana a la menos
const vocesDeMujer = () => (window.speechSynthesis?.getVoices?.() || [])
  .filter((v) => v.lang?.toLowerCase().startsWith('es') && esDeMujer(v))
  .map((v) => [puntaje(v), v])
  .sort((a, b) => b[0] - a[0])
  .map(([, v]) => v);

// 🎙️ Grabación con voz real (opcional): si existe public/alarma-reserva.mp3 se usa en vez de la voz sintética
const URL_GRABACION = `${process.env.PUBLIC_URL || ''}/alarma-reserva.mp3`;
const existeGrabacion = async () => {
  try {
    const res = await fetch(URL_GRABACION, { method: 'HEAD', cache: 'no-store' });
    // En desarrollo, un archivo que no existe devuelve index.html con 200: se revisa que sea audio
    return res.ok && (res.headers.get('content-type') || '').startsWith('audio');
  } catch {
    return false;
  }
};

// "Microsoft Camila Online (Natural) - Spanish (Peru)" → "Camila · Perú · Natural"
const PAISES = { 'es-pe': 'Perú', 'es-mx': 'México', 'es-us': 'EE. UU.', 'es-es': 'España', 'es-co': 'Colombia', 'es-ar': 'Argentina', 'es-cl': 'Chile' };
export const etiquetaVoz = (v) => {
  const nombre = v.name
    .replace(/^(Microsoft|Google)\s+/i, '')
    .replace(/\s*-\s*Spanish.*$/i, '')
    .replace(/\s*(Online|\(Natural\))/gi, '')
    .trim();
  const pais = PAISES[v.lang.toLowerCase()] || v.lang;
  return `${nombre} · ${pais}${esNatural(v) ? ' · Natural ✨' : ''}`;
};

// Velocidad de la voz. Cada motor interpreta "rate" distinto:
// - Google (Chrome): acelera casi proporcional; x2 ≈ 300 palabras/min, ya no se entiende.
// - Microsoft (Windows/Edge): acelera poco; medido con Sabina: x1 = 113, x1.6 = 140, x2 = 156 palabras/min.
// Objetivo: ~150 palabras/min (ritmo de conversación) en "Un poco rápida".
export const VELOCIDADES = [
  { id: 'normal', etiqueta: 'Normal', google: 1, otras: 1.3 },
  { id: 'media', etiqueta: 'Un poco rápida', google: 1.15, otras: 1.8 },
  { id: 'rapida', etiqueta: 'Rápida', google: 1.3, otras: 2 },
];
const CLAVE_VELOCIDAD = 'alarma-reserva-velocidad';
const VELOCIDAD_POR_DEFECTO = 'media';

const rateDe = (voz, nivel) => {
  const v = VELOCIDADES.find((x) => x.id === nivel) || VELOCIDADES.find((x) => x.id === VELOCIDAD_POR_DEFECTO);
  return /google/i.test(voz?.name || '') ? v.google : v.otras;
};

// Frase lista para hablar, con el tono natural de la voz (forzar el tono las hace sonar más robóticas)
const frase = (texto, voz, nivel) => {
  const f = new SpeechSynthesisUtterance(texto);
  f.lang = voz?.lang || 'es-PE';
  if (voz) f.voice = voz;
  f.rate = rateDe(voz, nivel);
  f.pitch = 1;
  f.volume = 1;
  return f;
};

export const useAlarmaReserva = () => {
  const [sonando, setSonando] = useState(null); // { texto, desde } mientras suena
  const [activada, setActivada] = useState(() => leer(CLAVE_ACTIVADA, '1') !== '0');
  // El navegador ya permite audio si el usuario interactuó con la página
  const [desbloqueada, setDesbloqueada] = useState(() => Boolean(navigator.userActivation?.hasBeenActive));
  const [voces, setVoces] = useState(vocesDeMujer);
  const [vozNombre, setVozNombre] = useState(() => leer(CLAVE_VOZ, ''));
  const [velocidad, setVelocidad] = useState(() => leer(CLAVE_VELOCIDAD, VELOCIDAD_POR_DEFECTO));
  const estado = useRef({ fin: 0, timers: [], activa: false });
  const [grabacion, setGrabacion] = useState(false); // hay public/alarma-reserva.mp3
  const audio = useRef(null);

  useEffect(() => {
    existeGrabacion().then((hay) => {
      if (!hay) return;
      audio.current = new Audio(URL_GRABACION);
      audio.current.preload = 'auto';
      setGrabacion(true);
    });
  }, []);

  // La voz elegida por el admin; si no está en este navegador, la más humana disponible
  const vozActual = useCallback(
    () => voces.find((v) => v.name === vozNombre) || voces[0] || null,
    [voces, vozNombre]
  );

  const limpiar = useCallback(() => {
    estado.current.activa = false;
    estado.current.timers.forEach(clearTimeout);
    estado.current.timers = [];
    try { window.speechSynthesis?.cancel(); } catch { /* sin voz */ }
    if (audio.current) {
      audio.current.onended = null;
      audio.current.pause();
      audio.current.currentTime = 0;
    }
    setSonando(null);
  }, []);

  const detener = limpiar;

  // texto: lo que dice la voz · reservaId: a qué reserva corresponde (para detenerla al aceptar/rechazar)
  // duracionMs: tope de tiempo · repeticiones: cuántas veces decirlo como máximo · conGrabacion: usar el MP3 si existe
  const iniciar = useCallback((texto, { reservaId = null, duracionMs = DURACION_MS, repeticiones = Infinity, conGrabacion = true } = {}) => {
    if (!activada) return;
    limpiar();
    const e = estado.current;
    e.activa = true;
    e.fin = Date.now() + duracionMs;
    let dichas = 0;
    setSonando({ texto, reservaId, desde: Date.now() });

    const programar = (fn, ms) => e.timers.push(setTimeout(fn, ms));
    const voz = vozActual();

    const ciclo = () => {
      // No empieza una frase que no alcanzaría a terminar antes del tope (así no se corta a la mitad)
      if (!e.activa || e.fin - Date.now() < MARGEN_FRASE_MS || dichas >= repeticiones) return limpiar();
      dichas += 1;
      sonarAviso();
      const siguiente = () => programar(ciclo, 1800);
      // 1º la grabación con voz real, si existe
      if (conGrabacion && grabacion && audio.current) {
        programar(() => {
          if (!e.activa) return;
          audio.current.currentTime = 0;
          audio.current.onended = siguiente;
          audio.current.play().catch(siguiente);
        }, 700);
        return undefined;
      }
      if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
        siguiente();
        return undefined;
      }
      programar(() => {
        if (!e.activa) return;
        const f = frase(texto, voz, velocidad);
        f.onend = siguiente;
        f.onerror = siguiente;
        window.speechSynthesis.speak(f);
      }, 700);
      return undefined;
    };

    ciclo();
    programar(limpiar, duracionMs); // tope duro de tiempo
  }, [activada, limpiar, vozActual, grabacion, velocidad]);

  // Detecta el primer toque en la página (desbloquea el audio del navegador)
  useEffect(() => {
    if (desbloqueada) return undefined;
    // Se escucha "click" (no pointerdown): así el botón "Toca aquí" alcanza a recibir su clic antes de ocultarse
    const marcar = () => setDesbloqueada(true);
    window.addEventListener('click', marcar, { once: true });
    window.addEventListener('keydown', marcar, { once: true });
    return () => {
      window.removeEventListener('click', marcar);
      window.removeEventListener('keydown', marcar);
    };
  }, [desbloqueada]);

  // Las voces (sobre todo las naturales de Edge) se cargan de forma asíncrona
  useEffect(() => {
    if (!window.speechSynthesis) return undefined;
    const alCargar = () => setVoces(vocesDeMujer());
    alCargar();
    window.speechSynthesis.addEventListener?.('voiceschanged', alCargar);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', alCargar);
  }, []);

  useEffect(() => limpiar, [limpiar]);

  const cambiarActivada = useCallback((valor) => {
    setActivada(valor);
    guardar(CLAVE_ACTIVADA, valor ? '1' : '0');
    if (!valor) limpiar();
  }, [limpiar]);

  // Prueba corta (también desbloquea el audio porque viene de un clic)
  const probar = useCallback((voz = vozActual(), nivel = velocidad) => {
    setDesbloqueada(true);
    // Con grabación se reproduce esa (el clic también habilita el audio para cuando llegue una reserva)
    if (grabacion && audio.current && voz === vozActual()) {
      audio.current.currentTime = 0;
      audio.current.play().catch(() => {});
      return;
    }
    try {
      window.speechSynthesis?.cancel();
      window.speechSynthesis?.speak(frase('¡Hola! Tienes una nueva reserva. Por favor, revisa el Yape y confírmala.', voz, nivel));
    } catch { /* sin voz */ }
  }, [vozActual, grabacion, velocidad]);

  const cambiarVelocidad = useCallback((nivel) => {
    setVelocidad(nivel);
    guardar(CLAVE_VELOCIDAD, nivel);
    probar(vozActual(), nivel);
  }, [probar, vozActual]);

  const cambiarVoz = useCallback((nombre) => {
    setVozNombre(nombre);
    guardar(CLAVE_VOZ, nombre);
    probar(voces.find((v) => v.name === nombre) || null);
  }, [voces, probar]);

  return {
    sonando, activada, desbloqueada, iniciar, detener, cambiarActivada, probar,
    voces, vozActual: vozActual(), cambiarVoz, grabacion, velocidad, cambiarVelocidad,
  };
};
