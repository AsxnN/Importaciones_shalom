export type CriticalStatus = 'CRITICO' | 'REORDEN' | 'OPTIMO'

export interface ProjectionTemplate {
  id_plantilla: number
  codigo: string
  nombre: string
  descripcion: string | null
  lead_time_meses: number
  seguridad_pct: number
  factor_compra: number
  dias_por_mes: number
  formula_stock_min: string
  formula_seguridad: string
  formula_stock_min_f: string
  formula_compra: string
  formula_meses_duracion: string
  columnas_meses: string[]
  activo: boolean
}

export interface ProjectionItem {
  id_item: number
  id_plantilla: number
  id_producto: number | null
  nombre_producto: string
  datos_meses: Record<string, number>
  promedio_manual: number | null
  stock_manual: number | null
  stock_redondeado_manual: number | null
  orden_fila: number
  activo: boolean
}

export interface CalculatedProjectionRow {
  id_item: number
  id_plantilla: number
  id_producto: number | null
  nombre_producto: string
  datos_meses: Record<string, number>
  promedio_calculado: number
  promedio_final: number
  stock_real: number
  stock_min: number
  seguridad: number
  stock_min_f: number
  stock_min_redondeado: number
  compra_sugerida: number
  meses_duracion: number
  texto_duracion: string
  fecha_quiebre: string
  estado_critico: CriticalStatus
}

export interface TemplateParamsForm {
  lead_time_meses: number
  seguridad_pct: number
  factor_compra: number
  dias_por_mes: number
  formula_stock_min?: string
  formula_seguridad?: string
  formula_stock_min_f?: string
  formula_compra?: string
  formula_meses_duracion?: string
}
