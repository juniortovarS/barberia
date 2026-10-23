import React from 'react';
import { FaSun, FaMoon } from 'react-icons/fa';
import { useTema } from './TemaContext';

const estilos = `
.tema-toggle {
  position: relative;
  width: 58px;
  height: 30px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.35s ease, border-color 0.35s ease;
}
.tema-toggle:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
.tema-toggle-icono {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.72rem;
  transition: opacity 0.3s ease;
  display: flex;
}
.tema-toggle-icono.sol { left: 9px; color: #f5b83d; }
.tema-toggle-icono.luna { right: 9px; color: #cfd6ff; }
.tema-toggle-perilla {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  transform: translateX(28px);
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.35s ease;
  display: grid;
  place-items: center;
  font-size: 0.7rem;
  color: #1a1a2e;
}
.tema-toggle.claro {
  background: #fff4dc;
  border-color: rgba(245, 184, 61, 0.55);
}
.tema-toggle.claro .tema-toggle-perilla {
  transform: translateX(0);
  background: #f5b83d;
  color: #ffffff;
}
.tema-toggle.claro .tema-toggle-icono.sol { opacity: 0; }
.tema-toggle:not(.claro) .tema-toggle-icono.luna { opacity: 0; }
`;

const TemaToggle = ({ className = '' }) => {
  const { tema, alternarTema, enAdmin } = useTema();
  if (enAdmin) return null;
  const claro = tema === 'claro';
  return (
    <>
      <style>{estilos}</style>
      <button
        type="button"
        className={`tema-toggle ${claro ? 'claro' : ''} ${className}`}
        onClick={alternarTema}
        role="switch"
        aria-checked={claro}
        aria-label={claro ? 'Cambiar a modo noche' : 'Cambiar a modo día'}
        title={claro ? 'Modo noche' : 'Modo día'}
      >
        <span className="tema-toggle-icono sol"><FaSun /></span>
        <span className="tema-toggle-icono luna"><FaMoon /></span>
        <span className="tema-toggle-perilla">{claro ? <FaSun /> : <FaMoon />}</span>
      </button>
    </>
  );
};

export default TemaToggle;
