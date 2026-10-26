import { supabase } from '../../../lib/supabase'
import type { PerfilSerializado, Product, ProductDetailed } from '../types'

export interface ProductoRepository {
  obtenerTodos(): Promise<Product[]>
  obtenerDetalles(): Promise<ProductDetailed[]>
  obtenerPorId(idProducto: number | string): Promise<Product | null>
  obtenerDetallePorId(idProducto: number | string): Promise<ProductDetailed | null>
  guardar(producto: Partial<Product>): Promise<Product>
  eliminar(idProducto: number | string): Promise<void>
  obtenerSiguienteSku(): Promise<string>
}

export class SupabaseProductoRepository implements ProductoRepository {
  async obtenerTodos(): Promise<Product[]> {
    // 1. Cargar productos base con su categoría y regla de empaque (relaciones estándar garantizadas)
    let productosRaw: any[] = []

    // Intento 1: consultar con modo_manejo en categoría
    const { data: dataConModo, error: errConModo } = await supabase
      .from('producto')
      .select(`
        id_producto,
        sku,
        nombre,
        descripcion,
        id_categoria,
        unidad_medida,
        peso_unitario_kg,
        costo_unitario,
        clasificacion_abc,
        activo,
        created_at,
        categoria:categoria (
          id_categoria,
          nombre,
          modo_manejo
        ),
        regla_empaque:regla_empaque (*)
      `)
      .order('sku')

    if (!errConModo && dataConModo) {
      productosRaw = dataConModo
    } else {
      // Fallback resiliente si la columna modo_manejo aún no existe en categoría
      const { data: dataBase, error: errBase } = await supabase
        .from('producto')
        .select(`
          id_producto,
          sku,
          nombre,
          descripcion,
          id_categoria,
          unidad_medida,
          peso_unitario_kg,
          costo_unitario,
          clasificacion_abc,
          activo,
          created_at,
          categoria:categoria (
            id_categoria,
            nombre
          ),
          regla_empaque:regla_empaque (*)
        `)
        .order('sku')

      if (errBase) {
        throw new Error(`Error al cargar productos: ${errBase.message}`)
      }
      productosRaw = dataBase ?? []
    }

    // 2. Consulta desacoplada de perfil_serializado (evita error de relación en schema cache de PostgREST)
    const serialMap = new Map<number | string, PerfilSerializado>()
    try {
      const { data: serialData, error: serialErr } = await supabase
        .from('perfil_serializado')
        .select('*')

      if (!serialErr && serialData) {
        for (const s of serialData) {
          serialMap.set(s.id_producto, s as unknown as PerfilSerializado)
        }
      }
    } catch {
      // Si la tabla perfil_serializado aún no está en cache o no existe, continuar sin fallar
    }

    // 3. Cruzar perfiles serializados en memoria
    return productosRaw.map((p) => {
      const idProd = p.id_producto
      const profile = serialMap.get(idProd) || null
      const cat = p.categoria as { id_categoria?: number; nombre?: string; modo_manejo?: string } | null
      const modo = cat?.modo_manejo || (profile ? 'SERIALIZADO' : 'PALETIZADO')

      return {
        ...p,
        modo_manejo: modo,
        categoria: cat ? { ...cat, modo_manejo: modo } : null,
        perfil_serializado: profile
      } as Product
    })
  }

  async obtenerDetalles(): Promise<ProductDetailed[]> {
    try {
      const { data, error } = await supabase
        .from('v_producto_detalle')
        .select('*')
        .order('sku')

      if (!error && data) {
        return data as unknown as ProductDetailed[]
      }
    } catch {
      // Fallback si la vista aún no está disponible
    }

    // Fallback: mapear desde obtenerTodos()
    const prods = await this.obtenerTodos()
    return prods.map((p) => {
      const cat = p.categoria
      const rule = Array.isArray(p.regla_empaque) ? p.regla_empaque[0] : p.regla_empaque
      const ser = Array.isArray(p.perfil_serializado) ? p.perfil_serializado[0] : p.perfil_serializado
      const modo = p.modo_manejo || 'PALETIZADO'

      return {
        id_producto: Number(p.id_producto),
        sku: p.sku,
        nombre: p.nombre ?? p.descripcion,
        descripcion: p.descripcion,
        unidad_medida: p.unidad_medida ?? 'UNIDAD',
        peso_unitario_kg: p.peso_unitario_kg ?? null,
        costo_unitario: p.costo_unitario ?? null,
        clasificacion_abc: p.clasificacion_abc ?? null,
        producto_activo: p.activo !== false,
        created_at: '',
        id_categoria: cat?.id_categoria ? Number(cat.id_categoria) : null,
        categoria_nombre: cat?.nombre ?? null,
        categoria_descripcion: null,
        categoria_activo: true,
        modo_manejo: modo,
        modo_manejo_nombre: modo === 'SERIALIZADO' ? 'Serializado unitario' : 'Paletizado estándar',
        modo_manejo_descripcion: null,
        requiere_regla_empaque: modo !== 'SERIALIZADO',
        requiere_serie: modo === 'SERIALIZADO',
        permite_puchos: modo !== 'SERIALIZADO',
        id_empaque: rule?.id_empaque ? Number(rule.id_empaque) : null,
        unidades_por_caja: rule?.unidades_por_caja ?? null,
        cajas_por_camada: rule?.cajas_por_camada ?? null,
        numero_camadas: rule?.numero_camadas ?? null,
        cajas_por_paleta: rule ? (rule.cajas_por_camada ?? 1) * (rule.numero_camadas ?? 1) : null,
        unidades_por_paleta: null,
        empaque_permite_puchos: rule?.permite_puchos ?? null,
        notas_armado: rule?.notas_armado ?? null,
        imagen_armado_path: rule?.imagen_armado_path ?? null,
        largo_caja_cm: rule?.largo_caja_cm ?? null,
        ancho_caja_cm: rule?.ancho_caja_cm ?? null,
        alto_caja_cm: rule?.alto_caja_cm ?? null,
        peso_caja_kg: rule?.peso_caja_kg ?? null,
        volumen_caja_m3: rule?.volumen_caja_m3 ?? null,
        volumen_paleta_m3: rule?.volumen_total_m3 ?? null,
        serial_peso_unitario_kg: ser?.peso_unitario_kg ?? null,
        serial_largo_cm: ser?.largo_cm ?? null,
        serial_ancho_cm: ser?.ancho_cm ?? null,
        serial_alto_cm: ser?.alto_cm ?? null,
        serial_requiere_equipo_izaje: ser?.requiere_equipo_izaje ?? null,
        serial_ubicacion_permitida: ser?.ubicacion_permitida ?? null,
        serial_atributos: (ser?.atributos as Record<string, unknown>) ?? null,
        serial_notas: ser?.notas ?? null
      } as ProductDetailed
    })
  }

