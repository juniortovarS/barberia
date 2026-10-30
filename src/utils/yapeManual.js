import { useEffect, useState } from 'react';
import { API_URL } from '../config';

// Reduce la captura antes de subirla (las fotos del celular pesan varios MB): máx. 1600 px, JPEG
export const comprimirImagen = (archivo, maxLado = 1600, calidad = 0.85) => new Promise((resolve, reject) => {
  if (!archivo || !archivo.type.startsWith('image/')) {
    reject(new Error('Elige una imagen (captura de pantalla de tu Yape).'));
    return;
  }
  const url = URL.createObjectURL(archivo);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    resolve(canvas.toDataURL('image/jpeg', calidad));
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('No pudimos leer esa imagen. Toma una captura de pantalla y súbela otra vez.'));
  };
  img.src = url;
});

// "951038509" → "951 038 509"
export const formatoCelular = (n = '') => String(n).replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');

// 🔴 Estado en vivo de una reserva con Yape directo (el admin la aprueba o la rechaza desde el panel).
// Devuelve { estado: 'pending' | 'approved' | 'cancelled' | null, motivo, conectado }
export const useSeguimientoReserva = (codigo, token) => {
  const [info, setInfo] = useState({ estado: null, motivo: null, conectado: false });

  useEffect(() => {
    if (!codigo || !token || typeof EventSource === 'undefined') return undefined;
    const fuente = new EventSource(`${API_URL}/reservas/${encodeURIComponent(codigo)}/seguimiento?t=${token}`);
    fuente.addEventListener('estado', (e) => {
      try {
        const d = JSON.parse(e.data);
        setInfo({ estado: d.estado, motivo: d.motivo, conectado: true });
        // Estado final: ya no hace falta seguir conectado
        if (d.estado !== 'pending') fuente.close();
      } catch { /* evento mal formado */ }
    });
    fuente.onopen = () => setInfo((i) => ({ ...i, conectado: true }));
    // EventSource se reconecta solo; solo se marca la conexión como caída
    fuente.onerror = () => setInfo((i) => ({ ...i, conectado: false }));
    return () => fuente.close();
  }, [codigo, token]);

  return info;
};
