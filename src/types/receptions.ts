export type ReceptionSessionState = 'ACTIVA' | 'PAUSADA' | 'FINALIZADA' | 'CANCELADA'

export type PalletLoadType = 'COMPLETO' | 'PUCHO'

export type ConciliationState = 'COMPLETA' | 'DISCREPANCIA' | 'FALTANTES' | 'SOBRANTES'

export interface ReceptionReadingItem {
  uid: string
  tipo: PalletLoadType
  cantidad_paquetes: number
  codigo_barras?: string
  numero_serie?: string
  notas?: string
}

export interface ReceptionReadingLog {
  id_lectura: number
  id_sesion: number
  id_etiqueta?: number | null
  uid_tag: string
  tipo_carga: PalletLoadType
  cantidad_paquetes: number
  cantidad_unidades: number
  numero_serie?: string | null
  leido_en: string
  valido: boolean
  motivo_invalidez?: string | null
}

export interface ReceptionSession {
  id_sesion: number
  id_orden?: number | null
  id_producto?: number | null
  id_almacen: number
  id_usuario?: number | null
  estado: ReceptionSessionState
  total_paletas_completas: number
  total_paquetes_puchos: number
  id_transaccion_offline?: string | null
  fecha_inicio: string
  fecha_finalizacion?: string | null
  orden?: {
    numero_orden: string
    id_proveedor?: number | null
    proveedor?: { nombre?: string; razon_social?: string | null } | null
  } | null
  producto?: {
    sku: string
    nombre: string
  } | null
  almacen?: {
    nombre: string
    tipo: string
    prefijo_rfid?: string | null
  } | null
  usuario?: {
    nombre_completo: string | null
    correo?: string | null
    email?: string | null
  } | null
  conciliacion?: {
    id_conciliacion: number
    fecha_cruce: string
    tags_esperados: number | null
    tags_leidos: number
    total_paletas_completas: number
    total_paquetes_puchos: number
    estado: ConciliationState
  } | null
}

export interface ImportOrder {
  id_orden: number
  numero_orden: string
  id_proveedor: number | null
  estado: 'BORRADOR' | 'TRANSITO' | 'RECIBIDA'
  fecha_emision: string
  tipo_contenedor: '20FT' | '40FT' | 'LCL' | null
  volumen_ocupado_m3: number | null
  proveedor?: {
    id_proveedor: number
    razon_social: string
    nombre?: string
  } | null
  detalles?: ImportOrderDetail[]
}

export interface ImportOrderDetail {
  id_detalle: number
  id_orden: number
  id_producto: number
  cantidad_pedida: number
  subtotal_peso_kg?: number | null
  subtotal_volumen_m3?: number | null
  producto?: {
    id_producto: number
    sku: string
    nombre: string
    regla_empaque?: {
      unidades_por_caja: number
      cajas_por_camada?: number | null
      numero_camadas?: number | null
      cajas_por_camita?: number | null
      camitas_por_paleta?: number | null
      cajas_por_paleta?: number
      peso_caja_kg?: number | null
    } | null
  } | null
}

export interface ConciliationResult {
  ok: boolean
  idempotente: boolean
  id_sesion: number
  estado_conciliacion: ConciliationState
  cantidad_esperada: number
  cantidad_recibida: number
  diferencia_unidades: number
  paletas_completas: number
  paquetes_puchos: number
  tags_procesados: number
  mensaje?: string
}
