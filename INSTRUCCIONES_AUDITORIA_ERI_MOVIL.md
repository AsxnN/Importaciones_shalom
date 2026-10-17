# Especificación e Instrucciones de Implementación: Módulo de Auditorías ERI en Shalom Móvil

> **Documento de Instrucciones para el Asistente / CLI de `shalom_movil`**  
> **Fecha:** 2026-10-14  
> **Repositorio Destino:** `/home/ludam/Importaciones/shalom_movil`  
> **Framework:** Expo 57 / React Native (TypeScript)  
> **Pantalla a Implementar:** `src/screens/ConteoMasivoScreen.tsx` (accesible en `currentScreen === 'MOD_4_AUDITORIA'`)

---

## 1. Contexto y Requerimiento Operativo

En el panel web (`Importaciones_shalom`) se configuran los almacenes físicos, los **Racks Drive-In** (con carriles y niveles asimétricos donde cada nivel tiene su propia profundidad de cola) y la **Zona de Campo / Piso Libre** para bultos sobredimensionados. Cada paleta física tiene asignada su celda (`C01-N02-P01` o `ALM-CAMPO`) y su tag RFID / código de barras.

**Las auditorías físicas NO se realizan en la web, se realizan en la App Móvil (`shalom_movil`)** en el piso del almacén.

El operario debe auditar **producto por producto (SKU a SKU)** para evitar sobrecargar la memoria de la terminal móvil y mantener la app ultra-rápida.

---

## 2. Flujo de Navegación y Experiencia de Usuario (UI/UX Móvil)

El flujo se compone de **dos vistas principales** dentro de `src/screens/ConteoMasivoScreen.tsx`:

```
[ PANTALLA A: LISTA GENERAL DE PRODUCTOS EN STOCK ]
   ├── Muestra todos los SKUs que tienen stock en el almacén activo
   ├── Estado Inicial: Todos los productos inician en 🔴 ROJO (Pendiente)
   ├── Al presionar un producto ──> Abre la PANTALLA B
   └── Botón inferior: "Guardar y finalizar auditoría"
         └── Si faltan productos por auditar ──> Alerta informativa pero PERMITE GUARDAR (Auditoría Parcial)

[ PANTALLA B: ESCANEO Y VERIFICACIÓN DEL PRODUCTO ]
   ├── Cabecera con SKU, Nombre y botón "← Volver a productos"
   ├── Contador de progreso (ej. 2 de 5 paletas)
   ├── Lista de paletas esperadas para ese producto:
   │     ├── Código de ubicación física (ej. C01-N02-P01 en Rack o ZONA CAMPO)
   │     ├── UID RFID y Código de barras
   │     └── Semáforo de la paleta: 🔴 ROJO (Pendiente) ──> 🟢 VERDE (Escaneada)
   ├── Escaneo dual:
   │     ├── Sensor NFC integrado (acercar el celular a la paleta)
   │     └── Cámara / Lector de barras (BarcodeScannerModal)
   │     └── Al leer, emite vibración (hapticSuccess) y cambia la paleta a 🟢 VERDE
   └── Al completar todas las paletas del SKU:
         ├── Modal obligatorio: Escribir NOTA DE CONFIRMACIÓN (ej. "Mercancía en orden, estiba conforme")
         └── Al confirmar, el producto cambia a 🟢 VERDE en la Pantalla A y regresa a la lista
```

---

## 3. Esquema de Base de Datos (Supabase) a Consumir

Las tablas ya están creadas en la migración `202609020011_modulo2_modulo5_racks_ubicaciones_auditorias.sql`:

1. **`public.etiqueta_rfid`**:
   - `id_etiqueta`, `uid_tag`, `codigo_barras`, `id_producto`, `id_almacen_actual`, `id_celda`, `tipo_paleta`, `cantidad_paquetes`, `estado`.
2. **`public.celda_rack`**:
   - `id_celda`, `id_almacen`, `tipo_ubicacion` ('RACK' | 'CAMPO'), `codigo_ubicacion`, `posicion_fondo`.
3. **`public.auditoria_sesion`**:
   - `id_auditoria`, `id_almacen`, `id_usuario`, `fecha_inicio`, `fecha_fin`, `estado` ('EN_PROCESO', 'PARCIAL', 'COMPLETADA'), `total_productos`, `productos_auditados`, `paletas_esperadas`, `paletas_auditadas`, `porcentaje_eri`, `observaciones`.
4. **`public.auditoria_sesion_producto`**:
   - `id_auditoria_prod`, `id_auditoria`, `id_producto`, `paletas_esperadas`, `paletas_leidas`, `estado` ('PENDIENTE', 'AUDITADO'), `nota_confirmacion`, `fecha_confirmacion`.
5. **`public.auditoria_sesion_lectura`**:
   - `id_lectura`, `id_auditoria`, `id_auditoria_prod`, `id_etiqueta`, `id_producto`, `id_celda`, `codigo_ubicacion_esperada`, `leido`, `metodo_lectura` ('RFID', 'CODIGO_BARRAS'), `fecha_lectura`.

---

