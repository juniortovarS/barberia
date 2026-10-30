require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const mercadopago = require("mercadopago");
const { createClient } = require("@supabase/supabase-js");
const { crearClienteMP, verificarFirmaWebhook } = require("./mercadopago-orders");
const { crearServicioPagos, crearRepositorioSupabase } = require("./pagos-reserva");
const yapeManual = require("./yape-manual");

// ✅ Variables de entorno obligatorias (configúralas en Render → Environment)
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || "https://cywgxsocudepyejqnuuc.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY; // service_role key (solo en el servidor)
// Clave secreta de los webhooks (Tus integraciones → Webhooks → Clave secreta)
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;
const RESERVA_MONTO = Number(process.env.RESERVA_MONTO || 20); // adelanto por reserva
const ADMIN_PHONE = process.env.ADMIN_PHONE || "+51951038509";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "juniortovaradmin@gmail.com,juniortovar601@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "https://barberiajuniortovar.onrender.com,http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// 💜 Cómo paga el cliente el adelanto: "manual" (Yape directo + captura, lo aprueba el admin) o "mercadopago" (código de aprobación)
const PAGO_YAPE_MODO = process.env.PAGO_YAPE_MODO === "mercadopago" ? "mercadopago" : "manual";
const YAPE_NUMERO = (process.env.YAPE_NUMERO || ADMIN_PHONE).replace(/\D/g, "").slice(-9);
const YAPE_TITULAR = process.env.YAPE_TITULAR || "Barber Studio JP";
const YAPE_QR_URL = process.env.YAPE_QR_URL || null; // imagen pública del QR de Yape (opcional)
// Firma los enlaces de seguimiento que recibe el cliente (si no se define, se deriva de SUPABASE_KEY)
const SEGUIMIENTO_SECRET = process.env.SEGUIMIENTO_SECRET || SUPABASE_KEY || "seguimiento-local";

// Monto mínimo que Mercado Pago acepta en un cobro con Yape
const MINIMO_YAPE = 2;

if (!MP_ACCESS_TOKEN) console.warn("⚠️ Falta MP_ACCESS_TOKEN: los pagos con Mercado Pago/Yape no funcionarán.");
if (!SUPABASE_KEY) console.warn("⚠️ Falta SUPABASE_KEY: no se podrá guardar en Supabase.");

const app = express();
app.set("trust proxy", 1); // Render está detrás de un proxy: req.ip debe ser la IP real del cliente
// La captura del Yape viaja en base64: solo esa ruta acepta cuerpos grandes
const RUTA_YAPE_MANUAL = "/reservas/yape-manual";
const jsonNormal = express.json({ limit: "1mb" });
app.use((req, res, next) => (req.path === RUTA_YAPE_MANUAL ? next() : jsonNormal(req, res, next)));
app.use(cors({ origin: CORS_ORIGINS }));

// =====================================================================
// 💈 Catálogo de servicios (el precio y la duración los decide el servidor)
// =====================================================================
const SERVICIOS = [
  { id: "ritual-barba", nombre: "Ritual de barba", duracion: 30, precio: 30 },
  { id: "servicio-basico", nombre: "Servicio Básico", duracion: 75, precio: 50 },
  { id: "limpieza-facial", nombre: "Limpieza Facial Profunda", duracion: 45, precio: 60 },
  { id: "servicio-premium", nombre: "Servicio Premium", duracion: 90, precio: 80 },
  { id: "hair-care", nombre: "Hair Care", duracion: 105, precio: 90 },
  { id: "servicio-presidencial", nombre: "Servicio Presidencial", duracion: 105, precio: 100 },
  { id: "camuflaje-canas", nombre: "Camuflaje de canas", duracion: 105, precio: 100 },
  { id: "hidratacion-capilar", nombre: "Hidratación Capilar", duracion: 30, precio: 40 },
  { id: "semi-ondulacion", nombre: "Semi Ondulación", duracion: 180, precio: 200 },
  { id: "ondulacion-permanente", nombre: "Ondulación Permanente", duracion: 180, precio: 200 },
  { id: "parche-anti-ojeras", nombre: "Parche Anti Ojeras", duracion: 15, precio: 5 },
];
const servicioPorId = (id) => SERVICIOS.find((s) => s.id === id);

// Horario de atención (igual que src/utils/horario.js). null = cerrado
const HORARIO_ATENCION = {
  0: null,
  1: ["09:00", "20:00"], 2: ["09:00", "20:00"], 3: ["09:00", "20:00"],
  4: ["09:00", "20:00"], 5: ["09:00", "20:00"], 6: ["09:00", "18:00"],
};

const redondear = (n) => Math.round(n * 100) / 100;

// Total con descuento del Club, adelanto que se cobra hoy y saldo a pagar en el local
const calcularMontos = (servicio, descuentoPct = 0) => {
  const total = redondear(servicio.precio * (1 - descuentoPct / 100));
  let adelanto = Math.min(RESERVA_MONTO, total);
  // Yape no cobra montos menores a S/ 2: si el saldo quedaría por debajo, se cobra todo de una vez
  if (total - adelanto > 0 && total - adelanto < MINIMO_YAPE) adelanto = total;
  const saldo = redondear(total - adelanto);
  return { total, adelanto: redondear(adelanto), saldo };
};

// =====================================================================
// 📣 Notificaciones
// =====================================================================
const formatPeruNumber = (num) => {
  const clean = String(num).replace(/\s+/g, "");
  return clean.startsWith("+") ? clean : `+51${clean}`;
};

const sendSMS = async (to, text) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.warn("⚠️ SMS no enviado: Falta configurar credenciales de Twilio en el entorno.");
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: fromNumber, Body: text });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const result = await response.json();
    if (response.ok) console.log(`✅ SMS enviado a ${to}. SID: ${result.sid}`);
    else console.error(`❌ Error de Twilio al enviar a ${to}:`, result.message);
  } catch (err) {
    console.error(`❌ Error de red al enviar SMS a ${to}:`, err.message);
  }
};

