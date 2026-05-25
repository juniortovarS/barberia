require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mercadopago = require("mercadopago");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());
app.use(cors());

// Helpers para formatear celular e integrar SMS Twilio
const formatPeruNumber = (num) => {
  let clean = num.replace(/\s+/g, '');
  if (!clean.startsWith('+')) {
    if (clean.length === 9) {
      return `+51${clean}`;
    }
    return `+51${clean}`;
  }
  return clean;
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
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const params = new URLSearchParams();
  params.append('To', to);
  params.append('From', fromNumber);
  params.append('Body', text);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString()
    });
    const result = await response.json();
    if (response.ok) {
      console.log(`✅ SMS enviado exitosamente a ${to}. SID: ${result.sid}`);
    } else {
      console.error(`❌ Error de Twilio API al enviar a ${to}:`, result.message);
    }
  } catch (err) {
    console.error(`❌ Error de red al enviar SMS a ${to}:`, err.message);
  }
};

// ✅ MercadoPago
mercadopago.configure({
  access_token: "APP_USR-3258188625824242-071103-aba7caf4da3a3236d31dd66e564a9bef-2553371836",
});

// ✅ Supabase
const SUPABASE_URL = "https://hkjjuzhchtvsqqdwmgqf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhramp1emhjaHR2c3FxZHdtZ3FmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjMwMzExNiwiZXhwIjoyMDY3ODc5MTE2fQ.tP5jSXgvHzaf8xMaWVJWnQGc9I0zRR3Ul1VhNgz73lI";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ✅ Ruta para testear que el backend responde
app.get("/test", (_, res) => {
  res.json({ message: "✅ Backend Supabase funcionando correctamente" });
});

// 📅 Ruta para registrar cita en Supabase y enviar notificaciones
app.post("/reservar-cita", async (req, res) => {
  const { nombre, celular, email, fecha_cita, hora_cita } = req.body;

  console.log("📥 Datos recibidos:", req.body);

  if (!nombre || !celular || !email || !fecha_cita || !hora_cita) {
    return res.status(400).json({ error: "⚠️ Faltan datos obligatorios" });
  }

  const fecha_registro = new Date().toISOString(); // Generamos fecha actual

  const { data, error } = await supabase
    .from("reservas")
    .insert([{ nombre, celular, email, fecha_cita, hora_cita, fecha_registro }]);

  if (error) {
    console.error("❌ Error al guardar cita:", error.message, error.details);
    return res.status(500).json({ error: "No se pudo guardar la cita", detalle: error.message });
  }

  // 💬 Notificaciones por SMS
  // 1. Al Administrador
  const adminMsg = `¡Tienes una nueva Reserva!\nCliente: ${nombre}\nCelular: ${celular}\nFecha: ${fecha_cita}\nHora: ${hora_cita}`;
  await sendSMS("+51951038509", adminMsg);

  // 2. Al Cliente
  const formattedClientPhone = formatPeruNumber(celular);
  const clientMsg = `Barbería Pro: Tu cita para el ${fecha_cita} a las ${hora_cita} ha sido confirmada. ¡Te esperamos!`;
  await sendSMS(formattedClientPhone, clientMsg);

  res.json({ message: "✅ Cita registrada con éxito y notificaciones SMS procesadas", data });
});

// 💳 MercadoPago - Crear preferencia de pago
app.post("/crear-preferencia", async (req, res) => {
  const { carrito } = req.body;

  if (!carrito || !Array.isArray(carrito)) {
    return res.status(400).json({ error: "Carrito inválido" });
  }

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
