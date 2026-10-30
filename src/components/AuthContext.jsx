import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { ADMIN_EMAILS, SITIO_URL } from '../config';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [recuperandoClave, setRecuperandoClave] = useState(false);

  useEffect(() => {
    // Obtener sesión actual al cargar
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      checkAdminStatus(currentUser);
      setLoading(false);
    });

    // Escuchar cambios en el estado de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // El usuario llegó desde el enlace de "recuperar contraseña" del correo
      if (event === 'PASSWORD_RECOVERY') {
        setRecuperandoClave(true);
      }
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      checkAdminStatus(currentUser);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkAdminStatus = (u) => {
    if (!u) {
      setIsAdmin(false);
      return;
    }
    // Solo controla qué se muestra en pantalla: la protección real está en el backend y en las políticas RLS de Supabase.
    // app_metadata solo se puede modificar desde el servidor (user_metadata lo puede editar cualquier usuario).
    const email = (u.email || '').toLowerCase();
    const isUserAdmin = u.app_metadata?.role === 'admin' || ADMIN_EMAILS.includes(email);

    setIsAdmin(isUserAdmin);
  };

  // Función para registrarse
  const signup = async (email, password, nombre) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nombre: nombre
          },
          // El enlace de confirmación del correo lleva a la web real
          emailRedirectTo: SITIO_URL
        }
      });
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Error al registrarse:", error.message);
      return { success: false, error: error.message };
    }
  };

  // Función para iniciar sesión
  const login = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Error al iniciar sesión:", error.message);
      return { success: false, error: error.message };
    }
  };

  // Función para cerrar sesión
  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setSession(null);
      setIsAdmin(false);
      return { success: true };
    } catch (error) {
      console.error("Error al cerrar sesión:", error.message);
      return { success: false, error: error.message };
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, login, signup, logout, recuperandoClave, setRecuperandoClave }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
