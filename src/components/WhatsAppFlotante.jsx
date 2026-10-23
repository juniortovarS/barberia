import React from 'react';
import { FaWhatsapp } from 'react-icons/fa';
import { WHATSAPP_NUMERO } from '../config'; // número configurado en src/config.js

const MENSAJE = '¡Hola! Quisiera información para reservar una cita 💈';

const estilos = `
.wa-flotante {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 900;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #25d366;
  color: #ffffff;
  font-size: 1.75rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.wa-flotante:hover { transform: translateY(-3px) scale(1.04); box-shadow: 0 14px 36px rgba(37, 211, 102, 0.35); }
.wa-flotante:focus-visible { outline: 2px solid #ffffff; outline-offset: 3px; }
.wa-flotante svg { color: #ffffff; }
@media (max-width: 480px) { .wa-flotante { right: 16px; bottom: 16px; width: 52px; height: 52px; } }
`;

const WhatsAppFlotante = () => (
  <>
    <style>{estilos}</style>
    <a
      className="wa-flotante"
      href={`https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(MENSAJE)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
    >
      <FaWhatsapp />
    </a>
  </>
);

export default WhatsAppFlotante;
