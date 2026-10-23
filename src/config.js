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
