import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaBolt, FaCalendarDay, FaCheck, FaClock, FaCoins, FaCrown, FaCut, FaHourglassHalf, FaListUl,
  FaMoneyBillWave, FaPhone, FaPlus, FaSearch, FaSyncAlt, FaTimes, FaUsers, FaWhatsapp, FaEnvelope,
} from 'react-icons/fa';
import emailjs from '@emailjs/browser';
import '../styles/AdminPro.css';
import { API_URL } from '../config';
import { supabase } from '../supabaseClient';
import { NIVELES_FIDELIDAD, cabeceraSesion } from '../utils/fidelidad';
import { SERVICIOS, duracionTexto, soles, fasePorHora, inicioDeCita } from '../utils/servicios';
import { turnosDelDia, fechaISO } from '../utils/horario';
import { useEventosAdmin, sonarAviso } from '../utils/eventosAdmin';

// ---------- utilidades ----------
const nombreLimpio = (nombre = '') => nombre.split(' (')[0].trim() || 'Sin nombre';
const primerNombre = (nombre) => nombreLimpio(nombre).split(' ')[0];
const nivelClub = (aprobadas) => [...NIVELES_FIDELIDAD].reverse().find((n) => aprobadas >= n.minimo);
const descuentoDe = (r) => r.descuento_pct || Number((String(r.nombre).match(/CLUB [A-ZÁÉÍÓÚ]+ (\d+)% DSCTO/) || [])[1] || 0);
const estadoNorm = (e) => (e || 'pending').toLowerCase();

const horaFin = (r) => {
  const ini = inicioDeCita(r.fecha_cita, r.hora_cita);
  if (!ini) return '';
  const fin = new Date(ini.getTime() + (r.duracion_min || 30) * 60000);
  return fin.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const ordenarPorHora = (a, b) => (inicioDeCita(a.fecha_cita, a.hora_cita) || 0) - (inicioDeCita(b.fecha_cita, b.hora_cita) || 0);

const ETIQUETA_ESTADO = { approved: 'Confirmada', pending: 'Por aprobar', cancelled: 'Cancelada' };
const ETIQUETA_FASE = { proxima: 'Próxima', en_curso: 'En curso', terminada: 'Terminada' };

const fechaLarga = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
};

// ---------- componentes pequeños ----------
const ChipSaldo = ({ r }) => {
  if (!(Number(r.saldo) > 0)) return null;
  return r.saldo_estado === 'pagado'
    ? <span className="ad-chip ok"><FaCheck /> Restante pagado{r.saldo_metodo ? ` · ${r.saldo_metodo}` : ''}</span>
    : <span className="ad-chip alerta"><FaHourglassHalf /> Debe {soles(r.saldo)}</span>;
};

const FilaReserva = ({ r, ahora, onAbrir, mostrarFecha }) => {
  const fase = fasePorHora(r, ahora);
  const est = estadoNorm(r.estado);
  return (
    <button type="button" className={`ad-fila ${est} fase-${fase}`} onClick={() => onAbrir(r)}>
      <span className="ad-fila-hora">
        <strong>{r.hora_cita}</strong>
        <small>{mostrarFecha ? r.fecha_cita : `hasta ${horaFin(r)}`}</small>
      </span>
      <span className="ad-fila-info">
        <strong>{nombreLimpio(r.nombre)}</strong>
        <small><FaCut /> {r.servicio || 'Servicio no especificado'}{r.duracion_min ? ` · ${duracionTexto(r.duracion_min)}` : ''}</small>
      </span>
      <span className="ad-fila-chips">
        {est !== 'approved' && <span className={`ad-chip ${est}`}>{ETIQUETA_ESTADO[est]}</span>}
        {est === 'approved' && fase === 'en_curso' && <span className="ad-chip vivo"><FaBolt /> En curso</span>}
        {est === 'approved' && <ChipSaldo r={r} />}
        {descuentoDe(r) > 0 && <span className="ad-chip club"><FaCrown /> -{descuentoDe(r)}%</span>}
      </span>
    </button>
  );
};

