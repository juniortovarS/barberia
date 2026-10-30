# Pagos con Yape (Mercado Pago Orders): auditoría, pruebas, soporte y despliegue

Fecha: 26/10/2026 · Caso Mercado Pago: **491197858**

## 1. Auditoría del código anterior

Se comparó contra la guía oficial de Yape para Orders (Perú):
<https://www.mercadopago.com.pe/developers/es/docs/checkout-api-orders/payment-integration/websites/yape>

### Qué estaba correcto (no explica `high_risk`)

| Punto | Resultado |
|---|---|
| Endpoint `POST /v1/orders`, `type: online`, `processing_mode: automatic` | Coincide con la documentación |
| `payment_method: { id: "yape", type: "debit_card", token }` | Coincide |
| Importes como texto con 2 decimales (`"20.00"`), `total_amount` = `amount` del pago | Coincide |
| `payer.email`, `payer.phone.area_code = "51"`, `payer.phone.number` (celular del Yape) | Coincide (son los campos obligatorios) |
| `X-Idempotency-Key` presente | Obligatorio y presente |
| `X-meli-session-id` con `MP_DEVICE_SESSION_ID` de `security.js` | Es el uso que documenta Mercado Pago para el Device ID |
| Estado aprobado = `status: processed` + `status_detail: accredited` | Coincide |
| El token Yape se genera en el navegador con MercadoPago.js y se usa una sola vez | Correcto |

**Conclusión:** el cuerpo de la orden es válido. `failed / high_risk` es la respuesta del
antifraude de Mercado Pago. **El código no demuestra que la causa sea un fallo de implementación, y
tampoco demuestra que la causa sean los pagos de prueba consecutivos.** Solo Mercado Pago puede
explicar la decisión.

Campos opcionales que la guía muestra y que no enviamos: `payer.identification` (DNI) y
`config.location.state_id` (p. ej. `PE-LIM`). La guía no dice que mejoren la aprobación. No los agregué
porque no los pedimos al cliente. Si soporte lo recomienda, conviene añadirlos.

### Problemas confirmados en el código (ya corregidos)

1. **Rechazos sin identificadores.** Ante un rechazo solo se registraba `failed / high_risk`. No quedaban el ID de la orden,
   el ID del pago, el HTTP status ni el `x-request-id`. Por eso hoy no hay datos para soporte.
2. **Se registraba el JSON completo de Mercado Pago** cuando la respuesta no era 2xx. Ese JSON puede traer datos del comprador.
3. **Idempotencia sin efecto.** `crypto.randomUUID()` se generaba en cada llamada y no había reintentos, así que la clave
   nunca servía para repetir una operación de forma segura.
4. **Fetch sin timeout.** Un timeout o un error de red devolvía "No pudimos comunicarnos con Yape", aunque en ese caso **no
   se sabe** si Mercado Pago cobró.
5. **El frontend afirmaba "No se realizó ningún cobro"** cuando se cortaba la conexión con el backend, y eso no era seguro.
6. **Condición de carrera en la disponibilidad.** `validarTurno` leía y la cita se insertaba recién después del cobro. Dos
   clientes podían pasar la verificación a la vez, pagar los dos y quedar con el mismo horario.
7. **Cobro aprobado sin reserva.** Si fallaba el `insert` en Supabase, el pago solo quedaba en `console.error`. No había
   registro persistente ni recuperación.
8. **Estados intermedios tratados como rechazo.** Una orden `processing`/`action_required` se le mostraba al cliente como
   rechazada, aunque aún podía aprobarse.
9. **El mensaje de `high_risk` animaba a "usar otra cuenta Yape"** y a reintentar. Eso empuja a repetir intentos frente al
   antifraude. Ahora el mensaje dice que no hubo cobro y manda al cliente al WhatsApp.

### Riesgos potenciales (no comprobados)

- `security.js` se carga de forma asíncrona. Si el cliente paga muy rápido, `MP_DEVICE_SESSION_ID` puede no existir todavía
  y el pago sale sin Device ID. Ahora cada intento registra `con_device_id: true/false` para medirlo.
