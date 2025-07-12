import React, { useState, useRef } from 'react';
import '../styles/Cita.css';
import { FaCalendarCheck } from 'react-icons/fa';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import emailjs from '@emailjs/browser';

const Cita = () => {
  const formRef = useRef();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(null);
  const [horaSeleccionada, setHoraSeleccionada] = useState('');
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [email, setEmail] = useState('');
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [mostrarHoras, setMostrarHoras] = useState(false);
  const [confirmacionVisible, setConfirmacionVisible] = useState(false);
  const [error, setError] = useState(null);

  const toggleFormulario = () => setMostrarFormulario(!mostrarFormulario);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!nombre || !celular || !email || !fechaSeleccionada || !horaSeleccionada) {
      alert("Por favor completa todos los campos.");
      return;
    }

    // ✅ Formato correcto para MySQL (YYYY-MM-DD)
    const fecha = fechaSeleccionada.toISOString().split('T')[0];
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
      // 1. Email al administrador
      await emailjs.send(
        'service_0ry9t41',
        'template_96itk4u',
        adminData,
        'QU8t-8ZyBlO4O4jDY'
      );

      // 2. Email al usuario
      await emailjs.send(
        'service_0ry9t41',
        'template_ruofj9e',
        userData,
        'QU8t-8ZyBlO4O4jDY'
      );

      // 3. Guardar en base de datos MySQL
      await fetch('http://localhost:4000/reservar-cita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, celular, email, fecha, hora }),
      });

      setConfirmacionVisible(true);
    } catch (err) {
      console.error('❌ Error:', err);
      setError('❌ Ocurrió un error al enviar la cita.');
    }
  };

  const cerrarConfirmacion = () => {
    setNombre('');
    setCelular('');
    setEmail('');
    setFechaSeleccionada(null);
    setHoraSeleccionada('');
    setMostrarFormulario(false);
    setMostrarCalendario(false);
    setMostrarHoras(false);
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
      };
    });
  };

  const horasConEstado = obtenerHorasConEstado();

  return (
    <div className="cita-fullscreen">
      <div className="cita-overlay-text">
        <div className="cita-text-top">NUEVA PROMO EXCLUSIVA</div>
        <h1 className="cita-text-main">15% DE DESCUENTO EN TU PRIMERA CITA</h1>
        <div className="cita-button" onClick={toggleFormulario}>
          <div className="cita-btn-text">RESERVAR CITA</div>
          <div className="cita-btn-icon"><FaCalendarCheck /></div>
        </div>
      </div>

      {mostrarFormulario && !confirmacionVisible && (
        <div className="cita-formulario-overlay">
          <div className="cita-formulario-contenido">
            <h2>Reservar Cita</h2>
            <form ref={formRef} onSubmit={handleSubmit}>
              <input type="text" placeholder="Tu nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
              <input type="tel" placeholder="Celular" value={celular} onChange={(e) => setCelular(e.target.value)} required />
              <input type="email" placeholder="Correo electrónico" value={email} onChange={(e) => setEmail(e.target.value)} required />

              <div className="desplegable">
                <label onClick={() => setMostrarCalendario(!mostrarCalendario)}>📅 Selecciona una fecha</label>
                {fechaSeleccionada && (
                  <div className="seleccion-resumen" onClick={() => setMostrarCalendario(true)}>
                    📆 {fechaSeleccionada.toLocaleDateString()}
                  </div>
                )}
                {mostrarCalendario && (
                  <DatePicker
                    selected={fechaSeleccionada}
                    onChange={(date) => {
                      setFechaSeleccionada(date);
                      setMostrarCalendario(false);
                      setHoraSeleccionada('');
                    }}
                    minDate={new Date()}
                    inline
                    className="datepicker-custom"
                  />
                )}
              </div>

              {fechaSeleccionada && (
                <div className="desplegable">
                  <label onClick={() => setMostrarHoras(!mostrarHoras)}>⏰ Selecciona una hora</label>
                  {horaSeleccionada && (
                    <div className="seleccion-resumen" onClick={() => setMostrarHoras(true)}>
                      🕐 {horaSeleccionada}
                    </div>
                  )}
                  {mostrarHoras && (
                    <div className="horas-grid">
                      {horasConEstado.map((horaObj, i) => (
                        <button
                          key={i}
                          className={`hora-btn ${horaSeleccionada === horaObj.horaStr ? 'active' : ''} ${horaObj.deshabilitada ? 'disabled' : ''}`}
                          onClick={(e) => {
                            e.preventDefault();
                            if (!horaObj.deshabilitada) {
                              setHoraSeleccionada(horaObj.horaStr);
                              setMostrarHoras(false);
                            }
                          }}
                          disabled={horaObj.deshabilitada}
                        >
                          {horaObj.horaStr}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button className="confirmar-btn" type="submit">Confirmar Cita</button>
              <button className="cerrar-btn" type="button" onClick={toggleFormulario}>Cancelar</button>
            </form>
            {error && <p className="cita-error">{error}</p>}
          </div>
        </div>
      )}

      {confirmacionVisible && (
        <div className="cita-formulario-overlay">
          <div className="cita-formulario-contenido">
            <h2 style={{ color: '#C9A66B' }}>🎉 ¡Cita Confirmada!</h2>
            <p><strong>📍 Ubicación:</strong> Av. Principal 123 - Lima, Perú</p>
            <p><strong>👤 Nombre:</strong> {nombre}</p>
            <p><strong>📱 Celular:</strong> {celular}</p>
            <p><strong>📧 Correo:</strong> {email}</p>
            <p><strong>📅 Fecha:</strong> {fechaSeleccionada.toLocaleDateString()}</p>
            <p><strong>⏰ Hora:</strong> {horaSeleccionada}</p>
            <button onClick={cerrarConfirmacion}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cita;
