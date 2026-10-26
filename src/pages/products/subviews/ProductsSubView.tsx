import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { logCatalogChange } from '../../../lib/audit'
import { productoRepository } from '../repositories/ProductRepository'
import { getEstrategiaManejo } from '../strategies/RegistroEstrategias'
import {
  getProductRule,
  getProductSerialProfile,
  type Category,
  type PackingFormData,
  type Product,
  type Rule,
  type SerializedFormData
} from '../types'

type Props = {
  products: Product[]
  categories: Category[]
  loading: boolean
  onRefresh: () => void
  onError: (msg: string | null) => void
  onViewDetail: (prod: Product) => void
}

export function ProductsSubView({
  products,
  categories,
  loading,
  onRefresh,
  onError,
  onViewDetail
}: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [saving, setSaving] = useState(false)

  // 1. Campos Generales del Producto
  const [sku, setSku] = useState('')
  const [nombre, setNombre] = useState('')
  const [idCategoria, setIdCategoria] = useState('')
  const [unidadMedida, setUnidadMedida] = useState('UNIDAD')
  const [pesoUnitario, setPesoUnitario] = useState('')
  const [costoUnitario, setCostoUnitario] = useState('')
  const [clasificacionAbc, setClasificacionAbc] = useState('B')
  const [activo, setActivo] = useState(true)

  // 2. Modo de manejo detectado según categoría seleccionada
  const selectedCategory = useMemo(() => {
    return categories.find((c) => String(c.id_categoria) === idCategoria) || null
  }, [categories, idCategoria])

  const currentModo = selectedCategory?.modo_manejo || 'PALETIZADO'
  const isSerializado = currentModo === 'SERIALIZADO'

  // 3. Campos específicos: MODO PALETIZADO
  const [unidadesPorCaja, setUnidadesPorCaja] = useState('1')
  const [cajasPorCamada, setCajasPorCamada] = useState('1')
  const [numeroCamadas, setNumeroCamadas] = useState('1')
  const [permitePuchos, setPermitePuchos] = useState(true)
  const [largoCm, setLargoCm] = useState('')
  const [anchoCm, setAnchoCm] = useState('')
  const [altoCm, setAltoCm] = useState('')
  const [pesoCajaKg, setPesoCajaKg] = useState('')
  const [notasArmado, setNotasArmado] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [currentImagePath, setCurrentImagePath] = useState<string | null>(null)

  // 4. Campos específicos: MODO SERIALIZADO
  const [serialPesoKg, setSerialPesoKg] = useState('')
  const [serialLargoCm, setSerialLargoCm] = useState('')
  const [serialAnchoCm, setSerialAnchoCm] = useState('')
  const [serialAltoCm, setSerialAltoCm] = useState('')
  const [serialRequiereIzaje, setSerialRequiereIzaje] = useState(false)
  const [serialUbicacion, setSerialUbicacion] = useState<'CAMPO' | 'RACK' | 'AMBAS'>('AMBAS')
  const [serialNotas, setSerialNotas] = useState('')

  // Filtros de tabla
  const [filterCategory, setFilterCategory] = useState('')
  const [search, setSearch] = useState('')

  // Cálculos en tiempo real para paletizado
  const metrics = useMemo(() => {
    const cCamada = Math.max(1, Number(cajasPorCamada) || 1)
    const nCamadas = Math.max(1, Number(numeroCamadas) || 1)
    const uCaja = Math.max(1, Number(unidadesPorCaja) || 1)
    const l = Number(largoCm) || 0
    const w = Number(anchoCm) || 0
    const h = Number(altoCm) || 0
    const pCaja = Number(pesoCajaKg) || 0

    const cajasPaleta = cCamada * nCamadas
    const unidadesPaleta = cajasPaleta * uCaja

    const volCajaM3 = l > 0 && w > 0 && h > 0 ? (l * w * h) / 1000000 : null
    const volPaletaM3 = volCajaM3 ? volCajaM3 * cajasPaleta : null

    const altoSugeridoCm = h > 0 ? h * nCamadas + 15 : null
    const pesoSugeridoKg = pCaja > 0 ? pCaja * cajasPaleta + 25 : null

    return {
      cajasPaleta,
      unidadesPaleta,
      volCajaM3,
      volPaletaM3,
      altoSugeridoCm,
      pesoSugeridoKg
    }
  }, [cajasPorCamada, numeroCamadas, unidadesPorCaja, largoCm, anchoCm, altoCm, pesoCajaKg])

  // Volumen calculado para serializado
  const serialVolumenM3 = useMemo(() => {
    const l = Number(serialLargoCm) || 0
    const w = Number(serialAnchoCm) || 0
    const h = Number(serialAltoCm) || 0
    return l > 0 && w > 0 && h > 0 ? (l * w * h) / 1000000 : null
  }, [serialLargoCm, serialAnchoCm, serialAltoCm])

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchCat = filterCategory === '' || String(p.id_categoria) === filterCategory
      const q = search.trim().toLowerCase()
      const matchQ =
        q === '' ||
        p.sku.toLowerCase().includes(q) ||
        (p.nombre ?? p.descripcion).toLowerCase().includes(q)
      return matchCat && matchQ
    })
  }, [products, filterCategory, search])

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files[0]) {
      setImageFile(event.target.files[0])
    } else {
      setImageFile(null)
    }
  }

  function resetForm() {
    setEditing(null)
    setSku('')
    setNombre('')
    setIdCategoria('')
    setUnidadMedida('UNIDAD')
    setPesoUnitario('')
    setCostoUnitario('')
    setClasificacionAbc('B')
    setActivo(true)

    // Reset Paletizado
    setUnidadesPorCaja('1')
    setCajasPorCamada('1')
    setNumeroCamadas('1')
    setPermitePuchos(true)
    setLargoCm('')
    setAnchoCm('')
    setAltoCm('')
    setPesoCajaKg('')
    setNotasArmado('')
    setImageFile(null)
    setCurrentImagePath(null)

    // Reset Serializado
    setSerialPesoKg('')
    setSerialLargoCm('')
    setSerialAnchoCm('')
    setSerialAltoCm('')
    setSerialRequiereIzaje(false)
    setSerialUbicacion('AMBAS')
    setSerialNotas('')

    setShowForm(false)
  }

  function calcularSiguienteSkuLocal(): string {
    let maxNum = -1
    const regex = /^SKU-(\d+)$/i

    for (const p of products) {
      if (!p.sku) continue
      const match = p.sku.trim().match(regex)
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

  async function startCreate() {
    resetForm()
    // 1. Asignar de inmediato el correlativo SKU-00000 local
    const localNextSku = calcularSiguienteSkuLocal()
    setSku(localNextSku)
    setShowForm(true)

    // 2. Validar con base de datos por si hubo creaciones concurrentes
    try {
      const dbNextSku = await productoRepository.obtenerSiguienteSku()
      if (dbNextSku) {
        setSku(dbNextSku)
      }
    } catch {
      // Mantiene el calculado localmente
    }
  }

  function startEdit(p: Product) {
    setEditing(p)
    setSku(p.sku)
    setNombre(p.nombre ?? p.descripcion)
    setIdCategoria(p.id_categoria ? String(p.id_categoria) : '')
    setUnidadMedida(p.unidad_medida ?? 'UNIDAD')
    setPesoUnitario(p.peso_unitario_kg ? String(p.peso_unitario_kg) : '')
    setCostoUnitario(p.costo_unitario ? String(p.costo_unitario) : '')
    setClasificacionAbc(p.clasificacion_abc ?? 'B')
    setActivo(p.activo !== false)

    // Cargar perfil según corresponda
    const rule: Rule | null = getProductRule(p)
    if (rule) {
      setUnidadesPorCaja(String(rule.unidades_por_caja ?? 1))
      setCajasPorCamada(String(rule.cajas_por_camada ?? rule.cajas_por_camita ?? 1))
      setNumeroCamadas(String(rule.numero_camadas ?? rule.camitas_por_paleta ?? 1))
      setPermitePuchos(rule.permite_puchos ?? true)
      setLargoCm(rule.largo_caja_cm ? String(rule.largo_caja_cm) : '')
      setAnchoCm(rule.ancho_caja_cm ? String(rule.ancho_caja_cm) : '')
      setAltoCm(rule.alto_caja_cm ? String(rule.alto_caja_cm) : '')
      setPesoCajaKg(rule.peso_caja_kg ? String(rule.peso_caja_kg) : '')
      setNotasArmado(rule.notas_armado ?? '')
      setCurrentImagePath(rule.imagen_armado_path ?? null)
    } else {
      setUnidadesPorCaja('1')
      setCajasPorCamada('1')
      setNumeroCamadas('1')
      setPermitePuchos(true)
      setLargoCm('')
      setAnchoCm('')
      setAltoCm('')
      setPesoCajaKg('')
      setNotasArmado('')
      setCurrentImagePath(null)
    }

    const serialProfile = getProductSerialProfile(p)
    if (serialProfile) {
      setSerialPesoKg(serialProfile.peso_unitario_kg ? String(serialProfile.peso_unitario_kg) : '')
      setSerialLargoCm(serialProfile.largo_cm ? String(serialProfile.largo_cm) : '')
      setSerialAnchoCm(serialProfile.ancho_cm ? String(serialProfile.ancho_cm) : '')
      setSerialAltoCm(serialProfile.alto_cm ? String(serialProfile.alto_cm) : '')
      setSerialRequiereIzaje(serialProfile.requiere_equipo_izaje ?? false)
      setSerialUbicacion(serialProfile.ubicacion_permitida || 'AMBAS')
      setSerialNotas(serialProfile.notas ?? '')
    } else {
      setSerialPesoKg(p.peso_unitario_kg ? String(p.peso_unitario_kg) : '')
      setSerialLargoCm('')
      setSerialAnchoCm('')
      setSerialAltoCm('')
      setSerialRequiereIzaje(false)
      setSerialUbicacion('AMBAS')
      setSerialNotas('')
    }

    setImageFile(null)
    setShowForm(true)
    window.scrollTo({ top: 100, behavior: 'smooth' })
  }

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const skuClean = sku.trim()
    const nombreClean = nombre.trim()

    if (!skuClean || !nombreClean) {
      onError('El SKU y el nombre del producto son obligatorios.')
      return
    }

    setSaving(true)
    onError(null)

    try {
      // 1. Guardar o actualizar registro base en producto
      const productPayload: Partial<Product> = {
        sku: skuClean,
        nombre: nombreClean,
        descripcion: nombreClean,
        id_categoria: idCategoria ? Number(idCategoria) : null,
        unidad_medida: unidadMedida.trim() || 'UNIDAD',
        peso_unitario_kg: isSerializado
          ? (serialPesoKg ? Number(serialPesoKg) : null)
          : (pesoUnitario ? Number(pesoUnitario) : null),
        costo_unitario: costoUnitario ? Number(costoUnitario) : null,
        clasificacion_abc: clasificacionAbc || null,
        activo
      }

      if (editing?.id_producto) {
        productPayload.id_producto = editing.id_producto
      }

      const savedProduct = await productoRepository.guardar(productPayload)
      const targetId = savedProduct.id_producto

      // 2. Persistir perfil específico a través de la Estrategia correspondiente
      const strategy = getEstrategiaManejo(currentModo)

      if (isSerializado) {
        const serialData: SerializedFormData = {
          peso_unitario_kg: serialPesoKg,
          largo_cm: serialLargoCm,
          ancho_cm: serialAnchoCm,
          alto_cm: serialAltoCm,
          requiere_equipo_izaje: serialRequiereIzaje,
          ubicacion_permitida: serialUbicacion,
          atributos: {},
          notas: serialNotas
        }
        await strategy.guardarPerfil(targetId, serialData)
      } else {
        const packingData: PackingFormData = {
          unidades_por_caja: unidadesPorCaja,
          cajas_por_camada: cajasPorCamada,
          numero_camadas: numeroCamadas,
          permite_puchos: permitePuchos,
          notas_armado: notasArmado,
          largo_caja_cm: largoCm,
          ancho_caja_cm: anchoCm,
          alto_caja_cm: altoCm,
          peso_caja_kg: pesoCajaKg
        }
        await strategy.guardarPerfil(targetId, packingData, imageFile)
      }

      await logCatalogChange({
        tabla: 'producto',
        operacion: editing ? 'UPDATE' : 'INSERT',
        id_registro: Number(targetId),
        datos_nuevos: { producto: productPayload, modo: currentModo }
      })

      resetForm()
      onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al guardar el producto.'
      onError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel master-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0 }}>Productos y Modos de Manejo</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            Administra los productos del catálogo adaptando sus especificaciones técnicas según su modo de manejo (paletizado o serializado).
          </p>
        </div>
        {!showForm && (
          <button className="button" style={{ margin: 0 }} type="button" onClick={startCreate}>
            + Registrar producto
          </button>
        )}
      </div>

      {/* Formulario Unificado Dinámico */}
      {showForm && (
        <div style={{ marginTop: '20px', padding: '24px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-text-primary)' }}>
              {editing ? `Editar producto: ${editing.sku}` : 'Registrar nuevo producto'}
            </h4>
            <span
              className="category-pill"
              style={{
                background: isSerializado ? '#fef3c7' : '#e0f2fe',
                color: isSerializado ? '#92400e' : '#0369a1',
                borderColor: isSerializado ? '#fde68a' : '#bae6fd'
              }}
            >
              Modo: {isSerializado ? 'Serializado unitario' : 'Paletizado estándar'}
            </span>
          </div>

          <form className="product-form" onSubmit={handleSave}>
            {/* Bloque 1: Datos Comunes */}
            <fieldset>
              <legend>1. Datos generales del producto</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <label>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>SKU (obligatorio y correlativo)</span>
                    {!editing && (
                      <button
                        type="button"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-brand)',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline'
                        }}
                        onClick={async () => {
                          const local = calcularSiguienteSkuLocal()
                          setSku(local)
                          try {
                            const remote = await productoRepository.obtenerSiguienteSku()
                            if (remote) setSku(remote)
                          } catch {
                            // Mantiene local
                          }
                        }}
                      >
                        ⚡ Siguiente SKU
                      </button>
                    )}
                  </div>
                  <input
                    value={sku}
                    onChange={(e) => setSku(e.target.value.toUpperCase())}
                    placeholder="Ej. SKU-00000"
                    required
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', display: 'block', marginTop: '2px' }}>
                    Formato: SKU-00000 en adelante
                  </span>
                </label>

                <label>
                  Nombre / Descripción (obligatorio)
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Generador Diésel 5.5 kVA"
                    required
                  />
                </label>

                <label>
                  Categoría
                  <select value={idCategoria} onChange={(e) => setIdCategoria(e.target.value)}>
                    <option value="">Sin categoría</option>
                    {categories.map((c) => (
                      <option key={c.id_categoria} value={String(c.id_categoria)}>
                        {c.nombre} ({c.modo_manejo || 'PALETIZADO'})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Unidad de medida
                  <select value={unidadMedida} onChange={(e) => setUnidadMedida(e.target.value)}>
                    <option value="UNIDAD">UNIDAD</option>
                    <option value="PIEZA">PIEZA</option>
                    <option value="EQUIPO">EQUIPO</option>
                    <option value="CAJA">CAJA</option>
                    <option value="ROLLO">ROLLO</option>
                    <option value="SET">SET</option>
                    <option value="METRO">METRO</option>
                  </select>
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginTop: '12px' }}>
                {!isSerializado && (
                  <label>
                    Peso unitario suelto (kg)
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={pesoUnitario}
                      onChange={(e) => setPesoUnitario(e.target.value)}
                      placeholder="0.250"
                    />
                  </label>
                )}

                <label>
                  Costo unitario ($)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={costoUnitario}
                    onChange={(e) => setCostoUnitario(e.target.value)}
                    placeholder="120.00"
                  />
                </label>

                <label>
                  Clasificación ABC
                  <select value={clasificacionAbc} onChange={(e) => setClasificacionAbc(e.target.value)}>
                    <option value="A">Clase A (Alta rotación/valor 80%)</option>
                    <option value="B">Clase B (Rotación media 15%)</option>
                    <option value="C">Clase C (Baja rotación 5%)</option>
                  </select>
                </label>

                <label className="check" style={{ marginTop: '26px' }}>
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={(e) => setActivo(e.target.checked)}
                  />
                  Producto activo en el catálogo
                </label>
              </div>
            </fieldset>

            {/* Bloque 2 Dinámico: Paletizado vs Serializado */}
            {isSerializado ? (
              <fieldset style={{ marginTop: '16px' }}>
                <legend>2. Ficha técnica de maquinaria y equipo (Serializado unitario)</legend>
                <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.85rem' }}>
                  Cada unidad de este producto se identificará con número de serie único y etiqueta RFID individual. No aplica regla de empaque, camadas ni puchos.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                  <label>
                    Peso del equipo (kg)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={serialPesoKg}
                      onChange={(e) => setSerialPesoKg(e.target.value)}
                      placeholder="Ej. 185.5"
                    />
                  </label>

                  <label>
                    Largo (cm)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={serialLargoCm}
                      onChange={(e) => setSerialLargoCm(e.target.value)}
                      placeholder="90.0"
                    />
                  </label>

                  <label>
                    Ancho (cm)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={serialAnchoCm}
                      onChange={(e) => setSerialAnchoCm(e.target.value)}
                      placeholder="60.0"
                    />
                  </label>

                  <label>
                    Alto (cm)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={serialAltoCm}
                      onChange={(e) => setSerialAltoCm(e.target.value)}
                      placeholder="75.0"
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '12px' }}>
                  <label>
                    Ubicación permitida en almacén
                    <select
                      value={serialUbicacion}
                      onChange={(e) => setSerialUbicacion(e.target.value as 'CAMPO' | 'RACK' | 'AMBAS')}
                    >
                      <option value="AMBAS">Ambas (Campo libre o rack reforzado)</option>
                      <option value="CAMPO">Solo Campo / Piso libre (Sobredimensionado)</option>
                      <option value="RACK">Solo Estantería Rack (Dimensiones estándar)</option>
                    </select>
                  </label>

                  <label className="check" style={{ marginTop: '26px' }}>
                    <input
                      type="checkbox"
                      checked={serialRequiereIzaje}
                      onChange={(e) => setSerialRequiereIzaje(e.target.checked)}
                    />
                    Requiere equipo de izaje mecánico (grúa / montacargas pesado)
                  </label>
                </div>

                {serialVolumenM3 && (
                  <div className="metrics" style={{ marginTop: '12px' }}>
                    <span>Volumen unitario: {serialVolumenM3.toFixed(3)} m³</span>
                    <span>Dimensiones: {serialLargoCm} × {serialAnchoCm} × {serialAltoCm} cm</span>
                    {serialPesoKg && <strong>Peso: {serialPesoKg} kg</strong>}
                  </div>
                )}

                <label style={{ display: 'grid', gap: '6px', margin: '12px 0 0', fontWeight: 600, fontSize: '0.85rem' }}>
                  Notas técnicas y de mantenimiento
                  <input
                    value={serialNotas}
                    onChange={(e) => setSerialNotas(e.target.value)}
                    placeholder="Ej. Requiere chequeo de aceite hidráulico antes de despacho."
                  />
                </label>
              </fieldset>
            ) : (
              <fieldset style={{ marginTop: '16px' }}>
                <legend>2. Ficha de empaque y esquema de paletizado</legend>

                <div className="number-grid">
                  <label>
                    Unidades por caja (&gt; 0)
                    <input
                      type="number"
                      min="1"
                      value={unidadesPorCaja}
                      onChange={(e) => setUnidadesPorCaja(e.target.value)}
                      required
                    />
                  </label>

                  <label>
                    Cajas por camada
                    <input
                      type="number"
                      min="1"
                      value={cajasPorCamada}
                      onChange={(e) => setCajasPorCamada(e.target.value)}
                      required
                    />
                  </label>

                  <label>
                    Camadas por paleta
                    <input
                      type="number"
                      min="1"
                      value={numeroCamadas}
                      onChange={(e) => setNumeroCamadas(e.target.value)}
                      required
                    />
                  </label>
                </div>

                <p style={{ margin: '14px 0 6px', fontWeight: 600, fontSize: '0.86rem', color: 'var(--color-brand)' }}>
                  Dimensiones y peso de la caja
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                  <label>
                    Largo caja (cm)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={largoCm}
                      onChange={(e) => setLargoCm(e.target.value)}
                      placeholder="40.0"
                    />
                  </label>
                  <label>
                    Ancho caja (cm)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={anchoCm}
                      onChange={(e) => setAnchoCm(e.target.value)}
                      placeholder="30.0"
                    />
                  </label>
                  <label>
                    Alto caja (cm)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={altoCm}
                      onChange={(e) => setAltoCm(e.target.value)}
                      placeholder="25.0"
                    />
                  </label>
                  <label>
                    Peso caja (kg)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pesoCajaKg}
                      onChange={(e) => setPesoCajaKg(e.target.value)}
                      placeholder="12.5"
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '12px' }}>
                  <div className="stat-box" style={{ padding: '10px 14px', background: 'var(--color-surface)', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', display: 'block' }}>Alto total estimado paleta:</span>
                    <strong style={{ fontSize: '1rem', color: 'var(--color-brand)', marginTop: '2px' }}>
                      {metrics.altoSugeridoCm ? `${metrics.altoSugeridoCm.toFixed(1)} cm` : '—'}
                    </strong>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                      ({altoCm || 0} cm × {numeroCamadas} camadas + 15 cm tarima)
                    </div>
                  </div>

                  <div className="stat-box" style={{ padding: '10px 14px', background: 'var(--color-surface)', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', display: 'block' }}>Peso total estimado paleta:</span>
                    <strong style={{ fontSize: '1rem', color: 'var(--color-brand)', marginTop: '2px' }}>
                      {metrics.pesoSugeridoKg ? `${metrics.pesoSugeridoKg.toFixed(1)} kg` : '—'}
                    </strong>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                      ({pesoCajaKg || 0} kg × {metrics.cajasPaleta} cajas + 25 kg tarima)
                    </div>
                  </div>
                </div>

                <label style={{ display: 'grid', gap: '6px', margin: '12px 0 0', fontWeight: 600, fontSize: '0.85rem' }}>
                  Notas de patrón de armado (opcional)
                  <input
                    value={notasArmado}
                    onChange={(e) => setNotasArmado(e.target.value)}
                    placeholder="Ej. Traba 3x2, orientar etiquetas hacia el exterior"
                  />
                </label>

                <label style={{ display: 'grid', gap: '6px', margin: '12px 0 0', fontWeight: 600, fontSize: '0.85rem' }}>
                  Diagrama visual de armado (PNG, JPG, WebP)
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleFileChange}
                  />
                  {imageFile ? (
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-success)' }}>
                      Archivo nuevo: {imageFile.name}
                    </span>
                  ) : currentImagePath ? (
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      Diagrama almacenado: {currentImagePath}
                    </span>
                  ) : null}
                </label>

                <label className="check" style={{ marginTop: '12px' }}>
                  <input
                    type="checkbox"
                    checked={permitePuchos}
                    onChange={(e) => setPermitePuchos(e.target.checked)}
                  />
                  Permite cajas pucho (fraccionadas en recepción)
                </label>

                <div className="metrics" style={{ marginTop: '14px' }}>
                  <span>{cajasPorCamada} cajas/camada</span>
                  <span>{numeroCamadas} camadas/paleta</span>
                  <span>{metrics.cajasPaleta} cajas/paleta</span>
                  <strong>{metrics.unidadesPaleta} unidades/paleta</strong>
                  {metrics.volCajaM3 && <span>Volumen caja: {metrics.volCajaM3.toFixed(4)} m³</span>}
                  {metrics.volPaletaM3 && <span>Volumen paleta: {metrics.volPaletaM3.toFixed(3)} m³</span>}
                </div>
              </fieldset>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
              <button className="button" style={{ margin: 0 }} disabled={saving}>
                {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar producto'}
              </button>
              <button className="button secondary" type="button" style={{ margin: 0 }} onClick={resetForm}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Controles de Búsqueda y Filtros de la Tabla */}
      <div className="table-controls" style={{ marginTop: '20px' }}>
        <div className="filter-group">
          <label htmlFor="p-cat">Filtrar por categoría:</label>
          <select id="p-cat" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">Todas las categorías ({products.length})</option>
            {categories.map((c) => (
              <option key={c.id_categoria} value={String(c.id_categoria)}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="search-group">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por SKU o nombre de producto…"
          />
          {(filterCategory !== '' || search !== '') && (
            <button
              className="button secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem', margin: 0 }}
              type="button"
              onClick={() => {
                setFilterCategory('')
                setSearch('')
              }}
            >
              Restablecer
            </button>
          )}
        </div>
      </div>

      {/* Tabla Unificada Adaptativa según Modo de Manejo */}
      {loading ? (
        <p className="muted">Cargando productos y especificaciones…</p>
      ) : filtered.length === 0 ? (
        <p className="empty-state">No se encontraron productos registrados.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nombre / Descripción</th>
                <th>Categoría y Modo</th>
                <th>U. Medida / Costo</th>
                <th>ABC</th>
                <th>Especificación Técnica</th>
                <th>Dimensiones / Cubicaje</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const modoProd = p.categoria?.modo_manejo || 'PALETIZADO'
                const esSerial = modoProd === 'SERIALIZADO'
                const rule = getProductRule(p)
                const serialProfile = getProductSerialProfile(p)

                const cCamada = rule?.cajas_por_camada ?? rule?.cajas_por_camita ?? 0
                const nCamadas = rule?.numero_camadas ?? rule?.camitas_por_paleta ?? 0
                const cajasPaleta = cCamada * nCamadas
                const unidadesPaleta = rule ? cajasPaleta * rule.unidades_por_caja : 0

                return (
                  <tr key={p.id_producto}>
                    <td><span className="sku-badge">{p.sku}</span></td>
                    <td><strong>{p.nombre ?? p.descripcion}</strong></td>
                    <td>
                      <div><span className="category-pill">{p.categoria?.nombre ?? 'Sin categoría'}</span></div>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: esSerial ? '#92400e' : '#0369a1',
                          fontWeight: 600,
                          marginTop: '2px',
                          display: 'inline-block'
                        }}
                      >
                        {esSerial ? 'Serializado unitario' : 'Paletizado'}
                      </span>
                    </td>
                    <td>
                      <div>{p.unidad_medida ?? 'UNIDAD'}</div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        {p.costo_unitario ? `$${Number(p.costo_unitario).toFixed(2)}` : '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontWeight: 700,
                        color: p.clasificacion_abc === 'A' ? 'var(--color-success)' : p.clasificacion_abc === 'B' ? 'var(--color-warning)' : 'var(--color-text-secondary)'
                      }}>
                        {p.clasificacion_abc ?? 'B'}
                      </span>
                    </td>
                    <td>
                      {esSerial ? (
                        <div>
                          <span style={{ fontWeight: 600, color: '#92400e' }}>Equipo individual</span>
                          {serialProfile?.requiere_equipo_izaje && (
                            <span
                              className="category-pill"
                              style={{ marginLeft: '6px', background: '#fee2e2', color: '#991b1b', fontSize: '0.7rem' }}
                            >
                              Requiere izaje
                            </span>
                          )}
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                            Ubicación: {serialProfile?.ubicacion_permitida || 'AMBAS'}
                          </div>
                        </div>
                      ) : rule ? (
                        <div>
                          <span>{rule.unidades_por_caja} u/caja · {cCamada} c/camada · {nCamadas} camadas</span>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-brand)', fontWeight: 600 }}>
                            {cajasPaleta} cajas / {unidadesPaleta} un. por paleta
                          </div>
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.8rem' }}>Sin empaque asignado</span>
                      )}
                    </td>
                    <td>
                      {esSerial ? (
                        <div style={{ fontSize: '0.82rem' }}>
                          {serialProfile?.largo_cm && serialProfile?.ancho_cm && serialProfile?.alto_cm ? (
                            <div>{serialProfile.largo_cm}×{serialProfile.ancho_cm}×{serialProfile.alto_cm} cm</div>
                          ) : '—'}
                          {serialProfile?.peso_unitario_kg ? (
                            <div style={{ color: 'var(--color-brand)', fontWeight: 600 }}>
                              Peso: {serialProfile.peso_unitario_kg} kg
                            </div>
                          ) : null}
                        </div>
                      ) : rule?.volumen_total_m3 || (rule?.alto_caja_cm && nCamadas) ? (
                        <div style={{ fontSize: '0.82rem' }}>
                          {rule.alto_caja_cm && nCamadas ? <div>Alto: {(rule.alto_caja_cm * nCamadas + 15).toFixed(0)} cm</div> : null}
                          {rule.volumen_total_m3 ? <div style={{ color: 'var(--color-brand)', fontWeight: 600 }}>Vol: {Number(rule.volumen_total_m3).toFixed(3)} m³</div> : null}
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={p.activo !== false ? 'category-pill' : 'category-pill muted'}>
                        {p.activo !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn-detail" type="button" onClick={() => startEdit(p)}>
                          Editar
                        </button>
                        <button className="btn-detail" type="button" onClick={() => onViewDetail(p)}>
                          Ver ficha
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
