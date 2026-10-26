import { supabase } from '../lib/supabase'
import type {
  CalculableColumnKey,
  CalculatedProjectionRow,
  CustomProjectionColumn,
  ProjectionItem,
  ProjectionTemplate,
  TemplateParamsForm
} from '../types/projections'

// Plantillas predeterminadas de respaldo (idénticas a REPORTE ULTIMO TRIMESTRE.xlsx)
const DEFAULT_TEMPLATES: ProjectionTemplate[] = [
  {
    id_plantilla: 1,
    codigo: 'IMP_STO',
    nombre: 'Importaciones y Store',
    descripcion: 'Modelo dinámico de proyección para suministros de embalaje y paquetería de agencias',
    lead_time_meses: 3,
    seguridad_pct: 0.2,
    factor_compra: 2,
    dias_por_mes: 30,
    formula_stock_min: 'PROM_MEN * lead_time_meses',
    formula_seguridad: 'stock_min * seguridad_pct',
    formula_stock_min_f: 'stock_min + seguridad',
    formula_compra: 'stock_redondeado * factor_compra',
    formula_meses_duracion: '(stock_real * lead_time_meses) / stock_redondeado',
    formula_stock_redondeado: 'CEIL(STOCK_MIN_F / 1000) * 1000',
    columnas_meses: ['SEP', 'OCT', 'NOV', 'DIC', 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL'],
    mes_inicio_promedio: 'SEP',
    mes_fin_promedio: 'JUL',
    ignorar_meses_cero: true,
    activo: true
  },
  {
    id_plantilla: 2,
    codigo: 'CONST',
    nombre: 'Construcción y Mantenimiento',
    descripcion: 'Modelo de reposición para insumos de infraestructura, luminarias y cerámicos',
    lead_time_meses: 2,
    seguridad_pct: 0.1,
    factor_compra: 2,
    dias_por_mes: 30,
    formula_stock_min: 'PROM_MEN * lead_time_meses',
    formula_seguridad: 'stock_min * seguridad_pct',
    formula_stock_min_f: 'stock_min + seguridad',
    formula_compra: 'stock_redondeado * factor_compra',
    formula_meses_duracion: '(stock_real * lead_time_meses) / stock_redondeado',
    formula_stock_redondeado: 'CEIL(STOCK_MIN_F / 100) * 100',
    columnas_meses: [],
    mes_inicio_promedio: null,
    mes_fin_promedio: null,
    ignorar_meses_cero: true,
    activo: true
  }
]

// Ítems predeterminados de Importaciones / Store
const DEFAULT_IMP_STO_ITEMS: ProjectionItem[] = [
  {
    id_item: 1,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'BOLSA SEG. GRANDE',
    datos_meses: { SEP: -22400, OCT: -2200, NOV: -18400, DIC: -14800, ENE: -16200, FEB: -15000, MAR: -89600, ABR: -22000, MAY: -12500, JUN: -2500, JUL: -16000 },
    promedio_manual: 15000,
    stock_manual: 48500,
    stock_redondeado_manual: 60000,
    orden_fila: 1,
    activo: true
  },
  {
    id_item: 2,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'BOLSA SEG. MEDIANA',
    datos_meses: { SEP: 0, OCT: 0, NOV: -3800, DIC: -16200, ENE: -7400, FEB: -300, MAR: -10000, ABR: 0, MAY: 0, JUN: 0, JUL: 0 },
    promedio_manual: 5000,
    stock_manual: 193000,
    stock_redondeado_manual: 40000,
    orden_fila: 2,
    activo: true
  },
  {
    id_item: 3,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'BOLSA SEG. PEQUEÑO',
    datos_meses: { SEP: -11000, OCT: -14800, NOV: -11100, DIC: -13600, ENE: -10200, FEB: -10200, MAR: -6800, ABR: 0, MAY: 0, JUN: 0, JUL: 0 },
    promedio_manual: 10000,
    stock_manual: 141500,
    stock_redondeado_manual: 40000,
    orden_fila: 3,
    activo: true
  },
  {
    id_item: 4,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'BURBUPACK- 50 CM',
    datos_meses: { SEP: -2106, OCT: -2610, NOV: -2800, DIC: -2401, ENE: -2300, FEB: -2000, MAR: -2220, ABR: -3600, MAY: -2400, JUN: -3500, JUL: -2400 },
    promedio_manual: 3000,
    stock_manual: 30000,
    stock_redondeado_manual: 15000,
    orden_fila: 4,
    activo: true
  },
  {
    id_item: 5,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'CINTAS-EMBALAJE 2 X 100 YDS',
    datos_meses: { SEP: -864, OCT: -1152, NOV: -1800, DIC: -1008, ENE: -936, FEB: -792, MAR: -1080, ABR: -2592, MAY: -4824, JUN: -2448, JUL: -1080 },
    promedio_manual: 1200,
    stock_manual: 2584,
    stock_redondeado_manual: 4000,
    orden_fila: 5,
    activo: true
  },
  {
    id_item: 6,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'CINTAS-EMBALAJE 2 X 50 YDS',
    datos_meses: { SEP: 0, OCT: 0, NOV: 0, DIC: 0, ENE: 0, FEB: 0, MAR: -8220, ABR: 0, MAY: 0, JUN: 0, JUL: 0 },
    promedio_manual: 12000,
    stock_manual: 80000,
    stock_redondeado_manual: 40000,
    orden_fila: 6,
    activo: true
  },
  {
    id_item: 7,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'CONTOMETRO',
    datos_meses: { SEP: -14505, OCT: -17100, NOV: -19200, DIC: -26850, ENE: -21300, FEB: -17400, MAR: -21750, ABR: -25200, MAY: -600, JUN: -23850, JUL: -36000 },
    promedio_manual: 22000,
    stock_manual: 98000,
    stock_redondeado_manual: 90000,
    orden_fila: 7,
    activo: true
  },
  {
    id_item: 8,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'PAQUETE S',
    datos_meses: { SEP: -9784, OCT: -10375, NOV: -11304, DIC: -10925, ENE: -13971, FEB: -14482, MAR: -14860, ABR: -17880, MAY: -15400, JUN: -16000, JUL: -14800 },
    promedio_manual: 15000,
    stock_manual: 101820,
    stock_redondeado_manual: 60000,
    orden_fila: 8,
    activo: true
  },
  {
    id_item: 9,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'PAQUETE XS',
    datos_meses: { SEP: -15083, OCT: -16523, NOV: -9625, DIC: -23439, ENE: -22876, FEB: -17770, MAR: -26200, ABR: -18920, MAY: 0, JUN: -19800, JUL: -12800 },
    promedio_manual: 15000,
    stock_manual: 229000,
    stock_redondeado_manual: 60000,
    orden_fila: 9,
    activo: true
  },
  {
    id_item: 10,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'PAQUETE XXS',
    datos_meses: { SEP: -44666, OCT: -30050, NOV: -58957, DIC: -45007, ENE: -44646, FEB: -45442, MAR: -40000, ABR: -14800, MAY: -39860, JUN: -26800, JUL: -45000 },
    promedio_manual: 35000,
    stock_manual: 151067,
    stock_redondeado_manual: 130000,
    orden_fila: 10,
    activo: true
  },
  {
    id_item: 11,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'PRECINTO-PQT 100 UND-20 CM',
    datos_meses: { SEP: 0, OCT: 0, NOV: 0, DIC: 0, ENE: 0, FEB: 0, MAR: 0, ABR: -1800, MAY: 0, JUN: 0, JUL: -500 },
    promedio_manual: 450,
    stock_manual: 500000,
    stock_redondeado_manual: 250000,
    orden_fila: 11,
    activo: true
  },
  {
    id_item: 12,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'PRECINTO-PQT 100 UND-30 CM',
    datos_meses: { SEP: 0, OCT: 0, NOV: 0, DIC: 0, ENE: 0, FEB: 0, MAR: 0, ABR: 0, MAY: 0, JUN: -800, JUL: -1800 },
    promedio_manual: 1300,
    stock_manual: 3800,
    stock_redondeado_manual: 5000,
    orden_fila: 12,
    activo: true
  },
  {
    id_item: 13,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'ROLLO QR DIRECTO',
    datos_meses: { SEP: -3460, OCT: 0, NOV: 0, DIC: 0, ENE: -3456, FEB: -3456, MAR: -3456, ABR: -1728, MAY: -3456, JUN: -3456, JUL: -3456 },
    promedio_manual: 18000,
    stock_manual: 13632,
    stock_redondeado_manual: 65000,
    orden_fila: 13,
    activo: true
  },
  {
    id_item: 14,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'SACO DE LONA',
    datos_meses: { SEP: 0, OCT: 0, NOV: 0, DIC: 0, ENE: -660, FEB: -1700, MAR: -1130, ABR: -235, MAY: -60, JUN: 0, JUL: 0 },
    promedio_manual: 143,
    stock_manual: 6000,
    stock_redondeado_manual: 5000,
    orden_fila: 14,
    activo: true
  },
  {
    id_item: 15,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'SOBRE DE BURBUJA GRANDE 260x320+45mm',
    datos_meses: { SEP: -12000, OCT: -15000, NOV: -16000, DIC: -18000, ENE: -14000, FEB: -15000, MAR: -16000, ABR: -17000, MAY: -14000, JUN: -15000, JUL: -16000 },
    promedio_manual: 15000,
    stock_manual: 77000,
    stock_redondeado_manual: 40000,
    orden_fila: 15,
    activo: true
  },
  {
    id_item: 16,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'SOBRE DE BURBUJA MEDIANO 220x250+45mm',
    datos_meses: { SEP: -14000, OCT: -16000, NOV: -15000, DIC: -19000, ENE: -15000, FEB: -14000, MAR: -15000, ABR: -16000, MAY: -13000, JUN: -14000, JUL: -15000 },
    promedio_manual: 15000,
    stock_manual: 48400,
    stock_redondeado_manual: 40000,
    orden_fila: 16,
    activo: true
  },
  {
    id_item: 17,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'SOBRE DE BURBUJA PEQUEÑO 130x180+45mm',
    datos_meses: { SEP: -4000, OCT: -5000, NOV: -6000, DIC: -5500, ENE: -4800, FEB: -5200, MAR: -5000, ABR: -5500, MAY: -4600, JUN: -5000, JUL: -5400 },
    promedio_manual: 5000,
    stock_manual: 68800,
    stock_redondeado_manual: 40000,
    orden_fila: 17,
    activo: true
  },
  {
    id_item: 18,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'SOBRE DE CARTON VERTICAL 250x345+50MM',
    datos_meses: { SEP: -10000, OCT: -12000, NOV: -13000, DIC: -15000, ENE: -11000, FEB: -12000, MAR: -13000, ABR: -14000, MAY: -11000, JUN: -12000, JUL: -13000 },
    promedio_manual: 12000,
    stock_manual: 62300,
    stock_redondeado_manual: 40000,
    orden_fila: 18,
    activo: true
  },
  {
    id_item: 19,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'STRECH FILM - 15',
    datos_meses: { SEP: -1800, OCT: -2000, NOV: -2200, DIC: -2500, ENE: -1900, FEB: -2100, MAR: -2000, ABR: -2300, MAY: -1800, JUN: -2000, JUL: -2200 },
    promedio_manual: 2000,
    stock_manual: 54400,
    stock_redondeado_manual: 10000,
    orden_fila: 19,
    activo: true
  },
  {
    id_item: 20,
    id_plantilla: 1,
    id_producto: null,
    nombre_producto: 'STRECH FILM- 15/2Kg (EMBALAJE)',
    datos_meses: { SEP: -800, OCT: -900, NOV: -1000, DIC: -1200, ENE: -850, FEB: -950, MAR: -900, ABR: -1100, MAY: -800, JUN: -900, JUL: -950 },
    promedio_manual: 900,
    stock_manual: 13036,
    stock_redondeado_manual: 5000,
    orden_fila: 20,
    activo: true
  }
]

// Ítems predeterminados de Construcción
const DEFAULT_CONST_ITEMS: ProjectionItem[] = [
  { id_item: 101, id_plantilla: 2, id_producto: null, nombre_producto: 'CERAMICO GRIS 60X60 SRK66013', datos_meses: {}, promedio_manual: null, stock_manual: 1329, stock_redondeado_manual: 500, orden_fila: 1, activo: true },
  { id_item: 102, id_plantilla: 2, id_producto: null, nombre_producto: 'PORCELANATO GRIS CHISPEADO 60X60 SRK 76121 A1', datos_meses: {}, promedio_manual: null, stock_manual: 471, stock_redondeado_manual: 600, orden_fila: 2, activo: true },
  { id_item: 103, id_plantilla: 2, id_producto: null, nombre_producto: 'CERAMICO BLANCO 30X60 LLG36001', datos_meses: {}, promedio_manual: null, stock_manual: 720, stock_redondeado_manual: 400, orden_fila: 3, activo: true },
  { id_item: 104, id_plantilla: 2, id_producto: null, nombre_producto: 'LUMINARIA HIGH BAY LED 6500K LEDVANCE 150W', datos_meses: {}, promedio_manual: null, stock_manual: 193, stock_redondeado_manual: 70, orden_fila: 4, activo: true },
  { id_item: 105, id_plantilla: 2, id_producto: null, nombre_producto: 'LUMINARIA TIPO PANEL LED 22W 2000LM', datos_meses: {}, promedio_manual: null, stock_manual: 90, stock_redondeado_manual: 70, orden_fila: 5, activo: true },
  { id_item: 106, id_plantilla: 2, id_producto: null, nombre_producto: 'LUMINARIA TIPO PANEL LED 40W 4000LM', datos_meses: {}, promedio_manual: null, stock_manual: 300, stock_redondeado_manual: 80, orden_fila: 6, activo: true },
  { id_item: 107, id_plantilla: 2, id_producto: null, nombre_producto: 'DETECTOR DE HUMO HAGROY', datos_meses: {}, promedio_manual: null, stock_manual: 63, stock_redondeado_manual: 30, orden_fila: 7, activo: true },
  { id_item: 108, id_plantilla: 2, id_producto: null, nombre_producto: 'REFLECTOR LED 200W 6500K PHILIPS', datos_meses: {}, promedio_manual: null, stock_manual: 75, stock_redondeado_manual: 30, orden_fila: 8, activo: true },
  { id_item: 109, id_plantilla: 2, id_producto: null, nombre_producto: 'ESTACION MANUAL DOBLE ACCION HAGROY', datos_meses: {}, promedio_manual: null, stock_manual: 46, stock_redondeado_manual: 30, orden_fila: 9, activo: true },
  { id_item: 110, id_plantilla: 2, id_producto: null, nombre_producto: 'SIRENA ESTROBOSCOPICA HAGROY', datos_meses: {}, promedio_manual: null, stock_manual: 46, stock_redondeado_manual: 30, orden_fila: 10, activo: true }
]

export const projectionService = {
  // 1. Obtener plantillas
  async getTemplates(): Promise<ProjectionTemplate[]> {
    try {
      const { data, error } = await supabase
        .from('plantilla_proyeccion')
        .select('*')
        .eq('activo', true)
        .order('id_plantilla', { ascending: true })

      const rawList =
        error || !data || data.length === 0 ? DEFAULT_TEMPLATES : (data as ProjectionTemplate[])

      return rawList.map((tpl) => {
        let customCols: CustomProjectionColumn[] = []
        if (Array.isArray(tpl.columnas_personalizadas) && tpl.columnas_personalizadas.length > 0) {
          customCols = tpl.columnas_personalizadas
        } else {
          try {
            const stored = localStorage.getItem(`shalom_custom_columns_${tpl.id_plantilla}`)
            if (stored) {
              const parsed = JSON.parse(stored)
              if (Array.isArray(parsed)) customCols = parsed
            }
          } catch {}
        }
        return {
          ...tpl,
          columnas_personalizadas: customCols
        }
      })
    } catch {
      return DEFAULT_TEMPLATES.map((tpl) => {
        let customCols: CustomProjectionColumn[] = []
        try {
          const stored = localStorage.getItem(`shalom_custom_columns_${tpl.id_plantilla}`)
          if (stored) {
            const parsed = JSON.parse(stored)
            if (Array.isArray(parsed)) customCols = parsed
          }
        } catch {}
        return { ...tpl, columnas_personalizadas: customCols }
      })
    }
  },

  // 2. Obtener ítems de una plantilla
  async getItems(id_plantilla: number, templateCodigo?: string): Promise<ProjectionItem[]> {
    try {
      const { data, error } = await supabase
        .from('item_proyeccion')
        .select('*')
        .eq('id_plantilla', id_plantilla)
        .eq('activo', true)
        .order('orden_fila', { ascending: true })

      if (error || !data || data.length === 0) {
        if (templateCodigo === 'CONST' || id_plantilla === 2) {
          return DEFAULT_CONST_ITEMS
        }
        return DEFAULT_IMP_STO_ITEMS
      }

      return data.map((item: any) => ({
        id_item: item.id_item,
        id_plantilla: item.id_plantilla,
        id_producto: item.id_producto,
        nombre_producto: item.nombre_producto,
        datos_meses: item.datos_meses || {},
        promedio_manual: item.promedio_manual,
        stock_manual: item.stock_manual,
        stock_redondeado_manual: item.stock_redondeado_manual,
        orden_fila: item.orden_fila,
        activo: item.activo
      }))
    } catch {
      if (templateCodigo === 'CONST' || id_plantilla === 2) {
        return DEFAULT_CONST_ITEMS
      }
      return DEFAULT_IMP_STO_ITEMS
    }
  },

  // 3. Obtener mapa de stock real en vivo desde almacén
  async getLiveStockMap(): Promise<Map<string, number>> {
    const stockMap = new Map<string, number>()
    try {
      const { data, error } = await supabase
        .from('inventario')
        .select(`
          stock_real,
          producto (
            nombre,
            sku
          )
        `)

      if (!error && data) {
        for (const row of data as any[]) {
          if (row.producto?.nombre) {
            const current = stockMap.get(row.producto.nombre) || 0
            stockMap.set(row.producto.nombre, current + Number(row.stock_real || 0))
          }
        }
      }
    } catch (err) {
      console.warn('Advertencia al consultar stock real en vivo:', err)
    }
    return stockMap
  },

  // 4. Actualizar parámetros o fórmulas de una plantilla
  async updateTemplateParams(
    id_plantilla: number,
    form: TemplateParamsForm
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const payload: Record<string, any> = {
        lead_time_meses: form.lead_time_meses,
        seguridad_pct: form.seguridad_pct,
        factor_compra: form.factor_compra,
        dias_por_mes: form.dias_por_mes,
        updated_at: new Date().toISOString()
      }

      if (form.formula_stock_min !== undefined) payload.formula_stock_min = form.formula_stock_min
      if (form.formula_seguridad !== undefined) payload.formula_seguridad = form.formula_seguridad
      if (form.formula_stock_min_f !== undefined) payload.formula_stock_min_f = form.formula_stock_min_f
      if (form.formula_compra !== undefined) payload.formula_compra = form.formula_compra
      if (form.formula_meses_duracion !== undefined) payload.formula_meses_duracion = form.formula_meses_duracion
      if (form.formula_stock_redondeado !== undefined) payload.formula_stock_redondeado = form.formula_stock_redondeado
      if (form.mes_inicio_promedio !== undefined) payload.mes_inicio_promedio = form.mes_inicio_promedio
      if (form.mes_fin_promedio !== undefined) payload.mes_fin_promedio = form.mes_fin_promedio
      if (form.ignorar_meses_cero !== undefined) payload.ignorar_meses_cero = form.ignorar_meses_cero

      const { error } = await supabase
        .from('plantilla_proyeccion')
        .update(payload)
        .eq('id_plantilla', id_plantilla)

      if (error) {
        // Si falló por columnas adicionales no migradas aún, reintentar con las columnas base
        const fallbackPayload = {
          lead_time_meses: form.lead_time_meses,
          seguridad_pct: form.seguridad_pct,
          factor_compra: form.factor_compra,
          dias_por_mes: form.dias_por_mes,
          updated_at: new Date().toISOString()
        }
        const { error: fallbackErr } = await supabase
          .from('plantilla_proyeccion')
          .update(fallbackPayload)
          .eq('id_plantilla', id_plantilla)

        if (fallbackErr) {
          return { success: false, error: fallbackErr.message }
        }
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'Error al actualizar parámetros.' }
    }
  },

  // 4b. Guardar y persistir columnas personalizadas de la plantilla
  async saveCustomColumns(
    id_plantilla: number,
    columns: CustomProjectionColumn[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      localStorage.setItem(`shalom_custom_columns_${id_plantilla}`, JSON.stringify(columns))
      const { error } = await supabase
        .from('plantilla_proyeccion')
        .update({
          columnas_personalizadas: columns,
          updated_at: new Date().toISOString()
        })
        .eq('id_plantilla', id_plantilla)

      if (error) {
        console.warn('Aviso de persistencia remota para columnas personalizadas:', error.message)
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  // 4c. Actualizar la ecuación de una columna específica (estándar o personalizada)
  async updateColumnFormula(
    id_plantilla: number,
    columnKey: CalculableColumnKey,
    newFormula: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const columnFieldMap: Record<string, string> = {
        stock_min: 'formula_stock_min',
        seguridad: 'formula_seguridad',
        stock_min_f: 'formula_stock_min_f',
        stock_min_redondeado: 'formula_stock_redondeado',
        compra_sugerida: 'formula_compra',
        meses_duracion: 'formula_meses_duracion'
      }

      const dbField = columnFieldMap[columnKey]
      if (!dbField) {
        // Columna personalizada
        try {
          const stored = localStorage.getItem(`shalom_custom_columns_${id_plantilla}`)
          let customCols: CustomProjectionColumn[] = stored ? JSON.parse(stored) : []
          const found = customCols.find((c) => c.id === columnKey)
          if (found) {
            customCols = customCols.map((c) =>
              c.id === columnKey ? { ...c, formula: newFormula } : c
            )
            return this.saveCustomColumns(id_plantilla, customCols)
          }
        } catch {}
        return { success: false, error: `Columna no configurable: ${columnKey}` }
      }

      const { error } = await supabase
        .from('plantilla_proyeccion')
        .update({
          [dbField]: newFormula,
          updated_at: new Date().toISOString()
        })
        .eq('id_plantilla', id_plantilla)

      if (error) {
        console.warn(`Aviso de persistencia en Supabase para ${dbField}:`, error.message)
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  // 4c. Actualizar rango de meses para cálculo de promedio
  async updateMonthRange(
    id_plantilla: number,
    startMonth: string | null,
    endMonth: string | null,
    ignoreZero: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('plantilla_proyeccion')
        .update({
          mes_inicio_promedio: startMonth,
          mes_fin_promedio: endMonth,
          ignorar_meses_cero: ignoreZero,
          updated_at: new Date().toISOString()
        })
        .eq('id_plantilla', id_plantilla)

      if (error) {
        console.warn('Aviso de persistencia en Supabase para rango de meses:', error.message)
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  // 5. Guardar edición de una celda individual
  async updateItemCell(
    id_item: number,
    updates: Partial<ProjectionItem>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const payload: any = { updated_at: new Date().toISOString() }

      if (updates.datos_meses !== undefined) payload.datos_meses = updates.datos_meses
      if (updates.promedio_manual !== undefined) payload.promedio_manual = updates.promedio_manual
      if (updates.stock_manual !== undefined) payload.stock_manual = updates.stock_manual
      if (updates.stock_redondeado_manual !== undefined) payload.stock_redondeado_manual = updates.stock_redondeado_manual
      if (updates.nombre_producto !== undefined) payload.nombre_producto = updates.nombre_producto

      const { error } = await supabase
        .from('item_proyeccion')
        .update(payload)
        .eq('id_item', id_item)

      if (error) {
        console.warn('Error al guardar celda en base de datos:', error)
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  // 6. Agregar nueva columna de mes
  async addMonthColumn(
    id_plantilla: number,
    currentMonths: string[],
    newMonth: string
  ): Promise<{ success: boolean; error?: string }> {
    const cleanMonth = newMonth.trim().toUpperCase()
    if (!cleanMonth || currentMonths.includes(cleanMonth)) {
      return { success: false, error: 'El nombre de mes no es válido o ya existe.' }
    }

    const updatedMonths = [...currentMonths, cleanMonth]
    try {
      const { error } = await supabase
        .from('plantilla_proyeccion')
        .update({
          columnas_meses: updatedMonths,
          updated_at: new Date().toISOString()
        })
        .eq('id_plantilla', id_plantilla)

      if (error) return { success: false, error: error.message }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  // 7. Agregar nuevo producto a la matriz
  async addItem(
    id_plantilla: number,
    nombreProducto: string,
    initialStock: number = 0
  ): Promise<{ success: boolean; newItem?: ProjectionItem; error?: string }> {
    const cleanName = nombreProducto.trim().toUpperCase()
    if (!cleanName) {
      return { success: false, error: 'El nombre del producto es obligatorio.' }
    }

    try {
      const { data, error } = await supabase
        .from('item_proyeccion')
        .insert({
          id_plantilla,
          nombre_producto: cleanName,
          datos_meses: {},
          stock_manual: initialStock,
          orden_fila: 999
        })
        .select('*')
        .single()

      if (error || !data) {
        // Fallback local
        const localItem: ProjectionItem = {
          id_item: Date.now(),
          id_plantilla,
          id_producto: null,
          nombre_producto: cleanName,
          datos_meses: {},
          promedio_manual: null,
          stock_manual: initialStock,
          stock_redondeado_manual: null,
          orden_fila: 999,
          activo: true
        }
        return { success: true, newItem: localItem }
      }

      return {
        success: true,
        newItem: {
          id_item: data.id_item,
          id_plantilla: data.id_plantilla,
          id_producto: data.id_producto,
          nombre_producto: data.nombre_producto,
          datos_meses: data.datos_meses || {},
          promedio_manual: data.promedio_manual,
          stock_manual: data.stock_manual,
          stock_redondeado_manual: data.stock_redondeado_manual,
          orden_fila: data.orden_fila,
          activo: data.activo
        }
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  // 8. Eliminar producto de la matriz
  async deleteItem(id_item: number): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('item_proyeccion')
        .delete()
        .eq('id_item', id_item)

      if (error) {
        return { success: false, error: error.message }
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  // 9. Generar Orden de Importación consolidada desde la selección grupal
  async createImportOrderFromProjection(
    numeroOrden: string,
    tipoContenedor: '40FT' | '20FT' | 'LCL',
    selectedRows: CalculatedProjectionRow[]
  ): Promise<{ success: boolean; id_orden?: number; error?: string }> {
    if (!numeroOrden.trim()) {
      return { success: false, error: 'El número de orden es obligatorio.' }
    }

    if (selectedRows.length === 0) {
      return { success: false, error: 'Debe seleccionar al menos un producto con cantidad de compra sugerida.' }
    }

    try {
      // 1. Insertar orden en public.orden_importacion
      const { data: orden, error: ordenError } = await supabase
        .from('orden_importacion')
        .insert({
          numero_orden: numeroOrden.trim().toUpperCase(),
          estado: 'TRANSITO',
          tipo_contenedor: tipoContenedor,
          fecha_emision: new Date().toISOString().split('T')[0]
        })
        .select('id_orden')
        .single()

      if (ordenError || !orden) {
        return { success: false, error: ordenError?.message || 'Error al crear la orden de importación.' }
      }

      // 2. Asociar ítems en detalle_orden (buscar o crear producto si es necesario)
      const { data: productosExistentes } = await supabase
        .from('producto')
        .select('id_producto, nombre, sku')

      const prodMapByName = new Map<string, number>()
      for (const p of productosExistentes || []) {
        prodMapByName.set(p.nombre.toUpperCase(), p.id_producto)
        prodMapByName.set(p.sku.toUpperCase(), p.id_producto)
      }

      const detalles = []
      for (const row of selectedRows) {
        let idProd = row.id_producto || prodMapByName.get(row.nombre_producto.toUpperCase())

        // Si el producto no existe en el catálogo maestro, se crea automáticamente para permitir la trazabilidad
        if (!idProd) {
          const autoSku = 'SKU-' + row.nombre_producto.slice(0, 8).replace(/[^A-Z0-9]/g, '') + '-' + Math.floor(Math.random() * 1000)
          const { data: newProd } = await supabase
            .from('producto')
            .insert({
              sku: autoSku,
              nombre: row.nombre_producto
            })
            .select('id_producto')
            .single()

          if (newProd && typeof newProd.id_producto === 'number') {
            idProd = newProd.id_producto
            prodMapByName.set(row.nombre_producto.toUpperCase(), newProd.id_producto)
          }
        }

        if (idProd && row.compra_sugerida > 0) {
          detalles.push({
            id_orden: orden.id_orden,
            id_producto: idProd,
            cantidad_pedida: row.compra_sugerida
          })
        }
      }

      if (detalles.length > 0) {
        const { error: detalleError } = await supabase
          .from('detalle_orden')
          .insert(detalles)

        if (detalleError) {
          console.error('Error insertando detalle de orden:', detalleError)
        }
      }

      return { success: true, id_orden: orden.id_orden }
    } catch (err: any) {
      return { success: false, error: err.message || 'Error inesperado al generar la orden.' }
    }
  }
}
