import { useEffect, useState } from 'react'
import { ProductDetailModal } from './products/ProductDetailModal'
import { categoriaRepository } from './products/repositories/CategoryRepository'
import { productoRepository } from './products/repositories/ProductRepository'
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
    try {
      const data = await categoriaRepository.obtenerTodas()
      setCategories(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar categorías.'
      setError(msg)
    } finally {
      setLoadingCategories(false)
    }
  }

  async function loadProducts() {
    setLoadingProducts(true)
    try {
      const data = await productoRepository.obtenerTodos()
      setProducts(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar productos.'
      setError(msg)
    } finally {
      setLoadingProducts(false)
    }
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
          <button className="link-back" type="button" onClick={onBack}>
            <span aria-hidden="true">‹</span> Volver al panel principal
          </button>
          <div className="view-title-row">
            <h2>Maestros y empaque</h2>
            <span className="module-code-badge">MOD-01</span>
          </div>
          <p className="page-lead">
            Gestión unificada de productos, modos de manejo (paletizado y serializado), especificaciones técnicas, categorías y proveedores.
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
          Productos y empaque
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

      {/* Modal / Ficha Técnica Consolidada */}
      <ProductDetailModal
        product={viewingProduct}
        onClose={() => setViewingProduct(null)}
        onPackagingUpdated={async () => {
          await loadProducts()
          if (viewingProduct) {
            const updated = await productoRepository.obtenerPorId(viewingProduct.id_producto)
            if (updated) setViewingProduct(updated)
          }
        }}
      />
    </section>
  )
}
