export type CriticalStatus = 'CRITICO' | 'REORDEN' | 'OPTIMO'

export type ColumnDisplayFormat = 'entero' | 'decimal' | 'moneda_pen' | 'moneda_usd' | 'porcentaje'

export interface CustomProjectionColumn {
  id: string
  codigo_variable: string
  nombre: string
  formula: string
  formato?: ColumnDisplayFormat
  descripcion?: string
}

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
  formula_stock_redondeado?: string
  columnas_meses: string[]
  columnas_personalizadas?: CustomProjectionColumn[]
  mes_inicio_promedio?: string | null
  mes_fin_promedio?: string | null
  ignorar_meses_cero?: boolean
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
  meses_incluidos_promedio: string[]
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
  valores_personalizados?: Record<string, number>
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
  formula_stock_redondeado?: string
  mes_inicio_promedio?: string | null
  mes_fin_promedio?: string | null
  ignorar_meses_cero?: boolean
}

export type StandardCalculableColumnKey =
  | 'stock_min'
  | 'seguridad'
  | 'stock_min_f'
  | 'stock_min_redondeado'
  | 'compra_sugerida'
  | 'meses_duracion'

export type CalculableColumnKey = StandardCalculableColumnKey | string

export interface FormulaVariable {
  token: string
  label: string
  description: string
}

export interface FormulaPreset {
  id: string
  label: string
  formula: string
  description: string
}

export interface ColumnEquationConfig {
  key: CalculableColumnKey
  label: string
  headerTitle: string
  currentFormula: string
  availableVariables: FormulaVariable[]
  presets: FormulaPreset[]
  defaultFormula: string
  isCustom?: boolean
  format?: ColumnDisplayFormat
}
