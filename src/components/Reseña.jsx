import React, { useState, useEffect, useCallback } from 'react';
import '../styles/Reseña.css';

import rese1 from '../assets/rese1.png';
import rese2 from '../assets/rese2.png';
import rese3 from '../assets/rese3.png';
import ScissorTransition from './ScissorTransition';

const testimonios = [
  {
    img: rese1,
    texto: "Me encantó el servicio, los barberos muy profesionales y atentos.",
    nombre: "Junior Tovar",
    cargo: "Cliente de barbería",
  },
  {
    img: rese2,
    texto: "Gran experiencia, el corte fue justo lo que quería.",
    nombre: "Luis Herrera",
    cargo: "Cliente de barbería",
  },
  {
    img: rese3,
    texto: "Ambiente moderno, atención de primera. 100% recomendado.",
    nombre: "Carlos Ramírez",
    cargo: "Cliente de barbería",
  },
];

const Reseñas = () => {
  const [index, setIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState(null);
  const [animando, setAnimando] = useState(false);

  const cambiarReseña = useCallback((nuevoIndex) => {
    if (animando || nuevoIndex === index) return;
    setPrevIndex(index);
    setIndex(nuevoIndex);
    setAnimando(true);

    setTimeout(() => {
      setAnimando(false);
      setPrevIndex(null);
    }, 2000); // 2000ms matches the 60 frames @ 30fps Player composition duration
  }, [animando, index]);

  useEffect(() => {
    const interval = setInterval(() => {
      const next = (index + 1) % testimonios.length;
      cambiarReseña(next);
    }, 5000);
    return () => clearInterval(interval);
  }, [index, cambiarReseña]);

  const actual = testimonios[index];

  return (
    <section className="reseñas-container">
      <h2 className="reseñas-titulo reveal fade-up">RESEÑAS DE CLIENTES</h2>

      <div className="reseñas-wrapper">
        {/* Old review card (rendered below) */}
        {prevIndex !== null && (
          <div className="reseña-card old-card">
            <img src={testimonios[prevIndex].img} alt={testimonios[prevIndex].nombre} className="reseña-img" />
            <p className="reseña-texto">"{testimonios[prevIndex].texto}"</p>
            <p className="reseña-nombre">{testimonios[prevIndex].nombre}</p>
            <p className="reseña-cargo">{testimonios[prevIndex].cargo}</p>
          </div>
        )}

        {/* Current / New review card (rendered on top, with clip-path wipe animation) */}
        <div className={`reseña-card ${animando ? 'new-card-animating' : ''}`}>
          <img src={actual.img} alt={actual.nombre} className="reseña-img" />
          <p className="reseña-texto">"{actual.texto}"</p>
          <p className="reseña-nombre">{actual.nombre}</p>
          <p className="reseña-cargo">{actual.cargo}</p>
        </div>
      </div>

      {/* Static dots navigation (outside the wrapper to prevent clipping/clashing during wipe) */}
      <div className="reseña-dots">
        {testimonios.map((_, i) => (
          <span
            key={i}
            className={i === index ? 'active' : ''}
            onClick={() => cambiarReseña(i)}
          ></span>
        ))}
      </div>

      <ScissorTransition play={animando} />
    </section>
  );
};

export default Reseñas;
