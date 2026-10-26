-- Migración: 202609020022_modos_manejo_catalogo_y_serializado.sql
-- Propósito: Implementar arquitectura abierta/cerrada para modos de manejo de productos.
--            Soporte para catálogo modo_manejo, perfil_serializado, unidad_serializada
--            y trigger de integridad para regla_empaque.

BEGIN;

-- ============================================================================
-- 1. Catálogo de Modos de Manejo (Extensible sin ENUM)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.modo_manejo (
  codigo VARCHAR(30) PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  requiere_regla_empaque BOOLEAN NOT NULL DEFAULT false,
  requiere_serie BOOLEAN NOT NULL DEFAULT false,
  permite_puchos BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Semillas iniciales del catálogo
INSERT INTO public.modo_manejo (codigo, nombre, descripcion, requiere_regla_empaque, requiere_serie, permite_puchos, activo)
VALUES
  ('PALETIZADO', 'Paletizado estándar', 'Carga organizada en cajas y estibas paletizadas con regla de empaque', true, false, true, true),
  ('SERIALIZADO', 'Serializado unitario', 'Equipos y maquinaria identificados unitariamente por número de serie y RFID individual', false, true, false, true),
  ('GRANEL', 'Carga a granel', 'Control continuo por peso o volumen', false, false, false, false),
  ('LOTE', 'Control por lote y caducidad', 'Trazabilidad por lote de fabricación y fecha de vencimiento (FEFO)', false, false, false, false),
  ('LARGO', 'Perfiles y carga larga', 'Almacenamiento en estantería cantilever por metros lineales', false, false, false, false),
  ('PICKING_CAJA', 'Picking por caja', 'Control unitario por cajas individuales sin paleta', false, false, false, false),
  ('PESO_VARIABLE', 'Carga de peso variable', 'Doble unidad: bultos y pesaje real en báscula', false, false, false, false),
  ('PERECEDERO', 'Perecedero refrigerado', 'Control de temperatura y cadena de frío', false, false, false, false),
  ('PELIGROSO', 'Material peligroso (HazMat)', 'Clasificación IMO/ONU y segregación de seguridad', false, false, false, false)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  requiere_regla_empaque = EXCLUDED.requiere_regla_empaque,
  requiere_serie = EXCLUDED.requiere_serie,
  permite_puchos = EXCLUDED.permite_puchos,
  activo = EXCLUDED.activo;

-- ============================================================================
-- 2. Vínculo Categoría - Modo de Manejo (Retrocompatible con PALETIZADO)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'categoria' AND column_name = 'modo_manejo'
  ) THEN
    ALTER TABLE public.categoria 
      ADD COLUMN modo_manejo VARCHAR(30) NOT NULL DEFAULT 'PALETIZADO' 
      REFERENCES public.modo_manejo(codigo) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_categoria_modo_manejo ON public.categoria(modo_manejo);

