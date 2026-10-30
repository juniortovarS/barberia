import React, { useState, useRef, useEffect, useMemo } from 'react';
import '../styles/Cita.css';
import '../styles/CitaPro.css';
import '../styles/CitaServicios.css';
import { FaCalendarCheck, FaArrowRight, FaArrowLeft, FaCheck, FaUser, FaPhone, FaEnvelope, FaCalendarAlt, FaWhatsapp, FaLock, FaSun, FaCloudSun, FaMoon, FaGift, FaCrown, FaTimes, FaCut, FaHourglassHalf } from 'react-icons/fa';
import DatePicker, { registerLocale } from 'react-datepicker';
import { API_URL, WHATSAPP_NUMERO, SEDE, enlaceWhatsApp } from '../config';
import { generarTokenYape, cargarSeguridadMP, esperarDeviceId, nuevoIntentoId } from '../utils/yape';
import { cerrarAlTocarFuera } from '../utils/modal';
import es from 'date-fns/locale/es';
import 'react-datepicker/dist/react-datepicker.css';
import { enviarCorreoAdmin, enviarCorreoClienteConfirmada } from '../utils/correos';
import { useAuth } from '../components/AuthContext';
import { turnosDelDia, estaAbierto, fechaISO, DIAS_MAXIMOS_RESERVA } from '../utils/horario';
import { useFidelidad, cabeceraSesion, abrirRegistro, progresoNivel, NIVELES_FIDELIDAD } from '../utils/fidelidad';
import { SERVICIOS, duracionTexto, soles, calcularMontos } from '../utils/servicios';
import PagoYapeManual from '../components/PagoYapeManual';
import { useSeguimientoReserva } from '../utils/yapeManual';
import '../styles/PagoYapeManual.css';

// Turnos del día para el selector de hora
const TURNOS = [
  { id: 'manana', etiqueta: 'Mañana', icono: <FaSun />, desde: 0, hasta: 12 * 60 },
  { id: 'tarde', etiqueta: 'Tarde', icono: <FaCloudSun />, desde: 12 * 60, hasta: 18 * 60 },
  { id: 'noche', etiqueta: 'Noche', icono: <FaMoon />, desde: 18 * 60, hasta: 24 * 60 },
];

const slugNivel = (nombre = '') => nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Registrar localización en español para el calendario
registerLocale('es', es);

// Coloca aquí la URL generada en tu Google Apps Script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz8N9xXL_pBpU_M7Oc37FGyNp2UZnr_F31pwa-M-hM_4f3xamctY24N9fe-JMzmNjNbkg/exec";

