import { useRef, useEffect } from 'react';

/**
 * MontoInput — input numérico reutilizable para tablas contables.
 *
 * Comportamiento:
 * - Muestra valor formateado (1,234,567.89) en reposo.
 * - Al enfocar: muestra número crudo y selecciona todo el contenido.
 * - Confirma el valor con Enter (salta al siguiente input de la tabla), Tab o blur.
 * - blocked=true: muestra "—" sin edición (usado cuando el campo opuesto tiene valor,
 *   p.ej. Debe bloqueado cuando Haber tiene valor y viceversa).
 *
 * Implementado como input NO controlado para evitar re-renders que desplacen el foco.
 *
 * Uso básico:
 *   <MontoInput value={monto} onChange={n => setMonto(n)} />
 *
 * Con exclusividad Debe/Haber:
 *   <MontoInput value={debe}  blocked={haber > 0} onChange={n => setDebe(n)} />
 *   <MontoInput value={haber} blocked={debe  > 0} onChange={n => setHaber(n)} />
 */
export function MontoInput({ value, onChange, blocked = false, className = '' }: {
  value:     number;
  onChange:  (n: number) => void;
  blocked?:  boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  const fmt = (n: number) =>
    n === 0 ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Sincronizar valor externo solo cuando el input NO está enfocado
  useEffect(() => {
    if (ref.current && ref.current !== document.activeElement)
      ref.current.value = fmt(value);
  }, [value]);

  const confirmar = () => {
    if (!ref.current) return;
    const n = parseFloat(ref.current.value.replace(/,/g, '')) || 0;
    onChange(n);
    ref.current.value = fmt(n);
  };

  const focusSiguiente = () => {
    if (!ref.current) return;
    const tabla  = ref.current.closest('table') as HTMLTableElement | null;
    const inputs = Array.from(
      tabla?.querySelectorAll<HTMLInputElement>('input:not([disabled]):not([readonly])') ?? []
    );
    const i = inputs.indexOf(ref.current);
    if (i >= 0 && i < inputs.length - 1) inputs[i + 1].focus();
  };

  if (blocked) return (
    <div className="w-full px-2 py-1 text-xs text-right text-gray-600 select-none">—</div>
  );

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      defaultValue={fmt(value)}
      placeholder="0"
      onFocus={e  => { e.target.value = value === 0 ? '' : String(value); e.target.select(); }}
      onBlur={confirmar}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); confirmar(); setTimeout(focusSiguiente, 0); }
        if (e.key === 'Tab')   { confirmar(); }
      }}
      className={`w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-right
        focus:outline-none focus:border-purple-500 focus:bg-gray-600 transition-colors ${className}`}
    />
  );
}
