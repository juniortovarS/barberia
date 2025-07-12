import React from "react";
import { Routes, Route } from "react-router-dom";

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

function App() {
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
