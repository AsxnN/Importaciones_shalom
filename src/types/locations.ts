export type LocationType = 'RACK' | 'CAMPO'

export type RackLevel = {
  id_nivel: number
  id_carril: number
  numero_nivel: number
  nombre_nivel?: string
  capacidad_paletas: number // Profundidad máxima en fondo
}

export type WarehouseLane = {
  id_carril: number
  id_almacen: number
  codigo_carril: string // ej. 'C01', 'C02'
  nombre: string
  activo: boolean
  niveles: RackLevel[]
}

export type RackCell = {
  id_celda: number
  id_almacen: number
  tipo_ubicacion: LocationType
  id_carril?: number | null
  id_nivel?: number | null
  posicion_fondo?: number | null // 1 = Fondo, N = Entrada
  codigo_ubicacion: string // ej. 'C01-N01-P01' o 'ALM1-CAMPO'
  descripcion?: string
  activo: boolean
  // Información de la paleta ocupante (si existe)
  paleta_ocupante?: {
    id_etiqueta: number
    uid_tag: string
    codigo_barras?: string | null
    id_producto: number
    producto_sku: string
    producto_nombre: string
    tipo_paleta: 'COMPLETO' | 'PUCHO'
    cantidad_paquetes: number
    cantidad_actual: number
    fecha_enrolamiento: string
  } | null
}

export type PalletRecord = {
  id_etiqueta: number
  uid_tag: string
  codigo_barras?: string | null
  id_producto: number
  id_almacen_actual: number
  id_celda?: number | null
  codigo_ubicacion?: string | null
  tipo_ubicacion?: LocationType
  tipo_paleta: 'COMPLETO' | 'PUCHO'
  cantidad_paquetes: number
  cantidad_actual: number
  estado: 'ACTIVA' | 'VACIA' | 'EXTRAVIADA'
  notas?: string | null
  producto?: {
    sku: string
    nombre: string
    modo_manejo?: string
    ubicacion_permitida?: 'CAMPO' | 'RACK' | 'AMBAS'
  }
}
