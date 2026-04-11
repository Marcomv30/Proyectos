/** Retorna el nivel jerárquico de una cuenta según su código.
 *  El primer segmento de 4 dígitos (ej. "0601") ya es nivel 2.
 *  Ejemplos: "06" → 1, "0601" → 2, "0601-01" → 3,
 *            "0601-01-019" → 4, "0601-01-019-001" → 5
 */
export const getNivelCuenta = (codigo: string): number => {
  const parts = String(codigo || '').trim().split('-');
  const startNivel = parts[0].length <= 2 ? 1 : 2;
  return startNivel + (parts.length - 1);
};

/** Solo cuentas de detalle (nivel 4 ó 5) — las únicas movibles */
export const esCuentaMovimiento = (codigo: string): boolean =>
  getNivelCuenta(codigo) >= 4;

/** Filtra un array de cuentas dejando solo las de nivel >= 4 */
export function soloMovimiento<T extends { codigo: string }>(cuentas: T[]): T[] {
  return cuentas.filter(c => esCuentaMovimiento(c.codigo));
}

/** Prefijo de texto para diferenciar nivel 4 (★) y nivel 5 (·) en <option> nativas.
 *  Los browsers ignoran style en <option>, por lo que se usa texto. */
export const prefijoCuenta = (codigo: string): string =>
  getNivelCuenta(codigo) === 4 ? '★ ' : '  ';

/** Etiqueta completa lista para usar en <option>: prefijo + codigo + nombre */
export const labelCuenta = (codigo: string, nombre: string): string =>
  `${prefijoCuenta(codigo)}${codigo} — ${nombre}`;

/** @deprecated Los browsers ignoran style en <option> — usar labelCuenta en su lugar */
export const styleNivel = (_codigo: string): Record<string, never> => ({});
