import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "../styles/Navbar.css";
import "../styles/NavbarClub.css";
import { FaShoppingCart, FaSearch, FaBars, FaTimes, FaUser } from "react-icons/fa";
import { useCarrito } from "./CarritoContext";
import { useAuth } from "./AuthContext";
import { supabase } from "../supabaseClient"; // ✅ IMPORTA CLIENTE DE SUPABASE
import { ADMIN_EMAILS } from "../config";
import TemaToggle from "./TemaToggle";

const Navbar = () => {
  const [scrolled, setScrolled] = React.useState(false);
  const [transparent, setTransparent] = React.useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // Estados de Autenticación
  const [mostrarAuth, setMostrarAuth] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false); // ✅ Modo restablecer contraseña
  
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authNombre, setAuthNombre] = useState("");

  // Estados para la recuperación de contraseña (Simplificado)
  const [resetEmail, setResetEmail] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");

  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const {
    carrito,
    mostrarCarrito,
    setMostrarCarrito,
    aumentarCantidad,
    disminuirCantidad,
  } = useCarrito();
  const { user, isAdmin, login, signup, logout, recuperandoClave, setRecuperandoClave } = useAuth();
  
  const location = useLocation();
  const navigate = useNavigate();

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
    setMostrarAuth(false);
    setMenuOpen(false);
    setIsResettingPassword(false); // Resetear modo restablecer al cambiar de página
  }, [location.pathname, setMostrarCarrito]);

  // Abrir el modal de registro / login desde otras partes de la web (Club de fidelidad, reservas)
  useEffect(() => {
    const abrir = (e) => {
      setIsRegistering(!!e.detail?.registro);
      setIsResettingPassword(false);
      setAuthError("");
      setAuthSuccess("");
      setMenuOpen(false);
      setMostrarAuth(true);
    };
    window.addEventListener("abrir-auth", abrir);
    return () => window.removeEventListener("abrir-auth", abrir);
  }, []);

  // Al volver desde el enlace de "recuperar contraseña" del correo se muestra el formulario de nueva clave
  useEffect(() => {
    if (recuperandoClave) {
      setAuthError("");
      setAuthSuccess("");
      setMostrarAuth(true);
    }
  }, [recuperandoClave]);

  const cerrarAuth = () => {
    if (recuperandoClave) return; // hay que terminar de crear la nueva contraseña
    setMostrarAuth(false);
    setIsResettingPassword(false);
  };

  // Modal centrado: Escape lo cierra y la página de fondo no se desplaza
  useEffect(() => {
    if (!mostrarAuth) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !recuperandoClave) setMostrarAuth(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [mostrarAuth, recuperandoClave]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);

    if (isRegistering) {
      if (!authNombre) {
        setAuthError("El nombre es requerido");
        setAuthLoading(false);
        return;
      }
      const res = await signup(authEmail, authPassword, authNombre);
      if (res.success) {
        // Cierre de sesión inmediato para evitar inicio automático
        await logout();
        setAuthSuccess("✓ ¡Cuenta creada con éxito! Redirigiendo a Iniciar Sesión...");
        setAuthPassword("");
        
        // Redirigir a Iniciar Sesión tras 1.5s
        setTimeout(() => {
          setIsRegistering(false);
          setAuthSuccess("");
        }, 1500);
      } else {
        // Validación de correo ya registrado
        if (res.error && (res.error.includes("already registered") || res.error.includes("User already exists"))) {
          setAuthError("Este correo electrónico ya está registrado.");
        } else {
          setAuthError(res.error || "Ocurrió un error al registrarse");
        }
      }
    } else {
      const res = await login(authEmail, authPassword);
      if (res.success) {
        setAuthSuccess("Sesión iniciada con éxito");
        setTimeout(() => {
          setMostrarAuth(false);
          const isUserAdmin = ADMIN_EMAILS.includes(authEmail.trim().toLowerCase()) || res.data.user?.app_metadata?.role === 'admin';
          if (isUserAdmin) {
            navigate("/admin");
          }
        }, 1000);
      } else {
        setAuthError(res.error || "Correo o contraseña incorrectos");
      }
    }
    setAuthLoading(false);
  };

  // 1) Pedir el enlace de recuperación: Supabase envía un correo al dueño de la cuenta
  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setAuthSuccess("Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña. Revisa tu bandeja (y spam).");
    } catch (err) {
      console.error("Error al solicitar recuperación:", err);
      setAuthError("No pudimos enviar el correo. Inténtalo de nuevo en unos minutos.");
    } finally {
      setAuthLoading(false);
    }
  };

  // 2) Guardar la nueva contraseña (solo funciona con la sesión temporal que crea el enlace del correo)
  const handleNuevaClaveSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    if (resetNewPassword.length < 6) {
      setAuthError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: resetNewPassword });
      if (error) throw error;
      setResetNewPassword("");
      setAuthSuccess("Contraseña actualizada. Ya tienes tu sesión iniciada.");
      setTimeout(() => {
        setRecuperandoClave(false);
        setAuthSuccess("");
      }, 1800);
    } catch (err) {
      console.error("Error al actualizar contraseña:", err);
      const codigo = err?.code || "";
      const mensaje = (err?.message || "").toLowerCase();
      if (codigo === "same_password" || mensaje.includes("different from the old")) {
        setAuthError("La nueva contraseña debe ser distinta a la anterior.");
      } else if (codigo === "weak_password" || mensaje.includes("password should")) {
        setAuthError(`La contraseña es muy débil. ${err.message}`);
      } else if (codigo === "session_not_found" || err?.name === "AuthSessionMissingError" || mensaje.includes("session")) {
        setAuthError("El enlace expiró o ya se usó. Solicita uno nuevo desde \"¿La olvidaste?\".");
      } else {
        setAuthError(`No se pudo guardar la contraseña: ${err?.message || "error desconocido"}`);
      }
    } finally {
      setAuthLoading(false);
    }
  };

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
    ...(isAdmin ? [{ to: "/admin", label: "PANEL DE CONTROL", isAdmin: true }] : []),
  ];

  return (
    <>
      <nav
        className={`navbar ${scrolled ? "scrolled" : ""} ${
          transparent ? "navbar-transparent" : ""
        }`}
      >
        {/* Se mantiene vacío para que los enlaces sigan centrados */}
        <div className="navbar-left" aria-hidden="true" />

        {/* Links de escritorio modificar el navbar */}
        <div className="navbar-center">
          <ul className="navbar-links">
            {links.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className={`navbar-link${link.isAdmin ? ' navbar-link-admin' : ''}`}
                >
                  {link.isAdmin ? ' ' : ''}{link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="navbar-right">
          <TemaToggle />

          {/* Icono de Persona para Login / Perfil */}
          <div
            className="icon-wrapper user-icon-wrapper"
            onClick={() => {
              setMostrarCarrito(false);
              if (user) {
                navigate("/perfil");
              } else {
                setIsRegistering(false);
                setMostrarAuth(true);
              }
            }}
            role="button"
            aria-label={user ? "Ver mi perfil" : "Iniciar sesión"}
            style={{ cursor: "pointer" }}
          >
            {user ? (
              <div className="user-avatar-badge" title={user.user_metadata?.nombre || user.email}>
                {user.user_metadata?.nombre ? user.user_metadata.nombre.substring(0, 2).toUpperCase() : user.email.substring(0, 2).toUpperCase()}
              </div>
            ) : (
              <FaUser className="icon" />
            )}
          </div>

          <div
            className="icon-wrapper"
            onClick={toggleCarrito}
            style={{ cursor: "pointer" }}
          >
            <FaShoppingCart className="icon" />
          </div>
          <div className="icon-wrapper icon-busqueda">
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
                className={`mobile-menu-link${link.isAdmin ? ' mobile-menu-link-admin' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                {link.isAdmin ? ' ' : ''}{link.label}
              </Link>
            </li>
          ))}
          <li className="mobile-menu-item" style={{ animationDelay: `${links.length * 0.07}s` }}>
            {user ? (
              <Link to="/perfil" className="mobile-menu-link mobile-menu-link-cuenta" onClick={() => setMenuOpen(false)}>
                MI PERFIL
              </Link>
            ) : (
              <button
                type="button"
                className="mobile-menu-link mobile-menu-link-cuenta"
                onClick={() => { setMenuOpen(false); setIsRegistering(false); setMostrarAuth(true); }}
              >
                INICIAR SESIÓN
              </button>
            )}
          </li>
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

      {/* Modal de Autenticación (centrado) */}
      {mostrarAuth && (!user || recuperandoClave) && (
        <div
          className="auth-modal-overlay"
          onMouseDown={(e) => { if (e.target === e.currentTarget) cerrarAuth(); }}
        >
        <div
          className="auth-popup-navbar"
          role="dialog"
          aria-modal="true"
          aria-label="Autenticación de usuario"
        >
          {!recuperandoClave && (
            <button
              className="cerrar-auth-btn"
              onClick={cerrarAuth}
              aria-label="Cerrar ventana"
            >
              ×
            </button>
          )}

          <div className="auth-modal-brand">
            <span className="auth-modal-kicker">Club De Fidelidad JP</span>
            <p className="auth-modal-lead">
              {isRegistering ? 'Crea tu cuenta y empieza a acumular descuentos.' : 'Bienvenido de vuelta.'}
            </p>
          </div>

          {recuperandoClave ? (
            <div className="auth-form-box">
              <h4 style={{ margin: "0 0 16px 0", letterSpacing: "1px", textTransform: "uppercase", fontSize: "1.1rem" }}>
                🔒 Crea tu nueva contraseña
              </h4>
              <form onSubmit={handleNuevaClaveSubmit} className="auth-form">
                <div className="auth-form-group">
                  <label htmlFor="nueva-clave">Nueva Contraseña</label>
                  <input
                    id="nueva-clave"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Mínimo 6 caracteres"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    required
                  />
                </div>
                {authError && <div className="auth-error-text">⚠️ {authError}</div>}
                {authSuccess && <div className="auth-success-text">✓ {authSuccess}</div>}
                <button type="submit" className="auth-submit-btn" disabled={authLoading}>
                  {authLoading ? <div className="auth-spinner"></div> : "Guardar Nueva Contraseña"}
                </button>
              </form>
            </div>
          ) : isResettingPassword ? (
            // ✅ VISTA RESTABLECER CONTRASEÑA (SÓLO EMAIL Y NUEVA CONTRASEÑA)
            <div className="auth-form-box">
              <h4 style={{ margin: "0 0 16px 0", letterSpacing: "1px", textTransform: "uppercase", fontSize: "1.1rem" }}>
                🔒 Recuperar Acceso
              </h4>
              
              <form onSubmit={handleResetSubmit} className="auth-form">
                <div className="auth-form-group">
                  <label htmlFor="reset-email">Correo Registrado</label>
                  <input
                    id="reset-email"
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />
                </div>

                <p style={{ fontSize: "0.8rem", lineHeight: 1.5, margin: "0 0 14px" }}>
                  Te enviaremos un enlace seguro a tu correo para que crees una nueva contraseña.
                </p>

                {authError && <div className="auth-error-text">⚠️ {authError}</div>}
                {authSuccess && <div className="auth-success-text">✓ {authSuccess}</div>}

                <button
                  type="submit"
                  className="auth-submit-btn"
                  disabled={authLoading}
                >
                  {authLoading ? <div className="auth-spinner"></div> : "Enviar enlace"}
                </button>

                <button
                  type="button"
                  className="auth-cancel-reset-btn"
                  onClick={() => {
                    setIsResettingPassword(false);
                    setAuthError("");
                    setAuthSuccess("");
                  }}
                >
                  Volver a Iniciar Sesión
                </button>
              </form>
            </div>
          ) : (
            // VISTA NORMAL LOGIN / REGISTRO
            <div className="auth-form-box">
              <div className="auth-tabs">
                <button
                  className={`auth-tab-btn ${!isRegistering ? "active" : ""}`}
                  onClick={() => {
                    setIsRegistering(false);
                    setAuthError("");
                    setAuthSuccess("");
                  }}
                >
                  Entrar
                </button>
                <button
                  className={`auth-tab-btn ${isRegistering ? "active" : ""}`}
                  onClick={() => {
                    setIsRegistering(true);
                    setAuthError("");
                    setAuthSuccess("");
                  }}
                >
                  Registrarse
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="auth-form">
                {isRegistering && (
                  <div className="auth-form-group">
                    <label htmlFor="auth-nombre">Nombre</label>
                    <input
                      id="auth-nombre"
                      type="text"
                      placeholder="Tu nombre completo"
                      value={authNombre}
                      onChange={(e) => setAuthNombre(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="auth-form-group">
                  <label htmlFor="auth-email">Correo Electrónico</label>
                  <input
                    id="auth-email"
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="auth-form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label htmlFor="auth-password">Contraseña</label>
                    {!isRegistering && (
                      <span
                        className="forgot-password-link"
                        onClick={() => {
                          setIsResettingPassword(true);
                          setAuthError("");
                          setAuthSuccess("");
                        }}
                      >
                        ¿La olvidaste?
                      </span>
                    )}
                  </div>
                  <input
                    id="auth-password"
                    type="password"
                    placeholder="••••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    required
                  />
                </div>

                {authError && <div className="auth-error-text">⚠️ {authError}</div>}
                {authSuccess && <div className="auth-success-text">✓ {authSuccess}</div>}

                <button
                  type="submit"
                  className="auth-submit-btn"
                  disabled={authLoading}
                >
                  {authLoading ? (
                    <div className="auth-spinner"></div>
                  ) : isRegistering ? (
                    "Crear Cuenta"
                  ) : (
                    "Entrar"
                  )}
                </button>
              </form>
              
            </div>
          )}
        </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
