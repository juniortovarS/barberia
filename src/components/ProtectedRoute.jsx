import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { FaLock } from 'react-icons/fa';

const ProtectedRoute = ({ children }) => {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      const timer = setTimeout(() => {
        navigate('/');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [user, isAdmin, loading, navigate]);

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0a0a0a',
        color: '#ffffff',
        fontFamily: 'Poppins, sans-serif'
      }}>
        <div style={{
          width: '30px',
          height: '30px',
          border: '2px solid rgba(255,255,255,0.1)',
          borderTop: '2px solid #ffffff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0a0a0a',
        color: '#ffffff',
        fontFamily: 'Poppins, sans-serif',
        textAlign: 'center',
        padding: '20px'
      }}>
        <FaLock size={48} style={{ marginBottom: '24px', color: '#666666' }} />
        <h2 style={{ 
          fontSize: '1.6rem', 
          fontWeight: 600, 
          letterSpacing: '2px', 
          textTransform: 'uppercase', 
          color: '#ffffff',
          margin: '0 0 10px 0'
        }}>
          Acceso Restringido
        </h2>
        <p style={{ color: '#a0a0a0', margin: '0 0 20px 0', fontSize: '0.95rem', maxWidth: '400px', lineHeight: '1.5' }}>
          Esta sección es exclusiva para el personal autorizado de la barbería.
        </p>
        <p style={{ color: '#555555', fontSize: '0.85rem', margin: '0' }}>
          Redirigiendo a la página de inicio en breve...
        </p>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
