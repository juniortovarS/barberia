import React, { useEffect, useState } from "react";
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
<div key={index} className="section1-overlay-text fade-in-text">
  <p className="text-top">NUEVO CONCEPTO EN BARBERÍAS</p>
  <h1 className="text-main">TU ESTILO COMIENZA AQUÍ</h1>
  <p className="text-bottom">¡Visítanos en cualquiera de nuestras 5 sedes a nivel nacional!</p>

  <div className="section1-button">
    <span className="btn-text">Reserva aquí</span>
    <span className="btn-icon">↗</span>
  </div>
</div>

    </section>
  );
};

export default Section1;


