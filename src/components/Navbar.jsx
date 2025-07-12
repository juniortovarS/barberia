import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import "../styles/Navbar.css";
import logonav from "../assets/logonav.png";
import { FaShoppingCart, FaSearch } from "react-icons/fa";
import { useCarrito } from "./CarritoContext";

const Navbar = () => {
  const [scrolled, setScrolled] = React.useState(false);
  const [transparent, setTransparent] = React.useState(true);
  const {
    carrito,
    mostrarCarrito,
    setMostrarCarrito,
    aumentarCantidad,
    disminuirCantidad,
  } = useCarrito();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setScrolled(scrollY > 100);
      setTransparent(scrollY < window.innerHeight);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMostrarCarrito(false);
  }, [location.pathname]);

  const toggleCarrito = () => {
    setMostrarCarrito(!mostrarCarrito);
  };

  const subtotal = carrito.reduce(
    (acc, item) => acc + item.precio * item.cantidad,
    0
  );

  return (
    <>
      <nav
        className={`navbar ${scrolled ? "scrolled" : ""} ${
          transparent ? "navbar-transparent" : ""
        }`}
      >
        <div className="navbar-left">
          <Link to="/">
            <img src={logonav} alt="Logo" className="navbar-logo" />
          </Link>
        </div>

        <div className="navbar-center">
          <ul className="navbar-links">
            <li>
              <Link to="/" className="navbar-link">INICIO</Link>
            </li>
            <li>
              <Link to="/cita" className="navbar-link">RESERVAR CITA</Link>
            </li>
            <li>
              <Link to="/servicios" className="navbar-link">SERVICIOS</Link>
            </li>
            <li>
              <Link to="/blog" className="navbar-link">BLOG</Link>
            </li>
            <li>
              <Link to="/contacto" className="navbar-link">CONTACTO</Link>
            </li>
            <li>
              <Link to="/tienda" className="navbar-link">TIENDA</Link>
            </li>
          </ul>
        </div>

        <div className="navbar-right">
          <div
            className="icon-wrapper"
            onClick={toggleCarrito}
            style={{ cursor: "pointer" }}
          >
            <FaShoppingCart className="icon" />
          </div>
          <div className="icon-wrapper">
            <FaSearch className="icon" />
          </div>
        </div>
      </nav>

      {mostrarCarrito && (
        <div
          className="carrito-popup-navbar"
          role="dialog"
          aria-modal="true"
          aria-label="Carrito de compras"
        >
          <button
            className="cerrar-carrito-btn"
            onClick={() => setMostrarCarrito(false)}
            aria-label="Cerrar carrito"
          >
            ×
          </button>

          <h4>🛍️ Tu carrito</h4>

          {carrito.length === 0 ? (
            <p>El carrito está vacío</p>
          ) : (
            <ul>
              {carrito.map((item, index) => (
                <li key={index} className="carrito-item">
  <img src={item.imagen} alt={item.nombre} />
  <div className="carrito-item-info">
    <div className="item-nombre">{item.nombre}</div>
    <div className="precio-control-linea">
      <span className="precio-texto">
        {item.cantidad} × S/ {item.precio.toFixed(2)}
      </span>
      <div className="cantidad-control-inline">
        <button onClick={() => disminuirCantidad(item.id)} aria-label="Disminuir">−</button>
        <button onClick={() => aumentarCantidad(item.id)} aria-label="Aumentar">+</button>
      </div>
    </div>
  </div>
</li>


              ))}
            </ul>
          )}

          <hr />
          <div className="subtotal">Subtotal: S/ {subtotal.toFixed(2)}</div>

          <a href="/carrito" className="ver-carrito-btn">
            Ver carrito
          </a>
        </div>
      )}
    </>
  );
};

export default Navbar;


