import { useEffect, useMemo, useState } from 'react'
import { projectionService } from '../services/projectionService'
import { projectionFormulaEngine } from '../services/projectionFormulaEngine'
import type {
  ProjectionItem,
  ProjectionTemplate,
  TemplateParamsForm
} from '../types/projections'

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

  // 2. Selección grupal para órdenes
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set())

  // 3. Búsqueda y filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'CRITICO' | 'REORDEN' | 'OPTIMO'>('TODOS')

  // 4. Modales
  // Modal de Fórmulas y Parámetros
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

  // 5. Manejo de edición interactiva de celdas inline
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
          // Guardar asíncronamente en backend
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

  // 6. Selección grupal
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

  // 7. Guardar parámetros y fórmulas replanteadas
  const handleSaveParams = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeTemplate) return
    setIsSavingParams(true)
    setErrorMsg(null)

    const payload: TemplateParamsForm = {
      lead_time_meses: formLeadTime,
      seguridad_pct: formSeguridadPct / 100,
      factor_compra: formFactorCompra,
      dias_por_mes: formDiasMes
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

  // 8. Agregar nueva columna de mes
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

  // 9. Agregar nuevo producto a la matriz
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

  // 10. Eliminar fila
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

  // 11. Generar Orden de Importación Grupal
  const handleOpenOrderModal = () => {
    if (selectedItemIds.size === 0) {
      // Si no seleccionó manualmente, seleccionar automáticamente los críticos y reorden
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

      setSuccessMsg(`Orden de importación ${orderNumber.toUpperCase()} creada con éxito con ${selectedRows.length} productos calculados.`)
      setOrderModalOpen(false)
      setSelectedItemIds(new Set())
    } catch (err: any) {
      setErrorMsg(`Error inesperado: ${err.message}`)
    } finally {
      setIsCreatingOrder(false)
    }
  }

  // 12. Exportar a CSV
  const handleExportCSV = () => {
    if (!activeTemplate || calculatedRows.length === 0) return

    const months = activeTemplate.columnas_meses || []
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
      'Estado'
    ]

    const rows = calculatedRows.map((r) => {
      const mValues = months.map((m) => r.datos_meses[m] ?? 0)
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
        r.estado_critico
      ].join(',')
    })

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Proyeccion_${activeTemplate.codigo}_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Encabezado de página */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
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
            Matriz de proyección dinámica tipo Excel con cálculo reactivo de fórmulas, alertas de quiebre y generación de pedidos.
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
            title="Configurar y replantear las fórmulas y parámetros de cálculo"
          >
            Configurar fórmulas
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
          style={{ borderColor: 'var(--color-danger)', backgroundColor: '#FDF3F2', color: 'var(--color-danger)' }}
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

      {/* 3. Selector de Pestañas de Plantilla (Sedes / Unidades de negocio) */}
      <div className="module-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', gap: '12px' }}>
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

        <div className="indicator-card" style={{ borderColor: metrics.criticos > 0 ? 'var(--color-danger)' : 'var(--color-border)' }}>
          <span className="indicator-label" style={{ color: metrics.criticos > 0 ? 'var(--color-danger)' : 'inherit' }}>
            Riesgo de quiebre
          </span>
          <span className="indicator-value" style={{ color: metrics.criticos > 0 ? 'var(--color-danger)' : 'inherit' }}>
            {loading ? '—' : metrics.criticos}
          </span>
          <span className="indicator-context">Menos de 1 mes de stock</span>
        </div>

        <div className="indicator-card" style={{ borderColor: metrics.reorden > 0 ? 'var(--color-warning)' : 'var(--color-border)' }}>
          <span className="indicator-label" style={{ color: metrics.reorden > 0 ? 'var(--color-warning)' : 'inherit' }}>
            Ventana de reorden
          </span>
          <span className="indicator-value" style={{ color: metrics.reorden > 0 ? 'var(--color-warning)' : 'inherit' }}>
            {loading ? '—' : metrics.reorden}
          </span>
          <span className="indicator-context">Entre 1 y {activeTemplate?.lead_time_meses || 3} meses de stock</span>
        </div>

        <div className="indicator-card">
          <span className="indicator-label">Compra total sugerida</span>
          <span className="indicator-value">
            {loading ? '—' : metrics.totalCompra.toLocaleString('es-PE')}
          </span>
          <span className="indicator-context">Unidades calculadas</span>
        </div>
      </section>

      {/* 5. Parámetros activos de la fórmula */}
      {activeTemplate && (
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', fontSize: '13px' }}>
            <span>
              <strong style={{ color: 'var(--color-text-primary)' }}>Reglas activas:</strong>
            </span>
            <span>
              Tiempo de tránsito: <strong>{activeTemplate.lead_time_meses} meses</strong>
            </span>
            <span>
              Stock de seguridad: <strong>{Number(activeTemplate.seguridad_pct) * 100}%</strong>
            </span>
            <span>
              Factor de reposición: <strong>{activeTemplate.factor_compra}x</strong>
            </span>
            <span>
              Días por mes: <strong>{activeTemplate.dias_por_mes || 30} días</strong>
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
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
      )}

      {/* 6. Barra de Búsqueda y Filtros de Estado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
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
      </div>

      {/* 7. Matriz Interactiva (Grid tipo Excel con Edición Inline) */}
      <div className="table-wrap" style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--color-canvas)', borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
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
              {activeTemplate?.columnas_meses?.map((m) => (
                <th key={m} style={{ padding: '10px 8px', minWidth: '78px', textAlign: 'right', fontWeight: 500 }}>
                  {m}
                </th>
              ))}
              <th style={{ padding: '10px 8px', minWidth: '95px', textAlign: 'right', fontWeight: 600, background: '#F8FAFC' }}>
                Promedio
              </th>
              <th style={{ padding: '10px 8px', minWidth: '95px', textAlign: 'right', fontWeight: 600 }}>
                Stock real
              </th>
              <th style={{ padding: '10px 8px', minWidth: '95px', textAlign: 'right', fontWeight: 500 }} title="Fórmula: Promedio mensual × Tiempo de tránsito">
                Stock mín
              </th>
              <th style={{ padding: '10px 8px', minWidth: '85px', textAlign: 'right', fontWeight: 500 }} title="Fórmula: Stock mínimo × Margen de seguridad">
                Seguridad
              </th>
              <th style={{ padding: '10px 8px', minWidth: '95px', textAlign: 'right', fontWeight: 500 }} title="Fórmula: Stock mínimo + Seguridad">
                Stock mín final
              </th>
              <th style={{ padding: '10px 8px', minWidth: '105px', textAlign: 'right', fontWeight: 600 }} title="Lote comercial redondeado">
                Redondeado
              </th>
              <th style={{ padding: '10px 10px', minWidth: '110px', textAlign: 'right', fontWeight: 700, background: 'var(--color-brand-soft)', color: 'var(--color-brand-deep)' }} title="Fórmula: Stock redondeado × Factor de compra">
                Compra sugerida
              </th>
              <th style={{ padding: '10px 10px', minWidth: '90px', textAlign: 'center', fontWeight: 600 }}>
                Duración
              </th>
              <th style={{ padding: '10px 12px', minWidth: '210px', fontWeight: 500 }}>
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
                <td colSpan={13 + (activeTemplate?.columnas_meses?.length || 0)} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  Cargando matriz de proyección...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={13 + (activeTemplate?.columnas_meses?.length || 0)} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  No se encontraron productos con los criterios especificados.
                </td>
              </tr>
            ) : (
              filteredRows.map((r, rowIdx) => {
                const isSelected = selectedItemIds.has(r.id_item)
                const monthKeys = activeTemplate?.columnas_meses || []

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
                      backgroundColor: isSelected ? 'var(--color-brand-soft)' : rowIdx % 2 === 0 ? 'var(--color-surface)' : 'var(--color-canvas)'
                    }}
                  >
                    {/* Checkbox */}
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectRow(r.id_item)}
                      />
                    </td>

                    {/* Nombre del producto */}
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {r.nombre_producto}
                    </td>

                    {/* Celdas editables de meses */}
                    {monthKeys.map((m) => {
                      const val = r.datos_meses[m] ?? 0
                      return (
                        <td key={m} style={{ padding: '4px 6px', textAlign: 'right' }}>
                          <input
                            type="number"
                            defaultValue={val === 0 ? '' : val}
                            onBlur={(e) => handleCellChange(r.id_item, `month_${m}`, e.target.value)}
                            style={{
                              width: '100%',
                              minWidth: '65px',
                              padding: '4px 6px',
                              border: '1px solid transparent',
                              borderRadius: '4px',
                              background: 'transparent',
                              textAlign: 'right',
                              fontSize: '12px',
                              color: val < 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'
                            }}
                            onFocus={(e) => (e.target.style.border = '1px solid var(--color-brand)')}
                            onBlurCapture={(e) => (e.target.style.border = '1px solid transparent')}
                          />
                        </td>
                      )
                    })}

                    {/* Promedio mensual (Editable inline si desea sobreescribir) */}
                    <td style={{ padding: '4px 6px', textAlign: 'right', background: '#F8FAFC' }}>
                      <input
                        type="number"
                        defaultValue={r.promedio_final || ''}
                        onBlur={(e) => handleCellChange(r.id_item, 'promedio_manual', e.target.value)}
                        placeholder={r.promedio_calculado.toString()}
                        title="Promedio mensual (haz clic para sobreescribir)"
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
                          color: 'var(--color-text-primary)'
                        }}
                        onFocus={(e) => (e.target.style.border = '1px solid var(--color-brand)')}
                        onBlurCapture={(e) => (e.target.style.border = '1px solid transparent')}
                      />
                    </td>

                    {/* Stock real (Editable o desde inventario) */}
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                      <input
                        type="number"
                        defaultValue={r.stock_real}
                        onBlur={(e) => handleCellChange(r.id_item, 'stock_manual', e.target.value)}
                        title="Stock real actual en almacén"
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

                    {/* Stock mínimo redondeado (Editable) */}
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                      <input
                        type="number"
                        defaultValue={r.stock_min_redondeado}
                        onBlur={(e) => handleCellChange(r.id_item, 'stock_redondeado_manual', e.target.value)}
                        title="Stock redondeado comercial"
                        style={{
                          width: '100%',
                          minWidth: '85px',
                          padding: '4px 6px',
                          border: '1px solid transparent',
                          borderRadius: '4px',
                          background: 'transparent',
                          textAlign: 'right',
                          fontWeight: 600,
                          fontSize: '13px',
                          color: 'var(--color-text-primary)'
                        }}
                        onFocus={(e) => (e.target.style.border = '1px solid var(--color-brand)')}
                        onBlurCapture={(e) => (e.target.style.border = '1px solid transparent')}
                      />
                    </td>

                    {/* Compra sugerida (Destacada) */}
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

                    {/* Cobertura estimada (Texto explicativo + Fecha de vencimiento) */}
                    <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      <span>{r.texto_duracion}</span>
                      <span style={{ display: 'block', fontSize: '11px', color: badgeColor, fontWeight: 500 }}>
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
          MODAL 1: Configurar Parámetros y Fórmulas
          ========================================================================= */}
      {paramsModalOpen && activeTemplate && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '540px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Configuración de fórmulas y reglas de proyección
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
              Reconfigura las variables matemáticas de esta plantilla. Al guardar, toda la matriz grupal se recalculará automáticamente.
            </p>

            <form onSubmit={(e) => void handleSaveParams(e)} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
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
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block', marginTop: '2px' }}>
                  Meses que tarda la mercadería desde el pedido hasta el puerto (actualmente 3 meses).
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
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
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block', marginTop: '2px' }}>
                  Porcentaje adicional de respaldo sobre el stock mínimo (actualmente 20%).
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
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
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block', marginTop: '2px' }}>
                  Multiplicador para la compra proyectada sobre el stock redondeado (actualmente 2x).
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
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
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block', marginTop: '2px' }}>
                  Base de días para proyectar la fecha exacta de agotamiento (por defecto 30 días).
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setParamsModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={isSavingParams}
                >
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
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

            <form onSubmit={(e) => void handleAddMonth(e)} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setAddMonthModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={isAddingMonth}
                >
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
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

            <form onSubmit={(e) => void handleAddProduct(e)} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
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
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setAddProductModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={isAddingProduct}
                >
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
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
              Esta acción creará una orden oficial de importación vinculada al Módulo 04 (Recepciones RFID) con las cantidades calculadas por la matriz.
            </p>

            <form onSubmit={(e) => void handleConfirmOrder(e)} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
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
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
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
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                  Productos seleccionados ({selectedItemIds.size}):
                </label>
                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-canvas)', padding: '8px 12px' }}>
                  {calculatedRows
                    .filter((r) => selectedItemIds.has(r.id_item))
                    .map((r) => (
                      <div key={r.id_item} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #E2E8F0', fontSize: '12px' }}>
                        <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{r.nombre_producto}</span>
                        <span style={{ fontWeight: 700, color: 'var(--color-brand)' }}>
                          {r.compra_sugerida.toLocaleString('es-PE')} und.
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
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
