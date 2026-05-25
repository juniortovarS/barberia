import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/section1.css";
import studio1 from "../assets/studio1.png";
import studio2 from "../assets/studio2.png";
import studio3 from "../assets/studio3.png";

const images = [studio1, studio2, studio3];

const Section1 = () => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const goToSlide = (i) => {
    setIndex(i);
  };

  return (
    <section className="section1-fullscreen">
      {/* Fondo con transición */}
      {images.map((img, i) => (
        <div
          key={i}
          className={`section1-slide ${i === index ? "active" : ""}`}
          style={{ backgroundImage: `url(${img})` }}
        ></div>
      ))}

      {/* Puntos de navegación */}
      <div className="section1-dots">
        {images.map((_, i) => (
          <div
            key={i}
            className={`section1-dot ${i === index ? "active" : ""}`}
            onClick={() => goToSlide(i)}
          ></div>
        ))}
      </div>
      {/* Texto con aparición progresiva */}
      <div key={index} className="section1-overlay-text">
        <p className="text-top animate-fade-in-up-1">NUEVO CONCEPTO EN BARBERÍAS</p>
        <h1 className="text-main animate-fade-in-up-2">TU ESTILO COMIENZA AQUÍ</h1>
        <p className="text-bottom animate-fade-in-up-3">¡Visítanos en cualquiera de nuestras 5 sedes a nivel nacional!</p>

        <Link to="/cita" className="section1-button animate-fade-in-up-4" style={{ textDecoration: 'none' }}>
          <span className="btn-text">Reservar Cita</span>
          <span className="btn-icon">↗</span>
        </Link>
      </div>

    </section>
  );
};

export default Section1;


