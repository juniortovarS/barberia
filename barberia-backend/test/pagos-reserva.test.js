// Pruebas del flujo reserva ↔ pago con un repositorio en memoria que imita a iniciar_pago_yape
// (la atomicidad real la da el candado de Postgres; aquí la da el hilo único de Node).
const test = require("node:test");
const assert = require("node:assert/strict");
const { crearServicioPagos } = require("../pagos-reserva");

const ACTIVOS = ["procesando", "aprobado", "verificando"];

const repoEnMemoria = () => {
  const pagos = [];
  const reservas = [];
  let fallarInsert = false;
  let seq = 0;
  return {
    pagos,
    reservas,
    fallarInsertReserva: (v) => (fallarInsert = v),
    async iniciarPago({ clave, huella, tipo, referencia, monto, fecha, inicio, fin, reservaId, payload }) {
      const existente = pagos.find((p) => p.clave_idempotencia === clave);
      if (existente) return { resultado: existente.huella === huella ? "existente" : "clave_reutilizada", pago: { ...existente } };
      if (tipo === "adelanto") {
        const choca = (a0, a1) => a0 < fin && a1 > inicio;
        const ocupado = reservas.some((r) => r.fecha_cita === fecha && r.estado !== "cancelled" && choca(r.inicio, r.inicio + r.duracion_min))
          || pagos.some((p) => p.fecha_cita === fecha && ACTIVOS.includes(p.estado) && choca(p.inicio_min, p.fin_min));
        if (ocupado) return { resultado: "ocupado" };
      }
      const pago = {
        id: `pago-${++seq}`, clave_idempotencia: clave, huella, tipo, referencia, monto, estado: "procesando",
        fecha_cita: fecha, inicio_min: inicio, fin_min: fin, reserva_id: reservaId ?? null, reserva_payload: payload,
      };
      pagos.push(pago);
      return { resultado: "nuevo", pago: { ...pago } };
    },
    async actualizarPago(id, campos) {
      const p = pagos.find((x) => x.id === id);
      Object.assign(p, campos);
      return { ...p };
    },
    async buscarPagoPorReferencia(ref) {
      const p = pagos.find((x) => x.referencia === ref);
      return p ? { ...p } : null;
    },
    async buscarPagoPorOrden(id) {
      const p = pagos.find((x) => x.mp_order_id === id);
      return p ? { ...p } : null;
    },
    async buscarReservaPorCodigo(codigo) {
      return reservas.find((r) => r.codigo === codigo) || null;
    },
    async insertarReserva(datos) {
      if (fallarInsert) throw new Error("connection terminated unexpectedly");
      const r = { id: reservas.length + 1, ...datos };
      reservas.push(r);
      return r;
    },
    async actualizarReserva(id, campos) {
      const r = reservas.find((x) => String(x.id) === String(id));
      Object.assign(r, campos);
      return r;
    },
    async listarPagosPorConciliar() {
      return pagos.filter((p) => ["aprobado", "verificando"].includes(p.estado)).map((p) => ({ ...p }));
    },
  };
};

const resumen = (resultado, extra = {}) => ({
  resultado,
  http_status: 201,
  order_id: "ORD01A",
  order_status: resultado === "aprobado" ? "processed" : "failed",
  payment_id: "PAY01A",
  payment_status: resultado === "aprobado" ? "processed" : "failed",
  status_detail: resultado === "aprobado" ? "accredited" : "high_risk",
  request_id: "req-1",
  external_reference: "RES-1",
  ...extra,
});

// Mercado Pago simulado: devuelve las respuestas en orden y cuenta las llamadas
const mpFalso = (respuestasCobro, respuestasConsulta = []) => {
  const mp = {
    cobros: [],
    consultas: [],
    async crearOrdenYape(args) {
      mp.cobros.push(args);
      await new Promise((r) => setTimeout(r, 5));
      return respuestasCobro[Math.min(mp.cobros.length - 1, respuestasCobro.length - 1)];
    },
    async obtenerOrden(id) {
      mp.consultas.push(id);
      return respuestasConsulta[Math.min(mp.consultas.length - 1, respuestasConsulta.length - 1)];
    },
  };
  return mp;
};

