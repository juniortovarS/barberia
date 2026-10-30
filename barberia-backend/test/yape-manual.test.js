const test = require("node:test");
const assert = require("node:assert/strict");
const {
  decodificarComprobante,
  normalizarOperacion,
  tokenSeguimiento,
  tokenValido,
  crearLimitador,
  estadoPublico,
  crearServicioYapeManual,
} = require("../yape-manual");

// JPEG mínimo válido en cabecera (FF D8 FF) con relleno
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const dataUrl = (mime, buf) => `data:${mime};base64,${buf.toString("base64")}`;

test("comprobante: acepta JPEG real y rechaza tipo falso, tamaño excesivo y basura", () => {
  const ok = decodificarComprobante(dataUrl("image/jpeg", jpeg));
  assert.equal(ok.error, undefined);
  assert.equal(ok.extension, "jpg");
  assert.equal(ok.mime, "image/jpeg");

  // Dice ser PNG pero son bytes de JPEG
  assert.ok(decodificarComprobante(dataUrl("image/png", jpeg)).error);
  // HTML disfrazado
  assert.ok(decodificarComprobante(dataUrl("image/jpeg", Buffer.from("<script>alert(1)</script>".repeat(10)))).error);
  assert.ok(decodificarComprobante("data:application/pdf;base64,AAAA").error);
  assert.ok(decodificarComprobante(undefined).error);
  const enorme = Buffer.concat([jpeg, Buffer.alloc(4 * 1024 * 1024)]);
  assert.match(decodificarComprobante(dataUrl("image/jpeg", enorme)).error, /pesada/);
});

test("Nº de operación: se normaliza y se valida", () => {
  assert.equal(normalizarOperacion(" 0123 4567 "), "01234567");
  assert.equal(normalizarOperacion("ab-12.34"), "AB1234");
  assert.equal(normalizarOperacion("12"), null);
  assert.equal(normalizarOperacion("<b>1234</b>"), null);
});

test("token de seguimiento: solo sirve para su propio código", () => {
  const t = tokenSeguimiento("secreto", "RES-111111");
  assert.equal(tokenValido("secreto", "RES-111111", t), true);
  assert.equal(tokenValido("secreto", "RES-222222", t), false);
  assert.equal(tokenValido("otro", "RES-111111", t), false);
  assert.equal(tokenValido("secreto", "RES-111111", undefined), false);
});

test("limitador por IP: corta al superar el máximo y se libera al pasar la ventana", () => {
  let t = 0;
  const permitir = crearLimitador({ maximo: 2, ventanaMs: 1000, ahora: () => t });
  assert.equal(permitir("ip"), true);
  assert.equal(permitir("ip"), true);
  assert.equal(permitir("ip"), false);
  assert.equal(permitir("otra-ip"), true);
  t = 1500;
  assert.equal(permitir("ip"), true);
});

test("estado público: no expone datos personales", () => {
  const r = { codigo: "RES-1", estado: "cancelled", pago_motivo_rechazo: "No llegó", nombre: "Ana", celular: "987654321", email: "a@b.com" };
  assert.deepEqual(estadoPublico(r), { codigo: "RES-1", estado: "cancelled", motivo: "No llegó" });
});

// ---------- servicio con repositorio en memoria ----------
const repoEnMemoria = () => {
  const reservas = [];
  const archivos = new Map();
  let seq = 0;
  return {
    reservas,
    archivos,
    async subirComprobante(ruta, buffer) { archivos.set(ruta, buffer); },
    async borrarComprobante(ruta) { archivos.delete(ruta); },
    async reservarAtomico(reserva, inicio, fin) {
      const choca = reservas.some((r) => r.fecha_cita === reserva.fecha_cita && r.estado !== "cancelled" && r.inicio < fin && r.fin > inicio);
      if (choca) return { resultado: "ocupado" };
      if (reservas.some((r) => r.yape_operacion === reserva.yape_operacion && r.estado !== "cancelled")) return { resultado: "operacion_repetida" };
      const nueva = { id: ++seq, ...reserva, inicio, fin };
      reservas.push(nueva);
      return { resultado: "nuevo", reserva: { ...nueva } };
    },
    async actualizarSiPendiente(id, campos) {
      const r = reservas.find((x) => x.id === Number(id) && x.estado === "pending" && x.pago_metodo === "yape_manual");
      if (!r) return null;
      Object.assign(r, campos);
      return { ...r };
    },
    async obtenerReserva(id) { return reservas.find((x) => x.id === Number(id)) || null; },
  };
};

