import React from 'react';

interface Props {
  usuario: string;
  empresa: { codigo: string; nombre: string; cedula: string };
  onSalir: () => void;
}

const modulos = [
  { nombre: 'Contabilidad', icono: '🏛️' },
  { nombre: 'Bancos', icono: '🏦' },
  { nombre: 'Proveedores', icono: '🤝' },
  { nombre: 'Clientes', icono: '👥' },
  { nombre: 'Inventarios', icono: '📦' },
  { nombre: 'Planilla', icono: '👷' },
  { nombre: 'Activos Fijos', icono: '🏗️' },
  { nombre: 'Cuentas x Cobrar', icono: '📋' },
  { nombre: 'Cuentas x Pagar', icono: '📄' },
  { nombre: 'Facturación', icono: '🧾' },
  { nombre: 'Control de Piña', icono: '🍍' },
  { nombre: 'Costos Producción', icono: '⚙️' },
  { nombre: 'Estadísticas', icono: '📊' },
  { nombre: 'Mantenimientos', icono: '🔧' },
];

const Dashboard: React.FC<Props> = ({ usuario, empresa, onSalir }) => {
  const ahora = new Date();
  const hora = ahora.toLocaleTimeString('es-CR');
  const fecha = ahora.toLocaleDateString('es-CR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <div className="min-h-screen flex" style={{ background: '#f0f4f8' }}>

      {/* Sidebar */}
      <div className="w-48 min-h-screen flex flex-col py-4 px-2 gap-2"
        style={{ background: 'linear-gradient(180deg, #1e3a5f 0%, #2d5a8e 100%)' }}>

        {/* Logo */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-2"
            style={{ background: 'linear-gradient(135deg, #c9a84c, #f0d080)' }}>
            <span className="text-white font-bold text-2xl">M</span>
          </div>
          <p className="text-white text-xs font-semibold">Sistemas MYA</p>
          <p className="text-blue-300 text-xs">sistemasmya@hotmail.com</p>
        </div>

        {/* Módulos */}
        {modulos.map((mod) => (
          <button key={mod.nombre}
            className="flex flex-col items-center py-2 px-1 rounded-lg text-white hover:bg-white hover:bg-opacity-20 transition-all duration-200 cursor-pointer">
            <span className="text-2xl">{mod.icono}</span>
            <span className="text-xs mt-1 text-center leading-tight">{mod.nombre}</span>
          </button>
        ))}

        {/* Salir */}
        <button onClick={onSalir}
          className="flex flex-col items-center py-2 px-1 rounded-lg text-red-300 hover:bg-red-500 hover:text-white transition-all duration-200 mt-auto cursor-pointer">
          <span className="text-2xl">🚪</span>
          <span className="text-xs mt-1">Salir</span>
        </button>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col">

        {/* Header */}
        <div className="px-6 py-3 flex items-center justify-between shadow"
          style={{ background: '#1e3a5f' }}>
          <div>
            <h1 className="text-white font-bold text-lg">{empresa.nombre}</h1>
            <p className="text-blue-300 text-xs">Cédula: {empresa.cedula}</p>
          </div>
          <div className="text-right">
            <p className="text-white text-xs">Versión 3.0</p>
            <p className="text-blue-300 text-xs">Tel: (506) 8379-0976</p>
          </div>
        </div>

        {/* Área central */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="inline-flex items-center justify-center w-32 h-32 rounded-full mb-4"
            style={{ background: 'linear-gradient(135deg, #c9a84c, #f0d080)' }}>
            <span className="text-white font-bold text-6xl">M</span>
          </div>
          <h2 className="text-2xl font-bold" style={{ color: '#1e3a5f' }}>
            Bienvenido, {usuario}
          </h2>
          <p className="text-gray-500 text-sm mt-1">Seleccione un módulo para comenzar</p>
        </div>

        {/* Footer */}
        <div className="px-6 py-2 flex items-center justify-between text-xs"
          style={{ background: '#1e3a5f' }}>
          <span className="text-blue-300">👤 {usuario}</span>
          <span className="text-blue-300">🏢 CIA {empresa.codigo}</span>
          <span className="text-white font-semibold">{hora}</span>
          <span className="text-blue-300 capitalize">{fecha}</span>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;