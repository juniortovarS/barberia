import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FaCrown, FaCalendarAlt, FaClock, FaSignOutAlt, FaCalendarPlus, FaUserShield,
  FaCheckCircle, FaLock, FaTicketAlt, FaCut, FaBolt,
} from 'react-icons/fa';
import '../styles/Perfil.css';
import { useAuth } from '../components/AuthContext';
import { supabase } from '../supabaseClient';
import { NIVELES_FIDELIDAD, useFidelidad, progresoNivel, abrirRegistro, cabeceraSesion } from '../utils/fidelidad';
import { soles, fasePorHora } from '../utils/servicios';
import { API_URL } from '../config';
import PagoYape from '../components/PagoYape';
import { obtenerDeviceId } from '../utils/yape';

const slug = (t = '') => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ESTADOS = {
  approved: { texto: 'Confirmada', clase: 'ok' },
  pending: { texto: 'Pendiente', clase: 'pendiente' },
  cancelled: { texto: 'Cancelada', clase: 'cancelada' },
};

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatoFecha = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

// "… - CLUB PLATA 10% DSCTO - …" -> "10%"
const descuentoDe = (nombre = '') => (nombre.match(/CLUB [A-ZÁÉÍÓÚ]+ (\d+)% DSCTO/) || [])[1];

