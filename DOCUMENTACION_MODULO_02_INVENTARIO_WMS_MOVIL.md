# Documentación Técnica: Módulo 02 (Inventario, Almacenes, Paletizado y Racks WMS)

> **Documento Maestro de Arquitectura y Datos para Desarrolladores y Agentes IA**  
> **Aplica a:** Web WMS (`Importaciones_shalom`) y App Móvil de Almacén (`shalom_movil`)  
> **Fecha de Actualización:** 2026-10-14  
> **Módulo:** MOD-02 — Inventario, Almacenes, Racks Drive-In y Kardex  
> **Fuente de Verdad de BD:** `BD_shalom.md` y `mejoras_recomendadas.md`

---

## 1. Resumen Ejecutivo y Propósito

El **Módulo 02** administra la infraestructura física de almacenamiento, las existencias contables por almacén y el inventario físico unitario de **Paletas con Identificación RFID** y **Puchos (cajas sueltas)**.

### Reglas de Oro y Principios Arquitectónicos
1. **Regla de Consistencia Logística (1:1):**
   - Una paleta física activa con Tag RFID en el almacén representa stock real disponible.
   - Al registrar una paleta, sus unidades se suman automáticamente a `inventario.stock_real` y se asientan en el Kardex (`movimiento`).
   - Al retirar o dar de baja una paleta, sus unidades se restan de `inventario.stock_real` y se asientan en el Kardex con `tipo_movimiento = 'RETIRO_PARCIAL'` o `'DESPACHO_COMPLETO'`.
2. **Ciclo de Vida del Tag RFID (Las Paletas NUNCA se eliminan con DELETE):**
   - El estado de la etiqueta RFID se rige estrictamente por el enum `etiqueta_estado`:
     - `'ACTIVA'`: Paleta en uso físico en un almacén.
     - `'VACIA'`: Paleta consumida, despachada o dada de baja. El tag queda libre para reutilización física.
     - `'EXTRAVIADA'`: Paleta no localizada físicamente en auditorías.
   - **Dar de baja:** Se ejecuta mediante la función RPC `dar_baja_etiqueta_rfid(p_uid_tag, p_motivo)`. Transiciona a `'VACIA'`, pone `id_almacen_actual = NULL`, `id_celda = NULL`, `cantidad_paquetes = 0`, resta las unidades de `inventario.stock_real` y preserva la trazabilidad histórica en `movimiento` y `recepcion_lectura`.
   - **Reutilización:** Cuando un tag `'VACIA'` se vuelve a utilizar para una nueva carga, se hace un `UPDATE` a `'ACTIVA'` asignándole el nuevo almacén, producto y paquetes (nunca un `DELETE` ni duplicado de UID).
3. **Pertenencia Estricta a un Único Almacén:**
   - Una paleta activa solo puede pertenecer a un almacén a la vez (`id_almacen_actual`).
   - Los códigos RFID siguen el formato oficial: `[PREFIJO_ALMACEN][5 DIGITOS]` (ej. `ALMPRI00001`, `TIECEN00001`, `MER00001`).
   - El prefijo se almacena en `almacen.prefijo_rfid` y la numeración se gestiona mediante la tabla `secuencia_rfid`.
4. **Regla de Pucho Único por SKU:**
   - Solo se permite **UNA (1)** paleta tipo `PUCHO` activa por cada producto (`id_producto`) dentro del mismo almacén.
   - En la base de datos esto está reforzado mediante el índice único condicional:  
     `idx_pucho_unico_por_producto ON etiqueta_rfid (id_almacen_actual, id_producto) WHERE tipo_paleta = 'PUCHO' AND estado = 'ACTIVA'`.
5. **Conteo Oficial de Paletas:**
   - La cantidad oficial de paletas completas y puchos proviene estrictamente de la vista `v_conteo_paletas_almacen` (o conteo directo de `etiqueta_rfid WHERE estado = 'ACTIVA'`), **nunca** de una división matemática teórica de `inventario.stock_real`.

---

## 2. Diferencia de Operación: Web WMS vs App Móvil (`shalom_movil`)

| Dimensión | Sistema Web WMS (`Importaciones_shalom`) | App Móvil (`shalom_movil`) |
| :--- | :--- | :--- |
| **Entorno de Uso** | Terminal de escritorio / Oficina de logística / Garita | Piso de almacén / Montacarguista / Operario de pasillo |
| **Lectura de Tag RFID** | **Ingreso Manual o Pistola USB**: El usuario ingresa a mano el código o presiona **"⚡ Sugerir"** para generar el siguiente código secuencial del almacén (`[PREFIJO][5 DIGITOS]`). Si cuenta con lector USB emulador de teclado, la lectura llena el campo automáticamente. | **Sensor NFC Nativo / Lector Hardware**: El operario acerca la parte posterior del smartphone o terminal industrial Android (ISO/IEC 14443A) directamente al tag de la paleta. |
| **Lectura de Código de Barras** | Campo de texto manual / Pistola USB | Modal con cámara integrada (`BarcodeScannerModal`) o escáner láser hardware integrado (Honeywell/Zebra). |
| **Auditorías Físicas (ERI)** | Visualización de reportes históricos y conciliación. | **Ejecución táctica SKU por SKU** mediante escaneo dual (NFC + Código de barras). |
| **Baja y Transferencia** | Subvista de Paletas con botones para dar de baja (`dar_baja_etiqueta_rfid`) y transferir a otra sede (`transferir_carga_entre_almacenes`). | Registro rápido de baja por daño o lectura de despacho. |

