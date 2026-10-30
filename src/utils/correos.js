import emailjs from '@emailjs/browser';
import { soles, duracionTexto } from './servicios';

// EmailJS (https://dashboard.emailjs.com): un servicio y dos plantillas.
// En cada plantilla el cuerpo debe ser {{{mensaje_html}}} (con TRES llaves para que se vea el diseño)
// y el asunto {{asunto}}. En la del cliente, "To Email" = {{email}}.
const EMAILJS = {
  servicio: 'service_0ry9t41',
  plantillaAdmin: 'template_96itk4u',
  plantillaCliente: 'template_ruofj9e',
  clavePublica: 'QU8t-8ZyBlO4O4jDY',
};

const MARCA = 'BARBER STUDIO JP';

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// cita: { nombre, celular, email, servicio, duracion, fecha, hora, codigo, total, adelanto, saldo, metodo, operacion }
const filasCita = (c) => [
  ['Cliente', c.nombre],
  ['Celular', c.celular],
  ['Correo', c.email],
  ['Servicio', c.duracion ? `${c.servicio} (${duracionTexto(c.duracion)})` : c.servicio],
  ['Fecha', c.fecha],
  ['Hora', c.hora],
  ['Total', soles(c.total)],
  ['Adelanto', soles(c.adelanto)],
  ['Restante (en el local)', soles(c.saldo)],
  ['Pago', c.operacion ? `${c.metodo} · Op. ${c.operacion}` : c.metodo],
  ['Código', c.codigo, '#ffd700'],
].filter(([, valor]) => valor != null && valor !== '');

const html = ({ intro, filas, estado, boton }) => `
<div style="font-family: Arial, Helvetica, sans-serif; background-color: #000000; color: #ffffff; padding: 32px 14px;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #0b0b0b; border: 1px solid #2a2a2a; border-radius: 14px; padding: 28px 24px;">
    <div style="text-align: center; border-bottom: 1px solid #2a2a2a; padding-bottom: 18px; margin-bottom: 22px;">
      <h1 style="font-size: 20px; letter-spacing: 4px; margin: 0; color: #ffffff;">${MARCA}</h1>
      <p style="font-size: 11px; color: #888888; margin: 6px 0 0; letter-spacing: 2px;">ESTILO &amp; ELEGANCIA MASCULINA</p>
    </div>
    <p style="font-size: 15px; line-height: 1.6; color: #dddddd; margin: 0 0 18px;">${intro}</p>
    <div style="text-align: center; margin: 0 0 18px;">
      <span style="display: inline-block; padding: 7px 14px; border-radius: 999px; font-size: 12px; font-weight: bold; letter-spacing: 1px; color: ${estado.color}; border: 1px solid ${estado.color};">${esc(estado.texto)}</span>
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #111111; border: 1px dashed #3a3a3a; border-radius: 10px; font-size: 13px;">
      ${filas.map(([etiqueta, valor, color]) => `
      <tr>
        <td style="padding: 9px 14px; color: #888888; border-bottom: 1px solid #1f1f1f;">${esc(etiqueta)}</td>
        <td style="padding: 9px 14px; color: ${color || '#ffffff'}; font-weight: bold; text-align: right; border-bottom: 1px solid #1f1f1f;">${esc(valor)}</td>
      </tr>`).join('')}
    </table>
    ${boton ? `
    <div style="text-align: center; margin: 24px 0 6px;">
      <a href="${esc(boton.url)}" style="display: inline-block; padding: 14px 26px; border-radius: 10px; background-color: #742582; color: #ffffff; font-weight: bold; font-size: 14px; text-decoration: none;">${esc(boton.texto)}</a>
      <p style="font-size: 11px; color: #777777; margin: 10px 0 0; word-break: break-all;">${esc(boton.url)}</p>
    </div>` : ''}
    <p style="font-size: 11px; line-height: 1.6; color: #666666; margin: 22px 0 0; text-align: center;">© ${new Date().getFullYear()} ${MARCA}</p>
  </div>
</div>`;

