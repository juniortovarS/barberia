import React, { useRef, useState } from 'react';
import { FaCopy, FaCheck, FaCamera, FaQrcode, FaHashtag, FaShieldAlt, FaSyncAlt } from 'react-icons/fa';
import '../styles/PagoYapeManual.css';
import { soles } from '../utils/servicios';
import { comprimirImagen, formatoCelular } from '../utils/yapeManual';

// Yape directo: el cliente yapea al número de la barbería, sube la captura y escribe el Nº de operación.
// Es un componente controlado: el formulario padre envía `comprobante` (data URL) y `operacion`.
const PagoYapeManual = ({ monto, yape, comprobante, onComprobante, operacion, onOperacion, deshabilitado }) => {
  const [copiado, setCopiado] = useState(false);
  const [verQr, setVerQr] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [errorImagen, setErrorImagen] = useState('');
  const inputRef = useRef(null);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(yape.numero);
    } catch {
      // Navegadores sin portapapeles: se selecciona el número para copiarlo a mano
      window.prompt('Copia el número de Yape:', yape.numero);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const elegirImagen = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setErrorImagen('');
    setProcesando(true);
    try {
      onComprobante(await comprimirImagen(archivo));
    } catch (err) {
      setErrorImagen(err.message);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="ymanual">
      <div className="ymanual-cabecera">
        <span className="yape-logo">yape</span>
        <span className="ymanual-monto">{soles(monto)}</span>
      </div>

      {/* Paso 1: yapear */}
      <div className="ymanual-paso">
        <span className="ymanual-num">1</span>
        <div className="ymanual-cuerpo">
          <p className="ymanual-titulo">Yapea <strong>{soles(monto)}</strong> a</p>
          <div className="ymanual-destino">
            <div>
              <span className="ymanual-celular">{formatoCelular(yape.numero)}</span>
              <span className="ymanual-titular">{yape.titular}</span>
            </div>
            <button type="button" className={`ymanual-copiar ${copiado ? 'ok' : ''}`} onClick={copiar}>
              {copiado ? <><FaCheck /> Copiado</> : <><FaCopy /> Copiar</>}
            </button>
          </div>
          {yape.qr && (
            <>
              <button type="button" className="ymanual-link" onClick={() => setVerQr((v) => !v)}>
                <FaQrcode /> {verQr ? 'Ocultar QR' : 'Prefiero escanear el QR'}
              </button>
              {verQr && <img className="ymanual-qr" src={yape.qr} alt={`QR de Yape de ${yape.titular}`} />}
            </>
          )}
        </div>
      </div>

      {/* Paso 2: captura */}
      <div className="ymanual-paso">
        <span className="ymanual-num">2</span>
        <div className="ymanual-cuerpo">
          <p className="ymanual-titulo">Sube la captura de la constancia</p>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={elegirImagen} disabled={deshabilitado} />
          {comprobante ? (
            <div className="ymanual-preview">
              <img src={comprobante} alt="Captura de tu Yape" />
              <button type="button" className="ymanual-link" onClick={() => inputRef.current?.click()} disabled={deshabilitado}>
                <FaSyncAlt /> Cambiar imagen
              </button>
            </div>
          ) : (
            <button type="button" className="ymanual-subir" onClick={() => inputRef.current?.click()} disabled={procesando || deshabilitado}>
              {procesando ? <span className="ymanual-spinner" aria-label="Procesando imagen" /> : <FaCamera />}
              <span>{procesando ? 'Preparando imagen…' : 'Elegir captura'}</span>
              <small>JPG o PNG · se ve el monto y el Nº de operación</small>
            </button>
          )}
          {errorImagen && <p className="ymanual-error" role="alert">{errorImagen}</p>}
        </div>
      </div>

      {/* Paso 3: Nº de operación */}
      <div className="ymanual-paso">
        <span className="ymanual-num">3</span>
        <div className="ymanual-cuerpo">
          <p className="ymanual-titulo">Nº de operación</p>
          <label className="ymanual-campo">
            <FaHashtag />
            <input
              type="text"
              inputMode="numeric"
              placeholder="Lo encuentras en la constancia"
              value={operacion}
              onChange={(e) => onOperacion(e.target.value.replace(/[^0-9a-zA-Z]/g, '').slice(0, 20))}
              disabled={deshabilitado}
              aria-label="Número de operación de Yape"
            />
          </label>
        </div>
      </div>

      <p className="ymanual-nota">
        <FaShieldAlt /> Tu horario queda separado mientras verificamos tu pago. Esta pantalla te avisa en cuanto lo confirmemos y te llegará un correo con tu cita.
      </p>
    </div>
  );
};

export default PagoYapeManual;
