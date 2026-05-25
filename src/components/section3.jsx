import React, { useEffect, useRef, useState } from "react";
import "../styles/section3.css";
import video4 from "../assets/video4.mp4";
import video5 from "../assets/video5.mp4";
import video6 from "../assets/video6.mp4";

import Typewriter from "./Typewriter";

const videos = [video4, video5, video6];

const Section3 = () => {
  const sectionRef = useRef();
  const containerRef = useRef();
  const videoRefs = useRef([]);
  const [visible, setVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const sectionElement = sectionRef.current;
    if (!sectionElement) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVisible = entry.isIntersecting;
        setVisible(isVisible);
        if (!isVisible) {
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

    observer.observe(sectionElement);
    return () => {
      observer.unobserve(sectionElement);
    };
  }, []);

  useEffect(() => {
    if (visible && videoRefs.current[0]) {
      const video = videoRefs.current[0];
      video.muted = true;
      video.play().catch(() => {});
    }
  }, [visible]);

  const handleEnded = (index) => {
    const next = (index + 1) % videos.length;
    setCurrentIndex(next);

    // En celular, deslizar al siguiente video
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

  // Detectar scroll horizontal en celular
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
    <section ref={sectionRef} className={`section3-container ${visible ? "show" : ""}`}>
      {/* TEXTO A LA IZQUIERDA */}
      <div className="section3-text reveal fade-left">
        <h2><Typewriter text="   El arte del corte clásico y moderno en constante evolución." /></h2>
        <p className="reveal fade-up" style={{ transitionDelay: '0.3s' }}>
          Nuestro equipo de barberos profesionales combina años de experiencia con las técnicas más vanguardistas de la moda urbana. En cada degradado, afeitado clásico y perfilado, buscamos no solo la perfección técnica, sino una experiencia personalizada de cuidado y relajación. No cortamos cabello; esculpimos tu identidad.
        </p> 
      </div>

      {/* VIDEOS A LA DERECHA — swipeable en celular */}
      <div className="video-section-mobile-wrapper-s3">
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
        <div className="section3-mobile-dots">
          {videos.map((_, i) => (
            <span
              key={i}
              className={`s3-mobile-dot ${i === currentIndex ? "active" : ""}`}
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
    </section>
  );
};

export default Section3;
