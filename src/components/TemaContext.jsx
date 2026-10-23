import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

// 🌗 Modo día / noche. Se guarda en el navegador del visitante; el panel admin siempre va en modo noche.
const CLAVE = 'tema';
const TemaContext = createContext({ tema: 'oscuro', alternarTema: () => {} });

const temaGuardado = () => {
  try {
    const t = localStorage.getItem(CLAVE);
    if (t === 'claro' || t === 'oscuro') return t;
  } catch { /* sin almacenamiento */ }
  return 'oscuro';
};

export const TemaProvider = ({ children }) => {
  const [tema, setTema] = useState(temaGuardado);
  const { pathname } = useLocation();
  const efectivo = pathname.startsWith('/admin') ? 'oscuro' : tema;

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.setAttribute('data-tema', efectivo);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', efectivo === 'claro' ? '#f6f3ee' : '#050506');
  }, [efectivo]);

  const alternarTema = () => {
    // Transición suave solo durante el cambio (no afecta el rendimiento al navegar)
    document.documentElement.classList.add('tema-transicion');
    setTimeout(() => document.documentElement.classList.remove('tema-transicion'), 450);
    setTema((t) => {
      const nuevo = t === 'claro' ? 'oscuro' : 'claro';
      try { localStorage.setItem(CLAVE, nuevo); } catch { /* sin almacenamiento */ }
      return nuevo;
    });
  };

  return (
    <TemaContext.Provider value={{ tema: efectivo, alternarTema, enAdmin: pathname.startsWith('/admin') }}>
      {children}
    </TemaContext.Provider>
  );
};

export const useTema = () => useContext(TemaContext);