- El registro manual de citas del admin (`/reservar-cita`) no pasa por el candado de horarios.
- La tienda (`/crear-preferencia`) usa el SDK antiguo y `back_urls` de ejemplo. No forma parte de este cambio.

## 2. Qué cambió

| Archivo | Cambio |
|---|---|
| `barberia-backend/mercadopago-orders.js` (nuevo) | Cliente de Orders con timeout de 15 s y 1 reintento técnico (red, timeout, 5xx, 429) con **la misma** clave de idempotencia. Clasifica cada resultado: aprobado, rechazado, pendiente, error o desconocido. Log estructurado sin secretos. `GET /v1/orders/{id}`. Validación de la firma de webhooks |
| `barberia-backend/pagos-reserva.js` (nuevo) | Flujo intento → cobro → reserva, conciliación y webhook |
| `supabase/migracion_pagos_yape.sql` (nuevo) | Tabla `pagos_yape` y función `iniciar_pago_yape`, que bloquea el horario de forma atómica (candado por fecha) |
| `barberia-backend/server.js` | Las rutas de cobro usan el flujo nuevo. Se agregan `POST /webhooks/mercadopago`, `GET /admin/pagos`, `POST /admin/pagos/conciliar`, `POST /admin/pagos/:id/liberar` y la conciliación cada 5 minutos |
| `src/pages/Cita.jsx`, `src/pages/Perfil.jsx`, `src/utils/yape.js` | Envían `intento_id` y corrigen el mensaje de corte de conexión |
| `barberia-backend/test/*.test.js` | 23 pruebas automatizadas (`npm test`) |

Las respuestas al frontend mantienen la misma forma (`codigo`, `estado`, `payment_id`, `total`, `adelanto`, `saldo`...).
Las reservas se guardan con las mismas columnas que antes.

### Nuevo flujo de una reserva

1. Supabase registra el intento en `pagos_yape` (estado `procesando`) **y** bloquea el horario en una sola transacción.
   Si el horario está tomado, responde 409 y no se llama a Mercado Pago.
2. Se crea la orden con `X-Idempotency-Key = intento_id`.
3. Se guardan `mp_order_id`, `mp_payment_id`, los estados, `mp_status_detail`, `mp_request_id` y `mp_http_status`.
4. La reserva se crea **solo si** el resultado es `processed/accredited`.
5. Si Supabase falla en el paso 4, el intento queda `aprobado`: el horario sigue bloqueado y la conciliación crea la
   reserva después, sin volver a cobrar.
6. Si no se sabe el resultado (timeout, 5xx o pendiente), el intento queda `verificando`. El cliente ve "NO vuelvas a pagar".
   El webhook o la conciliación (`GET /v1/orders/{id}`) lo resuelven.

Los webhooks firmados y la consulta de estado se complementan: el webhook avisa al momento, y la consulta periódica
cubre los webhooks que no llegan. La notificación nunca se toma como verdad: siempre se consulta la orden en la API.

## 3. Plan de pruebas

### Automatizadas (sin Mercado Pago ni Supabase reales)

```bash
cd barberia-backend && npm test
```

Cubren: pago aprobado, rechazado (`high_risk`, `invalid_card_token`), 400 de validación, error de red con reintento
idempotente, timeout, 5xx, 429, respuesta inesperada, orden pendiente, logs sin secretos, firma de webhook, reintento con
la misma clave, clave usada para otra compra, solicitudes simultáneas, fallo de Supabase después de aprobar, webhook tardío,
conciliación y pago del saldo.

La función SQL se probó aparte en un Postgres 16 temporal: cruces de horarios, citas canceladas, formatos de hora
antiguos, idempotencia, saldo duplicado y **dos sesiones simultáneas** (la segunda espera el candado y recibe `ocupado`).

### Manuales con el entorno de pruebas oficial (sin dinero real)

