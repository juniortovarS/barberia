import React from "react";
import axios from "axios";
import "../styles/Carrito.css";
import { useCarrito } from "../components/CarritoContext";
import { API_URL } from "../config";

const Carrito = () => {
  const { carrito, aumentarCantidad, disminuirCantidad } = useCarrito();

  const subtotal = carrito.reduce(
    (acc, item) => acc + item.precio * item.cantidad,
    0
  );

  const envio = carrito.length > 0 ? 12.0 : 0;
  const total = subtotal + envio;

 const pagarConMercadoPago = async () => {
  console.log("🛍️ Enviando carrito:", carrito);
  try {
    const response = await axios.post(`${API_URL}/crear-preferencia`, {
      carrito,
    });

    const preferenceId = response.data.id;

    window.location.href = `https://sandbox.mercadopago.com.pe/checkout/v1/redirect?pref_id=${preferenceId}`;
  } catch (error) {
    console.error("❌ Error al procesar el pago:", error.response?.data || error.message);
    alert("Ocurrió un error al intentar procesar el pago.");
  }
};



  return (
    <div className="carrito-page">
      <h1 className="carrito-titulo">🛒 Tu Carrito</h1>

      {carrito.length === 0 ? (
        <p className="carrito-vacio">Tu carrito está vacío.</p>
      ) : (
        <div className="carrito-contenedor">
          {/* 🛒 Productos */}
          <div className="carrito-listado">
            {carrito.map((item) => (
              <div key={item.id} className="carrito-item">
                <img src={item.imagen} alt={item.nombre} />
                <div className="carrito-detalle">
                  <h3>{item.nombre}</h3>
                  <p>Precio: S/ {item.precio.toFixed(2)}</p>
                  <div className="carrito-controles">
                    <button onClick={() => disminuirCantidad(item.id)}>-</button>
                    <span>{item.cantidad}</span>
                    <button onClick={() => aumentarCantidad(item.id)}>+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ✅ Resumen del Pedido a la derecha */}
          <div className="carrito-resumen">
            <h2>Resumen del pedido</h2>
            <div className="linea">
              <span>Subtotal:</span>
              <span>S/. {subtotal.toFixed(2)}</span>
            </div>
            <div className="linea">
              <span>Envío:</span>
              <span>S/. {envio.toFixed(2)}</span>
            </div>
            <div className="envio-detalle">
              <span>Perú</span>
              <span>Lima - S/.12.00</span>
            </div>
            <div className="linea total">
              <strong>Total:</strong>
              <strong>S/. {total.toFixed(2)}</strong>
            </div>
            <button className="btn-pagar" onClick={pagarConMercadoPago}>
              Finalizar compra
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Carrito;
