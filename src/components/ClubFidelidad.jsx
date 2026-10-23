import React from 'react';
import { Link } from 'react-router-dom';
import { FaCrown, FaUserPlus, FaCalendarCheck, FaArrowRight } from 'react-icons/fa';
import '../styles/ClubFidelidad.css';
import { useAuth } from './AuthContext';
import { NIVELES_FIDELIDAD, useFidelidad, abrirRegistro, progresoNivel } from '../utils/fidelidad';

const PASOS = [
  { icono: <FaUserPlus />, titulo: 'Crea tu cuenta', texto: 'Es gratis. Tus reservas con ese correo se suman solas.' },
  { icono: <FaCalendarCheck />, titulo: 'Reserva online', texto: 'Elige tu hora y paga el adelanto con Yape en segundos.' },
  { icono: <FaCrown />, titulo: 'Sube de nivel', texto: 'Cada cita confirmada te acerca a más descuento.' },
];

const ClubFidelidad = () => {
  const { user } = useAuth();
  const { fidelidad } = useFidelidad();

  return (
    <section className="club-section" id="club">
      <div className="club-inner">
        <header className="club-header reveal fade-up">
          <span className="club-kicker"><FaCrown /> Club De Fidelidad JP</span>
          <h2 className="club-title">Mientras más vienes, menos pagas</h2>
          <p className="club-subtitle">
            Nuestro programa de fidelidad premia a los clientes de siempre. Sin tarjetas ni sellos: todo queda en tu cuenta.
          </p>
        </header>

        <div className="club-niveles reveal fade-up">
          {NIVELES_FIDELIDAD.map((n) => {
            const actual = fidelidad?.nivel === n.nombre;
            return (
              <article key={n.nombre} className={`club-nivel nivel-${n.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()} ${actual ? 'actual' : ''}`}>
                {actual && <span className="club-nivel-tag">Tu nivel</span>}
                <span className="club-nivel-nombre">{n.nombre}</span>
                <strong className="club-nivel-descuento">{n.descuento > 0 ? `-${n.descuento}%` : 'Bienvenida'}</strong>
                <span className="club-nivel-req">
                  {n.minimo === 0 ? 'Al crear tu cuenta' : `Desde ${n.minimo} reservas`}
                </span>
              </article>
            );
          })}
        </div>

        <div className="club-pasos reveal fade-up">
          {PASOS.map((p, i) => (
            <div key={p.titulo} className="club-paso">
              <span className="club-paso-num">0{i + 1}</span>
              <span className="club-paso-icono">{p.icono}</span>
              <div>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="club-cta reveal fade-up">
          {user && fidelidad ? (
            <div className="club-progreso-card">
              <div className="club-progreso-top">
                <span>Nivel <strong>{fidelidad.nivel}</strong> · {fidelidad.reservas} {fidelidad.reservas === 1 ? 'reserva' : 'reservas'}</span>
                <span>{fidelidad.siguiente ? `${fidelidad.siguiente.faltan} para ${fidelidad.siguiente.nombre}` : 'Nivel máximo'}</span>
              </div>
              <div className="club-progreso-barra"><span style={{ width: `${progresoNivel(fidelidad)}%` }} /></div>
            </div>
          ) : (
            <button type="button" className="club-btn-primario" onClick={() => abrirRegistro(true)}>
              Crear cuenta gratis
            </button>
          )}
          <Link to="/cita" className="club-btn-secundario">
            Reservar cita <FaArrowRight />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default ClubFidelidad;
