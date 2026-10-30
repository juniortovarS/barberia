import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../config';
import { cabeceraSesion } from './fidelidad';

// 🔴 Escucha en vivo los eventos del backend (/admin/eventos, Server-Sent Events leídos con fetch
// para poder enviar el token de sesión). Se reconecta sola si se cae la conexión.
// estado: 'conectando' | 'en_vivo' | 'reconectando'
export const useEventosAdmin = (onEvento) => {
  const [estado, setEstado] = useState('conectando');
  const callback = useRef(onEvento);
  callback.current = onEvento;

  useEffect(() => {
    let activo = true;
    let controlador = null;
    let reintento = null;
    let espera = 2000;

    const conectar = async () => {
      if (!activo) return;
      controlador = new AbortController();
      try {
        const res = await fetch(`${API_URL}/admin/eventos`, {
          headers: await cabeceraSesion(),
          signal: controlador.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        setEstado('en_vivo');
        espera = 2000;

        const lector = res.body.getReader();
        const decodificador = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          buffer += decodificador.decode(value, { stream: true });
          const mensajes = buffer.split('\n\n');
          buffer = mensajes.pop();
          mensajes.forEach((msg) => {
            const tipo = (msg.match(/^event: (.+)$/m) || [])[1];
            const datos = (msg.match(/^data: (.+)$/m) || [])[1];
            if (tipo && datos && tipo !== 'conectado') {
              try { callback.current(tipo, JSON.parse(datos)); } catch { /* evento mal formado */ }
            }
          });
        }
        throw new Error('conexión cerrada');
      } catch (err) {
        if (!activo || err.name === 'AbortError') return;
        setEstado('reconectando');
        reintento = setTimeout(conectar, espera);
        espera = Math.min(espera * 2, 30000);
      }
    };

    conectar();
    return () => {
      activo = false;
      clearTimeout(reintento);
      if (controlador) controlador.abort();
    };
  }, []);

  return estado;
};

// Sonido corto de aviso (sin archivos de audio)
export const sonarAviso = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.14].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gan = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i ? 1046 : 784;
      gan.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gan.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t + 0.02);
      gan.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
      osc.connect(gan).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.3);
    });
    // Se libera el contexto al terminar (el navegador limita cuántos puede haber abiertos)
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch { /* el navegador bloqueó el audio */ }
};
