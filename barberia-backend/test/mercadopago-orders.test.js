const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { crearClienteMP, verificarFirmaWebhook } = require("../mercadopago-orders");

const ACCESS_TOKEN = "APP_USR-secreto-de-prueba";
const YAPE_TOKEN = "tok_yape_unico_123";

const respuesta = (status, cuerpo, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: new Headers({ "x-request-id": "req-abc", ...headers }),
  json: async () => {
    if (cuerpo === undefined) throw new SyntaxError("Unexpected end of JSON input");
    return cuerpo;
  },
});

const orden = (status, detalle, extra = {}) => ({
  id: "ORD01TEST",
  status,
  status_detail: detalle,
  external_reference: "RES-123456",
  transactions: { payments: [{ id: "PAY01TEST", status, status_detail: detalle }] },
  payer: { email: "cliente@correo.com" },
  ...extra,
});

// Cliente con fetch simulado: cada llamada consume la siguiente respuesta (o lanza el error indicado)
const cliente = (respuestas, opciones = {}) => {
  const llamadas = [];
  const logs = [];
  const mp = crearClienteMP({
    accessToken: ACCESS_TOKEN,
    pausaMs: 1,
    log: (l) => logs.push(l),
    fetchImpl: async (url, init) => {
      llamadas.push({ url, init, cuerpo: init.body && JSON.parse(init.body) });
      const r = respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    },
    ...opciones,
  });
  return { mp, llamadas, logs };
};

const cobrar = (mp, extra = {}) =>
  mp.crearOrdenYape({
    idempotencyKey: "11111111-2222-4333-8444-555555555555",
    monto: 20,
    email: "cliente@correo.com",
    celular: "987654321",
    token: YAPE_TOKEN,
    referencia: "RES-123456",
    descripcion: "Adelanto Servicio Básico",
    deviceId: "device-xyz",
    ...extra,
  });

test("pago aprobado: cuerpo y headers según la documentación de Orders + Yape", async () => {
  const { mp, llamadas } = cliente([respuesta(201, orden("processed", "accredited"))]);
  const r = await cobrar(mp);

  assert.equal(r.resultado, "aprobado");
  assert.equal(r.order_id, "ORD01TEST");
  assert.equal(r.payment_id, "PAY01TEST");
  assert.equal(r.request_id, "req-abc");
  assert.equal(llamadas.length, 1);

  const { url, init, cuerpo } = llamadas[0];
  assert.equal(url, "https://api.mercadopago.com/v1/orders");
  assert.equal(init.headers["X-Idempotency-Key"], "11111111-2222-4333-8444-555555555555");
  assert.equal(init.headers["X-meli-session-id"], "device-xyz");
  assert.equal(cuerpo.type, "online");
  assert.equal(cuerpo.processing_mode, "automatic");
  assert.equal(cuerpo.total_amount, "20.00");
  assert.equal(cuerpo.external_reference, "RES-123456");
  assert.deepEqual(cuerpo.payer.phone, { area_code: "51", number: "987654321" });
  assert.deepEqual(cuerpo.transactions.payments[0], {
    amount: "20.00",
    payment_method: { id: "yape", type: "debit_card", token: YAPE_TOKEN },
  });
});

test("rechazo high_risk: se clasifica como rechazo del antifraude y NO se reintenta", async () => {
  const { mp, llamadas } = cliente([respuesta(200, orden("failed", "high_risk"))]);
  const r = await cobrar(mp);
  assert.equal(r.resultado, "rechazado");
  assert.equal(r.status_detail, "high_risk");
  assert.equal(r.order_id, "ORD01TEST");
  assert.equal(llamadas.length, 1);
});

test("rechazo con la orden dentro de data y detalle en errors", async () => {
  const cuerpo = {
    errors: [{ code: "failed", message: "The following transactions failed", details: ["PAY01TEST: high_risk"] }],
    data: { id: "ORD01X", status: "failed", transactions: { payments: [{ id: "PAY01X", status: "failed" }] } },
  };
  const { mp, llamadas } = cliente([respuesta(402, cuerpo)]);
  const r = await cobrar(mp);
  assert.equal(r.resultado, "rechazado");
  assert.equal(r.order_id, "ORD01X");
  assert.equal(r.status_detail, "high_risk");
  assert.equal(r.error_code, "failed");
  assert.equal(llamadas.length, 1);
});

test("token Yape inválido / vencido (simulados con 111111115): rechazo sin reintento", async () => {
  const { mp, llamadas } = cliente([respuesta(200, orden("failed", "invalid_card_token"))]);
  const r = await cobrar(mp);
  assert.equal(r.resultado, "rechazado");
  assert.equal(r.status_detail, "invalid_card_token");
  assert.equal(llamadas.length, 1);
});

