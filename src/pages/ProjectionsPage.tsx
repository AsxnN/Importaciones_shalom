import { useEffect, useMemo, useState } from 'react'
import { projectionService } from '../services/projectionService'
import {
  projectionFormulaEngine,
  type FormulaEvaluationContext
} from '../services/projectionFormulaEngine'
import type {
  CalculableColumnKey,
  ColumnDisplayFormat,
  ColumnEquationConfig,
  CustomProjectionColumn,
  ProjectionItem,
  ProjectionTemplate,
  TemplateParamsForm
} from '../types/projections'

const formatCustomColumnValue = (val: number, formato?: ColumnDisplayFormat): string => {
  if (typeof val !== 'number' || isNaN(val)) return '0'
  switch (formato) {
    case 'decimal':
      return val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    case 'moneda_pen':
      return `S/ ${Math.round(val).toLocaleString('es-PE')}`
    case 'moneda_usd':
      return `$ ${Math.round(val).toLocaleString('es-PE')}`
    case 'porcentaje':
      return `${(val * 100).toFixed(1)}%`
    case 'entero':
    default:
      return Math.round(val).toLocaleString('es-PE')
  }
}

interface ProjectionsPageProps {
  onBack: () => void
  onOpenReceptions?: () => void
}

export function ProjectionsPage({ onBack, onOpenReceptions }: ProjectionsPageProps) {
  // 1. Estado principal
  const [templates, setTemplates] = useState<ProjectionTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<number>(1)
  const [items, setItems] = useState<ProjectionItem[]>([])
  const [liveStockMap, setLiveStockMap] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [syncingStock, setSyncingStock] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 2. Selección grupal para órdenes de importación
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set())

  // 3. Búsqueda y filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'CRITICO' | 'REORDEN' | 'OPTIMO'>('TODOS')

  // 4. Configuración de Rango de Meses para Promedio
  const [startMonth, setStartMonth] = useState<string>('SEP')
  const [endMonth, setEndMonth] = useState<string>('JUL')
  const [ignoreZeroMonths, setIgnoreZeroMonths] = useState<boolean>(true)
  const [isUpdatingMonthRange, setIsUpdatingMonthRange] = useState(false)

  // 5. Barra de Fórmulas tipo Excel y Constructor Visual
  const [formulaBarColumn, setFormulaBarColumn] = useState<CalculableColumnKey>('compra_sugerida')
  const [equationModalOpen, setEquationModalOpen] = useState(false)
  const [selectedColumnForEquation, setSelectedColumnForEquation] = useState<CalculableColumnKey>('compra_sugerida')
  const [draftFormula, setDraftFormula] = useState<string>('')
  const [isSavingFormula, setIsSavingFormula] = useState(false)

  // 5b. Gestión de Nueva Columna Calculada (Dinámica Excel)
  const [addColumnModalOpen, setAddColumnModalOpen] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [newColVariable, setNewColVariable] = useState('')
  const [newColFormula, setNewColFormula] = useState('')
  const [newColFormat, setNewColFormat] = useState<ColumnDisplayFormat>('entero')
  const [isAddingColumn, setIsAddingColumn] = useState(false)

  // Edición de propiedades de columna personalizada en el modal de ecuaciones
  const [draftCustomName, setDraftCustomName] = useState<string>('')
  const [draftCustomFormat, setDraftCustomFormat] = useState<ColumnDisplayFormat>('entero')

  const handleColNameChange = (val: string) => {
    setNewColName(val)
    const slug = val
      .toUpperCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, '_')
      .slice(0, 16)
    setNewColVariable(slug)
  }

  // 6. Modales existentes
  // Modal de Parámetros Globales
  const [paramsModalOpen, setParamsModalOpen] = useState(false)
  const [formLeadTime, setFormLeadTime] = useState<number>(3)
  const [formSeguridadPct, setFormSeguridadPct] = useState<number>(20)
  const [formFactorCompra, setFormFactorCompra] = useState<number>(2)
  const [formDiasMes, setFormDiasMes] = useState<number>(30)
  const [isSavingParams, setIsSavingParams] = useState(false)

  // Modal de Agregar Mes
  const [addMonthModalOpen, setAddMonthModalOpen] = useState(false)
  const [newMonthName, setNewMonthName] = useState('')
  const [isAddingMonth, setIsAddingMonth] = useState(false)

  // Modal de Agregar Producto
  const [addProductModalOpen, setAddProductModalOpen] = useState(false)
  const [newProductName, setNewProductName] = useState('')
  const [newProductStock, setNewProductStock] = useState<number>(0)
  const [isAddingProduct, setIsAddingProduct] = useState(false)

  // Modal de Generar Orden de Importación
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [orderNumber, setOrderNumber] = useState('')
  const [orderContainerType, setOrderContainerType] = useState<'40FT' | '20FT' | 'LCL'>('40FT')
  const [isCreatingOrder, setIsCreatingOrder] = useState(false)

  // Plantilla activa
  const activeTemplate = useMemo(() => {
    return templates.find((t) => t.id_plantilla === selectedTemplateId) || templates[0]
  }, [templates, selectedTemplateId])

  // Meses activos participantes en el promedio
  const activeMonthsInAverage = useMemo(() => {
    if (!activeTemplate) return []
    return projectionFormulaEngine.getActiveMonthRange(activeTemplate)
  }, [activeTemplate])

  // Cargar datos iniciales
  const loadInitialData = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const [tplList, stockMap] = await Promise.all([
        projectionService.getTemplates(),
        projectionService.getLiveStockMap()
      ])
      setTemplates(tplList)
      setLiveStockMap(stockMap)

      const activeTpl = tplList.find((t) => t.id_plantilla === selectedTemplateId) || tplList[0]
      if (activeTpl) {
        setSelectedTemplateId(activeTpl.id_plantilla)
        setFormLeadTime(Number(activeTpl.lead_time_meses))
        setFormSeguridadPct(Number(activeTpl.seguridad_pct) * 100)
        setFormFactorCompra(Number(activeTpl.factor_compra))
        setFormDiasMes(Number(activeTpl.dias_por_mes) || 30)

        // Inicializar rango de meses
        const months = activeTpl.columnas_meses || []
        const initStart = activeTpl.mes_inicio_promedio || (months.length > 0 ? months[0] : 'SEP')
        const initEnd = activeTpl.mes_fin_promedio || (months.length > 0 ? months[months.length - 1] : 'JUL')
        setStartMonth(initStart)
        setEndMonth(initEnd)
        setIgnoreZeroMonths(activeTpl.ignorar_meses_cero !== false)

        const rawItems = await projectionService.getItems(activeTpl.id_plantilla, activeTpl.codigo)
        setItems(rawItems)
      }
    } catch (err: any) {
      setErrorMsg(`Error al cargar datos de proyecciones: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInitialData()
  }, [])

  // Cambiar de plantilla (pestaña)
  const handleSelectTemplate = async (templateId: number) => {
    setSelectedTemplateId(templateId)
    setSelectedItemIds(new Set())
    setErrorMsg(null)
    const tpl = templates.find((t) => t.id_plantilla === templateId)
    if (!tpl) return

    setFormLeadTime(Number(tpl.lead_time_meses))
    setFormSeguridadPct(Number(tpl.seguridad_pct) * 100)
    setFormFactorCompra(Number(tpl.factor_compra))
    setFormDiasMes(Number(tpl.dias_por_mes) || 30)

    const months = tpl.columnas_meses || []
    setStartMonth(tpl.mes_inicio_promedio || (months.length > 0 ? months[0] : ''))
    setEndMonth(tpl.mes_fin_promedio || (months.length > 0 ? months[months.length - 1] : ''))
    setIgnoreZeroMonths(tpl.ignorar_meses_cero !== false)

    setLoading(true)
    try {
      const rawItems = await projectionService.getItems(tpl.id_plantilla, tpl.codigo)
      setItems(rawItems)
    } catch (err: any) {
      setErrorMsg(`Error al cambiar de plantilla: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Sincronizar existencias físicas en tiempo real
  const handleSyncLiveStock = async () => {
    setSyncingStock(true)
    try {
      const stockMap = await projectionService.getLiveStockMap()
      setLiveStockMap(stockMap)
      setSuccessMsg('Stock sincronizado correctamente con las existencias de almacén.')
    } catch (err: any) {
      setErrorMsg(`Error al sincronizar stock: ${err.message}`)
    } finally {
      setSyncingStock(false)
    }
  }

  // Filas calculadas reactivamente por el motor de fórmulas
  const calculatedRows = useMemo(() => {
    if (!activeTemplate) return []
    return projectionFormulaEngine.calculateAll(items, activeTemplate, liveStockMap)
  }, [items, activeTemplate, liveStockMap])

  // Filtrado y búsqueda
  const filteredRows = useMemo(() => {
    return calculatedRows.filter((r) => {
      const matchSearch = r.nombre_producto.toLowerCase().includes(searchTerm.toLowerCase().trim())
      const matchStatus = statusFilter === 'TODOS' || r.estado_critico === statusFilter
      return matchSearch && matchStatus
    })
  }, [calculatedRows, searchTerm, statusFilter])

  // Métricas de resumen para la tira horizontal de indicadores
  const metrics = useMemo(() => {
    const total = calculatedRows.length
    const criticos = calculatedRows.filter((r) => r.estado_critico === 'CRITICO').length
    const reorden = calculatedRows.filter((r) => r.estado_critico === 'REORDEN').length
    const optimos = calculatedRows.filter((r) => r.estado_critico === 'OPTIMO').length
    const totalCompra = calculatedRows.reduce((acc, r) => acc + r.compra_sugerida, 0)
    return { total, criticos, reorden, optimos, totalCompra }
  }, [calculatedRows])

  // =========================================================================
  // GESTIÓN DEL RANGO DE MESES PARA PROMEDIO
  // =========================================================================
  const handleApplyMonthRange = async (newStart: string, newEnd: string, newIgnore: boolean) => {
    if (!activeTemplate) return
    setStartMonth(newStart)
    setEndMonth(newEnd)
    setIgnoreZeroMonths(newIgnore)

    // Actualizar estado local reactivamente
    setTemplates((prev) =>
      prev.map((t) =>
        t.id_plantilla === activeTemplate.id_plantilla
          ? {
              ...t,
              mes_inicio_promedio: newStart,
              mes_fin_promedio: newEnd,
              ignorar_meses_cero: newIgnore
            }
          : t
      )
    )

    setIsUpdatingMonthRange(true)
    try {
      await projectionService.updateMonthRange(
        activeTemplate.id_plantilla,
        newStart,
        newEnd,
        newIgnore
      )
      setSuccessMsg(
        `Rango para promedio actualizado: de ${newStart} a ${newEnd}. La matriz recalculó el consumo reactivamente.`
      )
    } catch (err: any) {
      console.warn('Advertencia al guardar rango de meses:', err)
    } finally {
      setIsUpdatingMonthRange(false)
    }
  }

  // Accesos rápidos de rango de meses
  const handleSetQuickMonthPreset = (preset: 'all' | 'quarter' | 'semester') => {
    const months = activeTemplate?.columnas_meses || []
    if (months.length === 0) return

    let start = months[0]
    const end = months[months.length - 1]

    if (preset === 'quarter') {
      const idx = Math.max(0, months.length - 3)
      start = months[idx]
    } else if (preset === 'semester') {
      const idx = Math.max(0, months.length - 6)
      start = months[idx]
    }

    void handleApplyMonthRange(start, end, ignoreZeroMonths)
  }

  // =========================================================================
  // CONSTRUCTOR VISUAL DE ECUACIONES POR COLUMNA
  // =========================================================================
  const openEquationModal = (colKey: CalculableColumnKey) => {
    if (!activeTemplate) return
    setSelectedColumnForEquation(colKey)
    setFormulaBarColumn(colKey)
    const config = projectionFormulaEngine.getColumnEquationConfig(colKey, activeTemplate)
    setDraftFormula(config.currentFormula)
    if (config.isCustom) {
      setDraftCustomName(config.label)
      setDraftCustomFormat(config.format || 'entero')
    }
    setEquationModalOpen(true)
  }

  const activeEquationConfig: ColumnEquationConfig | null = useMemo(() => {
    if (!activeTemplate) return null
    return projectionFormulaEngine.getColumnEquationConfig(selectedColumnForEquation, activeTemplate)
  }, [activeTemplate, selectedColumnForEquation])

  // Validación de la fórmula borrador
  const formulaValidation = useMemo(() => {
    if (!draftFormula.trim()) {
      return { valid: false, error: 'La ecuación no puede estar vacía.' }
    }
    const sampleCtx: FormulaEvaluationContext = {
      PROM_MEN: 15000,
      STOCK_REAL: 48500,
      LEAD_TIME: activeTemplate?.lead_time_meses || 3,
      STOCK_MIN: 45000,
      SEG: 9000,
      STOCK_MIN_F: 54000,
      STOCK_REDONDEADO: 60000,
      FACTOR_COMPRA: activeTemplate?.factor_compra || 2,
      SEGURIDAD_PCT: activeTemplate?.seguridad_pct || 0.2,
      DIAS_MES: activeTemplate?.dias_por_mes || 30,
      COMPRA_SUGERIDA: 120000,
      MESES_DURACION: 2.43
    }
    const res = projectionFormulaEngine.testFormula(draftFormula, sampleCtx)
    return { valid: res.valid, error: res.error, sampleResult: res.result }
  }, [draftFormula, activeTemplate])

  // Validación de la fórmula para nueva columna
  const newColumnFormulaValidation = useMemo(() => {
    if (!newColFormula.trim()) {
      return { valid: false, error: 'Escribe una ecuación matemática para la columna.' }
    }
    const sampleCtx: FormulaEvaluationContext = {
      PROM_MEN: 15000,
      STOCK_REAL: 48500,
      LEAD_TIME: activeTemplate?.lead_time_meses || 3,
      STOCK_MIN: 45000,
      SEG: 9000,
      STOCK_MIN_F: 54000,
      STOCK_REDONDEADO: 60000,
      FACTOR_COMPRA: activeTemplate?.factor_compra || 2,
      SEGURIDAD_PCT: activeTemplate?.seguridad_pct || 0.2,
      DIAS_MES: activeTemplate?.dias_por_mes || 30,
      COMPRA_SUGERIDA: 120000,
      MESES_DURACION: 2.43
    }
    const res = projectionFormulaEngine.testFormula(newColFormula, sampleCtx)
    return { valid: res.valid, error: res.error, sampleResult: res.result }
  }, [newColFormula, activeTemplate])

  // Productos de muestra para la simulación en tiempo real
  const simulationSampleRows = useMemo(() => {
    if (!calculatedRows || calculatedRows.length === 0) return []
    return calculatedRows.slice(0, 3)
  }, [calculatedRows])

  // Insertar variable u operador al cursor de la fórmula borrador
  const handleInsertToken = (token: string) => {
    setDraftFormula((prev) => {
      const trimmed = prev.trim()
      if (!trimmed) return token
      return `${prev} ${token}`
    })
  }

  // Insertar variable u operador al cursor de la nueva columna
  const handleInsertNewColToken = (token: string) => {
    setNewColFormula((prev) => {
      const trimmed = prev.trim()
      if (!trimmed) return token
      return `${prev} ${token}`
    })
  }

  // Aplicar ecuación a la columna (estándar o personalizada)
  const handleApplyColumnEquation = async () => {
    if (!activeTemplate || !formulaValidation.valid) return
    setIsSavingFormula(true)
    setErrorMsg(null)

    const colKey = selectedColumnForEquation
    const newFormula = draftFormula.trim()

    const formulaKeyMap: Record<string, string> = {
      stock_min: 'formula_stock_min',
      seguridad: 'formula_seguridad',
      stock_min_f: 'formula_stock_min_f',
      stock_min_redondeado: 'formula_stock_redondeado',
      compra_sugerida: 'formula_compra',
      meses_duracion: 'formula_meses_duracion'
    }

    try {
      const dbProp = formulaKeyMap[colKey]
      if (dbProp) {
        const res = await projectionService.updateColumnFormula(
          activeTemplate.id_plantilla,
          colKey,
          newFormula
        )

        if (!res.success) {
          setErrorMsg(res.error || 'No se pudo guardar la ecuación.')
          return
        }

        // Actualizar estado local reactivamente
        setTemplates((prev) =>
          prev.map((t) =>
            t.id_plantilla === activeTemplate.id_plantilla ? { ...t, [dbProp]: newFormula } : t
          )
        )
      } else {
        // Columna personalizada
        const currentCustoms = activeTemplate.columnas_personalizadas || []
        const updatedCustoms = currentCustoms.map((c) =>
          c.id === colKey
            ? {
                ...c,
                formula: newFormula,
                nombre: draftCustomName.trim() || c.nombre,
                formato: draftCustomFormat
              }
            : c
        )

        const res = await projectionService.saveCustomColumns(
          activeTemplate.id_plantilla,
          updatedCustoms
        )

        if (!res.success) {
          setErrorMsg(res.error || 'No se pudo guardar la columna personalizada.')
          return
        }

        setTemplates((prev) =>
          prev.map((t) =>
            t.id_plantilla === activeTemplate.id_plantilla
              ? { ...t, columnas_personalizadas: updatedCustoms }
              : t
          )
        )
      }

      setSuccessMsg(
        `Ecuación para "${draftCustomName || activeEquationConfig?.label}" actualizada y recalculada para todos los productos.`
      )
      setEquationModalOpen(false)
    } catch (err: any) {
      setErrorMsg(`Error al aplicar ecuación: ${err.message}`)
    } finally {
      setIsSavingFormula(false)
    }
  }

  // Agregar nueva columna personalizada con ecuación Excel
  const handleAddCustomColumn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeTemplate || !newColName.trim() || !newColFormula.trim()) return
    setIsAddingColumn(true)
    setErrorMsg(null)

    const colId = `col_${Date.now()}`
    const colVar = newColVariable.trim() || `COL_${Date.now()}`
    const newCol: CustomProjectionColumn = {
      id: colId,
      codigo_variable: colVar,
      nombre: newColName.trim(),
      formula: newColFormula.trim(),
      formato: newColFormat
    }

    const existingCols = activeTemplate.columnas_personalizadas || []
    const updatedCols = [...existingCols, newCol]

    try {
      const res = await projectionService.saveCustomColumns(
        activeTemplate.id_plantilla,
        updatedCols
      )
      if (!res.success) {
        setErrorMsg(res.error || 'Error al agregar la columna.')
        return
      }

      setTemplates((prev) =>
        prev.map((t) =>
          t.id_plantilla === activeTemplate.id_plantilla
            ? { ...t, columnas_personalizadas: updatedCols }
            : t
        )
      )

      setSuccessMsg(`Columna calculada "${newCol.nombre}" creada y recalculada para toda la matriz.`)
      setAddColumnModalOpen(false)
      setNewColName('')
      setNewColVariable('')
      setNewColFormula('')
      setNewColFormat('entero')
    } catch (err: any) {
      setErrorMsg(`Error al agregar columna: ${err.message}`)
    } finally {
      setIsAddingColumn(false)
    }
  }

  // Eliminar columna personalizada
  const handleDeleteCustomColumn = async (colId: string, colName: string) => {
    if (!window.confirm(`¿Confirmas eliminar la columna calculada "${colName}" de esta proyección?`))
      return
    if (!activeTemplate) return

    const updatedCols = (activeTemplate.columnas_personalizadas || []).filter((c) => c.id !== colId)
    try {
      await projectionService.saveCustomColumns(activeTemplate.id_plantilla, updatedCols)
      setTemplates((prev) =>
        prev.map((t) =>
          t.id_plantilla === activeTemplate.id_plantilla
            ? { ...t, columnas_personalizadas: updatedCols }
            : t
        )
      )
      setSuccessMsg(`Columna "${colName}" eliminada de la matriz.`)
      if (equationModalOpen && selectedColumnForEquation === colId) {
        setEquationModalOpen(false)
      }
    } catch (err: any) {
      setErrorMsg(`Error al eliminar columna: ${err.message}`)
    }
  }

  // =========================================================================
  // EDICIÓN INTERACTIVA DE CELDAS INLINE Y RESET
  // =========================================================================
  const handleCellChange = (id_item: number, field: string, rawValue: string) => {
    const numValue = rawValue === '' ? null : Number(rawValue)

    setItems((prevItems) => {
      return prevItems.map((item) => {
        if (item.id_item !== id_item) return item

        if (field.startsWith('month_')) {
          const monthKey = field.replace('month_', '')
          const updatedMonths = {
            ...item.datos_meses,
            [monthKey]: numValue !== null ? numValue : 0
          }
          void projectionService.updateItemCell(id_item, { datos_meses: updatedMonths })
          return { ...item, datos_meses: updatedMonths }
        }

        if (field === 'promedio_manual') {
          void projectionService.updateItemCell(id_item, { promedio_manual: numValue })
          return { ...item, promedio_manual: numValue }
        }

        if (field === 'stock_manual') {
          void projectionService.updateItemCell(id_item, { stock_manual: numValue })
          return { ...item, stock_manual: numValue }
        }

        if (field === 'stock_redondeado_manual') {
          void projectionService.updateItemCell(id_item, { stock_redondeado_manual: numValue })
          return { ...item, stock_redondeado_manual: numValue }
        }

        return item
      })
    })
  }

  // Revertir sobreescritura manual al promedio calculado por la fórmula
  const handleResetManualAverage = (id_item: number) => {
    setItems((prev) =>
      prev.map((i) => (i.id_item === id_item ? { ...i, promedio_manual: null } : i))
    )
    void projectionService.updateItemCell(id_item, { promedio_manual: null })
  }

  // Revertir sobreescritura manual al stock redondeado comercial
  const handleResetManualRound = (id_item: number) => {
    setItems((prev) =>
      prev.map((i) => (i.id_item === id_item ? { ...i, stock_redondeado_manual: null } : i))
    )
    void projectionService.updateItemCell(id_item, { stock_redondeado_manual: null })
  }

  // =========================================================================
  // SELECCIÓN GRUPAL Y ÓRDENES
  // =========================================================================
  const handleToggleSelectAll = () => {
    if (selectedItemIds.size === filteredRows.length) {
      setSelectedItemIds(new Set())
    } else {
      const allIds = new Set(filteredRows.map((r) => r.id_item))
      setSelectedItemIds(allIds)
    }
  }

  const handleToggleSelectRow = (id_item: number) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(id_item)) {
        next.delete(id_item)
      } else {
        next.add(id_item)
      }
      return next
    })
  }

  // Guardar parámetros globales
  const handleSaveParams = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeTemplate) return
    setIsSavingParams(true)
    setErrorMsg(null)

    const payload: TemplateParamsForm = {
      lead_time_meses: formLeadTime,
      seguridad_pct: formSeguridadPct / 100,
      factor_compra: formFactorCompra,
      dias_por_mes: formDiasMes,
      mes_inicio_promedio: startMonth,
      mes_fin_promedio: endMonth,
      ignorar_meses_cero: ignoreZeroMonths
    }

    try {
      const res = await projectionService.updateTemplateParams(activeTemplate.id_plantilla, payload)
      if (!res.success) {
        setErrorMsg(res.error || 'No se pudieron actualizar los parámetros.')
        return
      }

      setTemplates((prev) =>
        prev.map((t) =>
          t.id_plantilla === activeTemplate.id_plantilla
            ? {
                ...t,
                lead_time_meses: payload.lead_time_meses,
                seguridad_pct: payload.seguridad_pct,
                factor_compra: payload.factor_compra,
                dias_por_mes: payload.dias_por_mes
              }
            : t
        )
      )

      setSuccessMsg('Fórmulas y parámetros de proyección recalculados y guardados correctamente.')
      setParamsModalOpen(false)
    } catch (err: any) {
      setErrorMsg(`Error al guardar parámetros: ${err.message}`)
    } finally {
      setIsSavingParams(false)
    }
  }

  // Agregar nueva columna de mes
  const handleAddMonth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeTemplate || !newMonthName.trim()) return
    setIsAddingMonth(true)
    setErrorMsg(null)

    try {
      const res = await projectionService.addMonthColumn(
        activeTemplate.id_plantilla,
        activeTemplate.columnas_meses,
        newMonthName
      )

      if (!res.success) {
        setErrorMsg(res.error || 'No se pudo agregar la columna de mes.')
        return
      }

      const upperMonth = newMonthName.trim().toUpperCase()
      setTemplates((prev) =>
        prev.map((t) =>
          t.id_plantilla === activeTemplate.id_plantilla
            ? { ...t, columnas_meses: [...t.columnas_meses, upperMonth] }
            : t
        )
      )

      setSuccessMsg(`Columna ${upperMonth} incorporada a la matriz.`)
      setNewMonthName('')
      setAddMonthModalOpen(false)
    } catch (err: any) {
      setErrorMsg(`Error al agregar mes: ${err.message}`)
    } finally {
      setIsAddingMonth(false)
    }
  }

  // Agregar nuevo producto a la matriz
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeTemplate || !newProductName.trim()) return
    setIsAddingProduct(true)
    setErrorMsg(null)

    try {
      const res = await projectionService.addItem(
        activeTemplate.id_plantilla,
        newProductName,
        newProductStock
      )

      if (!res.success || !res.newItem) {
        setErrorMsg(res.error || 'No se pudo registrar el producto.')
        return
      }

      setItems((prev) => [...prev, res.newItem!])
      setSuccessMsg(`Producto "${newProductName.trim().toUpperCase()}" agregado a la proyección.`)
      setNewProductName('')
      setNewProductStock(0)
      setAddProductModalOpen(false)
    } catch (err: any) {
      setErrorMsg(`Error al agregar producto: ${err.message}`)
    } finally {
      setIsAddingProduct(false)
    }
  }

  // Eliminar fila
  const handleDeleteItem = async (id_item: number, name: string) => {
    if (!window.confirm(`¿Confirmas eliminar "${name}" de esta proyección?`)) return
    try {
      const res = await projectionService.deleteItem(id_item)
      if (!res.success) {
        setErrorMsg(res.error || 'No se pudo eliminar el producto.')
        return
      }
      setItems((prev) => prev.filter((i) => i.id_item !== id_item))
      setSuccessMsg(`Producto "${name}" eliminado de la proyección.`)
    } catch (err: any) {
      setErrorMsg(`Error al eliminar: ${err.message}`)
    }
  }

  // Generar Orden de Importación Grupal
  const handleOpenOrderModal = () => {
    if (selectedItemIds.size === 0) {
      const autoIds = calculatedRows
        .filter((r) => r.estado_critico === 'CRITICO' || r.estado_critico === 'REORDEN')
        .map((r) => r.id_item)
      if (autoIds.length > 0) {
        setSelectedItemIds(new Set(autoIds))
      }
    }

    const randomNum = Math.floor(100 + Math.random() * 900)
    setOrderNumber(`IMP-2026-${randomNum}`)
    setOrderModalOpen(true)
  }

  const handleConfirmOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreatingOrder(true)
    setErrorMsg(null)

    const selectedRows = calculatedRows.filter((r) => selectedItemIds.has(r.id_item))
    try {
      const res = await projectionService.createImportOrderFromProjection(
        orderNumber,
        orderContainerType,
        selectedRows
      )

      if (!res.success) {
        setErrorMsg(res.error || 'Error al generar la orden.')
        return
      }

      setSuccessMsg(
        `Orden de importación ${orderNumber.toUpperCase()} creada con éxito con ${selectedRows.length} productos calculados.`
      )
      setOrderModalOpen(false)
      setSelectedItemIds(new Set())
    } catch (err: any) {
      setErrorMsg(`Error inesperado: ${err.message}`)
    } finally {
      setIsCreatingOrder(false)
    }
  }

  // Exportar a CSV
  const handleExportCSV = () => {
    if (!activeTemplate || calculatedRows.length === 0) return

    const months = activeTemplate.columnas_meses || []
    const customCols = activeTemplate.columnas_personalizadas || []
    const headers = [
      'Producto',
      ...months,
      'Promedio mensual',
      'Stock real',
      'Stock minimo',
      'Seguridad',
      'Stock minimo final',
      'Stock redondeado',
      'Compra sugerida',
      'Meses duracion',
      'Vencimiento cobertura',
      ...customCols.map((c) => c.nombre),
      'Estado'
    ]

    const rows = calculatedRows.map((r) => {
      const mValues = months.map((m) => r.datos_meses[m] ?? 0)
      const customValues = customCols.map((c) => r.valores_personalizados?.[c.id] ?? 0)
      return [
        `"${r.nombre_producto}"`,
        ...mValues,
        r.promedio_final,
        r.stock_real,
        r.stock_min,
        r.seguridad,
        r.stock_min_f,
        r.stock_min_redondeado,
        r.compra_sugerida,
        r.meses_duracion,
        `"${r.texto_duracion} (${r.fecha_quiebre})"`,
        ...customValues,
        r.estado_critico
      ].join(',')
    })

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `Proyeccion_${activeTemplate.codigo}_${new Date().toISOString().split('T')[0]}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Fórmulas activas en chips resumidos
  const columnChips = useMemo(() => {
    if (!activeTemplate) return {}
    const chips: Record<string, string> = {
      stock_min: activeTemplate.formula_stock_min || 'PROM_MEN * lead_time',
      seguridad: activeTemplate.formula_seguridad || 'stock_min * 20%',
      stock_min_f: activeTemplate.formula_stock_min_f || 'stock_min + seg',
      stock_min_redondeado: activeTemplate.formula_stock_redondeado || 'CEIL 1,000',
      compra_sugerida: activeTemplate.formula_compra || 'redondeado * 2',
      meses_duracion: activeTemplate.formula_meses_duracion || '(real * 3) / redondeado'
    }
    if (activeTemplate.columnas_personalizadas) {
      for (const c of activeTemplate.columnas_personalizadas) {
        chips[c.id] = c.formula
      }
    }
    return chips
  }, [activeTemplate])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* 1. Encabezado de página */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              className="button secondary button-sm"
              onClick={onBack}
              title="Volver al centro de operaciones"
            >
              Volver
            </button>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Módulo 06 · Planificación comercial e importaciones
            </span>
          </div>
          <h1 className="page-title" style={{ marginTop: '6px' }}>
            Órdenes y proyecciones de importación
          </h1>
          <p className="page-lead" style={{ marginTop: '2px' }}>
            Matriz dinámica tipo Excel con cálculo reactivo de fórmulas por columna, selección de
            rango de meses y órdenes sugeridas.
          </p>
        </div>

        {/* Acciones Rápidas Superiores */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button secondary"
            onClick={handleSyncLiveStock}
            disabled={syncingStock}
            title="Actualizar existencias actuales directamente desde las paletas e inventario físico"
          >
            {syncingStock ? 'Sincronizando...' : 'Sincronizar stock'}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => setParamsModalOpen(true)}
            title="Configurar los parámetros globales de lead time y seguridad"
          >
            Parámetros globales
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={handleExportCSV}
            title="Descargar matriz en formato CSV"
          >
            Exportar CSV
          </button>
          <button
            type="button"
            className="button primary"
            onClick={handleOpenOrderModal}
            title="Crear orden oficial de importación con los productos y cantidades sugeridas"
          >
            Generar orden de importación {selectedItemIds.size > 0 ? `(${selectedItemIds.size})` : ''}
          </button>
        </div>
      </div>

      {/* 2. Mensajes informativos y de error */}
      {errorMsg && (
        <div
          className="notice"
          role="alert"
          style={{
            borderColor: 'var(--color-danger)',
            backgroundColor: '#FDF3F2',
            color: 'var(--color-danger)'
          }}
        >
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div
          className="notice"
          role="alert"
          style={{
            borderColor: 'var(--color-success)',
            backgroundColor: '#F1F8F4',
            color: 'var(--color-success)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>{successMsg}</span>
          {onOpenReceptions && successMsg.includes('creada con éxito') && (
            <button
              type="button"
              className="button secondary button-sm"
              onClick={onOpenReceptions}
              style={{ marginLeft: '12px' }}
            >
              Ir a Recepciones RFID
            </button>
          )}
        </div>
      )}

      {/* 3. Selector de Pestañas de Plantilla */}
      <div
        className="module-tabs"
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          gap: '12px'
        }}
      >
        {templates.map((t) => {
          const isActive = t.id_plantilla === selectedTemplateId
          return (
            <button
              key={t.id_plantilla}
              type="button"
              onClick={() => void handleSelectTemplate(t.id_plantilla)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '3px solid var(--color-brand)' : '3px solid transparent',
                padding: '10px 16px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--color-brand)' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: '15px'
              }}
            >
              {t.nombre} ({t.codigo})
            </button>
          )
        })}
      </div>

      {/* 4. Tira Horizontal de Indicadores Clave (skill_design.md) */}
      <section className="indicator-strip" aria-label="Resumen de proyecciones">
        <div className="indicator-card">
          <span className="indicator-label">Productos analizados</span>
          <span className="indicator-value">{loading ? '—' : metrics.total}</span>
          <span className="indicator-context">En la matriz activa</span>
        </div>

        <div
          className="indicator-card"
          style={{
            borderColor: metrics.criticos > 0 ? 'var(--color-danger)' : 'var(--color-border)'
          }}
        >
          <span
            className="indicator-label"
            style={{ color: metrics.criticos > 0 ? 'var(--color-danger)' : 'inherit' }}
          >
            Riesgo de quiebre
          </span>
          <span
            className="indicator-value"
            style={{ color: metrics.criticos > 0 ? 'var(--color-danger)' : 'inherit' }}
          >
            {loading ? '—' : metrics.criticos}
          </span>
          <span className="indicator-context">Menos de 1 mes de stock</span>
        </div>

        <div
          className="indicator-card"
          style={{
            borderColor: metrics.reorden > 0 ? 'var(--color-warning)' : 'var(--color-border)'
          }}
        >
          <span
            className="indicator-label"
            style={{ color: metrics.reorden > 0 ? 'var(--color-warning)' : 'inherit' }}
          >
            Ventana de reorden
          </span>
          <span
            className="indicator-value"
            style={{ color: metrics.reorden > 0 ? 'var(--color-warning)' : 'inherit' }}
          >
            {loading ? '—' : metrics.reorden}
          </span>
          <span className="indicator-context">
            Entre 1 y {activeTemplate?.lead_time_meses || 3} meses de stock
          </span>
        </div>

        <div className="indicator-card">
          <span className="indicator-label">Compra total sugerida</span>
          <span className="indicator-value">
            {loading ? '—' : metrics.totalCompra.toLocaleString('es-PE')}
          </span>
          <span className="indicator-context">Unidades calculadas</span>
        </div>
      </section>

      {/* =========================================================================
          5. PANEL A: Rango Dinámico de Meses para el Promedio de Consumo
          ========================================================================= */}
      {activeTemplate && activeTemplate.columnas_meses?.length > 0 && (
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-brand)'
                  }}
                />
                <h3
                  style={{
                    margin: 0,
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)'
                  }}
                >
                  Rango de meses para cálculo de promedio mensual (Promedio)
                </h3>
              </div>
              <p
                style={{
                  margin: '3px 0 0 16px',
                  fontSize: '13px',
                  color: 'var(--color-text-secondary)'
                }}
              >
                Selecciona de qué mes a qué mes se calculará el consumo promedio de cada producto:
              </p>
            </div>

            {/* Contador de meses activos */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 10px',
                borderRadius: '4px',
                background: 'var(--color-brand-soft)',
                color: 'var(--color-brand-deep)',
                fontSize: '13px',
                fontWeight: 600
              }}
            >
              <span>{activeMonthsInAverage.length} meses en promedio:</span>
              <span style={{ fontWeight: 500, color: 'var(--color-brand)' }}>
                {activeMonthsInAverage.join(', ')}
              </span>
            </div>
          </div>

          {/* Selectores de Mes Desde / Hasta y Presets */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px',
              paddingTop: '6px',
              borderTop: '1px solid #EEF3F5'
            }}
          >
            {/* Desde mes */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label
                style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}
              >
                Desde:
              </label>
              <select
                value={startMonth}
                onChange={(e) => void handleApplyMonthRange(e.target.value, endMonth, ignoreZeroMonths)}
                style={{
                  padding: '6px 10px',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  background: 'var(--color-surface)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)'
                }}
              >
                {activeTemplate.columnas_meses.map((m) => (
                  <option key={`start_${m}`} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Hasta mes */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label
                style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}
              >
                Hasta:
              </label>
              <select
                value={endMonth}
                onChange={(e) => void handleApplyMonthRange(startMonth, e.target.value, ignoreZeroMonths)}
                style={{
                  padding: '6px 10px',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  background: 'var(--color-surface)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)'
                }}
              >
                {activeTemplate.columnas_meses.map((m) => (
                  <option key={`end_${m}`} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Presets Rápidos */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginRight: '2px' }}>
                Preajustes:
              </span>
              <button
                type="button"
                className="button secondary button-sm"
                onClick={() => handleSetQuickMonthPreset('quarter')}
                title="Calcular con los últimos 3 meses históricos"
              >
                Último trimestre
              </button>
              <button
                type="button"
                className="button secondary button-sm"
                onClick={() => handleSetQuickMonthPreset('semester')}
                title="Calcular con los últimos 6 meses históricos"
              >
                Último semestre
              </button>
              <button
                type="button"
                className="button secondary button-sm"
                onClick={() => handleSetQuickMonthPreset('all')}
                title="Calcular con todo el histórico disponible"
              >
                Todo el histórico
              </button>
            </div>

            {/* Opción ignorar ceros */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={ignoreZeroMonths}
                  onChange={(e) =>
                    void handleApplyMonthRange(startMonth, endMonth, e.target.checked)
                  }
                />
                Ignorar meses con consumo cero
              </label>
              {isUpdatingMonthRange && (
                <span style={{ fontSize: '12px', color: 'var(--color-brand)' }}>
                  Recalculando...
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          6. PANEL B: Barra de Fórmulas tipo Excel (Excel Formula Bar)
          ========================================================================= */}
      {activeTemplate && (
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          {/* Logo FX */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              borderRadius: '4px',
              background: 'var(--color-brand-soft)',
              color: 'var(--color-brand-deep)',
              fontWeight: 700,
              fontSize: '13px'
            }}
          >
            <span>fx</span>
          </div>

          {/* Selector de Columna a inspeccionar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Ecuación de la columna:
            </span>
            <select
              value={formulaBarColumn}
              onChange={(e) => setFormulaBarColumn(e.target.value)}
              style={{
                padding: '6px 10px',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                background: 'var(--color-surface)',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-brand)'
              }}
            >
              <optgroup label="Columnas estándar del sistema">
                <option value="stock_min">Stock mínimo base (Stock mín)</option>
                <option value="seguridad">Stock de seguridad (Seguridad)</option>
                <option value="stock_min_f">Stock mínimo final (Stock mín final)</option>
                <option value="stock_min_redondeado">Stock redondeado (Redondeado)</option>
                <option value="compra_sugerida">Compra sugerida (Compra)</option>
                <option value="meses_duracion">Meses de duración (Duración)</option>
              </optgroup>
              {activeTemplate?.columnas_personalizadas && activeTemplate.columnas_personalizadas.length > 0 && (
                <optgroup label="Columnas calculadas personalizadas">
                  {activeTemplate.columnas_personalizadas.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.nombre} ({col.codigo_variable})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Fórmula activa actual en texto */}
          <div
            style={{
              flex: 1,
              minWidth: '220px',
              background: 'var(--color-canvas)',
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid var(--color-border)',
              fontFamily: 'monospace',
              fontSize: '13px',
              color: 'var(--color-text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
            title={columnChips[formulaBarColumn]}
          >
            = {columnChips[formulaBarColumn]}
          </div>

          {/* Botón para abrir el diseñador de ecuación */}
          <button
            type="button"
            className="button primary button-sm"
            onClick={() => openEquationModal(formulaBarColumn)}
            title="Abrir el constructor visual para cambiar la fórmula de esta columna"
          >
            Diseñar ecuación de columna
          </button>
        </div>
      )}

      {/* 7. Barra de Búsqueda, Filtros y Botones de Agregar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '260px' }}>
          <input
            type="search"
            placeholder="Buscar por nombre de producto o suministro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '380px',
              padding: '8px 12px',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              background: 'var(--color-surface)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: '14px'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginRight: '4px' }}>
              Estado:
            </span>
            {(['TODOS', 'CRITICO', 'REORDEN', 'OPTIMO'] as const).map((st) => {
              const labels = {
                TODOS: 'Todos',
                CRITICO: 'Crítico (< 1 mes)',
                REORDEN: 'Reordenar (1-3 meses)',
                OPTIMO: 'Abastecido'
              }
              const isSel = statusFilter === st
              return (
                <button
                  key={st}
                  type="button"
                  className={`button button-sm ${isSel ? 'primary' : 'secondary'}`}
                  onClick={() => setStatusFilter(st)}
                >
                  {labels[st]}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            className="button secondary button-sm"
            onClick={() => setAddColumnModalOpen(true)}
            title="Añadir una nueva columna calculada con ecuación Excel"
            style={{ fontWeight: 600, color: 'var(--color-brand)', borderColor: 'var(--color-brand)' }}
          >
            + Agregar columna
          </button>
          <button
            type="button"
            className="button secondary button-sm"
            onClick={() => setAddMonthModalOpen(true)}
            title="Añadir una columna de mes adicional al histórico"
          >
            + Agregar mes
          </button>
          <button
            type="button"
            className="button secondary button-sm"
            onClick={() => setAddProductModalOpen(true)}
            title="Añadir un nuevo producto a la matriz"
          >
            + Agregar producto
          </button>
        </div>
      </div>

      {/* =========================================================================
          8. MATRIZ INTERACTIVA (Grid tipo Excel con Chips de Fórmulas y Celdas Editables)
          ========================================================================= */}
      <div
        className="table-wrap"
        style={{
          overflowX: 'auto',
          border: '1px solid var(--color-border)',
          borderRadius: '6px',
          background: 'var(--color-surface)'
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr
              style={{
                background: 'var(--color-canvas)',
                borderBottom: '2px solid var(--color-border)',
                color: 'var(--color-text-secondary)'
              }}
            >
              <th style={{ padding: '10px 8px', width: '36px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={filteredRows.length > 0 && selectedItemIds.size === filteredRows.length}
                  onChange={handleToggleSelectAll}
                  title="Seleccionar todos para generar orden"
                />
              </th>
              <th style={{ padding: '10px 12px', minWidth: '220px', fontWeight: 600 }}>Producto</th>

              {/* Columnas dinámicas de meses */}
              {activeTemplate?.columnas_meses?.map((m) => {
                const isInAverage = activeMonthsInAverage.includes(m)
                return (
                  <th
                    key={m}
                    style={{
                      padding: '8px 8px',
                      minWidth: '78px',
                      textAlign: 'right',
                      fontWeight: isInAverage ? 700 : 500,
                      backgroundColor: isInAverage ? 'var(--color-brand-soft)' : 'transparent',
                      color: isInAverage ? 'var(--color-brand-deep)' : 'inherit',
                      borderTop: isInAverage ? '3px solid var(--color-brand)' : '3px solid transparent'
                    }}
                    title={
                      isInAverage
                        ? `Columna ${m}: activa para el cálculo del promedio mensual`
                        : `Columna ${m}: histórico informativo (fuera del rango de promedio)`
                    }
                  >
                    <div>{m}</div>
                    {isInAverage && (
                      <span
                        style={{
                          fontSize: '10px',
                          display: 'block',
                          color: 'var(--color-brand)',
                          fontWeight: 600
                        }}
                      >
                        ✓ Promedio
                      </span>
                    )}
                  </th>
                )
              })}

              {/* Promedio mensual */}
              <th
                style={{
                  padding: '8px 8px',
                  minWidth: '105px',
                  textAlign: 'right',
                  fontWeight: 600,
                  background: '#F8FAFC'
                }}
              >
                <div>Promedio</div>
                <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block' }}>
                  {activeMonthsInAverage.length} mes(es)
                </span>
              </th>

              {/* Stock real */}
              <th style={{ padding: '8px 8px', minWidth: '95px', textAlign: 'right', fontWeight: 600 }}>
                <div>Stock real</div>
                <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block' }}>
                  Físico actual
                </span>
              </th>

              {/* Stock mín con chip de fórmula - Clic en encabezado para editar ecuación */}
              <th
                onClick={() => openEquationModal('stock_min')}
                style={{
                  padding: '8px 8px',
                  minWidth: '105px',
                  textAlign: 'right',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor:
                    selectedColumnForEquation === 'stock_min'
                      ? 'var(--color-brand-soft)'
                      : 'transparent',
                  transition: 'background-color 0.15s ease'
                }}
                title="Haz clic para modificar la ecuación de Stock Mínimo (dinámica tipo Excel)"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                  <span>Stock mín</span>
                  <span style={{ fontSize: '10px', color: 'var(--color-brand)', fontWeight: 700 }}>fx</span>
                </div>
                <div
                  style={{
                    display: 'inline-block',
                    border: '1px dashed var(--color-border)',
                    borderRadius: '3px',
                    padding: '1px 5px',
                    fontSize: '10px',
                    color: 'var(--color-brand)',
                    marginTop: '2px'
                  }}
                >
                  {activeTemplate?.formula_stock_min ? 'fórmula' : `× ${activeTemplate?.lead_time_meses || 3}m`}
                </div>
              </th>

              {/* Seguridad con chip de fórmula - Clic en encabezado para editar ecuación */}
              <th
                onClick={() => openEquationModal('seguridad')}
                style={{
                  padding: '8px 8px',
                  minWidth: '95px',
                  textAlign: 'right',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor:
                    selectedColumnForEquation === 'seguridad'
                      ? 'var(--color-brand-soft)'
                      : 'transparent',
                  transition: 'background-color 0.15s ease'
                }}
                title="Haz clic para modificar la ecuación de Stock de Seguridad (dinámica tipo Excel)"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                  <span>Seguridad</span>
                  <span style={{ fontSize: '10px', color: 'var(--color-brand)', fontWeight: 700 }}>fx</span>
                </div>
                <div
                  style={{
                    display: 'inline-block',
                    border: '1px dashed var(--color-border)',
                    borderRadius: '3px',
                    padding: '1px 5px',
                    fontSize: '10px',
                    color: 'var(--color-brand)',
                    marginTop: '2px'
                  }}
                >
                  {Number(activeTemplate?.seguridad_pct || 0.2) * 100}%
                </div>
              </th>

              {/* Stock mín final con chip de fórmula - Clic en encabezado para editar ecuación */}
              <th
                onClick={() => openEquationModal('stock_min_f')}
                style={{
                  padding: '8px 8px',
                  minWidth: '105px',
                  textAlign: 'right',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor:
                    selectedColumnForEquation === 'stock_min_f'
                      ? 'var(--color-brand-soft)'
                      : 'transparent',
                  transition: 'background-color 0.15s ease'
                }}
                title="Haz clic para modificar la ecuación de Stock Mínimo Final (dinámica tipo Excel)"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                  <span>Stock mín final</span>
                  <span style={{ fontSize: '10px', color: 'var(--color-brand)', fontWeight: 700 }}>fx</span>
                </div>
                <div
                  style={{
                    display: 'inline-block',
                    border: '1px dashed var(--color-border)',
                    borderRadius: '3px',
                    padding: '1px 5px',
                    fontSize: '10px',
                    color: 'var(--color-brand)',
                    marginTop: '2px'
                  }}
                >
                  Mín + Seg
                </div>
              </th>

              {/* Redondeado con chip de fórmula - Clic en encabezado para editar ecuación */}
              <th
                onClick={() => openEquationModal('stock_min_redondeado')}
                style={{
                  padding: '8px 8px',
                  minWidth: '110px',
                  textAlign: 'right',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor:
                    selectedColumnForEquation === 'stock_min_redondeado'
                      ? 'var(--color-brand-soft)'
                      : 'transparent',
                  transition: 'background-color 0.15s ease'
                }}
                title="Haz clic para configurar la regla de redondeo comercial (dinámica tipo Excel)"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                  <span>Redondeado</span>
                  <span style={{ fontSize: '10px', color: 'var(--color-brand)', fontWeight: 700 }}>fx</span>
                </div>
                <div
                  style={{
                    display: 'inline-block',
                    border: '1px dashed var(--color-border)',
                    borderRadius: '3px',
                    padding: '1px 5px',
                    fontSize: '10px',
                    color: 'var(--color-brand)',
                    marginTop: '2px'
                  }}
                >
                  Lote
                </div>
              </th>

              {/* Compra sugerida con chip de fórmula - Clic en encabezado para editar ecuación */}
              <th
                onClick={() => openEquationModal('compra_sugerida')}
                style={{
                  padding: '8px 10px',
                  minWidth: '120px',
                  textAlign: 'right',
                  fontWeight: 700,
                  background: 'var(--color-brand-soft)',
                  color: 'var(--color-brand-deep)',
                  cursor: 'pointer',
                  borderTop: '3px solid var(--color-brand)'
                }}
                title="Haz clic para modificar la ecuación de Compra Sugerida (dinámica tipo Excel)"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                  <span>Compra sugerida</span>
                  <span style={{ fontSize: '10px', color: 'var(--color-brand)', fontWeight: 700 }}>fx</span>
                </div>
                <div
                  style={{
                    display: 'inline-block',
                    background: 'white',
                    border: '1px solid var(--color-brand)',
                    borderRadius: '3px',
                    padding: '1px 5px',
                    fontSize: '10px',
                    color: 'var(--color-brand)',
                    marginTop: '2px',
                    fontWeight: 600
                  }}
                >
                  {activeTemplate?.formula_compra ? 'fórmula' : `× ${activeTemplate?.factor_compra || 2}`}
                </div>
              </th>

              {/* Duración con chip de fórmula - Clic en encabezado para editar ecuación */}
              <th
                onClick={() => openEquationModal('meses_duracion')}
                style={{
                  padding: '8px 8px',
                  minWidth: '95px',
                  textAlign: 'center',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor:
                    selectedColumnForEquation === 'meses_duracion'
                      ? 'var(--color-brand-soft)'
                      : 'transparent',
                  transition: 'background-color 0.15s ease'
                }}
                title="Haz clic para modificar la fórmula de Duración en Meses (dinámica tipo Excel)"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <span>Duración</span>
                  <span style={{ fontSize: '10px', color: 'var(--color-brand)', fontWeight: 700 }}>fx</span>
                </div>
                <div
                  style={{
                    display: 'inline-block',
                    border: '1px dashed var(--color-border)',
                    borderRadius: '3px',
                    padding: '1px 5px',
                    fontSize: '10px',
                    color: 'var(--color-brand)',
                    marginTop: '2px'
                  }}
                >
                  Meses
                </div>
              </th>

              {/* Columnas personalizadas calculadas añadidas dinámicamente */}
              {activeTemplate?.columnas_personalizadas?.map((col) => (
                <th
                  key={col.id}
                  onClick={() => openEquationModal(col.id)}
                  style={{
                    padding: '8px 10px',
                    minWidth: '120px',
                    textAlign: 'right',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor:
                      selectedColumnForEquation === col.id ? 'var(--color-brand-soft)' : '#F9FBFB',
                    borderTop: '3px solid var(--color-brand)',
                    transition: 'background-color 0.15s ease'
                  }}
                  title={`Haz clic para modificar la ecuación de "${col.nombre}" (dinámica tipo Excel)`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                    <span style={{ color: 'var(--color-brand-deep)' }}>{col.nombre}</span>
                    <span style={{ fontSize: '10px', color: 'var(--color-brand)', fontWeight: 700 }}>fx</span>
                  </div>
                  <div
                    style={{
                      display: 'inline-block',
                      border: '1px dashed var(--color-brand)',
                      borderRadius: '3px',
                      padding: '1px 5px',
                      fontSize: '10px',
                      color: 'var(--color-brand)',
                      marginTop: '2px',
                      maxWidth: '120px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                    title={`= ${col.formula}`}
                  >
                    = {col.formula}
                  </div>
                </th>
              ))}

              {/* Botón rápido en cabecera para agregar nueva columna calculada */}
              <th
                style={{
                  padding: '8px 8px',
                  width: '45px',
                  textAlign: 'center',
                  background: 'var(--color-canvas)',
                  borderLeft: '1px dashed var(--color-border)'
                }}
              >
                <button
                  type="button"
                  onClick={() => setAddColumnModalOpen(true)}
                  title="Agregar nueva columna calculada con ecuación Excel"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px dashed var(--color-brand)',
                    borderRadius: '4px',
                    color: 'var(--color-brand)',
                    fontWeight: 700,
                    fontSize: '13px',
                    padding: '2px 7px',
                    cursor: 'pointer'
                  }}
                >
                  +
                </button>
              </th>

              <th style={{ padding: '10px 12px', minWidth: '200px', fontWeight: 500 }}>
                Cobertura estimada
              </th>

              <th style={{ padding: '10px 8px', width: '50px', textAlign: 'center' }}>
                Acción
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={
                    13 +
                    (activeTemplate?.columnas_meses?.length || 0) +
                    (activeTemplate?.columnas_personalizadas?.length || 0) +
                    1
                  }
                  style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)' }}
                >
                  Cargando matriz de proyección y calculando fórmulas reactivas...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    13 +
                    (activeTemplate?.columnas_meses?.length || 0) +
                    (activeTemplate?.columnas_personalizadas?.length || 0) +
                    1
                  }
                  style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)' }}
                >
                  No se encontraron productos con los criterios especificados.
                </td>
              </tr>
            ) : (
              filteredRows.map((r, rowIdx) => {
                const isSelected = selectedItemIds.has(r.id_item)
                const monthKeys = activeTemplate?.columnas_meses || []
                const originalItem = items.find((i) => i.id_item === r.id_item)
                const hasManualAverage =
                  originalItem?.promedio_manual !== null &&
                  originalItem?.promedio_manual !== undefined
                const hasManualRound =
                  originalItem?.stock_redondeado_manual !== null &&
                  originalItem?.stock_redondeado_manual !== undefined

                // Semáforo para badge de duración
                let badgeBg = '#E9F5EC'
                let badgeColor = 'var(--color-success)'
                let badgeText = 'Óptimo'
                if (r.estado_critico === 'CRITICO') {
                  badgeBg = '#FDF3F2'
                  badgeColor = 'var(--color-danger)'
                  badgeText = 'Crítico'
                } else if (r.estado_critico === 'REORDEN') {
                  badgeBg = '#FFF8E6'
                  badgeColor = 'var(--color-warning)'
                  badgeText = 'Reordenar'
                }

                return (
                  <tr
                    key={r.id_item}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      backgroundColor: isSelected
                        ? 'var(--color-brand-soft)'
                        : rowIdx % 2 === 0
                        ? 'var(--color-surface)'
                        : 'var(--color-canvas)'
                    }}
                  >
                    {/* Checkbox de selección */}
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectRow(r.id_item)}
                      />
                    </td>

                    {/* Nombre del producto */}
                    <td
                      style={{
                        padding: '8px 12px',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)'
                      }}
                    >
                      {r.nombre_producto}
                    </td>

                    {/* Celdas editables de meses */}
                    {monthKeys.map((m) => {
                      const val = r.datos_meses[m] ?? 0
                      const isInAvg = activeMonthsInAverage.includes(m)
                      return (
                        <td
                          key={m}
                          style={{
                            padding: '4px 6px',
                            textAlign: 'right',
                            backgroundColor: isInAvg ? '#F4FAF8' : 'transparent'
                          }}
                        >
                          <input
                            type="number"
                            defaultValue={val === 0 ? '' : val}
                            onBlur={(e) =>
                              handleCellChange(r.id_item, `month_${m}`, e.target.value)
                            }
                            style={{
                              width: '100%',
                              minWidth: '65px',
                              padding: '4px 6px',
                              border: '1px solid transparent',
                              borderRadius: '4px',
                              background: 'transparent',
                              textAlign: 'right',
                              fontSize: '12px',
                              color: val < 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                              fontWeight: isInAvg ? 600 : 400
                            }}
                            onFocus={(e) => (e.target.style.border = '1px solid var(--color-brand)')}
                            onBlurCapture={(e) => (e.target.style.border = '1px solid transparent')}
                          />
                        </td>
                      )
                    })}

                    {/* Promedio mensual (Editable inline con reset si se sobreescribió) */}
                    <td
                      style={{
                        padding: '4px 6px',
                        textAlign: 'right',
                        background: '#F8FAFC',
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
                        <input
                          type="number"
                          defaultValue={r.promedio_final || ''}
                          onBlur={(e) =>
                            handleCellChange(r.id_item, 'promedio_manual', e.target.value)
                          }
                          placeholder={r.promedio_calculado.toString()}
                          title={
                            hasManualAverage
                              ? `Promedio sobreescrito manualmente: ${r.promedio_final} (Calculado por fórmula: ${r.promedio_calculado})`
                              : `Promedio calculado automáticamente según rango de meses: ${r.promedio_calculado}`
                          }
                          style={{
                            width: '100%',
                            minWidth: '70px',
                            padding: '4px 6px',
                            border: '1px solid transparent',
                            borderRadius: '4px',
                            background: 'transparent',
                            textAlign: 'right',
                            fontWeight: 600,
                            fontSize: '13px',
                            color: hasManualAverage ? 'var(--color-brand)' : 'var(--color-text-primary)'
                          }}
                          onFocus={(e) => (e.target.style.border = '1px solid var(--color-brand)')}
                          onBlurCapture={(e) => (e.target.style.border = '1px solid transparent')}
                        />
                        {hasManualAverage && (
                          <button
                            type="button"
                            onClick={() => handleResetManualAverage(r.id_item)}
                            title="Restablecer al promedio calculado por la fórmula de rango"
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--color-text-secondary)',
                              cursor: 'pointer',
                              fontSize: '11px',
                              padding: '2px'
                            }}
                          >
                            ↻
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Stock real (Editable o desde inventario físico) */}
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                      <input
                        type="number"
                        defaultValue={r.stock_real}
                        onBlur={(e) => handleCellChange(r.id_item, 'stock_manual', e.target.value)}
                        title="Stock real actual en almacén (haz clic para ajustar manualmente)"
                        style={{
                          width: '100%',
                          minWidth: '75px',
                          padding: '4px 6px',
                          border: '1px solid transparent',
                          borderRadius: '4px',
                          background: 'transparent',
                          textAlign: 'right',
                          fontWeight: 600,
                          fontSize: '13px',
                          color: r.stock_real <= 0 ? 'var(--color-danger)' : 'var(--color-text-primary)'
                        }}
                        onFocus={(e) => (e.target.style.border = '1px solid var(--color-brand)')}
                        onBlurCapture={(e) => (e.target.style.border = '1px solid transparent')}
                      />
                    </td>

                    {/* Stock mínimo calculado */}
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                      {r.stock_min.toLocaleString('es-PE')}
                    </td>

                    {/* Seguridad calculada */}
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                      {r.seguridad.toLocaleString('es-PE')}
                    </td>

                    {/* Stock mínimo final */}
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--color-text-primary)' }}>
                      {r.stock_min_f.toLocaleString('es-PE')}
                    </td>

                    {/* Stock redondeado (Editable con reset) */}
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
                        <input
                          type="number"
                          defaultValue={r.stock_min_redondeado}
                          onBlur={(e) =>
                            handleCellChange(r.id_item, 'stock_redondeado_manual', e.target.value)
                          }
                          title={
                            hasManualRound
                              ? `Lote sobreescrito manualmente: ${r.stock_min_redondeado}`
                              : 'Stock redondeado según regla de empaque'
                          }
                          style={{
                            width: '100%',
                            minWidth: '80px',
                            padding: '4px 6px',
                            border: '1px solid transparent',
                            borderRadius: '4px',
                            background: 'transparent',
                            textAlign: 'right',
                            fontWeight: 600,
                            fontSize: '13px',
                            color: hasManualRound ? 'var(--color-brand)' : 'var(--color-text-primary)'
                          }}
                          onFocus={(e) => (e.target.style.border = '1px solid var(--color-brand)')}
                          onBlurCapture={(e) => (e.target.style.border = '1px solid transparent')}
                        />
                        {hasManualRound && (
                          <button
                            type="button"
                            onClick={() => handleResetManualRound(r.id_item)}
                            title="Restablecer al redondeo comercial calculado"
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--color-text-secondary)',
                              cursor: 'pointer',
                              fontSize: '11px',
                              padding: '2px'
                            }}
                          >
                            ↻
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Compra sugerida (Destacada según ecuación activa) */}
                    <td
                      style={{
                        padding: '8px 10px',
                        textAlign: 'right',
                        fontWeight: 700,
                        fontSize: '14px',
                        background: 'var(--color-brand-soft)',
                        color: 'var(--color-brand-deep)'
                      }}
                    >
                      {r.compra_sugerida.toLocaleString('es-PE')}
                    </td>

                    {/* Duración en meses con badge de semáforo */}
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: badgeBg,
                          color: badgeColor
                        }}
                        title={`Duración: ${r.meses_duracion} meses (${badgeText})`}
                      >
                        {r.meses_duracion} m
                      </span>
                    </td>

                    {/* Columnas personalizadas calculadas */}
                    {activeTemplate?.columnas_personalizadas?.map((col) => {
                      const val = r.valores_personalizados?.[col.id] ?? 0
                      const formatted = formatCustomColumnValue(val, col.formato)
                      return (
                        <td
                          key={col.id}
                          style={{
                            padding: '8px 10px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: 'var(--color-text-primary)',
                            backgroundColor: '#FAFCFD'
                          }}
                          title={`${col.nombre}: ${formatted} (Ecuación: = ${col.formula})`}
                        >
                          {formatted}
                        </td>
                      )
                    })}

                    {/* Espaciador para alinear con el botón '+' de la cabecera */}
                    <td
                      style={{
                        padding: '4px 6px',
                        borderLeft: '1px dashed var(--color-border)',
                        textAlign: 'center'
                      }}
                    >
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: '11px' }}>—</span>
                    </td>

                    {/* Cobertura estimada (Días + Fecha de vencimiento exacta) */}
                    <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      <span>{r.texto_duracion}</span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '11px',
                          color: badgeColor,
                          fontWeight: 500
                        }}
                      >
                        Vence: {r.fecha_quiebre}
                      </span>
                    </td>

                    {/* Botón de eliminar fila */}
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => void handleDeleteItem(r.id_item, r.nombre_producto)}
                        title="Eliminar producto de la matriz"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-danger)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: '4px'
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* =========================================================================
          MODAL A: Constructor Visual de Ecuaciones por Columna (Interactive Equation Builder)
          ========================================================================= */}
      {equationModalOpen && activeEquationConfig && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '680px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px'
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '12px',
                    color: 'var(--color-brand)',
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}
                >
                  Editor de Fórmulas y Ecuaciones
                </span>
                <h2
                  style={{
                    margin: '2px 0 0 0',
                    fontSize: '20px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)'
                  }}
                >
                  Configurar ecuación: {activeEquationConfig.label}
                </h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setEquationModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Elige las variables de datos y operadores matemáticos para construir la fórmula que
              calculará el valor de esta columna por cada producto, al igual que en una hoja de Excel.
            </p>

            {/* Pestañas para cambiar rápidamente de columna si lo desea */}
            <div
              style={{
                display: 'flex',
                gap: '6px',
                overflowX: 'auto',
                marginBottom: '14px',
                paddingBottom: '4px'
              }}
            >
              {[
                'stock_min',
                'seguridad',
                'stock_min_f',
                'stock_min_redondeado',
                'compra_sugerida',
                'meses_duracion',
                ...(activeTemplate?.columnas_personalizadas?.map((c) => c.id) || [])
              ].map((k) => {
                const isSelected = selectedColumnForEquation === k
                const cfg = projectionFormulaEngine.getColumnEquationConfig(k, activeTemplate)
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setSelectedColumnForEquation(k)
                      setFormulaBarColumn(k)
                      setDraftFormula(cfg.currentFormula)
                      if (cfg.isCustom) {
                        setDraftCustomName(cfg.label)
                        setDraftCustomFormat(cfg.format || 'entero')
                      }
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: isSelected
                        ? '1px solid var(--color-brand)'
                        : '1px solid var(--color-border)',
                      background: isSelected ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                      color: isSelected ? 'var(--color-brand-deep)' : 'var(--color-text-secondary)',
                      fontWeight: isSelected ? 600 : 400,
                      fontSize: '12px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {cfg.isCustom ? `[+] ${cfg.headerTitle}` : cfg.headerTitle}
                  </button>
                )
              })}
            </div>

            {/* Si es columna personalizada, permitir editar nombre y formato de celda */}
            {activeEquationConfig.isCustom && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginBottom: '14px',
                  padding: '10px 12px',
                  background: 'var(--color-canvas)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px'
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      marginBottom: '4px'
                    }}
                  >
                    Nombre de la columna
                  </label>
                  <input
                    type="text"
                    value={draftCustomName}
                    onChange={(e) => setDraftCustomName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '4px',
                      background: 'var(--color-surface)',
                      fontSize: '13px'
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      marginBottom: '4px'
                    }}
                  >
                    Formato de visualización
                  </label>
                  <select
                    value={draftCustomFormat}
                    onChange={(e) => setDraftCustomFormat(e.target.value as ColumnDisplayFormat)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '4px',
                      background: 'var(--color-surface)',
                      fontSize: '13px'
                    }}
                  >
                    <option value="entero">Número entero (ej. 1,000)</option>
                    <option value="decimal">Número decimal (ej. 1,000.50)</option>
                    <option value="moneda_pen">Moneda Soles (S/ 1,000)</option>
                    <option value="moneda_usd">Moneda Dólares ($ 1,000)</option>
                    <option value="porcentaje">Porcentaje (15%)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Paso 1: Fórmulas predefinidas / recomendadas con 1 clic */}
            <div style={{ marginBottom: '14px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  marginBottom: '6px'
                }}
              >
                Opciones y modelos de cálculo predefinidos:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                {activeEquationConfig.presets.map((preset) => (
                  <div
                    key={preset.id}
                    onClick={() => setDraftFormula(preset.formula)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border:
                        draftFormula.trim() === preset.formula.trim()
                          ? '1px solid var(--color-brand)'
                          : '1px solid var(--color-border)',
                      background:
                        draftFormula.trim() === preset.formula.trim()
                          ? 'var(--color-brand-soft)'
                          : 'var(--color-surface)',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '13px',
                          color: 'var(--color-text-primary)'
                        }}
                      >
                        {preset.label}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        {preset.description}
                      </div>
                    </div>
                    <code
                      style={{
                        fontSize: '12px',
                        background: '#F1F5F9',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        color: 'var(--color-brand-deep)'
                      }}
                    >
                      {preset.formula}
                    </code>
                  </div>
                ))}
              </div>
            </div>

            {/* Paso 2: Variables disponibles para insertar */}
            <div style={{ marginBottom: '12px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  marginBottom: '6px'
                }}
              >
                Insertar datos de la fila (clic para añadir a la ecuación):
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {activeEquationConfig.availableVariables.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    onClick={() => handleInsertToken(v.token)}
                    title={v.description}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      color: 'var(--color-brand)',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    + {v.token}
                  </button>
                ))}
              </div>
            </div>

            {/* Paso 3: Operadores matemáticos */}
            <div style={{ marginBottom: '14px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  marginBottom: '6px'
                }}
              >
                Operadores y funciones:
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {['+', '-', '*', '/', '(', ')', 'MAX(', 'MIN(', 'ROUND(', 'CEIL('].map((op) => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => handleInsertToken(op)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid var(--color-border)',
                      background: '#F8FAFC',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {op}
                  </button>
                ))}
              </div>
            </div>

            {/* Paso 4: Editor de ecuación */}
            <div style={{ marginBottom: '14px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '4px'
                }}
              >
                <label
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)'
                  }}
                >
                  Ecuación activa:
                </label>
                <span
                  style={{
                    fontSize: '12px',
                    color: formulaValidation.valid
                      ? 'var(--color-success)'
                      : 'var(--color-danger)',
                    fontWeight: 600
                  }}
                >
                  {formulaValidation.valid ? '✓ Sintaxis válida' : `✕ ${formulaValidation.error}`}
                </span>
              </div>
              <input
                type="text"
                value={draftFormula}
                onChange={(e) => setDraftFormula(e.target.value)}
                placeholder="Ej. STOCK_REDONDEADO * FACTOR_COMPRA"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  borderRadius: '6px',
                  border: formulaValidation.valid
                    ? '1px solid var(--color-brand)'
                    : '1px solid var(--color-danger)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-primary)'
                }}
              />
            </div>

            {/* Paso 5: Simulación en vivo por producto */}
            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  marginBottom: '6px'
                }}
              >
                Simulación en tiempo real (muestra de productos de la matriz):
              </label>
              <div
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  background: 'var(--color-canvas)',
                  overflow: 'hidden'
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#EAEFF2', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left' }}>Producto</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right' }}>Promedio</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right' }}>Stock real</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right' }}>Redondeado</th>
                      <th
                        style={{
                          padding: '6px 10px',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: 'var(--color-brand)'
                        }}
                      >
                        Resultado {activeEquationConfig.headerTitle}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulationSampleRows.map((sample) => {
                      const sampleCtx: FormulaEvaluationContext = {
                        PROM_MEN: sample.promedio_final,
                        STOCK_REAL: sample.stock_real,
                        LEAD_TIME: activeTemplate.lead_time_meses || 3,
                        STOCK_MIN: sample.stock_min,
                        SEG: sample.seguridad,
                        STOCK_MIN_F: sample.stock_min_f,
                        STOCK_REDONDEADO: sample.stock_min_redondeado,
                        FACTOR_COMPRA: activeTemplate.factor_compra || 2,
                        SEGURIDAD_PCT: activeTemplate.seguridad_pct || 0.2,
                        DIAS_MES: activeTemplate.dias_por_mes || 30
                      }
                      const simVal = projectionFormulaEngine.evaluateFormula(
                        draftFormula,
                        sampleCtx
                      )
                      return (
                        <tr key={sample.id_item} style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 500 }}>
                            {sample.nombre_producto}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                            {sample.promedio_final.toLocaleString('es-PE')}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                            {sample.stock_real.toLocaleString('es-PE')}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                            {sample.stock_min_redondeado.toLocaleString('es-PE')}
                          </td>
                          <td
                            style={{
                              padding: '6px 10px',
                              textAlign: 'right',
                              fontWeight: 700,
                              color: 'var(--color-brand-deep)',
                              background: 'var(--color-brand-soft)'
                            }}
                          >
                            {formatCustomColumnValue(simVal, activeEquationConfig.format)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Acciones del Modal */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              {activeEquationConfig.isCustom && (
                <button
                  type="button"
                  className="button secondary"
                  style={{
                    marginRight: 'auto',
                    color: 'var(--color-danger)',
                    borderColor: 'var(--color-danger)'
                  }}
                  onClick={() =>
                    void handleDeleteCustomColumn(
                      activeEquationConfig.key,
                      draftCustomName || activeEquationConfig.label
                    )
                  }
                  title="Eliminar permanentemente esta columna de la matriz"
                >
                  Eliminar columna
                </button>
              )}
              <button
                type="button"
                className="button secondary"
                onClick={() => setEquationModalOpen(false)}
              >
                Cancelar
              </button>
              {!activeEquationConfig.isCustom && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setDraftFormula(activeEquationConfig.defaultFormula)}
                  title="Restaurar a la fórmula estándar del reporte original"
                >
                  Restablecer fórmula original
                </button>
              )}
              <button
                type="button"
                className="button primary"
                disabled={!formulaValidation.valid || isSavingFormula}
                onClick={() => void handleApplyColumnEquation()}
              >
                {isSavingFormula ? 'Aplicando...' : 'Aplicar ecuación a toda la columna'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL B: Agregar Nueva Columna Calculada con Ecuación Excel
          ========================================================================= */}
      {addColumnModalOpen && activeTemplate && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '680px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px'
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '12px',
                    color: 'var(--color-brand)',
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}
                >
                  Dinámica tipo Excel
                </span>
                <h2
                  style={{
                    margin: '2px 0 0 0',
                    fontSize: '20px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)'
                  }}
                >
                  Nueva columna calculada
                </h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setAddColumnModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Escribe el nombre de la nueva columna y define su ecuación matemática. Al agregarla, la columna
              se incorporará a la matriz y calculará su valor reactivamente para todos los productos.
            </p>

            <form
              onSubmit={(e) => void handleAddCustomColumn(e)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {/* Campos: Nombre, Código de variable y Formato */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr 0.9fr', gap: '12px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      marginBottom: '4px'
                    }}
                  >
                    Nombre de la columna *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Costo de reposición"
                    value={newColName}
                    onChange={(e) => handleColNameChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      background: 'var(--color-surface)',
                      fontSize: '13px'
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      marginBottom: '4px'
                    }}
                  >
                    Variable (Token) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. COSTO_TOTAL"
                    value={newColVariable}
                    onChange={(e) => setNewColVariable(e.target.value.toUpperCase())}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      background: 'var(--color-surface)',
                      fontFamily: 'monospace',
                      fontSize: '13px'
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      marginBottom: '4px'
                    }}
                  >
                    Formato numérico
                  </label>
                  <select
                    value={newColFormat}
                    onChange={(e) => setNewColFormat(e.target.value as ColumnDisplayFormat)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      background: 'var(--color-surface)',
                      fontSize: '13px'
                    }}
                  >
                    <option value="entero">Entero (ej. 1,000)</option>
                    <option value="decimal">Decimal (ej. 1,000.50)</option>
                    <option value="moneda_pen">Moneda Soles (S/ 1,000)</option>
                    <option value="moneda_usd">Moneda Dólares ($ 1,000)</option>
                    <option value="porcentaje">Porcentaje (15%)</option>
                  </select>
                </div>
              </div>

              {/* Fórmulas recomendadas comunes */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: '6px'
                  }}
                >
                  Fórmulas sugeridas de Excel (un clic para cargar):
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                  {[
                    {
                      label: 'Costo total estimado (Compra × S/ 25.00)',
                      formula: 'COMPRA_SUGERIDA * 25',
                      desc: 'Multiplica la compra sugerida por un costo unitario estimado.'
                    },
                    {
                      label: 'Compra en cajas de 50 unidades (CEIL)',
                      formula: 'CEIL(COMPRA_SUGERIDA / 50)',
                      desc: 'Ajusta la compra a múltiplos de cajas o bultos de 50 unidades.'
                    },
                    {
                      label: 'Stock total proyectado (Stock actual + Compra)',
                      formula: 'STOCK_REAL + COMPRA_SUGERIDA',
                      desc: 'Total de existencias proyectadas al llegar el pedido de importación.'
                    },
                    {
                      label: 'Cobertura ampliada en meses post-llegada',
                      formula: '(STOCK_REAL + COMPRA_SUGERIDA) / (PROM_MEN > 0 ? PROM_MEN : 1)',
                      desc: 'Meses de duración total considerando existencias más compra sugerida.'
                    },
                    {
                      label: 'Déficit directo hacia stock mín final (Sin lote)',
                      formula: 'MAX(0, STOCK_MIN_F - STOCK_REAL)',
                      desc: 'Déficit estricto de unidades para alcanzar el stock mínimo final.'
                    }
                  ].map((preset, idx) => (
                    <div
                      key={idx}
                      onClick={() => setNewColFormula(preset.formula)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border:
                          newColFormula.trim() === preset.formula
                            ? '1px solid var(--color-brand)'
                            : '1px solid var(--color-border)',
                        background:
                          newColFormula.trim() === preset.formula
                            ? 'var(--color-brand-soft)'
                            : 'var(--color-surface)',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--color-text-primary)' }}>
                          {preset.label}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                          {preset.desc}
                        </div>
                      </div>
                      <code
                        style={{
                          fontSize: '11px',
                          background: '#F1F5F9',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          color: 'var(--color-brand-deep)'
                        }}
                      >
                        {preset.formula}
                      </code>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botones de variables disponibles */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: '6px'
                  }}
                >
                  Insertar datos y columnas (clic para añadir a la ecuación):
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[
                    { token: 'PROM_MEN', label: 'Promedio mensual' },
                    { token: 'STOCK_REAL', label: 'Stock real' },
                    { token: 'LEAD_TIME', label: 'Lead time meses' },
                    { token: 'STOCK_MIN', label: 'Stock mín base' },
                    { token: 'SEG', label: 'Seguridad' },
                    { token: 'STOCK_MIN_F', label: 'Stock mín final' },
                    { token: 'STOCK_REDONDEADO', label: 'Stock redondeado' },
                    { token: 'COMPRA_SUGERIDA', label: 'Compra sugerida' },
                    { token: 'MESES_DURACION', label: 'Meses de duración' },
                    ...(activeTemplate.columnas_personalizadas || []).map((c) => ({
                      token: (c.codigo_variable || c.id).toUpperCase(),
                      label: c.nombre
                    }))
                  ].map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => handleInsertNewColToken(v.token)}
                      title={`Insertar ${v.label}`}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        color: 'var(--color-brand)',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      + {v.token}
                    </button>
                  ))}
                </div>
              </div>

              {/* Operadores y funciones */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: '6px'
                  }}
                >
                  Operadores y funciones matemáticas:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {['+', '-', '*', '/', '(', ')', 'MAX(', 'MIN(', 'ROUND(', 'CEIL(', 'FLOOR('].map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => handleInsertNewColToken(op)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: '1px solid var(--color-border)',
                        background: '#F8FAFC',
                        color: 'var(--color-text-primary)',
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {op}
                    </button>
                  ))}
                </div>
              </div>

              {/* Editor de la fórmula */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px'
                  }}
                >
                  <label
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)'
                    }}
                  >
                    Ecuación matemática (Fórmula Excel):
                  </label>
                  <span
                    style={{
                      fontSize: '12px',
                      color: newColumnFormulaValidation.valid
                        ? 'var(--color-success)'
                        : 'var(--color-danger)',
                      fontWeight: 600
                    }}
                  >
                    {newColumnFormulaValidation.valid
                      ? '✓ Sintaxis válida'
                      : `✕ ${newColumnFormulaValidation.error}`}
                  </span>
                </div>
                <input
                  type="text"
                  required
                  value={newColFormula}
                  onChange={(e) => setNewColFormula(e.target.value)}
                  placeholder="Ej. COMPRA_SUGERIDA * 25"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    borderRadius: '6px',
                    border: newColumnFormulaValidation.valid
                      ? '1px solid var(--color-brand)'
                      : '1px solid var(--color-danger)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-primary)'
                  }}
                />
              </div>

              {/* Previsualización en vivo por producto */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: '6px'
                  }}
                >
                  Simulación en tiempo real (muestra de productos):
                </label>
                <div
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    background: 'var(--color-canvas)',
                    overflow: 'hidden'
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#EAEFF2', borderBottom: '1px solid var(--color-border)' }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>Producto</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>Stock real</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>Compra</th>
                        <th
                          style={{
                            padding: '6px 10px',
                            textAlign: 'right',
                            fontWeight: 700,
                            color: 'var(--color-brand)'
                          }}
                        >
                          Resultado {newColName || 'Nueva columna'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulationSampleRows.map((sample) => {
                        const sampleCtx: FormulaEvaluationContext = {
                          PROM_MEN: sample.promedio_final,
                          STOCK_REAL: sample.stock_real,
                          LEAD_TIME: activeTemplate.lead_time_meses || 3,
                          STOCK_MIN: sample.stock_min,
                          SEG: sample.seguridad,
                          STOCK_MIN_F: sample.stock_min_f,
                          STOCK_REDONDEADO: sample.stock_min_redondeado,
                          FACTOR_COMPRA: activeTemplate.factor_compra || 2,
                          SEGURIDAD_PCT: activeTemplate.seguridad_pct || 0.2,
                          DIAS_MES: activeTemplate.dias_por_mes || 30,
                          COMPRA_SUGERIDA: sample.compra_sugerida,
                          MESES_DURACION: sample.meses_duracion
                        }
                        const simVal = projectionFormulaEngine.evaluateFormula(
                          newColFormula,
                          sampleCtx
                        )
                        return (
                          <tr key={sample.id_item} style={{ borderBottom: '1px solid #E2E8F0' }}>
                            <td style={{ padding: '6px 10px', fontWeight: 500 }}>
                              {sample.nombre_producto}
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                              {sample.stock_real.toLocaleString('es-PE')}
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                              {sample.compra_sugerida.toLocaleString('es-PE')}
                            </td>
                            <td
                              style={{
                                padding: '6px 10px',
                                textAlign: 'right',
                                fontWeight: 700,
                                color: 'var(--color-brand-deep)',
                                background: 'var(--color-brand-soft)'
                              }}
                            >
                              {formatCustomColumnValue(simVal, newColFormat)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Acciones */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setAddColumnModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={!newColumnFormulaValidation.valid || isAddingColumn || !newColName.trim()}
                >
                  {isAddingColumn ? 'Guardando columna...' : 'Crear columna y calcular'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 1: Configurar Parámetros Globales de Lead Time y Seguridad
          ========================================================================= */}
      {paramsModalOpen && activeTemplate && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '540px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)'
                }}
              >
                Parámetros globales de la proyección
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setParamsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Reconfigura las variables maestras de tiempo de tránsito, factor de reposición y margen
              de seguridad. Al guardar, toda la matriz grupal se recalculará automáticamente.
            </p>

            <form
              onSubmit={(e) => void handleSaveParams(e)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: '4px'
                  }}
                >
                  Tiempo de tránsito marítimo (Lead time en meses)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={formLeadTime}
                  onChange={(e) => setFormLeadTime(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: '4px'
                  }}
                >
                  Margen de stock de seguridad (%)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  required
                  value={formSeguridadPct}
                  onChange={(e) => setFormSeguridadPct(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: '4px'
                  }}
                >
                  Factor de ciclo de compra (Multiplicador de pedido)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  required
                  value={formFactorCompra}
                  onChange={(e) => setFormFactorCompra(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: '4px'
                  }}
                >
                  Días promedio por mes
                </label>
                <input
                  type="number"
                  step="1"
                  min="28"
                  max="31"
                  required
                  value={formDiasMes}
                  onChange={(e) => setFormDiasMes(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  marginTop: '12px'
                }}
              >
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setParamsModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="button primary" disabled={isSavingParams}>
                  {isSavingParams ? 'Guardando...' : 'Aplicar y recalcular matriz'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: Agregar Nueva Columna de Mes
          ========================================================================= */}
      {addMonthModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '420px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)'
                }}
              >
                Agregar nueva columna de mes
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setAddMonthModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => void handleAddMonth(e)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: '4px'
                  }}
                >
                  Nombre del mes (ej. AGO, SET, OCT)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. AGO"
                  value={newMonthName}
                  onChange={(e) => setNewMonthName(e.target.value.toUpperCase())}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  marginTop: '8px'
                }}
              >
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setAddMonthModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="button primary" disabled={isAddingMonth}>
                  {isAddingMonth ? 'Agregando...' : 'Agregar columna'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: Agregar Nuevo Producto
          ========================================================================= */}
      {addProductModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '440px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)'
                }}
              >
                Agregar producto a la proyección
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setAddProductModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => void handleAddProduct(e)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: '4px'
                  }}
                >
                  Nombre del producto o suministro *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. CINTA DE EMBALAJE 3 PULGADAS"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: '4px'
                  }}
                >
                  Stock inicial disponible
                </label>
                <input
                  type="number"
                  min="0"
                  value={newProductStock}
                  onChange={(e) => setNewProductStock(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  marginTop: '8px'
                }}
              >
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setAddProductModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="button primary" disabled={isAddingProduct}>
                  {isAddingProduct ? 'Guardando...' : 'Agregar producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: Generar Orden de Importación Grupal
          ========================================================================= */}
      {orderModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '620px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)'
                }}
              >
                Generar orden de importación consolidada
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setOrderModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Esta acción creará una orden oficial de importación vinculada al Módulo 04 (Recepciones
              RFID) con las cantidades calculadas por la matriz.
            </p>

            <form
              onSubmit={(e) => void handleConfirmOrder(e)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      marginBottom: '4px'
                    }}
                  >
                    Número de orden oficial *
                  </label>
                  <input
                    type="text"
                    required
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      marginBottom: '4px'
                    }}
                  >
                    Tipo de contenedor asignado
                  </label>
                  <select
                    value={orderContainerType}
                    onChange={(e) => setOrderContainerType(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px'
                    }}
                  >
                    <option value="40FT">Contenedor 40 pies (40FT)</option>
                    <option value="20FT">Contenedor 20 pies (20FT)</option>
                    <option value="LCL">Carga suelta consolidada (LCL)</option>
                  </select>
                </div>
              </div>

              {/* Lista resumida de productos a incluir */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: '6px'
                  }}
                >
                  Productos seleccionados ({selectedItemIds.size}):
                </label>
                <div
                  style={{
                    maxHeight: '180px',
                    overflowY: 'auto',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    background: 'var(--color-canvas)',
                    padding: '8px 12px'
                  }}
                >
                  {calculatedRows
                    .filter((r) => selectedItemIds.has(r.id_item))
                    .map((r) => (
                      <div
                        key={r.id_item}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '4px 0',
                          borderBottom: '1px solid #E2E8F0',
                          fontSize: '12px'
                        }}
                      >
                        <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                          {r.nombre_producto}
                        </span>
                        <span style={{ fontWeight: 700, color: 'var(--color-brand)' }}>
                          {r.compra_sugerida.toLocaleString('es-PE')} und.
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  marginTop: '12px'
                }}
              >
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setOrderModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={isCreatingOrder || selectedItemIds.size === 0}
                >
                  {isCreatingOrder ? 'Creando orden...' : 'Confirmar y generar orden'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
