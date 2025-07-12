// src/pages/Confirmacion.jsx
import React from "react";
import "../styles/Confirmacion.css";

const Confirmacion = () => {
  return (
    <div className="confirmacion-container">
      <h1>✅ ¡Gracias por tu compra, Junior!</h1>
      <p>Tu pedido ha sido recibido correctamente.</p>

      <div className="resumen-compra">
        <h2>Resumen de la compra</h2>
        <ul>
          <li><strong>Producto:</strong> NOVA BLUE CLASSICS HOODIE</li>
          <li><strong>Cantidad:</strong> 1</li>
          <li><strong>Subtotal:</strong> S/.199.90</li>
          <li><strong>Envío:</strong> S/.12.00</li>
          <li className="total"><strong>Total:</strong> S/.211.90</li>
        </ul>
      </div>

      <a className="btn-volver" href="/tienda">Volver a la tienda</a>
    </div>
  );
};

export default Confirmacion;
