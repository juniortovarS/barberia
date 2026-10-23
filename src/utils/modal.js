// Cierra un popup al tocar/hacer clic fuera de su contenido (sirve en PC y celular).
// Uso: <div className="overlay" {...cerrarAlTocarFuera(cerrar)}> <div className="contenido">…</div> </div>
//
// Se cierra en el "click" (al soltar) y solo si el toque también EMPEZÓ en el fondo: así no se cierra
// al seleccionar texto dentro del popup y arrastrar hacia afuera, y el clic no "atraviesa" el fondo
// hasta el botón que hay debajo (lo que podría volver a abrir el popup).
export const cerrarAlTocarFuera = (cerrar) => ({
  onPointerDown: (e) => {
    const enFondo = e.target === e.currentTarget && e.clientX < e.currentTarget.clientWidth; // no en la barra de scroll
    e.currentTarget.dataset.toqueFuera = enFondo ? '1' : '';
  },
  onClick: (e) => {
    const empezoFuera = e.currentTarget.dataset.toqueFuera === '1';
    e.currentTarget.dataset.toqueFuera = '';
    if (empezoFuera && e.target === e.currentTarget) cerrar();
  },
});
