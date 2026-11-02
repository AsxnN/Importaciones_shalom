import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import type {
  CalculableColumnKey,
  CalculatedProjectionRow,
  CustomProjectionColumn,
  ExcelImportResult,
  ProjectionItem,
  ProjectionOrder,
  ProjectionOrderStatus,
  ProjectionTemplate,
  TemplateParamsForm
} from '../types/projections'

export const LOCAL_STORAGE_ORDERS_KEY = 'shalom_projection_orders_v1'

const DEFAULT_ORDERS: ProjectionOrder[] = [
  {
    id_orden: 1,
    numero_orden: 'IMP-2026-001',
    descripcion: 'Campaña Suministros Agencias · 1er Semestre',
    id_plantilla: 1,
    id_proveedor: 1,
    estado: 'RECIBIDA',
    fecha_emision: '2026-08-15',
    tipo_contenedor: '40FT',
    volumen_ocupado_m3: 58.5,
    total_items: 20,
    total_unidades: 245000,
    proveedor: {
      id_proveedor: 1,
      razon_social: 'Wenzhou Packaging Co. Ltd',
      nombre: 'Wenzhou Packaging Co. Ltd'
    },
    detalles: [
      { id_producto: 1, cantidad_pedida: 120000, producto: { sku: 'SKU-00001', nombre: 'BOLSA SEG. GRANDE' } },
      { id_producto: 2, cantidad_pedida: 80000, producto: { sku: 'SKU-00002', nombre: 'BOLSA SEG. MEDIANA' } },
      { id_producto: 3, cantidad_pedida: 45000, producto: { sku: 'SKU-00003', nombre: 'BOLSA SEG. PEQUEÑO' } }
    ]
  },
  {
    id_orden: 2,
    numero_orden: 'IMP-2026-002',
    descripcion: 'Reposición Rollos Térmicos y Contómetros',
    id_plantilla: 1,
    id_proveedor: 1,
    estado: 'TRANSITO',
    fecha_emision: '2026-10-10',
    tipo_contenedor: '40FT',
    volumen_ocupado_m3: 62.0,
    total_items: 6,
    total_unidades: 180000,
    proveedor: {
      id_proveedor: 1,
      razon_social: 'Shenzhen Thermal Paper Tech',
      nombre: 'Shenzhen Thermal Paper Tech'
    },
    detalles: [
      { id_producto: 8, cantidad_pedida: 180000, producto: { sku: 'SKU-00008', nombre: 'CONTOMETRO' } }
    ]
  },
  {
    id_orden: 3,
    numero_orden: 'IMP-2026-003',
    descripcion: 'Proyección Campaña Verano 2027 (En Simulación)',
    id_plantilla: 1,
    id_proveedor: 1,
    estado: 'BORRADOR',
    fecha_emision: '2026-11-01',
    tipo_contenedor: '40FT',
    volumen_ocupado_m3: 45.0,
    total_items: 20,
    total_unidades: 310000,
    proveedor: {
      id_proveedor: 1,
      razon_social: 'Wenzhou Packaging Co. Ltd',
      nombre: 'Wenzhou Packaging Co. Ltd'
    }
  }
]

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
  },

  // 10. GESTIÓN INTEGRAL DE ÓRDENES Y PROYECCIONES PERIÓDICAS
  async getOrders(): Promise<ProjectionOrder[]> {
    try {
      const { data, error } = await supabase
        .from('orden_importacion')
        .select(`
          id_orden,
          numero_orden,
          descripcion,
          id_plantilla,
          id_proveedor,
          estado,
          fecha_emision,
          tipo_contenedor,
          volumen_ocupado_m3,
          total_items,
          total_unidades,
          snapshot_proyeccion,
          proveedor ( id_proveedor, razon_social ),
          detalle_orden (
            id_detalle,
            id_orden,
            id_producto,
            cantidad_pedida,
            subtotal_peso_kg,
            subtotal_volumen_m3,
            producto ( id_producto, sku, nombre )
          )
        `)
        .order('fecha_emision', { ascending: false })
        .order('id_orden', { ascending: false })

      if (!error && data && data.length > 0) {
        const formatted: ProjectionOrder[] = data.map((ord: any) => {
          const detalles = ord.detalle_orden || []
          const calcItems = ord.total_items || detalles.length
          const calcUnits =
            ord.total_unidades ||
            detalles.reduce((acc: number, d: any) => acc + (Number(d.cantidad_pedida) || 0), 0)

          return {
            id_orden: ord.id_orden,
            numero_orden: ord.numero_orden,
            descripcion: ord.descripcion || `Orden de importación ${ord.numero_orden}`,
            id_plantilla: ord.id_plantilla || 1,
            id_proveedor: ord.id_proveedor,
            estado: (ord.estado as ProjectionOrderStatus) || 'BORRADOR',
            fecha_emision: ord.fecha_emision || new Date().toISOString().split('T')[0],
            tipo_contenedor: ord.tipo_contenedor || '40FT',
            volumen_ocupado_m3: ord.volumen_ocupado_m3 || null,
            total_items: calcItems,
            total_unidades: calcUnits,
            proveedor: ord.proveedor
              ? {
                  id_proveedor: ord.proveedor.id_proveedor,
                  razon_social: ord.proveedor.razon_social,
                  nombre: ord.proveedor.razon_social
                }
              : null,
            detalles: detalles.map((d: any) => ({
              id_detalle: d.id_detalle,
              id_orden: d.id_orden,
              id_producto: d.id_producto,
              cantidad_pedida: d.cantidad_pedida,
              subtotal_peso_kg: d.subtotal_peso_kg,
              subtotal_volumen_m3: d.subtotal_volumen_m3,
              producto: d.producto
                ? {
                    id_producto: d.producto.id_producto,
                    sku: d.producto.sku,
                    nombre: d.producto.nombre
                  }
                : undefined
            })),
            snapshot_proyeccion: ord.snapshot_proyeccion || null
          }
        })
        localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(formatted))
        return formatted
      }
    } catch (err) {
      console.warn('Error fetching orders from Supabase, relying on localStorage fallback:', err)
    }

    // Fallback con localStorage o semillas por defecto
    const cached = localStorage.getItem(LOCAL_STORAGE_ORDERS_KEY)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      } catch {
        // fallback a semillas
      }
    }

    localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(DEFAULT_ORDERS))
    return DEFAULT_ORDERS
  },

  async createOrder(payload: {
    numero_orden: string
    descripcion?: string
    id_plantilla?: number
    id_proveedor?: number | null
    tipo_contenedor?: '20FT' | '40FT' | 'LCL'
    estado?: ProjectionOrderStatus
    fecha_emision?: string
    snapshot_proyeccion?: any
    items?: Array<{ id_producto?: number; nombre_producto: string; cantidad_pedida: number }>
  }): Promise<{ success: boolean; id_orden?: number; order?: ProjectionOrder; error?: string }> {
    const cleanNum = payload.numero_orden.trim().toUpperCase()
    if (!cleanNum) {
      return { success: false, error: 'El número de orden es obligatorio.' }
    }
    const cleanDesc = payload.descripcion?.trim() || `Planificación ${cleanNum}`
    const plantillaId = payload.id_plantilla || 1
    const container = payload.tipo_contenedor || '40FT'
    const status = payload.estado || 'BORRADOR'
    const emision = payload.fecha_emision || new Date().toISOString().split('T')[0]

    let newId = Date.now()

    try {
      const { data, error } = await supabase
        .from('orden_importacion')
        .insert({
          numero_orden: cleanNum,
          descripcion: cleanDesc,
          id_plantilla: plantillaId,
          id_proveedor: payload.id_proveedor || null,
          tipo_contenedor: container,
          estado: status,
          fecha_emision: emision,
          snapshot_proyeccion: payload.snapshot_proyeccion || {}
        })
        .select('id_orden')
        .single()

      if (!error && data?.id_orden) {
        newId = data.id_orden
      }
    } catch (err) {
      console.warn('Supabase insert failed, continuing with fallback:', err)
    }

    const newOrder: ProjectionOrder = {
      id_orden: newId,
      numero_orden: cleanNum,
      descripcion: cleanDesc,
      id_plantilla: plantillaId,
      id_proveedor: payload.id_proveedor || null,
      estado: status,
      fecha_emision: emision,
      tipo_contenedor: container,
      total_items: payload.items?.length || 0,
      total_unidades: payload.items?.reduce((s, i) => s + (Number(i.cantidad_pedida) || 0), 0) || 0,
      snapshot_proyeccion: payload.snapshot_proyeccion || null,
      detalles:
        payload.items?.map((it, idx) => ({
          id_detalle: idx + 1,
          id_orden: newId,
          id_producto: it.id_producto || idx + 1,
          cantidad_pedida: it.cantidad_pedida,
          producto: { sku: `SKU-${idx + 1}`, nombre: it.nombre_producto }
        })) || []
    }

    const currentOrders = await this.getOrders()
    const updatedOrders = [newOrder, ...currentOrders.filter((o) => o.numero_orden !== cleanNum)]
    localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(updatedOrders))

    return { success: true, id_orden: newId, order: newOrder }
  },

  async updateOrder(
    id_orden: number,
    updates: Partial<ProjectionOrder>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const dbPayload: any = {}
      if (updates.estado) dbPayload.estado = updates.estado
      if (updates.descripcion) dbPayload.descripcion = updates.descripcion
      if (updates.tipo_contenedor) dbPayload.tipo_contenedor = updates.tipo_contenedor
      if (updates.snapshot_proyeccion) dbPayload.snapshot_proyeccion = updates.snapshot_proyeccion
      if (updates.total_items !== undefined) dbPayload.total_items = updates.total_items
      if (updates.total_unidades !== undefined) dbPayload.total_unidades = updates.total_unidades

      if (Object.keys(dbPayload).length > 0) {
        await supabase.from('orden_importacion').update(dbPayload).eq('id_orden', id_orden)
      }
    } catch (err) {
      console.warn('Supabase update failed, continuing with localStorage:', err)
    }

    const currentOrders = await this.getOrders()
    const updatedOrders = currentOrders.map((ord) =>
      ord.id_orden === id_orden ? { ...ord, ...updates } : ord
    )
    localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(updatedOrders))

    return { success: true }
  },

  async deleteOrder(id_orden: number): Promise<{ success: boolean; error?: string }> {
    try {
      await supabase.from('detalle_orden').delete().eq('id_orden', id_orden)
      await supabase.from('orden_importacion').delete().eq('id_orden', id_orden)
    } catch (err) {
      console.warn('Supabase delete failed:', err)
    }

    const currentOrders = await this.getOrders()
    const updatedOrders = currentOrders.filter((ord) => ord.id_orden !== id_orden)
    localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(updatedOrders))

    return { success: true }
  },

  // 11. IMPORTADOR ASISTIDO DE SALIDAS MENSUALES A AGENCIAS DESDE EXCEL
  async parseMonthlyOutputsExcel(
    file: File,
    template: ProjectionTemplate,
    existingItems: ProjectionItem[]
  ): Promise<{
    success: boolean
    error?: string
    result?: ExcelImportResult
    updatedItems?: ProjectionItem[]
  }> {
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        return { success: false, error: 'El archivo Excel no contiene hojas de cálculo legibles.' }
      }

      // Buscar hoja coincidente con el código de la plantilla o tomar la primera
      let targetSheetName = wb.SheetNames[0]
      const tplCodeClean = (template.codigo || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
      for (const name of wb.SheetNames) {
        const cleanName = name.replace(/[^A-Z0-9]/gi, '').toUpperCase()
        if (cleanName.includes(tplCodeClean) || tplCodeClean.includes(cleanName)) {
          targetSheetName = name
          break
        }
      }

      const sheet = wb.Sheets[targetSheetName]
      const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 })
      if (!rawRows || rawRows.length < 2) {
        return {
          success: false,
          error: `La hoja "${targetSheetName}" no contiene suficientes filas de datos.`
        }
      }

      const normalizeKey = (str: string) =>
        str
          .trim()
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^A-Z0-9]/g, '')

      const MONTH_NAMES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SET', 'OCT', 'NOV', 'DIC']

      // Función de parseo de fechas robusta (Excel serial, dd/mm/yyyy, yyyy-mm-dd)
      const parseExcelDate = (val: any): Date | null => {
        if (typeof val === 'number') {
          const dc = (XLSX.SSF as any).parse_date_code(val)
          if (dc) return new Date(dc.y, dc.m - 1, dc.d)
        }
        if (typeof val === 'string') {
          const parts = val.trim().split(/[\/\-\.]/)
          if (parts.length === 3) {
            if (parts[0].length === 4) {
              return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
            } else {
              return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
            }
          }
          const d = new Date(val)
          if (!isNaN(d.getTime())) return d
        }
        if (val instanceof Date) return val
        return null
      }

      // 1. Analizar encabezados para detectar si es formato Transaccional (con Fecha) o Matricial (con meses directos)
      let headerRowIndex = 0
      let dateColIdx = -1
      let productColIdx = -1
      let qtyColIdx = -1
      let detectedDirectMonths: Array<{ key: string; colIdx: number }> = []

      for (let r = 0; r < Math.min(10, rawRows.length); r++) {
        const row = rawRows[r]
        if (!row || !Array.isArray(row)) continue

        row.forEach((cell, idx) => {
          if (cell === null || cell === undefined) return
          const str = String(cell).trim().toUpperCase()

          if (str.includes('FECHA') || str === 'DATE' || str.includes('F.DESPACHO') || str.includes('F.SALIDA')) {
            dateColIdx = idx
          } else if (
            str.includes('PROD') ||
            str.includes('SKU') ||
            str.includes('DESCRIP') ||
            str.includes('MATERIAL') ||
            str.includes('SUMINISTRO')
          ) {
            productColIdx = idx
          } else if (
            str.includes('CANT') ||
            str.includes('SALIDA') ||
            str.includes('UNID') ||
            str.includes('ENTREGA')
          ) {
            qtyColIdx = idx
          }

          // Detección de meses directos en columnas (modo matricial alternativo)
          const prefix3 = str.slice(0, 3)
          if (MONTH_NAMES.includes(str) || MONTH_NAMES.includes(prefix3)) {
            let stdKey = prefix3
            if (stdKey === 'SEP') stdKey = 'SET'
            detectedDirectMonths.push({ key: stdKey, colIdx: idx })
          }
        })

        // Si encontramos Fecha + Producto + Cantidad, es formato transaccional por fecha
        if (dateColIdx >= 0 && productColIdx >= 0) {
          headerRowIndex = r
          break
        }

        // Si encontramos Producto + al menos 2 meses directos, es formato matricial
        if (productColIdx >= 0 && detectedDirectMonths.length >= 2) {
          headerRowIndex = r
          break
        }
      }

      // Base limpia de items existentes
      const updatedItems = existingItems.map((item) => ({
        ...item,
        datos_meses: {} as Record<string, number>
      }))

      let matchedCount = 0
      const unmatchedProducts: string[] = []
      const previewRows: Array<{
        producto: string
        valoresMeses: Record<string, number>
        coincide: boolean
      }> = []
      let chronologicalMonths: string[] = []

      // =========================================================================
      // CASO A: FORMATO TRANSACCIONAL DE SALIDAS (Columna Fecha + Producto + Cantidad)
      // =========================================================================
      if (dateColIdx >= 0 && productColIdx >= 0) {
        // Si no se detectó columna explícita de cantidad, buscar columna numérica a la derecha
        if (qtyColIdx < 0) {
          qtyColIdx = productColIdx + 1
        }

        const productMonthTotals: Record<string, Record<string, number>> = {}
        const detectedMonthsSet = new Set<string>()
        const monthSortOrder: Record<string, number> = {}
        const rawProductNameMap: Record<string, string> = {}

        for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
          const row = rawRows[r]
          if (!row || !Array.isArray(row)) continue

          const rawDate = row[dateColIdx]
          const parsedDate = parseExcelDate(rawDate)
          if (!parsedDate) continue

          const mIdx = parsedDate.getMonth()
          const mKey = MONTH_NAMES[mIdx]
          const sortVal = parsedDate.getFullYear() * 100 + mIdx
          monthSortOrder[mKey] = sortVal
          detectedMonthsSet.add(mKey)

          const rawProd = row[productColIdx]
          if (!rawProd || typeof rawProd !== 'string' || !rawProd.trim()) continue
          const cleanProd = normalizeKey(rawProd)
          rawProductNameMap[cleanProd] = rawProd.trim()

          const rawQty = row[qtyColIdx]
          let numQty = 0
          if (typeof rawQty === 'number' && !isNaN(rawQty)) {
            numQty = Math.abs(rawQty)
          } else if (rawQty) {
            const parsed = parseFloat(String(rawQty).replace(/,/g, ''))
            if (!isNaN(parsed)) numQty = Math.abs(parsed)
          }

          if (!productMonthTotals[cleanProd]) {
            productMonthTotals[cleanProd] = {}
          }
          productMonthTotals[cleanProd][mKey] = (productMonthTotals[cleanProd][mKey] || 0) + numQty
        }

        chronologicalMonths = Array.from(detectedMonthsSet).sort(
          (a, b) => (monthSortOrder[a] || 0) - (monthSortOrder[b] || 0)
        )

        if (chronologicalMonths.length === 0) {
          return {
            success: false,
            error:
              'Se detectó la columna Fecha pero no se pudieron interpretar las fechas del archivo. Usa formato dd/mm/aaaa o aaaa-mm-dd.'
          }
        }

        // Cruzar con los productos del catálogo
        const processedExcelKeys = new Set<string>()

        for (const targetItem of updatedItems) {
          const itemKey = normalizeKey(targetItem.nombre_producto)
          // Buscar coincidencia exacta o inclusiva
          let matchedExcelKey = Object.keys(productMonthTotals).find(
            (k) => k === itemKey || k.includes(itemKey) || itemKey.includes(k)
          )

          if (matchedExcelKey && productMonthTotals[matchedExcelKey]) {
            matchedCount++
            processedExcelKeys.add(matchedExcelKey)
            const monthMap = productMonthTotals[matchedExcelKey]
            const filledMonths: Record<string, number> = {}

            chronologicalMonths.forEach((m) => {
              const val = monthMap[m] || 0
              filledMonths[m] = -Math.abs(Math.round(val))
            })

            targetItem.datos_meses = filledMonths

            if (previewRows.length < 12) {
              previewRows.push({
                producto: targetItem.nombre_producto,
                valoresMeses: filledMonths,
                coincide: true
              })
            }
          } else {
            // Producto no vino en el Excel de salidas
            const zeroMonths: Record<string, number> = {}
            chronologicalMonths.forEach((m) => {
              zeroMonths[m] = 0
            })
            targetItem.datos_meses = zeroMonths
          }
        }

        // Productos del Excel que no coincidieron con la matriz
        Object.keys(productMonthTotals).forEach((k) => {
          if (!processedExcelKeys.has(k)) {
            unmatchedProducts.push(rawProductNameMap[k] || k)
          }
        })
      }
      // =========================================================================
      // CASO B: FORMATO MATRICIAL DE SALIDAS (Columnas directas de meses JUN, JUL, etc.)
      // =========================================================================
      else if (detectedDirectMonths.length >= 2 && productColIdx >= 0) {
        chronologicalMonths = Array.from(new Set(detectedDirectMonths.map((m) => m.key)))

        for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
          const row = rawRows[r]
          if (!row || !Array.isArray(row)) continue

          const rawProdName = row[productColIdx]
          if (!rawProdName || typeof rawProdName !== 'string' || !rawProdName.trim()) continue
          const cleanName = normalizeKey(rawProdName)

          const monthVals: Record<string, number> = {}
          detectedDirectMonths.forEach((m) => {
            const rawVal = row[m.colIdx]
            if (typeof rawVal === 'number' && !isNaN(rawVal)) {
              monthVals[m.key] = -Math.abs(Math.round(rawVal))
            } else if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
              const parsed = parseFloat(String(rawVal).replace(/,/g, ''))
              if (!isNaN(parsed)) {
                monthVals[m.key] = -Math.abs(Math.round(parsed))
              }
            } else {
              monthVals[m.key] = 0
            }
          })

          const targetItem = updatedItems.find((it) => {
            const itClean = normalizeKey(it.nombre_producto)
            return itClean === cleanName || itClean.includes(cleanName) || cleanName.includes(itClean)
          })

          if (targetItem) {
            matchedCount++
            targetItem.datos_meses = monthVals
            if (previewRows.length < 12) {
              previewRows.push({
                producto: targetItem.nombre_producto,
                valoresMeses: monthVals,
                coincide: true
              })
            }
          } else {
            unmatchedProducts.push(rawProdName.trim())
          }
        }
      } else {
        return {
          success: false,
          error:
            'No se encontraron los encabezados esperados en el Excel. Debe incluir [Fecha, Producto, Cantidad] o columnas directas de meses [JUN, JUL, AGO, etc.].'
        }
      }

      return {
        success: true,
        result: {
          fileName: file.name,
          detectedMonths: chronologicalMonths,
          matchedCount,
          totalExcelRows: rawRows.length - (headerRowIndex + 1),
          unmatchedProducts: Array.from(new Set(unmatchedProducts)),
          previewRows
        },
        updatedItems
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Error al procesar el archivo Excel.'
      }
    }
  }
}
