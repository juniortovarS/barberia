const express = require("express");
const cors = require("cors");
const mercadopago = require("mercadopago");
const mysql = require("mysql2");

const app = express();
app.use(express.json());
app.use(cors());

// 🔐 Configuración de MercadoPago
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN || "",
});

// 💾 Conexión a la base de datos MySQL
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "root",
  database: "barberia",
});

// ▶ Intentar conexión
db.connect((err) => {
  if (err) {
    console.error("❌ Error de conexión a MySQL:", err.message);
  } else {
    console.log("✅ Conectado correctamente a la base de datos MySQL");
  }
});

// 📅 Ruta para registrar cita en MySQL
app.post("/reservar-cita", (req, res) => {
  const { nombre, celular, email, fecha, hora } = req.body;

  console.log("📥 Datos recibidos para cita:", req.body); // <-- AGREGA ESTA LÍNEA

  if (!nombre || !celular || !email || !fecha || !hora) {
    console.warn("⚠️ Faltan datos:", { nombre, celular, email, fecha, hora }); // otra línea útil
    return res.status(400).json({ error: "⚠️ Faltan datos obligatorios" });
  }

  const sql = `
    INSERT INTO reservas (nombre, celular, email, fecha_cita, hora_cita, fecha_registro)
    VALUES (?, ?, ?, ?, ?, NOW())
  `;

  db.query(sql, [nombre, celular, email, fecha, hora], (err, result) => {
    if (err) {
      console.error("❌ Error al guardar la cita en MySQL:", err.message);
      return res.status(500).json({ error: "No se pudo guardar la cita" });
    }

    console.log("✅ Cita registrada con ID:", result.insertId);
    res.json({ message: "Cita registrada con éxito" });
  });
});


// 💳 Ruta para crear preferencia de pago con MercadoPago
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

    console.log("✅ Preferencia de pago creada:", preference.body.id);
    res.json({ id: preference.body.id });
  } catch (error) {
    console.error("❌ Error al crear preferencia de pago:", error.message);
    res.status(500).json({ error: "No se pudo crear preferencia de pago" });
  }
});

// 🚀 Iniciar servidor
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend en ejecución: http://localhost:${PORT}`);
});