## 4. Tareas Específicas a Ejecutar en `shalom_movil`

### Tarea 1: Ampliar Tipos en `src/types/index.ts`
Agregar las interfaces correspondientes a la auditoría táctica:

```typescript
export interface PaletaAuditoriaMovil {
  id_etiqueta: number;
  uid_tag: string;
  codigo_barras?: string | null;
  id_producto: number;
  codigo_ubicacion: string; // ej. "C01-N02-P01" o "ALM1-CAMPO"
  tipo_ubicacion: 'RACK' | 'CAMPO';
  tipo_paleta: 'COMPLETO' | 'PUCHO';
  cantidad_paquetes: number;
  leido: boolean;
  metodo_lectura?: 'RFID' | 'CODIGO_BARRAS' | 'MANUAL';
  fecha_lectura?: string;
}

export interface ProductoAuditoriaMovil {
  id_producto: number;
  sku: string;
  nombre: string;
  paletas_esperadas: number;
  paletas_leidas: number;
  estado: 'PENDIENTE' | 'AUDITADO';
  nota_confirmacion?: string;
  fecha_confirmacion?: string;
  paletas: PaletaAuditoriaMovil[];
}
```

### Tarea 2: Crear `src/services/auditoriaService.ts`
Crear el servicio que consulta las existencias del almacén y sincroniza la sesión:

1. **`obtenerProductosParaAuditoria(id_almacen: number): Promise<ProductoAuditoriaMovil[]>`**:
   - Consulta `etiqueta_rfid` donde `id_almacen_actual = id_almacen` y `estado = 'ACTIVA'`.
   - Hace join con `producto(sku, nombre)` y `celda_rack(codigo_ubicacion, tipo_ubicacion)`.
   - Agrupa las paletas por producto.
   - Cada producto inicia con `estado: 'PENDIENTE'` (semáforo en rojo).
   - Incluye fallback táctico local (mock) si el dispositivo no tiene red.
2. **`guardarSesionAuditoria(id_almacen: number, productos: ProductoAuditoriaMovil[], observaciones?: string): Promise<{ ok: boolean, parcial: boolean }>`**:
   - Calcula si todos los productos están auditados (`COMPLETADA`) o si faltan algunos (`PARCIAL`).
   - Inserta en `auditoria_sesion`, `auditoria_sesion_producto` y `auditoria_sesion_lectura`.
   - Si no hay red, guarda en `TransaccionOffline` con `tipo_operacion: 'AUDITORIA_ERI'` para sincronización automática posterior.

### Tarea 3: Implementar `src/screens/ConteoMasivoScreen.tsx`
Reemplazar el prototipo de barrido masivo ciego por la pantalla definitiva de **Auditoría ERI por Producto**:

1. **Tokens de Diseño de `skill_design_shalom.md`:**
   - Usar `colors.canvas` (`#F2F6F8`), `colors.surface` (`#FFFFFF`), `colors.brandDeep` (`#123D4A`), `colors.brand` (`#167D8D`).
   - Semáforos: `colors.danger` (`#B3402A`) para 🔴 **Rojo (Pendiente)** y `colors.success` (`#2F7D4F`) para 🟢 **Verde (Auditado / Verificado)**.
   - `colors.warning` (`#BC791F`) para la badge de `ZONA CAMPO`.
2. **Escaneo NFC en Tiempo Real:**
   - Usar `react-native-nfc-manager` (o el servicio `nfcService` ya existente en `shalom_movil`).
   - Al detectar un tag en la Pantalla B, buscar si coincide con alguna paleta de ese producto. Si coincide, emitir `hapticSuccess()`, pasar la paleta a verde y actualizar el contador.
3. **Escaneo por Código de Barras:**
   - Integrar `BarcodeScannerModal` existente. Al escanear, validar contra `codigo_barras` o `uid_tag`.
4. **Modal de Nota Obligatoria:**
   - Un modal elegante con `TextInput` multilinea que se abre cuando todas las paletas del producto están en verde.
   - Botón primario: *"Confirmar y Marcar Producto como AUDITADO"*.
5. **Guardado Parcial con Alerta:**
   - Si se presiona *"Guardar y finalizar auditoría"* y hay productos en rojo, mostrar `Alert.alert`:
     *"Atención: Faltan X producto(s) por auditar. La auditoría se guardará con estado PARCIAL con la fecha de hoy. ¿Deseas continuar?"*
     - Botones: `Cancelar` y `Guardar Parcial`.

---

## 5. Instrucción Directa para el CLI de `shalom_movil`

Puedes copiar y pegar esta orden directamente en el terminal del CLI de `shalom_movil`:

```bash
# Mensaje para el CLI de shalom_movil:
"Por favor lee el archivo INSTRUCCIONES_AUDITORIA_ERI_MOVIL.md e implementa de inmediato el Módulo 4 de Auditoría ERI en src/screens/ConteoMasivoScreen.tsx y sus servicios asociados, siguiendo exactamente el flujo de producto por producto con semáforo Rojo/Verde, escaneo NFC/código de barras, nota obligatoria por SKU y guardado con fecha en Supabase/cola offline."
```
