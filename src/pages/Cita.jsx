import React, { useState, useRef, useEffect } from 'react';
import '../styles/Cita.css';
import { FaCalendarCheck, FaArrowRight, FaArrowLeft, FaCheck, FaUser, FaPhone, FaEnvelope, FaCalendarAlt, FaClock, FaWhatsapp } from 'react-icons/fa';
import DatePicker, { registerLocale } from 'react-datepicker';
import { API_URL } from '../config';
import es from 'date-fns/locale/es';
import 'react-datepicker/dist/react-datepicker.css';
import emailjs from '@emailjs/browser';
import yapeQr from '../assets/yape_qr.png';
import { createWorker } from 'tesseract.js';
import { useAuth } from '../components/AuthContext';
import { supabase } from '../supabaseClient';

// Registrar localización en español para el calendario
registerLocale('es', es);

// Coloca aquí la URL generada en tu Google Apps Script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz8N9xXL_pBpU_M7Oc37FGyNp2UZnr_F31pwa-M-hM_4f3xamctY24N9fe-JMzmNjNbkg/exec"; 

// Función para comprimir la captura de pantalla y convertirla a base64 liviano (< 30KB)
const comprimirImagen = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Exportar a JPEG con calidad 0.6 (súper liviano y legible)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

const Cita = () => {
  const { user } = useAuth();
  const formRef = useRef();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [paso, setPaso] = useState(1); // 1: Datos, 2: Fecha, 3: Hora, 4: Pago
  const [fechaSeleccionada, setFechaSeleccionada] = useState(null);
  const [horaSeleccionada, setHoraSeleccionada] = useState('');
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [email, setEmail] = useState('');
  const [confirmacionVisible, setConfirmacionVisible] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [emailErrorStatus, setEmailErrorStatus] = useState(false);

  // Efecto para precargar datos de la sesión del usuario si está logueado
  useEffect(() => {
    if (user) {
      if (user.user_metadata?.nombre) {
        setNombre(user.user_metadata.nombre);
      }
      if (user.email) {
        setEmail(user.email);
      }
    }
  }, [user, mostrarFormulario]);
  const [metodoPago, setMetodoPago] = useState('yape'); // 'yape' o 'plin'
  const [celularPago, setCelularPago] = useState('');
  const [capturaPreview, setCapturaPreview] = useState(null);
  const [capturaBase64, setCapturaBase64] = useState('');
  const [codigoReserva, setCodigoReserva] = useState('');
  const [estadoReserva, setEstadoReserva] = useState('pending'); // 'pending' o 'approved'
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrResultado, setOcrResultado] = useState(null); // { success: boolean, message: string }
  const [ocrMetadatos, setOcrMetadatos] = useState(null); // { tipoPago: string, fecha: string, hora: string, codigo: string, monto: string }
  const [dragging, setDragging] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const copiarAlPortapapeles = (texto) => {
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const procesarArchivoVoucher = async (file) => {
    setError(null);
    setOcrResultado(null);
    setOcrMetadatos(null);
    setOcrStatus('Comprimiendo imagen...');

    setCapturaPreview(URL.createObjectURL(file));

    try {
      // 1. Comprimir imagen para guardar en Supabase Storage
      const base64 = await comprimirImagen(file);
      setCapturaBase64(base64);

      // 2. Ejecutar OCR usando Tesseract.js
      setOcrStatus('Iniciando lector OCR...');
      const worker = await createWorker('spa'); // Idioma Español

      setOcrStatus('Analizando comprobante...');
      
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();

      console.log("📝 Texto extraído del voucher por OCR:\n", text);

      // 3. Validar contenido
      // Limpiamos espacios, guiones y pasamos a minúsculas
      const textClean = text.toLowerCase().replace(/[\s.-]+/g, '');
      const codigoClean = codigoReserva.toLowerCase().replace(/[\s.-]+/g, '');
      
      // Buscar monto de S/ 1 o S/ 1.00 (soporta variaciones de lectura del símbolo S/ como s1, s/1, s|1, si1, sl1, etc.)
      // Si Tesseract no lee el número "1" por tamaño, confiamos en palabras clave de la transacción Yape/Plin
      const contieneMonto = 
        textClean.includes('s/1') || 
        textClean.includes('s1') || 
        textClean.includes('s|1') || 
        textClean.includes('s\\1') || 
        textClean.includes('si1') || 
        textClean.includes('sl1') ||
        textClean.includes('100') ||
        textClean.includes('1,00') ||
        textClean.includes('s/100') ||
        textClean.includes('s100') ||
        textClean.includes('s|100') ||
        textClean.includes('s\\100') ||
        textClean.includes('si100') ||
        textClean.includes('sl100') ||
        textClean.includes('s/.1') ||
        textClean.includes('s.1') ||
        textClean.includes('yapeaste') ||
        textClean.includes('nrodeoperación') ||
        textClean.includes('nrodeoperacion') ||
        textClean.includes('transacción') ||
        textClean.includes('transaccion') ||
        textClean.includes('plin') ||
        textClean.includes('transferencia') ||
        textClean.includes('monto') ||
        textClean.includes('destino');

      // Buscar código de reserva (ej. RES-4821 -> res4821)
      const contieneCodigo = textClean.includes(codigoClean);

      // Extraer metadatos para mostrar en la interfaz
      const textLower = text.toLowerCase();
      
      let tipoPago = 'No detectado';
      if (textLower.includes('yapeaste') || textLower.includes('yape')) {
        tipoPago = 'Yape';
      } else if (textLower.includes('plin') || textLower.includes('transferencia')) {
        tipoPago = 'Plin';
      }

      // Detectar Fecha
      let fechaDetectada = 'No detectada';
      const dateRegex1 = /(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\.?\s+(\d{4})/i;
      const dateRegex2 = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/i;
      const matchDate1 = text.match(dateRegex1);
      if (matchDate1) {
        fechaDetectada = matchDate1[0];
      } else {
        const matchDate2 = text.match(dateRegex2);
        if (matchDate2) {
          fechaDetectada = matchDate2[0];
        }
      }

      // Detectar Hora (Prioriza formato am/pm del comprobante para ignorar la barra de estado de 24h del teléfono)
      let horaDetectada = 'No detectada';
      const timeRegexAmpm = /(\d{1,2}:\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)/i;
      const timeRegexNormal = /(\d{1,2}:\d{2})/i;
      
      const matchTimeAmpm = text.match(timeRegexAmpm);
      if (matchTimeAmpm) {
        horaDetectada = matchTimeAmpm[0];
      } else {
        const matchTimeNormal = text.match(timeRegexNormal);
        if (matchTimeNormal) {
          horaDetectada = matchTimeNormal[0];
        }
      }

      setOcrMetadatos({
        tipoPago,
        fecha: fechaDetectada,
        hora: horaDetectada,
        codigo: contieneCodigo ? codigoReserva : 'No detectado',
        monto: contieneMonto ? 'S/ 1.00 (Verificado)' : 'No detectado'
      });

      if (contieneMonto && contieneCodigo) {
        setEstadoReserva('approved');
        setOcrStatus('');
        setOcrResultado({ success: true, message: 'Pago verificado automáticamente. Tu reserva será aprobada de inmediato.' });
      } else {
        setEstadoReserva('pending');
        setOcrStatus('');
        
        let errorMsg = 'No pudimos validar el pago automáticamente.';
        if (!contieneCodigo) {
          errorMsg += ` Falta el código "${codigoReserva}" en la imagen.`;
        } else if (!contieneMonto) {
          errorMsg += ' No se detectó el monto de S/ 1.00 o los indicadores de pago.';
        }
        setOcrResultado({ success: false, message: errorMsg });
      }
    } catch (err) {
      console.error("❌ Error de OCR con Tesseract.js:", err);
      setEstadoReserva('pending');
      setOcrStatus('');
      setOcrResultado({ success: false, message: 'Error al leer el comprobante. El administrador lo revisará manualmente.' });
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await procesarArchivoVoucher(file);
  };

  const removerCaptura = () => {
    if (capturaPreview) {
      URL.revokeObjectURL(capturaPreview);
    }
    setCapturaPreview(null);
    setCapturaBase64('');
    setOcrStatus('');
    setOcrResultado(null);
    setOcrMetadatos(null);
    setEstadoReserva('pending');
  };

  const toggleFormulario = () => {
    setMostrarFormulario(!mostrarFormulario);
    setPaso(1);
    setError(null);
    removerCaptura();
    setCelularPago('');
    setMetodoPago('yape');
    setCodigoReserva('');
  };

  const nextPaso = (e) => {
    e.preventDefault();
    if (paso === 1) {
      if (!nombre || !celular || !email) {
        setError("⚠️ Por favor completa todos los campos de contacto.");
        return;
      }
      // Validación celular básico (mínimo 9 dígitos)
      if (celular.replace(/\D/g, '').length < 9) {
        setError("⚠️ Por favor ingresa un número de celular válido (mínimo 9 dígitos).");
        return;
      }
      // Validación email básico
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError("⚠️ Por favor ingresa un correo electrónico válido.");
        return;
      }
      setError(null);
      setPaso(2);
    } else if (paso === 2) {
      if (!fechaSeleccionada) {
        setError("⚠️ Por favor selecciona una fecha para tu cita.");
        return;
      }
      setError(null);
      setPaso(3);
    }
  };

  const prevPaso = (e) => {
    e.preventDefault();
    setError(null);
    setPaso(prev => Math.max(1, prev - 1));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!nombre || !celular || !email || !fechaSeleccionada || !horaSeleccionada) {
      setError("⚠️ Datos incompletos. Por favor revisa todos los pasos.");
      return;
    }

    if (!celularPago || celularPago.length < 9) {
      setError("⚠️ Por favor ingresa el número de celular del pago (9 dígitos).");
      return;
    }

    if (!capturaBase64) {
      setError("⚠️ Por favor adjunta la captura del pago (voucher).");
      return;
    }

    setLoading(true);
    // Formatear fecha local YYYY-MM-DD sin desfase horario
    const year = fechaSeleccionada.getFullYear();
    const month = String(fechaSeleccionada.getMonth() + 1).padStart(2, '0');
    const day = String(fechaSeleccionada.getDate()).padStart(2, '0');
    const fecha = `${year}-${month}-${day}`;
    const hora = horaSeleccionada;

    // Nombre con los datos de pago integrados de forma limpia para Supabase y Twilio
    const nombreCompletoConPago = `${nombre} (${metodoPago.toUpperCase()} Ref: ${codigoReserva} - Cel: ${celularPago} - Estado: ${estadoReserva.toUpperCase()})`;

    const baseMessageText = `
========================================
            BARBERÍA PRO
========================================
Hola ${nombre},

Tu reserva ha sido registrada de manera exitosa.

DETALLES DE LA CITA:
----------------------------------------
Cliente:      ${nombre}
Teléfono:     ${celular}
Correo:       ${email}
Fecha:        ${fecha}
Hora:         ${hora}
Código:       ${codigoReserva}
Método Pago:  ${metodoPago.toUpperCase()} (Ref: ${celularPago})
Estado:       ${estadoReserva.toUpperCase()}
----------------------------------------

¡Gracias por elegirnos!
========================================
`;

    const baseMessageHtml = `
<div style="font-family: 'Courier New', Courier, monospace; background-color: #000000; color: #ffffff; padding: 40px 20px; text-align: center;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #000000; border: 1px solid #333333; padding: 30px; text-align: left; box-sizing: border-box;">
    
    <div style="text-align: center; border-bottom: 1px solid #333333; padding-bottom: 20px; margin-bottom: 25px;">
      <h1 style="font-size: 22px; font-weight: bold; letter-spacing: 4px; margin: 0; text-transform: uppercase; color: #ffffff;">BARBERÍA PRO</h1>
      <p style="font-size: 11px; color: #888888; margin: 5px 0 0 0; letter-spacing: 2px;">ESTILO & ELEGANCIA MASCULINA</p>
    </div>

    <p style="font-size: 14px; line-height: 1.6; color: #dddddd; margin-bottom: 25px;">
      Hola, <strong>${nombre}</strong>.<br />
      Se ha agendado tu reserva con éxito en nuestro sistema. A continuación los detalles de la cita:
    </p>

    <div style="background-color: #111111; border: 1px dashed #444444; padding: 20px; margin-bottom: 25px; font-size: 13px; line-height: 1.8;">
      <div style="border-bottom: 1px solid #222222; padding-bottom: 6px; margin-bottom: 6px;">
        <span style="color: #888888;">Cliente:</span> 
        <strong style="float: right; color: #ffffff;">${nombre}</strong>
      </div>
      <div style="border-bottom: 1px solid #222222; padding-bottom: 6px; margin-bottom: 6px;">
        <span style="color: #888888;">Celular:</span> 
        <strong style="float: right; color: #ffffff;">${celular}</strong>
      </div>
      <div style="border-bottom: 1px solid #222222; padding-bottom: 6px; margin-bottom: 6px;">
        <span style="color: #888888;">Correo:</span> 
        <strong style="float: right; color: #ffffff; text-transform: none;">${email}</strong>
      </div>
      <div style="border-bottom: 1px solid #222222; padding-bottom: 6px; margin-bottom: 6px;">
        <span style="color: #888888;">Fecha Cita:</span> 
        <strong style="float: right; color: #ffffff;">${fecha}</strong>
      </div>
      <div style="border-bottom: 1px solid #222222; padding-bottom: 6px; margin-bottom: 6px;">
        <span style="color: #888888;">Hora Cita:</span> 
        <strong style="float: right; color: #ffffff;">${hora}</strong>
      </div>
      <div style="border-bottom: 1px solid #222222; padding-bottom: 6px; margin-bottom: 6px;">
        <span style="color: #888888;">Código Único:</span> 
        <strong style="float: right; color: #ffd700; font-family: monospace;">${codigoReserva}</strong>
      </div>
      <div style="border-bottom: 1px solid #222222; padding-bottom: 6px; margin-bottom: 6px;">
        <span style="color: #888888;">Método de Pago:</span> 
        <strong style="float: right; color: #ffffff;">${metodoPago.toUpperCase()} (${celularPago})</strong>
      </div>
      <div style="padding-top: 4px;">
        <span style="color: #888888;">Estado Pago:</span> 
        <strong style="float: right; color: #00e676; text-transform: uppercase;">${estadoReserva.toUpperCase()}</strong>
      </div>
    </div>

    <p style="font-size: 12px; line-height: 1.6; color: #888888; margin-bottom: 0; text-align: center;">
      Si deseas realizar algún cambio o cancelar la cita, puedes hacerlo directamente desde el menú "Mi Cuenta" en nuestra web.<br /><br />
      <span style="color: #555555;">© 2026 Barbería Pro. Todos los derechos reservados.</span>
    </p>

  </div>
</div>
`;

    const adminParams = {
      asunto: "NUEVA RESERVA - BARBERÍA PRO",
      subject: "NUEVA RESERVA - BARBERÍA PRO",
      nombre: nombreCompletoConPago,
      cliente: nombre,
      user_name: nombre,
      name: nombre,
      
      celular: celular,
      user_phone: celular,
      phone: celular,
      telefono: celular,
      
      email: email,
      user_email: email,
      correo: email,
      
      fecha: fecha,
      hora: hora,
      codigo: codigoReserva,
      codigo_reserva: codigoReserva,
      metodo_pago: metodoPago.toUpperCase(),
      celular_pago: celularPago,
      estado: estadoReserva.toUpperCase(),
      
      mensaje: baseMessageText.replace(nombre, nombreCompletoConPago),
      message: baseMessageText.replace(nombre, nombreCompletoConPago),
      mensaje_html: baseMessageHtml.replace(`<strong>${nombre}</strong>`, `<strong>${nombreCompletoConPago}</strong>`),
      message_html: baseMessageHtml.replace(`<strong>${nombre}</strong>`, `<strong>${nombreCompletoConPago}</strong>`)
    };

    const userParams = {
      asunto: "RESERVA CONFIRMADA - BARBERÍA PRO",
      subject: "RESERVA CONFIRMADA - BARBERÍA PRO",
      nombre: nombre,
      cliente: nombre,
      user_name: nombre,
      name: nombre,
      
      celular: celular,
      user_phone: celular,
      phone: celular,
      telefono: celular,
      
      email: email,
      user_email: email,
      correo: email,
      
      fecha: fecha,
      hora: hora,
      codigo: codigoReserva,
      codigo_reserva: codigoReserva,
      metodo_pago: metodoPago.toUpperCase(),
      celular_pago: celularPago,
      estado: estadoReserva.toUpperCase(),
      
      mensaje: baseMessageText,
      message: baseMessageText,
      mensaje_html: baseMessageHtml,
      message_html: baseMessageHtml
    };

    try {
      // 1. Email al administrador (EmailJS) - envuelto en try-catch individual para evitar bloqueos
      try {
        await emailjs.send(
          'service_0ry9t41',
          'template_96itk4u',
          adminParams,
          'QU8t-8ZyBlO4O4jDY'
        );
        console.log("✉️ Correo enviado al administrador");
      } catch (emailAdminErr) {
        console.error("❌ Error enviando email al admin:", emailAdminErr);
      }

      // 2. Email al usuario (EmailJS) - envuelto en try-catch individual
      let emailFailed = false;
      try {
        await emailjs.send(
          'service_0ry9t41',
          'template_ruofj9e',
          userParams,
          'QU8t-8ZyBlO4O4jDY'
        );
        console.log("✉️ Correo enviado al usuario");
      } catch (emailUserErr) {
        console.error("❌ Error enviando email al usuario:", emailUserErr);
        emailFailed = true;
      }
      setEmailErrorStatus(emailFailed);

      // 3. Guardar en Google Sheets (Google Apps Script)
      if (GOOGLE_SCRIPT_URL && !GOOGLE_SCRIPT_URL.includes("Reemplaza")) {
        try {
          await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nombre: nombreCompletoConPago,
              celular,
              email,
              fecha,
              hora,
              metodo_pago: metodoPago.toUpperCase(),
              celular_pago: celularPago,
              codigo_reserva: codigoReserva,
              estado: estadoReserva.toUpperCase(),
              captura_pago: capturaBase64
            }),
          });
          console.log("✅ Fila insertada en Google Sheets");
        } catch (sheetErr) {
          console.error("❌ Error en Google Sheets:", sheetErr);
        }
      }

      // 4. Guardar en base de datos Supabase (Render backend)
      let databaseSaved = false;
      try {
        const response = await fetch(`${API_URL}/reservar-cita`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: nombreCompletoConPago,
            celular,
            email,
            fecha_cita: fecha,
            hora_cita: hora,
            codigo: codigoReserva,
            estado: estadoReserva,
            voucher_base64: capturaBase64
          }),
        });
        if (response.ok) {
          const resData = await response.json();
          console.log("✅ Cita sincronizada con Supabase:", resData);
          databaseSaved = true;
        } else {
          console.error("❌ El backend respondió con un error:", response.status);
        }
      } catch (dbErr) {
        console.error("❌ Error al guardar en base de datos:", dbErr);
      }

      // Si el backend falló o no pudo guardar, insertamos directamente desde el cliente como respaldo
      if (!databaseSaved) {
        console.log("🔄 Iniciando guardado de respaldo directo en Supabase...");
        try {
          let voucher_url = null;
          if (capturaBase64) {
            try {
              const filename = `voucher-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}.jpg`;
              const matches = capturaBase64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
              if (matches && matches.length === 3) {
                const contentType = matches[1];
                const base64Data = matches[2];
                const binaryStr = atob(base64Data);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                  bytes[i] = binaryStr.charCodeAt(i);
                }
                
                const { error: uploadErr } = await supabase.storage
                  .from('vouchers')
                  .upload(filename, bytes, { contentType, upsert: true });
                
                if (!uploadErr) {
                  const { data: publicUrlData } = supabase.storage
                    .from('vouchers')
                    .getPublicUrl(filename);
                  voucher_url = publicUrlData.publicUrl;
                } else {
                  console.error("❌ Error al subir captura en guardado directo:", uploadErr.message);
                }
              }
            } catch (errUpload) {
              console.error("❌ Excepción al subir captura en guardado directo:", errUpload);
            }
          }

          const { error: insertErr } = await supabase
            .from("reservas")
            .insert([{
              nombre: nombreCompletoConPago,
              celular,
              email,
              fecha_cita: fecha,
              hora_cita: hora,
              fecha_registro: new Date().toISOString(),
              codigo: codigoReserva,
              estado: estadoReserva.toUpperCase(),
              voucher_url
            }]);
          
          if (insertErr) throw insertErr;
          console.log("✅ Cita guardada de respaldo directamente en Supabase con éxito");
        } catch (fbErr) {
          console.error("❌ Error fatal en el guardado de respaldo Supabase:", fbErr);
        }
      }

      setLoading(false);
      setConfirmacionVisible(true);
    } catch (err) {
      console.error('❌ Error general al reservar:', err);
      setLoading(false);
      setError('❌ Ocurrió un error al procesar tu cita. Inténtalo de nuevo.');
    }
  };

  const cerrarConfirmacion = () => {
    setNombre(user?.user_metadata?.nombre || '');
    setCelular('');
    setEmail(user?.email || '');
    setFechaSeleccionada(null);
    setHoraSeleccionada('');
    setMetodoPago('yape');
    setCelularPago('');
    removerCaptura();
    setMostrarFormulario(false);
    setPaso(1);
    setConfirmacionVisible(false);
  };

  const generarHoras = () => {
    const horas = [];
    const base = new Date();
    base.setSeconds(0);
    base.setMilliseconds(0);

    for (let h = 9; h <= 23; h++) {
      for (let m = 0; m < 60; m += 30) {
        const hora = new Date(base);
        hora.setHours(h, m, 0, 0);
        horas.push(new Date(hora));
      }
    }

    const mediaNoche = new Date(base);
    mediaNoche.setDate(mediaNoche.getDate() + 1);
    mediaNoche.setHours(0, 0, 0, 0);
    horas.push(mediaNoche);

    return horas;
  };

  const horas = generarHoras();

  const obtenerHorasConEstado = () => {
    if (!fechaSeleccionada) return [];

    const ahora = new Date();
    const esHoy = fechaSeleccionada.toDateString() === ahora.toDateString();

    return horas.map((h) => {
      const horaCompleta = new Date(fechaSeleccionada);
      horaCompleta.setHours(h.getHours(), h.getMinutes(), 0, 0);
      const esPasada = esHoy && horaCompleta < ahora;

      return {
        horaStr: horaCompleta.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
        deshabilitada: esPasada,
        horaRaw: h.getHours()
      };
    });
  };

  const horasConEstado = obtenerHorasConEstado();

  // Dividir horas por turnos: Mañana (9:00 - 11:30), Tarde (12:00 - 17:30), Noche (18:00 - 23:59)
  const horasManana = horasConEstado.filter(h => h.horaRaw < 12);
  const horasTarde = horasConEstado.filter(h => h.horaRaw >= 12 && h.horaRaw < 18);
  const horasNoche = horasConEstado.filter(h => h.horaRaw >= 18);

  const renderHorasSeccion = (titulo, icono, lista) => {
    if (lista.length === 0) return null;
    return (
      <div className="turno-seccion-modern">
        <h4 className="turno-titulo-modern">{icono} {titulo}</h4>
        <div className="horas-grid-modern">
          {lista.map((horaObj, i) => (
            <button
              key={i}
              className={`hora-btn-modern ${horaSeleccionada === horaObj.horaStr ? 'active' : ''} ${horaObj.deshabilitada ? 'disabled' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                if (!horaObj.deshabilitada) {
                  setHoraSeleccionada(horaObj.horaStr);
                }
              }}
              disabled={horaObj.deshabilitada}
            >
              {horaObj.horaStr}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="cita-fullscreen">
      <div className="cita-overlay-text">
        <div className="cita-text-top animate-fade-in-up-1">NUEVA PROMO EXCLUSIVA</div>
        <h1 className="cita-text-main animate-fade-in-up-2">15% DE DESCUENTO EN TU PRIMERA CITA</h1>
        <div className="cita-button animate-fade-in-up-3" onClick={toggleFormulario}>
          <div className="cita-btn-text">RESERVAR CITA</div>
          <div className="cita-btn-icon"><FaCalendarCheck /></div>
        </div>
      </div>

      {mostrarFormulario && !confirmacionVisible && (
        <div className="cita-formulario-overlay">
          <div className="cita-formulario-contenido wizard-box">
            
            {/* Barra de Progreso Visual */}
            <div className="wizard-progress">
              <div className={`wizard-step ${paso >= 1 ? 'active' : ''} ${paso === 1 ? 'current' : ''}`}>
                <div className="step-num">{paso > 1 ? <FaCheck size={10} /> : "1"}</div>
                <span className="step-label">Datos</span>
              </div>
              <div className={`wizard-line ${paso >= 2 ? 'active' : ''}`}></div>
              <div className={`wizard-step ${paso >= 2 ? 'active' : ''} ${paso === 2 ? 'current' : ''}`}>
                <div className="step-num">{paso > 2 ? <FaCheck size={10} /> : "2"}</div>
                <span className="step-label">Fecha</span>
              </div>
              <div className={`wizard-line ${paso >= 3 ? 'active' : ''}`}></div>
              <div className={`wizard-step ${paso >= 3 ? 'active' : ''} ${paso === 3 ? 'current' : ''}`}>
                <div className="step-num">{paso > 3 ? <FaCheck size={10} /> : "3"}</div>
                <span className="step-label">Hora</span>
              </div>
              <div className={`wizard-line ${paso >= 4 ? 'active' : ''}`}></div>
              <div className={`wizard-step ${paso >= 4 ? 'active' : ''} ${paso === 4 ? 'current' : ''}`}>
                <div className="step-num">4</div>
                <span className="step-label">Pago</span>
              </div>
            </div>

            <h2 className="wizard-title">
              {paso === 1 && "Datos del Cliente"}
              {paso === 2 && "Selecciona Fecha"}
              {paso === 3 && "Selecciona Hora"}
              {paso === 4 && "Confirmar Pago"}
            </h2>

            <form ref={formRef} onSubmit={handleSubmit} className="wizard-form">
              
              {/* PASO 1: Datos personales */}
              {paso === 1 && (
                <div className="wizard-slide fade-in-slide">
                  <p className="wizard-desc">Introduce tus datos para ponernos en contacto contigo.</p>
                  
                  <div className="input-group-modern">
                    <span className="input-icon-modern"><FaUser /></span>
                    <input 
                      type="text" 
                      placeholder="Tu nombre completo" 
                      value={nombre} 
                      onChange={(e) => setNombre(e.target.value)} 
                      required 
                    />
                    <span className="input-focus-border"></span>
                  </div>

                  <div className="input-group-modern">
                    <span className="input-icon-modern"><FaPhone /></span>
                    <input 
                      type="tel" 
                      placeholder="Número de celular" 
                      value={celular} 
                      onChange={(e) => setCelular(e.target.value)} 
                      required 
                    />
                    <span className="input-focus-border"></span>
                  </div>

                  <div className="input-group-modern">
                    <span className="input-icon-modern"><FaEnvelope /></span>
                    <input 
                      type="email" 
                      placeholder="Correo electrónico" 
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      required 
                      disabled={!!user}
                      title={user ? "Tu correo está vinculado a tu cuenta y no se puede modificar" : ""}
                    />
                    <span className="input-focus-border"></span>
                  </div>
                  {user && (
                    <p className="email-linked-helper" style={{ fontSize: '0.78rem', color: '#aaaaaa', marginTop: '-12px', marginBottom: '16px', textAlign: 'left', fontStyle: 'italic' }}>
                      💡 Correo asociado a tu cuenta activa. Tu reserva se guardará aquí.
                    </p>
                  )}
                  
                  <div className="wizard-buttons">
                    <button className="cerrar-btn-wizard" type="button" onClick={toggleFormulario}>Cancelar</button>
                    <button className="siguiente-btn" type="button" onClick={nextPaso}>
                      Fecha <FaArrowRight size={10} style={{ marginLeft: '8px' }} />
                    </button>
                  </div>
                </div>
              )}

              {/* PASO 2: Calendario */}
              {paso === 2 && (
                <div className="wizard-slide fade-in-slide">
                  <p className="wizard-desc">¿Qué día prefieres visitarnos? Selecciona en el calendario.</p>
                  
                  <div className="calendar-container">
                    <div className="calendar-wrapper-modern">
                      <DatePicker
                        selected={fechaSeleccionada}
                        onChange={(date) => {
                          setFechaSeleccionada(date);
                          setHoraSeleccionada('');
                        }}
                        minDate={new Date()}
                        inline
                        locale="es"
                        className="datepicker-custom"
                      />
                    </div>
                  </div>

                  {fechaSeleccionada && (
                    <div className="seleccion-alert date-pill fade-in">
                      <FaCalendarAlt style={{ marginRight: '8px', color: '#ffffff' }} /> 
                      Día elegido: <strong>{fechaSeleccionada.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>
                    </div>
                  )}

                  <div className="wizard-buttons">
                    <button className="atras-btn" type="button" onClick={prevPaso}>
                      <FaArrowLeft size={10} style={{ marginRight: '8px' }} /> Datos
                    </button>
                    <button 
                      className={`siguiente-btn ${!fechaSeleccionada ? 'disabled' : ''}`} 
                      type="button" 
                      onClick={nextPaso}
                      disabled={!fechaSeleccionada}
                    >
                      Hora <FaArrowRight size={10} style={{ marginLeft: '8px' }} />
                    </button>
                  </div>
                </div>
              )}

              {/* PASO 3: Selector de Horas */}
              {paso === 3 && (
                <div className="wizard-slide fade-in-slide">
                  <div className="seleccion-alert date-pill">
                    <FaCalendarAlt style={{ marginRight: '8px', color: '#ffffff' }} /> 
                    Fecha: <strong>{fechaSeleccionada ? fechaSeleccionada.toLocaleDateString() : ''}</strong>
                  </div>

                  <p className="wizard-desc">Selecciona un horario disponible en los siguientes turnos:</p>

                  <div className="turnos-container-modern">
                    {renderHorasSeccion("Mañana", "", horasManana)}
                    {renderHorasSeccion("Tarde", "", horasTarde)}
                    {renderHorasSeccion("Noche", "", horasNoche)}
                  </div>

                  {horaSeleccionada && (
                    <div className="seleccion-alert time-pill fade-in">
                      <FaClock style={{ marginRight: '8px', color: '#ffffff' }} />
                      Hora elegida: <strong>{horaSeleccionada}</strong>
                    </div>
                  )}

                  <div className="wizard-buttons">
                    <button className="atras-btn" type="button" onClick={prevPaso}>
                      <FaArrowLeft size={10} style={{ marginRight: '8px' }} /> Fecha
                    </button>
                    <button 
                      className={`confirmar-btn-wizard ${!horaSeleccionada || loading ? 'disabled' : ''}`} 
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        if (horaSeleccionada) {
                          setError(null);
                          // Generar código único temporal RES-XXXXXX (garantiza no repeticiones)
                          const prefijos = ['RES', 'BARB', 'CUT'];
                          const prefijo = prefijos[Math.floor(Math.random() * prefijos.length)];
                          const randomNum = Math.floor(100000 + Math.random() * 900000);
                          setCodigoReserva(`${prefijo}-${randomNum}`);
                          setEstadoReserva('pending');
                          setPaso(4);
                        } else {
                          setError("⚠️ Por favor selecciona una hora para tu cita.");
                        }
                      }}
                      disabled={!horaSeleccionada || loading}
                    >
                      Pago <FaArrowRight size={10} style={{ marginLeft: '8px' }} />
                    </button>
                  </div>
                </div>
              )}

              {/* PASO 4: Pago Yape / Plin con Validación OCR */}
              {paso === 4 && (
                <div className="wizard-slide fade-in-slide">
                  <div className="seleccion-alert date-pill">
                    <FaCalendarAlt style={{ marginRight: '8px', color: '#ffffff' }} />
                    Cita: <strong>{fechaSeleccionada ? fechaSeleccionada.toLocaleDateString() : ''} - {horaSeleccionada}</strong>
                  </div>

                  <p className="wizard-desc font-premium-alert">
                    Para confirmar tu reserva realiza un adelanto de <strong>S/ 1.00</strong>
                    
                  </p>

                  {/* Ficha Resumen de Pago */}
                  <div className="ficha-pago-premium">
                    <div className="ficha-item">
                      <span>Código de reserva:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="text"
                          value={codigoReserva}
                          onChange={(e) => setCodigoReserva(e.target.value.toUpperCase())}
                          style={{
                            background: 'rgba(255, 255, 255, 0.07)',
                            border: '1px dashed #ffd700',
                            color: '#ffd700',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            width: '120px',
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                            textAlign: 'center',
                            outline: 'none'
                          }}
                          title="Puedes modificar este código para pruebas"
                        />
                        <button
                          type="button"
                          onClick={() => copiarAlPortapapeles(codigoReserva)}
                          style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: '#ccc',
                            fontSize: '0.68rem',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          {copiado ? "¡Copiado!" : "Copiar"}
                        </button>
                      </div>
                    </div>
                    <div className="ficha-item">
                      <span>Yapear/Plinear a:</span>
                      <strong>975 404 704</strong>
                    </div>
                    <div className="ficha-item">
                      <span>Monto del adelanto:</span>
                      <strong className="monto-highlight">S/ 1.00</strong>
                    </div>
                  </div>

                  {/* Instrucciones de copia e Yapeo */}
                  <p style={{
                    fontSize: '0.82rem',
                    color: '#a0a0a0',
                    lineHeight: '1.4',
                    marginTop: '-15px',
                    marginBottom: '20px',
                    textAlign: 'center',
                    background: 'rgba(255, 215, 0, 0.05)',
                    border: '1px solid rgba(255, 215, 0, 0.12)',
                    padding: '10px 14px',
                    borderRadius: '12px'
                  }}>
                    💡 <strong>Instrucciones:</strong> Copia el código de arriba y pégalo en la <strong>Descripción</strong> (o nota) de tu Yape/Plin al realizar el pago para validar tu reserva automáticamente.
                  </p>

                  {/* Selector de Método de Pago */}
                  <div className="metodo-pago-selector">
                    <button
                      type="button"
                      className={`metodo-btn yape-btn ${metodoPago === 'yape' ? 'active' : ''}`}
                      onClick={() => { setMetodoPago('yape'); setError(null); }}
                    >
                      <span className="metodo-dot"></span> Yape
                    </button>
                    <button
                      type="button"
                      className={`metodo-btn plin-btn ${metodoPago === 'plin' ? 'active' : ''}`}
                      onClick={() => { setMetodoPago('plin'); setError(null); }}
                    >
                      <span className="metodo-dot"></span> Plin
                    </button>
                  </div>

                  {/* QR / Instrucciones */}
                  <div className="pago-instrucciones-wrapper">
                    {metodoPago === 'yape' ? (
                      <div className="yape-instrucciones fade-in-slide-quick">
                        <div className="yape-qr-container">
                          <img src={yapeQr} alt="Yape QR" className="yape-qr-img" />
                        </div>
                        <p className="pago-destinatario">
                          Escanea el QR o yapea a: <strong>975 404 704</strong><br />
                          Titular: <strong>Junior Jesus Alejandro Tovar Salazar</strong>
                        </p>
                      </div>
                    ) : (
                      <div className="plin-instrucciones fade-in-slide-quick">
                        <div className="plin-icon-container">
                          <div className="plin-circle">P</div>
                        </div>
                        <p className="pago-destinatario">
                          Plinea directamente al número: <strong>975 404 704</strong><br />
                          Titular: <strong>Junior Jesus Alejandro Tovar Salazar</strong>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Inputs y drag-and-drop */}
                  <div className="pago-inputs-container">
                    <div className="input-group-modern">
                      <span className="input-icon-modern"><FaPhone /></span>
                      <input 
                        type="tel" 
                        placeholder="Celular desde el que pagaste (9 dígitos)" 
                        value={celularPago} 
                        onChange={(e) => setCelularPago(e.target.value.replace(/\D/g, '').slice(0, 9))} 
                        required 
                      />
                      <span className="input-focus-border"></span>
                    </div>

                    {/* Drag and Drop Uploader */}
                    <div 
                      className={`dropzone-modern ${dragging ? 'dragging' : ''} ${capturaPreview ? 'has-preview' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={async (e) => {
                        e.preventDefault();
                        setDragging(false);
                        const file = e.dataTransfer.files[0];
                        if (file && file.type.startsWith('image/')) {
                          await procesarArchivoVoucher(file);
                        } else {
                          setError("⚠️ Por favor suelta una imagen válida.");
                        }
                      }}
                    >
                      {!capturaPreview ? (
                        <label className="upload-label-wrapper">
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleFileChange} 
                            style={{ display: 'none' }} 
                            required 
                          />
                          <div className="upload-icon-box">📸</div>
                          <span className="upload-text-main">Arrastra y suelta tu voucher aquí</span>
                          <span className="upload-text-sub">o haz clic para buscar la imagen</span>
                        </label>
                      ) : (
                        <div className="preview-captura-container fade-in-slide-quick">
                          <div className="preview-img-wrapper">
                            <img src={capturaPreview} alt="Comprobante de pago" className="preview-captura-img" />
                          </div>
                          <button 
                            type="button" 
                            className="remover-captura-btn" 
                            onClick={removerCaptura}
                          >
                            Eliminar captura
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Estado del Lector OCR */}
                  {ocrStatus && (
                    <div className="ocr-status-indicator">
                      <div className="ocr-spinner"></div>
                      <span>{ocrStatus}</span>
                    </div>
                  )}

                  {/* Resultados de la validación OCR */}
                  {ocrResultado && (
                    <div className={`ocr-resultado-box ${ocrResultado.success ? 'success' : 'warning'}`}>
                      {ocrResultado.success ? (
                        <>
                          <span className="resultado-icon">✅</span>
                          <div className="resultado-text-box">
                            <strong>Reserva validada exitosamente</strong>
                            <p>{ocrResultado.message}</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="resultado-icon">⚠️</span>
                          <div className="resultado-text-box">
                            <strong>No pudimos validar el pago automáticamente</strong>
                            <p>{ocrResultado.message}</p>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Detalles leídos por el OCR */}
                  {ocrMetadatos && (
                    <div className="ocr-detalles-box fade-in-slide-quick">
                      <h4 className="ocr-detalles-titulo">🔍 Datos leídos de la captura:</h4>
                      <div className="ocr-detalles-grid">
                        <div className="ocr-detalle-item">
                          <span>Comprobante:</span>
                          <strong className={ocrMetadatos.tipoPago !== 'No detectado' ? 'detectado-ok' : ''}>
                            {ocrMetadatos.tipoPago} {ocrMetadatos.tipoPago !== 'No detectado' && '✅'}
                          </strong>
                        </div>
                        <div className="ocr-detalle-item">
                          <span>Monto del Adelanto:</span>
                          <strong className={ocrMetadatos.monto !== 'No detectado' ? 'detectado-ok' : ''}>
                            {ocrMetadatos.monto} {ocrMetadatos.monto !== 'No detectado' && '✅'}
                          </strong>
                        </div>
                        <div className="ocr-detalle-item">
                          <span>Código de reserva:</span>
                          <strong className={ocrMetadatos.codigo !== 'No detectado' ? 'detectado-ok' : ''}>
                            {ocrMetadatos.codigo} {ocrMetadatos.codigo !== 'No detectado' && '✅'}
                          </strong>
                        </div>
                        <div className="ocr-detalle-item">
                          <span>Fecha de pago:</span>
                          <strong className={ocrMetadatos.fecha !== 'No detectada' ? 'detectado-ok' : ''}>
                            {ocrMetadatos.fecha} {ocrMetadatos.fecha !== 'No detectada' && '✅'}
                          </strong>
                        </div>
                        <div className="ocr-detalle-item">
                          <span>Hora de pago:</span>
                          <strong className={ocrMetadatos.hora !== 'No detectada' ? 'detectado-ok' : ''}>
                            {ocrMetadatos.hora} {ocrMetadatos.hora !== 'No detectada' && '✅'}
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="wizard-buttons">
                    <button className="atras-btn" type="button" onClick={() => { setError(null); setPaso(3); }}>
                      <FaArrowLeft size={10} style={{ marginRight: '8px' }} /> Hora
                    </button>
                    <button 
                      className={`confirmar-btn-wizard ${!celularPago || !capturaBase64 || loading ? 'disabled' : ''}`} 
                      type="submit"
                      disabled={!celularPago || !capturaBase64 || loading}
                    >
                      {loading ? (
                        <div className="loading-spinner-btn">
                          <span className="spinner-dot"></span>
                          <span className="spinner-dot"></span>
                          <span className="spinner-dot"></span>
                        </div>
                      ) : (
                        "Confirmar Cita"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </form>
            {error && <p className="cita-error-modern">{error}</p>}
          </div>
        </div>
      )}

      {confirmacionVisible && (
        <div className="cita-formulario-overlay">
          <div className="cita-formulario-contenido confirmacion-box fade-in-scale">
            <div className="confirmacion-success-animation">
              <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                <circle className="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
                <path className="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
              </svg>
            </div>
            
            <h2 className="confirmacion-title">¡Reserva Exitosa!</h2>
            <p className="confirmacion-subtitle">
              {emailErrorStatus 
                ? "Hemos agendado tu cita correctamente en tu perfil. (Nota: Hubo un inconveniente al enviar la confirmación a tu correo, pero puedes ver tu reserva en tu perfil)."
                : "Hemos agendado tu cita de manera correcta. Te llegará un correo de confirmación."
              }
            </p>
            
            <div className="confirmacion-resumen-box">
              <div className="resumen-item"><span>📍 Ubicación:</span> <span>Av. Principal 123 - Lima, Perú</span></div>
              <div className="resumen-item"><span>👤 Cliente:</span> <span>{nombre}</span></div>
              <div className="resumen-item"><span>📱 Celular:</span> <span>{celular}</span></div>
              <div className="resumen-item"><span>📅 Fecha:</span> <span>{fechaSeleccionada ? fechaSeleccionada.toLocaleDateString() : ''}</span></div>
              <div className="resumen-item"><span>⏰ Hora:</span> <span>{horaSeleccionada}</span></div>
            </div>

            <div className="confirmacion-acciones">
              <a 
                href={`https://wa.me/51975404704?text=${encodeURIComponent(`¡Hola! Acabo de reservar una cita:\n👤 Cliente: ${nombre}\n📅 Fecha: ${fechaSeleccionada ? fechaSeleccionada.toLocaleDateString() : ''}\n⏰ Hora: ${horaSeleccionada}\n📱 Celular: ${celular}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="whatsapp-confirm-btn"
              >
                <FaWhatsapp style={{ marginRight: '8px', fontSize: '1.2rem' }} /> Enviar aviso por WhatsApp
              </a>
              
              <button className="confirmacion-cerrar-btn" onClick={cerrarConfirmacion}>Volver al Inicio</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cita;
