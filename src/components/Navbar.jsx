import React, { useEffect, useState, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "../styles/Navbar.css";
import logonav from "../assets/logonav.png";
import { FaShoppingCart, FaSearch, FaBars, FaTimes, FaUser } from "react-icons/fa";
import { useCarrito } from "./CarritoContext";
import { useAuth } from "./AuthContext";
import { supabase } from "../supabaseClient"; // ✅ IMPORTA CLIENTE DE SUPABASE

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

  // Estados de Reservas del Usuario
  const [misReservas, setMisReservas] = useState([]);
  const [loadingReservas, setLoadingReservas] = useState(false);

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
  const { user, isAdmin, login, signup, logout } = useAuth();
  
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

  const fetchMisReservas = useCallback(async () => {
    if (!user) return;
    setLoadingReservas(true);
    try {
      const { data, error } = await supabase
        .from("reservas")
        .select("*")
        .eq("email", user.email)
        .order("fecha_registro", { ascending: false });
      if (error) throw error;
      setMisReservas(data || []);
    } catch (err) {
      console.error("Error al cargar tus reservas:", err);
    } finally {
      setLoadingReservas(false);
    }
  }, [user]);

  const handleCancelarReserva = async (id) => {
    if (!window.confirm("¿Estás seguro de que deseas cancelar esta reserva?")) return;
    try {
      const { error } = await supabase
        .from("reservas")
        .update({ estado: 'cancelled' })
        .eq("id", id);
      if (error) throw error;
      
      setMisReservas(prev => prev.map(r => r.id === id ? { ...r, estado: 'cancelled' } : r));
    } catch (err) {
      console.error("Error al cancelar la reserva:", err);
      alert("No se pudo cancelar la reserva.");
    }
  };

  useEffect(() => {
    setMostrarCarrito(false);
    setMostrarAuth(false);
    setMenuOpen(false);
    setIsResettingPassword(false); // Resetear modo restablecer al cambiar de página
  }, [location.pathname, setMostrarCarrito]);

  useEffect(() => {
    if (mostrarAuth && user) {
      fetchMisReservas();
    }
  }, [mostrarAuth, user, fetchMisReservas]);

  // Cerrar el popup de autenticación al hacer click afuera o hacer scroll en la página principal
  useEffect(() => {
    const handleScrollClose = () => {
      if (mostrarAuth) {
        setMostrarAuth(false);
      }
    };

    const handleClickOutsideClose = (event) => {
      if (!mostrarAuth) return;
      
      const authPopup = document.querySelector('.auth-popup-navbar');
      const userIcon = document.querySelector('.user-icon-wrapper');
      
      if (
        authPopup && 
        !authPopup.contains(event.target) && 
        userIcon && 
        !userIcon.contains(event.target)
      ) {
        setMostrarAuth(false);
      }
    };

    if (mostrarAuth) {
      window.addEventListener("scroll", handleScrollClose, { passive: true });
      document.addEventListener("mousedown", handleClickOutsideClose);
    }

    return () => {
      window.removeEventListener("scroll", handleScrollClose);
      document.removeEventListener("mousedown", handleClickOutsideClose);
    };
  }, [mostrarAuth]);

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
          const isUserAdmin = authEmail === 'juniortovar601@gmail.com' || authEmail.startsWith('admin') || authEmail.endsWith('@barberia.com') || res.data.user?.user_metadata?.role === 'admin';
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

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);

    if (!resetEmail || !resetNewPassword) {
      setAuthError("Por favor completa todos los campos.");
      setAuthLoading(false);
      return;
    }

    try {
      // Llamar al procedimiento en Supabase que cambia la contraseña directamente por Email
      const { data, error } = await supabase.rpc('reset_user_password', {
        user_email: resetEmail,
        new_pass: resetNewPassword
      });

      if (error) throw error;

      if (data === "Contraseña restablecida con éxito") {
        setAuthSuccess("✓ Contraseña actualizada con éxito. Inicia sesión.");
        
        // Limpiar campos
        const capturedEmail = resetEmail;
        setResetEmail("");
        setResetNewPassword("");
        
        // Volver a login tras 2 segundos
        setTimeout(() => {
          setIsResettingPassword(false);
          setAuthEmail(capturedEmail);
          setAuthPassword("");
          setAuthSuccess("");
        }, 2000);
      } else {
        setAuthError(data || "No se pudo actualizar la contraseña.");
      }
    } catch (err) {
      console.error("Error al restablecer contraseña:", err);
      setAuthError("Error de validación. Asegúrate de ejecutar la consulta SQL en Supabase.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    const res = await logout();
    if (res.success) {
      setMostrarAuth(false);
      navigate("/");
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
          {/* Icono de Persona para Login / Perfil */}
          <div
            className="icon-wrapper user-icon-wrapper"
            onClick={() => {
              setMostrarAuth(!mostrarAuth);
              setMostrarCarrito(false);
            }}
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

      {/* Popup de Autenticación */}
      {mostrarAuth && (
        <div
          className="auth-popup-navbar"
          role="dialog"
          aria-modal="true"
          aria-label="Autenticación de usuario"
        >
          <button
            className="cerrar-auth-btn"
            onClick={() => {
              setMostrarAuth(false);
              setIsResettingPassword(false);
            }}
            aria-label="Cerrar ventana"
          >
            ×
          </button>

          {user ? (
            <div className="auth-logged-in-box">
              <div className="auth-logged-in-header">
                <div className="profile-avatar-large">
                  {user.user_metadata?.nombre ? user.user_metadata.nombre.substring(0, 2).toUpperCase() : user.email.substring(0, 2).toUpperCase()}
                  <span className="avatar-pulse-dot"></span>
                </div>
                <h4 className="profile-greeting">¡Hola, {user.user_metadata?.nombre || 'Cliente'}!</h4>
                <span className="profile-subtitle">Sesión Activa</span>
              </div>

              <div className="user-profile-card">
                <div className="profile-card-section">
                  <span className="profile-card-label">Correo Electrónico</span>
                  <span className="profile-card-value" style={{ textTransform: 'none' }}>{user.email}</span>
                </div>

                <div className="profile-card-section">
                  <span className="profile-card-label">Tipo de Usuario</span>
                  <div className="profile-card-badge-wrapper">
                    <span className={`profile-badge-modern ${isAdmin ? 'admin-badge' : 'customer-badge'}`}>
                      {isAdmin ? 'Administrador 👑' : 'Cliente 💈'}
                    </span>
                  </div>
                </div>
              </div>

              {/* ✅ LISTADO DE RESERVAS DEL CLIENTE */}
              <div className="user-profile-bookings">
                <h5 className="bookings-section-title">📅 Tus Reservas</h5>
                {loadingReservas ? (
                  <div className="bookings-loading-box">
                    <div className="auth-spinner"></div>
                    <span>Cargando citas...</span>
                  </div>
                ) : misReservas.length === 0 ? (
                  <p className="no-bookings-text">No tienes citas registradas.</p>
                ) : (
                  <div className="user-bookings-list">
                    {misReservas.map((res) => (
                      <div key={res.id} className="user-booking-card">
                        <div className="booking-card-top">
                          <span className="booking-card-date">📅 {res.fecha_cita}</span>
                          <span className={`booking-card-status ${res.estado || 'pending'}`}>
                            {res.estado === 'approved' && 'Confirmado'}
                            {res.estado === 'cancelled' && 'Cancelado'}
                            {(res.estado === 'pending' || !res.estado) && 'Pendiente'}
                          </span>
                        </div>
                        <div className="booking-card-mid">
                          <span className="booking-card-time">⏰ {res.hora_cita}</span>
                          <span className="booking-card-code">Cod: {res.codigo || 'S/C'}</span>
                        </div>
                        {res.estado !== 'cancelled' && (
                          <button
                            type="button"
                            className="btn-cancel-booking-inline"
                            onClick={() => handleCancelarReserva(res.id)}
                          >
                            Cancelar Reserva
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="auth-logged-in-actions">
                {isAdmin && (
                  <Link to="/admin" className="auth-action-btn-admin" onClick={() => setMostrarAuth(false)}>
                    Gestionar Panel de Control
                  </Link>
                )}

                <button className="auth-action-btn-logout" onClick={handleLogout}>
                  Cerrar Sesión
                </button>
              </div>
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

                <div className="auth-form-group">
                  <label htmlFor="reset-new-password">Nueva Contraseña</label>
                  <input
                    id="reset-new-password"
                    type="password"
                    placeholder="Escribe tu nueva contraseña"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
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
                  {authLoading ? <div className="auth-spinner"></div> : "Guardar Nueva Contraseña"}
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

              {!isRegistering && (
                <div className="admin-shortcut-wrapper">
                  <button
                    className="admin-shortcut-btn"
                    onClick={() => {
                      setAuthEmail("juniortovar601@gmail.com");
                      setAuthPassword("admin123456");
                      setAuthError("");
                      setAuthSuccess("Credenciales de administrador cargadas. ¡Inicia sesión!");
                    }}
                  >
                    Ingresar como administrador
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default Navbar;