const servicio = (repo, mp) => {
  const avisos = [];
  const s = crearServicioPagos({
    repo,
    mp,
    log: () => {},
    construirReserva: ({ nombre_cliente, ...r }, pago) => ({ ...r, nombre: nombre_cliente, pago_adelanto_id: pago.mp_order_id }),
    construirSaldo: (pago) => ({ saldo_estado: "pagado", pago_saldo_id: pago.mp_order_id }),
    alConfirmar: async (d) => avisos.push(d),
  });
  return { ...s, avisos };
};

let n = 0;
const intento = (extra = {}) => {
  n += 1;
  const referencia = extra.referencia || `RES-${n}`;
  return {
    clave: `clave-${n}`,
    huella: "h-1",
    tipo: "adelanto",
    referencia,
    monto: 20,
    fecha: "2026-11-02",
    inicio: 600,
    fin: 675,
    payload: { nombre_cliente: "Ana", codigo: referencia, fecha_cita: "2026-11-02", inicio: 600, duracion_min: 75, estado: "approved" },
    cobro: { email: "a@b.com", celular: "987654321", token: "tok" },
    ...extra,
  };
};

test("pago aprobado: se crea la reserva y el intento queda confirmado", async () => {
  const repo = repoEnMemoria();
  const mp = mpFalso([resumen("aprobado")]);
  const s = servicio(repo, mp);
  const r = await s.cobrar(intento());
  assert.equal(r.estado, "confirmado");
  assert.equal(repo.reservas.length, 1);
  assert.equal(repo.reservas[0].pago_adelanto_id, "ORD01A");
  assert.equal(repo.pagos[0].estado, "confirmado");
  assert.equal(repo.pagos[0].mp_order_id, "ORD01A");
  assert.equal(mp.cobros[0].idempotencyKey, repo.pagos[0].clave_idempotencia);
  assert.equal(s.avisos.length, 1);
});

test("pago rechazado (high_risk): no se crea reserva, se guardan los IDs y el horario se libera", async () => {
  const repo = repoEnMemoria();
  const s = servicio(repo, mpFalso([resumen("rechazado"), resumen("aprobado", { order_id: "ORD01B" })]));
  const r = await s.cobrar(intento());
  assert.equal(r.estado, "rechazado");
  assert.equal(repo.reservas.length, 0);
  assert.equal(repo.pagos[0].mp_status_detail, "high_risk");
  assert.equal(repo.pagos[0].mp_order_id, "ORD01A");
  assert.equal(repo.pagos[0].mp_request_id, "req-1");
  // Otro intento sobre el mismo horario sí puede pasar
  assert.equal((await s.cobrar(intento())).estado, "confirmado");
});

test("reintento de la misma operación (misma clave): no se vuelve a cobrar", async () => {
  const repo = repoEnMemoria();
  const mp = mpFalso([resumen("aprobado")]);
  const s = servicio(repo, mp);
  const datos = intento();
  await s.cobrar(datos);
  const r = await s.cobrar(datos);
  assert.equal(r.estado, "confirmado");
  assert.equal(r.repetido, true);
  assert.equal(mp.cobros.length, 1);
  assert.equal(repo.reservas.length, 1);
});

test("misma clave con otra compra: se rechaza sin cobrar", async () => {
  const repo = repoEnMemoria();
  const mp = mpFalso([resumen("aprobado")]);
  const s = servicio(repo, mp);
  const datos = intento();
  await s.cobrar(datos);
  const r = await s.cobrar({ ...datos, huella: "otra-compra", inicio: 900, fin: 960 });
  assert.equal(r.estado, "clave_reutilizada");
  assert.equal(mp.cobros.length, 1);
});

