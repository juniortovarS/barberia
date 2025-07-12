import React from 'react';
import '../styles/Footer.css';
import { FaInstagram, FaFacebookF, FaTiktok, FaMapMarkerAlt, FaPhoneAlt, FaEnvelope } from 'react-icons/fa';


const Footer = () => {
  return (
    <footer className="footer-container">
      <div className="footer-grid">

        {/* Marca */}
        <div className="footer-brand">
          <h3 className="footer-logo">BARBERÍA PRO</h3>
          <p className="footer-desc">
            Estilo, precisión y pasión por el detalle. En Barbería Pro, tu imagen es nuestra prioridad.
          </p>
        </div>

        {/* Enlaces rápidos */}
        <div className="footer-horario">
  <h4>Horarios</h4>
  <ul>
    <li>Lun - Vie: 9:00 AM - 8:00 PM</li>
    <li>Sábados: 9:00 AM - 6:00 PM</li>
    <li>Domingos: Cerrado</li>
  </ul>
</div>


        {/* Contacto */}
        <div className="footer-contact">
          <h4>Contacto</h4>
          <p><FaMapMarkerAlt /> Av. Estilo Urbano 123, Lima</p>
          <p><FaPhoneAlt /> +51 987 654 321</p>
          <p><FaEnvelope /> info@barberiapro.pe</p>
        </div>

        {/* Redes */}
        <div className="footer-social">
          <h4>Síguenos</h4>
  <div className="social-icons">
    <a href="https://instagram.com" target="_blank" rel="noreferrer"><FaInstagram /></a>
    <a href="https://facebook.com" target="_blank" rel="noreferrer"><FaFacebookF /></a>
    <a href="https://tiktok.com" target="_blank" rel="noreferrer"><FaTiktok /></a>
  </div>
        </div>
      </div>

      <div className="footer-bottom">
        <p>&copy; {new Date().getFullYear()} Barbería Pro. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
};

export default Footer;