const servicio = (repo) => {
  const eventos = [];
  const avisos = [];
  const s = crearServicioYapeManual({
    repo,
    emitir: (tipo, datos) => eventos.push({ tipo, ...datos }),
    alRegistrar: async (d) => avisos.push(["registro", d.reserva.codigo, d.panelUrl]),
    alVerificar: async (d) => avisos.push([d.decision, d.reserva.codigo]),
    log: () => {},
  });
  return { ...s, eventos, avisos };
};

let n = 0;
const pedido = (extra = {}) => {
  n += 1;
  return {
    reserva: {
      codigo: `RES-${n}`, fecha_cita: "2026-11-02", hora_cita: "10:00", estado: "pending",
      pago_metodo: "yape_manual", yape_operacion: `OP${n}000`, adelanto: 20, ...extra.reserva,
    },
    inicio: 600,
    fin: 675,
    comprobante: { buffer: jpeg, mime: "image/jpeg", extension: "jpg" },
    ...extra,
  };
};

test("registro: guarda la captura, crea la reserva pending y avisa al panel en vivo", async () => {
  const repo = repoEnMemoria();
  const s = servicio(repo);
  const r = await s.registrarPago(pedido({ panelUrl: "http://localhost:3000/admin" }));
  assert.equal(r.estado, "registrado");
  assert.equal(repo.reservas.length, 1);
  assert.equal(repo.archivos.size, 1);
  assert.ok(repo.reservas[0].voucher_url.startsWith("2026-11-02/RES-"));
  assert.equal(s.eventos[0].tipo, "pago_por_verificar");
  await new Promise((r2) => setImmediate(r2));
  assert.deepEqual(s.avisos[0], ["registro", r.reserva.codigo, "http://localhost:3000/admin"]);
});

test("horario tomado o constancia repetida: no crea reserva y borra la captura subida", async () => {
  const repo = repoEnMemoria();
  const s = servicio(repo);
  await s.registrarPago(pedido());
  assert.equal((await s.registrarPago(pedido({ inicio: 630, fin: 660 }))).estado, "ocupado");
  assert.equal((await s.registrarPago(pedido({ inicio: 900, fin: 960, reserva: { yape_operacion: repo.reservas[0].yape_operacion } }))).estado, "operacion_repetida");
  assert.equal(repo.reservas.length, 1);
  assert.equal(repo.archivos.size, 1);
});

test("si falla la base de datos al reservar, se borra la captura y el error sube", async () => {
  const repo = repoEnMemoria();
  repo.reservarAtomico = async () => { throw new Error("connection terminated"); };
  const s = servicio(repo);
  await assert.rejects(s.registrarPago(pedido()), /connection terminated/);
  assert.equal(repo.archivos.size, 0);
});

test("aprobar: confirma la cita una sola vez aunque se haga doble clic o desde dos dispositivos", async () => {
  const repo = repoEnMemoria();
  const s = servicio(repo);
  const { reserva } = await s.registrarPago(pedido());
  const [a, b] = await Promise.all([
    s.verificarPago({ id: reserva.id, decision: "aprobar", admin: "admin@x.com" }),
    s.verificarPago({ id: reserva.id, decision: "rechazar", admin: "otro@x.com" }),
  ]);
  assert.deepEqual([a.estado, b.estado], ["aprobada", "ya_revisada"]);
  assert.equal(repo.reservas[0].estado, "approved");
  assert.equal(repo.reservas[0].pago_revisado_por, "admin@x.com");
  assert.equal(s.eventos.filter((e) => e.tipo === "pago_aprobado").length, 1);
});

test("rechazar: cancela con motivo legible y libera el horario", async () => {
  const repo = repoEnMemoria();
  const s = servicio(repo);
  const { reserva } = await s.registrarPago(pedido());
  const r = await s.verificarPago({ id: reserva.id, decision: "rechazar", motivo: "monto_incorrecto", admin: "a@x.com" });
  assert.equal(r.estado, "rechazada");
  assert.equal(repo.reservas[0].estado, "cancelled");
  assert.match(repo.reservas[0].pago_motivo_rechazo, /monto/);
  // El mismo horario vuelve a estar libre
  assert.equal((await s.registrarPago(pedido())).estado, "registrado");
});

test("verificar: decisión inválida o reserva inexistente", async () => {
  const s = servicio(repoEnMemoria());
  assert.equal((await s.verificarPago({ id: 1, decision: "borrar" })).estado, "invalido");
  assert.equal((await s.verificarPago({ id: 99, decision: "aprobar" })).estado, "no_encontrada");
});
