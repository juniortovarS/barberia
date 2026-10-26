import { MP_PUBLIC_KEY } from '../config';

// Carga MercadoPago.js una sola vez (convierte celular + código de aprobación de Yape en un token de un solo uso)
let mercadoPagoPromise = null;
export const cargarMercadoPago = () => {
  if (!MP_PUBLIC_KEY) {
    return Promise.reject(new Error('Falta REACT_APP_MP_PUBLIC_KEY (Public Key de Mercado Pago)'));
  }
  if (!mercadoPagoPromise) {
    mercadoPagoPromise = new Promise((resolve, reject) => {
      if (window.MercadoPago) return resolve(new window.MercadoPago(MP_PUBLIC_KEY));
      const script = document.createElement('script');
      script.src = 'https://sdk.mercadopago.com/js/v2';
      script.onload = () => resolve(new window.MercadoPago(MP_PUBLIC_KEY));
      script.onerror = () => {
        mercadoPagoPromise = null;
        reject(new Error('No se pudo cargar MercadoPago.js'));
      };
      document.body.appendChild(script);
    });
  }
  return mercadoPagoPromise;
};

// Devuelve el id del token de Yape, o lanza un error con mensaje para el usuario
export const generarTokenYape = async (celular, otp) => {
  try {
    const mp = await cargarMercadoPago();
    const token = await mp.yape({ otp, phoneNumber: celular }).create();
    return token.id;
  } catch (err) {
    console.error('❌ Error al generar el token de Yape:', err);
    throw new Error(MP_PUBLIC_KEY
      ? 'No pudimos validar tu código de Yape. Revisa el celular y genera un código nuevo (dura 2 minutos).'
      : 'El pago con Yape aún no está configurado (falta la Public Key de Mercado Pago).');
  }
};

// 🛡️ Script de seguridad de Mercado Pago: identifica el dispositivo (MP_DEVICE_SESSION_ID) y ayuda a
// que el antifraude apruebe los pagos. Se carga una sola vez, con anticipación al pago.
export const cargarSeguridadMP = () => {
  if (document.getElementById('mp-security-js')) return;
  const script = document.createElement('script');
  script.id = 'mp-security-js';
  script.src = 'https://www.mercadopago.com/v2/security.js';
  script.setAttribute('view', 'checkout');
  script.async = true;
  document.body.appendChild(script);
};

export const obtenerDeviceId = () => window.MP_DEVICE_SESSION_ID || undefined;

// Espera (máx. 4 s) a que security.js entregue el Device ID: Mercado Pago lo pide en cada cobro
export const esperarDeviceId = async (maxMs = 4000) => {
  cargarSeguridadMP();
  const limite = Date.now() + maxMs;
  while (!window.MP_DEVICE_SESSION_ID && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 200));
  }
  return obtenerDeviceId();
};

// Identificador del intento de pago (se usa como X-Idempotency-Key en Mercado Pago)
export const nuevoIntentoId = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const b = window.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
