import React from 'react';
import '../styles/Servicio.css';

import img1 from '../assets/img1.png';
import img2 from '../assets/img2.png';
import img3 from '../assets/img3.png';
import img4 from '../assets/img4.png';
import img5 from '../assets/img5.png';
import img6 from '../assets/img6.png';
import img7 from '../assets/img7.png';
import img8 from '../assets/img8.png';

const Servicio = () => {
  return (
    <section className="section3-container">
      <div className="servicio-collage">
        <h2 className="servicio-titulo">EXPLORA NUESTROS SERVICIOS</h2>
        <p className="servicio-subtitulo">Manos expertas de todo un equipo de barberos</p>

        <div className="servicio-row">
          <div className="servicio-item">
            <img src={img1} alt="img1" className="servicio-img" />
            <div className="servicio-overlay-box">AFEITADO CON NAVAJA</div>
          </div>
          <div className="servicio-item">
            <img src={img2} alt="img2" className="servicio-img" />
            <div className="servicio-overlay-box">TÉCNICAS DE BARBERÍA</div>
          </div>
          <div className="servicio-item">
            <img src={img3} alt="img3" className="servicio-img" />
            <div className="servicio-overlay-box">DISEÑO EN CABELLO</div>
          </div>
          <div className="servicio-item">
            <img src={img4} alt="img4" className="servicio-img" />
            <div className="servicio-overlay-box">BARBERÍA TOP</div>
          </div>
        </div>

        <div className="servicio-row">
          <div className="servicio-item">
            <img src={img5} alt="img5" className="servicio-img" />
            <div className="servicio-overlay-box">AFEITADO ROYAL</div>
          </div>
          <div className="servicio-item">
            <img src={img6} alt="img6" className="servicio-img" />
            <div className="servicio-overlay-box">CORTES MODERNOS</div>
          </div>
          <div className="servicio-item">
            <img src={img7} alt="img7" className="servicio-img" />
            <div className="servicio-overlay-box">CORTES CON DEGRADADOS</div>
          </div>
          <div className="servicio-item">
            <img src={img8} alt="img8" className="servicio-img" />
            <div className="servicio-overlay-box">PERSONALIZA TU ESTILO</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Servicio;
