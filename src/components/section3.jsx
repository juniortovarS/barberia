import React, { useEffect, useRef, useState } from "react";
import "../styles/section3.css";
import video4 from "../assets/video4.mp4";
import video5 from "../assets/video5.mp4";
import video6 from "../assets/video6.mp4";

import Typewriter from "./Typewriter";

const videos = [video4, video5, video6];

const Section3 = () => {
  const sectionRef = useRef();
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
    observer.unobserve(sectionElement); // ⚠️ Usamos la variable local
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

  const handleMouseEnter = (index) => {
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
    const video = videoRefs.current[index];
    if (video && currentIndex !== index) {
      video.pause();
    }
  };

  return (
    <section ref={sectionRef} className={`section3-container ${visible ? "show" : ""}`}>
      {/* TEXTO A LA IZQUIERDA */}
      <div className="section3-text reveal fade-left">
        <h2><Typewriter text="El arte del corte clásico y moderno en constante evolución." /></h2>
        <p className="reveal fade-up" style={{ transitionDelay: '0.3s' }}>
          Nuestro equipo de barberos profesionales combina años de experiencia con las técnicas más vanguardistas de la moda urbana. En cada degradado, afeitado clásico y perfilado, buscamos no solo la perfección técnica, sino una experiencia personalizada de cuidado y relajación. No cortamos cabello; esculpimos tu identidad.
        </p>
      </div>

      {/* VIDEOS A LA DERECHA */}
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
    </section>
  );
};

export default Section3;