const Perfil = () => {
  const { user, isAdmin, loading, logout } = useAuth();
  const { fidelidad, cargando: cargandoClub } = useFidelidad();
  const navigate = useNavigate();
  const [reservas, setReservas] = useState([]);
  const [cargandoReservas, setCargandoReservas] = useState(true);
  const [pestana, setPestana] = useState('proximas');
  const [ahora, setAhora] = useState(() => new Date());
  const [pagoExitoso, setPagoExitoso] = useState(null);

  // Reloj: cuando empieza una cita aparece sola la opción de pagar el restante
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const cargarReservas = useCallback(async () => {
    if (!user) return;
    setCargandoReservas(true);
    try {
      const { data, error } = await supabase
        .from('reservas')
        .select('*')
        .eq('email', user.email)
        .order('fecha_cita', { ascending: false });
      if (error) throw error;
      setReservas(data || []);
    } catch (err) {
      console.error('Error al cargar tus reservas:', err);
    } finally {
      setCargandoReservas(false);
    }
  }, [user]);

  useEffect(() => { cargarReservas(); }, [cargarReservas]);

  const { proximas, historial } = useMemo(() => {
    const hoy = hoyISO();
    // Próximas: las que aún no pasan y las que todavía deben el restante
    const prox = reservas
      .filter((r) => r.estado !== 'cancelled' && (r.fecha_cita >= hoy || r.saldo_estado === 'pendiente'))
      .sort((a, b) => a.fecha_cita.localeCompare(b.fecha_cita));
    const hist = reservas.filter((r) => !prox.includes(r));
    return { proximas: prox, historial: hist };
  }, [reservas]);

  const cancelarReserva = async (id) => {
    if (!window.confirm('¿Seguro que quieres cancelar esta cita? Si pagaste el adelanto, escríbenos por WhatsApp para coordinar.')) return;
    try {
      const { error } = await supabase.from('reservas').update({ estado: 'cancelled' }).eq('id', id);
      if (error) throw error;
      setReservas((prev) => prev.map((r) => (r.id === id ? { ...r, estado: 'cancelled' } : r)));
    } catch (err) {
      console.error('Error al cancelar la reserva:', err);
      alert('No se pudo cancelar la reserva. Inténtalo de nuevo.');
    }
  };

  const pagarRestante = (reserva) => async (tokenId, celular) => {
    const res = await fetch(`${API_URL}/reservas/${reserva.id}/pagar-saldo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await cabeceraSesion()) },
      body: JSON.stringify({ yape_token: tokenId, celular_yape: celular, device_id: obtenerDeviceId() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo completar el pago.');
    setReservas((prev) => prev.map((r) => (r.id === reserva.id ? { ...r, ...data.reserva } : r)));
    setPagoExitoso(reserva.id);
    setTimeout(() => setPagoExitoso(null), 6000);
  };

  const cerrarSesion = async () => {
    const res = await logout();
    if (res.success) navigate('/');
  };

  if (loading) {
    return (
      <main className="perfil-page">
        <div className="perfil-cargando"><span className="perfil-spinner" /></div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="perfil-page">
        <section className="perfil-sin-sesion">
          <div className="perfil-sin-sesion-icono"><FaLock /></div>
          <h1>Tu perfil</h1>
          <p>Inicia sesión o crea tu cuenta para ver tus citas y tu avance en el Club De Fidelidad JP.</p>
          <div className="perfil-sin-sesion-acciones">
            <button type="button" className="perfil-btn primario" onClick={() => abrirRegistro(false)}>Iniciar sesión</button>
            <button type="button" className="perfil-btn secundario" onClick={() => abrirRegistro(true)}>Crear cuenta gratis</button>
          </div>
        </section>
      </main>
    );
  }

  const nombre = user.user_metadata?.nombre || 'Cliente';
  const iniciales = (user.user_metadata?.nombre || user.email).substring(0, 2).toUpperCase();
  const miembroDesde = user.created_at
    ? new Date(user.created_at).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })
    : null;
  const lista = pestana === 'proximas' ? proximas : historial;

  return (
    <main className="perfil-page">
      <div className="perfil-contenedor">

        {/* Cabecera */}
        <header className="perfil-header">
          <div className="perfil-avatar">{iniciales}</div>
          <div className="perfil-identidad">
            <span className="perfil-saludo">Hola,</span>
            <h1>{nombre}</h1>
            <span className="perfil-email">{user.email}</span>
            {miembroDesde && <span className="perfil-miembro">Miembro desde {miembroDesde}</span>}
          </div>
          <div className="perfil-header-acciones">
            {isAdmin && (
              <Link to="/admin" className="perfil-btn secundario"><FaUserShield /> Panel admin</Link>
            )}
            <button type="button" className="perfil-btn fantasma" onClick={cerrarSesion}><FaSignOutAlt /> Salir</button>
          </div>
        </header>

        <div className="perfil-grid">
          {/* Club De Fidelidad JP */}
          <section className={`perfil-club-card nivel-${slug(fidelidad?.nivel)}`} aria-labelledby="club-titulo">
            <div className="perfil-club-cabecera">
              <span className="perfil-club-kicker"><FaCrown /> Club De Fidelidad JP</span>
              {fidelidad?.descuento > 0 && <span className="perfil-club-activo">Descuento activo</span>}
            </div>

            {cargandoClub && !fidelidad ? (
              <div className="perfil-club-skeleton" />
            ) : fidelidad ? (
              <>
                <div className="perfil-club-principal">
                  <div>
                    <span className="perfil-club-label">Tu nivel</span>
                    <h2 id="club-titulo" className="perfil-club-nivel">{fidelidad.nivel}</h2>
                  </div>
                  <div className="perfil-club-descuento">
                    <strong>{fidelidad.descuento > 0 ? `-${fidelidad.descuento}%` : '0%'}</strong>
                    <span>en cada corte</span>
                  </div>
                </div>

                <div className="perfil-club-stats">
                  <div><strong>{fidelidad.reservas}</strong><span>{fidelidad.reservas === 1 ? 'reserva confirmada' : 'reservas confirmadas'}</span></div>
                  <div>
                    <strong>{fidelidad.siguiente ? fidelidad.siguiente.faltan : '—'}</strong>
                    <span>{fidelidad.siguiente ? `para nivel ${fidelidad.siguiente.nombre}` : 'Nivel máximo alcanzado'}</span>
                  </div>
                </div>

                {fidelidad.siguiente && (
                  <div className="perfil-club-progreso">
                    <div className="perfil-club-barra"><span style={{ width: `${progresoNivel(fidelidad)}%` }} /></div>
                    <span className="perfil-club-meta">
                      {fidelidad.siguiente.faltan === 1 ? '¡Solo 1 reserva más' : `${fidelidad.siguiente.faltan} reservas más`} y desbloqueas <b>-{fidelidad.siguiente.descuento}%</b>
                      {fidelidad.siguiente.faltan === 1 ? '!' : ''}
                    </span>
                  </div>
                )}

                <ol className="perfil-club-niveles">
                  {NIVELES_FIDELIDAD.map((n) => {
                    const alcanzado = fidelidad.reservas >= n.minimo;
                    const actual = fidelidad.nivel === n.nombre;
                    return (
                      <li key={n.nombre} className={`nivel-${slug(n.nombre)} ${alcanzado ? 'alcanzado' : ''} ${actual ? 'actual' : ''}`}>
                        <span className="perfil-nivel-punto">{alcanzado ? <FaCheckCircle /> : null}</span>
                        <span className="perfil-nivel-nombre">{n.nombre}</span>
                        <span className="perfil-nivel-detalle">{n.descuento > 0 ? `-${n.descuento}% · ${n.minimo}+` : 'Inicio'}</span>
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : (
              <p className="perfil-club-error">No pudimos cargar tu nivel en este momento. Inténtalo más tarde.</p>
            )}
          </section>

          {/* Citas */}
          <section className="perfil-citas-card" aria-labelledby="citas-titulo">
            <div className="perfil-citas-cabecera">
              <h2 id="citas-titulo">Mis citas</h2>
              <Link to="/cita" className="perfil-btn primario pequeno"><FaCalendarPlus /> Reservar</Link>
            </div>

            <div className="perfil-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={pestana === 'proximas'} className={pestana === 'proximas' ? 'active' : ''} onClick={() => setPestana('proximas')}>
                Próximas <span>{proximas.length}</span>
              </button>
              <button type="button" role="tab" aria-selected={pestana === 'historial'} className={pestana === 'historial' ? 'active' : ''} onClick={() => setPestana('historial')}>
                Historial <span>{historial.length}</span>
              </button>
            </div>

            {cargandoReservas ? (
              <div className="perfil-citas-lista">
                {[0, 1].map((i) => <div key={i} className="perfil-cita-skeleton" />)}
              </div>
            ) : lista.length === 0 ? (
              <div className="perfil-citas-vacio">
                <FaCalendarAlt />
                <p>{pestana === 'proximas' ? 'No tienes citas próximas.' : 'Aún no tienes historial.'}</p>
                {pestana === 'proximas' && <Link to="/cita" className="perfil-btn secundario pequeno">Agenda tu próximo corte</Link>}
              </div>
            ) : (
              <ul className="perfil-citas-lista">
                {lista.map((r) => {
                  const estado = ESTADOS[r.estado] || ESTADOS.pending;
                  const dscto = r.descuento_pct || descuentoDe(r.nombre);
                  const fase = fasePorHora(r, ahora);
                  const debeSaldo = r.saldo_estado === 'pendiente' && Number(r.saldo) > 0 && r.estado !== 'cancelled';
                  const puedePagar = debeSaldo && fase !== 'proxima';
                  return (
                    <li key={r.id} className={`perfil-cita ${estado.clase} ${puedePagar ? 'en-curso' : ''}`}>
                      <div className="perfil-cita-fecha">
                        <FaCalendarAlt />
                        <div>
                          {r.servicio && <span className="perfil-cita-servicio"><FaCut /> {r.servicio}</span>}
                          <strong>{formatoFecha(r.fecha_cita)}</strong>
                          <span><FaClock /> {r.hora_cita}</span>
                        </div>
                      </div>
                      <div className="perfil-cita-meta">
                        <span className={`perfil-estado ${estado.clase}`}>{estado.texto}</span>
                        {r.codigo && <span className="perfil-codigo"><FaTicketAlt /> {r.codigo}</span>}
                        {!!dscto && <span className="perfil-dscto"><FaCrown /> -{dscto}%</span>}
                        {fase === 'en_curso' && r.estado !== 'cancelled' && <span className="perfil-en-curso"><FaBolt /> En curso</span>}
                      </div>

                      {r.total != null && (
                        <div className="perfil-cita-montos">
                          <span>Total <b>{soles(r.total)}</b></span>
                          <span>Adelanto <b>{soles(r.adelanto)}</b></span>
                          {Number(r.saldo) > 0 && (
                            <span className={`perfil-saldo ${r.saldo_estado}`}>
                              Restante <b>{soles(r.saldo)}</b>
                              {r.saldo_estado === 'pagado' ? ' · Pagado ✓' : ' · Pendiente'}
                            </span>
                          )}
                        </div>
                      )}

                      {debeSaldo && fase === 'proxima' && (
                        <p className="perfil-saldo-aviso">Podrás pagar el restante de {soles(r.saldo)} con Yape cuando empiece tu cita.</p>
                      )}

                      {puedePagar && (
                        <div className="perfil-pagar-saldo">
                          <p className="perfil-pagar-titulo">Tu cita ya empezó · paga el restante</p>
                          <PagoYape monto={Number(r.saldo)} onPagar={pagarRestante(r)} textoBoton={`Pagar restante ${soles(r.saldo)}`} />
                        </div>
                      )}

                      {pagoExitoso === r.id && (
                        <p className="perfil-pago-ok" role="status">✅ ¡Listo! Pagaste el restante. Gracias por tu visita.</p>
                      )}
                      {pestana === 'proximas' && fase === 'proxima' && (
                        <button type="button" className="perfil-cita-cancelar" onClick={() => cancelarReserva(r.id)}>
                          Cancelar
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};

export default Perfil;