test("400 de validación sin orden: error técnico, sin cobro y sin reintento", async () => {
  const { mp, llamadas } = cliente([respuesta(400, { errors: [{ code: "invalid_token", message: "token is invalid" }] })]);
  const r = await cobrar(mp);
  assert.equal(r.resultado, "error");
  assert.equal(r.error_code, "invalid_token");
  assert.equal(llamadas.length, 1);
});

test("error de red y luego éxito: el reintento usa la MISMA clave de idempotencia y el mismo cuerpo", async () => {
  const { mp, llamadas } = cliente([new TypeError("fetch failed"), respuesta(201, orden("processed", "accredited"))]);
  const r = await cobrar(mp);
  assert.equal(r.resultado, "aprobado");
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[0].init.headers["X-Idempotency-Key"], llamadas[1].init.headers["X-Idempotency-Key"]);
  assert.equal(llamadas[0].init.body, llamadas[1].init.body);
});

test("timeout persistente: resultado desconocido (hay que verificar, no se informa rechazo)", async () => {
  const timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" });
  const { mp, llamadas } = cliente([timeout]);
  const r = await cobrar(mp);
  assert.equal(r.resultado, "desconocido");
  assert.equal(r.error_code, "timeout");
  assert.equal(llamadas.length, 2);
});

test("5xx persistente: desconocido tras reintentar con la misma clave", async () => {
  const { mp, llamadas } = cliente([respuesta(503, { message: "unavailable" })]);
  const r = await cobrar(mp);
  assert.equal(r.resultado, "desconocido");
  assert.equal(llamadas.length, 2);
});

test("429 persistente: error (la orden no se creó)", async () => {
  const { mp, llamadas } = cliente([respuesta(429, { message: "too many" }, { "retry-after": "0" })]);
  const r = await cobrar(mp);
  assert.equal(r.resultado, "error");
  assert.equal(llamadas.length, 2);
});

test("respuesta inesperada (2xx sin JSON): desconocido, no aprobado ni rechazado", async () => {
  const { mp } = cliente([respuesta(201, undefined)]);
  const r = await cobrar(mp);
  assert.equal(r.resultado, "desconocido");
});

test("orden sin estado final (processing): pendiente", async () => {
  const { mp } = cliente([respuesta(201, orden("processing", "in_process"))]);
  const r = await cobrar(mp);
  assert.equal(r.resultado, "pendiente");
});

test("los logs no contienen Access Token, token de Yape, email ni celular completos", async () => {
  const { mp, logs } = cliente([respuesta(200, orden("failed", "high_risk"))]);
  await cobrar(mp);
  const texto = logs.join("\n");
  assert.ok(logs.length >= 1);
  for (const secreto of [ACCESS_TOKEN, YAPE_TOKEN, "cliente@correo.com", "987654321", "Bearer"]) {
    assert.ok(!texto.includes(secreto), `el log contiene ${secreto}`);
  }
  const linea = JSON.parse(logs[0]);
  assert.equal(linea.evento, "mp_orden");
  assert.equal(linea.order_id, "ORD01TEST");
  assert.equal(linea.payment_id, "PAY01TEST");
  assert.equal(linea.status_detail, "high_risk");
  assert.equal(linea.request_id, "req-abc");
  assert.equal(linea.http_status, 200);
  assert.equal(linea.celular, "***321");
});

test("consulta de orden: GET /v1/orders/{id}", async () => {
  const { mp, llamadas } = cliente([respuesta(200, orden("processed", "accredited"))]);
  const r = await mp.obtenerOrden("ORD01TEST");
  assert.equal(r.resultado, "aprobado");
  assert.equal(r.external_reference, "RES-123456");
  assert.equal(llamadas[0].url, "https://api.mercadopago.com/v1/orders/ORD01TEST");
  assert.equal(llamadas[0].init.method, "GET");
});

test("firma de webhook: válida, alterada y vencida", () => {
  const secreto = "clave-webhook";
  const ts = String(Date.now());
  const manifiesto = `id:ord01abc;request-id:req-1;ts:${ts};`;
  const v1 = crypto.createHmac("sha256", secreto).update(manifiesto).digest("hex");
  const base = { secreto, xRequestId: "req-1", dataId: "ORD01ABC" };

  assert.equal(verificarFirmaWebhook({ ...base, xSignature: `ts=${ts},v1=${v1}` }), true);
  const alterada = (v1[0] === "a" ? "b" : "a") + v1.slice(1);
  assert.equal(verificarFirmaWebhook({ ...base, xSignature: `ts=${ts},v1=${alterada}` }), false);
  assert.equal(verificarFirmaWebhook({ ...base, dataId: "ORD01OTRA", xSignature: `ts=${ts},v1=${v1}` }), false);
  assert.equal(verificarFirmaWebhook({ ...base, xSignature: `ts=${ts},v1=${v1}`, ahora: Date.now() + 60 * 60 * 1000 }), false);
  assert.equal(verificarFirmaWebhook({ ...base, secreto: "", xSignature: `ts=${ts},v1=${v1}` }), false);
});
