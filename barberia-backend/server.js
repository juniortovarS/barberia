const express = require("express");
const cors = require("cors");
const mercadopago = require("mercadopago");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());
app.use(cors());

// ✅ MercadoPago
mercadopago.configure({
  access_token: "APP_USR-3258188625824242-071103-aba7caf4da3a3236d31dd66e564a9bef-2553371836",
});

// ✅ Supabase
const SUPABASE_URL = "https://hkjjuzhchtvsqqdwmgqf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhramp1emhjaHR2c3FxZHdtZ3FmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjMwMzExNiwiZXhwIjoyMDY3ODc5MTE2fQ.tP5jSXgvHzaf8xMaWVJWnQGc9I0zRR3Ul1VhNgz73lI"; // (mantén tu service_role_key aquí)
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ✅ Ruta para testear que el backend responde
app.get("/test", (_, res) => {
  res.json({ message: "✅ Backend Supabase funcionando correctamente" });
});

// 📅 Ruta para registrar cita en Supabase
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

  res.json({ message: "✅ Cita registrada con éxito", data });
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
