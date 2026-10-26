// =====================================================================
// 💜 Cliente de la API de Orders de Mercado Pago (cobros con Yape)
// =====================================================================
// - Nunca registra el Access Token, el token de Yape ni datos completos del comprador.
// - Reintenta solo fallos técnicos (red, timeout, 5xx, 429) y SIEMPRE con la misma X-Idempotency-Key,
//   para que Mercado Pago no procese dos veces la misma operación.
// - No reintenta rechazos del pago (p. ej. high_risk): esa es una decisión del antifraude, no un error técnico.
const crypto = require("crypto");

const MP_API = "https://api.mercadopago.com";

// resultado:
//   "aprobado"    → orden processed + pago accredited
//   "rechazado"   → Mercado Pago procesó la orden y no la aprobó (status failed)
//   "pendiente"   → la orden existe pero aún no tiene un estado final
//   "error"       → la solicitud no se procesó (400/401/403/404/429...): no hubo cobro
//   "desconocido" → no sabemos si se cobró (timeout, error de red, 5xx): hay que verificar
const resultadoDe = (http, orden, detalle) => {
  if (orden?.id || orden?.status) {
    if (orden.status === "processed" && detalle === "accredited") return "aprobado";
    if (["failed", "canceled", "cancelled", "expired", "refunded", "charged_back"].includes(orden.status)) return "rechazado";
    return "pendiente";
  }
  // Sin respuesta, 5xx o un 2xx ilegible: la orden pudo crearse igual
  if (http == null || http >= 500 || (http >= 200 && http < 300)) return "desconocido";
  return "error";
};

const recortar = (v, max = 200) => (v == null ? null : String(v).slice(0, max));

// En un rechazo los datos de la orden pueden venir dentro de "data" (junto a "errors")
const ordenDe = (cuerpo) => (cuerpo && cuerpo.data && !cuerpo.status ? cuerpo.data : cuerpo) || {};

// Solo identificadores y estados: es lo único que se registra o se guarda
const resumirRespuesta = (http, cuerpo, headers) => {
  const orden = ordenDe(cuerpo);
  const pago = orden.transactions?.payments?.[0] || {};
  const error = cuerpo?.errors?.[0] || null;
  // "payments[0]: high_risk" → "high_risk"
  const detalleError = (error?.details || [])
    .map((d) => String(d).split(": ").pop())
    .find((d) => /^[a-z_]+$/.test(d));
  const detalle = pago.status_detail || orden.status_detail || detalleError || null;
  return {
    resultado: resultadoDe(http, orden, pago.status_detail || orden.status_detail),
    http_status: http ?? null,
    order_id: orden.id || null,
    external_reference: orden.external_reference || null,
    order_status: orden.status || null,
    order_status_detail: orden.status_detail || null,
    payment_id: pago.id || null,
    payment_status: pago.status || null,
    status_detail: detalle,
    request_id: headers?.get?.("x-request-id") || null,
    error_code: recortar(error?.code || cuerpo?.error, 80),
    error_message: recortar(error?.message || cuerpo?.message),
    error_details: (error?.details || []).slice(0, 3).map((d) => recortar(d, 120)),
  };
};

const enmascararCelular = (cel) => {
  const d = String(cel || "").replace(/\D/g, "");
  return d ? `***${d.slice(-3)}` : null;
};