  async obtenerPorId(idProducto: number | string): Promise<Product | null> {
    const { data: prodData, error } = await supabase
      .from('producto')
      .select(`
        id_producto,
        sku,
        nombre,
        descripcion,
        id_categoria,
        unidad_medida,
        peso_unitario_kg,
        costo_unitario,
        clasificacion_abc,
        activo,
        created_at,
        categoria:categoria (
          id_categoria,
          nombre,
          modo_manejo
        ),
        regla_empaque:regla_empaque (*)
      `)
      .eq('id_producto', idProducto)
      .maybeSingle()

    if (error) {
      throw new Error(`Error al buscar producto ${idProducto}: ${error.message}`)
    }

    if (!prodData) return null

    // Buscar perfil serializado de forma desacoplada
    let serialProfile: PerfilSerializado | null = null
    try {
      const { data: serData } = await supabase
        .from('perfil_serializado')
        .select('*')
        .eq('id_producto', idProducto)
        .maybeSingle()

      if (serData) {
        serialProfile = serData as unknown as PerfilSerializado
      }
    } catch {
      // Ignorar si la tabla aún no existe
    }

    const cat = prodData.categoria as { id_categoria?: number; nombre?: string; modo_manejo?: string } | null
    const modo = cat?.modo_manejo || (serialProfile ? 'SERIALIZADO' : 'PALETIZADO')

    return {
      ...prodData,
      modo_manejo: modo,
      categoria: cat ? { ...cat, modo_manejo: modo } : null,
      perfil_serializado: serialProfile
    } as Product
  }

  async obtenerDetallePorId(idProducto: number | string): Promise<ProductDetailed | null> {
    try {
      const { data, error } = await supabase
        .from('v_producto_detalle')
        .select('*')
        .eq('id_producto', idProducto)
        .maybeSingle()

      if (!error && data) {
        return data as unknown as ProductDetailed
      }
    } catch {
      // Ignorar error si la vista no existe
    }

    const prod = await this.obtenerPorId(idProducto)
    if (!prod) return null
    const all = await this.obtenerDetalles()
    return all.find((d) => String(d.id_producto) === String(idProducto)) || null
  }

  async guardar(producto: Partial<Product>): Promise<Product> {
    const payload = {
      sku: producto.sku,
      nombre: producto.nombre ?? producto.descripcion,
      descripcion: producto.descripcion ?? producto.nombre,
      id_categoria: producto.id_categoria ? Number(producto.id_categoria) : null,
      unidad_medida: producto.unidad_medida || 'UNIDAD',
      peso_unitario_kg: producto.peso_unitario_kg != null ? Number(producto.peso_unitario_kg) : null,
      costo_unitario: producto.costo_unitario != null ? Number(producto.costo_unitario) : null,
      clasificacion_abc: producto.clasificacion_abc || null,
      activo: producto.activo !== false
    }

    if (producto.id_producto) {
      const { data, error } = await supabase
        .from('producto')
        .update(payload)
        .eq('id_producto', producto.id_producto)
        .select()
        .single()

      if (error) {
        throw new Error(`Error al actualizar producto: ${error.message}`)
      }

      return data as unknown as Product
    } else {
      const { data, error } = await supabase
        .from('producto')
        .insert(payload)
        .select()
        .single()

      if (error) {
        throw new Error(`Error al crear producto: ${error.message}`)
      }

      return data as unknown as Product
    }
  }

  async eliminar(idProducto: number | string): Promise<void> {
    const { error } = await supabase
      .from('producto')
      .delete()
      .eq('id_producto', idProducto)

    if (error) {
      throw new Error(`Error al eliminar producto: ${error.message}`)
    }
  }

  async obtenerSiguienteSku(): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('producto')
        .select('sku')

      if (!error && data && data.length > 0) {
        let maxNum = -1
        const regex = /^SKU-(\d+)$/i

        for (const item of data) {
          if (!item.sku) continue
          const match = item.sku.trim().match(regex)
          if (match) {
            const num = parseInt(match[1], 10)
            if (!isNaN(num) && num > maxNum) {
              maxNum = num
            }
          }
        }

        const nextNum = maxNum >= 0 ? maxNum + 1 : 0
        return `SKU-${String(nextNum).padStart(5, '0')}`
      }
    } catch {
      // Fallback
    }

    return 'SKU-00000'
  }
}

export const productoRepository = new SupabaseProductoRepository()
