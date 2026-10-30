export const API_URL = process.env.REACT_APP_API_URL || 'https://barberia-backend-2.onrender.com';

// Public Key de Mercado Pago (es pública, se puede exponer en el frontend). El Access Token va SOLO en el backend.
export const MP_PUBLIC_KEY = process.env.REACT_APP_MP_PUBLIC_KEY || '';

// Correos con acceso al panel (solo para mostrar la UI; el backend y Supabase RLS hacen la validación real)
export const ADMIN_EMAILS = ['juniortovaradmin@gmail.com', 'juniortovar601@gmail.com'];

// WhatsApp de la barbería (formato internacional sin "+")
export const WHATSAPP_NUMERO = '51951038509';

// Sede
export const SEDE = {
  nombre: 'Barber Studio JP',
  direccion: 'Sede La Molina',
  mapa: 'https://maps.app.goo.gl/emojVJ8G5VQF4LsQ8',
};

// Enlace de WhatsApp con mensaje. Se usa api.whatsapp.com/send y no wa.me: la redirección de wa.me
// rompe los emojis en WhatsApp de PC (aparecen como "�").
export const enlaceWhatsApp = (numero, texto = '') =>
  `https://api.whatsapp.com/send?phone=${numero}${texto ? `&text=${encodeURIComponent(texto)}` : ''}`;

// Dirección pública de la web: a ella apuntan los enlaces de los correos de Supabase (recuperar contraseña,
// confirmar cuenta). Aunque se pidan desde localhost, el cliente siempre llega a la web real.
// Para probar ese flujo en tu PC, pon REACT_APP_SITE_URL=http://localhost:3000 en .env.local.
export const SITIO_URL = (process.env.REACT_APP_SITE_URL || 'https://barberiajuniortovar.onrender.com').replace(/\/$/, '');