const notificarReserva = async ({ nombre, celular, fecha_cita, hora_cita, codigo, estado, servicio }) => {
  const adminMsg = `¡Nueva Reserva [${estado}]!\nCliente: ${nombre}\nServicio: ${servicio || "-"}\nCelular: ${celular}\nFecha: ${fecha_cita}\nHora: ${hora_cita}\nCódigo: ${codigo || "N/A"}`;
  await sendSMS(ADMIN_PHONE, adminMsg);

  const statusMsg = estado === "approved" ? "ha sido CONFIRMADA" : "está PENDIENTE de aprobación";
  const clientMsg = `Barber Studio JP: Tu cita (${servicio || "servicio"}) del ${fecha_cita} a las ${hora_cita} ${statusMsg}. Código: ${codigo || "N/A"}.`;
  await sendSMS(formatPeruNumber(celular), clientMsg);
};

// =====================================================================
// 🔴 Tiempo real para el panel admin (Server-Sent Events)
// =====================================================================
const clientesEnVivo = new Set();
// Clientes siguiendo su propia reserva (pantalla "verificando tu pago"): código → conexiones
const seguidores = new Map();

const abrirSSE = (req, res, alCerrar) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const latido = setInterval(() => res.write(`: latido\n\n`), 25000);
  req.on("close", () => {
    clearInterval(latido);
    alCerrar();
  });
};