Usa **credenciales de prueba** en un backend local o en un servicio de Render aparte. No cambies las credenciales de
producción. Necesitas `MP_ACCESS_TOKEN` y `REACT_APP_MP_PUBLIC_KEY` de prueba. El OTP siempre es `123456`
([guía de pruebas](https://www.mercadopago.com.pe/developers/es/docs/checkout-api-orders/integration-test/yape)):

| Caso | Celular | Resultado esperado |
|---|---|---|
| Aprobado | 111111111 | `processed/accredited`, reserva creada |
| Rechazado | 111111112 / 113 / 114 | `failed`, sin reserva, horario liberado |
| Token inválido | 111111115 | `invalid_card_token` |
| Máx. intentos | 111111116 | `max_attempts_exceeded` |
| Datos erróneos | 111111117 | `bad_filled_card_data` |
| Token vencido | cualquiera, reutilizando un token ya usado o esperando más de 2 min | rechazo, sin reintento |
| Doble clic / reintento | 111111111, enviar la misma petición dos veces con el mismo `intento_id` | 1 sola orden en Mercado Pago |
| Simultáneas | dos navegadores, mismo horario | uno paga y el otro recibe 409 sin cobro |

El entorno de pruebas no permite simular `high_risk`.

## 4. Soporte técnico: recuperar operaciones rechazadas

**Desde ahora**, cada intento queda en Supabase (`pagos_yape`) y en los logs de Render como una línea JSON
`"evento":"mp_orden"`, con `order_id`, `payment_id`, `status_detail`, `request_id` y `http_status`. El admin puede listarlos:

```bash
curl -H "Authorization: Bearer <token de sesión admin>" "https://<backend>/admin/pagos?estado=rechazado"
```

Con un ID de orden válido, consulta de solo lectura (sin cobrar):

```bash
curl -H "Authorization: Bearer $MP_ACCESS_TOKEN" https://api.mercadopago.com/v1/orders/<ORDER_ID>
```

**Operaciones recuperadas (26/10/2026)** con `GET /v1/payments/search` (solo lectura). Horas en UTC−4, como las
devuelve la API. En Lima es 1 hora menos:

| Fecha (UTC−4) | ID de pago | Monto | Estado | Detalle | Referencia |
|---|---|---|---|---|---|
| 23/10 12:18:28 | 185725880028 | S/ 2 | refunded | refunded | RES-303686 |
| 23/10 17:46:32 | 184745944051 | S/ 20 | rejected | cc_rejected_high_risk | RES-219055 |
| 23/10 17:47:01 | 184747016105 | S/ 20 | rejected | cc_rejected_high_risk | RES-983081 |
| 23/10 17:48:17 | 185787227690 | S/ 20 | rejected | cc_rejected_high_risk | RES-976862 |
| 23/10 17:48:28 | 184747218291 | S/ 20 | rejected | cc_rejected_high_risk | RES-531234 |
| 23/10 17:57:46 | 185790052248 | S/ 20 | rejected | cc_rejected_high_risk | RES-786537 |
| 26/10 00:06:04 | 186128214154 | S/ 20 | rejected | cc_rejected_high_risk | RES-420058 |
| 26/10 00:06:38 | 185084617837 | S/ 20 | rejected | cc_rejected_high_risk | RES-849912 |

**Intento con el sistema nuevo (26/10/2026, 13:30 Lima, S/ 10, un solo intento autorizado):**
orden `ORD01M5WQNNQ3YPFMQDXGM8ZK98GX` (failed), pago `PAY01M5WQNNQBSC9YAA798FRK0HQ9` = ID 185168601271
(`cc_rejected_high_risk`), referencia RES-316863, `x-request-id` a969ff2a-2231-4535-a829-006b77379a5c. El pagador es el
mismo titular de la cuenta vendedora. No se creó reserva y el horario quedó libre. En Actividad cada intento aparece en
**2 filas**: la orden (sin número) y el pago (con número de operación).

`x-request-id` de las consultas: 6d3adef4-d8a3-40de-a904-d8e8f1c3417d (186128214154) y
4bc77672-e0e6-40d7-91da-d39a144c9967 (185084617837).

En la Actividad aparecen 4 filas a las 23:06 del 25/10 (hora de Lima), pero la API devuelve solo 2 pagos en ese minuto.
Lo más probable es que las 2 filas sin número sean las *órdenes* de esos mismos 2 pagos. Hay que confirmarlo con soporte.

Para repetir la búsqueda (solo lectura):

```bash
curl -H "Authorization: Bearer $MP_ACCESS_TOKEN" "https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&range=date_created&begin_date=NOW-7DAYS&end_date=NOW"
```

**Si faltara alguna:** el código anterior **no guardó** los IDs de las órdenes rechazadas (solo
registró `failed / high_risk`). Alternativas:

1. Buscar en los logs de Render la línea `Mercado Pago rechazó la solicitud:`. Si aparece, trae el JSON completo de la
   respuesta y puede incluir el `id` de la orden.
2. Anotar en los logs de Render la **fecha y hora exactas** de cada `Pago Yape no aprobado: failed / high_risk` y
   enviarlas a soporte junto con los montos y la cuenta vendedora, para que lo busquen internamente.
3. No asumas que las órdenes rechazadas aparecen en Actividad. No hay que inventar IDs.

### Resumen para soporte (caso 491197858)

> Integración: Checkout API vía Orders (`POST /v1/orders`), Yape con código de aprobación (token generado con
> MercadoPago.js), `processing_mode: automatic`, `payment_method { id: yape, type: debit_card }`. Se envía `payer.email`,
> `payer.phone` (51 + celular del Yape), `X-Idempotency-Key` única por intento y `X-meli-session-id` con el
> `MP_DEVICE_SESSION_ID` de security.js.
>
> El 23/10/2026 se aprobó un pago real de prueba de S/ 2 (ID 185725880028, después reembolsado). Desde entonces, los 7
> intentos siguientes de S/ 20 fueron rechazados con `cc_rejected_high_risk`. Los IDs de pago son 184745944051,
> 184747016105, 185787227690, 184747218291 y 185790052248 (23/10, entre 17:46 y 17:57 UTC−4), y 186128214154 y
> 185084617837 (26/10, 00:06 UTC−4, con otra cuenta Yape). Los intentos del 23/10 los hicimos el dueño del negocio y
> conocidos, en pocos minutos y para probar la integración.
>
> Lo que pedimos: (1) confirmar si `high_risk` responde a una regla de riesgo sobre la cuenta vendedora, la integración o
> los compradores; (2) saber si falta algún dato recomendado (p. ej. `payer.identification`, `config.location`, datos
> de `items`, Device ID); (3) saber si la cuenta debe pasar por alguna validación o certificación para cobrar con Yape vía
> Orders; (4) recibir la indicación de cuándo y cómo volver a probar sin afectar el perfil de riesgo.
>
> Desde el [fecha del despliegue] registramos por cada intento: `order_id`, `payment_id`, `status_detail`,
> `x-request-id`, el HTTP status y la hora. Los adjuntaremos en cuanto haya un nuevo intento autorizado.
> Fechas y horas de los rechazos anteriores (según los logs del servidor): [completar desde Render].

## 5. Despliegue en Render

1. **Supabase → SQL Editor:** ejecuta `supabase/migracion_pagos_yape.sql`. Hazlo **antes** de desplegar: sin la tabla,
   el backend nuevo responde 503 en los cobros (es lo esperado).
2. **Mercado Pago → Tus integraciones → tu aplicación → Webhooks** (modo productivo): URL
   `https://<backend>/webhooks/mercadopago`, evento **Order**. Copia la *clave secreta*.
3. **Render → servicio backend → Environment:** agrega `MP_WEBHOOK_SECRET` con esa clave. **No toques**
   `MP_ACCESS_TOKEN` ni `SUPABASE_KEY`.
4. Sube los cambios a GitHub (`git push`). Render redespliega el backend y el sitio estático (este último por el cambio
   del frontend).
5. Revisa: `GET https://<backend>/test` debe responder 200, y en los logs **no** debe aparecer
   `Falta ejecutar supabase/migracion_pagos_yape.sql`.
6. **No hagas pagos reales de prueba** hasta tener la respuesta de soporte. Si autorizas uno, que sea un solo intento.
   Después lee la línea `mp_orden` del log o `GET /admin/pagos` y envía los IDs al caso.

## 6. Yape directo (pago manual verificado por el admin) — modo activo

Mientras Mercado Pago siga rechazando con `high_risk`, la web cobra el adelanto con **Yape directo**.
Este cobro no pasa por ninguna pasarela y no tiene comisión.

### Flujo

1. **Cliente:** en el paso "Pago" ve el número de Yape (con botón Copiar y QR opcional) y yapea el adelanto.
2. **Cliente:** sube la captura de la constancia y escribe el Nº de operación.
3. **Servidor:**
   - valida la imagen (tipo real, máx. 4 MB) y la guarda en el bucket **privado** `vouchers` de Supabase Storage;
   - crea la reserva `pending` con `reservar_yape_manual`. Esa función usa el mismo candado por fecha que los cobros con Mercado Pago, así que nadie más puede tomar ese horario.
4. **Panel admin en vivo, sin F5:**
   - aparece la tarjeta "Yapes por verificar" con la captura, el monto y el Nº de operación;
   - suena un aviso y se muestra una notificación;
   - el título de la pestaña muestra el contador; si el navegador tiene los avisos activados, también llega un aviso del sistema;
   - además se envía un SMS al admin.
5. **Admin:** revisa su app de Yape y elige entre dos opciones:
   - **Llegó · confirmar cita** → la reserva pasa a `approved`. El cliente recibe un SMS y un correo.
   - **No llegó** → elige un motivo. La reserva pasa a `cancelled` y el horario queda libre.
6. **Cliente:** su pantalla de confirmación cambia sola (EventSource firmado) a "¡Pago verificado!" o al motivo del rechazo. En su perfil ve "Verificando tu Yape" y la lista se actualiza sola.

### Protecciones

- **Constancias repetidas:** el mismo Nº de operación no puede usarse en dos reservas activas (índice único).
- **Límites:**
  - 6 intentos por hora por IP;
  - 2 reservas pendientes de verificación por correo.
- **Doble clic o dos dispositivos:** solo se cambia una reserva que sigue `pending`. El segundo clic recibe 409 y el otro panel se actualiza en vivo.
- **Privacidad de las capturas:**
  - solo el admin las ve, mediante enlaces firmados de 10 minutos;
  - el enlace de seguimiento del cliente solo muestra el estado y el motivo, ningún dato personal.

### Despliegue (en este orden)

1. **Supabase → SQL Editor:** ejecutar `supabase/migracion_yape_manual.sql`. Debe aparecer "Success". El bucket `vouchers` lo crea el backend solo.
2. **Render → barberiaJT → Environment:**
   - `PAGO_YAPE_MODO=manual`
   - `YAPE_NUMERO=951038509`
   - `YAPE_TITULAR=` (el nombre que muestra tu Yape)
   - `SEGUIMIENTO_SECRET=` (un texto largo aleatorio)
   - opcional: `YAPE_QR_URL`
   - de paso, `RESERVA_MONTO=20`
3. Subir el código (push). Render despliega el backend y la web.
4. **Prueba:**
   - hacer una reserva yapeando S/ 20 a tu propio número desde otro celular, o usar una captura cualquiera y luego rechazarla;
   - comprobar que aparece sola en el panel, aprobar o rechazar, y comprobar que la pantalla del cliente cambia sola.

### Volver a Mercado Pago

Cuando soporte (caso 491197858) levante la restricción, cambiar `PAGO_YAPE_MODO=mercadopago` en Render. No hace falta tocar el código.
