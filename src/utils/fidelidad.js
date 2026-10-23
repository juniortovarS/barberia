import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '../config';
import { supabase } from '../supabaseClient';
import { useAuth } from '../components/AuthContext';

// Niveles del Club (el backend es quien decide el descuento real; esto es solo para mostrar)
export const NIVELES_FIDELIDAD = [
  { nombre: 'Clásico', minimo: 0, descuento: 0 },
  { nombre: 'Plata', minimo: 5, descuento: 10 },
  { nombre: 'Oro', minimo: 10, descuento: 15 },
  { nombre: 'Black', minimo: 20, descuento: 20 },
];

export const progresoNivel = ({ reservas, siguiente }) => {
  if (!siguiente) return 100;
  const actual = [...NIVELES_FIDELIDAD].reverse().find((n) => reservas >= n.minimo);
  const tramo = siguiente.minimo - actual.minimo;
  return Math.round(((reservas - actual.minimo) / tramo) * 100);
};

// Cabecera con la sesión del usuario para que el backend lo identifique
export const cabeceraSesion = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
};

// Nivel de fidelidad del usuario logueado (null si no hay sesión)
export const useFidelidad = () => {
  const { user } = useAuth();
  const [fidelidad, setFidelidad] = useState(null);
  const [cargando, setCargando] = useState(false);

  const recargar = useCallback(async () => {
    if (!user) {
      setFidelidad(null);
      return;
    }
    setCargando(true);
    try {
      const res = await fetch(`${API_URL}/fidelidad`, { headers: await cabeceraSesion() });
      setFidelidad(res.ok ? await res.json() : null);
    } catch {
      setFidelidad(null);
    } finally {
      setCargando(false);
    }
  }, [user]);

  useEffect(() => { recargar(); }, [recargar]);

  return { fidelidad, setFidelidad, cargando, recargar };
};

// Abre el modal de registro / inicio de sesión del Navbar desde cualquier parte de la web
export const abrirRegistro = (registro = true) => {
  window.dispatchEvent(new CustomEvent('abrir-auth', { detail: { registro } }));
};
