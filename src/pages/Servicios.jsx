import React from 'react';
import '../styles/Servicios.css';
import Footer from '../components/Footer';

import cu1 from '../assets/cu1.png';
import cu2 from '../assets/cu2.png';
import cu3 from '../assets/cu3.png';
import cu4 from '../assets/cu4.png';
import cu5 from '../assets/cu5.png';
import cu6 from '../assets/cu6.png';

const servicios = [

];

const imagenesConTexto = [
  { img: cu1, texto: 'Degradados al ras' },
  { img: cu2, texto: 'Perfilados nítidos' },
  { img: cu3, texto: 'Aplicación de color' },
  { img: cu4, texto: 'Lavados relajantes' },
  { img: cu5, texto: 'Barbas con estilo' },
  { img: cu6, texto: 'Diseños únicos' },
];

const Servicio = () => {
  return (
    <>
      <div className="servicios-fullscreen">
        <div className="servicios-overlay-text">
          <div className="text-top animate-fade-in-up-1">EXPERIENCIA PREMIUM</div>
          <h1 className="text-main animate-fade-in-up-2">SERVICIOS</h1>
          <p className="text-bottom animate-fade-in-up-3">ENCUENTRA MÁS INFORMACIÓN DE NUESTROS SERVICIOS EXCLUSIVOS PARA TI</p>
        </div>
      </div>

      <div className="servicios-gridy-section">
        <div className="image-grid">
          {imagenesConTexto.map((item, idx) => (
            <div className="grid-img-container reveal scale-in" key={idx} style={{ transitionDelay: `${idx * 0.1}s` }}>
              <img src={item.img} alt={`cu${idx + 1}`} className="grid-img" />
              <div className="overlay-texto">{item.texto}</div>
            </div>
          ))}
        </div>

        <div className="info-text reveal fade-left">
          <h2 className="info-title">Vive una experiencia  única</h2>
          <p className="info-description">
            En nuestra barbería combinamos técnicas tradicionales con las últimas tendencias para ofrecerte un servicio completo y personalizado. <br /><br />
            Cada visita está pensada para brindarte una experiencia única, donde el cuidado, la precisión y el estilo se fusionan. <br /><br />
            💈 Barberos certificados <br />
            💈 Atención sin esperas <br />
            💈 Productos de primera calidad <br />
            💈 Ambientes cómodos y modernos <br /><br />
            Nos especializamos en todo tipo de cortes, afeitados y tratamientos capilares. ¡Ven y transforma tu estilo con nosotros!
          </p>
        </div>
      </div>

      <div className="servicios-grid-container">
        <div className="servicios-grid">
          {servicios.map((servicio, index) => (
            <div className="servicio-card" key={index}>
              <div className="servicio-icon">{servicio.icono}</div>
              <h2>{servicio.titulo}</h2>
              <p>{servicio.descripcion}</p>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </>
  );
};

export default Servicio;
