import React, { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import Navbar from "./components/Navbar";
import Section1 from "./components/section1";
import Section2 from "./components/section2";
import Section3 from "./components/section3";
import Reseñas from "./components/Reseña";
import Footer from "./components/Footer";
import StickyBanner from "./components/StickyBanner";


import Contacto from './pages/Contacto'; 
import Cita from "./pages/Cita";
import Servicio from "./components/Servicio";
import PaginaServicios from "./pages/Servicios";
import Blog from "./pages/Blog";
import Tienda from "./pages/Tienda";
import Carrito from "./pages/Carrito"; // ✅ NUEVA PÁGINA CARRITO
import Checkout from "./pages/Checkout"; // importa tu página
import Confirmacion from "./pages/Confirmacion";

import { CarritoProvider } from "./components/CarritoContext";

// Import assets to preload
import citaBg from "./assets/cita.png";
import serviciosBg from "./assets/imgSer.png";
import studio1 from "./assets/studio1.png";
import studio2 from "./assets/studio2.png";
import studio3 from "./assets/studio3.png";

function App() {
  const location = useLocation();

  useEffect(() => {
    // 🚀 Background Preloading of large images to eliminate lag on page changes
    const imagesToPreload = [citaBg, serviciosBg, studio1, studio2, studio3];
    imagesToPreload.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  useEffect(() => {
    // 🚀 Re-bind scroll reveal elements whenever route changes
    const revealElements = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("active");
          } else {
            entry.target.classList.remove("active");
          }
        });
      },
      { threshold: 0.05 }
    );
    
    revealElements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [location]);
  return (
    <CarritoProvider>
      <Navbar />

      <Routes>
        {/* HOME */}
        <Route
          path="/"
          element={
            <>
              <StickyBanner />
              <Section1 />
              <Section2 />
              <Section3 />
              <Servicio />
              <Reseñas />
              <Footer />
            </>
          }
        />

        {/* PÁGINAS EXTERNAS */}
        <Route path="/cita" element={<Cita />} />
        <Route path="/servicios" element={<PaginaServicios />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/contacto" element={<Contacto />} />
        <Route path="/tienda" element={<Tienda />} />
        <Route path="/carrito" element={<Carrito />} /> {/* ✅ AÑADIDA RUTA */}
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/confirmacion" element={<Confirmacion />} />
      </Routes>
    </CarritoProvider>
  );
}

export default App;
