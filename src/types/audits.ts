export type AuditStatus = 'EN_PROCESO' | 'PARCIAL' | 'COMPLETADA'
export type ProductAuditStatus = 'PENDIENTE' | 'AUDITADO'
export type ScanMethod = 'RFID' | 'CODIGO_BARRAS' | 'MANUAL'

export type AuditSession = {
  id_auditoria: number
  id_almacen: number
  almacen_nombre?: string
  id_usuario?: number | null
  usuario_nombre?: string
  fecha_inicio: string
  fecha_fin?: string | null
  estado: AuditStatus
  total_productos: number
  productos_auditados: number
  paletas_esperadas: number
  paletas_auditadas: number
  porcentaje_eri: number
  observaciones?: string | null
}

export type ProductAuditItem = {
  id_auditoria_prod: number
  id_auditoria: number
  id_producto: number
  sku: string
  nombre: string
  paletas_esperadas: number
  paletas_leidas: number
  estado: ProductAuditStatus
  nota_confirmacion?: string | null
  fecha_confirmacion?: string | null
}

export type PalletAuditReading = {
  id_lectura: number
  id_auditoria: number
  id_auditoria_prod: number
  id_etiqueta: number
  uid_tag: string
  codigo_barras?: string | null
  id_producto: number
  sku: string
  nombre: string
  id_celda?: number | null
  codigo_ubicacion_esperada: string
  tipo_ubicacion: 'RACK' | 'CAMPO'
  tipo_paleta: 'COMPLETO' | 'PUCHO'
  cantidad_paquetes: number
  cantidad_actual: number
  leido: boolean
  metodo_lectura?: ScanMethod | null
  fecha_lectura?: string | null
}
