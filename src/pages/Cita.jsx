import React, { useState, useRef } from 'react';
import '../styles/Cita.css';
import { FaCalendarCheck, FaArrowRight, FaArrowLeft, FaCheck, FaUser, FaPhone, FaEnvelope, FaCalendarAlt, FaClock, FaWhatsapp } from 'react-icons/fa';
import DatePicker, { registerLocale } from 'react-datepicker';
import es from 'date-fns/locale/es';
import 'react-datepicker/dist/react-datepicker.css';
import emailjs from '@emailjs/browser';

// Registrar localización en español para el calendario
registerLocale('es', es);

// Coloca aquí la URL generada en tu Google Apps Script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz8N9xXL_pBpU_M7Oc37FGyNp2UZnr_F31pwa-M-hM_4f3xamctY24N9fe-JMzmNjNbkg/exec"; 

const Cita = () => {
  const formRef = useRef();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [paso, setPaso] = useState(1); // 1: Datos de Contacto, 2: Fecha, 3: Hora
  const [fechaSeleccionada, setFechaSeleccionada] = useState(null);
  const [horaSeleccionada, setHoraSeleccionada] = useState('');
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [email, setEmail] = useState('');
  const [confirmacionVisible, setConfirmacionVisible] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggleFormulario = () => {
    setMostrarFormulario(!mostrarFormulario);
    setPaso(1);
    setError(null);
  };

  const nextPaso = (e) => {
    e.preventDefault();
    if (paso === 1) {
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
      setError(null);
      setPaso(3);
    }
  };

  const prevPaso = (e) => {
    e.preventDefault();
    setError(null);
    setPaso(prev => Math.max(1, prev - 1));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!nombre || !celular || !email || !fechaSeleccionada || !horaSeleccionada) {
      setError("⚠️ Datos incompletos. Por favor revisa todos los pasos.");
      return;
    }

    setLoading(true);
    // Formatear fecha local YYYY-MM-DD sin desfase horario
    const year = fechaSeleccionada.getFullYear();
    const month = String(fechaSeleccionada.getMonth() + 1).padStart(2, '0');
    const day = String(fechaSeleccionada.getDate()).padStart(2, '0');
    const fecha = `${year}-${month}-${day}`;
    const hora = horaSeleccionada;

    const adminData = { nombre, celular, email, fecha, hora };
    const userData = {
      user_name: nombre,
      user_email: email,
      user_phone: celular,
      fecha,
      hora,
    };

    try {
      // 1. Email al administrador (EmailJS) - envuelto en try-catch individual para evitar bloqueos
      try {
        await emailjs.send(
          'service_0ry9t41',
          'template_96itk4u',
          adminData,
          'QU8t-8ZyBlO4O4jDY'
        );
        console.log("✉️ Correo enviado al administrador");
      } catch (emailAdminErr) {
        console.error("❌ Error enviando email al admin:", emailAdminErr);
      }

      // 2. Email al usuario (EmailJS) - envuelto en try-catch individual
      try {
        await emailjs.send(
          'service_0ry9t41',
          'template_ruofj9e',
          userData,
          'QU8t-8ZyBlO4O4jDY'
        );
        console.log("✉️ Correo enviado al usuario");
      } catch (emailUserErr) {
        console.error("❌ Error enviando email al usuario:", emailUserErr);
      }

      // 3. Guardar en Google Sheets (Google Apps Script)
      if (GOOGLE_SCRIPT_URL && !GOOGLE_SCRIPT_URL.includes("Reemplaza")) {
        try {
          await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, celular, email, fecha, hora }),
          });
          console.log("✅ Fila insertada en Google Sheets");
        } catch (sheetErr) {
          console.error("❌ Error en Google Sheets:", sheetErr);
        }
      }

      // 4. Guardar en base de datos Supabase (Render backend)
      try {
        await fetch('https://barberia-backend-2.onrender.com/reservar-cita', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre, celular, email, fecha_cita: fecha, hora_cita: hora }),
        });
        console.log("✅ Cita sincronizada con Supabase");
      } catch (dbErr) {
        console.error("❌ Error al guardar en base de datos:", dbErr);
      }

      setLoading(false);
      setConfirmacionVisible(true);
    } catch (err) {
      console.error('❌ Error general al reservar:', err);
      setLoading(false);
      setError('❌ Ocurrió un error al procesar tu cita. Inténtalo de nuevo.');
    }
  };

  const cerrarConfirmacion = () => {
    setNombre('');
    setCelular('');
    setEmail('');
    setFechaSeleccionada(null);
    setHoraSeleccionada('');
    setMostrarFormulario(false);
    setPaso(1);
    setConfirmacionVisible(false);
  };

  const generarHoras = () => {
    const horas = [];
    const base = new Date();
    base.setSeconds(0);
    base.setMilliseconds(0);

    for (let h = 9; h <= 23; h++) {
      for (let m = 0; m < 60; m += 30) {
        const hora = new Date(base);
        hora.setHours(h, m, 0, 0);
        horas.push(new Date(hora));
      }
    }

    const mediaNoche = new Date(base);
    mediaNoche.setDate(mediaNoche.getDate() + 1);
    mediaNoche.setHours(0, 0, 0, 0);
    horas.push(mediaNoche);

    return horas;
  };

  const horas = generarHoras();

  const obtenerHorasConEstado = () => {
    if (!fechaSeleccionada) return [];

    const ahora = new Date();
    const esHoy = fechaSeleccionada.toDateString() === ahora.toDateString();

    return horas.map((h) => {
      const horaCompleta = new Date(fechaSeleccionada);
      horaCompleta.setHours(h.getHours(), h.getMinutes(), 0, 0);
      const esPasada = esHoy && horaCompleta < ahora;

      return {
        horaStr: horaCompleta.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
        deshabilitada: esPasada,
        horaRaw: h.getHours()
      };
    });
  };

  const horasConEstado = obtenerHorasConEstado();

  // Dividir horas por turnos: Mañana (9:00 - 11:30), Tarde (12:00 - 17:30), Noche (18:00 - 23:59)
  const horasManana = horasConEstado.filter(h => h.horaRaw < 12);
  const horasTarde = horasConEstado.filter(h => h.horaRaw >= 12 && h.horaRaw < 18);
  const horasNoche = horasConEstado.filter(h => h.horaRaw >= 18);

  const renderHorasSeccion = (titulo, icono, lista) => {
    if (lista.length === 0) return null;
    return (
      <div className="turno-seccion-modern">
        <h4 className="turno-titulo-modern">{icono} {titulo}</h4>
        <div className="horas-grid-modern">
          {lista.map((horaObj, i) => (
            <button
              key={i}
              className={`hora-btn-modern ${horaSeleccionada === horaObj.horaStr ? 'active' : ''} ${horaObj.deshabilitada ? 'disabled' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                if (!horaObj.deshabilitada) {
                  setHoraSeleccionada(horaObj.horaStr);
                }
              }}
              disabled={horaObj.deshabilitada}
            >
              {horaObj.horaStr}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="cita-fullscreen">
      <div className="cita-overlay-text">
        <div className="cita-text-top animate-fade-in-up-1">NUEVA PROMO EXCLUSIVA</div>
        <h1 className="cita-text-main animate-fade-in-up-2">15% DE DESCUENTO EN TU PRIMERA CITA</h1>
        <div className="cita-button animate-fade-in-up-3" onClick={toggleFormulario}>
          <div className="cita-btn-text">RESERVAR CITA</div>
          <div className="cita-btn-icon"><FaCalendarCheck /></div>
        </div>
      </div>

      {mostrarFormulario && !confirmacionVisible && (
        <div className="cita-formulario-overlay">
          <div className="cita-formulario-contenido wizard-box">
            
            {/* Barra de Progreso Visual */}
            <div className="wizard-progress">
              <div className={`wizard-step ${paso >= 1 ? 'active' : ''} ${paso === 1 ? 'current' : ''}`}>
                <div className="step-num">{paso > 1 ? <FaCheck size={10} /> : "1"}</div>
                <span className="step-label">Datos</span>
              </div>
              <div className={`wizard-line ${paso >= 2 ? 'active' : ''}`}></div>
              <div className={`wizard-step ${paso >= 2 ? 'active' : ''} ${paso === 2 ? 'current' : ''}`}>
                <div className="step-num">{paso > 2 ? <FaCheck size={10} /> : "2"}</div>
                <span className="step-label">Fecha</span>
              </div>
              <div className={`wizard-line ${paso >= 3 ? 'active' : ''}`}></div>
              <div className={`wizard-step ${paso >= 3 ? 'active' : ''} ${paso === 3 ? 'current' : ''}`}>
                <div className="step-num">3</div>
                <span className="step-label">Hora</span>
              </div>
            </div>

            <h2 className="wizard-title">
              {paso === 1 && "Datos del Cliente"}
              {paso === 2 && "Selecciona Fecha"}
              {paso === 3 && "Selecciona Hora"}
            </h2>

            <form ref={formRef} onSubmit={handleSubmit} className="wizard-form">
              
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
                    />
                    <span className="input-focus-border"></span>
                  </div>
                  
                  <div className="wizard-buttons">
                    <button className="cerrar-btn-wizard" type="button" onClick={toggleFormulario}>Cancelar</button>
                    <button className="siguiente-btn" type="button" onClick={nextPaso}>
                      Fecha <FaArrowRight size={10} style={{ marginLeft: '8px' }} />
                    </button>
                  </div>
                </div>
              )}

              {/* PASO 2: Calendario */}
              {paso === 2 && (
                <div className="wizard-slide fade-in-slide">
                  <p className="wizard-desc">¿Qué día prefieres visitarnos? Selecciona en el calendario.</p>
                  
                  <div className="calendar-container">
                    <div className="calendar-wrapper-modern">
                      <DatePicker
                        selected={fechaSeleccionada}
                        onChange={(date) => {
                          setFechaSeleccionada(date);
                          setHoraSeleccionada('');
                        }}
                        minDate={new Date()}
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
                  <div className="seleccion-alert date-pill">
                    <FaCalendarAlt style={{ marginRight: '8px', color: '#ffffff' }} /> 
                    Fecha: <strong>{fechaSeleccionada ? fechaSeleccionada.toLocaleDateString() : ''}</strong>
                  </div>

                  <p className="wizard-desc">Selecciona un horario disponible en los siguientes turnos:</p>

                  <div className="turnos-container-modern">
                    {renderHorasSeccion("Mañana", "🌅", horasManana)}
                    {renderHorasSeccion("Tarde", "☀️", horasTarde)}
                    {renderHorasSeccion("Noche", "🌙", horasNoche)}
                  </div>

                  {horaSeleccionada && (
                    <div className="seleccion-alert time-pill fade-in">
                      <FaClock style={{ marginRight: '8px', color: '#ffffff' }} />
                      Hora elegida: <strong>{horaSeleccionada}</strong>
                    </div>
                  )}

                  <div className="wizard-buttons">
                    <button className="atras-btn" type="button" onClick={prevPaso}>
                      <FaArrowLeft size={10} style={{ marginRight: '8px' }} /> Fecha
                    </button>
                    <button 
                      className={`confirmar-btn-wizard ${!horaSeleccionada || loading ? 'disabled' : ''}`} 
                      type="submit"
                      disabled={!horaSeleccionada || loading}
                    >
                      {loading ? (
                        <div className="loading-spinner-btn">
                          <span className="spinner-dot"></span>
                          <span className="spinner-dot"></span>
                          <span className="spinner-dot"></span>
                        </div>
                      ) : (
                        "Confirmar Reserva"
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

      {confirmacionVisible && (
        <div className="cita-formulario-overlay">
          <div className="cita-formulario-contenido confirmacion-box fade-in-scale">
            <div className="confirmacion-success-animation">
              <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                <circle className="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
                <path className="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
              </svg>
            </div>
            
            <h2 className="confirmacion-title">¡Reserva Exitosa!</h2>
            <p className="confirmacion-subtitle">Hemos agendado tu cita de manera correcta. Te llegará un correo de confirmación.</p>
            
            <div className="confirmacion-resumen-box">
              <div className="resumen-item"><span>📍 Ubicación:</span> <span>Av. Principal 123 - Lima, Perú</span></div>
              <div className="resumen-item"><span>👤 Cliente:</span> <span>{nombre}</span></div>
              <div className="resumen-item"><span>📱 Celular:</span> <span>{celular}</span></div>
              <div className="resumen-item"><span>📅 Fecha:</span> <span>{fechaSeleccionada ? fechaSeleccionada.toLocaleDateString() : ''}</span></div>
              <div className="resumen-item"><span>⏰ Hora:</span> <span>{horaSeleccionada}</span></div>
            </div>

            <div className="confirmacion-acciones">
              <a 
                href={`https://wa.me/51951038509?text=${encodeURIComponent(`¡Hola! Acabo de reservar una cita:\n👤 Cliente: ${nombre}\n📅 Fecha: ${fechaSeleccionada ? fechaSeleccionada.toLocaleDateString() : ''}\n⏰ Hora: ${horaSeleccionada}\n📱 Celular: ${celular}`)}`}
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
