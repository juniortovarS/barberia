import React, { useEffect, useRef, useState } from "react";
import "../styles/section2.css";
import video1 from "../assets/video1.mp4";
import video2 from "../assets/video2.mp4";
import video3 from "../assets/video3.mp4";

import Typewriter from "./Typewriter";

const videos = [video1, video2, video3];

const Section2 = () => {
  const sectionRef = useRef();
  const containerRef = useRef();
  const videoRefs = useRef([]);
  const [visible, setVisible] = useState(false);
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
      { threshold: 0.1 }
    );

    if (node) observer.observe(node);
    return () => {
      if (node) observer.unobserve(node);
    };
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

    // En celular, si termina, deslizar el scroll automáticamente
    if (window.innerWidth <= 768 && containerRef.current) {
      const container = containerRef.current;
      const cardWidth = container.scrollWidth / videos.length;
      container.scrollTo({ left: next * cardWidth, behavior: "smooth" });
    }

    videoRefs.current.forEach((video, i) => {
      if (video) {
        if (i === next) {
          video.currentTime = 0;
          video.muted = true;
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    });
  };

  // Detectar scroll horizontal en celular para pausar/reproducir
  const handleScroll = () => {
    if (!containerRef.current || window.innerWidth > 768) return;
    const container = containerRef.current;
    const scrollLeft = container.scrollLeft;
    const cardWidth = container.scrollWidth / videos.length;
    const newIdx = Math.round(scrollLeft / cardWidth);

    if (newIdx !== currentIndex && newIdx >= 0 && newIdx < videos.length) {
      setCurrentIndex(newIdx);
      videoRefs.current.forEach((video, i) => {
        if (video) {
          if (i === newIdx) {
            video.muted = true;
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        }
      });
    }
  };

  // Reproducir video al pasar el mouse
  const handleMouseEnter = (index) => {
    if (window.innerWidth <= 768) return;
    setCurrentIndex(index);

    videoRefs.current.forEach((video, i) => {
      if (video) {
        if (i === index) {
          video.muted = true;
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    });
  };

  const handleMouseLeave = (index) => {
    if (window.innerWidth <= 768) return;
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
      <div className="video-section-mobile-wrapper">
        <div 
          ref={containerRef}
          className="floating-videos"
          onScroll={handleScroll}
        >
          {videos.map((src, i) => (
            <div
              key={i}
              className={`video-wrapper fade-in-delay-${i} ${i === currentIndex ? "active-slide" : ""}`}
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

        {/* Puntos de navegación para celular */}
        <div className="section2-mobile-dots">
          {videos.map((_, i) => (
            <span
              key={i}
              className={`mobile-dot ${i === currentIndex ? "active" : ""}`}
              onClick={() => {
                if (containerRef.current) {
                  const container = containerRef.current;
                  const cardWidth = container.scrollWidth / videos.length;
                  container.scrollTo({ left: i * cardWidth, behavior: "smooth" });
                }
              }}
            />
          ))}
        </div>
      </div>

      <div className="section2-text reveal fade-right">
        <h2><Typewriter text="Lo que comenzó con esfuerzo, hoy se transforma en excelencia." /></h2>
        <p className="reveal fade-up" style={{ transitionDelay: '0.3s' }}>
          Empezamos desde cero, con una silla, unas tijeras y el sueño de construir algo grande. Con esfuerzo, dedicación y una pasión auténtica por el arte de la barbería, fuimos ganándonos la confianza de cada cliente que cruzaba nuestra puerta. Hoy, ese pequeño puesto se ha transformado en una barbería completamente remodelada, moderna y profesional, sin perder la esencia que nos vio nacer.
        </p>
      </div>
    </section>
  );
};

export default Section2;
