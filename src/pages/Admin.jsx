import React, { useState, useEffect } from 'react';
import { 
  FaCheck, FaTimes, FaCalendarAlt, FaClock, FaUser, FaPhone, 
  FaEye, FaSearch, FaSyncAlt, FaChartLine, FaUsers, FaCalendarPlus, 
  FaCoins, FaReceipt, FaChevronRight, FaEnvelope, FaBan
} from 'react-icons/fa';
import '../styles/Admin.css';
import { API_URL } from '../config';
import { supabase } from '../supabaseClient';
import emailjs from '@emailjs/browser';

const HORAS_DISPONIBLES = [
  '09:00 a. m.', '09:30 a. m.', '10:00 a. m.', '10:30 a. m.',
  '11:00 a. m.', '11:30 a. m.', '12:00 p. m.', '12:30 p. m.',
  '01:00 p. m.', '01:30 p. m.', '02:00 p. m.', '02:30 p. m.',
  '03:00 p. m.', '03:30 p. m.', '04:00 p. m.', '04:30 p. m.',
  '05:00 p. m.', '05:30 p. m.', '06:00 p. m.', '06:30 p. m.',
  '07:00 p. m.', '07:30 p. m.', '08:00 p. m.'
];

const Admin = () => {
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Navegación de pestañas
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'citas', 'clientes', 'agendar'
  
  // Filtros de Citas
  const [filtroEstado, setFiltroEstado] = useState('pending'); // 'all', 'pending', 'approved', 'cancelled'
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modales y Detalles
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null); // Para ver el historial detallado de un cliente
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Formulario Administrativo de Agendamiento
  const [clientNombre, setClientNombre] = useState('');
  const [clientCelular, setClientCelular] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientFecha, setClientFecha] = useState('');
  const [clientHora, setClientHora] = useState('');
  const [clientMetodoPago, setClientMetodoPago] = useState('efectivo');
  const [clientCelularPago, setClientCelularPago] = useState('');
  const [clientEstado, setClientEstado] = useState('approved');
  const [clientCodigo, setClientCodigo] = useState('');
  const [enviarEmail, setEnviarEmail] = useState(true);
  const [savingAdminBooking, setSavingAdminBooking] = useState(false);

  const fetchReservas = async () => {
    setLoading(true);
    setError(null);
    let dataFetched = false;

    // 1. Intentar cargar desde el backend
    try {
      const response = await fetch(`${API_URL}/reservas`);
      if (response.ok) {
        const data = await response.json();
        // Ordenar descendentemente por ID
        data.sort((a, b) => b.id - a.id);
        setReservas(data);
        dataFetched = true;
      }
    } catch (err) {
      console.warn("Backend error, falling back to direct Supabase fetch:", err);
    }

    // 2. Fallback directo a Supabase
    if (!dataFetched) {
      try {
        const { data, error } = await supabase
          .from('reservas')
          .select('*')
          .order('id', { ascending: false });
        if (error) throw error;
        setReservas(data || []);
      } catch (err) {
        console.error(err);
        setError('Ocurrió un error al cargar las reservas. Inténtalo de nuevo.');
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReservas();
  }, []);

  // Generador de códigos administrativos
  const generarCodigoAdmin = () => {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    setClientCodigo(`ADM-${randomNum}`);
  };

  useEffect(() => {
    if (activeTab === 'agendar') {
      generarCodigoAdmin();
    }
  }, [activeTab]);

  const handleUpdateEstado = async (id, nuevoEstado) => {
    setActionLoadingId(id);
    let success = false;

    // 1. Intentar actualización vía backend
    try {
      const response = await fetch(`${API_URL}/reservas/${id}/estado`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      if (response.ok) {
        success = true;
      }
    } catch (err) {
      console.warn("Backend state update failed, calling direct Supabase:", err);
    }

    // 2. Fallback directo a Supabase
    if (!success) {
      try {
        const { error } = await supabase
          .from('reservas')
          .update({ estado: nuevoEstado })
          .eq('id', id);
        if (error) throw error;
        success = true;
      } catch (err) {
        alert('❌ No se pudo actualizar el estado: ' + err.message);
      }
    }

    if (success) {
      setReservas(prev =>
        prev.map(r => r.id === id ? { ...r, estado: nuevoEstado } : r)
      );
    }
    setActionLoadingId(null);
  };

  // Enviar agendamiento desde panel administrativo
  const handleAdminBookingSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSavingAdminBooking(true);

    if (!clientNombre || !clientCelular || !clientEmail || !clientFecha || !clientHora || !clientCodigo) {
      alert("⚠️ Por favor completa todos los campos requeridos.");
      setSavingAdminBooking(false);
      return;
    }

    const nombreCompletoConPago = `${clientNombre} (ADM Ref: ${clientCodigo} - Cel: ${clientCelularPago || clientCelular} - Estado: ${clientEstado.toUpperCase()})`;

    // Plantillas de correos
    const baseMessageText = `
========================================
            BARBERÍA PRO
========================================
Hola ${clientNombre},

Se ha registrado tu cita administrativa exitosamente.

DETALLES DE LA CITA:
----------------------------------------
Cliente:      ${clientNombre}
Teléfono:     ${clientCelular}
Correo:       ${clientEmail}
Fecha:        ${clientFecha}
Hora:         ${clientHora}
Código:       ${clientCodigo}
Método Pago:  ${clientMetodoPago.toUpperCase()}
Estado:       ${clientEstado.toUpperCase()}
----------------------------------------

¡Gracias por elegirnos!
========================================
`;

    const baseMessageHtml = `
<div style="font-family: 'Courier New', Courier, monospace; background-color: #000000; color: #ffffff; padding: 40px 20px; text-align: center;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #000000; border: 1px solid #333333; padding: 30px; text-align: left; box-sizing: border-box;">
    
    <div style="text-align: center; border-bottom: 1px solid #333333; padding-bottom: 20px; margin-bottom: 25px;">
      <h1 style="font-size: 22px; font-weight: bold; letter-spacing: 4px; margin: 0; text-transform: uppercase; color: #ffffff;">BARBERÍA PRO</h1>
      <p style="font-size: 11px; color: #888888; margin: 5px 0 0 0; letter-spacing: 2px;">ESTILO & ELEGANCIA MASCULINA</p>
    </div>

    <p style="font-size: 14px; line-height: 1.6; color: #dddddd; margin-bottom: 25px;">
      Hola, <strong>${clientNombre}</strong>.<br />
      Se ha agendado tu reserva administrativa de manera exitosa. Detalles de la cita:
    </p>

    <div style="background-color: #111111; border: 1px dashed #444444; padding: 20px; margin-bottom: 25px; font-size: 13px; line-height: 1.8;">
      <div style="border-bottom: 1px solid #222222; padding-bottom: 6px; margin-bottom: 6px;">
        <span style="color: #888888;">Cliente:</span> 
        <strong style="float: right; color: #ffffff;">${clientNombre}</strong>
      </div>
      <div style="border-bottom: 1px solid #222222; padding-bottom: 6px; margin-bottom: 6px;">
        <span style="color: #888888;">Celular:</span> 
        <strong style="float: right; color: #ffffff;">${clientCelular}</strong>
      </div>
      <div style="border-bottom: 1px solid #222222; padding-bottom: 6px; margin-bottom: 6px;">
        <span style="color: #888888;">Correo:</span> 
        <strong style="float: right; color: #ffffff; text-transform: none;">${clientEmail}</strong>
      </div>
      <div style="border-bottom: 1px solid #222222; padding-bottom: 6px; margin-bottom: 6px;">
        <span style="color: #888888;">Fecha Cita:</span> 
        <strong style="float: right; color: #ffffff;">${clientFecha}</strong>
      </div>
      <div style="border-bottom: 1px solid #222222; padding-bottom: 6px; margin-bottom: 6px;">
        <span style="color: #888888;">Hora Cita:</span> 
        <strong style="float: right; color: #ffffff;">${clientHora}</strong>
      </div>
      <div style="border-bottom: 1px solid #222222; padding-bottom: 6px; margin-bottom: 6px;">
        <span style="color: #888888;">Código Único:</span> 
        <strong style="float: right; color: #ffd700; font-family: monospace;">${clientCodigo}</strong>
      </div>
      <div style="border-bottom: 1px solid #222222; padding-bottom: 6px; margin-bottom: 6px;">
        <span style="color: #888888;">Método de Pago:</span> 
        <strong style="float: right; color: #ffffff;">${clientMetodoPago.toUpperCase()} ${clientCelularPago ? `(Ref: ${clientCelularPago})` : ''}</strong>
      </div>
      <div style="padding-top: 4px;">
        <span style="color: #888888;">Estado Pago:</span> 
        <strong style="float: right; color: #00e676; text-transform: uppercase;">${clientEstado.toUpperCase()}</strong>
      </div>
    </div>

    <p style="font-size: 12px; line-height: 1.6; color: #888888; margin-bottom: 0; text-align: center;">
      Si deseas realizar algún cambio o cancelar la cita, puedes hacerlo directamente desde el menú "Mi Cuenta" en nuestra web.<br /><br />
      <span style="color: #555555;">© 2026 Barbería Pro. Todos los derechos reservados.</span>
    </p>

  </div>
</div>
`;

    const userParams = {
      asunto: "RESERVA CONFIRMADA - BARBERÍA PRO",
      subject: "RESERVA CONFIRMADA - BARBERÍA PRO",
      nombre: clientNombre,
      cliente: clientNombre,
      user_name: clientNombre,
      name: clientNombre,
      celular: clientCelular,
      user_phone: clientCelular,
      phone: clientCelular,
      telefono: clientCelular,
      email: clientEmail,
      user_email: clientEmail,
      correo: clientEmail,
      fecha: clientFecha,
      hora: clientHora,
      codigo: clientCodigo,
      codigo_reserva: clientCodigo,
      metodo_pago: clientMetodoPago.toUpperCase(),
      celular_pago: clientCelularPago || clientCelular,
      estado: clientEstado.toUpperCase(),
      mensaje: baseMessageText,
      message: baseMessageText,
      mensaje_html: baseMessageHtml,
      message_html: baseMessageHtml
    };

    let databaseSaved = false;

    // 1. Enviar vía API
    try {
      const response = await fetch(`${API_URL}/reservar-cita`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombreCompletoConPago,
          celular: clientCelular,
          email: clientEmail,
          fecha_cita: clientFecha,
          hora_cita: clientHora,
          codigo: clientCodigo,
          estado: clientEstado,
          voucher_base64: null
        }),
      });
      if (response.ok) {
        databaseSaved = true;
      }
    } catch (err) {
      console.warn("Backend reservation save failed, falling back to direct Supabase:", err);
    }

    // 2. Guardado de respaldo Supabase directo
    if (!databaseSaved) {
      try {
        const { error: insertErr } = await supabase
          .from('reservas')
          .insert([{
            nombre: nombreCompletoConPago,
            celular: clientCelular,
            email: clientEmail,
            fecha_cita: clientFecha,
            hora_cita: clientHora,
            codigo: clientCodigo,
            estado: clientEstado,
            voucher_url: null
          }]);
        if (insertErr) throw insertErr;
        databaseSaved = true;
      } catch (err) {
        console.error("Direct Supabase insert failed:", err);
        alert("❌ Error al guardar la reserva en la base de datos: " + err.message);
        setSavingAdminBooking(false);
        return;
      }
    }

    if (databaseSaved) {
      // Enviar correo si está seleccionado
      if (enviarEmail && clientEmail) {
        try {
          await emailjs.send(
            'service_0ry9t41',
            'template_ruofj9e',
            userParams,
            'QU8t-8ZyBlO4O4jDY'
          );
          console.log("✉️ Correo de confirmación enviado");
        } catch (emailErr) {
          console.error("❌ Error enviando email:", emailErr);
          alert("⚠️ La reserva fue guardada, pero ocurrió un problema enviando el correo electrónico.");
        }
      }

      alert("🎉 Cita administrativa registrada con éxito.");
      
      // Limpiar formulario
      setClientNombre('');
      setClientCelular('');
      setClientEmail('');
      setClientFecha('');
      setClientHora('');
      setClientMetodoPago('efectivo');
      setClientCelularPago('');
      setClientEstado('approved');
      generarCodigoAdmin();
      
      fetchReservas();
      setActiveTab('dashboard');
    }
    setSavingAdminBooking(false);
  };

  // Obtener fecha de hoy en formato local (GMT-5 de Perú)
  const getTodayString = () => {
    const now = new Date();
    const offset = -5; // GMT-5
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const peruTime = new Date(utc + (3600000 * offset));
    
    const yyyy = peruTime.getFullYear();
    const mm = String(peruTime.getMonth() + 1).padStart(2, '0');
    const dd = String(peruTime.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = getTodayString();

  // Normalizar estado a minúsculas para comparación consistente (en BD puede venir 'PENDING', 'pending', etc.)
  const normalizeEstado = (estado) => (estado || '').toLowerCase() || 'pending';

  // Filtrado y Cálculo de KPIs
  const approvedReservas = reservas.filter(r => normalizeEstado(r.estado) === 'approved');
  const pendingReservas = reservas.filter(r => normalizeEstado(r.estado) === 'pending');
  const cancelledReservas = reservas.filter(r => normalizeEstado(r.estado) === 'cancelled');

  // Ingresos aprobados estimados (S/ 1.00 por reserva aprobada de abono)
  const approvedRevenue = approvedReservas.length * 1.00;

  // Citas de Hoy
  const citasDeHoy = reservas.filter(r => r.fecha_cita === todayStr);

  // Citas Recientes (últimas 5 creadas)
  const citasRecientes = reservas.slice(0, 5);

  // Filtrar citas en el buscador de la pestaña "Citas"
  const filteredReservas = reservas.filter(reserva => {
    const estadoNorm = normalizeEstado(reserva.estado);
    const matchesEstado = filtroEstado === 'all' || estadoNorm === filtroEstado;
    const searchString = `${reserva.nombre} ${reserva.celular} ${reserva.codigo || ''}`.toLowerCase();
    const matchesSearch = searchString.includes(searchTerm.toLowerCase());
    return matchesEstado && matchesSearch;
  });

  // Generar lista de clientes únicos agrupados por correo o celular
  const getClientesUnicos = () => {
    const clientMap = {};
    reservas.forEach(res => {
      const emailKey = res.email?.toLowerCase().trim();
      const phoneKey = res.celular?.trim();
      const key = emailKey || phoneKey || 'Desconocido';
      
      const cleanName = res.nombre ? res.nombre.split(' (')[0] : 'Sin Nombre';

      if (!clientMap[key]) {
        clientMap[key] = {
          key,
          nombre: cleanName,
          celular: res.celular || 'S/T',
          email: res.email || 'S/C',
          totalCitas: 0,
          citasAprobadas: 0,
          citasCanceladas: 0,
          citasPendientes: 0,
          ultimaCita: res.fecha_cita,
          historial: []
        };
      }

      const client = clientMap[key];
      client.totalCitas += 1;
      
      if (res.estado === 'approved') client.citasAprobadas += 1;
      else if (res.estado === 'cancelled') client.citasCanceladas += 1;
      else client.citasPendientes += 1;

      // Actualizar última fecha de visita
      if (new Date(res.fecha_cita) > new Date(client.ultimaCita)) {
        client.ultimaCita = res.fecha_cita;
      }

      client.historial.push(res);
    });

    // Ordenar historial de visitas cronológicamente (más recientes primero)
    Object.values(clientMap).forEach(client => {
      client.historial.sort((a, b) => new Date(b.fecha_cita + 'T' + b.hora_cita) - new Date(a.fecha_cita + 'T' + a.hora_cita));
    });

    return Object.values(clientMap).sort((a, b) => b.totalCitas - a.totalCitas);
  };

  const clientesUnicos = getClientesUnicos();

  return (
    <div className="admin-container">
      {/* Encabezado */}
      <div className="admin-header reveal active">
        <div>
          <h1 className="admin-title">Panel de Control</h1>
          <p className="admin-subtitle">Barbería Pro — Gestión Administrativa de Citas y Clientes.</p>
        </div>
        <button className="btn-sync" onClick={fetchReservas} disabled={loading}>
          <FaSyncAlt className={loading ? 'spin' : ''} /> Sincronizar Datos
        </button>
      </div>

      {/* Tabs Menu */}
      <div className="admin-tabs-nav">
        <button 
          className={`tab-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <FaChartLine /> Resumen
        </button>
        <button 
          className={`tab-nav-btn ${activeTab === 'citas' ? 'active' : ''}`}
          onClick={() => { setActiveTab('citas'); setFiltroEstado('pending'); }}
        >
          <FaCalendarAlt /> Listado de Citas
          {pendingReservas.length > 0 && (
            <span className="tab-pending-badge">{pendingReservas.length}</span>
          )}
        </button>
        <button 
          className={`tab-nav-btn ${activeTab === 'clientes' ? 'active' : ''}`}
          onClick={() => setActiveTab('clientes')}
        >
          <FaUsers /> Historial Clientes
        </button>
        <button 
          className={`tab-nav-btn ${activeTab === 'agendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('agendar')}
        >
          <FaCalendarPlus /> Agendar Cita
        </button>
      </div>

      {/* PESTAÑA: DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="admin-tab-content active animated">
          {/* KPI Cards Grid */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon-wrapper">
                <FaReceipt className="kpi-icon" />
              </div>
              <div className="kpi-data">
                <span className="kpi-value">{reservas.length}</span>
                <span className="kpi-label">Reservas Totales</span>
              </div>
            </div>

            <div className="kpi-card approved">
              <div className="kpi-icon-wrapper">
                <FaCoins className="kpi-icon" />
              </div>
              <div className="kpi-data">
                <span className="kpi-value">S/ {approvedRevenue.toFixed(2)}</span>
                <span className="kpi-label">Ingresos Aprobados (Abono)</span>
              </div>
            </div>

            <div className="kpi-card pending">
              <div className="kpi-icon-wrapper">
                <FaClock className="kpi-icon" />
              </div>
              <div className="kpi-data">
                <span className="kpi-value">{pendingReservas.length}</span>
                <span className="kpi-label">Aprobaciones Pendientes</span>
              </div>
            </div>

            <div className="kpi-card cancelled">
              <div className="kpi-icon-wrapper">
                <FaBan className="kpi-icon" />
              </div>
              <div className="kpi-data">
                <span className="kpi-value">{cancelledReservas.length}</span>
                <span className="kpi-label">Citas Canceladas</span>
              </div>
            </div>
          </div>

          <div className="dashboard-lists-row">
            {/* Citas de Hoy */}
            <div className="dashboard-panel">
              <div className="dashboard-panel-header">
                <h3 className="panel-title">📅 Citas Para Hoy ({citasDeHoy.length})</h3>
                <span className="panel-date-badge">{todayStr}</span>
              </div>
              <div className="dashboard-panel-body">
                {citasDeHoy.length === 0 ? (
                  <div className="empty-panel-state">
                    <p>No hay citas programadas para el día de hoy.</p>
                  </div>
                ) : (
                  <div className="panel-list">
                    {citasDeHoy.map(reserva => (
                      <div key={reserva.id} className="panel-list-item">
                        <div className="item-left">
                          <span className="item-time"><FaClock /> {reserva.hora_cita}</span>
                          <span className="item-title">{reserva.nombre.split(' (')[0]}</span>
                          <span className="item-phone"><FaPhone size={10} /> {reserva.celular}</span>
                        </div>
                        <div className="item-right">
                          <span className={`status-pill ${normalizeEstado(reserva.estado)}`}>
                            {normalizeEstado(reserva.estado) === 'approved' ? 'Aprobado' : normalizeEstado(reserva.estado) === 'cancelled' ? 'Cancelado' : 'Pendiente'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actividad Reciente */}
            <div className="dashboard-panel">
              <div className="dashboard-panel-header">
                <h3 className="panel-title">⚡ Actividad Reciente</h3>
                <span className="panel-subtitle">Últimas 5 reservas registradas</span>
              </div>
              <div className="dashboard-panel-body">
                {citasRecientes.length === 0 ? (
                  <div className="empty-panel-state">
                    <p>No se registran reservas en la base de datos.</p>
                  </div>
                ) : (
                  <div className="panel-list">
                    {citasRecientes.map(reserva => (
                      <div key={reserva.id} className="panel-list-item">
                        <div className="item-left">
                          <span className="item-title">{reserva.nombre.split(' (')[0]}</span>
                          <span className="item-meta">
                            <FaCalendarAlt size={10} /> {reserva.fecha_cita} | <FaClock size={10} /> {reserva.hora_cita}
                          </span>
                        </div>
                        <div className="item-right">
                          <span className={`status-pill ${normalizeEstado(reserva.estado)}`}>
                            {normalizeEstado(reserva.estado) === 'approved' ? 'Aprobado' : normalizeEstado(reserva.estado) === 'cancelled' ? 'Cancelado' : 'Pendiente'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA: LISTADO DE CITAS */}
      {activeTab === 'citas' && (
        <div className="admin-tab-content active animated">
          {/* Filtros e Inputs de búsqueda */}
          <div className="admin-toolbar">
            <div className="search-bar-modern">
              <span className="search-icon"><FaSearch /></span>
              <input 
                type="text" 
                placeholder="Buscar por cliente, celular o código..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="filter-buttons">
              <button 
                className={`filter-btn ${filtroEstado === 'all' ? 'active' : ''}`}
                onClick={() => setFiltroEstado('all')}
              >
                Todos
              </button>
              <button 
                className={`filter-btn pending ${filtroEstado === 'pending' ? 'active' : ''}`}
                onClick={() => setFiltroEstado('pending')}
              >
                Pendientes
              </button>
              <button 
                className={`filter-btn approved ${filtroEstado === 'approved' ? 'active' : ''}`}
                onClick={() => setFiltroEstado('approved')}
              >
                Aprobados
              </button>
              <button 
                className={`filter-btn cancelled ${filtroEstado === 'cancelled' ? 'active' : ''}`}
                onClick={() => setFiltroEstado('cancelled')}
              >
                Cancelados
              </button>
            </div>
          </div>

          {/* Tabla de Citas */}
          {loading && reservas.length === 0 ? (
            <div className="admin-loader-box">
              <div className="admin-spinner"></div>
              <p>Cargando información de citas...</p>
            </div>
          ) : error ? (
            <div className="admin-error-box">
              <p className="error-message">❌ {error}</p>
              <button className="btn-retry" onClick={fetchReservas}>Reintentar</button>
            </div>
          ) : filteredReservas.length === 0 ? (
            <div className="admin-empty-box">
              <p>No se encontraron reservas con los filtros aplicados.</p>
            </div>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Fecha y Hora</th>
                    <th>Código Único</th>
                    <th>Comprobante</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReservas.map((reserva) => (
                    <tr key={reserva.id} className="admin-tr">
                      {/* Cliente */}
                      <td data-label="Cliente">
                        <div className="client-info-cell">
                          <div className="client-avatar">
                            <FaUser size={14} />
                          </div>
                          <div className="client-details">
                            <span className="client-name">{reserva.nombre.split(' (')[0]}</span>
                            <span className="client-phone"><FaPhone size={10} /> {reserva.celular}</span>
                            {reserva.email && <span className="client-email">{reserva.email}</span>}
                          </div>
                        </div>
                      </td>

                      {/* Fecha y Hora */}
                      <td data-label="Fecha / Hora">
                        <div className="datetime-cell">
                          <span><FaCalendarAlt size={12} className="cell-icon" /> {reserva.fecha_cita}</span>
                          <span className="time-sub"><FaClock size={12} className="cell-icon" /> {reserva.hora_cita}</span>
                        </div>
                      </td>

                      {/* Código Único */}
                      <td data-label="Código">
                        <span className="code-badge">{reserva.codigo || 'S/C'}</span>
                      </td>

                      {/* Comprobante */}
                      <td data-label="Pago">
                        {reserva.voucher_url ? (
                          <div className="voucher-cell">
                            <div className="voucher-thumbnail-wrapper">
                              <img src={reserva.voucher_url} alt="Thumbnail voucher" className="voucher-thumb" />
                            </div>
                            <button 
                              className="btn-view-voucher"
                              onClick={() => setSelectedVoucher(reserva.voucher_url)}
                            >
                              <FaEye /> Ver
                            </button>
                          </div>
                        ) : (
                          <span className="no-voucher">Sin Captura</span>
                        )}
                      </td>

                      {/* Estado */}
                      <td data-label="Estado">
                        <span className={`status-pill ${normalizeEstado(reserva.estado)}`}>
                          {normalizeEstado(reserva.estado) === 'approved' && 'Aprobado'}
                          {normalizeEstado(reserva.estado) === 'cancelled' && 'Cancelado'}
                          {normalizeEstado(reserva.estado) === 'pending' && 'Pendiente'}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td data-label="Acciones">
                        <div className="action-buttons-cell">
                          <button 
                            className="btn-action-approve"
                            onClick={() => handleUpdateEstado(reserva.id, 'approved')}
                            disabled={normalizeEstado(reserva.estado) === 'approved' || actionLoadingId === reserva.id}
                            title="Aprobar Pago"
                          >
                            <FaCheck />
                          </button>
                          <button 
                            className="btn-action-cancel"
                            onClick={() => handleUpdateEstado(reserva.id, 'cancelled')}
                            disabled={normalizeEstado(reserva.estado) === 'cancelled' || actionLoadingId === reserva.id}
                            title="Cancelar Reserva"
                          >
                            <FaTimes />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA: HISTORIAL DE CLIENTES */}
      {activeTab === 'clientes' && (
        <div className="admin-tab-content active animated">
          <div className="clientes-section-header">
            <h3 className="section-title">👤 Historial de Clientes Únicos ({clientesUnicos.length})</h3>
            <p className="section-subtitle">Visualiza la lealtad y el listado consolidado de citas de cada cliente.</p>
          </div>

          {clientesUnicos.length === 0 ? (
            <div className="admin-empty-box">
              <p>No se encontraron registros de clientes en las reservas.</p>
            </div>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Contacto</th>
                    <th className="th-center">Total Citas</th>
                    <th className="th-center">Aprobadas</th>
                    <th>Última Visita</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesUnicos.map((cliente, idx) => (
                    <tr key={cliente.key || idx} className="admin-tr">
                      {/* Cliente */}
                      <td data-label="Cliente">
                        <div className="client-info-cell">
                          <div className="client-avatar">
                            <span className="client-avatar-initials">
                              {cliente.nombre.substring(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <span className="client-name">{cliente.nombre}</span>
                          </div>
                        </div>
                      </td>

                      {/* Contacto */}
                      <td data-label="Contacto">
                        <div className="contact-details-cell">
                          <span><FaPhone size={10} /> {cliente.celular}</span>
                          <span style={{ textTransform: 'none', color: '#666666', fontSize: '0.8rem' }}>
                            <FaEnvelope size={10} /> {cliente.email}
                          </span>
                        </div>
                      </td>

                      {/* Total Citas */}
                      <td data-label="Total Citas" className="td-number">
                        <span className="number-value">{cliente.totalCitas}</span>
                      </td>

                      {/* Citas Aprobadas */}
                      <td data-label="Aprobadas" className="td-number">
                        <span className="stats-badge approved">
                          {cliente.citasAprobadas}
                        </span>
                      </td>

                      {/* Última Visita */}
                      <td data-label="Última Visita">
                        <div className="datetime-cell">
                          <span><FaCalendarAlt size={12} className="cell-icon" /> {cliente.ultimaCita}</span>
                        </div>
                      </td>

                      {/* Acción */}
                      <td data-label="">
                        <button 
                          className="btn-view-client-history"
                          onClick={() => setSelectedClient(cliente)}
                        >
                          Ver Historial <FaChevronRight size={10} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA: AGENDAR CITA */}
      {activeTab === 'agendar' && (
        <div className="admin-tab-content active animated">
          <div className="agendar-section-header">
            <h3 className="section-title">➕ Agendar Nueva Cita (Administrativo)</h3>
            <p className="section-subtitle">Ingresa los datos del cliente para registrar su cita directamente en el sistema.</p>
          </div>

          <div className="admin-form-container">
            <form onSubmit={handleAdminBookingSubmit} className="admin-booking-form">
              <div className="form-grid">
                
                {/* Datos del Cliente */}
                <div className="form-section">
                  <h4 className="form-section-title">👤 Datos del Cliente</h4>
                  
                  <div className="admin-form-group">
                    <label>Nombre Completo *</label>
                    <input 
                      type="text" 
                      placeholder="Nombre del cliente" 
                      value={clientNombre} 
                      onChange={(e) => setClientNombre(e.target.value)} 
                      required 
                    />
                  </div>

                  <div className="admin-form-group">
                    <label>Número Celular *</label>
                    <input 
                      type="tel" 
                      placeholder="999999999" 
                      value={clientCelular} 
                      onChange={(e) => setClientCelular(e.target.value)} 
                      required 
                    />
                  </div>

                  <div className="admin-form-group">
                    <label>Correo Electrónico *</label>
                    <input 
                      type="email" 
                      placeholder="cliente@correo.com" 
                      value={clientEmail} 
                      onChange={(e) => setClientEmail(e.target.value)} 
                      required 
                    />
                  </div>
                </div>

                {/* Detalles de la Reserva */}
                <div className="form-section">
                  <h4 className="form-section-title">📅 Detalles de la Reserva</h4>

                  <div className="form-row-grid">
                    <div className="admin-form-group">
                      <label>Fecha *</label>
                      <input 
                        type="date" 
                        value={clientFecha} 
                        onChange={(e) => setClientFecha(e.target.value)} 
                        required 
                      />
                    </div>

                    <div className="admin-form-group">
                      <label>Hora *</label>
                      <select 
                        value={clientHora} 
                        onChange={(e) => setClientHora(e.target.value)} 
                        required
                      >
                        <option value="">Selecciona hora</option>
                        {HORAS_DISPONIBLES.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-row-grid">
                    <div className="admin-form-group">
                      <label>Código de Cita (Generado)</label>
                      <div className="code-generation-wrapper">
                        <input 
                          type="text" 
                          value={clientCodigo} 
                          onChange={(e) => setClientCodigo(e.target.value)} 
                          required 
                        />
                        <button type="button" className="btn-regen-code" onClick={generarCodigoAdmin} title="Regenerar Código">
                          <FaSyncAlt size={12} />
                        </button>
                      </div>
                    </div>

                    <div className="admin-form-group">
                      <label>Estado Inicial *</label>
                      <select value={clientEstado} onChange={(e) => setClientEstado(e.target.value)}>
                        <option value="approved">Aprobado / Confirmado</option>
                        <option value="pending">Pendiente</option>
                        <option value="cancelled">Cancelado</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-row-grid">
                    <div className="admin-form-group">
                      <label>Método de Pago</label>
                      <select value={clientMetodoPago} onChange={(e) => setClientMetodoPago(e.target.value)}>
                        <option value="efectivo">Efectivo</option>
                        <option value="yape">Yape</option>
                        <option value="plin">Plin</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>

                    {clientMetodoPago !== 'efectivo' && (
                      <div className="admin-form-group">
                        <label>Celular del Pago / Ref</label>
                        <input 
                          type="tel" 
                          placeholder="Celular origen del pago" 
                          value={clientCelularPago} 
                          onChange={(e) => setClientCelularPago(e.target.value)} 
                        />
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Checkbox de Envío de Email */}
              <div className="admin-checkbox-group">
                <input 
                  type="checkbox" 
                  id="enviar-email" 
                  checked={enviarEmail} 
                  onChange={(e) => setEnviarEmail(e.target.checked)} 
                />
                <label htmlFor="enviar-email">
                  Enviar correo de confirmación al cliente automáticamente usando EmailJS.
                </label>
              </div>

              <div className="form-actions-admin">
                <button 
                  type="submit" 
                  className="btn-submit-admin-booking"
                  disabled={savingAdminBooking}
                >
                  {savingAdminBooking ? (
                    <span className="spinner-btn-wrapper">
                      <span className="admin-spinner-btn"></span> Guardando reserva...
                    </span>
                  ) : "Agendar Cita"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: COMPROBANTE COMPLETO */}
      {selectedVoucher && (
        <div className="voucher-modal-overlay" onClick={() => setSelectedVoucher(null)}>
          <div className="voucher-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="btn-modal-close" onClick={() => setSelectedVoucher(null)}>
              <FaTimes />
            </button>
            <div className="modal-img-container">
              <img src={selectedVoucher} alt="Comprobante completo" className="modal-img" />
            </div>
            <a href={selectedVoucher} target="_blank" rel="noopener noreferrer" className="btn-modal-download">
              Abrir en nueva pestaña
            </a>
          </div>
        </div>
      )}

      {/* MODAL: HISTORIAL DEL CLIENTE SELECCIONADO */}
      {selectedClient && (
        <div className="history-modal-overlay" onClick={() => setSelectedClient(null)}>
          <div className="history-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="btn-modal-close" onClick={() => setSelectedClient(null)}>
              <FaTimes />
            </button>
            
            <div className="history-modal-header">
              <div className="client-large-avatar">
                {selectedClient.nombre.substring(0, 2).toUpperCase()}
              </div>
              <h3 className="history-modal-title">{selectedClient.nombre}</h3>
              <p className="history-modal-subtitle">Historial de Visitas y Reservas</p>
              
              <div className="client-contact-row">
                <span>📱 {selectedClient.celular}</span>
                {selectedClient.email && <span style={{ textTransform: 'none' }}>✉️ {selectedClient.email}</span>}
              </div>
            </div>

            <div className="history-stats-summary">
              <div className="stat-box">
                <span className="num">{selectedClient.totalCitas}</span>
                <span className="lbl">Citas Totales</span>
              </div>
              <div className="stat-box approved">
                <span className="num">{selectedClient.citasAprobadas}</span>
                <span className="lbl">Aprobadas</span>
              </div>
              <div className="stat-box pending">
                <span className="num">{selectedClient.citasPendientes}</span>
                <span className="lbl">Pendientes</span>
              </div>
              <div className="stat-box cancelled">
                <span className="num">{selectedClient.citasCanceladas}</span>
                <span className="lbl">Canceladas</span>
              </div>
            </div>

            <h4 className="modal-list-title">Listado Cronológico de Citas</h4>
            <div className="modal-bookings-list-container">
              {selectedClient.historial.map((reserva) => (
                <div key={reserva.id} className="modal-booking-row">
                  <div className="row-date-info">
                    <span className="date">📅 {reserva.fecha_cita}</span>
                    <span className="time"><FaClock /> {reserva.hora_cita}</span>
                  </div>
                  <div className="row-code-info">
                    <span className="code">Código: {reserva.codigo || 'S/C'}</span>
                    <span className="details-text" style={{ fontSize: '0.75rem', color: '#666666' }}>
                      {reserva.nombre.includes('Ref:') ? reserva.nombre.split(' - ').slice(0, 2).join(' - ') : 'Agendamiento directo'}
                    </span>
                  </div>
                  <div className="row-status-info">
                    <span className={`status-pill ${reserva.estado || 'pending'}`}>
                      {reserva.estado === 'approved' ? 'Aprobado' : reserva.estado === 'cancelled' ? 'Cancelado' : 'Pendiente'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
