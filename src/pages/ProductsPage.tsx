import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ProductDetailModal } from './products/ProductDetailModal'
import { CategoriesSubView } from './products/subviews/CategoriesSubView'
import { DataImportSubView } from './products/subviews/DataImportSubView'
import { ProductsSubView } from './products/subviews/ProductsSubView'
import { SuppliersSubView } from './products/subviews/SuppliersSubView'
import type { Category, Product, ViewTab } from './products/types'

export function ProductsPage({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<ViewTab>('productos')
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ficha técnica modal seleccionada para visualización detallada consolidada
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null)

  async function loadCategories() {
    setLoadingCategories(true)
    const { data, error: err } = await supabase
      .from('categoria')
      .select('id_categoria, nombre, descripcion, activo')
      .order('nombre')

    if (err) {
      setError(err.message)
    } else {
      setCategories((data as Category[]) ?? [])
    }
    setLoadingCategories(false)
  }

  async function loadProducts() {
    setLoadingProducts(true)
    const { data, error: err } = await supabase
      .from('producto')
      .select(
        'id_producto, sku, nombre, descripcion, id_categoria, unidad_medida, peso_unitario_kg, costo_unitario, clasificacion_abc, activo, categoria(id_categoria, nombre), regla_empaque(id_empaque, unidades_por_caja, cajas_por_camada, numero_camadas, cajas_por_camita, camitas_por_paleta, volumen_caja_m3, volumen_total_m3, permite_puchos, notas_armado, imagen_armado_path, largo_caja_cm, ancho_caja_cm, alto_caja_cm, peso_caja_kg)'
      )
      .order('sku')

    if (err) {
      setError(err.message)
    } else {
      setProducts((data as unknown as Product[]) ?? [])
    }
    setLoadingProducts(false)
  }

  useEffect(() => {
    void loadCategories()
    void loadProducts()
  }, [])

  const refreshAll = () => {
    setError(null)
    void loadCategories()
    void loadProducts()
  }

  return (
    <section className="products-page">
      {/* Encabezado del Módulo 1 */}
      <div className="page-heading">
        <div>
          <button className="link-button" type="button" onClick={onBack}>
            ← Volver al Menú
          </button>
          <p className="eyebrow">MÓDULO 1</p>
          <h2>Maestros y Empaque</h2>
          <p className="muted">
            Gestión unificada de productos, especificaciones de empaque y estibado, categorías, proveedores e importación masiva.
          </p>
        </div>
        <button className="button secondary" type="button" onClick={refreshAll}>
          Actualizar datos
        </button>
      </div>

      {/* Pestañas de Navegación Unificadas */}
      <nav className="module-tabs" aria-label="Secciones del Módulo 1">
        <button
          className={activeTab === 'productos' ? 'active' : ''}
          type="button"
          onClick={() => setActiveTab('productos')}
        >
          Productos y Empaque
        </button>
        <button
          className={activeTab === 'categorias' ? 'active' : ''}
          type="button"
          onClick={() => setActiveTab('categorias')}
        >
          Categorías
        </button>
        <button
          className={activeTab === 'proveedores' ? 'active' : ''}
          type="button"
          onClick={() => setActiveTab('proveedores')}
        >
          Proveedores
        </button>
        <button
          className={activeTab === 'importacion' ? 'active' : ''}
          type="button"
          onClick={() => setActiveTab('importacion')}
        >
          Importación CSV
        </button>
      </nav>

      {/* Alerta de Notificación / Error */}
      {error && (
        <p className="error notice" role="alert" style={{ margin: '14px 0' }}>
          {error}
        </p>
      )}

      {/* 1. Módulo Unificado: Productos y Empaque */}
      {activeTab === 'productos' && (
        <ProductsSubView
          products={products}
          categories={categories}
          loading={loadingProducts}
          onRefresh={() => void loadProducts()}
          onError={setError}
          onViewDetail={(p) => setViewingProduct(p)}
        />
      )}

      {/* 2. Subvista Categorías */}
      {activeTab === 'categorias' && (
        <CategoriesSubView
          categories={categories}
          loading={loadingCategories}
          onRefresh={() => void loadCategories()}
          onError={setError}
        />
      )}

      {/* 3. Subvista Proveedores */}
      {activeTab === 'proveedores' && (
        <SuppliersSubView onError={setError} />
      )}

      {/* 4. Subvista Importación CSV */}
      {activeTab === 'importacion' && (
        <DataImportSubView
          onRefreshAll={refreshAll}
          onError={setError}
        />
      )}

      {/* Modal / Ficha Técnica Consolidada (JOIN producto + categoria + regla_empaque) */}
      <ProductDetailModal
        product={viewingProduct}
        onClose={() => setViewingProduct(null)}
        onPackagingUpdated={async () => {
          await loadProducts()
          if (viewingProduct) {
            const { data } = await supabase
              .from('producto')
              .select(
                'id_producto, sku, nombre, descripcion, id_categoria, unidad_medida, peso_unitario_kg, costo_unitario, clasificacion_abc, activo, categoria(id_categoria, nombre), regla_empaque(id_empaque, unidades_por_caja, cajas_por_camada, numero_camadas, cajas_por_camita, camitas_por_paleta, volumen_caja_m3, volumen_total_m3, permite_puchos, notas_armado, imagen_armado_path, largo_caja_cm, ancho_caja_cm, alto_caja_cm, peso_caja_kg)'
              )
              .eq('id_producto', viewingProduct.id_producto)
              .single()
            if (data) setViewingProduct(data as unknown as Product)
          }
        }}
      />
    </section>
  )
}