const emitirEvento = (tipo, datos) => {
  const mensaje = `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
  clientesEnVivo.forEach((res) => res.write(mensaje));
  // El cliente solo recibe el estado de su reserva
  const codigo = datos?.reserva?.codigo;
  if (codigo && seguidores.has(codigo)) {
    const publico = `event: estado\ndata: ${JSON.stringify(yapeManual.estadoPublico(datos.reserva))}\n\n`;
    seguidores.get(codigo).forEach((res) => res.write(publico));
  }
};

// =====================================================================
// 🔌 Servicios externos
// =====================================================================
mercadopago.configure({ access_token: MP_ACCESS_TOKEN || "" });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY || "missing-key");

// La tabla necesita las columnas de supabase/migracion_servicios_y_saldo.sql
let esquemaListo = false;
const verificarEsquema = async () => {
  if (esquemaListo) return true;
  const { error } = await supabase.from("reservas").select("servicio_id, duracion_min, saldo_estado").limit(1);
  esquemaListo = !error;
  if (error) console.warn("⚠️ Falta ejecutar supabase/migracion_servicios_y_saldo.sql en Supabase:", error.message);
  return esquemaListo;
};

// Los cobros con Yape necesitan la tabla de supabase/migracion_pagos_yape.sql
let pagosListos = false;
const verificarEsquemaPagos = async () => {
  if (pagosListos) return true;
  const { error } = await supabase.from("pagos_yape").select("id").limit(1);
  pagosListos = !error;
  if (error) console.warn("⚠️ Falta ejecutar supabase/migracion_pagos_yape.sql en Supabase:", error.message);
  return pagosListos;
};
verificarEsquema();

const MENSAJE_SIN_MIGRACION = "El sistema de reservas se está actualizando. Inténtalo en unos minutos.";

// 🔐 Usuario de la sesión de Supabase (verificado en el servidor), o null si no hay sesión válida
const obtenerUsuario = async (req) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data?.user ? null : data.user;
};

const esAdministrador = (user) =>
  user?.app_metadata?.role === "admin" || ADMIN_EMAILS.includes((user?.email || "").toLowerCase());

// 🔐 Middleware: solo administradores
const requireAdmin = async (req, res, next) => {
  const user = await obtenerUsuario(req);
  if (!user) return res.status(401).json({ error: "No autenticado" });
  if (!esAdministrador(user)) return res.status(403).json({ error: "Acceso restringido a administradores" });
  req.user = user;
  next();
};

const generarCodigo = (prefijo = "RES") => `${prefijo}-${crypto.randomInt(100000, 1000000)}`;

// =====================================================================
// 🗓️ Horarios
// =====================================================================
// "09:30 a. m.", "09:30 AM" o "21:30" -> "21:30" (las horas se guardaron con distintos formatos)
const normalizarHora = (hora) => {
  const m = String(hora || "").toLowerCase().match(/(\d{1,2}):(\d{2})\s*([ap])?/);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3] === "p" && h < 12) h += 12;
  if (m[3] === "a" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
};

const aMinutos = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const deMinutos = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;

// Bloques ocupados del día: [{ inicio: "09:00", fin: "10:15" }]
const bloquesOcupados = async (fecha_cita) => {
  const consultar = (columnas) => supabase
    .from("reservas")
    .select(columnas)
    .eq("fecha_cita", fecha_cita)
    .neq("estado", "cancelled");
  let { data, error } = await consultar("hora_cita, duracion_min");
  // Sin la migración aún no existe duracion_min: se asume 30 min por cita
  if (error) ({ data, error } = await consultar("hora_cita"));
  if (error) throw error;
  return data
    .map((r) => {
      const inicio = normalizarHora(r.hora_cita);
      if (!inicio) return null;
      return { inicio, fin: deMinutos(aMinutos(inicio) + (r.duracion_min || 30)) };
    })
    .filter(Boolean);
};

// null si el turno es válido; si no, el motivo
const validarTurno = async (fecha_cita, hora_cita, duracion) => {
  const [y, mo, d] = fecha_cita.split("-").map(Number);
  const horario = HORARIO_ATENCION[new Date(y, mo - 1, d).getDay()];
  const inicio = normalizarHora(hora_cita);
  if (!horario || !inicio) return "Ese día no atendemos.";
  const t0 = aMinutos(inicio);
  const t1 = t0 + duracion;
  if (t0 < aMinutos(horario[0]) || t1 > aMinutos(horario[1])) {
    return "El servicio no alcanza a terminar antes del cierre. Elige una hora más temprano.";
  }
  const choca = (await bloquesOcupados(fecha_cita)).some((b) => t0 < aMinutos(b.fin) && aMinutos(b.inicio) < t1);
  return choca ? "Ese horario acaba de ser reservado. Elige otra hora." : null;
};

// =====================================================================
// 🎖️ Club de fidelidad
// =====================================================================
const NIVELES_FIDELIDAD = [
  { nombre: "Clásico", minimo: 0, descuento: 0 },
  { nombre: "Plata", minimo: 5, descuento: 10 },
  { nombre: "Oro", minimo: 10, descuento: 15 },
  { nombre: "Black", minimo: 20, descuento: 20 },
];

const resumenFidelidad = (reservas) => {
  const nivel = [...NIVELES_FIDELIDAD].reverse().find((n) => reservas >= n.minimo);
  const siguiente = NIVELES_FIDELIDAD.find((n) => n.minimo > reservas) || null;
  return {
    reservas,
    nivel: nivel.nombre,
    descuento: nivel.descuento,
    siguiente: siguiente && { ...siguiente, faltan: siguiente.minimo - reservas },
  };
};

// Descuento de fidelidad: solo si la reserva se hace con la cuenta iniciada y su mismo correo
const fidelidadDeReserva = async (req, email) => {
  try {
    const user = await obtenerUsuario(req);
    if (user?.email && user.email.toLowerCase() === String(email).toLowerCase()) {
      return resumenFidelidad(await contarReservasAprobadas(user.email));
    }
  } catch (err) {
    console.warn("⚠️ No se pudo calcular la fidelidad:", err.message);
  }
  return null;
};

const contarReservasAprobadas = async (email) => {
  const correos = [...new Set([email, email.toLowerCase()])];
  const { count, error } = await supabase
    .from("reservas")
    .select("id", { count: "exact", head: true })
    .in("email", correos)
    .eq("estado", "approved");
  if (error) throw error;
  return count || 0;
};

// =====================================================================
// 💜 Cobro con Yape (código de aprobación) vía API de Orders de Mercado Pago
// =====================================================================
const MENSAJES_RECHAZO = {
  required_call_for_authorize: "Yape no autorizó el pago. Revisa tu app de Yape e inténtalo de nuevo.",
  insufficient_amount: "Saldo insuficiente o superaste tu límite diario de Yape.",
  max_attempts_exceeded: "Superaste el número de intentos permitidos. Genera un nuevo código en Yape.",
  invalid_card_token: "El código de aprobación ya expiró o no es válido. Genera uno nuevo en Yape.",
  bad_filled_card_data: "Revisa el número de celular y el código de aprobación.",
  processing_error: "Yape no pudo procesar el pago. Inténtalo de nuevo en unos minutos.",
  rejected_by_issuer: "Yape rechazó el pago. Verifica que el celular sea el de tu cuenta Yape y genera un código nuevo.",
};
// Rechazo del antifraude de Mercado Pago: es una decisión de su sistema de riesgo, no se debe insistir
["high_risk", "cc_rejected_high_risk", "rejected_high_risk"].forEach((k) => {
  MENSAJES_RECHAZO[k] = "Mercado Pago no aprobó este pago por sus controles de seguridad. No se realizó ningún cobro. Escríbenos por WhatsApp para coordinar tu adelanto.";
});

const mp = crearClienteMP({ accessToken: MP_ACCESS_TOKEN });
const huellaDe = (datos) => crypto.createHash("sha256").update(JSON.stringify(datos)).digest("hex");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// La clave de idempotencia es la del intento del cliente (un intento = un código de Yape); si no la envía, una nueva
const claveIntento = (intentoId) => (UUID_RE.test(String(intentoId || "")) ? String(intentoId).toLowerCase() : crypto.randomUUID());

const repoPagos = crearRepositorioSupabase(supabase);
const pagos = crearServicioPagos({
  repo: repoPagos,
  mp,
  construirReserva: ({ nombre_cliente, nota_pago, nota_club, ...reserva }, pago) => ({
    ...reserva,
    nombre: `${nombre_cliente} (${nota_pago} - Op: ${pago.mp_order_id}${nota_club || ""} - Estado: APPROVED)`,
    pago_adelanto_id: String(pago.mp_order_id),
  }),
  construirSaldo: (pago) => ({
    saldo_estado: "pagado",
    saldo_metodo: "yape",
    saldo_pagado_en: new Date().toISOString(),
    pago_saldo_id: String(pago.mp_order_id),
  }),
  alConfirmar: async ({ pago, reserva }) => {
    if (pago.tipo === "adelanto") {
      emitirEvento("reserva", { tipo: "nueva", reserva });
      await notificarReserva({
        nombre: pago.reserva_payload.nombre_cliente,
        celular: reserva.celular,
        fecha_cita: reserva.fecha_cita,
        hora_cita: reserva.hora_cita,
        codigo: reserva.codigo,
        estado: "approved",
        servicio: reserva.servicio,
      });
    } else {
      emitirEvento("reserva", { tipo: "saldo_pagado", reserva });
      await sendSMS(ADMIN_PHONE, `💰 ${String(reserva.nombre).split(" (")[0]} pagó el restante de S/ ${Number(pago.monto).toFixed(2)} con Yape (${reserva.servicio || "servicio"}).`);
    }
  },
});

// Respuesta HTTP para todo resultado que no sea "confirmado"
const respuestaNoConfirmada = (r, codigo) => {
  const op = r.pago?.mp_order_id;
  switch (r.estado) {
    case "ocupado":
      return [409, { error: "Ese horario acaba de ser reservado. Elige otra hora." }];
    case "clave_reutilizada":
      return [409, { error: "Este intento de pago ya se usó para otra operación. Recarga la página e inténtalo de nuevo." }];
    case "en_proceso":
    case "verificando":
      return [504, {
        error: `No pudimos confirmar todavía el estado de tu pago (código ${codigo}). NO vuelvas a pagar: lo verificaremos automáticamente y lo verás en tu perfil, o escríbenos por WhatsApp con ese código.`,
        codigo,
      }];
    case "aprobado_sin_reserva":
      return [500, {
        error: `Tu pago fue aprobado (operación ${op}) pero hubo un problema guardando la cita. La registraremos automáticamente; si no la ves en unos minutos, escríbenos por WhatsApp con ese número.`,
        codigo,
        payment_id: op,
      }];
    case "rechazado":
      return [402, { error: MENSAJES_RECHAZO[r.pago?.mp_status_detail] || "El pago con Yape fue rechazado. No se realizó ningún cobro.", codigo }];
    case "liberado":
      return [409, { error: "Este intento de pago fue anulado. Inténtalo de nuevo con un código nuevo.", codigo }];
    default:
      return [402, { error: "No se pudo procesar el pago con Yape. No se realizó ningún cobro. Genera un nuevo código e inténtalo otra vez.", codigo }];
  }
};

// =====================================================================
// 💜 Yape directo: el cliente yapea, sube la captura y el administrador lo verifica
// =====================================================================
const repoManual = yapeManual.crearRepositorioYapeManual(supabase);
const pagosManuales = yapeManual.crearServicioYapeManual({
  repo: repoManual,
  emitir: emitirEvento,
  alRegistrar: async ({ reserva, panelUrl }) => {
    const cliente = String(reserva.nombre).split(" (")[0];
    const cita = `${reserva.servicio || "servicio"} - ${reserva.fecha_cita} ${reserva.hora_cita}`;
    await sendSMS(ADMIN_PHONE, `💜 Nuevo Yape por verificar: S/ ${Number(reserva.adelanto).toFixed(2)} de ${cliente} (Op. ${reserva.yape_operacion}). Cita: ${cita}. Revísalo y apruébalo aquí: ${panelUrl}`);
    await sendSMS(formatPeruNumber(reserva.celular), `Barber Studio JP: Recibimos tu Yape para ${cita}. Tu horario está separado; te confirmamos en minutos. Código: ${reserva.codigo}.`);
  },
  alVerificar: async ({ reserva, decision }) => {
    const cita = `${reserva.servicio || "tu cita"} del ${reserva.fecha_cita} a las ${reserva.hora_cita}`;
    const texto = decision === "aprobar"
      ? `Barber Studio JP: ¡Recibimos tu Yape! Tu cita (${cita}) está CONFIRMADA. Código: ${reserva.codigo}.`
      : `Barber Studio JP: No pudimos validar tu Yape para ${cita}. ${reserva.pago_motivo_rechazo || ""} Escríbenos por WhatsApp al ${YAPE_NUMERO}. Código: ${reserva.codigo}.`;
    await sendSMS(formatPeruNumber(reserva.celular), texto);
  },
});

// Yape directo necesita supabase/migracion_yape_manual.sql y el bucket privado de comprobantes
let manualListo = false;
const verificarEsquemaManual = async () => {
  if (manualListo) return true;
  const { error } = await supabase.from("reservas").select("pago_metodo, yape_operacion, pago_motivo_rechazo").limit(1);
  if (error) {
    console.warn("⚠️ Falta ejecutar supabase/migracion_yape_manual.sql en Supabase:", error.message);
    return false;
  }
  try {
    await repoManual.asegurarBucket();
    manualListo = true;
  } catch (err) {
    console.warn("⚠️ No se pudo preparar el bucket de comprobantes:", err.message);
  }
  return manualListo;
};
if (SUPABASE_KEY && PAGO_YAPE_MODO === "manual") verificarEsquemaManual();

// Enlace al panel para el SMS del admin: la web desde donde se reservó (localhost en pruebas, el dominio real en producción).
// Solo se usan orígenes permitidos en CORS_ORIGINS; PANEL_URL lo fija a mano si hace falta.
const urlPanel = (req) => {
  if (process.env.PANEL_URL) return process.env.PANEL_URL;
  const origen = req.headers.origin;
  return `${CORS_ORIGINS.includes(origen) ? origen : CORS_ORIGINS[0]}/admin`;
};

// Evita que alguien llene la agenda con comprobantes falsos
// LIMITES_RESERVA=off los desactiva (solo para pruebas locales; en producción deben quedar activos)
const LIMITES_ACTIVOS = process.env.LIMITES_RESERVA !== "off";
if (!LIMITES_ACTIVOS) console.warn("⚠️ LIMITES_RESERVA=off: sin límite de intentos ni de reservas pendientes (solo para pruebas).");
const limiteManualPorIp = yapeManual.crearLimitador({ maximo: 6, ventanaMs: 60 * 60 * 1000 });
const MAX_PENDIENTES_POR_CLIENTE = 2;

// =====================================================================
// 🌐 Rutas públicas
// =====================================================================
app.get("/test", (_, res) => {
  res.json({ message: "✅ Backend Supabase funcionando correctamente" });
});

// ⚙️ Configuración pública para el frontend
app.get("/config-pago", (_, res) => {
  res.json({
    monto: RESERVA_MONTO,
    moneda: "PEN",
    niveles: NIVELES_FIDELIDAD,
    servicios: SERVICIOS,
    yape: { modo: PAGO_YAPE_MODO, numero: YAPE_NUMERO, titular: YAPE_TITULAR, qr: YAPE_QR_URL },
  });
});

app.get("/servicios", (_, res) => res.json(SERVICIOS));

// 🗓️ Bloques ya reservados de un día (sin datos personales)
app.get("/disponibilidad", async (req, res) => {
  const { fecha } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) {
    return res.status(400).json({ error: "Fecha inválida" });
  }
  try {
    res.set("Cache-Control", "no-store");
    const bloques = await bloquesOcupados(fecha);
    res.json({ fecha, bloques, ocupadas: bloques.map((b) => b.inicio) });
  } catch (err) {
    console.error("❌ Error consultando disponibilidad:", err.message);
    res.status(500).json({ error: "No se pudo consultar la disponibilidad" });
  }
});

// 🎖️ Nivel de fidelidad del usuario con sesión iniciada
app.get("/fidelidad", async (req, res) => {
  const user = await obtenerUsuario(req);
  if (!user?.email) return res.status(401).json({ error: "Inicia sesión para ver tu nivel" });
  try {
    res.json({ ...resumenFidelidad(await contarReservasAprobadas(user.email)), niveles: NIVELES_FIDELIDAD });
  } catch (err) {
    console.error("❌ Error calculando fidelidad:", err.message);
    res.status(500).json({ error: "No se pudo calcular tu nivel" });
  }
});

// 💜 Nueva reserva: se cobra el adelanto con Yape y solo se guarda si Mercado Pago lo aprueba
app.post("/reservas/pagar-yape", async (req, res) => {
  const { nombre, celular, email, fecha_cita, hora_cita, yape_token, celular_yape, servicio_id, device_id, intento_id } = req.body;

  if (!nombre || !celular || !email || !fecha_cita || !hora_cita || !yape_token || !servicio_id) {
    return res.status(400).json({ error: "⚠️ Faltan datos obligatorios" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_cita) || !normalizarHora(hora_cita)) {
    return res.status(400).json({ error: "Fecha u hora inválida" });
  }
  const servicio = servicioPorId(servicio_id);
  if (!servicio) return res.status(400).json({ error: "Servicio no válido" });
  if (!MP_ACCESS_TOKEN) return res.status(503).json({ error: "El pago con Yape no está configurado todavía." });
  if (!(await verificarEsquema()) || !(await verificarEsquemaPagos())) return res.status(503).json({ error: MENSAJE_SIN_MIGRACION });

  // Verificación rápida (horario de atención y cruces). La definitiva y atómica la hace iniciar_pago_yape en Supabase.
  try {
    const problema = await validarTurno(fecha_cita, hora_cita, servicio.duracion);
    if (problema) return res.status(409).json({ error: problema });
  } catch (err) {
    console.error("❌ Error verificando disponibilidad:", err.message);
    return res.status(500).json({ error: "No se pudo verificar la disponibilidad" });
  }

  const fidelidad = await fidelidadDeReserva(req, email);
  const descuentoPct = fidelidad?.descuento || 0;
  const { total, adelanto, saldo } = calcularMontos(servicio, descuentoPct);
  const codigo = generarCodigo();
  const inicio = aMinutos(normalizarHora(hora_cita));
  const celularPago = celular_yape || celular;

  // Datos de la cita: se guardan con el intento y la reserva se crea solo cuando el pago está aprobado
  const payload = {
    nombre_cliente: nombre,
    nota_pago: `YAPE Ref: ${codigo} - Cel: ${celularPago}`,
    nota_club: descuentoPct ? ` - CLUB ${fidelidad.nivel.toUpperCase()} ${descuentoPct}% DSCTO` : "",
    celular,
    email,
    fecha_cita,
    hora_cita,
    fecha_registro: new Date().toISOString(),
    codigo,
    estado: "approved",
    voucher_url: null,
    servicio_id: servicio.id,
    servicio: servicio.nombre,
    duracion_min: servicio.duracion,
    precio: servicio.precio,
    descuento_pct: descuentoPct,
    total,
    adelanto,
    saldo,
    saldo_estado: saldo > 0 ? "pendiente" : "no_aplica",
  };

  let r;
  try {
    r = await pagos.cobrar({
      clave: claveIntento(intento_id),
      huella: huellaDe({ tipo: "adelanto", email: String(email).toLowerCase(), servicio: servicio.id, fecha_cita, hora_cita, adelanto }),
      tipo: "adelanto",
      referencia: codigo,
      monto: adelanto,
      fecha: fecha_cita,
      inicio,
      fin: inicio + servicio.duracion,
      payload,
      cobro: {
        email,
        celular: celularPago,
        token: yape_token,
        descripcion: `Adelanto ${servicio.nombre} - ${fecha_cita} ${hora_cita}`,
        deviceId: device_id,
      },
    });
  } catch (err) {
    // Falló el registro del intento: todavía no se llamó a Mercado Pago
    console.error("❌ No se pudo registrar el intento de pago:", err.message);
    return res.status(503).json({ error: "No pudimos iniciar el pago. No se realizó ningún cobro; inténtalo en unos segundos." });
  }

  if (r.estado !== "confirmado") {
    const [status, cuerpo] = respuestaNoConfirmada(r, r.pago?.referencia || codigo);
    return res.status(status).json(cuerpo);
  }

  // En un reintento con la misma clave se devuelve la reserva original
  const datos = r.pago.reserva_payload || payload;
  res.json({
    message: "✅ Pago aprobado y cita registrada",
    codigo: r.pago.referencia,
    estado: "approved",
    payment_id: r.pago.mp_order_id,
    servicio: datos.servicio,
    total: Number(datos.total),
    adelanto: Number(datos.adelanto),
    saldo: Number(datos.saldo),
    descuento_aplicado: datos.descuento_pct,
    // Nivel actualizado contando esta reserva
    fidelidad: fidelidad && !r.repetido ? resumenFidelidad(fidelidad.reservas + 1) : null,
  });
});

// 💜 Nueva reserva con Yape directo: el cliente ya yapeó y sube la captura. Queda "pending" hasta que el admin verifica.
app.post(RUTA_YAPE_MANUAL, express.json({ limit: "7mb" }), async (req, res) => {
  const { nombre, celular, email, fecha_cita, hora_cita, servicio_id, operacion, comprobante } = req.body || {};

  if (!nombre || !celular || !email || !fecha_cita || !hora_cita || !servicio_id) {
    return res.status(400).json({ error: "⚠️ Faltan datos obligatorios" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_cita) || !normalizarHora(hora_cita)) {
    return res.status(400).json({ error: "Fecha u hora inválida" });
  }
  const servicio = servicioPorId(servicio_id);
  if (!servicio) return res.status(400).json({ error: "Servicio no válido" });
  const numeroOperacion = yapeManual.normalizarOperacion(operacion);
  if (!numeroOperacion) {
    return res.status(400).json({ error: "Escribe el Nº de operación que aparece en tu constancia de Yape." });
  }
  const archivo = yapeManual.decodificarComprobante(comprobante);
  if (archivo.error) return res.status(400).json({ error: archivo.error });

  if (LIMITES_ACTIVOS && !limiteManualPorIp(req.ip)) {
    return res.status(429).json({ error: "Demasiados intentos seguidos. Escríbenos por WhatsApp y te ayudamos." });
  }
  if (!(await verificarEsquema()) || !(await verificarEsquemaManual())) {
    return res.status(503).json({ error: MENSAJE_SIN_MIGRACION });
  }

  try {
    const problema = await validarTurno(fecha_cita, hora_cita, servicio.duracion);
    if (problema) return res.status(409).json({ error: problema });
    if (LIMITES_ACTIVOS && (await repoManual.contarPendientes(email)) >= MAX_PENDIENTES_POR_CLIENTE) {
      return res.status(409).json({ error: "Ya tienes reservas esperando la verificación de tu Yape. Espera la confirmación o escríbenos por WhatsApp." });
    }
  } catch (err) {
    console.error("❌ Error verificando disponibilidad:", err.message);
    return res.status(500).json({ error: "No se pudo verificar la disponibilidad" });
  }

  const fidelidad = await fidelidadDeReserva(req, email);
  const descuentoPct = fidelidad?.descuento || 0;
  const { total, adelanto, saldo } = calcularMontos(servicio, descuentoPct);
  const codigo = generarCodigo();
  const inicio = aMinutos(normalizarHora(hora_cita));
  const notaClub = descuentoPct ? ` - CLUB ${fidelidad.nivel.toUpperCase()} ${descuentoPct}% DSCTO` : "";

  let r;
  try {
    r = await pagosManuales.registrarPago({
      reserva: {
        nombre: `${nombre} (YAPE DIRECTO Op: ${numeroOperacion}${notaClub} - Estado: PENDING)`,
        celular,
        email,
        fecha_cita,
        hora_cita,
        fecha_registro: new Date().toISOString(),
        codigo,
        estado: "pending",
        servicio_id: servicio.id,
        servicio: servicio.nombre,
        duracion_min: servicio.duracion,
        precio: servicio.precio,
        descuento_pct: descuentoPct,
        total,
        adelanto,
        saldo,
        saldo_estado: saldo > 0 ? "pendiente" : "no_aplica",
        pago_metodo: "yape_manual",
        yape_operacion: numeroOperacion,
      },
      inicio,
      fin: inicio + servicio.duracion,
      comprobante: archivo,
      panelUrl: urlPanel(req),
    });
  } catch (err) {
    console.error(JSON.stringify({ nivel: "error", evento: "yape_manual_error", codigo, error: err.message }));
    return res.status(503).json({ error: "No pudimos registrar tu reserva. Inténtalo de nuevo en unos segundos; si ya yapeaste, escríbenos por WhatsApp." });
  }

  if (r.estado === "ocupado") return res.status(409).json({ error: "Ese horario acaba de ser reservado. Elige otra hora." });
  if (r.estado === "operacion_repetida") {
    return res.status(409).json({ error: "Ese Nº de operación ya se usó en otra reserva. Revisa tu constancia de Yape." });
  }

  res.status(201).json({
    message: "✅ Reserva recibida. Estamos verificando tu Yape.",
    codigo,
    estado: "pending",
    seguimiento: yapeManual.tokenSeguimiento(SEGUIMIENTO_SECRET, codigo),
    servicio: servicio.nombre,
    total,
    adelanto,
    saldo,
    descuento_aplicado: descuentoPct,
  });
});

// 🔴 El cliente sigue en vivo la verificación de su pago (EventSource, sin sesión: lo protege el token firmado)
app.get("/reservas/:codigo/seguimiento", async (req, res) => {
  const { codigo } = req.params;
  if (!yapeManual.tokenValido(SEGUIMIENTO_SECRET, codigo, req.query.t)) return res.sendStatus(404);
  let reserva;
  try {
    reserva = await repoManual.obtenerPorCodigo(codigo);
  } catch (err) {
    return res.sendStatus(503);
  }
  if (!reserva) return res.sendStatus(404);

  const conexiones = seguidores.get(codigo) || new Set();
  seguidores.set(codigo, conexiones);
  abrirSSE(req, res, () => {
    conexiones.delete(res);
    if (!conexiones.size) seguidores.delete(codigo);
  });
  // Estado actual al conectar (cubre lo que pasó mientras estaba desconectado)
  res.write(`retry: 3000\nevent: estado\ndata: ${JSON.stringify(yapeManual.estadoPublico(reserva))}\n\n`);
  conexiones.add(res);
});

// 💜 Pago del restante con Yape (lo hace el cliente desde su perfil cuando empieza su cita)
app.post("/reservas/:id/pagar-saldo", async (req, res) => {
  const user = await obtenerUsuario(req);
  if (!user?.email) return res.status(401).json({ error: "Inicia sesión para pagar" });
  const { yape_token, celular_yape, device_id, intento_id } = req.body;
  if (!yape_token || !celular_yape) return res.status(400).json({ error: "⚠️ Faltan los datos de Yape" });
  if (!MP_ACCESS_TOKEN) return res.status(503).json({ error: "El pago con Yape no está configurado todavía." });
  if (!(await verificarEsquemaPagos())) return res.status(503).json({ error: MENSAJE_SIN_MIGRACION });

  const { data: reserva, error } = await supabase.from("reservas").select("*").eq("id", req.params.id).single();
  if (error || !reserva) return res.status(404).json({ error: "Reserva no encontrada" });
  if (String(reserva.email).toLowerCase() !== user.email.toLowerCase() && !esAdministrador(user)) {
    return res.status(403).json({ error: "Esta reserva no es tuya" });
  }
  if (reserva.estado === "cancelled") return res.status(409).json({ error: "La reserva está cancelada" });
  if (reserva.saldo_estado !== "pendiente" || !(reserva.saldo > 0)) {
    return res.status(409).json({ error: "Esta reserva no tiene saldo pendiente" });
  }

  const monto = Number(reserva.saldo);
  const referencia = `${reserva.codigo || reserva.id}-SALDO-${crypto.randomInt(1000, 10000)}`;
  let r;
  try {
    r = await pagos.cobrar({
      clave: claveIntento(intento_id),
      huella: huellaDe({ tipo: "saldo", reserva: String(reserva.id), monto }),
      tipo: "saldo",
      referencia,
      monto,
      reservaId: reserva.id,
      cobro: {
        email: user.email,
        celular: celular_yape,
        token: yape_token,
        descripcion: `Restante ${reserva.servicio || "servicio"} - ${reserva.fecha_cita}`,
        deviceId: device_id,
      },
    });
  } catch (err) {
    console.error("❌ No se pudo registrar el intento de pago del saldo:", err.message);
    return res.status(503).json({ error: "No pudimos iniciar el pago. No se realizó ningún cobro; inténtalo en unos segundos." });
  }

  if (r.estado === "ocupado") {
    return res.status(409).json({ error: "Ya hay un pago del restante en curso o realizado para esta reserva." });
  }
  if (r.estado !== "confirmado") {
    const [status, cuerpo] = respuestaNoConfirmada(r, r.pago?.referencia || referencia);
    return res.status(status).json(cuerpo);
  }

  const actualizada = r.reserva || (await supabase.from("reservas").select("*").eq("id", reserva.id).single()).data;
  res.json({ message: "✅ Restante pagado", reserva: actualizada, payment_id: r.pago.mp_order_id });
});

// 🔔 Webhook de Mercado Pago (tema "order"). Se valida la firma y luego se consulta la orden en la API.
app.post("/webhooks/mercadopago", async (req, res) => {
  const tipo = req.query.type || req.body?.type;
  const orderId = req.query["data.id"] || req.body?.data?.id;
  if (!MP_WEBHOOK_SECRET) {
    console.warn("⚠️ Webhook recibido pero falta MP_WEBHOOK_SECRET: se ignora.");
    return res.sendStatus(503);
  }
  const firmaValida = verificarFirmaWebhook({
    secreto: MP_WEBHOOK_SECRET,
    xSignature: req.headers["x-signature"],
    xRequestId: req.headers["x-request-id"],
    dataId: req.query["data.id"],
  });
  if (!firmaValida) {
    console.warn(JSON.stringify({ nivel: "warn", evento: "webhook_firma_invalida", tipo, order_id: orderId || null }));
    return res.sendStatus(401);
  }
  // Se responde de inmediato (Mercado Pago espera 200 en < 22 s) y se procesa después
  res.sendStatus(200);
  if (tipo !== "order" || !orderId || !(await verificarEsquemaPagos())) return;
  pagos.procesarNotificacionOrden(String(orderId)).catch((err) =>
    console.error(JSON.stringify({ nivel: "error", evento: "webhook_error", order_id: orderId, error: err.message }))
  );
});

// =====================================================================
// 🛠️ Rutas de administración
// =====================================================================

// 🔴 Eventos en vivo del panel (pagos y reservas nuevas) — se leen con fetch + Authorization
app.get("/admin/eventos", requireAdmin, (req, res) => {
  abrirSSE(req, res, () => clientesEnVivo.delete(res));
  res.write(`event: conectado\ndata: {}\n\n`);
  clientesEnVivo.add(res);
});

// 🧾 Captura del Yape (enlace temporal de 10 minutos; el bucket es privado)
app.get("/admin/reservas/:id/comprobante", requireAdmin, async (req, res) => {
  try {
    const reserva = await repoManual.obtenerReserva(req.params.id);
    if (!reserva?.voucher_url) return res.status(404).json({ error: "Esta reserva no tiene comprobante" });
    if (/^https?:\/\//.test(reserva.voucher_url)) return res.json({ url: reserva.voucher_url });
    res.json({ url: await repoManual.urlComprobante(reserva.voucher_url) });
  } catch (err) {
    console.error("❌ Error obteniendo comprobante:", err.message);
    res.status(500).json({ error: "No se pudo abrir el comprobante" });
  }
});

// ✅/❌ Verificar un Yape directo: aprueba la cita o la cancela con un motivo (libera el horario)
app.post("/admin/reservas/:id/verificar-pago", requireAdmin, async (req, res) => {
  const { decision, motivo } = req.body || {};
  if (!(await verificarEsquemaManual())) return res.status(503).json({ error: MENSAJE_SIN_MIGRACION });
  try {
    const r = await pagosManuales.verificarPago({ id: req.params.id, decision, motivo, admin: req.user.email });
    if (r.estado === "invalido") return res.status(400).json({ error: "Decisión inválida" });
    if (r.estado === "no_encontrada") return res.status(404).json({ error: "Reserva no encontrada" });
    if (r.estado === "ya_revisada") {
      return res.status(409).json({ error: "Este pago ya fue revisado (quizá desde otro dispositivo).", reserva: r.reserva });
    }
    res.json({ message: r.estado === "aprobada" ? "✅ Pago verificado, cita confirmada" : "Pago rechazado, horario liberado", reserva: r.reserva });
  } catch (err) {
    console.error("❌ Error verificando pago:", err.message);
    res.status(500).json({ error: "No se pudo guardar la verificación" });
  }
});

// 💵 El cliente pagó el restante en efectivo / Yape directo en el local
app.post("/reservas/:id/saldo-efectivo", requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("reservas")
    .update({ saldo_estado: "pagado", saldo_metodo: "efectivo", saldo_pagado_en: new Date().toISOString() })
    .eq("id", req.params.id)
    .eq("saldo_estado", "pendiente")
    .select()
    .single();
  if (error || !data) return res.status(409).json({ error: "La reserva no tiene saldo pendiente" });
  emitirEvento("reserva", { tipo: "saldo_pagado", reserva: data });
  res.json({ message: "✅ Restante registrado como pagado en efectivo", reserva: data });
});

// 📅 Registro manual de cita (solo administradores, desde el panel)
app.post("/reservar-cita", requireAdmin, async (req, res) => {
  const { nombre, celular, email, fecha_cita, hora_cita, codigo, estado, servicio_id } = req.body;

  if (!nombre || !celular || !email || !fecha_cita || !hora_cita) {
    return res.status(400).json({ error: "⚠️ Faltan datos obligatorios" });
  }

  const servicio = servicioPorId(servicio_id);
  const insertData = {
    nombre,
    celular,
    email,
    fecha_cita,
    hora_cita,
    fecha_registro: new Date().toISOString(),
    codigo: codigo || generarCodigo("ADM"),
    estado: estado || "pending",
    voucher_url: null,
  };
  if (servicio && (await verificarEsquema())) {
    Object.assign(insertData, {
      servicio_id: servicio.id,
      servicio: servicio.nombre,
      duracion_min: servicio.duracion,
      precio: servicio.precio,
      descuento_pct: 0,
      total: servicio.precio,
      adelanto: 0,
      saldo: servicio.precio,
      saldo_estado: "pendiente",
    });
  }

  const { data, error } = await supabase.from("reservas").insert([insertData]).select().single();
  if (error) {
    console.error("❌ Error al guardar cita en Supabase:", error.message, error.details);
    return res.status(500).json({ error: "No se pudo guardar la cita", detalle: error.message });
  }

  emitirEvento("reserva", { tipo: "nueva", reserva: data });
  await notificarReserva({ ...insertData, servicio: servicio?.nombre });
  res.json({ message: "✅ Cita registrada con éxito", data });
});

// 📊 Todas las reservas (panel admin)
app.get("/reservas", requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("reservas")
    .select("*")
    .order("fecha_registro", { ascending: false });

  if (error) {
    console.error("❌ Error al buscar reservas en Supabase:", error.message);
    return res.status(500).json({ error: "No se pudieron cargar las reservas" });
  }
  res.json(data);
});

// ✏️ Actualizar el estado de una reserva (aprobar/cancelar)
app.post("/reservas/:id/estado", requireAdmin, async (req, res) => {
  const { estado } = req.body;
  if (!["pending", "approved", "cancelled"].includes(estado)) {
    return res.status(400).json({ error: "⚠️ Estado inválido" });
  }

  const { data, error } = await supabase
    .from("reservas")
    .update({ estado })
    .eq("id", req.params.id)
    .select();

  if (error) {
    console.error("❌ Error al actualizar estado de la reserva:", error.message);
    return res.status(500).json({ error: "No se pudo actualizar el estado de la reserva" });
  }
  if (data?.[0]) emitirEvento("reserva", { tipo: "estado", reserva: data[0] });
  res.json({ message: `✅ Estado de reserva cambiado a ${estado}`, data });
});

// 🧾 Intentos de pago con Yape (para soporte de Mercado Pago y conciliación). Sin tokens ni datos del comprador.
app.get("/admin/pagos", requireAdmin, async (req, res) => {
  const estados = String(req.query.estado || "").split(",").map((e) => e.trim()).filter(Boolean);
  try {
    res.json(await repoPagos.listarPagos({ estados, limite: 200 }));
  } catch (err) {
    console.error("❌ Error listando pagos:", err.message);
    res.status(500).json({ error: "No se pudieron cargar los pagos" });
  }
});

// 🔁 Concilia ahora: crea reservas de pagos aprobados y consulta en Mercado Pago los que no tienen estado final
app.post("/admin/pagos/conciliar", requireAdmin, async (_, res) => {
  if (!(await verificarEsquemaPagos())) return res.status(503).json({ error: MENSAJE_SIN_MIGRACION });
  try {
    res.json({ resultados: await pagos.conciliar() });
  } catch (err) {
    console.error("❌ Error conciliando pagos:", err.message);
    res.status(500).json({ error: "No se pudo conciliar" });
  }
});

// 🔓 Libera el horario de un intento sin estado final, después de comprobar en Mercado Pago que NO se cobró
app.post("/admin/pagos/:id/liberar", requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("pagos_yape")
    .update({ estado: "liberado", updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .in("estado", ["procesando", "verificando"])
    .select("id, referencia, estado")
    .maybeSingle();
  if (error || !data) return res.status(409).json({ error: "Solo se pueden liberar pagos en estado procesando o verificando" });
  console.log(JSON.stringify({ nivel: "info", evento: "pago_liberado", referencia: data.referencia, admin: req.user.email }));
  res.json({ message: "✅ Horario liberado", pago: data });
});

// 💳 MercadoPago - Crear preferencia de pago (tienda)
app.post("/crear-preferencia", async (req, res) => {
  const { carrito } = req.body;
  if (!carrito || !Array.isArray(carrito)) return res.status(400).json({ error: "Carrito inválido" });

  const items = carrito.map((item) => ({
    title: item.nombre,
    quantity: item.cantidad,
    currency_id: "PEN",
    unit_price: Number(item.precio),
  }));

  try {
    const preference = await mercadopago.preferences.create({
      items,
      back_urls: {
        success: "https://www.success.com",
        failure: "https://www.failure.com",
        pending: "https://www.pending.com",
      },
      auto_return: "approved",
      external_reference: "pedido-barberia-001",
    });
    res.json({ id: preference.body.id });
  } catch (error) {
    console.error("❌ Error con MercadoPago:", error.message);
    res.status(500).json({ error: "Error al crear la preferencia" });
  }
});

// 🚀 Iniciar servidor
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend en ejecución en http://localhost:${PORT}`);
});

// 🔁 Conciliación automática cada 5 minutos (respaldo si un webhook no llega o la petición se cortó)
if (MP_ACCESS_TOKEN && SUPABASE_KEY) {
  setInterval(async () => {
    if (!(await verificarEsquemaPagos())) return;
    pagos.conciliar().catch((err) => console.error("❌ Error en la conciliación automática:", err.message));
  }, 5 * 60 * 1000).unref();
}