---

## 3. Esquema de Base de Datos y Tipos Oficiales

### Enums Oficiales de PostgreSQL
```sql
-- Estado de la etiqueta RFID
CREATE TYPE etiqueta_estado AS ENUM ('ACTIVA', 'VACIA', 'EXTRAVIADA');

-- Tipo de paleta física
CREATE TYPE tipo_paleta_enum AS ENUM ('COMPLETO', 'PUCHO');

-- Tipo de movimiento en Kardex
CREATE TYPE movimiento_tipo AS ENUM (
    'INGRESO_COMPLETO',
    'INGRESO_PUCHO',
    'DESPACHO_COMPLETO',
    'RETIRO_PARCIAL'
);
```

> [!CAUTION]
> **Valores no permitidos:**  
> - Para `etiqueta_rfid.estado`: NUNCA usar `'ACTIVO'`, `'BAJA'`, `'INACTIVA'`, `'AUDITADO'`. Solo `'ACTIVA'`, `'VACIA'`, `'EXTRAVIADA'`.  
> - Para `movimiento.tipo_movimiento`: NUNCA usar `'ENTRADA'`, `'SALIDA'`, `'AJUSTE'`. Solo `'INGRESO_COMPLETO'`, `'INGRESO_PUCHO'`, `'DESPACHO_COMPLETO'`, `'RETIRO_PARCIAL'`.  
> - Para `movimiento.cantidad_afectada`: La BD tiene `CHECK (cantidad_afectada > 0)`. NUNCA enviar valores negativos ni 0.

### Tablas Principales de Módulo 02

#### 1. `public.almacen`
- `id_almacen` (SERIAL, PK)
- `nombre` (TEXT): Nombre descriptivo (ej. "Almacén Principal Callao", "Tienda Central").
- `tipo` (TEXT): `'PRINCIPAL'`, `'TIENDA'`, `'MERMA'`.
- `capacidad_m3` (NUMERIC): Capacidad cúbica nominal máxima.
- `prefijo_rfid` (VARCHAR(10), UNIQUE): Prefijo oficial de 3 a 6 caracteres alfanuméricos (ej. `ALMPRI`, `TIECEN`, `MER`).
- `activo` (BOOLEAN): Estado operativo del almacén.

#### 2. `public.secuencia_rfid`
- `id_almacen` (INT, PK, FK -> `almacen.id_almacen`)
- `ultimo_numero` (INT DEFAULT 0): Contador secuencial para la generación de tags `[PREFIJO][5 DIGITOS]`.
- `updated_at` (TIMESTAMPTZ)

#### 3. `public.etiqueta_rfid`
- `id_etiqueta` (SERIAL, PK)
- `uid_tag` (TEXT, UNIQUE): Código RFID oficial (ej. `ALMPRI00001` o UID hexadecimal).
- `codigo_barras` (TEXT, opcional): LPN o identificador logístico secundario.
- `id_producto` (INT, FK -> `producto`)
- `id_almacen_actual` (INT, Nullable cuando está `'VACIA'`, FK -> `almacen`)
- `id_celda` (INT, Nullable, FK -> `celda_rack`)
- `tipo_paleta` (`tipo_paleta_enum`): `'COMPLETO'` o `'PUCHO'`.
- `cantidad_paquetes` (INT): Cantidad de cajas en la paleta (para `COMPLETO`, igual a `regla_empaque.cajas_por_paleta`).
- `estado` (`etiqueta_estado`): `'ACTIVA'`, `'VACIA'`, `'EXTRAVIADA'`.
- Restricción única: Máximo 1 `PUCHO` activo por `(id_almacen_actual, id_producto)`.

#### 4. `public.inventario`
- `id_inventario` (SERIAL, PK)
- `id_almacen` (INT, FK -> `almacen`)
- `id_producto` (INT, FK -> `producto`)
- `stock_real` (NUMERIC >= 0): Total de unidades mínimas disponibles.
- `stock_minimo` (NUMERIC >= 0): Umbral de seguridad.
- `estado_semaforo` (TEXT): `'VERDE'`, `'AMARILLO'`, `'ROJO'`.

