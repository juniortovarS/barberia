// 💈 Catálogo de servicios. El backend (barberia-backend/server.js) tiene la lista oficial y decide
// precios y montos; esta copia solo se usa si el backend no responde, para mostrar la carta.
export const SERVICIOS = [
  { id: 'ritual-barba', nombre: 'Ritual de barba', duracion: 30, precio: 30 },
  { id: 'servicio-basico', nombre: 'Servicio Básico', duracion: 75, precio: 50 },
  { id: 'limpieza-facial', nombre: 'Limpieza Facial Profunda', duracion: 45, precio: 60 },
  { id: 'servicio-premium', nombre: 'Servicio Premium', duracion: 90, precio: 80 },
  { id: 'hair-care', nombre: 'Hair Care', duracion: 105, precio: 90 },
  { id: 'servicio-presidencial', nombre: 'Servicio Presidencial', duracion: 105, precio: 100 },
  { id: 'camuflaje-canas', nombre: 'Camuflaje de canas', duracion: 105, precio: 100 },
  { id: 'hidratacion-capilar', nombre: 'Hidratación Capilar', duracion: 30, precio: 40 },
  { id: 'semi-ondulacion', nombre: 'Semi Ondulación', duracion: 180, precio: 200 },
  { id: 'ondulacion-permanente', nombre: 'Ondulación Permanente', duracion: 180, precio: 200 },
  { id: 'parche-anti-ojeras', nombre: 'Parche Anti Ojeras', duracion: 15, precio: 5 },
];

const MINIMO_YAPE = 2;
const redondear = (n) => Math.round(n * 100) / 100;

// 75 -> "1h 15 min"
export const duracionTexto = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m} min` : `${h}h`;
};

export const soles = (n) => `S/ ${Number(n || 0).toFixed(2)}`;

// Misma regla que el backend: total con descuento, adelanto hoy y restante en el local
export const calcularMontos = (precio, descuentoPct, adelantoBase) => {
  const total = redondear(precio * (1 - (descuentoPct || 0) / 100));
  let adelanto = Math.min(adelantoBase, total);
  if (total - adelanto > 0 && total - adelanto < MINIMO_YAPE) adelanto = total;
  return { total, adelanto: redondear(adelanto), saldo: redondear(total - adelanto) };
};

// ¿La cita ya empezó? (fecha "2026-10-24", hora "09:30 a. m.")
export const inicioDeCita = (fechaISO, hora) => {
  const m = String(hora || '').toLowerCase().match(/(\d{1,2}):(\d{2})\s*([ap])?/);
  if (!fechaISO || !m) return null;
  let h = Number(m[1]);
  if (m[3] === 'p' && h < 12) h += 12;
  if (m[3] === 'a' && h === 12) h = 0;
  const [y, mo, d] = fechaISO.split('-').map(Number);
  return new Date(y, mo - 1, d, h, Number(m[2]));
};

// 'proxima' | 'en_curso' | 'terminada'
export const fasePorHora = (reserva, ahora = new Date()) => {
  const inicio = inicioDeCita(reserva.fecha_cita, reserva.hora_cita);
  if (!inicio) return 'proxima';
  const fin = new Date(inicio.getTime() + (reserva.duracion_min || 30) * 60000);
  if (ahora < inicio) return 'proxima';
  if (ahora < fin) return 'en_curso';
  return 'terminada';
};
