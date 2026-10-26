import type {
  CalculableColumnKey,
  CalculatedProjectionRow,
  ColumnEquationConfig,
  CriticalStatus,
  FormulaVariable,
  ProjectionItem,
  ProjectionTemplate
} from '../types/projections'

export interface FormulaEvaluationContext {
  PROM_MEN: number
  STOCK_REAL: number
  LEAD_TIME: number
  STOCK_MIN?: number
  SEG?: number
  STOCK_MIN_F?: number
  STOCK_REDONDEADO?: number
  FACTOR_COMPRA: number
  SEGURIDAD_PCT: number
  DIAS_MES: number
  COMPRA_SUGERIDA?: number
  MESES_DURACION?: number
  [key: string]: number | undefined
}

// Variables disponibles con descripciones humanas para el constructor visual de ecuaciones
const VARIABLE_GLOSSARY: FormulaVariable[] = [
  {
    token: 'PROM_MEN',
    label: 'Promedio mensual',
    description: 'Consumo promedio mensual calculado según el rango de meses seleccionado'
  },
  {
    token: 'STOCK_REAL',
    label: 'Stock real',
    description: 'Existencia física actual en almacén o valor manual verificado'
  },
  {
    token: 'LEAD_TIME',
    label: 'Lead time (meses)',
    description: 'Tiempo de tránsito y despacho de la importación (meses)'
  },
  {
    token: 'STOCK_MIN',
    label: 'Stock mínimo',
    description: 'Nivel mínimo calculado de stock base'
  },
  {
    token: 'SEG',
    label: 'Seguridad',
    description: 'Stock de seguridad para amortiguar desviaciones o retrasos'
  },
  {
    token: 'STOCK_MIN_F',
    label: 'Stock mín. final',
    description: 'Suma de stock mínimo base más stock de seguridad'
  },
  {
    token: 'STOCK_REDONDEADO',
    label: 'Stock redondeado',
    description: 'Stock mínimo ajustado a lote comercial o empaque'
  },
  {
    token: 'FACTOR_COMPRA',
    label: 'Factor de compra',
    description: 'Multiplicador de pedido para la orden de reposición (ej. 2x)'
  },
  {
    token: 'SEGURIDAD_PCT',
    label: 'Margen seguridad %',
    description: 'Porcentaje de seguridad configurado en la plantilla (ej. 0.20 para 20%)'
  },
  {
    token: 'DIAS_MES',
    label: 'Días por mes',
    description: 'Factor de días estándar por mes calendario (ej. 30 días)'
  }
]

