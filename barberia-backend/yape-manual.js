// =====================================================================
// 💜 Yape directo (pago manual)
// =====================================================================
// El cliente yapea al número de la barbería y sube la captura con el Nº de operación.
// La reserva queda "pending" (el horario queda bloqueado) hasta que un administrador
// la aprueba o la rechaza desde el panel. No pasa por Mercado Pago.
const crypto = require("crypto");

const MAX_BYTES = 4 * 1024 * 1024;

// Bytes iniciales de cada formato aceptado (no basta con confiar en el "data:image/...")
const FORMATOS = {
  "image/jpeg": { extension: "jpg", es: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { extension: "png", es: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  "image/webp": { extension: "webp", es: (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
};

// "data:image/jpeg;base64,..." → { buffer, mime, extension } o { error }
const decodificarComprobante = (dataUrl) => {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) return { error: "Sube la captura de tu Yape (imagen JPG, PNG o WEBP)." };
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length < 100) return { error: "La imagen del comprobante no es válida." };
  if (buffer.length > MAX_BYTES) return { error: "La imagen es muy pesada (máximo 4 MB)." };
  const formato = FORMATOS[m[1]];
  if (!formato.es(buffer)) return { error: "El archivo no es una imagen válida." };
  return { buffer, mime: m[1], extension: formato.extension };
};

// Nº de operación de la constancia de Yape: solo letras y números
const normalizarOperacion = (op) => {
  const limpio = String(op || "").replace(/[\s.-]/g, "").toUpperCase();
  return /^[A-Z0-9]{4,20}$/.test(limpio) ? limpio : null;
};

// Token para que el cliente siga el estado de SU reserva sin iniciar sesión (no se guarda en la base)
const tokenSeguimiento = (secreto, codigo) =>
  crypto.createHmac("sha256", String(secreto)).update(`seguimiento:${codigo}`).digest("hex").slice(0, 32);

const tokenValido = (secreto, codigo, token) => {
  const a = Buffer.from(tokenSeguimiento(secreto, codigo));
  const b = Buffer.from(String(token || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Límite de solicitudes por llave (IP) en una ventana de tiempo, en memoria
const crearLimitador = ({ maximo, ventanaMs, ahora = () => Date.now() }) => {
  const registros = new Map();
  return (llave) => {
    const t = ahora();
    const recientes = (registros.get(llave) || []).filter((x) => t - x < ventanaMs);
    if (recientes.length >= maximo) {
      registros.set(llave, recientes);
      return false;
    }
    recientes.push(t);
    registros.set(llave, recientes);
    if (registros.size > 5000) registros.delete(registros.keys().next().value);
    return true;
  };
};

const MOTIVOS_RECHAZO = {
  no_recibido: "No encontramos tu Yape en nuestra cuenta.",
  monto_incorrecto: "El monto yapeado no coincide con el adelanto.",
  comprobante_invalido: "La captura no es válida o no se puede leer.",
  horario: "El horario ya no está disponible.",
};

// Solo lo que el cliente necesita saber de su reserva (sin datos de otros ni del administrador)
const estadoPublico = (r) => ({
  codigo: r.codigo,
  estado: r.estado,
  motivo: r.estado === "cancelled" ? r.pago_motivo_rechazo || null : null,
});

const crearServicioYapeManual = ({
  repo,
  emitir = () => {}, // (tipo, datos) → SSE del panel y del cliente
  alRegistrar = async () => {}, // ({ reserva, panelUrl }) → SMS / avisos
  alVerificar = async () => {}, // ({ reserva, decision }) → SMS al cliente
  log = (linea) => console.log(linea),
  ahora = () => new Date(),
}) => {
  const registrar = (datos) => log(JSON.stringify({ ts: ahora().toISOString(), ...datos }));
  const enSegundoPlano = (p, evento, codigo) =>
    Promise.resolve(p).catch((err) => registrar({ nivel: "error", evento, codigo, error: err.message }));

  // 1. Sube la captura  2. Crea la reserva "pending" de forma atómica  3. Avisa al panel
  const registrarPago = async ({ reserva, inicio, fin, comprobante, panelUrl }) => {
    const ruta = `${reserva.fecha_cita}/${reserva.codigo}-${crypto.randomBytes(6).toString("hex")}.${comprobante.extension}`;
    await repo.subirComprobante(ruta, comprobante.buffer, comprobante.mime);

    let r;
    try {
      r = await repo.reservarAtomico({ ...reserva, voucher_url: ruta }, inicio, fin);
    } catch (err) {
      await repo.borrarComprobante(ruta).catch(() => {});
      throw err;
    }
    if (r.resultado !== "nuevo") {
      await repo.borrarComprobante(ruta).catch(() => {});
      return { estado: r.resultado };
    }

    registrar({ nivel: "info", evento: "yape_manual_registrado", codigo: r.reserva.codigo, monto: r.reserva.adelanto });
    emitir("reserva", { tipo: "pago_por_verificar", reserva: r.reserva });
    enSegundoPlano(alRegistrar({ reserva: r.reserva, panelUrl }), "yape_manual_aviso_error", r.reserva.codigo);
    return { estado: "registrado", reserva: r.reserva };
  };

  // El administrador aprueba o rechaza. Solo cambia reservas que siguen "pending": dos clics no hacen dos cambios.
  const verificarPago = async ({ id, decision, motivo, admin }) => {
    if (!["aprobar", "rechazar"].includes(decision)) return { estado: "invalido" };
    const campos = {
      estado: decision === "aprobar" ? "approved" : "cancelled",
      pago_revisado_por: admin,
      pago_revisado_en: ahora().toISOString(),
      pago_motivo_rechazo: decision === "rechazar" ? MOTIVOS_RECHAZO[motivo] || MOTIVOS_RECHAZO.no_recibido : null,
    };
    const reserva = await repo.actualizarSiPendiente(id, campos);
    if (!reserva) {
      const actual = await repo.obtenerReserva(id);
      return { estado: actual ? "ya_revisada" : "no_encontrada", reserva: actual };
    }

    registrar({ nivel: "info", evento: "yape_manual_verificado", codigo: reserva.codigo, decision, admin });
    emitir("reserva", { tipo: decision === "aprobar" ? "pago_aprobado" : "pago_rechazado", reserva });
    enSegundoPlano(alVerificar({ reserva, decision }), "yape_manual_aviso_error", reserva.codigo);
    return { estado: decision === "aprobar" ? "aprobada" : "rechazada", reserva };
  };

  return { registrarPago, verificarPago };
};

const crearRepositorioYapeManual = (supabase, bucket = "vouchers") => {
  const unico = async (consulta) => {
    const { data, error } = await consulta;
    if (error) throw new Error(error.message);
    return data;
  };
  return {
    async subirComprobante(ruta, buffer, mime) {
      const { error } = await supabase.storage.from(bucket).upload(ruta, buffer, { contentType: mime, upsert: false });
      if (error) throw new Error(`storage: ${error.message}`);
    },
    async borrarComprobante(ruta) {
      await supabase.storage.from(bucket).remove([ruta]);
    },
    async urlComprobante(ruta, segundos = 600) {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(ruta, segundos);
      if (error) throw new Error(`storage: ${error.message}`);
      return data.signedUrl;
    },
    reservarAtomico: (reserva, inicio, fin) =>
      unico(supabase.rpc("reservar_yape_manual", { p_reserva: reserva, p_inicio: inicio, p_fin: fin })),
    actualizarSiPendiente: (id, campos) =>
      unico(
        supabase.from("reservas").update(campos)
          .eq("id", id).eq("estado", "pending").eq("pago_metodo", "yape_manual")
          .select().maybeSingle()
      ),
    obtenerReserva: (id) => unico(supabase.from("reservas").select("*").eq("id", id).maybeSingle()),
    obtenerPorCodigo: (codigo) => unico(supabase.from("reservas").select("*").eq("codigo", codigo).limit(1).maybeSingle()),
    contarPendientes: async (email) => {
      const { count, error } = await supabase.from("reservas")
        .select("id", { count: "exact", head: true })
        .eq("email", email).eq("estado", "pending").eq("pago_metodo", "yape_manual");
      if (error) throw new Error(error.message);
      return count || 0;
    },
    // Crea el bucket privado de comprobantes si todavía no existe
    async asegurarBucket() {
      const { error } = await supabase.storage.getBucket(bucket);
      if (!error) return;
      const { error: errCrear } = await supabase.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: Object.keys(FORMATOS),
      });
      if (errCrear && !/exists/i.test(errCrear.message)) throw new Error(`storage: ${errCrear.message}`);
    },
  };
};

module.exports = {
  decodificarComprobante,
  normalizarOperacion,
  tokenSeguimiento,
  tokenValido,
  crearLimitador,
  estadoPublico,
  MOTIVOS_RECHAZO,
  crearServicioYapeManual,
  crearRepositorioYapeManual,
};
