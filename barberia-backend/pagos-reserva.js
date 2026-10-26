// =====================================================================
// 🧾 Flujo de cobro con Yape asociado a una reserva
// =====================================================================
// 1. Se registra el intento en Supabase (tabla pagos_yape) y se bloquea el horario en una sola transacción.
// 2. Se cobra en Mercado Pago con la clave de idempotencia del intento.
// 3. Se guarda el resultado (IDs y estados de Mercado Pago).
// 4. Solo si el pago está aprobado se crea la reserva (o se marca pagado el saldo).
// Si el paso 4 falla, el intento queda "aprobado" y la conciliación lo completa después.

// Estado guardado en pagos_yape según el resultado de Mercado Pago
const ESTADO_POR_RESULTADO = {
  aprobado: "aprobado",
  rechazado: "rechazado",
  error: "error",
  pendiente: "verificando",
  desconocido: "verificando",
};

// Columnas mp_* a partir del resumen (no se pisan IDs ya conocidos con null)
const camposMP = (resumen) => {
  const campos = {
    estado: ESTADO_POR_RESULTADO[resumen.resultado] || "verificando",
    mp_http_status: resumen.http_status,
    mp_order_id: resumen.order_id,
    mp_order_status: resumen.order_status,
    mp_payment_id: resumen.payment_id,
    mp_payment_status: resumen.payment_status,
    mp_status_detail: resumen.status_detail,
    mp_request_id: resumen.request_id,
    mp_error_code: resumen.error_code,
  };
  return Object.fromEntries(Object.entries(campos).filter(([, v]) => v != null));
};

const crearServicioPagos = ({
  repo,
  mp,
  construirReserva, // (payload, pago) → fila para insertar en reservas
  construirSaldo, // (pago) → columnas a actualizar en la reserva al pagar el saldo
  alConfirmar = async () => {}, // ({ pago, reserva, nueva }) → avisos (SSE, SMS)
  log = (linea) => console.log(linea),
}) => {
  const registrar = (datos) => log(JSON.stringify({ ts: new Date().toISOString(), ...datos }));

  // Un intento solo se procesa de a uno a la vez (petición del cliente, webhook y conciliación)
  const enCurso = new Map();
  const enExclusiva = async (llave, fn) => {
    while (enCurso.has(llave)) await enCurso.get(llave).catch(() => {});
    const p = fn();
    enCurso.set(llave, p);
    try {
      return await p;
    } finally {
      enCurso.delete(llave);
    }
  };

  const guardar = async (pago, campos) => {
    try {
      return { ...pago, ...(await repo.actualizarPago(pago.id, campos)) };
    } catch (err) {
      // Los IDs igual quedan en el log estructurado de mp_orden
      registrar({ nivel: "error", evento: "pago_no_actualizado", referencia: pago.referencia, campos, error: err.message });
      return { ...pago, ...campos };
    }
  };

  // Pago aprobado → crea la reserva (o marca el saldo como pagado). Idempotente.
  const confirmar = async (pago) => {
    try {
      let reserva;
      let nueva = false;
      if (pago.tipo === "adelanto") {
        reserva = await repo.buscarReservaPorCodigo(pago.referencia);
        if (!reserva) {
          reserva = await repo.insertarReserva(construirReserva(pago.reserva_payload, pago));
          nueva = true;
        }
      } else {
        reserva = await repo.actualizarReserva(pago.reserva_id, construirSaldo(pago));
        nueva = true;
      }
      const confirmado = await guardar(pago, { estado: "confirmado", reserva_id: String(reserva.id) });
      registrar({ nivel: "info", evento: "pago_confirmado", tipo: pago.tipo, referencia: pago.referencia, order_id: pago.mp_order_id, reserva_id: reserva.id });
      if (nueva) await alConfirmar({ pago: confirmado, reserva, nueva }).catch(() => {});
      return { estado: "confirmado", pago: confirmado, reserva };
    } catch (err) {
      registrar({
        nivel: "error",
        evento: "pago_aprobado_sin_reserva",
        tipo: pago.tipo,
        referencia: pago.referencia,
        order_id: pago.mp_order_id,
        error: err.message,
      });
      return { estado: "aprobado_sin_reserva", pago };
    }
  };

  const aplicar = async (pago, resumen) => {
    const actualizado = await guardar(pago, camposMP(resumen));
    if (actualizado.estado === "aprobado") return { ...(await confirmar(actualizado)), resumen };
    return { estado: actualizado.estado, pago: actualizado, resumen };
  };

  // Resultado de un intento ya registrado con la misma clave (reintento del cliente)
  const estadoExistente = (pago) => {
    if (pago.estado === "confirmado") return { estado: "confirmado", pago, repetido: true };
    if (["rechazado", "error", "liberado"].includes(pago.estado)) return { estado: pago.estado, pago, repetido: true };
    return { estado: "en_proceso", pago, repetido: true };
  };

  const cobrar = async ({ clave, huella, tipo, referencia, monto, fecha, inicio, fin, reservaId, payload, cobro }) => {
    const inicioIntento = await repo.iniciarPago({ clave, huella, tipo, referencia, monto, fecha, inicio, fin, reservaId, payload });
    if (inicioIntento.resultado === "ocupado") return { estado: "ocupado" };
    if (inicioIntento.resultado === "clave_reutilizada") return { estado: "clave_reutilizada" };
    if (inicioIntento.resultado === "existente") return estadoExistente(inicioIntento.pago);

    const pago = inicioIntento.pago;
    return enExclusiva(pago.referencia, async () => {
      const resumen = await mp.crearOrdenYape({ ...cobro, idempotencyKey: clave, monto, referencia });
      return aplicar(pago, resumen);
    });
  };

  // Webhook "order": se consulta la orden en Mercado Pago (no se confía en el cuerpo de la notificación)
  const procesarNotificacionOrden = async (orderId) => {
    const resumen = await mp.obtenerOrden(orderId);
    if (resumen.resultado === "desconocido" || resumen.resultado === "error") return { estado: "sin_datos", resumen };
    const pago = (await repo.buscarPagoPorOrden(orderId))
      || (resumen.external_reference && (await repo.buscarPagoPorReferencia(resumen.external_reference)));
    if (!pago) {
      registrar({ nivel: "warn", evento: "webhook_sin_pago", order_id: orderId, external_reference: resumen.external_reference });
      return { estado: "sin_pago", resumen };
    }
    return enExclusiva(pago.referencia, async () => {
      const actual = (await repo.buscarPagoPorReferencia(pago.referencia)) || pago;
      if (["confirmado", "liberado"].includes(actual.estado)) return { estado: actual.estado, pago: actual };
      return aplicar(actual, resumen);
    });
  };

  // Completa intentos que quedaron a medias: aprobados sin reserva y pagos sin estado final
  const conciliar = async () => {
    const pendientes = await repo.listarPagosPorConciliar();
    const resultados = [];
    for (const pago of pendientes) {
      const r = await enExclusiva(pago.referencia, async () => {
        if (pago.estado === "aprobado") return confirmar(pago);
        if (!pago.mp_order_id) return { estado: "requiere_revision", pago };
        const resumen = await mp.obtenerOrden(pago.mp_order_id);
        if (resumen.resultado === "desconocido" || resumen.resultado === "error") return { estado: pago.estado, pago };
        return aplicar(pago, resumen);
      });
      resultados.push({ referencia: pago.referencia, antes: pago.estado, despues: r.estado, order_id: r.pago?.mp_order_id || null });
    }
    if (resultados.length) registrar({ nivel: "info", evento: "conciliacion", resultados });
    return resultados;
  };

  return { cobrar, conciliar, procesarNotificacionOrden };
};

