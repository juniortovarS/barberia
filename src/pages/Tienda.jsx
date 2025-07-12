
import React from "react";
import produc1 from "../assets/produc1.png";
import produc2 from "../assets/produc2.png";
import tiendaHeader from "../assets/tienda.png"; // Tu imagen full ancho
import "../styles/Tienda.css";
import { useCarrito } from "../components/CarritoContext";

const Tienda = () => {
  const { agregarAlCarrito } = useCarrito();

  const productos = [
    {
      id: 1,
      nombre: "Polera Oversize Premium",
      precio: 89.90,
      imagen: produc1,
    },
    {
      id: 2,
      nombre: "Polo Street Style Unisex",
      precio: 69.90,
      imagen: produc2,
    },
  ];

  const handleAgregar = (producto) => {
    agregarAlCarrito(producto);
  };

  return (
    <div className="tienda-container">
      {/* Sección de header con imagen de fondo */}
      <div
        className="tienda-header-fullscreen"
        style={{ backgroundImage: `url(${tiendaHeader})` }}
      >
        <div className="tienda-overlay-text">
          <h1 className="tienda-text-main">NUESTROS PRODUCTOS</h1>
        </div>
      </div>

      <div className="descripcion-tienda">
        <p>
          Explora nuestra colección de ropa urbana premium. Cada prenda ha sido
          diseñada con estilo y comodidad en mente, para que luzcas increíble en
          cualquier ocasión.
        </p>
        <p>
          Todos los modelos son unisex, con materiales de alta calidad, pensados
          para durar y marcar tu estilo. Haz clic en cualquier prenda para
          agregarla al carrito.
        </p>
      </div>

      <div className="productos-grid">
        {productos.map((producto) => (
          <div key={producto.id} className="producto-card">
            <div className="imagen-hover" onClick={() => handleAgregar(producto)}>
              <img src={producto.imagen} alt={producto.nombre} />
              <div className="overlay-hover">🛒 Añadir al carrito</div>
            </div>
            <h3 className="producto-nombre">{producto.nombre}</h3>
            <p className="producto-precio">S/. {producto.precio.toFixed(2)}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Tienda;