const enmascararEmail = (email) => {
  const [usuario, dominio] = String(email || "").split("@");
  return dominio ? `${usuario.slice(0, 2)}***@${dominio}` : null;
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const crearClienteMP = ({
  accessToken,
  fetchImpl = (...args) => fetch(...args),
  timeoutMs = 15000,
  maxIntentos = 2,
  pausaMs = 1000,
  log = (linea) => console.log(linea),
} = {}) => {
  const registrar = (datos) => log(JSON.stringify({ ts: new Date().toISOString(), ...datos }));

  // Hace la solicitud con timeout; reintenta fallos técnicos reutilizando exactamente los mismos headers/cuerpo
  const solicitar = async (metodo, ruta, { headers = {}, cuerpo, contexto = {} } = {}) => {
    let resumen;
    for (let intento = 1; intento <= maxIntentos; intento++) {
      const inicio = Date.now();
      let http = null;
      let cuerpoResp = null;
      let headersResp = null;
      let errorRed = null;
      try {
        const resp = await fetchImpl(`${MP_API}${ruta}`, {
          method: metodo,
          headers: { Authorization: `Bearer ${accessToken}`, ...headers },
          body: cuerpo ? JSON.stringify(cuerpo) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });
        http = resp.status;
        headersResp = resp.headers;
        cuerpoResp = await resp.json().catch(() => null);
      } catch (err) {
        errorRed = err.name === "TimeoutError" || err.name === "AbortError" ? "timeout" : "error_de_red";
      }

      resumen = resumirRespuesta(http, cuerpoResp, headersResp);
      if (errorRed) resumen.error_code = errorRed;
      registrar({
        nivel: resumen.resultado === "aprobado" ? "info" : "warn",
        evento: "mp_orden",
        metodo,
        intento,
        duracion_ms: Date.now() - inicio,
        ...contexto,
        ...resumen,
      });

      const reintentable = errorRed || http === 429 || (http >= 500 && !resumen.order_id);
      if (!reintentable || intento === maxIntentos) break;
      const retryAfter = Number(headersResp?.get?.("retry-after"));
      await esperar(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : pausaMs);
    }
    // Un 429 que persiste significa que la orden no se creó (no hubo cobro)
    if (resumen.http_status === 429) resumen.resultado = "error";
    return resumen;
  };

  // https://www.mercadopago.com.pe/developers/es/docs/checkout-api-orders/payment-integration/websites/yape
  const crearOrdenYape = ({ idempotencyKey, monto, email, celular, token, referencia, descripcion, deviceId }) => {
    const importe = (Math.round(Number(monto) * 100) / 100).toFixed(2);
    const concepto = descripcion || "Reserva Barber Studio JP";
    const headers = { "Content-Type": "application/json", "X-Idempotency-Key": idempotencyKey || crypto.randomUUID() };
    if (deviceId) headers["X-meli-session-id"] = String(deviceId).slice(0, 200);
    return solicitar("POST", "/v1/orders", {
      headers,
      cuerpo: {
        type: "online",
        processing_mode: "automatic",
        external_reference: referencia,
        total_amount: importe,
        description: concepto,
        items: [{ title: concepto, unit_price: importe, quantity: 1 }],
        payer: {
          email,
          entity_type: "individual",
          phone: { area_code: "51", number: String(celular).replace(/\D/g, "").slice(-9) },
        },
        transactions: {
          payments: [{ amount: importe, payment_method: { id: "yape", type: "debit_card", token } }],
        },
      },
      contexto: {
        referencia,
        idempotency_key: headers["X-Idempotency-Key"],
        monto: importe,
        celular: enmascararCelular(celular),
        email: enmascararEmail(email),
        con_device_id: Boolean(deviceId),
      },
    });
  };

  const obtenerOrden = (orderId) =>
    solicitar("GET", `/v1/orders/${encodeURIComponent(orderId)}`, { contexto: { consulta: true } });

  return { crearOrdenYape, obtenerOrden };
};

// Webhooks: valida x-signature ("ts=...,v1=...") con la clave secreta de la aplicación
// Manifiesto: "id:[data.id en minúsculas];request-id:[x-request-id];ts:[ts];" (se omite lo que no venga)
const verificarFirmaWebhook = ({ secreto, xSignature, xRequestId, dataId, toleranciaMs = 10 * 60 * 1000, ahora = Date.now() }) => {
  if (!secreto || !xSignature) return false;
  const partes = Object.fromEntries(
    String(xSignature).split(",").map((p) => p.split("=").map((s) => s.trim())).filter((p) => p.length === 2)
  );
  const { ts, v1 } = partes;
  if (!ts || !v1) return false;
  // ts puede venir en segundos o en milisegundos
  const tsMs = Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts);
  if (!Number.isFinite(tsMs) || Math.abs(ahora - tsMs) > toleranciaMs) return false;
  let manifiesto = "";
  if (dataId) manifiesto += `id:${String(dataId).toLowerCase()};`;
  if (xRequestId) manifiesto += `request-id:${xRequestId};`;
  manifiesto += `ts:${ts};`;
  const esperado = crypto.createHmac("sha256", secreto).update(manifiesto).digest("hex");
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(String(v1), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = { crearClienteMP, resumirRespuesta, verificarFirmaWebhook, enmascararCelular, enmascararEmail };
