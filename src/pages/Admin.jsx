import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaBolt, FaCalendarDay, FaCheck, FaClock, FaCoins, FaCrown, FaCut, FaHourglassHalf, FaListUl,
  FaMoneyBillWave, FaPhone, FaPlus, FaSearch, FaSyncAlt, FaTimes, FaUsers, FaWhatsapp, FaEnvelope,
  FaBell, FaHashtag, FaSearchPlus, FaReceipt, FaBellSlash, FaVolumeUp,
} from 'react-icons/fa';
import { enviarCorreoClienteConfirmada, citaDesdeReserva } from '../utils/correos';
import '../styles/AdminPro.css';
import { API_URL } from '../config';
import { supabase } from '../supabaseClient';
import { NIVELES_FIDELIDAD, cabeceraSesion } from '../utils/fidelidad';
import { SERVICIOS, duracionTexto, soles, fasePorHora, inicioDeCita } from '../utils/servicios';
import { turnosDelDia, fechaISO } from '../utils/horario';
import { useEventosAdmin, sonarAviso } from '../utils/eventosAdmin';
import { useAlarmaReserva, etiquetaVoz, VELOCIDADES } from '../utils/alarmaReserva';

// Tiempos del aviso de "nueva reserva"
const POPUP_MS = 60 * 1000; // el popup de arriba se queda 1 minuto (o hasta aceptar/rechazar)
const RECORDATORIO_CADA_MS = 2 * 60 * 1000; // si no se acepta ni rechaza, recordatorio a los 2 min…
const MAX_RECORDATORIOS = 2; // …y como máximo 2 veces (minuto 2 y minuto 4)

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

// Yape directo: el cliente subió la captura y la cita espera que el admin verifique el pago
const esYapeManual = (r) => r.pago_metodo === 'yape_manual';
const porVerificarPago = (r) => esYapeManual(r) && estadoNorm(r.estado) === 'pending';

// Mismas claves que MOTIVOS_RECHAZO del backend
const MOTIVOS_RECHAZO = [
  ['no_recibido', 'No llegó el Yape'],
  ['monto_incorrecto', 'El monto no coincide'],
  ['comprobante_invalido', 'La captura no es válida'],
  ['horario', 'El horario ya no está disponible'],
];

const haceCuanto = (fecha, ahora) => {
  const min = Math.max(0, Math.floor((ahora - new Date(fecha)) / 60000));
  if (min < 1) return 'Ahora mismo';
  if (min < 60) return `Hace ${min} min`;
  return `Hace ${Math.floor(min / 60)} h ${min % 60} min`;
};

// Aviso del sistema operativo cuando el panel está en otra pestaña o minimizado
const notificarEscritorio = (titulo, cuerpo) => {
  try {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(titulo, { body: cuerpo, tag: 'yape-por-verificar', renotify: true });
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* algunos móviles solo permiten notificaciones desde un service worker */ }
};

