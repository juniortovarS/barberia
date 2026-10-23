// 🗓️ Horario de atención de la barbería: edítalo aquí y se actualiza en reservas y en el footer.
// Índice = día de la semana (0 domingo ... 6 sábado). null = cerrado. Horas en formato 24h.
export const HORARIO_ATENCION = {
  0: null,
  1: { abre: '09:00', cierra: '20:00' },
  2: { abre: '09:00', cierra: '20:00' },
  3: { abre: '09:00', cierra: '20:00' },
  4: { abre: '09:00', cierra: '20:00' },
  5: { abre: '09:00', cierra: '20:00' },
  6: { abre: '09:00', cierra: '18:00' },
};

// Duración de cada turno en minutos
export const DURACION_TURNO = 30;

// Días que se pueden reservar por adelantado
export const DIAS_MAXIMOS_RESERVA = 30;

const aMinutos = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const dosDigitos = (n) => String(n).padStart(2, '0');

// 570 -> "09:30 a. m." (mismo formato que usa el panel de administración)
export const etiquetaHora = (minutos) => {
  const h24 = Math.floor(minutos / 60);
  const m = minutos % 60;
  const sufijo = h24 < 12 ? 'a. m.' : 'p. m.';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${dosDigitos(h12)}:${dosDigitos(m)} ${sufijo}`;
};

// "09:30 a. m." / "09:30 AM" / "21:30" -> "21:30" (para comparar horas guardadas con distinto formato)
export const normalizarHora = (hora) => {
  const m = String(hora || '').toLowerCase().match(/(\d{1,2}):(\d{2})\s*([ap])?/);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3] === 'p' && h < 12) h += 12;
  if (m[3] === 'a' && h === 12) h = 0;
  return `${dosDigitos(h)}:${m[2]}`;
};

export const estaAbierto = (fecha) => !!HORARIO_ATENCION[fecha.getDay()];

export const fechaISO = (fecha) =>
  `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;

// Turnos del día para un servicio de `duracion` minutos: pasado (hoy), ocupado (se cruza con
// otra cita) o libre. Solo se ofrecen horas en las que el servicio termina antes del cierre.
// `bloques` = [{ inicio: "09:00", fin: "10:15" }] que devuelve el backend.
export const turnosDelDia = (fecha, bloques = [], duracion = DURACION_TURNO) => {
  const horario = HORARIO_ATENCION[fecha.getDay()];
  if (!horario) return [];

  const ahora = new Date();
  const esHoy = fecha.toDateString() === ahora.toDateString();
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const rangos = bloques.map((b) => [aMinutos(b.inicio), aMinutos(b.fin)]);

  const turnos = [];
  for (let t = aMinutos(horario.abre); t + duracion <= aMinutos(horario.cierra); t += DURACION_TURNO) {
    const valor = `${dosDigitos(Math.floor(t / 60))}:${dosDigitos(t % 60)}`;
    turnos.push({
      minutos: t,
      valor,
      etiqueta: etiquetaHora(t),
      pasado: esHoy && t <= minutosAhora + 15,
      ocupado: rangos.some(([ini, fin]) => t < fin && ini < t + duracion),
    });
  }
  return turnos;
};

const NOMBRES_DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Texto agrupado para el footer: "Lun - Vie: 9:00 AM - 8:00 PM"
export const resumenHorario = () => {
  const formato = (hhmm) => {
    const t = aMinutos(hhmm);
    const h24 = Math.floor(t / 60);
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${dosDigitos(t % 60)} ${h24 < 12 ? 'AM' : 'PM'}`;
  };
  const orden = [1, 2, 3, 4, 5, 6, 0];
  const grupos = [];
  orden.forEach((dia) => {
    const h = HORARIO_ATENCION[dia];
    const texto = h ? `${formato(h.abre)} - ${formato(h.cierra)}` : 'Cerrado';
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.texto === texto) ultimo.hasta = dia;
    else grupos.push({ desde: dia, hasta: dia, texto });
  });
  const corto = (d) => NOMBRES_DIAS[d].slice(0, 3);
  return grupos.map((g) => ({
    dias: g.desde === g.hasta ? NOMBRES_DIAS[g.desde] : `${corto(g.desde)} - ${corto(g.hasta)}`,
    texto: g.texto,
  }));
};