test("solicitudes simultáneas por el mismo horario: solo una llega a Mercado Pago", async () => {
  const repo = repoEnMemoria();
  const mp = mpFalso([resumen("aprobado")]);
  const s = servicio(repo, mp);
  const [a, b] = await Promise.all([s.cobrar(intento()), s.cobrar(intento({ inicio: 630, fin: 660 }))]);
  assert.deepEqual([a.estado, b.estado].sort(), ["confirmado", "ocupado"]);
  assert.equal(mp.cobros.length, 1);
  assert.equal(repo.reservas.length, 1);
});

test("Supabase falla después de aprobarse el pago: el horario sigue bloqueado y la conciliación crea la reserva sin cobrar de nuevo", async () => {
  const repo = repoEnMemoria();
  const mp = mpFalso([resumen("aprobado")]);
  const s = servicio(repo, mp);
  repo.fallarInsertReserva(true);
  const r = await s.cobrar(intento());
  assert.equal(r.estado, "aprobado_sin_reserva");
  assert.equal(repo.pagos[0].estado, "aprobado");
  assert.equal(repo.reservas.length, 0);
  // Nadie más puede tomar ese horario mientras tanto
  assert.equal((await s.cobrar(intento())).estado, "ocupado");

  repo.fallarInsertReserva(false);
  const resultados = await s.conciliar();
  assert.equal(resultados[0].despues, "confirmado");
  assert.equal(repo.reservas.length, 1);
  assert.equal(repo.pagos[0].estado, "confirmado");
  assert.equal(mp.cobros.length, 1);
  // Conciliar otra vez no duplica nada
  await s.conciliar();
  assert.equal(repo.reservas.length, 1);
});

test("timeout (resultado desconocido): queda verificando y el webhook lo confirma después", async () => {
  const repo = repoEnMemoria();
  const mp = mpFalso(
    [resumen("desconocido", { http_status: null, order_id: null, error_code: "timeout" })],
    [resumen("aprobado", { order_id: "ORD01T", external_reference: "RES-T" })]
  );
  const s = servicio(repo, mp);
  const r = await s.cobrar(intento({ referencia: "RES-T" }));
  assert.equal(r.estado, "verificando");
  assert.equal(repo.reservas.length, 0);
  assert.equal((await s.cobrar(intento())).estado, "ocupado");

  const w = await s.procesarNotificacionOrden("ORD01T");
  assert.equal(w.estado, "confirmado");
  assert.equal(repo.reservas.length, 1);
  assert.equal(repo.pagos[0].mp_order_id, "ORD01T");
  // Webhook repetido: idempotente
  await s.procesarNotificacionOrden("ORD01T");
  assert.equal(repo.reservas.length, 1);
});

test("conciliación de un pago pendiente con orden conocida: se consulta GET /v1/orders y se libera si falló", async () => {
  const repo = repoEnMemoria();
  const mp = mpFalso([resumen("pendiente", { order_id: "ORD01P" })], [resumen("rechazado", { order_id: "ORD01P" })]);
  const s = servicio(repo, mp);
  assert.equal((await s.cobrar(intento())).estado, "verificando");
  const resultados = await s.conciliar();
  assert.deepEqual(mp.consultas, ["ORD01P"]);
  assert.equal(resultados[0].despues, "rechazado");
  assert.equal(repo.reservas.length, 0);
});

test("pago del saldo: actualiza la reserva existente", async () => {
  const repo = repoEnMemoria();
  repo.reservas.push({ id: 7, codigo: "RES-OLD", saldo_estado: "pendiente" });
  const s = servicio(repo, mpFalso([resumen("aprobado", { order_id: "ORD01S" })]));
  const r = await s.cobrar(intento({ tipo: "saldo", referencia: "RES-OLD-SALDO-1", reservaId: 7, fecha: undefined, payload: undefined }));
  assert.equal(r.estado, "confirmado");
  assert.equal(repo.reservas[0].saldo_estado, "pagado");
  assert.equal(repo.reservas[0].pago_saldo_id, "ORD01S");
});
