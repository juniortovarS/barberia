import React, { useState, useEffect } from 'react';
import '../styles/Reseña.css';

import rese1 from '../assets/rese1.png';
import rese2 from '../assets/rese2.png';
import rese3 from '../assets/rese3.png';
import tijera from '../assets/tijera.svg';

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
  const [animando, setAnimando] = useState(false);
  const [showCard, setShowCard] = useState(true);
  const [key, setKey] = useState(0);

  const cambiarReseña = (nuevoIndex) => {
    setAnimando(true);
    setShowCard(false);
    setKey(prev => prev + 1);

    setTimeout(() => {
      setIndex(nuevoIndex);
      setShowCard(true);
    }, 1100); // más tiempo para que la animación se vea bien

    setTimeout(() => {
      setAnimando(false);
    }, 2500);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const next = (index + 1) % testimonios.length;
      cambiarReseña(next);
    }, 10000);
    return () => clearInterval(interval);
  }, [index]);

  const actual = testimonios[index];

  return (
    <section className={`reseñas-container ${animando ? 'oscuro' : ''}`}>
      {animando && (
        <img
          key={key}
          src={tijera}
          alt="Tijera"
          className="tijera-corte"
        />
      )}

      <h2 className="reseñas-titulo">RESEÑAS DE CLIENTES</h2>

      {showCard && (
        <div className="reseña-card fade-in">
          <img src={actual.img} alt={actual.nombre} className="reseña-img" />
          <p className="reseña-texto">"{actual.texto}"</p>
          <p className="reseña-nombre">{actual.nombre}</p>
          <p className="reseña-cargo">{actual.cargo}</p>

          <div className="reseña-dots">
            {testimonios.map((_, i) => (
              <span
                key={i}
                className={i === index ? 'active' : ''}
                onClick={() => cambiarReseña(i)}
              ></span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default Reseñas;
