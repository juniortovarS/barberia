import React, { useEffect, useRef, useState } from "react";
import "../styles/section2.css";
import video1 from "../assets/video1.mp4";
import video2 from "../assets/video2.mp4";
import video3 from "../assets/video3.mp4";

const videos = [video1, video2, video3];

const Section2 = () => {
  const sectionRef = useRef();
  const videoRefs = useRef([]);
  const [visible, setVisible] = useState(false);
  const [canPlayWithAudio, setCanPlayWithAudio] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Detectar visibilidad y pausar si se oculta
  useEffect(() => {
    const node = sectionRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVisible = entry.isIntersecting;
        setVisible(isVisible);

        if (!isVisible) {
          // 🔇 Pausar y reiniciar todos los videos al salir de section2
          videoRefs.current.forEach((video) => {
            if (video) {
              video.pause();
              video.currentTime = 0;
              video.muted = true;
            }
          });
          setCurrentIndex(0);
        }
      },
      { threshold: 0.3 }
    );

    if (node) observer.observe(node);
    return () => {
      if (node) observer.unobserve(node);
    };
  }, []);

  // Activar audio después del primer clic del usuario
  useEffect(() => {
    const handleClick = () => {
      setCanPlayWithAudio(true);
      window.removeEventListener("click", handleClick);
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  // Reproducir automáticamente el primer video al entrar
  useEffect(() => {
    if (visible && videoRefs.current[0]) {
      const video = videoRefs.current[0];
      video.muted = true;
      video.play().catch(() => {});
    }
  }, [visible]);

  // Reproducir siguiente video al terminar
  const handleEnded = (index) => {
    const next = (index + 1) % videos.length;
    setCurrentIndex(next);

    videoRefs.current.forEach((video, i) => {
      if (video) {
        if (i === next) {
          video.currentTime = 0;
          video.muted = !canPlayWithAudio;
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    });
  };

  // Reproducir video al pasar el mouse
  const handleMouseEnter = (index) => {
    setCurrentIndex(index);

    videoRefs.current.forEach((video, i) => {
      if (video) {
        if (i === index) {
          video.muted = !canPlayWithAudio;
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    });
  };

  const handleMouseLeave = (index) => {
    const video = videoRefs.current[index];
    if (video && currentIndex !== index) {
      video.pause();
    }
  };

  return (
    <section
      ref={sectionRef}
      className={`section2-container ${visible ? "show" : ""}`}
    >
      <div className="floating-videos">
        {videos.map((src, i) => (
          <div
            key={i}
            className={`video-wrapper fade-in-delay-${i}`}
            onMouseEnter={() => handleMouseEnter(i)}
            onMouseLeave={() => handleMouseLeave(i)}
          >
            <video
              ref={(el) => (videoRefs.current[i] = el)}
              className="video-player"
              src={src}
              muted
              playsInline
              onEnded={() => handleEnded(i)}
              controls={false}
            />
          </div>
        ))}
      </div>

       <div className="section2-text">
  <h2>Lo que comenzó con esfuerzo, hoy se transforma en excelencia.</h2>
  <p>
    Empezamos desde cero, con una silla, unas tijeras y el sueño de construir algo grande. Con esfuerzo, dedicación y una pasión auténtica por el arte de la barbería, fuimos ganándonos la confianza de cada cliente que cruzaba nuestra puerta. Hoy, ese pequeño puesto se ha transformado en una barbería completamente remodelada, moderna y profesional, sin perder la esencia que nos vio nacer.
  </p>
</div>
    </section>
  );
};

export default Section2;
