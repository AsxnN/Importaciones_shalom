import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { logCatalogChange } from '../../../lib/audit'
import { supabase } from '../../../lib/supabase'
import { getProductRule, type Category, type Product, type Rule } from '../types'

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

  // 1. Campos del Producto
  const [sku, setSku] = useState('')
  const [nombre, setNombre] = useState('')
  const [idCategoria, setIdCategoria] = useState('')
  const [unidadMedida, setUnidadMedida] = useState('UNIDAD')
  const [pesoUnitario, setPesoUnitario] = useState('')
  const [costoUnitario, setCostoUnitario] = useState('')
  const [clasificacionAbc, setClasificacionAbc] = useState('B')
  const [activo, setActivo] = useState(true)

  // 2. Campos de Empaque y Paletizado integrados
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

  // Filtros de tabla
  const [filterCategory, setFilterCategory] = useState('')
  const [search, setSearch] = useState('')

  // Cálculos en tiempo real
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

    setShowForm(false)
  }

  function startCreate() {
    resetForm()
    setShowForm(true)
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

    // Cargar regla de empaque asociada si existe
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
    setImageFile(null)
    setShowForm(true)

    window.scrollTo({ top: 100, behavior: 'smooth' })
  }

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const skuClean = sku.trim()
    const nombreClean = nombre.trim()

    if (!skuClean || !nombreClean) {
      onError('El SKU y el Nombre del producto son obligatorios.')
      return
    }

    setSaving(true)
    onError(null)

    // 1. Guardar o Actualizar en tabla 'producto'
    const productPayload = {
      sku: skuClean,
      nombre: nombreClean,
      descripcion: nombreClean,
      id_categoria: idCategoria ? Number(idCategoria) : null,
      unidad_medida: unidadMedida.trim() || 'UNIDAD',
      peso_unitario_kg: pesoUnitario ? Number(pesoUnitario) : null,
      costo_unitario: costoUnitario ? Number(costoUnitario) : null,
      clasificacion_abc: clasificacionAbc || null,
      activo
    }

    let targetProductId = editing?.id_producto

    if (editing) {
      const { error: prodErr } = await supabase
        .from('producto')
        .update(productPayload)
        .eq('id_producto', editing.id_producto)

      if (prodErr) {
        setSaving(false)
        onError(prodErr.message)
        return
      }
    } else {
      const { data: newProd, error: prodErr } = await supabase
        .from('producto')
        .insert(productPayload)
        .select('id_producto')
        .single()

      if (prodErr || !newProd) {
        setSaving(false)
        onError(prodErr?.message ?? 'No se pudo crear el producto.')
        return
      }
      targetProductId = newProd.id_producto
    }

    // 2. Subida opcional de imagen al bucket 'esquemas-empaque'
    let finalImagePath = currentImagePath
    if (imageFile && targetProductId) {
      const fileExt = imageFile.name.split('.').pop()
      const fileName = `${targetProductId}_${Date.now()}.${fileExt}`
      const storagePath = `patrones/${fileName}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('esquemas-empaque')
        .upload(storagePath, imageFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        onError(`Producto guardado, pero falló la subida del diagrama: ${uploadError.message}`)
      } else if (uploadData) {
        finalImagePath = uploadData.path
      }
    }

    // 3. Guardar o Actualizar en tabla 'regla_empaque' vinculada a id_producto
    const cCamada = Math.max(1, Number(cajasPorCamada) || 1)
    const nCamadas = Math.max(1, Number(numeroCamadas) || 1)
    const uCaja = Math.max(1, Number(unidadesPorCaja) || 1)

    const packingPayload = {
      id_producto: Number(targetProductId),
      unidades_por_caja: uCaja,
      cajas_por_camada: cCamada,
      numero_camadas: nCamadas,
      cajas_por_camita: cCamada,
      camitas_por_paleta: nCamadas,
      permite_puchos: permitePuchos,
      notas_armado: notasArmado.trim() || null,
      imagen_armado_path: finalImagePath,
      largo_caja_cm: largoCm ? Number(largoCm) : null,
      ancho_caja_cm: anchoCm ? Number(anchoCm) : null,
      alto_caja_cm: altoCm ? Number(altoCm) : null,
      peso_caja_kg: pesoCajaKg ? Number(pesoCajaKg) : null,
      volumen_caja_m3: metrics.volCajaM3 ? Number(metrics.volCajaM3.toFixed(4)) : null,
      volumen_total_m3: metrics.volPaletaM3 ? Number(metrics.volPaletaM3.toFixed(4)) : null
    }

    const { error: packingErr } = await supabase
      .from('regla_empaque')
      .upsert(packingPayload, { onConflict: 'id_producto' })

    setSaving(false)

    if (packingErr) {
      onError(`Producto guardado, pero hubo un error en su empaque: ${packingErr.message}`)
    } else {
      await logCatalogChange({
        tabla: 'producto',
        operacion: editing ? 'UPDATE' : 'INSERT',
        id_registro: targetProductId ?? 0,
        datos_nuevos: { producto: productPayload, empaque: packingPayload }
      })

      resetForm()
      onRefresh()
    }
  }

  return (
    <section className="panel master-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0 }}>Productos y Empaque</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            Módulo integral: administra cada artículo junto con sus especificaciones de empaque, dimensiones y estibado de paletas.
          </p>
        </div>
        {!showForm && (
          <button className="button" style={{ margin: 0 }} type="button" onClick={startCreate}>
            + Registrar Producto y Empaque
          </button>
        )}
      </div>

      {/* Formulario Unificado */}
      {showForm && (
        <div style={{ marginTop: '20px', padding: '20px', background: '#f8faf8', border: '1px solid #d4e2d7', borderRadius: '12px' }}>
          <h4 style={{ margin: '0 0 16px' }}>
            {editing ? `Editar Producto y Ficha de Empaque: ${editing.sku}` : 'Registrar Nuevo Producto y Ficha de Empaque'}
          </h4>

          <form className="product-form" onSubmit={handleSave}>
            {/* Bloque 1: Datos Generales */}
            <fieldset>
              <legend>1. Datos del Producto</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <label>
                  SKU (obligatorio y único)
                  <input
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Ej. SKU-1001"
                    required
                  />
                </label>

                <label>
                  Nombre / Descripción (obligatorio)
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Cinta de Embalaje 2x100m"
                    required
                  />
                </label>

                <label>
                  Categoría
                  <select value={idCategoria} onChange={(e) => setIdCategoria(e.target.value)}>
                    <option value="">Sin categoría</option>
                    {categories.map((c) => (
                      <option key={c.id_categoria} value={String(c.id_categoria)}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Unidad de Medida
                  <select value={unidadMedida} onChange={(e) => setUnidadMedida(e.target.value)}>
                    <option value="UNIDAD">UNIDAD</option>
                    <option value="PIEZA">PIEZA</option>
                    <option value="CAJA">CAJA</option>
                    <option value="ROLLO">ROLLO</option>
                    <option value="SET">SET</option>
                    <option value="METRO">METRO</option>
                  </select>
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginTop: '12px' }}>
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

                <label>
                  Costo unitario ($)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={costoUnitario}
                    onChange={(e) => setCostoUnitario(e.target.value)}
                    placeholder="12.50"
                  />
                </label>

                <label>
                  Clasificación ABC (Pareto)
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
                  Producto activo
                </label>
              </div>
            </fieldset>

            {/* Bloque 2: Empaque y Paletizado */}
            <fieldset style={{ marginTop: '16px' }}>
              <legend>2. Ficha de Empaque y Esquema de Paletizado</legend>

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
                  Cajas por camada (total real por cama)
                  <input
                    type="number"
                    min="1"
                    value={cajasPorCamada}
                    onChange={(e) => setCajasPorCamada(e.target.value)}
                    required
                  />
                </label>

                <label>
                  Camadas / Niveles por paleta
                  <input
                    type="number"
                    min="1"
                    value={numeroCamadas}
                    onChange={(e) => setNumeroCamadas(e.target.value)}
                    required
                  />
                </label>
              </div>

              {/* Medidas de caja */}
              <p style={{ margin: '14px 0 6px', fontWeight: 700, fontSize: '0.86rem', color: '#187346' }}>
                Dimensiones y Peso de la Caja (Empaque Intermedio)
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

              {/* Medidas y cálculos de paleta */}
              <p style={{ margin: '14px 0 6px', fontWeight: 700, fontSize: '0.86rem', color: '#187346' }}>
                Estimaciones de la Paleta Armada (Cálculo según dimensiones de caja y camadas)
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div className="stat-box" style={{ padding: '10px 14px', background: '#f2f8f4', borderRadius: '8px', border: '1px solid #cbe3d3' }}>
                  <span style={{ fontSize: '0.78rem', color: '#5d6b62', display: 'block' }}>Alto total estimado paleta:</span>
                  <strong style={{ fontSize: '1.05rem', color: '#187346' }}>
                    {metrics.altoSugeridoCm ? `${metrics.altoSugeridoCm.toFixed(1)} cm` : '—'}
                  </strong>
                  <div style={{ fontSize: '0.74rem', color: '#7a8c7e', marginTop: '2px' }}>
                    ({altoCm || 0} cm × {numeroCamadas} camadas + 15 cm tarima)
                  </div>
                </div>

                <div className="stat-box" style={{ padding: '10px 14px', background: '#f2f8f4', borderRadius: '8px', border: '1px solid #cbe3d3' }}>
                  <span style={{ fontSize: '0.78rem', color: '#5d6b62', display: 'block' }}>Peso total estimado paleta:</span>
                  <strong style={{ fontSize: '1.05rem', color: '#187346' }}>
                    {metrics.pesoSugeridoKg ? `${metrics.pesoSugeridoKg.toFixed(1)} kg` : '—'}
                  </strong>
                  <div style={{ fontSize: '0.74rem', color: '#7a8c7e', marginTop: '2px' }}>
                    ({pesoCajaKg || 0} kg × {metrics.cajasPaleta} cajas + 25 kg tarima)
                  </div>
                </div>
              </div>

              <label style={{ display: 'grid', gap: '6px', margin: '12px 0 0', fontWeight: 700, fontSize: '0.85rem' }}>
                Notas de patrón de armado (opcional)
                <input
                  value={notasArmado}
                  onChange={(e) => setNotasArmado(e.target.value)}
                  placeholder="Ej. Traba 3x2, orientar etiquetas hacia el exterior"
                />
              </label>

              <label style={{ display: 'grid', gap: '6px', margin: '12px 0 0', fontWeight: 700, fontSize: '0.85rem' }}>
                Diagrama visual de armado (PNG, JPG, WebP)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleFileChange}
                />
                {imageFile ? (
                  <span style={{ fontSize: '0.8rem', color: '#187346' }}>
                    Archivo nuevo: {imageFile.name}
                  </span>
                ) : currentImagePath ? (
                  <span style={{ fontSize: '0.8rem', color: '#5d6b62' }}>
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
                {metrics.volCajaM3 && <span>Volumen Caja: {metrics.volCajaM3.toFixed(4)} m³</span>}
                {metrics.volPaletaM3 && <span>Volumen Paleta: {metrics.volPaletaM3.toFixed(3)} m³</span>}
              </div>
            </fieldset>

            <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
              <button className="button" style={{ margin: 0 }} disabled={saving}>
                {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar producto y empaque'}
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

      {/* Tabla Unificada de Productos con sus Reglas de Empaque */}
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
                <th>Categoría</th>
                <th>U. Medida / Costo</th>
                <th>ABC</th>
                <th>Ficha de Empaque y Paletizado</th>
                <th>Medidas Paleta</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const rule = getProductRule(p)
                const cCamada = rule?.cajas_por_camada ?? rule?.cajas_por_camita ?? 0
                const nCamadas = rule?.numero_camadas ?? rule?.camitas_por_paleta ?? 0
                const cajasPaleta = cCamada * nCamadas
                const unidadesPaleta = rule ? cajasPaleta * rule.unidades_por_caja : 0

                return (
                  <tr key={p.id_producto}>
                    <td><span className="sku-badge">{p.sku}</span></td>
                    <td><strong>{p.nombre ?? p.descripcion}</strong></td>
                    <td><span className="category-pill">{p.categoria?.nombre ?? '—'}</span></td>
                    <td>
                      <div>{p.unidad_medida ?? 'UNIDAD'}</div>
                      <span style={{ fontSize: '0.8rem', color: '#5d6b62' }}>
                        {p.costo_unitario ? `$${Number(p.costo_unitario).toFixed(2)}` : '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontWeight: 800,
                        color: p.clasificacion_abc === 'A' ? '#187346' : p.clasificacion_abc === 'B' ? '#c27e00' : '#888'
                      }}>
                        {p.clasificacion_abc ?? 'B'}
                      </span>
                    </td>
                    <td>
                      {rule ? (
                        <div>
                          <span>{rule.unidades_por_caja} u/caja · {cCamada} c/camada · {nCamadas} camadas</span>
                          <div style={{ fontSize: '0.8rem', color: '#187346', fontWeight: 700 }}>
                            {cajasPaleta} cajas / {unidadesPaleta} un. por paleta
                          </div>
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.8rem' }}>Sin empaque asignado</span>
                      )}
                    </td>
                    <td>
                      {rule?.volumen_total_m3 || (rule?.alto_caja_cm && nCamadas) ? (
                        <div style={{ fontSize: '0.82rem' }}>
                          {rule.alto_caja_cm && nCamadas ? <div>Alto: {(rule.alto_caja_cm * nCamadas + 15).toFixed(0)} cm</div> : null}
                          {rule.volumen_total_m3 ? <div style={{ color: '#187346', fontWeight: 600 }}>Vol: {Number(rule.volumen_total_m3).toFixed(3)} m³</div> : null}
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
                          Ver Ficha
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