// =====================================================================
const Admin = () => {
  const [reservas, setReservas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [pestana, setPestana] = useState('hoy');
  const [ahora, setAhora] = useState(() => new Date());
  const [detalle, setDetalle] = useState(null);
  const [clienteSel, setClienteSel] = useState(null);
  const [accionId, setAccionId] = useState(null);
  const [avisos, setAvisos] = useState([]);
  const [filtro, setFiltro] = useState('proximas');
  const [busqueda, setBusqueda] = useState('');

  // ---------- datos ----------
  const cargarReservas = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/reservas`, { headers: await cabeceraSesion() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReservas(await res.json());
    } catch (err) {
      console.warn('Backend no disponible, leyendo directo de Supabase:', err.message);
      const { data, error: errSb } = await supabase.from('reservas').select('*').order('id', { ascending: false });
      if (errSb) setError('No se pudieron cargar las reservas. Revisa que el backend esté encendido.');
      else setReservas(data || []);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargarReservas(); }, [cargarReservas]);

  // Reloj para saber qué cita está "en curso" + respaldo cada minuto por si se cae el tiempo real
  useEffect(() => {
    const reloj = setInterval(() => setAhora(new Date()), 20000);
    const respaldo = setInterval(cargarReservas, 60000);
    return () => { clearInterval(reloj); clearInterval(respaldo); };
  }, [cargarReservas]);

  const avisar = useCallback((texto, tipo = 'info') => {
    const id = Date.now() + Math.random();
    setAvisos((prev) => [...prev, { id, texto, tipo }]);
    setTimeout(() => setAvisos((prev) => prev.filter((a) => a.id !== id)), 7000);
  }, []);

  const aplicarReserva = useCallback((reserva) => {
    setReservas((prev) => {
      const existe = prev.some((r) => r.id === reserva.id);
      return existe ? prev.map((r) => (r.id === reserva.id ? { ...r, ...reserva } : r)) : [reserva, ...prev];
    });
    setDetalle((d) => (d && d.id === reserva.id ? { ...d, ...reserva } : d));
  }, []);

  // 🔴 Tiempo real: pagos del restante y reservas nuevas llegan sin recargar
  const estadoVivo = useEventosAdmin((tipo, datos) => {
    if (tipo !== 'reserva' || !datos?.reserva) return;
    aplicarReserva(datos.reserva);
    const quien = primerNombre(datos.reserva.nombre).toUpperCase();
    if (datos.tipo === 'saldo_pagado') {
      sonarAviso();
      avisar(`💰 ${quien} pagó el restante de ${soles(datos.reserva.saldo)}${datos.reserva.saldo_metodo === 'efectivo' ? ' (efectivo)' : ' con Yape'}`, 'ok');
    } else if (datos.tipo === 'nueva') {
      sonarAviso();
      avisar(`📅 Nueva reserva: ${quien} · ${datos.reserva.servicio || 'servicio'} · ${datos.reserva.fecha_cita} ${datos.reserva.hora_cita}`);
    }
  });

  // ---------- acciones ----------
  const cambiarEstado = async (r, estado) => {
    if (estado === 'cancelled' && !window.confirm(`¿Cancelar la cita de ${nombreLimpio(r.nombre)}?`)) return;
    setAccionId(r.id);
    try {
      const res = await fetch(`${API_URL}/reservas/${r.id}/estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await cabeceraSesion()) },
        body: JSON.stringify({ estado }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Error');
      aplicarReserva({ ...r, estado });
    } catch (err) {
      alert(`No se pudo actualizar: ${err.message}`);
    } finally {
      setAccionId(null);
    }
  };

  const cobrarEnEfectivo = async (r) => {
    if (!window.confirm(`¿Confirmas que ${nombreLimpio(r.nombre)} pagó ${soles(r.saldo)} en el local?`)) return;
    setAccionId(r.id);
    try {
      const res = await fetch(`${API_URL}/reservas/${r.id}/saldo-efectivo`, {
        method: 'POST',
        headers: await cabeceraSesion(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      aplicarReserva(data.reserva);
    } catch (err) {
      alert(`No se pudo registrar el pago: ${err.message}`);
    } finally {
      setAccionId(null);
    }
  };

  // ---------- cálculos ----------
  const hoy = fechaISO(ahora);
  const activas = reservas.filter((r) => estadoNorm(r.estado) !== 'cancelled');
  const citasHoy = activas.filter((r) => r.fecha_cita === hoy).sort(ordenarPorHora);
  const enCurso = citasHoy.filter((r) => estadoNorm(r.estado) === 'approved' && fasePorHora(r, ahora) === 'en_curso');
  // Terminaron pero todavía deben el restante (de hoy o días anteriores)
  const porCobrar = activas
    .filter((r) => r.saldo_estado === 'pendiente' && fasePorHora(r, ahora) === 'terminada')
    .sort(ordenarPorHora);
  const porAprobar = reservas.filter((r) => estadoNorm(r.estado) === 'pending');

  const cobradoHoy = citasHoy.reduce(
    (acc, r) => acc + (Number(r.adelanto) || 0) + (r.saldo_estado === 'pagado' ? Number(r.saldo) || 0 : 0), 0);
  const pendienteHoy = citasHoy.reduce((acc, r) => acc + (r.saldo_estado === 'pendiente' ? Number(r.saldo) || 0 : 0), 0);
  const proximaCita = citasHoy.find((r) => fasePorHora(r, ahora) === 'proxima');

  const listaFiltrada = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return reservas
      .filter((r) => {
        const est = estadoNorm(r.estado);
        if (filtro === 'proximas') return est !== 'cancelled' && r.fecha_cita >= hoy;
        if (filtro === 'por_cobrar') return est !== 'cancelled' && r.saldo_estado === 'pendiente';
        if (filtro === 'pending') return est === 'pending';
        if (filtro === 'cancelled') return est === 'cancelled';
        return true;
      })
      .filter((r) => !q || `${r.nombre} ${r.celular} ${r.codigo || ''} ${r.servicio || ''} ${r.email || ''}`.toLowerCase().includes(q))
      .sort((a, b) => (filtro === 'proximas' ? ordenarPorHora(a, b) : ordenarPorHora(b, a)));
  }, [reservas, filtro, busqueda, hoy]);

  const clientes = useMemo(() => {
    const mapa = {};
    reservas.forEach((r) => {
      const key = (r.email || r.celular || 'desconocido').toLowerCase().trim();
      if (!mapa[key]) {
        mapa[key] = { key, nombre: nombreLimpio(r.nombre), email: r.email, celular: r.celular, citas: [], aprobadas: 0, gastado: 0 };
      }
      const c = mapa[key];
      c.citas.push(r);
      if (estadoNorm(r.estado) === 'approved') {
        c.aprobadas += 1;
        c.gastado += (Number(r.adelanto) || 0) + (r.saldo_estado === 'pagado' ? Number(r.saldo) || 0 : 0);
      }
    });
    return Object.values(mapa)
      .map((c) => ({ ...c, citas: c.citas.sort((a, b) => ordenarPorHora(b, a)), nivel: nivelClub(c.aprobadas) }))
      .filter((c) => !busqueda || `${c.nombre} ${c.email} ${c.celular}`.toLowerCase().includes(busqueda.toLowerCase()))
      .sort((a, b) => b.aprobadas - a.aprobadas);
  }, [reservas, busqueda]);

  // ---------- render ----------
  return (
    <div className="ad">
      <div className="ad-contenedor">
        <header className="ad-cabecera">
          <div>
            <span className="ad-kicker">Panel de control · Barber Studio JP</span>
            <h1>{pestana === 'hoy' ? 'Hoy' : pestana === 'reservas' ? 'Reservas' : pestana === 'clientes' ? 'Clientes' : 'Nueva cita'}</h1>
            <p className="ad-fecha">{fechaLarga(hoy)}</p>
          </div>
          <div className="ad-cabecera-acciones">
            <span className={`ad-vivo ${estadoVivo}`} title="Los pagos y reservas nuevas aparecen solos">
              <i /> {estadoVivo === 'en_vivo' ? 'En vivo' : estadoVivo === 'conectando' ? 'Conectando…' : 'Reconectando…'}
            </span>
            <button type="button" className="ad-btn fantasma" onClick={cargarReservas} title="Actualizar">
              <FaSyncAlt /> <span className="ad-ocultar-movil">Actualizar</span>
            </button>
          </div>
        </header>

        <nav className="ad-tabs" aria-label="Secciones">
          {[
            ['hoy', <FaCalendarDay />, 'Hoy', enCurso.length],
            ['reservas', <FaListUl />, 'Reservas', porAprobar.length],
            ['clientes', <FaUsers />, 'Clientes', 0],
            ['nueva', <FaPlus />, 'Nueva cita', 0],
          ].map(([id, icono, texto, badge]) => (
            <button key={id} type="button" className={pestana === id ? 'active' : ''} onClick={() => { setPestana(id); setBusqueda(''); }}>
              {icono} <span>{texto}</span>
              {badge > 0 && <b className="ad-badge">{badge}</b>}
            </button>
          ))}
        </nav>

        {error && <div className="ad-error">{error}</div>}
        {cargando && <div className="ad-cargando"><span /> Cargando reservas…</div>}

        {/* ===================== HOY ===================== */}
        {!cargando && pestana === 'hoy' && (
          <>
            <section className="ad-kpis">
              <div className="ad-kpi">
                <span><FaCalendarDay /> Citas hoy</span>
                <strong>{citasHoy.length}</strong>
                <small>{proximaCita ? `Siguiente: ${proximaCita.hora_cita}` : 'No quedan más por hoy'}</small>
              </div>
              <div className="ad-kpi">
                <span><FaBolt /> En curso</span>
                <strong>{enCurso.length}</strong>
                <small>{enCurso.length ? enCurso.map((r) => primerNombre(r.nombre)).join(', ') : 'Nadie en la silla'}</small>
              </div>
              <div className="ad-kpi verde">
                <span><FaCoins /> Cobrado hoy</span>
                <strong>{soles(cobradoHoy)}</strong>
                <small>Adelantos + restantes pagados</small>
              </div>
              <div className="ad-kpi dorado">
                <span><FaHourglassHalf /> Por cobrar hoy</span>
                <strong>{soles(pendienteHoy)}</strong>
                <small>Restantes pendientes</small>
              </div>
            </section>

            {enCurso.length > 0 && (
              <section className="ad-seccion">
                <h2 className="ad-titulo"><FaBolt /> Ahora mismo</h2>
                <div className="ad-encurso-grid">
                  {enCurso.map((r) => (
                    <button key={r.id} type="button" className={`ad-encurso ${r.saldo_estado === 'pagado' ? 'pagado' : ''}`} onClick={() => setDetalle(r)}>
                      <span className="ad-encurso-tag"><i /> {primerNombre(r.nombre).toUpperCase()} EN CURSO</span>
                      <strong className="ad-encurso-servicio">{r.servicio || 'Servicio'}</strong>
                      <span className="ad-encurso-hora"><FaClock /> {r.hora_cita} – {horaFin(r)}</span>
                      <span className="ad-encurso-monto">
                        {Number(r.saldo) > 0
                          ? (r.saldo_estado === 'pagado'
                            ? <><FaCheck /> Restante pagado</>
                            : <>Restante por pagar <b>{soles(r.saldo)}</b></>)
                          : 'Sin saldo pendiente'}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {porCobrar.length > 0 && (
              <section className="ad-seccion">
                <h2 className="ad-titulo alerta"><FaMoneyBillWave /> Terminaron y deben el restante</h2>
                <div className="ad-lista">
                  {porCobrar.map((r) => <FilaReserva key={r.id} r={r} ahora={ahora} onAbrir={setDetalle} mostrarFecha={r.fecha_cita !== hoy} />)}
                </div>
              </section>
            )}

            <section className="ad-seccion">
              <h2 className="ad-titulo"><FaClock /> Agenda de hoy</h2>
              {citasHoy.length === 0 ? (
                <div className="ad-vacio">No hay citas para hoy.</div>
              ) : (
                <div className="ad-lista">
                  {citasHoy.map((r) => <FilaReserva key={r.id} r={r} ahora={ahora} onAbrir={setDetalle} />)}
                </div>
              )}
            </section>
          </>
        )}

        {/* ===================== RESERVAS ===================== */}
        {!cargando && pestana === 'reservas' && (
          <section className="ad-seccion">
            <div className="ad-filtros">
              {[
                ['proximas', 'Próximas'],
                ['por_cobrar', 'Deben restante'],
                ['pending', `Por aprobar${porAprobar.length ? ` (${porAprobar.length})` : ''}`],
                ['cancelled', 'Canceladas'],
                ['todas', 'Todas'],
              ].map(([id, texto]) => (
                <button key={id} type="button" className={filtro === id ? 'active' : ''} onClick={() => setFiltro(id)}>{texto}</button>
              ))}
            </div>
            <label className="ad-buscar">
              <FaSearch />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, celular, código o servicio" />
            </label>
            {listaFiltrada.length === 0 ? (
              <div className="ad-vacio">No hay reservas con este filtro.</div>
            ) : (
              <div className="ad-lista">
                {listaFiltrada.map((r) => <FilaReserva key={r.id} r={r} ahora={ahora} onAbrir={setDetalle} mostrarFecha />)}
              </div>
            )}
          </section>
        )}

        {/* ===================== CLIENTES ===================== */}
        {!cargando && pestana === 'clientes' && (
          <section className="ad-seccion">
            <label className="ad-buscar">
              <FaSearch />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente" />
            </label>
            <div className="ad-clientes">
              {clientes.map((c) => (
                <button key={c.key} type="button" className="ad-cliente" onClick={() => setClienteSel(c)}>
                  <span className="ad-avatar">{c.nombre.substring(0, 2).toUpperCase()}</span>
                  <span className="ad-cliente-info">
                    <strong>{c.nombre}</strong>
                    <small>{c.celular} · {c.email}</small>
                  </span>
                  <span className="ad-cliente-datos">
                    <span className={`ad-chip club nivel-${c.nivel.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}`}>
                      <FaCrown /> {c.nivel.nombre}{c.nivel.descuento ? ` -${c.nivel.descuento}%` : ''}
                    </span>
                    <small>{c.aprobadas} citas · {soles(c.gastado)}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ===================== NUEVA CITA ===================== */}
        {pestana === 'nueva' && (
          <NuevaCita
            reservas={reservas}
            onCreada={(r) => { if (r) aplicarReserva(r); setPestana('hoy'); avisar('✅ Cita registrada'); }}
          />
        )}
      </div>

      {/* ===================== DETALLE DE RESERVA ===================== */}
      {detalle && (
        <div className="ad-modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetalle(null); }}>
          <div className="ad-modal" role="dialog" aria-modal="true" aria-label="Detalle de la reserva">
            <button type="button" className="ad-modal-cerrar" onClick={() => setDetalle(null)} aria-label="Cerrar"><FaTimes /></button>

            <div className="ad-modal-cabecera">
              {fasePorHora(detalle, ahora) === 'en_curso' && estadoNorm(detalle.estado) === 'approved' && (
                <span className="ad-encurso-tag"><i /> {primerNombre(detalle.nombre).toUpperCase()} EN CURSO</span>
              )}
              <h3>{nombreLimpio(detalle.nombre)}</h3>
              <p>{detalle.servicio || 'Servicio no especificado'} · {fechaLarga(detalle.fecha_cita)} · {detalle.hora_cita}{detalle.duracion_min ? ` – ${horaFin(detalle)}` : ''}</p>
              <div className="ad-modal-chips">
                <span className={`ad-chip ${estadoNorm(detalle.estado)}`}>{ETIQUETA_ESTADO[estadoNorm(detalle.estado)]}</span>
                <span className="ad-chip">{ETIQUETA_FASE[fasePorHora(detalle, ahora)]}</span>
                {detalle.codigo && <span className="ad-chip codigo">{detalle.codigo}</span>}
              </div>
            </div>

            {detalle.total != null ? (
              <div className="ad-montos">
                <div><span>Precio</span><b>{soles(detalle.precio)}</b></div>
                {descuentoDe(detalle) > 0 && <div className="dsc"><span>Descuento Club</span><b>-{descuentoDe(detalle)}%</b></div>}
                <div><span>Total</span><b>{soles(detalle.total)}</b></div>
                <div className="ok"><span>Adelanto (Yape)</span><b>{soles(detalle.adelanto)} ✓</b></div>
                {Number(detalle.saldo) > 0 && (
                  <div className={`restante ${detalle.saldo_estado}`}>
                    <span>{detalle.saldo_estado === 'pagado' ? `Restante pagado (${detalle.saldo_metodo})` : 'Restante por pagar'}</span>
                    <b>{soles(detalle.saldo)}{detalle.saldo_estado === 'pagado' ? ' ✓' : ''}</b>
                  </div>
                )}
              </div>
            ) : (
              <div className="ad-vacio pequeno">Reserva anterior al sistema de servicios: sin detalle de montos.</div>
            )}

            {detalle.saldo_estado === 'pendiente' && estadoNorm(detalle.estado) !== 'cancelled' && (
              <p className="ad-ayuda">
                El cliente puede pagar el restante desde su perfil con Yape cuando empiece la cita: te aparecerá aquí al instante.
                Si te paga en el local, márcalo abajo.
              </p>
            )}

            <div className="ad-contacto">
              <a href={`https://wa.me/51${String(detalle.celular).replace(/\D/g, '').slice(-9)}`} target="_blank" rel="noopener noreferrer"><FaWhatsapp /> {detalle.celular}</a>
              {detalle.email && <a href={`mailto:${detalle.email}`}><FaEnvelope /> {detalle.email}</a>}
              {detalle.voucher_url && <a href={detalle.voucher_url} target="_blank" rel="noopener noreferrer">Ver voucher</a>}
            </div>

            <div className="ad-modal-acciones">
              {detalle.saldo_estado === 'pendiente' && estadoNorm(detalle.estado) !== 'cancelled' && (
                <button type="button" className="ad-btn verde" disabled={accionId === detalle.id} onClick={() => cobrarEnEfectivo(detalle)}>
                  <FaMoneyBillWave /> Cobré {soles(detalle.saldo)} en el local
                </button>
              )}
              {estadoNorm(detalle.estado) === 'pending' && (
                <button type="button" className="ad-btn primario" disabled={accionId === detalle.id} onClick={() => cambiarEstado(detalle, 'approved')}>
                  <FaCheck /> Aprobar
                </button>
              )}
              {estadoNorm(detalle.estado) !== 'cancelled' && (
                <button type="button" className="ad-btn peligro" disabled={accionId === detalle.id} onClick={() => cambiarEstado(detalle, 'cancelled')}>
                  <FaTimes /> Cancelar cita
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================== HISTORIAL DE CLIENTE ===================== */}
      {clienteSel && (
        <div className="ad-modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) setClienteSel(null); }}>
          <div className="ad-modal" role="dialog" aria-modal="true" aria-label="Historial del cliente">
            <button type="button" className="ad-modal-cerrar" onClick={() => setClienteSel(null)} aria-label="Cerrar"><FaTimes /></button>
            <div className="ad-modal-cabecera">
              <h3>{clienteSel.nombre}</h3>
              <p><FaPhone /> {clienteSel.celular} · {clienteSel.email}</p>
              <div className="ad-modal-chips">
                <span className="ad-chip club"><FaCrown /> Club {clienteSel.nivel.nombre}</span>
                <span className="ad-chip">{clienteSel.aprobadas} citas confirmadas</span>
                <span className="ad-chip ok">{soles(clienteSel.gastado)} gastado</span>
              </div>
            </div>
            <div className="ad-lista">
              {clienteSel.citas.map((r) => (
                <FilaReserva key={r.id} r={r} ahora={ahora} mostrarFecha onAbrir={(x) => { setClienteSel(null); setDetalle(x); }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===================== AVISOS EN VIVO ===================== */}
      <div className="ad-avisos" aria-live="polite">
        {avisos.map((a) => <div key={a.id} className={`ad-aviso ${a.tipo}`}>{a.texto}</div>)}
      </div>
    </div>
  );
};

// =====================================================================
// Formulario de cita manual (cliente que llamó o llegó al local)
// =====================================================================
const NuevaCita = ({ reservas, onCreada }) => {
  const [form, setForm] = useState({ nombre: '', celular: '', email: '', servicio_id: SERVICIOS[0].id, fecha: '', hora: '' });
  const [enviarCorreo, setEnviarCorreo] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const servicio = SERVICIOS.find((s) => s.id === form.servicio_id);

  const turnos = useMemo(() => {
    if (!form.fecha) return [];
    const [y, m, d] = form.fecha.split('-').map(Number);
    const bloques = reservas
      .filter((r) => r.fecha_cita === form.fecha && estadoNorm(r.estado) !== 'cancelled')
      .map((r) => {
        const ini = inicioDeCita(r.fecha_cita, r.hora_cita);
        if (!ini) return null;
        const fin = new Date(ini.getTime() + (r.duracion_min || 30) * 60000);
        const hhmm = (dt) => `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
        return { inicio: hhmm(ini), fin: hhmm(fin) };
      })
      .filter(Boolean);
    return turnosDelDia(new Date(y, m - 1, d), bloques, servicio.duracion);
  }, [form.fecha, reservas, servicio]);

  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value, ...(campo === 'fecha' || campo === 'servicio_id' ? { hora: '' } : {}) }));

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombre || !form.celular || !form.email || !form.fecha || !form.hora) {
      alert('Completa todos los campos.');
      return;
    }
    setGuardando(true);
    const codigo = `ADM-${Math.floor(100000 + Math.random() * 900000)}`;
    try {
      const res = await fetch(`${API_URL}/reservar-cita`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await cabeceraSesion()) },
        body: JSON.stringify({
          nombre: `${form.nombre} (ADM Ref: ${codigo} - Cel: ${form.celular} - Estado: APPROVED)`,
          celular: form.celular,
          email: form.email,
          fecha_cita: form.fecha,
          hora_cita: form.hora,
          codigo,
          estado: 'approved',
          servicio_id: form.servicio_id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar');

      if (enviarCorreo) {
        const mensaje = `Hola ${form.nombre},\n\nTu cita quedó registrada:\nServicio: ${servicio.nombre} (${duracionTexto(servicio.duracion)})\nFecha: ${form.fecha}\nHora: ${form.hora}\nTotal: ${soles(servicio.precio)} (se paga en el local)\nCódigo: ${codigo}\n\n¡Te esperamos en Barber Studio JP!`;
        emailjs.send('service_0ry9t41', 'template_ruofj9e', {
          asunto: 'CITA CONFIRMADA - BARBER STUDIO JP',
          subject: 'CITA CONFIRMADA - BARBER STUDIO JP',
          nombre: form.nombre, name: form.nombre, user_name: form.nombre,
          email: form.email, user_email: form.email, correo: form.email,
          fecha: form.fecha, hora: form.hora, codigo, codigo_reserva: codigo,
          mensaje, message: mensaje,
        }, 'QU8t-8ZyBlO4O4jDY').catch((err) => console.error('Error enviando correo:', err));
      }
      onCreada(data.data);
    } catch (err) {
      alert(`❌ ${err.message}`);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form className="ad-seccion ad-form" onSubmit={guardar}>
      <p className="ad-ayuda">Para clientes que reservan por teléfono o llegan al local. El total queda como "restante" y lo marcas como cobrado cuando paguen.</p>
      <div className="ad-form-grid">
        <label>Nombre<input value={form.nombre} onChange={cambiar('nombre')} placeholder="Nombre del cliente" /></label>
        <label>Celular<input value={form.celular} onChange={cambiar('celular')} inputMode="tel" placeholder="9 dígitos" /></label>
        <label className="ancho">Correo<input type="email" value={form.email} onChange={cambiar('email')} placeholder="correo@ejemplo.com" /></label>
        <label className="ancho">Servicio
          <select value={form.servicio_id} onChange={cambiar('servicio_id')}>
            {SERVICIOS.map((s) => <option key={s.id} value={s.id}>{s.nombre} · {duracionTexto(s.duracion)} · {soles(s.precio)}</option>)}
          </select>
        </label>
        <label>Fecha<input type="date" value={form.fecha} min={fechaISO(new Date())} onChange={cambiar('fecha')} /></label>
        <label>Hora
          <select value={form.hora} onChange={cambiar('hora')} disabled={!form.fecha}>
            <option value="">{form.fecha ? (turnos.length ? 'Elige una hora' : 'Cerrado ese día') : 'Primero elige la fecha'}</option>
            {turnos.map((t) => (
              <option key={t.valor} value={t.etiqueta} disabled={t.ocupado || t.pasado}>
                {t.etiqueta}{t.ocupado ? ' · ocupado' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="ad-check"><input type="checkbox" checked={enviarCorreo} onChange={(e) => setEnviarCorreo(e.target.checked)} /> Enviar correo de confirmación al cliente</label>
      <button type="submit" className="ad-btn primario grande" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar cita'}</button>
    </form>
  );
};

export default Admin;
