import React from 'react';
import '../styles/Blog.css';
import blogVideo from '../assets/blog.mp4';
import blog2 from '../assets/blog2.png';
import blog3 from '../assets/blog3.png';
import Footer from '../components/Footer';

const Blog = () => {
  return (
    <>
      {/* Fondo de video */}
      <div className="blog-hero">
        <video className="blog-video" autoPlay muted loop playsInline>
          <source src={blogVideo} type="video/mp4" />
          Tu navegador no soporta videos HTML5.
        </video>
        <div className="blog-overlay-text">
          <h1 className="blog-title">BLOG</h1>
          <p className="blog-subtitle">UN POCO DE MI PARA USTEDES</p>
        </div>
      </div>

      {/* Sección blog 1 */}
      <div className="blog-section">
        <img src={blog2} alt="Historia barbería" className="blog-img" />
        <div className="blog-text">
          <h2 className="info-title">Explorando la evolución de la barbería a lo largo de la historia</h2>
          <p className="info-description">
            El arte de la barbería ha sido una parte integral de la cultura y la sociedad durante siglos. Desde sus humildes comienzos hasta su evolución moderna, las barberías han desempeñado un papel crucial en la historia de la humanidad. Aquí exploraremos la rica herencia y evolución de la barbería a lo largo de la historia, desde sus orígenes hasta su impacto cultural en la actualidad. Los orígenes de la barbería: El arte de la barbería tiene sus raíces en la antigüedad, remontándose a las civilizaciones egipcia y griega. En el antiguo Egipto, los barberos no solo se encargaban de cortar el cabello y la barba, sino que también tenían un papel importante en la medicina. En la Grecia antigua, la barbería era considerada un arte, y los barberos eran altamente respetados por sus habilidades. Con el tiempo, se extendió por todo el mundo y en la Edad Media, los barberos también realizaban funciones médicas como sangrías y extracciones. La llegada del Renacimiento trajo consigo una mayor sofisticación. Los barberos se convirtieron en artistas, creando peinados elaborados y barbas que reflejaban moda y estatus. Las barberías eran espacios sociales de conversación y comunidad. La evolución de la barbería: Con la Revolución Industrial, la barbería se formalizó con escuelas y herramientas modernas como la maquinilla de afeitar. Se volvieron más precisas y eficientes. Durante el siglo XX, muchas barberías perdieron protagonismo ante los salones unisex, pero en décadas recientes ha resurgido con fuerza la barbería clásica, ahora convertida en una experiencia de lujo. El papel de los barberos en la historia: Desde curanderos hasta cirujanos de guerra, los barberos han sido figuras clave en la historia. También han sido consejeros, confidentes y artistas del estilo masculino. El significado cultural de las barberías: No solo son lugares para cortar cabello, también son centros culturales y sociales. En ellas se comparten historias, se crean amistades y se conservan tradiciones. En conclusión, la evolución de la barbería refleja su importancia en la sociedad. Desde la antigüedad hasta hoy, ha dejado una marca profunda y su legado continuará inspirando generaciones.
          </p>
        </div>
      </div>

      {/* Sección blog 2 */}
      <div className="blog-section">
        <img src={blog3} alt="Cuidado barba" className="blog-img" />
        <div className="blog-text">
          <h2 className="info-title">Evita estos errores comunes y luce una barba sana y frondosa</h2>

          <p className="info-description">
            El cuidado de la barba es una parte esencial de la rutina de higiene personal para muchos hombres. Una barba bien cuidada no solo es atractiva, sino que también puede ser un símbolo de masculinidad y confianza.
          </p>
          <p className="info-description">
            Para lucir una barba sana y frondosa, es fundamental evitar ciertos errores comunes que pueden perjudicar su aspecto y salud. Aquí te los mostramos:
          </p>
          <p className="info-description">
            <strong>Lavado excesivo e insuficiente:</strong> Lavarla demasiado puede eliminar los aceites naturales, dejándola seca. Lavarla poco provoca acumulación de suciedad y mal olor. Lo ideal es lavarla 2-3 veces por semana con un champú suave.
          </p>
          <p className="info-description">
            <strong>Descuido de la piel bajo la barba:</strong> Muchos olvidan hidratar la piel debajo. Usa aceites o bálsamos para mantenerla sana y sin irritaciones.
          </p>
          <p className="info-description">
            <strong>Uso de productos inadecuados:</strong> No uses jabones o champús para cabello normal. La barba requiere productos específicos que no resequen ni irriten.
          </p>
          <p className="info-description">
            <strong>Falta de recorte o modelado:</strong> Una barba sin forma parece descuidada. Recórtala regularmente para mantener un estilo limpio y saludable.
          </p>
          <p className="info-description">
            <strong>Dieta e hidratación:</strong> Lo que comes y bebes se refleja en tu barba. Consume proteínas, vitaminas y bebe mucha agua.
          </p>
          <p className="info-description">
            <strong>En conclusión:</strong> Cuidar la barba requiere compromiso. Evita estos errores, hidrátala, aliméntate bien y usa los productos adecuados. Descubre nuestra tienda online para comenzar tu rutina ideal.
          </p>
        </div>
      </div>

      <Footer />
    </>
  );
};

export default Blog;
