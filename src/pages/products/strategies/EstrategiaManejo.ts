import type { ModoManejoCodigo, Product } from '../types'

export interface Validable<T> {
  validar(datos: T): { valido: boolean; errores: string[] }
}

export interface Persistible<T> {
  guardarPerfil(idProducto: number | string, datos: T, imagenFile?: File | null): Promise<void>
  eliminarPerfil(idProducto: number | string): Promise<void>
}

export interface ConCampos<T> {
  obtenerValoresPorDefecto(): T
  mapearDesdeProducto(producto: Product): T
}

export interface EstrategiaManejo<T> extends Validable<T>, Persistible<T>, ConCampos<T> {
  codigoModo: ModoManejoCodigo
  nombre: string
  descripcion: string
  requiereReglaEmpaque: boolean
  requiereSerie: boolean
  permitePuchos: boolean
}
