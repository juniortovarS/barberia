import React, { Suspense, lazy, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import Navbar from "./components/Navbar";
import Section1 from "./components/section1";
import Section2 from "./components/section2";
import Section3 from "./components/section3";
import Reseñas from "./components/Reseña";
import Footer from "./components/Footer";
import StickyBanner from "./components/StickyBanner";
import Servicio from "./components/Servicio";
import ClubFidelidad from "./components/ClubFidelidad";
import WhatsAppFlotante from "./components/WhatsAppFlotante";

import { CarritoProvider } from "./components/CarritoContext";
import { AuthProvider } from "./components/AuthContext";
import { TemaProvider } from "./components/TemaContext";
import "./styles/TemaClaro.css";
import ProtectedRoute from "./components/ProtectedRoute";

import citaBg from "./assets/cita.webp";

// 🚀 Cada página se descarga solo cuando el usuario la visita (la portada carga mucho más rápido)
const Cita = lazy(() => import("./pages/Cita"));
const Contacto = lazy(() => import("./pages/Contacto"));
const PaginaServicios = lazy(() => import("./pages/Servicios"));
const Blog = lazy(() => import("./pages/Blog"));
const Tienda = lazy(() => import("./pages/Tienda"));
const Carrito = lazy(() => import("./pages/Carrito"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Confirmacion = lazy(() => import("./pages/Confirmacion"));
const Admin = lazy(() => import("./pages/Admin"));
const Perfil = lazy(() => import("./pages/Perfil"));

const CargandoPagina = () => (
  <div className="page-loader" aria-label="Cargando">
    <span className="page-loader-bar" />
  </div>
);

function App() {
  const location = useLocation();

  useEffect(() => {
    // Precarga en segundo plano del fondo de reservas y del código de esa página
    const img = new Image();
    img.src = citaBg;
    const t = setTimeout(() => { import("./pages/Cita"); }, 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    // 🚀 Animaciones al hacer scroll: cada elemento se anima una sola vez y deja de observarse
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("active");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.05, rootMargin: "0px 0px -40px 0px" }
    );

    // Las páginas se cargan de forma diferida: se vuelven a buscar elementos cuando aparecen
    const observarNuevos = () => {
      document.querySelectorAll(".reveal:not(.active):not([data-reveal])").forEach((el) => {
        el.setAttribute("data-reveal", "");
        observer.observe(el);
      });
    };
    observarNuevos();
    let frame = null;
    const mutation = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = null; observarNuevos(); });
    });
    mutation.observe(document.getElementById("root"), { childList: true, subtree: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      mutation.disconnect();
    };
  }, [location.pathname]);

  return (
    <TemaProvider>
    <AuthProvider>
      <CarritoProvider>
        <Navbar />

        <Suspense fallback={<CargandoPagina />}>
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
                  <ClubFidelidad />
                  <Reseñas />
                  <Footer />
                </>
              }
            />

            {/* PÁGINAS */}
            <Route path="/cita" element={<Cita />} />
            <Route path="/servicios" element={<PaginaServicios />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/contacto" element={<Contacto />} />
            <Route path="/tienda" element={<Tienda />} />
            <Route path="/carrito" element={<Carrito />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/confirmacion" element={<Confirmacion />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
          </Routes>
        </Suspense>

        {location.pathname !== "/admin" && <WhatsAppFlotante />}
      </CarritoProvider>
    </AuthProvider>
    </TemaProvider>
  );
}

export default App;
