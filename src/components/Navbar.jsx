import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "../styles/Navbar.css";
import logonav from "../assets/logonav.png";
import { FaShoppingCart, FaSearch, FaBars, FaTimes } from "react-icons/fa";
import { useCarrito } from "./CarritoContext";

const Navbar = () => {
  const [scrolled, setScrolled] = React.useState(false);
  const [transparent, setTransparent] = React.useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
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
    setMenuOpen(false);
  }, [location.pathname, setMostrarCarrito]);

  // Bloquear scroll del body cuando el menú está abierto
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const toggleCarrito = () => {
    setMostrarCarrito(!mostrarCarrito);
  };

  const subtotal = carrito.reduce(
    (acc, item) => acc + item.precio * item.cantidad,
    0
  );

  const links = [
    { to: "/", label: "INICIO" },
    { to: "/cita", label: "RESERVAR CITA" },
    { to: "/servicios", label: "SERVICIOS" },
    { to: "/blog", label: "BLOG" },
    { to: "/contacto", label: "CONTACTO" },
    { to: "/tienda", label: "TIENDA" },
  ];

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

        {/* Links de escritorio */}
        <div className="navbar-center">
          <ul className="navbar-links">
            {links.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="navbar-link">{link.label}</Link>
              </li>
            ))}
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

          {/* Botón hamburguesa — solo visible en móvil */}
          <button
            className="hamburger-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          >
            {menuOpen ? <FaTimes /> : <FaBars />}
          </button>
        </div>
      </nav>

      {/* Menú móvil de pantalla completa */}
      <div className={`mobile-menu ${menuOpen ? "open" : ""}`}>
        <ul className="mobile-menu-links">
          {links.map((link, i) => (
            <li
              key={link.to}
              className="mobile-menu-item"
              style={{ animationDelay: `${i * 0.07}s` }}
            >
              <Link
                to={link.to}
                className="mobile-menu-link"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Overlay carrito */}
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
