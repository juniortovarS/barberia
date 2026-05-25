import React, { useState, useEffect } from 'react';
import { FaCheck, FaTimes, FaCalendarAlt, FaClock, FaUser, FaPhone, FaEye, FaSearch, FaSyncAlt } from 'react-icons/fa';
import '../styles/Admin.css';
import { API_URL } from '../config';

const Admin = () => {
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('all'); // 'all', 'pending', 'approved', 'cancelled'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVoucher, setSelectedVoucher] = useState(null); // URL de la imagen en pantalla completa
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchReservas = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/reservas`);
      if (!response.ok) {
        throw new Error('No se pudieron cargar las reservas');
      }
      const data = await response.json();
      setReservas(data);
    } catch (err) {
      console.error(err);
      setError('Ocurrió un error al cargar las reservas. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservas();
  }, []);

  const handleUpdateEstado = async (id, nuevoEstado) => {
    setActionLoadingId(id);
    try {
      const response = await fetch(`${API_URL}/reservas/${id}/estado`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ estado: nuevoEstado }),
      });

      if (!response.ok) {
        throw new Error('Error al actualizar el estado');
      }

      // Actualizar localmente el estado de la reserva
      setReservas(prev =>
        prev.map(r => r.id === id ? { ...r, estado: nuevoEstado } : r)
      );
    } catch (err) {
      alert('❌ No se pudo actualizar el estado: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filtrar reservas
  const filteredReservas = reservas.filter(reserva => {
    const matchesEstado = filtroEstado === 'all' || reserva.estado === filtroEstado;
    const searchString = `${reserva.nombre} ${reserva.celular} ${reserva.codigo || ''}`.toLowerCase();
    const matchesSearch = searchString.includes(searchTerm.toLowerCase());
    return matchesEstado && matchesSearch;
  });

  return (
    <div className="admin-container">
      {/* Encabezado */}
      <div className="admin-header reveal active">
        <div>
          <h1 className="admin-title">Panel de Citas</h1>
          <p className="admin-subtitle">Administra los comprobantes, estados y reservas de la barbería.</p>
        </div>
        <button className="btn-sync" onClick={fetchReservas} disabled={loading}>
          <FaSyncAlt className={loading ? 'spin' : ''} /> Actualizar
        </button>
      </div>

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

      {/* Contenido Principal */}
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
                  <td>
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
                  <td>
                    <div className="datetime-cell">
                      <span><FaCalendarAlt size={12} className="cell-icon" /> {reserva.fecha_cita}</span>
                      <span className="time-sub"><FaClock size={12} className="cell-icon" /> {reserva.hora_cita}</span>
                    </div>
                  </td>

                  {/* Código Único */}
                  <td>
                    <span className="code-badge">{reserva.codigo || 'S/C'}</span>
                  </td>

                  {/* Comprobante */}
                  <td>
                    {reserva.voucher_url ? (
                      <div className="voucher-cell">
                        <div className="voucher-thumbnail-wrapper">
                          <img src={reserva.voucher_url} alt="Thumbnail voucher" className="voucher-thumb" />
                        </div>
                        <button 
                          className="btn-view-voucher"
                          onClick={() => setSelectedVoucher(reserva.voucher_url)}
                        >
                          <FaEye /> Ver Foto
                        </button>
                      </div>
                    ) : (
                      <span className="no-voucher">Sin Captura</span>
                    )}
                  </td>

                  {/* Estado */}
                  <td>
                    <span className={`status-pill ${reserva.estado || 'pending'}`}>
                      {reserva.estado === 'approved' && 'Aprobado'}
                      {reserva.estado === 'cancelled' && 'Cancelado'}
                      {(reserva.estado === 'pending' || !reserva.estado) && 'Pendiente'}
                    </span>
                  </td>

                  {/* Acciones */}
                  <td>
                    <div className="action-buttons-cell">
                      <button 
                        className="btn-action-approve"
                        onClick={() => handleUpdateEstado(reserva.id, 'approved')}
                        disabled={reserva.estado === 'approved' || actionLoadingId === reserva.id}
                        title="Aprobar Pago"
                      >
                        <FaCheck />
                      </button>
                      <button 
                        className="btn-action-cancel"
                        onClick={() => handleUpdateEstado(reserva.id, 'cancelled')}
                        disabled={reserva.estado === 'cancelled' || actionLoadingId === reserva.id}
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

      {/* Modal para ver comprobante en pantalla completa */}
      {selectedVoucher && (
        <div className="voucher-modal-overlay" onClick={() => setSelectedVoucher(null)}>
          <div className="voucher-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="btn-modal-close" onClick={() => setSelectedVoucher(null)}>
              <FaTimes />
            </button>
            <div className="modal-img-container">
              <img src={selectedVoucher} alt="Comprobante en tamaño completo" className="modal-img" />
            </div>
            <a href={selectedVoucher} target="_blank" rel="noopener noreferrer" className="btn-modal-download">
              Abrir en nueva pestaña
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