-- ============================================================================
-- 3. Perfil Serializado (Class-Table Inheritance para Maquinaria / Equipos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.perfil_serializado (
  id_producto BIGINT PRIMARY KEY REFERENCES public.producto(id_producto) ON DELETE CASCADE,
  peso_unitario_kg NUMERIC(10,2) CHECK (peso_unitario_kg IS NULL OR peso_unitario_kg > 0),
  largo_cm NUMERIC(10,2) CHECK (largo_cm IS NULL OR largo_cm > 0),
  ancho_cm NUMERIC(10,2) CHECK (ancho_cm IS NULL OR ancho_cm > 0),
  alto_cm NUMERIC(10,2) CHECK (alto_cm IS NULL OR alto_cm > 0),
  requiere_equipo_izaje BOOLEAN NOT NULL DEFAULT false,
  ubicacion_permitida VARCHAR(20) NOT NULL DEFAULT 'AMBAS' CHECK (ubicacion_permitida IN ('CAMPO', 'RACK', 'AMBAS')),
  atributos JSONB NOT NULL DEFAULT '{}'::jsonb,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. Unidad Serializada (Instancias Físicas Únicas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.unidad_serializada (
  id_unidad BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_producto BIGINT NOT NULL REFERENCES public.producto(id_producto) ON DELETE CASCADE,
  numero_serie VARCHAR(100) NOT NULL,
  id_etiqueta BIGINT UNIQUE REFERENCES public.etiqueta_rfid(id_etiqueta) ON DELETE SET NULL,
  id_almacen BIGINT REFERENCES public.almacen(id_almacen) ON DELETE SET NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'DISPONIBLE' CHECK (estado IN ('DISPONIBLE', 'EN_MANTENIMIENTO', 'DESPACHADA', 'BAJA')),
  fecha_ingreso TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_unidad_serializada_prod_serie UNIQUE (id_producto, numero_serie)
);

CREATE INDEX IF NOT EXISTS idx_unidad_serializada_producto ON public.unidad_serializada(id_producto);
CREATE INDEX IF NOT EXISTS idx_unidad_serializada_etiqueta ON public.unidad_serializada(id_etiqueta);
CREATE INDEX IF NOT EXISTS idx_unidad_serializada_estado ON public.unidad_serializada(estado);
CREATE INDEX IF NOT EXISTS idx_unidad_serializada_almacen ON public.unidad_serializada(id_almacen);

-- ============================================================================
-- 5. Trigger de Integridad: Impedir regla_empaque si el modo no lo requiere
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_validar_regla_empaque_modo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_requiere_empaque BOOLEAN;
  v_modo VARCHAR(30);
BEGIN
  SELECT m.requiere_regla_empaque, c.modo_manejo
  INTO v_requiere_empaque, v_modo
  FROM public.producto p
  JOIN public.categoria c ON c.id_categoria = p.id_categoria
  JOIN public.modo_manejo m ON m.codigo = c.modo_manejo
  WHERE p.id_producto = NEW.id_producto;

  IF FOUND AND v_requiere_empaque = false THEN
    RAISE EXCEPTION 'No se puede asociar regla de empaque al producto ID %: su categoría tiene modo de manejo "%" que no permite empaque paletizado.',
      NEW.id_producto, v_modo;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_regla_empaque_modo ON public.regla_empaque;
CREATE TRIGGER trg_validar_regla_empaque_modo
BEFORE INSERT OR UPDATE ON public.regla_empaque
FOR EACH ROW
EXECUTE FUNCTION public.fn_validar_regla_empaque_modo();

-- ============================================================================
-- 6. Seguridad RLS y Permisos Granulares
-- ============================================================================
ALTER TABLE public.modo_manejo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_serializado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidad_serializada ENABLE ROW LEVEL SECURITY;

-- Políticas para modo_manejo
DROP POLICY IF EXISTS "modo_manejo: lectura autenticada" ON public.modo_manejo;
CREATE POLICY "modo_manejo: lectura autenticada" ON public.modo_manejo
  FOR SELECT TO authenticated
  USING (public.tiene_rol(ARRAY['ADMINISTRADOR', 'COMPRADOR', 'OPERARIO', 'AUDITOR']));

DROP POLICY IF EXISTS "modo_manejo: gestion administrador y comprador" ON public.modo_manejo;
CREATE POLICY "modo_manejo: gestion administrador y comprador" ON public.modo_manejo
  FOR ALL TO authenticated
  USING (public.tiene_rol(ARRAY['ADMINISTRADOR', 'COMPRADOR']))
  WITH CHECK (public.tiene_rol(ARRAY['ADMINISTRADOR', 'COMPRADOR']));

-- Políticas para perfil_serializado
DROP POLICY IF EXISTS "perfil_serializado: lectura autenticada" ON public.perfil_serializado;
CREATE POLICY "perfil_serializado: lectura autenticada" ON public.perfil_serializado
  FOR SELECT TO authenticated
  USING (public.tiene_rol(ARRAY['ADMINISTRADOR', 'COMPRADOR', 'OPERARIO', 'AUDITOR']));

DROP POLICY IF EXISTS "perfil_serializado: gestion administrador y comprador" ON public.perfil_serializado;
CREATE POLICY "perfil_serializado: gestion administrador y comprador" ON public.perfil_serializado
  FOR ALL TO authenticated
  USING (public.tiene_rol(ARRAY['ADMINISTRADOR', 'COMPRADOR']))
  WITH CHECK (public.tiene_rol(ARRAY['ADMINISTRADOR', 'COMPRADOR']));

-- Políticas para unidad_serializada
DROP POLICY IF EXISTS "unidad_serializada: lectura autenticada" ON public.unidad_serializada;
CREATE POLICY "unidad_serializada: lectura autenticada" ON public.unidad_serializada
  FOR SELECT TO authenticated
  USING (public.tiene_rol(ARRAY['ADMINISTRADOR', 'COMPRADOR', 'OPERARIO', 'AUDITOR']));

DROP POLICY IF EXISTS "unidad_serializada: gestion administrador y operario" ON public.unidad_serializada;
CREATE POLICY "unidad_serializada: gestion administrador y operario" ON public.unidad_serializada
  FOR ALL TO authenticated
  USING (public.tiene_rol(ARRAY['ADMINISTRADOR', 'OPERARIO']))
  WITH CHECK (public.tiene_rol(ARRAY['ADMINISTRADOR', 'OPERARIO']));

-- Revocar accesos públicos/anónimos
REVOKE ALL ON public.modo_manejo FROM anon, public;
REVOKE ALL ON public.perfil_serializado FROM anon, public;
REVOKE ALL ON public.unidad_serializada FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.fn_validar_regla_empaque_modo() FROM anon, public;

-- Otorgar accesos a roles autenticados (gobernados por RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modo_manejo TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.perfil_serializado TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidad_serializada TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validar_regla_empaque_modo() TO authenticated;

COMMIT;