export const projectionFormulaEngine = {
  // 1. Obtener la lista de meses activos que entran en el cálculo del promedio
  getActiveMonthRange(template: ProjectionTemplate): string[] {
    const allMonths = template.columnas_meses || []
    if (allMonths.length === 0) return []

    const startMonth = template.mes_inicio_promedio?.trim().toUpperCase()
    const endMonth = template.mes_fin_promedio?.trim().toUpperCase()

    if (!startMonth || !endMonth) return allMonths

    const startIdx = allMonths.indexOf(startMonth)
    const endIdx = allMonths.indexOf(endMonth)

    if (startIdx === -1 || endIdx === -1) return allMonths

    if (startIdx <= endIdx) {
      return allMonths.slice(startIdx, endIdx + 1)
    } else {
      return allMonths.slice(endIdx, startIdx + 1)
    }
  },

  // 2. Evaluador seguro de expresiones aritméticas
  evaluateFormula(rawFormula: string, ctx: FormulaEvaluationContext): number {
    if (!rawFormula || !rawFormula.trim()) return 0

    try {
      let expr = rawFormula.trim().toUpperCase()

      // Soporte para funciones matemáticas en mayúsculas
      expr = expr.replace(/\bMAX\s*\(/g, 'Math.max(')
      expr = expr.replace(/\bMIN\s*\(/g, 'Math.min(')
      expr = expr.replace(/\bROUND\s*\(/g, 'Math.round(')
      expr = expr.replace(/\bCEIL\s*\(/g, 'Math.ceil(')
      expr = expr.replace(/\bFLOOR\s*\(/g, 'Math.floor(')
      expr = expr.replace(/\bABS\s*\(/g, 'Math.abs(')

      // Diccionario de variables reconocidas
      const vars: Record<string, number> = {
        PROM_MEN: Number(ctx.PROM_MEN) || 0,
        PROM_FINAL: Number(ctx.PROM_MEN) || 0,
        PROMEDIO: Number(ctx.PROM_MEN) || 0,
        STOCK_REAL: Number(ctx.STOCK_REAL) || 0,
        STOCK: Number(ctx.STOCK_REAL) || 0,
        LEAD_TIME: Number(ctx.LEAD_TIME) || 3,
        LEAD_TIME_MESES: Number(ctx.LEAD_TIME) || 3,
        STOCK_MIN: Number(ctx.STOCK_MIN) || 0,
        SEG: Number(ctx.SEG) || 0,
        SEGURIDAD: Number(ctx.SEG) || 0,
        STOCK_MIN_F: Number(ctx.STOCK_MIN_F) || 0,
        STOCK_FINAL: Number(ctx.STOCK_MIN_F) || 0,
        STOCK_REDONDEADO: Number(ctx.STOCK_REDONDEADO) || 0,
        STOCK_RED: Number(ctx.STOCK_REDONDEADO) || 0,
        COMPRA_SUGERIDA: Number(ctx.COMPRA_SUGERIDA) || 0,
        COMPRA: Number(ctx.COMPRA_SUGERIDA) || 0,
        MESES_DURACION: Number(ctx.MESES_DURACION) || 0,
        DURACION: Number(ctx.MESES_DURACION) || 0,
        FACTOR_COMPRA: Number(ctx.FACTOR_COMPRA) || 2,
        FACTOR: Number(ctx.FACTOR_COMPRA) || 2,
        SEGURIDAD_PCT: Number(ctx.SEGURIDAD_PCT) || 0.2,
        DIAS_MES: Number(ctx.DIAS_MES) || 30,
        DIAS_POR_MES: Number(ctx.DIAS_MES) || 30
      }

      // Incorporar dinámicamente cualquier otra variable provista en el contexto (columnas personalizadas)
      for (const [k, v] of Object.entries(ctx)) {
        if (typeof v === 'number' && !isNaN(v)) {
          vars[k.toUpperCase()] = v
        }
      }

      // Reemplazo de palabras clave de variables por sus valores numéricos entre paréntesis
      const tokenRegex = /\b([A-Z0-9_]+)\b/g
      expr = expr.replace(tokenRegex, (match) => {
        if (match.startsWith('MATH.')) return match
        if (vars[match] !== undefined) {
          return `(${vars[match]})`
        }
        return match
      })

      // Sanitización estricta: sólo permitir números, operadores aritméticos, puntos, paréntesis, Math.*, comparadores y ternarios
      const isSafe = /^[0-9\s+\-*/().,><=?:!Mathmaxinroucedflsb]+$/i.test(expr)
      if (!isSafe) {
        return 0
      }

      // Evaluación segura en entorno aislado
      const evalFn = new Function(`return (${expr});`)
      const res = evalFn()

      if (typeof res === 'number' && !isNaN(res) && isFinite(res)) {
        return res
      }
      return 0
    } catch {
      return 0
    }
  },

  // 3. Probar una fórmula para validar sintaxis y ver el resultado con contexto de prueba
  testFormula(
    rawFormula: string,
    ctx: FormulaEvaluationContext
  ): { valid: boolean; result: number; error?: string } {
    if (!rawFormula.trim()) {
      return { valid: false, result: 0, error: 'La fórmula no puede estar vacía.' }
    }

    try {
      const result = this.evaluateFormula(rawFormula, ctx)
      return { valid: true, result }
    } catch (err: any) {
      return { valid: false, result: 0, error: err.message || 'Error de sintaxis en la ecuación.' }
    }
  },

  // 4. Glosario de variables para autocompletado en el constructor visual
  getVariableGlossary(): FormulaVariable[] {
    return VARIABLE_GLOSSARY
  },

  // 5. Configurador y presets de ecuaciones por columna
  getColumnEquationConfig(key: CalculableColumnKey, template: ProjectionTemplate): ColumnEquationConfig {
    const leadTime = template.lead_time_meses || 3
    const segPct = template.seguridad_pct || 0.2
    const factor = template.factor_compra || 2

    // Si es una columna personalizada
    const custom = template.columnas_personalizadas?.find((c) => c.id === key)
    if (custom) {
      const otherCustoms = (template.columnas_personalizadas || [])
        .filter((c) => c.id !== custom.id)
        .map((c) => ({
          token: (c.codigo_variable || c.id).toUpperCase(),
          label: c.nombre,
          description: `Columna personalizada: ${c.nombre}`
        }))

      return {
        key: custom.id,
        label: custom.nombre,
        headerTitle: custom.nombre,
        currentFormula: custom.formula || '0',
        defaultFormula: custom.formula || '0',
        isCustom: true,
        format: custom.formato || 'entero',
        availableVariables: [
          ...VARIABLE_GLOSSARY,
          {
            token: 'COMPRA_SUGERIDA',
            label: 'Compra sugerida',
            description: 'Unidades de reposición calculadas por la matriz'
          },
          {
            token: 'MESES_DURACION',
            label: 'Meses de duración',
            description: 'Cobertura estimada de inventario en meses'
          },
          ...otherCustoms
        ],
        presets: [
          {
            id: 'costo_compra',
            label: 'Costo total de reposición (Compra × S/ 25.00)',
            formula: 'COMPRA_SUGERIDA * 25',
            description: 'Multiplica la compra sugerida por un costo unitario estimado.'
          },
          {
            id: 'cajas_50',
            label: 'Compra en cajas de 50 und. (CEIL)',
            formula: 'CEIL(COMPRA_SUGERIDA / 50)',
            description: 'Empaque maestro redondeado a bultos o cajas de 50 unidades.'
          },
          {
            id: 'stock_proyectado',
            label: 'Stock proyectado total (Stock Real + Compra)',
            formula: 'STOCK_REAL + COMPRA_SUGERIDA',
            description: 'Existencia total estimada una vez recibida la importación.'
          },
          {
            id: 'cobertura_total',
            label: 'Cobertura ampliada en meses',
            formula: '(STOCK_REAL + COMPRA_SUGERIDA) / (PROM_MEN > 0 ? PROM_MEN : 1)',
            description: 'Meses de cobertura total post-recepción respecto al consumo promedio.'
          },
          {
            id: 'deficit_minimo',
            label: 'Déficit sobre stock mín final (Mín F - Stock Real)',
            formula: 'MAX(0, STOCK_MIN_F - STOCK_REAL)',
            description: 'Déficit directo sin considerar lote redondeado ni factor multiplicador.'
          }
        ]
      }
    }

    switch (key) {
      case 'stock_min':
        return {
          key: 'stock_min',
          label: 'Stock mínimo',
          headerTitle: 'Stock mín',
          currentFormula: template.formula_stock_min || 'PROM_MEN * lead_time_meses',
          defaultFormula: 'PROM_MEN * lead_time_meses',
          availableVariables: VARIABLE_GLOSSARY.filter((v) =>
            ['PROM_MEN', 'LEAD_TIME', 'STOCK_REAL', 'DIAS_MES'].includes(v.token)
          ),
          presets: [
            {
              id: 'excel_std',
              label: 'Estándar Excel Shalom (Promedio × Lead Time)',
              formula: 'PROM_MEN * LEAD_TIME',
              description: `Multiplica el consumo promedio mensual por los ${leadTime} meses de tránsito.`
            },
            {
              id: 'min_2m',
              label: 'Cobertura rápida (2 meses)',
              formula: 'PROM_MEN * 2',
              description: 'Reserva para 60 días de operación ininterrumpida.'
            },
            {
              id: 'min_4m',
              label: 'Alta cobertura (4 meses)',
              formula: 'PROM_MEN * 4',
              description: 'Para productos críticos con alto riesgo de demoras marítimas.'
            }
          ]
        }

      case 'seguridad':
        return {
          key: 'seguridad',
          label: 'Stock de seguridad',
          headerTitle: 'Seguridad',
          currentFormula: template.formula_seguridad || 'stock_min * seguridad_pct',
          defaultFormula: 'stock_min * seguridad_pct',
          availableVariables: VARIABLE_GLOSSARY.filter((v) =>
            ['STOCK_MIN', 'SEGURIDAD_PCT', 'PROM_MEN', 'LEAD_TIME'].includes(v.token)
          ),
          presets: [
            {
              id: 'excel_std',
              label: 'Estándar Excel Shalom (Stock Mínimo × 20%)',
              formula: 'STOCK_MIN * SEGURIDAD_PCT',
              description: `Aplica el margen del ${Math.round(segPct * 100)}% sobre el stock mínimo base.`
            },
            {
              id: 'seg_10pct',
              label: 'Seguridad moderada (10%)',
              formula: 'STOCK_MIN * 0.10',
              description: 'Margen ajustado para productos de alta rotación local.'
            },
            {
              id: 'seg_half_month',
              label: 'Medio mes de consumo promedio',
              formula: 'PROM_MEN * 0.5',
              description: 'Cojín directo de 15 días de demanda proyectada.'
            }
          ]
        }

      case 'stock_min_f':
        return {
          key: 'stock_min_f',
          label: 'Stock mínimo final',
          headerTitle: 'Stock mín final',
          currentFormula: template.formula_stock_min_f || 'stock_min + seguridad',
          defaultFormula: 'stock_min + seguridad',
          availableVariables: VARIABLE_GLOSSARY.filter((v) =>
            ['STOCK_MIN', 'SEG', 'PROM_MEN', 'LEAD_TIME'].includes(v.token)
          ),
          presets: [
            {
              id: 'excel_std',
              label: 'Estándar Excel Shalom (Stock Mínimo + Seguridad)',
              formula: 'STOCK_MIN + SEG',
              description: 'Suma el stock mínimo base más el colchón de seguridad.'
            },
            {
              id: 'direct_120',
              label: 'Mínimo indexado al 120%',
              formula: 'STOCK_MIN * 1.20',
              description: 'Factor directo equivalente a mínimo más 20% de protección.'
            }
          ]
        }

      case 'stock_min_redondeado':
        return {
          key: 'stock_min_redondeado',
          label: 'Stock mínimo redondeado (Lote)',
          headerTitle: 'Redondeado',
          currentFormula: template.formula_stock_redondeado || 'CEIL(STOCK_MIN_F / 1000) * 1000',
          defaultFormula: 'CEIL(STOCK_MIN_F / 1000) * 1000',
          availableVariables: VARIABLE_GLOSSARY.filter((v) =>
            ['STOCK_MIN_F', 'STOCK_MIN', 'SEG', 'PROM_MEN'].includes(v.token)
          ),
          presets: [
            {
              id: 'round_1000',
              label: 'Redondeo al millar superior (CEIL 1,000)',
              formula: 'CEIL(STOCK_MIN_F / 1000) * 1000',
              description: 'Ajusta al múltiplo de 1,000 unidades más cercano hacia arriba.'
            },
            {
              id: 'round_100',
              label: 'Redondeo a la centena superior (CEIL 100)',
              formula: 'CEIL(STOCK_MIN_F / 100) * 100',
              description: 'Ajusta al múltiplo de 100 unidades más cercano hacia arriba.'
            },
            {
              id: 'round_none',
              label: 'Sin redondeo (Valor exacto)',
              formula: 'STOCK_MIN_F',
              description: 'Utiliza el valor calculado exacto de stock mínimo final.'
            }
          ]
        }

      case 'compra_sugerida':
        return {
          key: 'compra_sugerida',
          label: 'Compra sugerida',
          headerTitle: 'Compra sugerida',
          currentFormula: template.formula_compra || 'stock_redondeado * factor_compra',
          defaultFormula: 'stock_redondeado * factor_compra',
          availableVariables: VARIABLE_GLOSSARY.filter((v) =>
            [
              'STOCK_REDONDEADO',
              'FACTOR_COMPRA',
              'STOCK_MIN_F',
              'STOCK_REAL',
              'PROM_MEN',
              'LEAD_TIME'
            ].includes(v.token)
          ),
          presets: [
            {
              id: 'excel_std',
              label: 'Estándar Excel Shalom (Lote Redondeado × Factor 2x)',
              formula: 'STOCK_REDONDEADO * FACTOR_COMPRA',
              description: `Multiplica el stock redondeado por el factor ${factor}x fijado en la plantilla.`
            },
            {
              id: 'deficit_neto',
              label: 'Déficit neto de inventario (Stock Mín F - Stock Real)',
              formula: 'MAX(0, STOCK_MIN_F - STOCK_REAL)',
              description: 'Pide estrictamente la cantidad faltante para alcanzar el stock mínimo final.'
            },
            {
              id: 'deficit_redondeado',
              label: 'Déficit hacia lote redondeado (Redondeado - Stock Real)',
              formula: 'MAX(0, STOCK_REDONDEADO - STOCK_REAL)',
              description: 'Pide la cantidad faltante para llegar a la meta del lote comercial.'
            },
            {
              id: 'doble_menos_stock',
              label: 'Doble lote deduciendo stock actual',
              formula: 'MAX(0, (STOCK_REDONDEADO * FACTOR_COMPRA) - STOCK_REAL)',
              description: 'Asegura abastecimiento para dos periodos neteando existencias disponibles.'
            }
          ]
        }

      case 'meses_duracion':
        return {
          key: 'meses_duracion',
          label: 'Meses de duración',
          headerTitle: 'Duración',
          currentFormula: template.formula_meses_duracion || '(stock_real * lead_time_meses) / stock_redondeado',
          defaultFormula: '(stock_real * lead_time_meses) / stock_redondeado',
          availableVariables: VARIABLE_GLOSSARY.filter((v) =>
            ['STOCK_REAL', 'LEAD_TIME', 'STOCK_REDONDEADO', 'PROM_MEN', 'STOCK_MIN_F'].includes(v.token)
          ),
          presets: [
            {
              id: 'excel_std',
              label: 'Estándar Excel Shalom ((Stock Real × Lead Time) / Stock Redondeado)',
              formula: '(STOCK_REAL * LEAD_TIME) / (STOCK_REDONDEADO > 0 ? STOCK_REDONDEADO : 1)',
              description: 'Fórmula original de la hoja Excel Shalom IMP-STO.'
            },
            {
              id: 'duracion_consumo',
              label: 'Duración por consumo promedio mensual (Stock Real / Promedio)',
              formula: 'STOCK_REAL / (PROM_MEN > 0 ? PROM_MEN : 1)',
              description: 'Cobertura directa de meses de venta o despacho según la tasa de consumo promedio.'
            }
          ]
        }

      default:
        return {
          key,
          label: key,
          headerTitle: key,
          currentFormula: '0',
          defaultFormula: '0',
          isCustom: true,
          availableVariables: VARIABLE_GLOSSARY,
          presets: []
        }
    }
  },

  // 6. Calcular una fila individual basada en la plantilla y sus parámetros activos
  calculateRow(
    item: ProjectionItem,
    template: ProjectionTemplate,
    liveStockMap?: Map<string, number>
  ): CalculatedProjectionRow {
    const leadTime = Number(template.lead_time_meses) || 3
    const seguridadPct = Number(template.seguridad_pct) || 0.2
    const factorCompra = Number(template.factor_compra) || 2
    const diasPorMes = Number(template.dias_por_mes) || 30
    const ignorarCero = template.ignorar_meses_cero !== false

    // 1. Obtención de rango activo de meses para promedio
    const activeMonths = this.getActiveMonthRange(template)

    let promedioCalculado = 0
    if (activeMonths.length > 0) {
      let suma = 0
      let conteo = 0
      for (const mKey of activeMonths) {
        const val = item.datos_meses[mKey]
        if (typeof val === 'number') {
          if (ignorarCero) {
            if (val !== 0) {
              suma += Math.abs(val)
              conteo++
            }
          } else {
            suma += Math.abs(val)
            conteo++
          }
        }
      }
      promedioCalculado = conteo > 0 ? Math.round(suma / conteo) : 0
    }

    // Promedio final (respeta sobreescritura manual si existe y es > 0)
    const promedioFinal =
      item.promedio_manual !== null &&
      item.promedio_manual !== undefined &&
      item.promedio_manual > 0
        ? Number(item.promedio_manual)
        : promedioCalculado

    // 2. Stock real (prioriza liveStock si existe, o stock_manual del ítem)
    let stockReal = 0
    if (liveStockMap && liveStockMap.has(item.nombre_producto)) {
      stockReal = liveStockMap.get(item.nombre_producto)!
    } else if (item.stock_manual !== null && item.stock_manual !== undefined) {
      stockReal = Number(item.stock_manual)
    }

    // Contexto base para las evaluaciones
    const evalCtx: FormulaEvaluationContext = {
      PROM_MEN: promedioFinal,
      STOCK_REAL: stockReal,
      LEAD_TIME: leadTime,
      FACTOR_COMPRA: factorCompra,
      SEGURIDAD_PCT: seguridadPct,
      DIAS_MES: diasPorMes
    }

    // 3. Stock mínimo base = evaluate(formula_stock_min)
    let stockMin = 0
    if (template.formula_stock_min && template.formula_stock_min.trim()) {
      stockMin = Math.round(this.evaluateFormula(template.formula_stock_min, evalCtx))
    } else {
      stockMin = Math.round(promedioFinal * leadTime)
    }
    evalCtx.STOCK_MIN = stockMin

    // 4. Stock de seguridad = evaluate(formula_seguridad)
    let seguridad = 0
    if (template.formula_seguridad && template.formula_seguridad.trim()) {
      seguridad = Math.round(this.evaluateFormula(template.formula_seguridad, evalCtx))
    } else {
      seguridad = Math.round(stockMin * seguridadPct)
    }
    evalCtx.SEG = seguridad

    // 5. Stock mínimo final = evaluate(formula_stock_min_f)
    let stockMinF = 0
    if (template.formula_stock_min_f && template.formula_stock_min_f.trim()) {
      stockMinF = Math.round(this.evaluateFormula(template.formula_stock_min_f, evalCtx))
    } else {
      stockMinF = stockMin + seguridad
    }
    evalCtx.STOCK_MIN_F = stockMinF

    // 6. Stock mínimo redondeado (por empaque / lote)
    let stockMinRedondeado = stockMinF
    if (
      item.stock_redondeado_manual !== null &&
      item.stock_redondeado_manual !== undefined &&
      item.stock_redondeado_manual > 0
    ) {
      stockMinRedondeado = Number(item.stock_redondeado_manual)
    } else if (template.formula_stock_redondeado && template.formula_stock_redondeado.trim()) {
      stockMinRedondeado = Math.round(
        this.evaluateFormula(template.formula_stock_redondeado, evalCtx)
      )
    } else {
      // Redondeo comercial por defecto
      if (stockMinF > 1000) {
        stockMinRedondeado = Math.ceil(stockMinF / 1000) * 1000
      } else if (stockMinF > 100) {
        stockMinRedondeado = Math.ceil(stockMinF / 100) * 100
      } else {
        stockMinRedondeado = stockMinF
      }
    }
    evalCtx.STOCK_REDONDEADO = stockMinRedondeado

    // 7. Compra sugerida = evaluate(formula_compra)
    let compraSugerida = 0
    if (template.formula_compra && template.formula_compra.trim()) {
      compraSugerida = Math.round(this.evaluateFormula(template.formula_compra, evalCtx))
    } else {
      compraSugerida = Math.round(stockMinRedondeado * factorCompra)
    }
    const finalCompra = Math.max(0, compraSugerida)
    evalCtx.COMPRA_SUGERIDA = finalCompra
    evalCtx.COMPRA = finalCompra

    // 8. Meses de duración = evaluate(formula_meses_duracion)
    let mesesDuracion = 0
    if (template.formula_meses_duracion && template.formula_meses_duracion.trim()) {
      mesesDuracion = this.evaluateFormula(template.formula_meses_duracion, evalCtx)
    } else {
      if (stockMinRedondeado > 0) {
        mesesDuracion = (stockReal * leadTime) / stockMinRedondeado
      } else if (promedioFinal > 0) {
        mesesDuracion = stockReal / promedioFinal
      }
    }
    evalCtx.MESES_DURACION = Number(mesesDuracion.toFixed(2))
    evalCtx.DURACION = evalCtx.MESES_DURACION

    // 8b. Evaluar columnas personalizadas en orden
    const valoresPersonalizados: Record<string, number> = {}
    if (template.columnas_personalizadas && Array.isArray(template.columnas_personalizadas)) {
      for (const customCol of template.columnas_personalizadas) {
        if (customCol.formula && customCol.formula.trim()) {
          const val = this.evaluateFormula(customCol.formula, evalCtx)
          valoresPersonalizados[customCol.id] = val
          const varCode = (customCol.codigo_variable || customCol.id).toUpperCase()
          evalCtx[varCode] = val
        } else {
          valoresPersonalizados[customCol.id] = 0
        }
      }
    }

    // 9. Texto de duración y Fecha estimada de quiebre (idéntico al Excel Shalom)
    let mesesEnteros = Math.floor(mesesDuracion)
    let diasEnteros = Math.round((mesesDuracion - mesesEnteros) * diasPorMes)
    if (diasEnteros >= diasPorMes) {
      mesesEnteros += 1
      diasEnteros = 0
    }
    if (mesesDuracion < 0) {
      mesesEnteros = 0
      diasEnteros = 0
    }

    const textoDuracion = `${mesesEnteros} mes(es) y ${diasEnteros} día(s)`

    const diasTotalesMilis = Math.max(0, mesesDuracion) * diasPorMes * 24 * 60 * 60 * 1000
    const fechaQuiebreObj = new Date(Date.now() + diasTotalesMilis)
    const fechaQuiebre = isNaN(fechaQuiebreObj.getTime())
      ? '—'
      : fechaQuiebreObj.toLocaleDateString('es-PE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })

    // 10. Estado Crítico / Semáforo operativo
    let estadoCritico: CriticalStatus = 'OPTIMO'
    if (stockReal <= 0 || mesesDuracion < 1) {
      estadoCritico = 'CRITICO' // 🔴 Menos de 1 mes de stock (quiebre inminente)
    } else if (mesesDuracion <= leadTime) {
      estadoCritico = 'REORDEN' // 🟡 Ventana de pedido (tarda leadTime meses en llegar)
    } else {
      estadoCritico = 'OPTIMO' // 🟢 Cobertura holgada mayor al lead time
    }

    return {
      id_item: item.id_item,
      id_plantilla: item.id_plantilla,
      id_producto: item.id_producto,
      nombre_producto: item.nombre_producto,
      datos_meses: { ...item.datos_meses },
      meses_incluidos_promedio: activeMonths,
      promedio_calculado: promedioCalculado,
      promedio_final: promedioFinal,
      stock_real: stockReal,
      stock_min: stockMin,
      seguridad: seguridad,
      stock_min_f: stockMinF,
      stock_min_redondeado: stockMinRedondeado,
      compra_sugerida: finalCompra,
      meses_duracion: Number(mesesDuracion.toFixed(2)),
      texto_duracion: textoDuracion,
      fecha_quiebre: fechaQuiebre,
      estado_critico: estadoCritico,
      valores_personalizados: valoresPersonalizados
    }
  },

  // 7. Calcular toda la lista de filas de una plantilla de forma grupal
  calculateAll(
    items: ProjectionItem[],
    template: ProjectionTemplate,
    liveStockMap?: Map<string, number>
  ): CalculatedProjectionRow[] {
    return items.map((item) => this.calculateRow(item, template, liveStockMap))
  }
}