#### 5. `public.movimiento` (Kardex)
- `id_movimiento` (SERIAL, PK)
- `id_almacen` (INT, FK -> `almacen`)
- `id_producto` (INT, FK -> `producto`)
- `tipo_movimiento` (`movimiento_tipo`): `'INGRESO_COMPLETO'`, `'INGRESO_PUCHO'`, `'DESPACHO_COMPLETO'`, `'RETIRO_PARCIAL'`.
- `cantidad_afectada` (NUMERIC > 0): Unidades modificadas (siempre valor positivo).
- `saldo_anterior` (NUMERIC >= 0)
- `saldo_nuevo` (NUMERIC >= 0)
- `motivo` (TEXT)
- `fecha` (TIMESTAMPTZ DEFAULT now())

#### 6. `public.alerta_sistema`
- `id_alerta` (SERIAL, PK)
- `tipo` (VARCHAR(50)): Ej. `'PUCHO_COMPLETADO'`, `'TRANSFERENCIA_DESCUADRE'`.
- `id_almacen` (INT, Nullable, FK -> `almacen`)
- `id_producto` (INT, Nullable, FK -> `producto`)
- `id_etiqueta` (INT, Nullable, FK -> `etiqueta_rfid`)
- `mensaje` (TEXT): Descripción legible para el operador en piso.
- `resuelta` (BOOLEAN DEFAULT false)
- `created_at` (TIMESTAMPTZ)

#### 7. `public.v_conteo_paletas_almacen` (Vista de Conteo)
Consolida el conteo físico real de paletas activas agrupadas por almacén y producto:
```sql
SELECT 
    id_almacen_actual AS id_almacen,
    id_producto,
    COUNT(*) FILTER (WHERE tipo_paleta = 'COMPLETO') AS paletas_completas,
    COUNT(*) FILTER (WHERE tipo_paleta = 'PUCHO') AS puchos,
    COUNT(*) AS total_paletas_activas
FROM public.etiqueta_rfid
WHERE estado = 'ACTIVA'
GROUP BY id_almacen_actual, id_producto;
```

---

## 4. Funciones RPC Almacenadas en Supabase

### 1. `dar_baja_etiqueta_rfid(p_uid_tag TEXT, p_motivo TEXT)`
- Valida que la etiqueta exista y esté `'ACTIVA'`.
- Calcula las unidades físicas según `cantidad_paquetes * unidades_por_caja`.
- Si estaba en un rack, libera la celda (`celda_rack.ocupada = false`).
- Actualiza la etiqueta: `estado = 'VACIA'`, `id_almacen_actual = NULL`, `id_celda = NULL`, `cantidad_paquetes = 0`.
- Descuenta las unidades de `inventario.stock_real`.
- Inserta el registro en `movimiento` (`RETIRO_PARCIAL` o `DESPACHO_COMPLETO`).
- Devuelve `JSON` con confirmación, unidades descontadas y nuevo stock.

### 2. `transferir_carga_entre_almacenes(...)`
- Transfiere carga entre dos almacenes de forma atómica:
  - Cierra la etiqueta en el almacén de origen poniéndola en `'VACIA'`.
  - Descuenta el stock en origen con Kardex `DESPACHO_COMPLETO` o `RETIRO_PARCIAL`.
  - Si el almacén de destino ya posee un pucho activo para ese SKU y se transfiere otro pucho:
    - Suma las cajas de ambos puchos.
    - Si completan una paleta estándar: crea una paleta `'COMPLETO'`, deja el remanente como único `'PUCHO'`, y genera una alerta en `alerta_sistema` (`PUCHO_COMPLETADO`).
  - Incrementa el stock en destino con Kardex `INGRESO_COMPLETO` o `INGRESO_PUCHO`.

---

## 5. Instrucciones Específicas para el Agente IA de `shalom_movil`

Cuando desarrolles funcionalidades de inventario y paletas en `/home/ludam/Importaciones/shalom_movil`:

1. **Lectura de Paletas por NFC:**
   - Al aproximar la terminal al tag, la antena captura el UID alfanumérico.
   - Consulta `public.etiqueta_rfid` mediante `.eq('uid_tag', uid)`.
   - Verifica que `estado === 'ACTIVA'`. Si está `'VACIA'`, informa que el tag físico está libre para asociarse a una nueva paleta.
2. **Creación de Paletas desde el Móvil:**
   - Si se escanea un tag no registrado o `'VACIA'`, permite asignarlo a un producto.
   - Respeta el formato de código si se asigna automáticamente: `[PREFIJO_ALMACEN][5 DIGITOS]`.
   - Si se crea un `PUCHO`, verifica que no exista otro pucho activo del mismo SKU en ese almacén. Si existe, la UI debe solicitar al usuario unificar las cajas en el pucho existente en lugar de crear un segundo pucho.
3. **Baja de Paleta en Móvil:**
   - Invoca siempre la RPC `dar_baja_etiqueta_rfid` en lugar de hacer `delete()` directo.
   - Esto garantiza que el stock contable y el Kardex queden cuadrados en el mismo instante.
4. **Auditoría ERI:**
   - En auditorías ciegas, consulta las paletas esperadas según `v_conteo_paletas_almacen` y `etiqueta_rfid WHERE estado = 'ACTIVA'`.