const Cita = () => {
  const { user } = useAuth();
  const formRef = useRef();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [paso, setPaso] = useState(0); // 0: Servicio, 1: Datos, 2: Fecha, 3: Hora, 4: Pago
  const [servicios, setServicios] = useState(SERVICIOS);
  const [servicioId, setServicioId] = useState('');
  const [pagoConfirmado, setPagoConfirmado] = useState(null); // montos que confirmó el servidor
  const [fechaSeleccionada, setFechaSeleccionada] = useState(null);
  const [horaSeleccionada, setHoraSeleccionada] = useState('');
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [email, setEmail] = useState('');
  const [confirmacionVisible, setConfirmacionVisible] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [emailErrorStatus, setEmailErrorStatus] = useState(false);

  // Efecto para precargar datos de la sesión del usuario si está logueado
  useEffect(() => {
    if (user) {
      if (user.user_metadata?.nombre) {
        setNombre(user.user_metadata.nombre);
      }
      if (user.email) {
        setEmail(user.email);
      }
    }
  }, [user, mostrarFormulario]);
  const [celularPago, setCelularPago] = useState('');
  const [otpYape, setOtpYape] = useState('');
  const [montoReserva, setMontoReserva] = useState(20);
  const [codigoConfirmado, setCodigoConfirmado] = useState('');

  // Yape directo (el cliente yapea, sube la captura y el admin verifica) o código de aprobación (Mercado Pago)
  const [yapeCfg, setYapeCfg] = useState({ modo: 'manual', numero: WHATSAPP_NUMERO.slice(-9), titular: SEDE.nombre, qr: null });
  const esManual = yapeCfg.modo !== 'mercadopago';
  const [comprobante, setComprobante] = useState('');
  const [operacion, setOperacion] = useState('');
  const [seguimiento, setSeguimiento] = useState(null); // { codigo, token } de la reserva en verificación
  const verificacion = useSeguimientoReserva(seguimiento?.codigo, seguimiento?.token);
  const estadoVerificacion = seguimiento ? (verificacion.estado || 'pending') : null;

  // Disponibilidad de horarios del día elegido
  const [bloques, setBloques] = useState([]);
  const [cargandoHoras, setCargandoHoras] = useState(false);
  const [turnoActivo, setTurnoActivo] = useState('manana');

  // Club de fidelidad
  const { fidelidad, setFidelidad } = useFidelidad();
  const [nivelesClub, setNivelesClub] = useState(NIVELES_FIDELIDAD);
  const [mostrarClubPopup, setMostrarClubPopup] = useState(false);
  const [descuentoAplicado, setDescuentoAplicado] = useState(0);

  // Seguridad de Mercado Pago: se carga con anticipación para que el ID del dispositivo esté listo al pagar
  useEffect(() => { cargarSeguridadMP(); }, []);

  // El monto lo define el backend (variable RESERVA_MONTO); aquí solo se muestra
  useEffect(() => {
    fetch(`${API_URL}/config-pago`)
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cfg?.monto) setMontoReserva(cfg.monto);
        if (Array.isArray(cfg?.niveles)) setNivelesClub(cfg.niveles);
        if (Array.isArray(cfg?.servicios) && cfg.servicios.length) setServicios(cfg.servicios);
        if (cfg?.yape?.numero) setYapeCfg(cfg.yape);
      })
      .catch(() => {});
  }, []);

  const servicioSel = servicios.find((sv) => sv.id === servicioId) || null;
  const montos = servicioSel
    ? calcularMontos(servicioSel.precio, user ? fidelidad?.descuento : 0, montoReserva)
    : null;

  // Horas ocupadas del día elegido (se consultan al backend, sin datos personales)
  useEffect(() => {
    if (!fechaSeleccionada) return undefined;
    let cancelado = false;
    setCargandoHoras(true);
    fetch(`${API_URL}/disponibilidad?fecha=${fechaISO(fechaSeleccionada)}`)
      .then((r) => (r.ok ? r.json() : { bloques: [] }))
      .then((d) => { if (!cancelado) setBloques(d.bloques || []); })
      .catch(() => { if (!cancelado) setBloques([]); })
      .finally(() => { if (!cancelado) setCargandoHoras(false); });
    return () => { cancelado = true; };
  }, [fechaSeleccionada, paso]);

  const turnos = useMemo(
    () => (fechaSeleccionada ? turnosDelDia(fechaSeleccionada, bloques, servicioSel?.duracion) : []),
    [fechaSeleccionada, bloques, servicioSel]
  );

  const turnosPorBloque = useMemo(() => TURNOS.map((t) => {
    const lista = turnos.filter((x) => x.minutos >= t.desde && x.minutos < t.hasta);
    return { ...t, lista, libres: lista.filter((x) => !x.pasado && !x.ocupado).length };
  }), [turnos]);

  // Al cambiar de día se abre automáticamente el primer turno con horas libres
  useEffect(() => {
    const primero = turnosPorBloque.find((t) => t.libres > 0);
    if (primero) setTurnoActivo(primero.id);
  }, [fechaSeleccionada, turnosPorBloque]);

  // Si la hora elegida acaba de ocuparse, se deselecciona
  useEffect(() => {
    if (!horaSeleccionada) return;
    const elegido = turnos.find((t) => t.etiqueta === horaSeleccionada);
    if (elegido && (elegido.ocupado || elegido.pasado)) {
      setHoraSeleccionada('');
      setError('⚠️ La hora que elegiste ya no está disponible. Elige otra.');
    }
  }, [turnos, horaSeleccionada]);

  const toggleFormulario = () => {
    const abrir = !mostrarFormulario;
    setMostrarFormulario(abrir);
    setPaso(0);
    setError(null);
    setCelularPago('');
    setOtpYape('');
    // Invitar a registrarse al Club (una vez por visita)
    if (abrir && !user) {
      let visto = false;
      try { visto = sessionStorage.getItem('club-popup-visto') === '1'; } catch { /* sin almacenamiento */ }
      if (!visto) setMostrarClubPopup(true);
    }
  };

  const cerrarClubPopup = () => {
    try { sessionStorage.setItem('club-popup-visto', '1'); } catch { /* sin almacenamiento */ }
    setMostrarClubPopup(false);
  };

  const irARegistro = (registro = true) => {
    cerrarClubPopup();
    setMostrarFormulario(false);
    setConfirmacionVisible(false);
    abrirRegistro(registro);
  };

  const nextPaso = (e) => {
    e.preventDefault();
    if (paso === 0) {
      if (!servicioSel) {
        setError("⚠️ Elige el servicio que quieres reservar.");
        return;
      }
      setError(null);
      setPaso(1);
    } else if (paso === 1) {
      if (!nombre || !celular || !email) {
        setError("⚠️ Por favor completa todos los campos de contacto.");
        return;
      }
      // Validación celular básico (mínimo 9 dígitos)
      if (celular.replace(/\D/g, '').length < 9) {
        setError("⚠️ Por favor ingresa un número de celular válido (mínimo 9 dígitos).");
        return;
      }
      // Validación email básico
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError("⚠️ Por favor ingresa un correo electrónico válido.");
        return;
      }
      setError(null);
      setPaso(2);
    } else if (paso === 2) {
      if (!fechaSeleccionada) {
        setError("⚠️ Por favor selecciona una fecha para tu cita.");
        return;
      }
      if (!estaAbierto(fechaSeleccionada)) {
        setError("⚠️ Ese día no atendemos. Elige otra fecha.");
        return;
      }
      setError(null);
      setPaso(3);
    }
  };

  const prevPaso = (e) => {
    e.preventDefault();
    setError(null);
    setPaso(prev => Math.max(0, prev - 1));
  };

  // Yape directo: envía la captura + Nº de operación. La cita queda "pendiente" hasta que el admin verifica.
  const enviarYapeManual = async (fecha, hora) => {
    try {
      const response = await fetch(`${API_URL}/reservas/yape-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await cabeceraSesion()) },
        body: JSON.stringify({
          nombre,
          celular,
          email,
          fecha_cita: fecha,
          hora_cita: hora,
          servicio_id: servicioSel.id,
          operacion,
          comprobante,
        }),
      });
      const resData = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(`❌ ${resData.error || 'No se pudo registrar tu reserva.'}`);
        return null;
      }
      return resData;
    } catch (err) {
      console.error(`❌ No se pudo conectar con el backend (${API_URL}):`, err);
      setError('❌ Se cortó la conexión. Revisa tu internet e inténtalo de nuevo; tu Yape no se pierde, usa la misma captura.');
      return null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!nombre || !celular || !email || !fechaSeleccionada || !horaSeleccionada) {
      setError("⚠️ Datos incompletos. Por favor revisa todos los pasos.");
      return;
    }

    if (esManual) {
      if (!comprobante) {
        setError('⚠️ Sube la captura de tu Yape.');
        return;
      }
      if (operacion.length < 4) {
        setError('⚠️ Escribe el Nº de operación que aparece en tu constancia de Yape.');
        return;
      }
      setLoading(true);
      const resData = await enviarYapeManual(fechaISO(fechaSeleccionada), horaSeleccionada);
      if (!resData) {
        setLoading(false);
        return;
      }
      setSeguimiento({ codigo: resData.codigo, token: resData.seguimiento });
      await finalizarReserva(resData, { metodoPago: 'yape directo', referenciaPago: `Op. ${operacion}`, estadoReserva: 'pending' });
      return;
    }

    if (celularPago.length !== 9) {
      setError("⚠️ Ingresa el celular de tu cuenta Yape (9 dígitos).");
      return;
    }

    if (otpYape.length !== 6) {
      setError("⚠️ Ingresa el código de aprobación de 6 dígitos que aparece en tu app de Yape.");
      return;
    }

    setLoading(true);
    // Formatear fecha local YYYY-MM-DD sin desfase horario
    const year = fechaSeleccionada.getFullYear();
    const month = String(fechaSeleccionada.getMonth() + 1).padStart(2, '0');
    const day = String(fechaSeleccionada.getDate()).padStart(2, '0');
    const fecha = `${year}-${month}-${day}`;
    const hora = horaSeleccionada;

    // 1. Cobrar el adelanto con Yape: el token se genera aquí y el backend cobra con Mercado Pago.
    //    La reserva solo se guarda (como aprobada) si Mercado Pago aprueba el pago.
    let yapeTokenId;
    try {
      yapeTokenId = await generarTokenYape(celularPago, otpYape);
    } catch (err) {
      setError(`❌ ${err.message}`);
      setOtpYape('');
      setLoading(false);
      return;
    }

    let resData;
    try {
      const response = await fetch(`${API_URL}/reservas/pagar-yape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await cabeceraSesion()) },
        body: JSON.stringify({
          nombre,
          celular,
          email,
          fecha_cita: fecha,
          hora_cita: hora,
          celular_yape: celularPago,
          yape_token: yapeTokenId,
          servicio_id: servicioSel.id,
          device_id: await esperarDeviceId(),
          // Un intento por código de Yape: si la misma petición se repite, el servidor no cobra dos veces
          intento_id: nuevoIntentoId()
        }),
      });
      resData = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(`❌ ${resData.error || 'No se pudo completar el pago con Yape.'}`);
        setOtpYape('');
        setLoading(false);
        return;
      }
    } catch (err) {
      // Sin respuesta del servidor: el cobro pudo haberse hecho igual, no se debe pagar de nuevo a ciegas
      console.error(`❌ No se pudo conectar con el backend (${API_URL}):`, err);
      setError('❌ Se cortó la conexión con el servidor de reservas. Si Yape te muestra el cobro, NO vuelvas a pagar: revisa tu perfil en unos minutos o escríbenos por WhatsApp.');
      setOtpYape('');
      setLoading(false);
      return;
    }

    await finalizarReserva(resData, { metodoPago: 'yape', referenciaPago: celularPago, estadoReserva: 'approved' });
  };

  // Correos, Google Sheets y pantalla de confirmación (común a los dos métodos de pago)
  const finalizarReserva = async (resData, { metodoPago, referenciaPago, estadoReserva }) => {
    const fecha = fechaISO(fechaSeleccionada);
    const hora = horaSeleccionada;
    const codigoReserva = resData.codigo;
    const pendiente = estadoReserva === 'pending';
    setCodigoConfirmado(codigoReserva);
    setDescuentoAplicado(resData.descuento_aplicado || 0);
    setPagoConfirmado({ total: resData.total, adelanto: resData.adelanto, saldo: resData.saldo });
    if (resData.fidelidad) setFidelidad({ ...resData.fidelidad, niveles: nivelesClub });
    const notaClub = resData.descuento_aplicado ? ` - CLUB ${resData.descuento_aplicado}% DSCTO` : '';

    const cita = {
      nombre,
      celular,
      email,
      servicio: servicioSel.nombre,
      duracion: servicioSel.duracion,
      fecha,
      hora,
      codigo: codigoReserva,
      total: resData.total,
      adelanto: resData.adelanto,
      saldo: resData.saldo,
      metodo: pendiente ? 'Yape directo' : 'Yape',
      operacion: pendiente ? operacion : null,
    };

    // 1. Al admin siempre (con el enlace al panel de ESTA web: localhost en pruebas, el dominio real en producción)
    try {
      await enviarCorreoAdmin(cita, { pendiente, panelUrl: `${window.location.origin}/admin` });
    } catch (err) {
      console.error('❌ Error enviando correo al admin:', err);
    }

    // 2. Al cliente solo si la cita ya está confirmada. Con Yape directo se le envía cuando el admin aprueba el pago.
    let emailFailed = false;
    if (!pendiente) {
      try {
        await enviarCorreoClienteConfirmada(cita, { webUrl: window.location.origin });
      } catch (err) {
        console.error('❌ Error enviando correo al cliente:', err);
        emailFailed = true;
      }
    }
    setEmailErrorStatus(emailFailed);

    // 3. Guardar en Google Sheets (Google Apps Script)
    if (GOOGLE_SCRIPT_URL && !GOOGLE_SCRIPT_URL.includes("Reemplaza")) {
      try {
        await fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: `${nombre} (${metodoPago.toUpperCase()} Ref: ${codigoReserva} - Cel: ${referenciaPago}${notaClub} - Estado: ${estadoReserva.toUpperCase()})`,
            celular,
            email,
            fecha,
            hora,
            metodo_pago: metodoPago.toUpperCase(),
            celular_pago: referenciaPago,
            codigo_reserva: codigoReserva,
            estado: estadoReserva.toUpperCase()
          }),
        });
      } catch (sheetErr) {
        console.error("❌ Error en Google Sheets:", sheetErr);
      }
    }

    setLoading(false);
    setConfirmacionVisible(true);
  };

  const cerrarConfirmacion = () => {
    setNombre(user?.user_metadata?.nombre || '');
    setCelular('');
    setEmail(user?.email || '');
    setFechaSeleccionada(null);
    setHoraSeleccionada('');
    setCelularPago('');
    setOtpYape('');
    setComprobante('');
    setOperacion('');
    setSeguimiento(null);
    setCodigoConfirmado('');
    setDescuentoAplicado(0);
    setServicioId('');
    setPagoConfirmado(null);
    setMostrarFormulario(false);
    setPaso(0);
    setConfirmacionVisible(false);
  };

  const pagoListo = esManual
    ? Boolean(comprobante) && operacion.length >= 4
    : celularPago.length === 9 && otpYape.length === 6;
  const bloqueActivo = turnosPorBloque.find((t) => t.id === turnoActivo) || turnosPorBloque[0];
  const totalLibres = turnosPorBloque.reduce((acc, t) => acc + t.libres, 0);
  const progresoClub = fidelidad ? progresoNivel(fidelidad) : 0;

  return (
    <div className="cita-fullscreen">
      <div className="cita-overlay-text">
        <div className="cita-text-top animate-fade-in-up-1">RESERVA ONLINE · PAGO CON YAPE</div>
        <h1 className="cita-text-main animate-fade-in-up-2">TU PRÓXIMO CORTE, A UN CLIC</h1>
        <p className="cita-text-sub animate-fade-in-up-2">Elige tu hora en segundos y acumula reservas para ganar hasta {nivelesClub[nivelesClub.length - 1].descuento}% de descuento con el Club De Fidelidad JP.</p>
        <div className="cita-button animate-fade-in-up-3" onClick={toggleFormulario}>
          <div className="cita-btn-text">RESERVAR CITA</div>
          <div className="cita-btn-icon"><FaCalendarCheck /></div>
        </div>
      </div>

      {mostrarFormulario && !confirmacionVisible && (
        <div className="cita-formulario-overlay" {...cerrarAlTocarFuera(toggleFormulario)}>
          <div className="cita-formulario-contenido wizard-box">
            
            {/* Barra de Progreso Visual */}
            <div className="wizard-progress">
              {['Servicio', 'Datos', 'Fecha', 'Hora', 'Pago'].map((etq, i) => (
                <React.Fragment key={etq}>
                  {i > 0 && <div className={`wizard-line ${paso >= i ? 'active' : ''}`}></div>}
                  <div className={`wizard-step ${paso >= i ? 'active' : ''} ${paso === i ? 'current' : ''}`}>
                    <div className="step-num">{paso > i ? <FaCheck size={10} /> : i + 1}</div>
                    <span className="step-label">{etq}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>

            <h2 className="wizard-title">
              {paso === 0 && "Elige tu Servicio"}
              {paso === 1 && "Datos del Cliente"}
              {paso === 2 && "Selecciona Fecha"}
              {paso === 3 && "Selecciona Hora"}
              {paso === 4 && "Confirmar Pago"}
            </h2>

            <form ref={formRef} onSubmit={handleSubmit} className="wizard-form">
              
              {/* PASO 0: Servicio */}
              {paso === 0 && (
                <div className="wizard-slide fade-in-slide">
                  <p className="wizard-desc">¿Qué te hacemos hoy? Reservas con <strong>{soles(montoReserva)}</strong> y el resto lo pagas el día de tu cita.</p>

                  <div className="servicios-lista" role="listbox" aria-label="Servicios">
                    {servicios.map((sv) => {
                      const activo = servicioId === sv.id;
                      return (
                        <button
                          key={sv.id}
                          type="button"
                          role="option"
                          aria-selected={activo}
                          className={`servicio-opcion ${activo ? 'active' : ''}`}
                          onClick={() => { setError(null); setServicioId(sv.id); setHoraSeleccionada(''); }}
                        >
                          <span className="servicio-check">{activo ? <FaCheck /> : <FaCut />}</span>
                          <span className="servicio-info">
                            <span className="servicio-nombre">{sv.nombre}</span>
                            <span className="servicio-duracion"><FaHourglassHalf /> {duracionTexto(sv.duracion)}</span>
                          </span>
                          <span className="servicio-precio">{soles(sv.precio)}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="wizard-buttons">
                    <button className="cerrar-btn-wizard" type="button" onClick={toggleFormulario}>Cancelar</button>
                    <button className={`siguiente-btn ${!servicioSel ? 'disabled' : ''}`} type="button" onClick={nextPaso} disabled={!servicioSel}>
                      Datos <FaArrowRight size={10} style={{ marginLeft: '8px' }} />
                    </button>
                  </div>
                </div>
              )}

              {/* PASO 1: Datos personales */}
              {paso === 1 && (
                <div className="wizard-slide fade-in-slide">
                  <p className="wizard-desc">Introduce tus datos para ponernos en contacto contigo.</p>
                  
                  <div className="input-group-modern">
                    <span className="input-icon-modern"><FaUser /></span>
                    <input 
                      type="text" 
                      placeholder="Tu nombre completo" 
                      value={nombre} 
                      onChange={(e) => setNombre(e.target.value)} 
                      required 
                    />
                    <span className="input-focus-border"></span>
                  </div>

                  <div className="input-group-modern">
                    <span className="input-icon-modern"><FaPhone /></span>
                    <input 
                      type="tel" 
                      placeholder="Número de celular" 
                      value={celular} 
                      onChange={(e) => setCelular(e.target.value)} 
                      required 
                    />
                    <span className="input-focus-border"></span>
                  </div>

                  <div className="input-group-modern">
                    <span className="input-icon-modern"><FaEnvelope /></span>
                    <input 
                      type="email" 
                      placeholder="Correo electrónico" 
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      required 
                      disabled={!!user}
                      title={user ? "Tu correo está vinculado a tu cuenta y no se puede modificar" : ""}
                    />
                    <span className="input-focus-border"></span>
                  </div>
                  {user && (
                    <p className="email-linked-helper" style={{ fontSize: '0.78rem', color: '#aaaaaa', marginTop: '-12px', marginBottom: '16px', textAlign: 'left', fontStyle: 'italic' }}>
                      💡 Correo asociado a tu cuenta activa. Tu reserva se guardará aquí.
                    </p>
                  )}

                  {user && fidelidad && (
                    <div className={`club-mini nivel-${slugNivel(fidelidad.nivel)}`}>
                      <div className="club-mini-top">
                        <span className="club-badge"><FaCrown /> Club {fidelidad.nivel}</span>
                        <span className="club-mini-count">{fidelidad.reservas} {fidelidad.reservas === 1 ? 'reserva' : 'reservas'}</span>
                      </div>
                      <p className="club-mini-text">
                        {fidelidad.descuento > 0
                          ? <>Tienes <strong>{fidelidad.descuento}% de descuento</strong> en este corte.</>
                          : <>Te faltan <strong>{fidelidad.siguiente?.faltan}</strong> para nivel {fidelidad.siguiente?.nombre} ({fidelidad.siguiente?.descuento}% dscto.).</>}
                      </p>
                      {fidelidad.siguiente && (
                        <div className="club-progress"><span style={{ width: `${progresoClub}%` }} /></div>
                      )}
                    </div>
                  )}

                  {!user && (
                    <button type="button" className="club-inline-cta" onClick={() => irARegistro(false)}>
                      <FaGift /> <span>¿Tienes cuenta? <strong>Inicia sesión</strong> y suma esta reserva al Club JP</span>
                    </button>
                  )}
                  
                  <div className="wizard-buttons">
                    <button className="atras-btn" type="button" onClick={prevPaso}>
                      <FaArrowLeft size={10} style={{ marginRight: '8px' }} /> Servicio
                    </button>
                    <button className="siguiente-btn" type="button" onClick={nextPaso}>
                      Fecha <FaArrowRight size={10} style={{ marginLeft: '8px' }} />
                    </button>
                  </div>
                </div>
              )}

              {/* PASO 2: Calendario */}
              {paso === 2 && (
                <div className="wizard-slide fade-in-slide">
                  <p className="wizard-desc">¿Qué día prefieres visitarnos? Los días en gris no atendemos.</p>
                  
                  <div className="calendar-container">
                    <div className="calendar-wrapper-modern">
                      <DatePicker
                        selected={fechaSeleccionada}
                        onChange={(date) => {
                          setFechaSeleccionada(date);
                          setHoraSeleccionada('');
                        }}
                        minDate={new Date()}
                        maxDate={new Date(Date.now() + DIAS_MAXIMOS_RESERVA * 86400000)}
                        filterDate={estaAbierto}
                        inline
                        locale="es"
                        className="datepicker-custom"
                      />
                    </div>
                  </div>

                  {fechaSeleccionada && (
                    <div className="seleccion-alert date-pill fade-in">
                      <FaCalendarAlt style={{ marginRight: '8px', color: '#ffffff' }} /> 
                      Día elegido: <strong>{fechaSeleccionada.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>
                    </div>
                  )}

                  <div className="wizard-buttons">
                    <button className="atras-btn" type="button" onClick={prevPaso}>
                      <FaArrowLeft size={10} style={{ marginRight: '8px' }} /> Datos
                    </button>
                    <button 
                      className={`siguiente-btn ${!fechaSeleccionada ? 'disabled' : ''}`} 
                      type="button" 
                      onClick={nextPaso}
                      disabled={!fechaSeleccionada}
                    >
                      Hora <FaArrowRight size={10} style={{ marginLeft: '8px' }} />
                    </button>
                  </div>
                </div>
              )}

              {/* PASO 3: Selector de Horas */}
              {paso === 3 && (
                <div className="wizard-slide fade-in-slide">
                  <div className="hora-fecha-resumen">
                    <div className="hora-fecha-icono"><FaCalendarAlt /></div>
                    <div className="hora-fecha-texto">
                      <span className="hora-fecha-dia">{fechaSeleccionada?.toLocaleDateString('es-PE', { weekday: 'long' })}</span>
                      <strong>{fechaSeleccionada?.toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}</strong>
                    </div>
                    <button type="button" className="hora-cambiar-fecha" onClick={() => { setError(null); setPaso(2); }}>Cambiar</button>
                  </div>

                  <div className="turno-tabs" role="tablist" aria-label="Turno">
                    {turnosPorBloque.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={bloqueActivo?.id === t.id}
                        className={`turno-tab ${bloqueActivo?.id === t.id ? 'active' : ''}`}
                        onClick={() => setTurnoActivo(t.id)}
                        disabled={t.lista.length === 0}
                      >
                        <span className="turno-tab-icono">{t.icono}</span>
                        <span className="turno-tab-nombre">{t.etiqueta}</span>
                        <span className="turno-tab-libres">{cargandoHoras ? '·' : t.libres}</span>
                      </button>
                    ))}
                  </div>

                  {cargandoHoras ? (
                    <div className="horas-grid-pro" aria-busy="true">
                      {Array.from({ length: 8 }).map((_, i) => <span key={i} className="hora-chip-skeleton" />)}
                    </div>
                  ) : totalLibres === 0 ? (
                    <div className="horas-vacio">
                      <strong>No quedan horarios para este día</strong>
                      <span>Prueba con otra fecha.</span>
                    </div>
                  ) : (
                    <div className="horas-grid-pro" role="listbox" aria-label="Horarios disponibles">
                      {bloqueActivo?.lista.map((t) => {
                        const noDisponible = t.pasado || t.ocupado;
                        const activo = horaSeleccionada === t.etiqueta;
                        return (
                          <button
                            key={t.valor}
                            type="button"
                            role="option"
                            aria-selected={activo}
                            className={`hora-chip ${activo ? 'active' : ''} ${t.ocupado ? 'ocupado' : ''}`}
                            disabled={noDisponible}
                            onClick={() => { setError(null); setHoraSeleccionada(t.etiqueta); }}
                          >
                            <span className="hora-chip-time">{t.etiqueta.slice(0, 5)}</span>
                            <span className="hora-chip-ampm">{t.ocupado ? 'Ocupado' : t.etiqueta.slice(6)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="horas-leyenda">
                    <span><i className="leyenda-dot libre" /> Disponible</span>
                    <span><i className="leyenda-dot elegido" /> Elegido</span>
                    <span><i className="leyenda-dot ocupado" /> Ocupado</span>
                  </div>

                  <div className="wizard-buttons">
                    <button className="atras-btn" type="button" onClick={prevPaso}>
                      <FaArrowLeft size={10} style={{ marginRight: '8px' }} /> Fecha
                    </button>
                    <button 
                      className={`confirmar-btn-wizard ${!horaSeleccionada || loading ? 'disabled' : ''}`} 
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        if (horaSeleccionada) {
                          setError(null);
                          setPaso(4);
                        } else {
                          setError("⚠️ Por favor selecciona una hora para tu cita.");
                        }
                      }}
                      disabled={!horaSeleccionada || loading}
                    >
                      Pago <FaArrowRight size={10} style={{ marginLeft: '8px' }} />
                    </button>
                  </div>
                </div>
              )}

              {/* PASO 4: Pago con Yape (código de aprobación vía Mercado Pago) */}
              {paso === 4 && (
                <div className="wizard-slide fade-in-slide">
                  <div className="seleccion-alert date-pill">
                    <FaCalendarAlt style={{ marginRight: '8px', color: '#ffffff' }} />
                    Cita: <strong>{fechaSeleccionada ? fechaSeleccionada.toLocaleDateString() : ''} - {horaSeleccionada}</strong>
                  </div>

                  {servicioSel && montos && (
                    <div className="desglose-pago">
                      <div className="desglose-fila">
                        <span>{servicioSel.nombre} <em>· {duracionTexto(servicioSel.duracion)}</em></span>
                        <span>{soles(servicioSel.precio)}</span>
                      </div>
                      {montos.total < servicioSel.precio && (
                        <div className="desglose-fila descuento">
                          <span>Descuento Club {fidelidad?.nivel} (-{fidelidad?.descuento}%)</span>
                          <span>- {soles(servicioSel.precio - montos.total)}</span>
                        </div>
                      )}
                      <div className="desglose-fila total">
                        <span>Total del servicio</span>
                        <span>{soles(montos.total)}</span>
                      </div>
                      <div className="desglose-split">
                        <div className="desglose-hoy">
                          <span>Pagas hoy</span>
                          <strong>{soles(montos.adelanto)}</strong>
                        </div>
                        <div className="desglose-despues">
                          <span>{montos.saldo > 0 ? 'Restante en tu cita' : 'Restante'}</span>
                          <strong>{soles(montos.saldo)}</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {user && fidelidad?.descuento > 0 && (
                    <div className={`club-mini compacto nivel-${slugNivel(fidelidad.nivel)}`}>
                      <span className="club-badge"><FaCrown /> Club {fidelidad.nivel}</span>
                      <p className="club-mini-text"><strong>{fidelidad.descuento}% de descuento</strong> ya aplicado al total.</p>
                    </div>
                  )}

                  {esManual ? (
                    <PagoYapeManual
                      monto={montos?.adelanto}
                      yape={yapeCfg}
                      comprobante={comprobante}
                      onComprobante={(img) => { setError(null); setComprobante(img); }}
                      operacion={operacion}
                      onOperacion={setOperacion}
                      deshabilitado={loading}
                    />
                  ) : (
                  <div className="yape-pago-card">
                    <div className="yape-pago-header">
                      <span className="yape-logo">yape</span>
                      <span className="yape-pago-monto">{soles(montos?.adelanto)}</span>
                    </div>

                    <ol className="yape-pasos">
                      <li>Abre tu app de <strong>Yape</strong>.</li>
                      <li>En el menú, entra a <strong>Código de aprobación</strong>.</li>
                      <li>Escribe aquí tu celular y el código de 6 dígitos.</li>
                    </ol>

                    <div className="input-group-modern">
                      <span className="input-icon-modern"><FaPhone /></span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder="Celular de tu Yape (9 dígitos)"
                        value={celularPago}
                        onChange={(e) => setCelularPago(e.target.value.replace(/\D/g, '').slice(0, 9))}
                        required
                      />
                      <span className="input-focus-border"></span>
                    </div>

                    <div className="input-group-modern">
                      <span className="input-icon-modern"><FaLock /></span>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="Código de aprobación"
                        className="yape-otp-input"
                        value={otpYape}
                        onChange={(e) => setOtpYape(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        required
                      />
                      <span className="input-focus-border"></span>
                    </div>

                    <p className="yape-pago-nota">
                      El código dura 2 minutos. El cobro se hace al instante y tu cita queda confirmada automáticamente.
                    </p>
                  </div>
                  )}

                  <div className="wizard-buttons">
                    <button className="atras-btn" type="button" onClick={() => { setError(null); setPaso(3); }}>
                      <FaArrowLeft size={10} style={{ marginRight: '8px' }} /> Hora
                    </button>
                    <button
                      className={`confirmar-btn-wizard ${!pagoListo || loading ? 'disabled' : ''}`}
                      type="submit"
                      disabled={!pagoListo || loading}
                    >
                      {loading ? (
                        <div className="loading-spinner-btn">
                          <span className="spinner-dot"></span>
                          <span className="spinner-dot"></span>
                          <span className="spinner-dot"></span>
                        </div>
                      ) : esManual ? (
                        'Enviar comprobante y reservar'
                      ) : (
                        `Pagar ${soles(montos?.adelanto)} con Yape`
                      )}
                    </button>
                  </div>
                </div>
              )}
            </form>
            {error && <p className="cita-error-modern">{error}</p>}
          </div>
        </div>
      )}

      {mostrarClubPopup && (
        <div className="club-popup-overlay" role="dialog" aria-modal="true" aria-labelledby="club-popup-titulo" {...cerrarAlTocarFuera(cerrarClubPopup)}>
          <div className="club-popup fade-in-scale">
            <button type="button" className="club-popup-cerrar" onClick={cerrarClubPopup} aria-label="Cerrar"><FaTimes /></button>
            <div className="club-popup-icono"><FaCrown /></div>
            <span className="club-popup-kicker">Club De Fidelidad JP</span>
            <h3 id="club-popup-titulo">Cada corte suma. Tu próximo puede salir con descuento.</h3>
            <p>Crea tu cuenta gratis y acumula reservas para subir de nivel:</p>
            <ul className="club-popup-niveles">
              {nivelesClub.filter((n) => n.descuento > 0).map((n) => (
                <li key={n.nombre} className={`nivel-${slugNivel(n.nombre)}`}>
                  <span className="club-popup-nivel">{n.nombre}</span>
                  <span className="club-popup-req">{n.minimo} reservas</span>
                  <strong>-{n.descuento}%</strong>
                </li>
              ))}
            </ul>
            <button type="button" className="club-popup-primario" onClick={() => irARegistro(true)}>Crear cuenta gratis</button>
            <button type="button" className="club-popup-secundario" onClick={cerrarClubPopup}>Reservar como invitado</button>
          </div>
        </div>
      )}

      {confirmacionVisible && (
        <div className="cita-formulario-overlay" {...cerrarAlTocarFuera(cerrarConfirmacion)}>
          <div className="cita-formulario-contenido confirmacion-box fade-in-scale">
            {!estadoVerificacion && (
              <div className="confirmacion-success-animation">
                <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                  <circle className="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
                  <path className="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                </svg>
              </div>
            )}
            
            <h2 className="confirmacion-title">
              {estadoVerificacion === 'pending' ? '¡Reserva recibida!'
                : estadoVerificacion === 'cancelled' ? 'No pudimos validar tu Yape'
                : '¡Reserva Exitosa!'}
            </h2>
            {estadoVerificacion ? (
              <div className={`verif-estado ${estadoVerificacion}`} role="status" aria-live="polite">
                <span className="verif-icono">
                  {estadoVerificacion === 'approved' ? <FaCheck /> : estadoVerificacion === 'cancelled' ? <FaTimes /> : null}
                </span>
                {estadoVerificacion === 'pending' && (
                  <>
                    <strong>Estamos verificando tu Yape</strong>
                    <p>Tu horario ya está separado. Esta pantalla se actualiza sola en cuanto confirmemos el pago y te enviaremos un correo con tu cita confirmada.</p>
                    <span className={`verif-vivo ${verificacion.conectado ? 'on' : ''}`}>
                      <i /> {verificacion.conectado ? 'En vivo' : 'Reconectando…'}
                    </span>
                  </>
                )}
                {estadoVerificacion === 'approved' && (
                  <>
                    <strong>¡Pago verificado! Tu cita está confirmada</strong>
                    <p>Te esperamos. Puedes ver tu reserva en tu perfil.</p>
                  </>
                )}
                {estadoVerificacion === 'cancelled' && (
                  <>
                    <strong>{verificacion.motivo || 'Tu reserva fue cancelada.'}</strong>
                    <p>Si ya yapeaste, escríbenos por WhatsApp con tu código y lo resolvemos al toque.</p>
                  </>
                )}
              </div>
            ) : (
              <p className="confirmacion-subtitle">
                {emailErrorStatus
                  ? "Hemos agendado tu cita correctamente en tu perfil. (Nota: Hubo un inconveniente al enviar la confirmación a tu correo, pero puedes ver tu reserva en tu perfil)."
                  : "Hemos agendado tu cita de manera correcta. Te llegará un correo de confirmación."
                }
              </p>
            )}
            
            <div className="confirmacion-resumen-box">
              <div className="resumen-item"><span>📍 Sede:</span> <a href={SEDE.mapa} target="_blank" rel="noopener noreferrer">{SEDE.nombre} · {SEDE.direccion}</a></div>
              {servicioSel && <div className="resumen-item"><span>💈 Servicio:</span> <span>{servicioSel.nombre}</span></div>}
              <div className="resumen-item"><span>👤 Cliente:</span> <span>{nombre}</span></div>
              <div className="resumen-item"><span>📱 Celular:</span> <span>{celular}</span></div>
              <div className="resumen-item"><span>📅 Fecha:</span> <span>{fechaSeleccionada ? fechaSeleccionada.toLocaleDateString() : ''}</span></div>
              <div className="resumen-item"><span>⏰ Hora:</span> <span>{horaSeleccionada}</span></div>
              {pagoConfirmado && (
                <div className="resumen-item">
                  <span>💜 {estadoVerificacion && estadoVerificacion !== 'approved' ? 'Adelanto yapeado:' : 'Adelanto pagado:'}</span>
                  <span>{soles(pagoConfirmado.adelanto)}</span>
                </div>
              )}
              {pagoConfirmado?.saldo > 0 && <div className="resumen-item resumen-restante"><span>⏳ Restante (en tu cita):</span> <span>{soles(pagoConfirmado.saldo)}</span></div>}
              {codigoConfirmado && <div className="resumen-item"><span>🎟️ Código:</span> <span>{codigoConfirmado}</span></div>}
            </div>

            {/* Con Yape directo la reserva suma al Club recién cuando se verifica el pago */}
            {fidelidad && user && !estadoVerificacion ? (
              <div className={`club-mini confirmacion nivel-${slugNivel(fidelidad.nivel)}`}>
                <div className="club-mini-top">
                  <span className="club-badge"><FaCrown /> Club {fidelidad.nivel}</span>
                  <span className="club-mini-count">+1 · {fidelidad.reservas} {fidelidad.reservas === 1 ? 'reserva' : 'reservas'}</span>
                </div>
                <p className="club-mini-text">
                  {descuentoAplicado > 0 && <>Esta cita tiene <strong>{descuentoAplicado}% de descuento</strong>. </>}
                  {fidelidad.siguiente
                    ? <>Te faltan <strong>{fidelidad.siguiente.faltan}</strong> para nivel {fidelidad.siguiente.nombre} ({fidelidad.siguiente.descuento}%).</>
                    : <>Estás en el nivel más alto del Club. ¡Gracias por tu fidelidad!</>}
                </p>
                {fidelidad.siguiente && <div className="club-progress"><span style={{ width: `${progresoNivel(fidelidad)}%` }} /></div>}
              </div>
            ) : !user && (
              <div className="club-confirmacion-cta">
                <FaGift className="club-cta-icon" />
                <div>
                  <strong>¿Quieres que esta reserva cuente para tus descuentos?</strong>
                  <p>Crea tu cuenta con <b>{email}</b> y tus reservas se sumarán al Club De Fidelidad JP automáticamente.</p>
                </div>
                <button type="button" className="club-cta-btn" onClick={() => { cerrarConfirmacion(); irARegistro(true); }}>Crear cuenta</button>
              </div>
            )}

            <div className="confirmacion-acciones">
              <a 
                href={enlaceWhatsApp(WHATSAPP_NUMERO, `¡Hola! Acabo de reservar una cita:\n👤 Cliente: ${nombre}\n💈 Servicio: ${servicioSel?.nombre || ''}\n📅 Fecha: ${fechaSeleccionada ? fechaSeleccionada.toLocaleDateString() : ''}\n⏰ Hora: ${horaSeleccionada}\n📱 Celular: ${celular}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="whatsapp-confirm-btn"
              >
                <FaWhatsapp style={{ marginRight: '8px', fontSize: '1.2rem' }} /> Enviar aviso por WhatsApp
              </a>
              
              <button className="confirmacion-cerrar-btn" onClick={cerrarConfirmacion}>Volver al Inicio</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cita;
