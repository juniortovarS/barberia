import React, { useState } from 'react';
import { FaPhone, FaLock } from 'react-icons/fa';
import '../styles/PagoYape.css';
import { generarTokenYape } from '../utils/yape';
import { soles } from '../utils/servicios';

// Formulario de pago con Yape (celular + código de aprobación).
// `onPagar(tokenId, celular)` debe hacer el cobro en el backend y lanzar un Error si falla.
const PagoYape = ({ monto, onPagar, textoBoton, compacto = false }) => {
  const [celular, setCelular] = useState('');
  const [otp, setOtp] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const listo = celular.length === 9 && otp.length === 6 && !cargando;

  const pagar = async (e) => {
    e.preventDefault();
    if (!listo) return;
    setError('');
    setCargando(true);
    try {
      const tokenId = await generarTokenYape(celular, otp);
      await onPagar(tokenId, celular);
    } catch (err) {
      setError(err.message || 'No se pudo completar el pago.');
      setOtp('');
    } finally {
      setCargando(false);
    }
  };

  return (
    <form className={`pyape ${compacto ? 'compacto' : ''}`} onSubmit={pagar}>
      <div className="pyape-cabecera">
        <span className="pyape-logo">yape</span>
        <span className="pyape-monto">{soles(monto)}</span>
      </div>

      <ol className="pyape-pasos">
        <li>Abre <strong>Yape</strong> → <strong>Código de aprobación</strong>.</li>
        <li>Escribe tu celular y el código de 6 dígitos.</li>
      </ol>

      <label className="pyape-campo">
        <FaPhone />
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="Celular de tu Yape"
          value={celular}
          onChange={(e) => setCelular(e.target.value.replace(/\D/g, '').slice(0, 9))}
          aria-label="Celular de tu Yape"
        />
      </label>

      <label className="pyape-campo">
        <FaLock />
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="Código de aprobación"
          className="pyape-otp"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-label="Código de aprobación"
        />
      </label>

      {error && <p className="pyape-error" role="alert">❌ {error}</p>}

      <button type="submit" className="pyape-boton" disabled={!listo}>
        {cargando ? <span className="pyape-spinner" aria-label="Procesando" /> : (textoBoton || `Pagar ${soles(monto)} con Yape`)}
      </button>
      <p className="pyape-nota">El código dura 2 minutos. El cobro es inmediato.</p>
    </form>
  );
};

export default PagoYape;
