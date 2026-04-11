// ─── Calibres ───────────────────────────────────────────────────────────────
export type TipoCalibre = 'COR' | 'CRW' | 'otro';

export interface Calibre {
  id: string;
  empresa_id: number;
  nombre: string;              // 'COR 5', 'COR 6', 'CRW 5' ...
  frutas_por_caja: number;
  tipo: TipoCalibre;
  cajas_por_paleta?: number;
  peso_neto?: number;
  tara?: number;
  peso_bruto?: number;
  descripcion?: string;
  material_caja_id?: string;
  material_colilla_id?: string;
  activo: boolean;
  orden: number;
  created_at?: string;
}

// ─── Proveedores de Fruta ────────────────────────────────────────────────────
export interface ProveedorFruta {
  id: string;
  empresa_id: number;
  codigo?: string;
  nombre: string;
  cedula?: string;
  tipo: 'propio' | 'tercero';
  telefono?: string;
  email?: string;
  direccion?: string;
  contacto?: string;
  ggn_gln?: string;
  activo: boolean;
  created_at?: string;
}

// ─── Parcelas de Finca ───────────────────────────────────────────────────────
export interface Parcela {
  id: string;
  empresa_id: number;
  proveedor_id?: string;
  codigo?: string;
  nombre: string;
  hectareas?: number;
  ubicacion?: string;
  geojson?: any;
  activo: boolean;
  created_at?: string;
  // join
  proveedor?: Pick<ProveedorFruta, 'id' | 'nombre'>;
}

// ─── Materiales de Empaque ───────────────────────────────────────────────────
export type TipoMaterial = 'carton' | 'colilla' | 'etiqueta' | 'accesorio' | 'otro';

export interface MaterialEmpaque {
  id: string;
  empresa_id: number;
  codigo?: string;
  nombre: string;
  tipo: TipoMaterial;
  cliente_id?: number;    // FK a terceros del ERP
  cliente_nombre?: string;
  marca?: string;
  calibre_id?: string;
  calibre?: Pick<Calibre, 'id' | 'nombre'>;
  unidad_medida: string;
  stock_minimo: number;
  activo: boolean;
  created_at?: string;
  // stock actual
  stock_actual?: number;
  // vínculo con catálogo ERP
  inv_producto_id?: number | null;
}

// ─── Bodegas ─────────────────────────────────────────────────────────────────
export interface Bodega {
  id: string;
  empresa_id: number;
  nombre: string;
  descripcion?: string;
  es_principal: boolean;
  activo: boolean;
  created_at?: string;
}

// ─── Inventario de Materiales ────────────────────────────────────────────────
export interface InvMaterial {
  id: string;
  empresa_id: number;
  material_id: string;
  bodega_id: string;
  stock_actual: number;
  ultima_actualizacion?: string;
  // joins
  material?: Pick<MaterialEmpaque, 'id' | 'nombre' | 'codigo' | 'tipo'>;
  bodega?: Pick<Bodega, 'id' | 'nombre'>;
}

export interface MovMaterial {
  id: string;
  empresa_id: number;
  material_id: string;
  bodega_id: string;
  bodega_destino_id?: string;
  tipo: 'entrada' | 'salida' | 'traslado';
  cantidad: number;
  referencia?: string;
  notas?: string;
  fecha: string;
  usuario_id?: string;
  created_at?: string;
  // joins
  material?: Pick<MaterialEmpaque, 'id' | 'nombre' | 'codigo'>;
  bodega?: Pick<Bodega, 'id' | 'nombre'>;
  bodega_destino?: Pick<Bodega, 'id' | 'nombre'>;
}

// ─── Clientes exportadores ───────────────────────────────────────────────────
export interface ClienteExportador {
  id: string;
  empresa_id: number;
  nombre: string;
  color?: string;
  tercero_id?: number;
  tercero_nombre?: string;   // join desde terceros.razon_social
  destino_id?: string;
  destino_nombre?: string;   // join
  naviera?: string;
  fe_receptor_id?: number;   // FK fe_receptores_bitacora
  activo: boolean;
  created_at?: string;
  // join marcas
  marcas?: { marca_id: string; marca_nombre: string }[];
}

