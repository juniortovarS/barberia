import React, { useState } from "react";
import "../styles/Checkout.css";
import { useCarrito } from "../components/CarritoContext";
import { Link } from "react-router-dom";

const Checkout = () => {
  const { carrito } = useCarrito();

  const subtotal = carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0);
  const envio = carrito.length > 0 ? 12.0 : 0;
  const igv = 0;
  const total = subtotal + envio + igv;

  const [codigoPromo, setCodigoPromo] = useState("");

  return (
    <div className="checkout-container">
      <div className="formulario">
        <h2>Detalles del cliente</h2>
        <form>
          <input type="email" placeholder="Email*" required />
          <input type="text" placeholder="Nombre*" required />
          <input type="text" placeholder="Apellido*" required />
          <input type="tel" placeholder="Teléfono*" required />
          <input type="text" placeholder="DNI*" required />

          <h3>Detalles de envío</h3>
          <select required>
            <option value="Perú">Perú</option>
          </select>
          <input type="text" placeholder="Dirección*" required />
          <input type="text" placeholder="Ciudad*" required />
          <input type="text" placeholder="Región*" required />
          <input type="text" placeholder="Código postal*" required />

          <button type="submit" className="btn-continuar">Continuar</button>
        </form>
      </div>

      <div className="resumen">
        <h2>Resumen del pedido ({carrito.length})</h2>
        <Link to="/carrito" className="editar-carrito">Editar carrito</Link>

        {carrito.map((item) => (
          <div key={item.id} className="producto-checkout">
            <img src={item.imagen} alt={item.nombre} />
            <div>
              <p className="nombre">{item.nombre}</p>
              <p>Precio: S/.{item.precio.toFixed(2)}</p>
              <p>Cant.: {item.cantidad}</p>
            </div>
          </div>
        ))}

        <div className="promo">
          <input
            type="text"
            placeholder="Ingresar código de promoción"
            value={codigoPromo}
            onChange={(e) => setCodigoPromo(e.target.value)}
          />
          <button>Aplicar</button>
        </div>

        <div className="totales">
          <div className="linea">
            <span>Subtotal</span>
            <span>S/.{subtotal.toFixed(2)}</span>
          </div>
          <div className="linea">
            <span>Entrega/envío</span>
            <span>S/.{envio.toFixed(2)}</span>
          </div>
          <div className="linea">
            <span>IGV</span>
            <span>S/.{igv.toFixed(2)}</span>
          </div>
          <div className="linea total">
            <strong>Total</strong>
            <strong>S/.{total.toFixed(2)}</strong>
          </div>
        </div>

        <button className="btn-pagar-final">Finalizar compra</button>
      </div>
    </div>
  );
};

export default Checkout;
