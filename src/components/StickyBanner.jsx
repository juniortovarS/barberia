import React, { useEffect, useState } from 'react';
import '../styles/StickyBanner.css';

const StickyBanner = () => {
  const [mostrarBanner, setMostrarBanner] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMostrarBanner(true);
    }, 70000); // 10s delay

    return () => clearTimeout(timer);
  }, []);

  if (!mostrarBanner) return null;

  const mensaje = `💈 ¡Transforma tu estilo con nosotros — la barbería más pro de la ciudad! Aprovecha el 15% de descuento en cortes premium, diseños únicos, afeitados clásicos, limpieza facial y mucho más. Atención personalizada, ambiente urbano, resultados de lujo. ¡Agenda ahora y no dejes pasar esta oportunidad! 💈`;

  return (
    <div className="sticky-banner-wrapper mostrar">
      <div className="sticky-banner">
        <div className="slider-wrapper">
          <div className="banner-contenido">
            <span className="texto-banner">{mensaje}</span>
            <span className="texto-banner">{mensaje}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StickyBanner;