// ─── Marcas ──────────────────────────────────────────────────────────────────
export interface Marca {
  id: string;
  empresa_id: number;
  nombre: string;
  cliente_id?: number;       // FK ERP (legacy)
  cliente_nombre?: string;
  emp_cliente_id?: string;   // FK emp_clientes
  activo: boolean;
  created_at?: string;
}

// ─── Transportistas ───────────────────────────────────────────────────────────
export interface Transportista {
  id: string;
  empresa_id: number;
  nombre: string;
  telefono?: string;
  placa?: string;
  proveedor_id?: string;
  activo: boolean;
  created_at?: string;
  // join
  proveedor?: Pick<ProveedorFruta, 'id' | 'nombre'>;
}

// ─── Semanas ─────────────────────────────────────────────────────────────────
export interface Semana {
  id: string;
  empresa_id: number;
  codigo: string;        // '26-25'
  semana: number;
  año: number;
  fecha_inicio: string;
  fecha_fin?: string;
  activo: boolean;
  created_at?: string;
}

// ─── Recepciones de Fruta ────────────────────────────────────────────────────
export type TipoRechazo = 'devolucion' | 'mercado_nacional';

export interface Recepcion {
  id: string;
  empresa_id: number;
  semana_id?: string;
  programa_id?: string;
  codigo?: string;
  fecha: string;
  lote?: string;
  grupo_forza?: string;
  proveedor_id?: string;
  parcela_id?: string;
  transportista_id?: string;
  placa?: string;
  hora_carga?: string;
  hora_salida?: string;
  hora_llegada?: string;
  ggn_gln?: string;
  fecha_induccion?: string;
  enviado_por?: string;
  recibido_por?: string;
  total_frutas?: number;
  fruta_empacada: number;
  fruta_jugo: number;
  fruta_rechazo: number;
  tipo_rechazo?: TipoRechazo;
  precio_rechazo?: number;
  notas_rechazo?: string;
  muestreo?: string;
  recibida: boolean;
  notas?: string;
  usuario_id?: string;
  created_at?: string;
  // joins
  semana?: Pick<Semana, 'id' | 'codigo'>;
  proveedor?: Pick<ProveedorFruta, 'id' | 'nombre'>;
  parcela?: Pick<Parcela, 'id' | 'nombre'>;
  transportista?: Pick<Transportista, 'id' | 'nombre' | 'placa'>;
}

export interface RecepcionDetalle {
  id: string;
  empresa_id: number;
  recepcion_id: string;
  vin?: string;
  carreta?: string;
  hora_carga?: string;
  lote?: string;
  bloque?: string;
  grupo_forza?: string;
  cantidad: number;
  observacion?: string;
  created_at?: string;
}

// ─── Boletas de Despacho ─────────────────────────────────────────────────────
export interface Despacho {
  id: string;
  empresa_id: number;
  codigo?: string;
  numero?: number;
  semana_id?: string;
  programa_id?: string;
  cliente_id?: number;
  cliente_nombre?: string;
  destino_id?: string;
  destino_nombre?: string;
  naviera?: string;
  barco?: string;
  fecha_apertura: string;
  hora_apertura?: string;
  fecha_cierre?: string;
  hora_cierre?: string;
  contenedor?: string;
  tipo_contenedor?: string;
  clase_contenedor?: string;
  marchamo_llegada?: string;
  marchamo_salida?: string;
  termografo?: string;
  total_cajas: number;
  total_paletas: number;
  total_frutas: number;
  peso_bruto?: number;
  peso_neto?: number;
  cerrada: boolean;
  notas?: string;
  // Datos exportación (página 2 FEE)
  incoterms?: string;
  shipper?: string;
  ggn_global_gap?: string;
  estado_actual?: string;
  codigo_exportador?: string;
  ep_mag?: string;
  fee_documento_id?: number;
  fee_generada_at?: string;
  usuario_id?: string;
  created_at?: string;
  // joins
  semana?: Pick<Semana, 'id' | 'codigo'>;
  programa?: Pick<Programa, 'id' | 'codigo' | 'cliente_nombre'>;
  destino?: Pick<Destino, 'id' | 'nombre'>;
}