const texto = ({ introTexto, filas, estado, boton }) => [
  MARCA,
  '',
  introTexto,
  '',
  `Estado: ${estado.texto}`,
  ...filas.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`),
  ...(boton ? ['', `${boton.texto}: ${boton.url}`] : []),
].join('\n');

// Mismas variables que ya usaban las plantillas de EmailJS (con sus alias)
const parametros = (c, { asunto, nombreVisible, mensajeHtml, mensajeTexto, estado }) => ({
  asunto,
  subject: asunto,
  nombre: nombreVisible || c.nombre,
  cliente: c.nombre,
  user_name: c.nombre,
  name: c.nombre,
  celular: c.celular,
  user_phone: c.celular,
  phone: c.celular,
  telefono: c.celular,
  email: c.email,
  user_email: c.email,
  correo: c.email,
  fecha: c.fecha,
  hora: c.hora,
  codigo: c.codigo,
  codigo_reserva: c.codigo,
  metodo_pago: c.metodo,
  celular_pago: c.operacion || c.celular,
  estado,
  mensaje: mensajeTexto,
  message: mensajeTexto,
  mensaje_html: mensajeHtml,
  message_html: mensajeHtml,
});

// 📩 Al admin: llegó una reserva. Si es Yape directo, con el botón para verificarlo en el panel.
export const enviarCorreoAdmin = (c, { pendiente, panelUrl }) => {
  const estado = pendiente
    ? { texto: 'YAPE POR VERIFICAR', color: '#d68bf2' }
    : { texto: 'PAGADA Y CONFIRMADA', color: '#00e676' };
  const filas = filasCita(c);
  const boton = { texto: pendiente ? 'Revisar y aprobar el Yape' : 'Ver en el panel', url: panelUrl };
  const intro = pendiente
    ? `<strong>${esc(c.nombre)}</strong> reservó y subió la captura de su Yape. Revisa tu app de Yape y aprueba o rechaza el pago en el panel.`
    : `<strong>${esc(c.nombre)}</strong> reservó y pagó su adelanto.`;
  const introTexto = pendiente
    ? `${c.nombre} reservó y subió la captura de su Yape. Verifícalo en el panel.`
    : `${c.nombre} reservó y pagó su adelanto.`;
  const asunto = pendiente
    ? `💜 Yape por verificar: ${c.nombre} · ${c.fecha} ${c.hora}`
    : `📅 Nueva reserva: ${c.nombre} · ${c.fecha} ${c.hora}`;
  return emailjs.send(EMAILJS.servicio, EMAILJS.plantillaAdmin, parametros(c, {
    asunto,
    estado: estado.texto,
    mensajeHtml: html({ intro, filas, estado, boton }),
    mensajeTexto: texto({ introTexto, filas, estado, boton }),
  }), EMAILJS.clavePublica);
};

// ✅ Al cliente: SOLO cuando su cita ya está confirmada (pago aprobado)
export const enviarCorreoClienteConfirmada = (c, { webUrl }) => {
  const estado = { texto: 'CITA CONFIRMADA', color: '#00e676' };
  const filas = filasCita(c);
  const boton = webUrl ? { texto: 'Ver mi reserva', url: `${webUrl}/perfil` } : null;
  const conAdelanto = Number(c.adelanto) > 0;
  const intro = conAdelanto
    ? `Hola <strong>${esc(c.nombre)}</strong>, recibimos tu adelanto y tu cita está <strong>confirmada</strong>. El restante lo pagas en el local el día de tu cita. ¡Te esperamos!`
    : `Hola <strong>${esc(c.nombre)}</strong>, tu cita está <strong>confirmada</strong>. El total lo pagas en el local el día de tu cita. ¡Te esperamos!`;
  const introTexto = `Hola ${c.nombre}, tu cita está confirmada. ¡Te esperamos!`;
  return emailjs.send(EMAILJS.servicio, EMAILJS.plantillaCliente, parametros(c, {
    asunto: `✅ Cita confirmada · ${c.fecha} ${c.hora} · ${MARCA}`,
    estado: 'CONFIRMADA',
    mensajeHtml: html({ intro, filas, estado, boton }),
    mensajeTexto: texto({ introTexto, filas, estado, boton }),
  }), EMAILJS.clavePublica);
};

// ✉️ Formulario de Contacto: aviso al admin + copia de cortesía al visitante (mismas dos plantillas)
export const enviarCorreosContacto = async ({ nombre, email, telefono, mensaje }) => {
  const filas = [['Nombre', nombre], ['Correo', email], ['Teléfono', telefono], ['Mensaje', mensaje]].filter(([, v]) => v);
  const base = { nombre, email, celular: telefono };
  const extra = { message: mensaje, mensaje_contacto: mensaje };

  const estadoAdmin = { texto: 'NUEVO MENSAJE', color: '#e3b95b' };
  const introAdmin = `<strong>${esc(nombre)}</strong> te escribió desde el formulario de contacto. Responde a este correo para contestarle.`;
  await emailjs.send(EMAILJS.servicio, EMAILJS.plantillaAdmin, {
    ...parametros(base, {
      asunto: `✉️ Nuevo mensaje de ${nombre}`,
      estado: estadoAdmin.texto,
      mensajeHtml: html({ intro: introAdmin, filas, estado: estadoAdmin }),
      mensajeTexto: texto({ introTexto: `${nombre} te escribió desde el formulario de contacto.`, filas, estado: estadoAdmin }),
    }),
    ...extra,
  }, EMAILJS.clavePublica);

  const estadoCliente = { texto: 'MENSAJE RECIBIDO', color: '#00e676' };
  const introCliente = `Hola <strong>${esc(nombre)}</strong>, recibimos tu mensaje. Muy pronto uno de nuestros barberos te responderá personalmente.`;
  await emailjs.send(EMAILJS.servicio, EMAILJS.plantillaCliente, {
    ...parametros(base, {
      asunto: `Recibimos tu mensaje · ${MARCA}`,
      estado: estadoCliente.texto,
      mensajeHtml: html({ intro: introCliente, filas, estado: estadoCliente }),
      mensajeTexto: texto({ introTexto: `Hola ${nombre}, recibimos tu mensaje. Muy pronto te responderemos.`, filas, estado: estadoCliente }),
    }),
    ...extra,
  }, EMAILJS.clavePublica);
};

// Reserva de la base de datos → datos para el correo
export const citaDesdeReserva = (r) => ({
  nombre: String(r.nombre || '').split(' (')[0].trim(),
  celular: r.celular,
  email: r.email,
  servicio: r.servicio,
  duracion: r.duracion_min,
  fecha: r.fecha_cita,
  hora: r.hora_cita,
  codigo: r.codigo,
  total: r.total,
  adelanto: r.adelanto,
  saldo: r.saldo,
  metodo: r.pago_metodo === 'yape_manual' ? 'Yape directo' : 'Yape',
  operacion: r.yape_operacion,
});
