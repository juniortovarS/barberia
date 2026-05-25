
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
          <p className="text-top animate-fade-in-up-1" style={{ marginBottom: '10px', color: '#a0a0a0', letterSpacing: '4px' }}>ESTILO EXCLUSIVO</p>
          <h1 className="tienda-text-main animate-fade-in-up-2">NUESTROS PRODUCTOS</h1>
          <p className="text-bottom animate-fade-in-up-3" style={{ marginTop: '10px', color: '#a0a0a0', fontSize: '1.1rem', letterSpacing: '2px' }}>PRENDAS URBANAS EDICIÓN LIMITADA</p>
        </div>
      </div>

      <div className="descripcion-tienda reveal fade-up">
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
        {productos.map((producto, idx) => (
          <div key={producto.id} className="producto-card reveal scale-in" style={{ transitionDelay: `${idx * 0.15}s` }}>
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
