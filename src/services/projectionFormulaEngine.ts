import type {
  CalculatedProjectionRow,
  CriticalStatus,
  ProjectionItem,
  ProjectionTemplate
} from '../types/projections'

export const projectionFormulaEngine = {
  // Calcular una fila individual basada en la plantilla y sus parámetros activos
  calculateRow(
    item: ProjectionItem,
    template: ProjectionTemplate,
    liveStockMap?: Map<string, number>
  ): CalculatedProjectionRow {
    const leadTime = Number(template.lead_time_meses) || 3
    const seguridadPct = Number(template.seguridad_pct) || 0.2
    const factorCompra = Number(template.factor_compra) || 2
    const diasPorMes = Number(template.dias_por_mes) || 30

    // 1. Cálculo de promedio de consumo
    let promedioCalculado = 0
    const monthKeys = template.columnas_meses || []
    if (monthKeys.length > 0) {
      let suma = 0
      let conteo = 0
      for (const mKey of monthKeys) {
        const val = item.datos_meses[mKey]
        if (typeof val === 'number' && val !== 0) {
          suma += Math.abs(val)
          conteo++
        }
      }
      promedioCalculado = conteo > 0 ? Math.round(suma / conteo) : 0
    }

    // Promedio final (respeta sobreescritura manual si existe)
    const promedioFinal =
      item.promedio_manual !== null && item.promedio_manual !== undefined && item.promedio_manual > 0
        ? Number(item.promedio_manual)
        : promedioCalculado

    // 2. Stock real (prioriza liveStock si existe, o stock_manual del ítem)
    let stockReal = 0
    if (liveStockMap && liveStockMap.has(item.nombre_producto)) {
      stockReal = liveStockMap.get(item.nombre_producto)!
    } else if (item.stock_manual !== null && item.stock_manual !== undefined) {
      stockReal = Number(item.stock_manual)
    }

    // 3. Stock mínimo base = PROM_MEN * lead_time
    const stockMin = Math.round(promedioFinal * leadTime)

    // 4. Stock de seguridad = stock_min * seguridad_pct
    const seguridad = Math.round(stockMin * seguridadPct)

    // 5. Stock mínimo final = stock_min + seguridad
    const stockMinF = stockMin + seguridad

    // 6. Stock mínimo redondeado (por empaque / lote)
    let stockMinRedondeado = stockMinF
    if (
      item.stock_redondeado_manual !== null &&
      item.stock_redondeado_manual !== undefined &&
      item.stock_redondeado_manual > 0
    ) {
      stockMinRedondeado = Number(item.stock_redondeado_manual)
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

    // 7. Compra sugerida = stock_min_redondeado * factor_compra
    const compraSugerida = Math.round(stockMinRedondeado * factorCompra)

    // 8. Meses de duración
    let mesesDuracion = 0
    if (stockMinRedondeado > 0) {
      // Fórmula del Excel: Stock Real * Lead Time / Stock Redondeado
      mesesDuracion = (stockReal * leadTime) / stockMinRedondeado
    } else if (promedioFinal > 0) {
      mesesDuracion = stockReal / promedioFinal
    }

    // 9. Texto de duración y Fecha estimada de quiebre
    let mesesEnteros = Math.floor(mesesDuracion)
    let diasEnteros = Math.round((mesesDuracion - mesesEnteros) * diasPorMes)
    if (diasEnteros >= diasPorMes) {
      mesesEnteros += 1
      diasEnteros = 0
    }

    const textoDuracion = `${mesesEnteros} mes(es) y ${diasEnteros} día(s)`

    const diasTotalesMilis = mesesDuracion * diasPorMes * 24 * 60 * 60 * 1000
    const fechaQuiebreObj = new Date(Date.now() + diasTotalesMilis)
    const fechaQuiebre = isNaN(fechaQuiebreObj.getTime())
      ? '—'
      : fechaQuiebreObj.toLocaleDateString('es-PE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })

    // 10. Estado Crítico / Semáforo de advertencia
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
      promedio_calculado: promedioCalculado,
      promedio_final: promedioFinal,
      stock_real: stockReal,
      stock_min: stockMin,
      seguridad: seguridad,
      stock_min_f: stockMinF,
      stock_min_redondeado: stockMinRedondeado,
      compra_sugerida: compraSugerida,
      meses_duracion: Number(mesesDuracion.toFixed(2)),
      texto_duracion: textoDuracion,
      fecha_quiebre: fechaQuiebre,
      estado_critico: estadoCritico
    }
  },

  // Calcular toda la lista de filas de una plantilla de forma grupal
  calculateAll(
    items: ProjectionItem[],
    template: ProjectionTemplate,
    liveStockMap?: Map<string, number>
  ): CalculatedProjectionRow[] {
    return items.map((item) => this.calculateRow(item, template, liveStockMap))
  }
}
