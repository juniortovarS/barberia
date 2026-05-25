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

// ✅ Supabase (Cargado desde variables de entorno .env para mayor seguridad)
const SUPABASE_URL = process.env.SUPABASE_URL || "https://cywgxsocudepyejqnuuc.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ✅ Ruta para testear que el backend responde
app.get("/test", (_, res) => {
  res.json({ message: "✅ Backend Supabase funcionando correctamente" });
});

// Helper para subir captura base64 a Supabase Storage
const uploadBase64ToStorage = async (base64String, filename) => {
  try {
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      console.warn("⚠️ Formato base64 no válido para storage");
      return null;
    }
    const contentType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    
    const { data, error } = await supabase.storage
      .from('vouchers')
      .upload(filename, buffer, {
        contentType,
        upsert: true
      });
      
    if (error) {
      console.error("❌ Error al subir a Supabase Storage:", error.message);
      return null;
    }
    
    const { data: publicUrlData } = supabase.storage
      .from('vouchers')
      .getPublicUrl(filename);
      
    return publicUrlData.publicUrl;
  } catch (err) {
    console.error("❌ Excepción en uploadBase64ToStorage:", err.message);
    return null;
  }
};

// 📅 Ruta para registrar cita en Supabase y enviar notificaciones
app.post("/reservar-cita", async (req, res) => {
  const { nombre, celular, email, fecha_cita, hora_cita, codigo, estado, voucher_base64 } = req.body;

  console.log("📥 Datos recibidos:", { nombre, celular, email, fecha_cita, hora_cita, codigo, estado, tiene_voucher: !!voucher_base64 });

  if (!nombre || !celular || !email || !fecha_cita || !hora_cita) {
    return res.status(400).json({ error: "⚠️ Faltan datos obligatorios" });
  }

  let voucher_url = null;
  if (voucher_base64) {
    const filename = `voucher-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}.jpg`;
    voucher_url = await uploadBase64ToStorage(voucher_base64, filename);
  }

  const fecha_registro = new Date().toISOString(); // Generamos fecha actual

  const insertData = {
    nombre,
    celular,
    email,
    fecha_cita,
    hora_cita,
    fecha_registro,
    codigo: codigo || null,
    estado: estado || 'pending',
    voucher_url
  };

  const { data, error } = await supabase
    .from("reservas")
    .insert([insertData]);

  if (error) {
    console.error("❌ Error al guardar cita en Supabase:", error.message, error.details);
    return res.status(500).json({ error: "No se pudo guardar la cita", detalle: error.message });
  }

  // 💬 Notificaciones por SMS
  // 1. Al Administrador
  const adminMsg = `¡Nueva Reserva [${estado || 'pending'}]!\nCliente: ${nombre}\nCelular: ${celular}\nFecha: ${fecha_cita}\nHora: ${hora_cita}\nCódigo: ${codigo || 'N/A'}`;
  await sendSMS("+51975404704", adminMsg);

  // 2. Al Cliente
  const formattedClientPhone = formatPeruNumber(celular);
  const statusMsg = (estado === 'approved') ? 'ha sido CONFIRMADA y pagada' : 'está PENDIENTE de aprobación';
  const clientMsg = `Barbería Pro: Tu cita para el ${fecha_cita} a las ${hora_cita} ${statusMsg}. Código: ${codigo || 'N/A'}.`;
  await sendSMS(formattedClientPhone, clientMsg);

  res.json({ message: "✅ Cita registrada con éxito y notificaciones SMS procesadas", data, voucher_url });
});

// 📊 Ruta para obtener todas las reservas (para el panel admin)
app.get("/reservas", async (req, res) => {
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

// ✏️ Ruta para actualizar el estado de una reserva (aprobar/cancelar)
app.post("/reservas/:id/estado", async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  if (!estado) {
    return res.status(400).json({ error: "⚠️ Falta el estado" });
  }

  const { data, error } = await supabase
    .from("reservas")
    .update({ estado })
    .eq("id", id)
    .select();

  if (error) {
    console.error("❌ Error al actualizar estado de la reserva:", error.message);
    return res.status(500).json({ error: "No se pudo actualizar el estado de la reserva" });
  }

  res.json({ message: `✅ Estado de reserva cambiado a ${estado}`, data });
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