// Enlaces temporales de las capturas (el bucket es privado; el backend firma un enlace de 10 min)
const enlacesComprobante = new Map();
const useComprobante = (r) => {
  const [estado, setEstado] = useState({ url: null, error: false });
  useEffect(() => {
    if (!r?.voucher_url) return undefined;
    const enCache = enlacesComprobante.get(r.id);
    if (enCache && enCache.vence > Date.now()) {
      setEstado({ url: enCache.url, error: false });
      return undefined;
    }
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/admin/reservas/${r.id}/comprobante`, { headers: await cabeceraSesion() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) throw new Error(data.error || 'sin enlace');
        enlacesComprobante.set(r.id, { url: data.url, vence: Date.now() + 8 * 60000 });
        if (!cancelado) setEstado({ url: data.url, error: false });
      } catch {
        if (!cancelado) setEstado({ url: null, error: true });
      }
    })();
    return () => { cancelado = true; };
  }, [r?.id, r?.voucher_url]);
  return estado;
};
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
        {porVerificarPago(r)
          ? <span className="ad-chip yape"><FaReceipt /> Verificar Yape</span>
          : est !== 'approved' && <span className={`ad-chip ${est}`}>{ETIQUETA_ESTADO[est]}</span>}
        {est === 'approved' && fase === 'en_curso' && <span className="ad-chip vivo"><FaBolt /> En curso</span>}
        {est === 'approved' && <ChipSaldo r={r} />}
        {descuentoDe(r) > 0 && <span className="ad-chip club"><FaCrown /> -{descuentoDe(r)}%</span>}
      </span>
    </button>
  );
};

// Tarjeta de un Yape por verificar: captura, datos para comparar con la app y botones de decisión
const TarjetaVerificacion = ({ r, ahora, ocupado, onVerificar, onVer }) => {
  const { url, error } = useComprobante(r);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState(MOTIVOS_RECHAZO[0][0]);

  return (
    <article className="ad-verif">
      <button type="button" className="ad-verif-foto" onClick={() => url && onVer(url)} disabled={!url} aria-label="Ampliar captura">
        {url ? <img src={url} alt={`Captura de Yape de ${nombreLimpio(r.nombre)}`} /> : <span>{error ? 'Sin imagen' : 'Cargando…'}</span>}
        {url && <small><FaSearchPlus /> Ampliar</small>}
      </button>

      <div className="ad-verif-info">
        <div className="ad-verif-top">
          <strong>{nombreLimpio(r.nombre)}</strong>
          <span className="ad-verif-tiempo">{haceCuanto(r.fecha_registro, ahora)}</span>
        </div>
        <div className="ad-verif-monto">{soles(r.adelanto)}</div>
        <ul className="ad-verif-datos">
          <li><FaHashtag /> Operación <code>{r.yape_operacion || '—'}</code></li>
          <li><FaCut /> {r.servicio} · {fechaLarga(r.fecha_cita)} · {r.hora_cita}</li>
          <li><FaPhone /> {r.celular}</li>
        </ul>
        <p className="ad-verif-ayuda">Abre tu app de Yape y confirma que llegó <b>{soles(r.adelanto)}</b> con este Nº de operación.</p>

        {rechazando ? (
          <div className="ad-verif-rechazo">
            <label>
              Motivo (lo verá el cliente)
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                {MOTIVOS_RECHAZO.map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
              </select>
            </label>
            <div className="ad-verif-acciones">
              <button type="button" className="ad-btn peligro" disabled={ocupado} onClick={() => onVerificar(r, 'rechazar', motivo)}>
                <FaTimes /> Rechazar y liberar horario
              </button>
              <button type="button" className="ad-btn fantasma" disabled={ocupado} onClick={() => setRechazando(false)}>Volver</button>
            </div>
          </div>
        ) : (
          <div className="ad-verif-acciones">
            <button type="button" className="ad-btn verde" disabled={ocupado} onClick={() => onVerificar(r, 'aprobar')}>
              <FaCheck /> {ocupado ? 'Guardando…' : 'Llegó · confirmar cita'}
            </button>
            <button type="button" className="ad-btn peligro" disabled={ocupado} onClick={() => setRechazando(true)}>
              <FaTimes /> No llegó
            </button>
          </div>
        )}
      </div>
    </article>
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
  const [visor, setVisor] = useState(null); // captura ampliada
  const [permisoAvisos, setPermisoAvisos] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const verificadosAqui = useRef(new Set()); // pagos verificados desde este dispositivo (sin aviso duplicado)

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

  // 🔔 Alarma con voz (máx. 30 s o hasta que el admin se mueva)
  const alarma = useAlarmaReserva();

  // Popup de arriba: { id, nombre, recordatorio, requiereAccion } — se cierra solo a los 60 s
  const [popup, setPopup] = useState(null);
  const timerPopup = useRef(null);
  const abrirPopup = useCallback((datos) => {
    clearTimeout(timerPopup.current);
    setPopup(datos);
    timerPopup.current = setTimeout(() => setPopup(null), POPUP_MS);
  }, []);
  useEffect(() => () => clearTimeout(timerPopup.current), []);

  // Recordatorios de Yapes sin aceptar ni rechazar: id → { desde, enviados }
  const recordatorios = useRef(new Map());

  // 🔴 Tiempo real: pagos del restante, Yapes por verificar y reservas nuevas llegan sin recargar
  const estadoVivo = useEventosAdmin((tipo, datos) => {
    if (tipo !== 'reserva' || !datos?.reserva) return;
    aplicarReserva(datos.reserva);
    const quien = primerNombre(datos.reserva.nombre).toUpperCase();
    const nombreVoz = nombreLimpio(datos.reserva.nombre).split(' ')[0];
    if (datos.tipo === 'pago_por_verificar') {
      // Suena hasta que se acepte o rechace (máx. 45 s); los recordatorios cuentan desde ahora
      recordatorios.current.set(datos.reserva.id, { desde: Date.now(), enviados: 0 });
      if (alarma.activada) {
        alarma.iniciar(`¡Hola! Tienes una nueva reserva de ${nombreVoz}. Por favor, revisa el Yape y confírmala.`, { reservaId: datos.reserva.id });
      } else sonarAviso();
      abrirPopup({ id: datos.reserva.id, nombre: nombreLimpio(datos.reserva.nombre), recordatorio: false, requiereAccion: true });
      avisar(`💜 ${quien} yapeó ${soles(datos.reserva.adelanto)} · ${datos.reserva.servicio || 'servicio'} · ${datos.reserva.fecha_cita} ${datos.reserva.hora_cita} — verifícalo`, 'yape');
      notificarEscritorio('💜 Nuevo Yape por verificar', `${nombreLimpio(datos.reserva.nombre)} · ${soles(datos.reserva.adelanto)} · Op. ${datos.reserva.yape_operacion || ''}`);
      setPestana((p) => (p === 'reservas' ? p : 'hoy'));
    } else if (datos.tipo === 'pago_aprobado' || datos.tipo === 'pago_rechazado') {
      // Lo verificó otro dispositivo (en este ya se mostró el aviso al hacer clic)
      if (!verificadosAqui.current.has(datos.reserva.id)) {
        avisar(`${datos.tipo === 'pago_aprobado' ? '✅' : '✖️'} El Yape de ${quien} fue ${datos.tipo === 'pago_aprobado' ? 'aprobado' : 'rechazado'} desde otro dispositivo`);
      }
    } else if (datos.tipo === 'saldo_pagado') {
      sonarAviso();
      avisar(`💰 ${quien} pagó el restante de ${soles(datos.reserva.saldo)}${datos.reserva.saldo_metodo === 'efectivo' ? ' (efectivo)' : ' con Yape'}`, 'ok');
    } else if (datos.tipo === 'nueva') {
      // Las citas que crea el propio admin desde "Nueva cita" (código ADM-) no hacen sonar la alarma
      const delPanel = String(datos.reserva.codigo || '').startsWith('ADM-');
      if (!delPanel && alarma.activada) {
        // Ya viene pagada (no hay nada que aceptar): se avisa 2 veces
        alarma.iniciar(`¡Hola! Tienes una nueva reserva de ${nombreVoz}. Revísala en el panel, por favor.`, { repeticiones: 2 });
      } else sonarAviso();
      if (!delPanel) abrirPopup({ id: datos.reserva.id, nombre: nombreLimpio(datos.reserva.nombre), recordatorio: false, requiereAccion: false });
      avisar(`📅 Nueva reserva: ${quien} · ${datos.reserva.servicio || 'servicio'} · ${datos.reserva.fecha_cita} ${datos.reserva.hora_cita}`);
    }
  });

  const activarAvisos = async () => {
    try { setPermisoAvisos(await Notification.requestPermission()); } catch { /* sin soporte */ }
  };

  // ---------- acciones ----------
  const verificarPago = async (r, decision, motivo) => {
    // Se aceptó o rechazó: se calla su alarma, se cierra su popup y no habrá más recordatorios
    if (alarma.sonando?.reservaId === r.id) alarma.detener();
    setPopup((p) => (p?.id === r.id ? null : p));
    recordatorios.current.delete(r.id);
    setAccionId(r.id);
    verificadosAqui.current.add(r.id);
    const quien = nombreLimpio(r.nombre);
    try {
      const res = await fetch(`${API_URL}/admin/reservas/${r.id}/verificar-pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await cabeceraSesion()) },
        body: JSON.stringify({ decision, motivo }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.reserva) aplicarReserva(data.reserva);
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
      if (decision === 'aprobar') {
        // Recién ahora la cita está reservada: se envía el correo de confirmación al cliente
        enviarCorreoClienteConfirmada(citaDesdeReserva(data.reserva), { webUrl: window.location.origin })
          .then(() => avisar(`✅ Cita de ${quien} confirmada. Le enviamos el correo de confirmación.`, 'ok'))
          .catch((err) => {
            console.error('Error enviando correo:', err);
            avisar(`✅ Cita de ${quien} confirmada, pero no se pudo enviar el correo. Avísale por WhatsApp.`, 'error');
          });
      } else {
        avisar(`Pago de ${quien} rechazado. El horario quedó libre.`);
      }
      setDetalle((d) => (d && d.id === r.id ? null : d));
    } catch (err) {
      avisar(`❌ ${err.message}`, 'error');
    } finally {
      setAccionId(null);
    }
  };

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
  const porVerificar = reservas
    .filter(porVerificarPago)
    .sort((a, b) => new Date(a.fecha_registro) - new Date(b.fecha_registro));

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

  // Si una reserva deja de estar pendiente (aquí, en otro dispositivo o al recargar), se calla su alarma y su popup
  const idsPorVerificar = porVerificar.map((r) => r.id).join(',');
  const { activada: alarmaActivada, sonando: alarmaSonando, iniciar: iniciarAlarma, detener: detenerAlarma } = alarma;
  useEffect(() => {
    const pendientes = new Set(idsPorVerificar ? idsPorVerificar.split(',') : []);
    if (alarmaSonando?.reservaId != null && !pendientes.has(String(alarmaSonando.reservaId))) detenerAlarma();
    setPopup((p) => (p?.requiereAccion && !pendientes.has(String(p.id)) ? null : p));
    [...recordatorios.current.keys()].forEach((id) => { if (!pendientes.has(String(id))) recordatorios.current.delete(id); });
  }, [idsPorVerificar, alarmaSonando, detenerAlarma]);

  // 🔁 Recordatorio: si a los 2 minutos no se aceptó ni rechazó, la voz lo vuelve a decir (máx. 2 veces)
  const porVerificarRef = useRef(porVerificar);
  porVerificarRef.current = porVerificar;
  useEffect(() => {
    const revisar = () => {
      if (!alarmaActivada || alarmaSonando) return;
      const ahoraMs = Date.now();
      for (const r of porVerificarRef.current) {
        if (!recordatorios.current.has(r.id)) recordatorios.current.set(r.id, { desde: ahoraMs, enviados: 0 });
        const seg = recordatorios.current.get(r.id);
        if (seg.enviados >= MAX_RECORDATORIOS) continue;
        if (ahoraMs - seg.desde < RECORDATORIO_CADA_MS * (seg.enviados + 1)) continue;
        seg.enviados += 1;
        const nombre = nombreLimpio(r.nombre);
        iniciarAlarma(`Recordatorio de reserva. ${nombre.split(' ')[0]} está esperando que confirmes su Yape.`, {
          reservaId: r.id, repeticiones: 2, conGrabacion: false,
        });
        abrirPopup({ id: r.id, nombre, recordatorio: true, requiereAccion: true });
        return; // uno a la vez
      }
    };
    revisar();
    const t = setInterval(revisar, 5000);
    return () => clearInterval(t);
  }, [idsPorVerificar, alarmaActivada, alarmaSonando, iniciarAlarma, abrirPopup]);

  // Pestaña del navegador con el contador, para verlo aunque el panel esté detrás
  useEffect(() => {
    const base = 'Panel · Barber Studio JP';
    document.title = porVerificar.length ? `(${porVerificar.length}) Yape por verificar · ${base}` : base;
  }, [porVerificar.length]);
  useEffect(() => () => { document.title = 'Barber Studio JP'; }, []);

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
            <button
              type="button"
              className={`ad-btn ${alarma.activada && !alarma.desbloqueada ? 'ad-alarma-pendiente' : 'fantasma'}`}
              onClick={() => {
                if (alarma.activada && alarma.desbloqueada) alarma.cambiarActivada(false);
                else { alarma.cambiarActivada(true); alarma.probar(); }
              }}
              title={alarma.activada ? 'La alarma con voz suena hasta que aceptes o rechaces la reserva (máx. 45 s). Clic para apagarla.' : 'Clic para activar la alarma con voz'}
            >
              {alarma.activada ? <FaBell /> : <FaBellSlash />}
              <span className="ad-ocultar-movil">
                {!alarma.activada ? 'Alarma apagada' : alarma.desbloqueada ? 'Alarma activa' : 'Activar alarma'}
              </span>
            </button>
            {alarma.activada && !alarma.grabacion && alarma.voces.length > 1 && (
              <label
                className="ad-voz"
                title={alarma.voces.some((v) => /natural|online/i.test(v.name))
                  ? 'Voz de la alarma'
                  : 'Para una voz mucho más humana (tipo Alexa), abre el panel en Microsoft Edge y elige una voz "Natural".'}
              >
                <FaVolumeUp />
                <select value={alarma.vozActual?.name || ''} onChange={(e) => alarma.cambiarVoz(e.target.value)} aria-label="Voz de la alarma">
                  {alarma.voces.map((v) => <option key={v.name} value={v.name}>{etiquetaVoz(v)}</option>)}
                </select>
              </label>
            )}
            {alarma.activada && !alarma.grabacion && (
              <label className="ad-voz" title="Velocidad de la voz (al cambiarla escuchas una prueba)">
                <FaBolt />
                <select value={alarma.velocidad} onChange={(e) => alarma.cambiarVelocidad(e.target.value)} aria-label="Velocidad de la voz">
                  {VELOCIDADES.map((v) => <option key={v.id} value={v.id}>{v.etiqueta}</option>)}
                </select>
              </label>
            )}
            {permisoAvisos === 'default' && (
              <button type="button" className="ad-btn fantasma" onClick={activarAvisos} title="Recibe un aviso aunque el panel esté minimizado">
                <FaBell /> <span className="ad-ocultar-movil">Activar avisos</span>
              </button>
            )}
            <button type="button" className="ad-btn fantasma" onClick={cargarReservas} title="Actualizar">
              <FaSyncAlt /> <span className="ad-ocultar-movil">Actualizar</span>
            </button>
          </div>
        </header>

        <nav className="ad-tabs" aria-label="Secciones">
          {[
            ['hoy', <FaCalendarDay />, 'Hoy', porVerificar.length || enCurso.length],
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

        {alarma.activada && !alarma.desbloqueada && (
          <button type="button" className="ad-alarma-desbloquear" onClick={() => alarma.probar()}>
            <FaVolumeUp /> Toca aquí una vez para que la alarma con voz pueda sonar cuando llegue una reserva
          </button>
        )}

        {error && <div className="ad-error">{error}</div>}
        {cargando && <div className="ad-cargando"><span /> Cargando reservas…</div>}

        {/* ===================== HOY ===================== */}
        {!cargando && porVerificar.length > 0 && (pestana === 'hoy' || pestana === 'reservas') && (
          <section className="ad-seccion ad-verif-seccion">
            <h2 className="ad-titulo yape">
              <FaReceipt /> Yapes por verificar <b className="ad-badge">{porVerificar.length}</b>
            </h2>
            <div className="ad-verif-grid">
              {porVerificar.map((r) => (
                <TarjetaVerificacion
                  key={r.id}
                  r={r}
                  ahora={ahora}
                  ocupado={accionId === r.id}
                  onVerificar={verificarPago}
                  onVer={setVisor}
                />
              ))}
            </div>
          </section>
        )}

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
                {porVerificarPago(detalle)
                  ? <div className="pendiente"><span>Adelanto (Yape directo) · por verificar</span><b>{soles(detalle.adelanto)}</b></div>
                  : <div className="ok"><span>Adelanto ({esYapeManual(detalle) ? 'Yape directo' : 'Yape'})</span><b>{soles(detalle.adelanto)} ✓</b></div>}
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
              {detalle.yape_operacion && <span className="ad-contacto-dato"><FaHashtag /> Op. {detalle.yape_operacion}</span>}
            </div>

            {esYapeManual(detalle) && detalle.voucher_url && <ComprobanteDetalle r={detalle} onVer={setVisor} />}
            {estadoNorm(detalle.estado) === 'cancelled' && detalle.pago_motivo_rechazo && (
              <p className="ad-ayuda">Rechazado: {detalle.pago_motivo_rechazo}{detalle.pago_revisado_por ? ` (${detalle.pago_revisado_por})` : ''}</p>
            )}

            {porVerificarPago(detalle) ? (
              <AccionesVerificacionDetalle r={detalle} ocupado={accionId === detalle.id} onVerificar={verificarPago} />
            ) : (
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
            )}
          </div>
        </div>
      )}

      {/* ===================== ALARMA SONANDO ===================== */}
      {popup && (
        <div className={`ad-alarma ${popup.recordatorio ? 'recordatorio' : ''}`} role="alert">
          <span className="ad-alarma-icono"><FaBell /></span>
          <div className="ad-alarma-texto">
            <strong>{popup.recordatorio ? `Recordatorio de reserva · ${popup.nombre}` : `¡Tienes una nueva reserva de ${popup.nombre}!`}</strong>
            <small>
              {popup.requiereAccion
                ? 'Revisa el Yape y acéptala o recházala. La alarma se calla en cuanto lo hagas.'
                : 'Ya viene pagada. Revísala en el panel.'}
            </small>
          </div>
          <button type="button" className="ad-btn primario" onClick={() => { setPestana('hoy'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            Ver reserva
          </button>
        </div>
      )}

      {/* ===================== CAPTURA AMPLIADA ===================== */}
      {visor && (
        <div className="ad-modal-fondo ad-visor" onMouseDown={(e) => { if (e.target === e.currentTarget) setVisor(null); }}>
          <button type="button" className="ad-modal-cerrar" onClick={() => setVisor(null)} aria-label="Cerrar"><FaTimes /></button>
          <img src={visor} alt="Captura del Yape" />
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

// Captura dentro del detalle de la reserva
const ComprobanteDetalle = ({ r, onVer }) => {
  const { url, error } = useComprobante(r);
  return (
    <button type="button" className="ad-comprobante" onClick={() => url && onVer(url)} disabled={!url}>
      {url ? <img src={url} alt="Captura del Yape" /> : <span>{error ? 'No se pudo cargar la captura' : 'Cargando captura…'}</span>}
      {url && <small><FaSearchPlus /> Ver captura completa</small>}
    </button>
  );
};

// Aprobar / rechazar desde el detalle (mismo flujo que la tarjeta)
const AccionesVerificacionDetalle = ({ r, ocupado, onVerificar }) => {
  const [motivo, setMotivo] = useState(MOTIVOS_RECHAZO[0][0]);
  return (
    <div className="ad-modal-acciones">
      <button type="button" className="ad-btn verde" disabled={ocupado} onClick={() => onVerificar(r, 'aprobar')}>
        <FaCheck /> Llegó el Yape · confirmar cita
      </button>
      <div className="ad-rechazo-linea">
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo del rechazo">
          {MOTIVOS_RECHAZO.map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
        </select>
        <button type="button" className="ad-btn peligro" disabled={ocupado} onClick={() => onVerificar(r, 'rechazar', motivo)}>
          <FaTimes /> Rechazar
        </button>
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
        enviarCorreoClienteConfirmada({
          nombre: form.nombre,
          celular: form.celular,
          email: form.email,
          servicio: servicio.nombre,
          duracion: servicio.duracion,
          fecha: form.fecha,
          hora: form.hora,
          codigo,
          total: servicio.precio,
          adelanto: 0,
          saldo: servicio.precio,
          metodo: 'En el local',
        }, { webUrl: window.location.origin }).catch((err) => console.error('Error enviando correo:', err));
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
