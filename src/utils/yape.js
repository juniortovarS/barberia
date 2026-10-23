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