// Adaptador de Supabase para el flujo (en las pruebas se reemplaza por uno en memoria)
const crearRepositorioSupabase = (supabase) => {
  const unico = async (consulta) => {
    const { data, error } = await consulta;
    if (error) throw new Error(error.message);
    return data;
  };
  return {
    iniciarPago: async ({ clave, huella, tipo, referencia, monto, fecha, inicio, fin, reservaId, payload }) =>
      unico(supabase.rpc("iniciar_pago_yape", {
        p_clave: clave,
        p_huella: huella,
        p_tipo: tipo,
        p_referencia: referencia,
        p_monto: monto,
        p_fecha: fecha ?? null,
        p_inicio: inicio ?? null,
        p_fin: fin ?? null,
        p_reserva_id: reservaId != null ? String(reservaId) : null,
        p_payload: payload ?? null,
      })),
    actualizarPago: (id, campos) =>
      unico(supabase.from("pagos_yape").update({ ...campos, updated_at: new Date().toISOString() }).eq("id", id).select().single()),
    buscarPagoPorReferencia: (referencia) =>
      unico(supabase.from("pagos_yape").select("*").eq("referencia", referencia).order("created_at", { ascending: false }).limit(1).maybeSingle()),
    buscarPagoPorOrden: (orderId) =>
      unico(supabase.from("pagos_yape").select("*").eq("mp_order_id", orderId).limit(1).maybeSingle()),
    buscarReservaPorCodigo: (codigo) =>
      unico(supabase.from("reservas").select("*").eq("codigo", codigo).limit(1).maybeSingle()),
    insertarReserva: (datos) => unico(supabase.from("reservas").insert([datos]).select().single()),
    actualizarReserva: (id, campos) => unico(supabase.from("reservas").update(campos).eq("id", id).select().single()),
    // "procesando" con más de 5 minutos = la petición se cortó (reinicio del servidor, etc.)
    listarPagosPorConciliar: () =>
      unico(supabase
        .from("pagos_yape")
        .select("*")
        .or(`estado.in.(aprobado,verificando),and(estado.eq.procesando,created_at.lt.${new Date(Date.now() - 5 * 60 * 1000).toISOString()})`)
        .order("created_at", { ascending: true })
        .limit(50)),
    listarPagos: ({ estados, limite = 100 }) => {
      let q = supabase.from("pagos_yape")
        .select("id, tipo, referencia, monto, estado, fecha_cita, reserva_id, mp_http_status, mp_order_id, mp_order_status, mp_payment_id, mp_payment_status, mp_status_detail, mp_request_id, mp_error_code, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(limite);
      if (estados?.length) q = q.in("estado", estados);
      return unico(q);
    },
  };
};

module.exports = { crearServicioPagos, crearRepositorioSupabase, camposMP };
