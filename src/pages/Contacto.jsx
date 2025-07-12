import React, { useRef, useState } from 'react';
import emailjs from '@emailjs/browser';
import '../styles/Contacto.css';
import Footer from '../components/Footer';

const Contacto = () => {
  const form = useRef();
  const [mensajeEnviado, setMensajeEnviado] = useState(false);
  const [error, setError] = useState(null);

  const sendEmail = (e) => {
    e.preventDefault();
    setMensajeEnviado(false);
    setError(null);

    const adminData = {
      name: form.current.name.value,
      email: form.current.email.value,
      phone: form.current.phone.value,
      message: form.current.message.value
    };

    const userData = {
      user_name: form.current.name.value,
      user_email: form.current.email.value,
      user_phone: form.current.phone.value,
      message: form.current.message.value
    };

    // 1️⃣ Enviar al ADMINISTRADOR
    emailjs.send(
      'service_0ry9t41',
      'template_96itk4u', // ID de tu plantilla de admin
      adminData,
      'QU8t-8ZyBlO4O4jDY' // Public key
    ).then(() => {
      // 2️⃣ Enviar confirmación al USUARIO
      return emailjs.send(
        'service_0ry9t41',
        'template_ruofj9e', // ID de tu plantilla para el usuario
        userData,
        'QU8t-8ZyBlO4O4jDY'
      );
    }).then(() => {
      setMensajeEnviado(true);
      form.current.reset();
    }).catch((err) => {
      console.error('Error enviando correos:', err.text || err);
      setError('❌ Ocurrió un error. Inténtalo nuevamente.');
    });
  };

  return (
    <>
      <div className="contacto-container">
        <h2 className="contacto-titulo">Contáctanos</h2>
        <form ref={form} onSubmit={sendEmail} className="contacto-form">
          <input type="text"  name="name"    placeholder="Tu nombre"   required />
          <input type="email" name="email"   placeholder="Tu correo"   required />
          <input type="tel"   name="phone"   placeholder="Tu celular"  required />
          <textarea name="message" placeholder="Tu mensaje" rows="5" required />
          <button type="submit">Enviar</button>
        </form>

        {mensajeEnviado && <p className="contacto-exito">✅ Mensaje enviado. Pronto te responderemos.</p>}
        {error && <p className="contacto-error">{error}</p>}
      </div>

      <Footer />
    </>
  );
};

export default Contacto;