// ─── Boletas de Empaque ──────────────────────────────────────────────────────
export type TipoTarina = 'EUROPEA' | 'AMERICANA';

export interface Boleta {
  id: string;
  empresa_id: number;
  programa_id?: string;
  programa_det_id?: string;
  recepcion_id?: string;
  semana_id?: string;
  numero_paleta: number;
  fecha: string;
  calibre_id?: string;
  calibre_nombre?: string;
  tipo: 'COR' | 'CRW';
  marca_id?: string;
  marca_nombre?: string;
  lote?: string;
  frutas_por_caja: number;
  cajas_por_paleta: number;
  cajas_empacadas: number;
  cajas_a_puchos: number;
  puchos: number;
  puchos_2: number;
  puchos_3: number;
  total_frutas?: number;   // generado por BD
  tarina: TipoTarina;
  material_caja_id?: string;
  material_colilla_id?: string;
  trazabilidad?: string;
  barcode_cliente?: string;
  trazabilidad_2?: string;
  trazabilidad_3?: string;
  aplica: boolean;
  despacho_id?: string;
  usuario_id?: string;
  created_at?: string;
  // joins
  programa?: Pick<Programa, 'id' | 'codigo' | 'cliente_nombre'>;
  opc?: Pick<ProgramaDetalle, 'id' | 'marca_nombre' | 'calibre_nombre'>;
}

// ─── Destinos ────────────────────────────────────────────────────────────────
export interface Destino {
  id: string;
  empresa_id: number;
  nombre: string;
  ubicacion?: string;
  cliente_id?: number;       // FK ERP (legacy)
  cliente_nombre?: string;
  emp_cliente_id?: string;   // FK emp_clientes
  contacto?: string;
  activo: boolean;
  created_at?: string;
}

// ─── Programas Semanales (ORP) ───────────────────────────────────────────────
export interface Programa {
  id: string;
  empresa_id: number;
  semana_id?: string;
  codigo?: string;
  cliente_id?: number;       // FK ERP (legacy)
  cliente_nombre?: string;
  emp_cliente_id?: string;   // FK emp_clientes
  destino_id?: string;
  naviera?: string;
  barco?: string;
  fecha: string;
  hora_inicio?: string;
  hora_fin?: string;
  paletas_programadas: number;
  paletas_empacadas: number;
  terminado: boolean;
  notas?: string;
  // FEE exportación
  precio_usd_caja?: number;
  producto_fee_id?: number;
  usuario_id?: string;
  created_at?: string;
  // joins
  semana?: Pick<Semana, 'id' | 'codigo'>;
  destino?: Pick<Destino, 'id' | 'nombre'>;
}

// ─── Detalle del Programa (OPC) ──────────────────────────────────────────────
export interface ProgramaDetalle {
  id: string;
  empresa_id: number;
  programa_id: string;
  marca_id?: string;
  marca_nombre?: string;
  calibre_id?: string;
  calibre_nombre?: string;
  cajas_por_paleta: number;
  paletas_programadas: number;
  paletas_producidas: number;
  orden: number;
  material_caja_id?: string;
  material_colilla_id?: string;
  created_at?: string;
  // joins
  marca?: Pick<Marca, 'id' | 'nombre'>;
  calibre?: Pick<Calibre, 'id' | 'nombre'>;
}

// ─── Routing ─────────────────────────────────────────────────────────────────
export type AppRoute =
  | 'dashboard'
  | 'config.calibres'
  | 'config.proveedores'
  | 'config.parcelas'
  | 'config.materiales'
  | 'config.marcas'
  | 'config.transportistas'
  | 'config.clientes'
  | 'recepcion.semanas'
  | 'recepcion.recepciones'
  | 'programa.lista'
  | 'empaque.boletas'
  | 'empaque.despachos'
  | 'config.destinos'
  | 'config.bodegas'
  | 'inventario.materiales'
  | 'config.general';
