export type ViewTab = 'productos' | 'categorias' | 'proveedores' | 'importacion'

export type Category = {
  id_categoria: number | string
  nombre: string
  descripcion: string | null
  activo?: boolean
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
  categoria?: { id_categoria?: number | string; nombre: string } | null
  regla_empaque?: Rule[] | Rule | null
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

export type ProductFormData = {
  sku: string
  descripcion: string
  id_categoria: string
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

