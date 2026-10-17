-- ==============================================================================
-- SCRIPT SQL: LIBERAR TODAS LAS PALETAS DE TODOS LOS CARRILES DE UN ALMACÉN
-- Proyecto: Shalom - Importaciones Shalom
-- Base de Datos: Supabase (PostgreSQL 15+)
-- ==============================================================================
-- Descripción:
--   Desasigna (pone id_celda = NULL) todas las paletas que estén ocupando celdas
--   (carriles Drive-In o Zona Campo) en un almacén en específico.
--
-- REGLA DE SEGURIDAD (CERO DELETE):
--   - NO elimina las paletas de la tabla 'etiqueta_rfid'.
--   - NO elimina el stock contable de la tabla 'inventario'.
--   - NO modifica el historial del 'kardex' / 'movimiento'.
--   - Simplemente libera las casillas/celdas físicas para dejarlas disponibles,
--     y las paletas quedan en estado libre en dicho almacén para reubicar.
-- ==============================================================================

-- ==============================================================================
-- OPCIÓN 1: BLOQUE ANÓNIMO SEGURO CON VALIDACIÓN Y MENSAJE DE RESULTADO (RECOMENDADO)
-- ==============================================================================

DO $$
DECLARE
  -- ============================================================================
  -- ✏️ PASO ÚNICO: MODIFICA EL NOMBRE DEL ALMACÉN ENTRE COMILLAS SIMPLES:
  -- ============================================================================
  v_nombre_almacen TEXT := 'Almacén Principal'; -- 👈👈 ESCRIBE AQUÍ EL NOMBRE DE TU ALMACÉN
  -- ============================================================================
  -- Ejemplos válidos según tu sistema:
  --   'Almacén Principal'
  --   'Tienda Central'
  --   'Almacén Merma'
  -- ============================================================================

  v_id_almacen INT;
  v_paletas_liberadas INT := 0;
  v_celdas_totales INT := 0;
BEGIN
  -- 1. Buscar el ID del almacén por nombre ignorando mayúsculas/minúsculas y espacios
  SELECT id_almacen INTO v_id_almacen
  FROM public.almacen
  WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(v_nombre_almacen))
  LIMIT 1;

  -- 2. Si el almacén no existe, lanzar error explicativo
  IF v_id_almacen IS NULL THEN
    RAISE EXCEPTION '❌ Error: No se encontró ningún almacén con el nombre "%". Verifica la lista en la tabla "almacen".', v_nombre_almacen;
  END IF;

  -- 3. Contar cuántas celdas físicas existen en este almacén
  SELECT COUNT(*) INTO v_celdas_totales
  FROM public.celda_rack
  WHERE id_almacen = v_id_almacen;

  -- 4. Liberar todas las paletas asignadas a cualquier celda de este almacén
  WITH liberadas AS (
    UPDATE public.etiqueta_rfid
    SET id_celda = NULL
    WHERE (
      id_almacen_actual = v_id_almacen 
      OR id_celda IN (SELECT c.id_celda FROM public.celda_rack c WHERE c.id_almacen = v_id_almacen)
    )
    AND id_celda IS NOT NULL
    RETURNING id_etiqueta
  )
  SELECT COUNT(*) INTO v_paletas_liberadas FROM liberadas;

  -- 5. Imprimir resumen de la operación en la consola de Supabase
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '✅ Operación completada con éxito:';
  RAISE NOTICE '   Almacén: "%" (ID: %)', v_nombre_almacen, v_id_almacen;
  RAISE NOTICE '   Total celdas físicas del almacén: %', v_celdas_totales;
  RAISE NOTICE '   Paletas desasignadas / celdas vaciadas: %', v_paletas_liberadas;
  RAISE NOTICE '   Las paletas permanecen intactas en inventario como "sin ubicar".';
  RAISE NOTICE '------------------------------------------------------------';
END $$;


-- ==============================================================================
-- OPCIÓN 2: CONSULTA DIRECTA SIMPLE (UPDATE DIRECTO)
-- ==============================================================================
-- Si prefieres ejecutar una sola línea sin bloques DO/DECLARE:
/*
UPDATE public.etiqueta_rfid
SET id_celda = NULL
WHERE id_celda IN (
  SELECT c.id_celda
  FROM public.celda_rack c
  JOIN public.almacen a ON a.id_almacen = c.id_almacen
  WHERE a.nombre = 'Almacén Principal' -- 👈👈 ESCRIBE AQUÍ EL NOMBRE DE TU ALMACÉN
);
*/
