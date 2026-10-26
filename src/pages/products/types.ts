export type ViewTab = 'productos' | 'categorias' | 'proveedores' | 'importacion'

export type ModoManejoCodigo = 'PALETIZADO' | 'SERIALIZADO' | 'GRANEL' | 'LOTE' | 'LARGO' | 'PICKING_CAJA' | 'PESO_VARIABLE' | 'PERECEDERO' | 'PELIGROSO' | string

export type ModoManejo = {
  codigo: ModoManejoCodigo
  nombre: string
  descripcion?: string | null
  requiere_regla_empaque: boolean
  requiere_serie: boolean
  permite_puchos: boolean
  activo: boolean
}

export type Category = {
  id_categoria: number | string
  nombre: string
  descripcion: string | null
  modo_manejo?: ModoManejoCodigo
  activo?: boolean
}

export type PerfilSerializado = {
  id_producto: number | string
  peso_unitario_kg?: number | null
  largo_cm?: number | null
  ancho_cm?: number | null
  alto_cm?: number | null
  requiere_equipo_izaje: boolean
  ubicacion_permitida: 'CAMPO' | 'RACK' | 'AMBAS'
  atributos?: Record<string, unknown>
  notas?: string | null
}

export type EstadoUnidadSerial = 'DISPONIBLE' | 'EN_MANTENIMIENTO' | 'DESPACHADA' | 'BAJA'

export type UnidadSerializada = {
  id_unidad: number | string
  id_producto: number | string
  numero_serie: string
  id_etiqueta?: number | string | null
  id_almacen?: number | string | null
  estado: EstadoUnidadSerial
  fecha_ingreso: string
  etiqueta_rfid?: {
    id_etiqueta: number | string
    uid_tag: string
    estado: string
  } | null
  almacen?: {
    id_almacen: number | string
    nombre: string
    prefijo_rfid?: string | null
  } | null
}

export type Product = {
  id_producto: number | string
  sku: string
  nombre?: string | null
  descripcion: string
  id_categoria?: number | string | null
  unidad_medida?: string | null
  peso_unitario_kg?: number | null
  costo_unitario?: number | null
  clasificacion_abc?: 'A' | 'B' | 'C' | string | null
  activo?: boolean
  categoria?: { id_categoria?: number | string; nombre: string; modo_manejo?: ModoManejoCodigo } | null
  modo_manejo?: ModoManejoCodigo
  regla_empaque?: Rule[] | Rule | null
  perfil_serializado?: PerfilSerializado[] | PerfilSerializado | null
}

export type ProductDetailed = {
  id_producto: number
  sku: string
  nombre: string
  descripcion: string
  unidad_medida: string
  peso_unitario_kg: number | null
  costo_unitario: number | null
  clasificacion_abc: string | null
  producto_activo: boolean
  created_at: string
  id_categoria: number | null
  categoria_nombre: string | null
  categoria_descripcion: string | null
  categoria_activo: boolean | null
  modo_manejo: ModoManejoCodigo
  modo_manejo_nombre: string | null
  modo_manejo_descripcion: string | null
  requiere_regla_empaque: boolean
  requiere_serie: boolean
  permite_puchos: boolean
  // Perfil Paletizado
  id_empaque: number | null
  unidades_por_caja: number | null
  cajas_por_camada: number | null
  numero_camadas: number | null
  cajas_por_paleta: number | null
  unidades_por_paleta: number | null
  empaque_permite_puchos: boolean | null
  notas_armado: string | null
  imagen_armado_path: string | null
  largo_caja_cm: number | null
  ancho_caja_cm: number | null
  alto_caja_cm: number | null
  peso_caja_kg: number | null
  volumen_caja_m3: number | null
  volumen_paleta_m3: number | null
  // Perfil Serializado
  serial_peso_unitario_kg: number | null
  serial_largo_cm: number | null
  serial_ancho_cm: number | null
  serial_alto_cm: number | null
  serial_requiere_equipo_izaje: boolean | null
  serial_ubicacion_permitida: 'CAMPO' | 'RACK' | 'AMBAS' | null
  serial_atributos: Record<string, unknown> | null
  serial_notas: string | null
}

export type Supplier = {
  id_proveedor: number | string
  razon_social: string
  calificacion_otif?: number | null
  tiempo_lead_time_dias?: number | null
  activo: boolean
}

export type Rule = {
  id_empaque?: number | string
  id_producto?: number | string
  unidades_por_caja: number
  cajas_por_camada?: number
  numero_camadas?: number
  cajas_por_camita?: number
  camitas_por_paleta?: number
  volumen_caja_m3?: number | null
  volumen_total_m3?: number | null
  permite_puchos?: boolean
  notas_armado?: string | null
  imagen_armado_path?: string | null
  largo_caja_cm?: number | null
  ancho_caja_cm?: number | null
  alto_caja_cm?: number | null
  peso_caja_kg?: number | null
  alto_paleta_cm?: number | null
  peso_paleta_kg?: number | null
  producto?: { id_producto: number | string; sku: string; nombre: string; descripcion: string } | null
}

export type PalletPattern = {
  id_esquema: number | string
  id_producto?: number | string | null
  nombre: string
  cajas_por_fila: number
  filas_por_camada: number
  cajas_por_camada?: number
  numero_camadas: number
  alto_paleta_armada_cm?: number | null
  activo: boolean
  producto?: { id_producto: number | string; sku: string; nombre: string } | null
}

export function getProductRule(product: Product | null | undefined): Rule | null {
  if (!product || !product.regla_empaque) return null
  if (Array.isArray(product.regla_empaque)) {
    return product.regla_empaque.length > 0 ? product.regla_empaque[0] : null
  }
  if (typeof product.regla_empaque === 'object') {
    return product.regla_empaque as Rule
  }
  return null
}

export function getProductSerialProfile(product: Product | null | undefined): PerfilSerializado | null {
  if (!product || !product.perfil_serializado) return null
  if (Array.isArray(product.perfil_serializado)) {
    return product.perfil_serializado.length > 0 ? product.perfil_serializado[0] : null
  }
  if (typeof product.perfil_serializado === 'object') {
    return product.perfil_serializado as PerfilSerializado
  }
  return null
}

export type ProductFormData = {
  sku: string
  nombre: string
  descripcion: string
  id_categoria: string
  unidad_medida: string
  peso_unitario_kg: string
  costo_unitario: string
  clasificacion_abc: string
  activo: boolean
}

export type PackingFormData = {
  unidades_por_caja: string
  cajas_por_camada: string
  numero_camadas: string
  permite_puchos: boolean
  notas_armado: string
  largo_caja_cm: string
  ancho_caja_cm: string
  alto_caja_cm: string
  peso_caja_kg: string
}

export type SerializedFormData = {
  peso_unitario_kg: string
  largo_cm: string
  ancho_cm: string
  alto_cm: string
  requiere_equipo_izaje: boolean
  ubicacion_permitida: 'CAMPO' | 'RACK' | 'AMBAS'
  atributos: Record<string, unknown>
  notas: string
}

