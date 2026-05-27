import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
    // Determinar si es admin por rol en metadatos, correo exacto o formato de correo
    const userRole = u.user_metadata?.role;
    const email = u.email || '';
    const isUserAdmin = 
      userRole === 'admin' || 
      email === 'juniortovaradmin@gmail.com' ||
      email === 'juniortovar601@gmail.com' ||
      email.startsWith('admin') || 
      email.endsWith('@barberia.com');
    
    setIsAdmin(isUserAdmin);
  };

  // Función para registrarse
  const signup = async (email, password, nombre) => {
    try {
      const role = 
        email === 'juniortovaradmin@gmail.com' || 
        email === 'juniortovar601@gmail.com' || 
        email.startsWith('admin') || 
        email.endsWith('@barberia.com') 
          ? 'admin' 
          : 'customer';
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nombre: nombre,
            role: role
          }
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
    <AuthContext.Provider value={{ user, session, loading, isAdmin, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
