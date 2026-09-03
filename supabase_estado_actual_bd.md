# Estado actual de la base de datos Supabase — "Importaciones shalom"

**project_id:** `pzsxzzfrwpamjkyyjodj`
**Región:** us-west-2
**Postgres:** 17.6.1.155
**Estado:** ACTIVE_HEALTHY

Este documento describe la estructura EXACTA (columnas, tipos, constraints, foreign keys) y los DATOS ACTUALES de cada tabla, más las políticas RLS ya creadas. Úsalo como fuente de verdad al generar código: no inventes nombres de columnas ni tipos distintos a los aquí listados.

---

## 1. Tablas de seguridad y usuarios

### `rol` — 4 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_rol | bigint (identity) | PK |
| nombre_rol | enum `rol_nombre` | ADMINISTRADOR, COMPRADOR, OPERARIO, AUDITOR — unique |
| descripcion | varchar | nullable |
| activo | boolean | default true |

**Datos actuales:**

```json
[
  {"id_rol":1,"nombre_rol":"ADMINISTRADOR","descripcion":"Control total del sistema","activo":true},
  {"id_rol":2,"nombre_rol":"COMPRADOR","descripcion":"Gestiona pedidos e importaciones","activo":true},
  {"id_rol":3,"nombre_rol":"OPERARIO","descripcion":"Ejecuta escaneo RFID y recepción","activo":true},
  {"id_rol":4,"nombre_rol":"AUDITOR","descripcion":"Realiza auditorías ERI y conciliación","activo":true}
]
```

### `permiso` — 0 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_permiso | bigint (identity) | PK |
| codigo_modulo | varchar | ej. "PRODUCTO", "INVENTARIO" |
| accion | enum `permiso_accion` | VER, CREAR, EDITAR, ELIMINAR |

### `rol_permiso` — 0 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_rol_permiso | bigint (identity) | PK |
| id_rol | bigint | FK -> rol.id_rol |
| id_permiso | bigint | FK -> permiso.id_permiso |

### `usuario` — 1 fila

| Columna | Tipo | Notas |
|---|---|---|
| id_usuario | bigint (identity) | PK |
| auth_user_id | uuid | FK lógico a auth.users.id, unique, nullable |
| nombre_completo | varchar | |
| codigo_operario | varchar | nullable, unique |
| correo | varchar | nullable |
| activo | boolean | default true |
| created_at | timestamptz | default now() |

**Datos actuales:**

```json
[
  {
    "id_usuario": 1,
    "auth_user_id": "aac3f88f-c1e8-42ae-97b3-1966365033c6",
    "nombre_completo": "Luan Minalaya",
    "codigo_operario": "001",
    "correo": "76601880@shalomcontrol.com",
    "activo": true,
    "created_at": "2026-09-02T05:28:28.263444+00:00"
  }
]
```

### `usuario_rol` — 1 fila

| Columna | Tipo | Notas |
|---|---|---|
| id_usuario_rol | bigint (identity) | PK |
| id_usuario | bigint | FK -> usuario.id_usuario |
| id_rol | bigint | FK -> rol.id_rol |
| fecha_asignacion | timestamptz | default now() |
| asignado_por | bigint | FK -> usuario.id_usuario, nullable |
| activo | boolean | default true |

**Datos actuales:**

```json
[
  {
    "id_usuario_rol": 1,
    "id_usuario": 1,
    "id_rol": 1,
    "fecha_asignacion": "2026-09-02T05:29:16.289053+00:00",
    "asignado_por": null,
    "activo": true
  }
]
```

**Resumen legible:** Luan Minalaya (usuario 1) tiene el rol ADMINISTRADOR (rol 1).

---

## 2. Maestros y empaque

### `categoria` — 2 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_categoria | bigint (identity) | PK |
| nombre | varchar | unique |
| descripcion | text | nullable |

**Datos actuales:**

```json
[
  {"id_categoria":1,"nombre":"SUMINISTRO","descripcion":"Insumos de empaque y embalaje"},
  {"id_categoria":2,"nombre":"VENTAS","descripcion":"Productos destinados a venta directa"}
]
```

### `producto` — 0 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_producto | bigint (identity) | PK |
| id_categoria | bigint | FK -> categoria.id_categoria, nullable |
| sku | varchar | unique |
| nombre | varchar | |
| unidad_medida | varchar | nullable |
| peso_unitario_kg | numeric | nullable |
| clasificacion_abc | char | nullable (A/B/C) |
| costo_unitario | numeric | nullable |
| activo | boolean | default true |
| created_at | timestamptz | default now() |

### `regla_empaque` — 0 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_empaque | bigint (identity) | PK |
| id_producto | bigint | FK -> producto.id_producto, unique |
| unidades_por_caja | integer | CHECK > 0 |
| cajas_por_camita | integer | CHECK > 0 |
| camitas_por_paleta | integer | CHECK > 0 |
| volumen_caja_m3 | numeric | nullable |
| volumen_total_m3 | numeric | nullable |

### `almacen` — 3 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_almacen | bigint (identity) | PK |
| nombre | varchar | unique |
| tipo | enum `almacen_tipo` | PRINCIPAL, TIENDA, MERMA — default PRINCIPAL |
| capacidad_m3 | numeric | nullable |
| activo | boolean | default true |

**Datos actuales:**

```json
[
  {"id_almacen":1,"nombre":"Almacén Principal","tipo":"PRINCIPAL","capacidad_m3":500,"activo":true},
  {"id_almacen":2,"nombre":"Tienda Central","tipo":"TIENDA","capacidad_m3":80,"activo":true},
  {"id_almacen":3,"nombre":"Mermas","tipo":"MERMA","capacidad_m3":20,"activo":true}
]
```

### `inventario` — 0 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_inventario | bigint (identity) | PK |
| id_producto | bigint | FK -> producto.id_producto |
| id_almacen | bigint | FK -> almacen.id_almacen |
| stock_real | numeric | default 0 |
| stock_minimo | numeric | default 0 |
| consumo_abs | numeric | default 0 |
| estado_semaforo | varchar | default 'VERDE' |
| fecha_quiebre_estimada | date | nullable |

---

## 3. Compras e importaciones

### `proveedor` — 0 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_proveedor | bigint (identity) | PK |
| razon_social | varchar | |
| calificacion_otif | numeric | nullable |
| tiempo_lead_time_dias | integer | nullable |
| activo | boolean | default true |

### `orden_importacion` — 0 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_orden | bigint (identity) | PK |
| numero_orden | varchar | unique |
| id_proveedor | bigint | FK -> proveedor.id_proveedor, nullable |
| estado | enum `orden_estado` | BORRADOR, TRANSITO, RECIBIDA — default BORRADOR |
| fecha_emision | date | nullable |
| tipo_contenedor | enum `contenedor_tipo` | 20FT, 40FT, LCL — nullable |
| volumen_ocupado_m3 | numeric | nullable |

### `detalle_orden` — 0 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_detalle | bigint (identity) | PK |
| id_orden | bigint | FK -> orden_importacion.id_orden |
| id_producto | bigint | FK -> producto.id_producto |
| cantidad_pedida | integer | |
| subtotal_peso_kg | numeric | nullable |
| subtotal_volumen_m3 | numeric | nullable |

---

## 4. RFID, dispositivos y recepción

### `dispositivo_iot` — 0 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_dispositivo | bigint (identity) | PK |
| mac_address | varchar | unique |
| ip_local | inet | nullable |
| nivel_bateria | integer | nullable |
| version_firmware | varchar | nullable |
| estado_red | enum `red_estado` | ONLINE, OFFLINE — default OFFLINE |
| id_almacen | bigint | FK -> almacen.id_almacen, nullable |
| ultimo_contacto | timestamptz | nullable |

### `etiqueta_rfid` — 0 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_etiqueta | bigint (identity) | PK |
| uid_tag | varchar | unique |
| id_producto | bigint | FK -> producto.id_producto |
| tipo_paleta | enum `tipo_paleta` | COMPLETO, PUCHO — default COMPLETO |
| cantidad_paquetes | integer | default 0 |
| cantidad_actual | numeric | default 0 |
| estado | enum `etiqueta_estado` | ACTIVA, VACIA, EXTRAVIADA — default ACTIVA |
| fecha_enrolamiento | timestamptz | default now() |
| id_almacen_actual | bigint | FK -> almacen.id_almacen, nullable |

### `sesion_recepcion` — 0 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_sesion | bigint (identity) | PK |
| id_orden | bigint | FK -> orden_importacion.id_orden |
| id_producto | bigint | FK -> producto.id_producto |
| id_almacen | bigint | FK -> almacen.id_almacen |
| id_usuario | bigint | FK -> usuario.id_usuario |
| estado | enum `sesion_estado` | ACTIVA, PAUSADA, FINALIZADA — default ACTIVA |
| total_paletas_completas | integer | default 0 |
| total_paquetes_puchos | integer | default 0 |
| fecha_inicio | timestamptz | default now() |
| fecha_ultima_actividad | timestamptz | default now() |
| fecha_finalizacion | timestamptz | nullable |

### `movimiento` — 0 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_movimiento | bigint (identity) | PK |
| id_usuario | bigint | FK -> usuario.id_usuario, nullable |
| id_dispositivo | bigint | FK -> dispositivo_iot.id_dispositivo, nullable |
| id_etiqueta | bigint | FK -> etiqueta_rfid.id_etiqueta, nullable |
| id_producto | bigint | FK -> producto.id_producto |
| tipo | enum `movimiento_tipo` | INGRESO_COMPLETO, INGRESO_PUCHO, DESPACHO_COMPLETO, RETIRO_PARCIAL |
| cantidad_afectada | numeric | CHECK > 0 |
| fecha_hora | timestamptz | default now() |
| destino_almacen | bigint | FK -> almacen.id_almacen, nullable |
| motivo | varchar | nullable |
| id_sesion | bigint | FK -> sesion_recepcion.id_sesion, nullable |
| es_sincronizado_offline | boolean | default false |
| idempotency_key | uuid | unique, nullable |

### `recepcion_lectura` — 0 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_lectura | bigint (identity) | PK |
| id_sesion | bigint | FK -> sesion_recepcion.id_sesion |
| id_etiqueta | bigint | FK -> etiqueta_rfid.id_etiqueta, nullable |
| uid_tag | varchar | |
| tipo_carga | enum `tipo_paleta` | COMPLETO, PUCHO |
| cantidad_paquetes | integer | default 0 |
| cantidad_unidades | numeric | default 0 |
| leido_en | timestamptz | default now() |
| valido | boolean | default true |
| motivo_invalidez | text | nullable |

### `conciliacion_ciega` — 0 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_conciliacion | bigint (identity) | PK |
| id_sesion | bigint | FK -> sesion_recepcion.id_sesion, unique |
| fecha_cruce | timestamptz | default now() |
| tags_esperados | integer | nullable |
| tags_leidos | integer | default 0 |
| total_paletas_completas | integer | default 0 |
| total_paquetes_puchos | integer | default 0 |
| estado | enum `conciliacion_estado` | COMPLETA, FALTANTES, SOBRANTES |

### `auditoria_eri` — 0 filas

| Columna | Tipo | Notas |
|---|---|---|
| id_auditoria | bigint (identity) | PK |
| id_almacen | bigint | FK -> almacen.id_almacen |
| id_usuario | bigint | FK -> usuario.id_usuario, nullable |
| id_dispositivo | bigint | FK -> dispositivo_iot.id_dispositivo, nullable |
| fecha_auditoria | timestamptz | default now() |
| tags_esperados | integer | default 0 |
| tags_leidos | integer | default 0 |
| porcentaje_eri | numeric | nullable |
| observaciones | text | nullable |

---

## 5. Políticas RLS activas actualmente

Solo estas 3 políticas existen en toda la base. El resto de tablas tiene RLS activado SIN políticas (bloqueo total):

```sql
-- rol: cualquier usuario autenticado puede leer el catálogo
create policy "rol_select_authenticated"
on rol for select
to authenticated
using (true);

-- usuario: cada usuario solo ve su propia fila
create policy "usuario_select_self"
on usuario for select
to authenticated
using (auth.uid() = auth_user_id);

-- usuario_rol: cada usuario solo ve su propia asignación de rol
create policy "usuario_rol_select_self"
on usuario_rol for select
to authenticated
using (
  id_usuario in (select id_usuario from usuario where auth_user_id = auth.uid())
);
```

**IMPORTANTE:** Las tablas `producto`, `regla_empaque`, `almacen`, `categoria`, `inventario`, `proveedor`, `orden_importacion`, `detalle_orden`, `permiso`, `rol_permiso`, `dispositivo_iot`, `etiqueta_rfid`, `sesion_recepcion`, `movimiento`, `recepcion_lectura`, `conciliacion_ciega` y `auditoria_eri` **NO tienen ninguna política todavía**. Cualquier lectura o escritura desde el frontend a esas tablas devolverá 0 filas o error de permisos hasta que se creen políticas específicas por rol.

---

## 6. Resumen de conteos

| Tabla | Filas |
|---|---|
| categoria | 2 |
| producto | 0 |
| regla_empaque | 0 |
| almacen | 3 |
| inventario | 0 |
| proveedor | 0 |
| orden_importacion | 0 |
| detalle_orden | 0 |
| usuario | 1 |
| rol | 4 |
| usuario_rol | 1 |
| permiso | 0 |
| rol_permiso | 0 |
| dispositivo_iot | 0 |
| etiqueta_rfid | 0 |
| sesion_recepcion | 0 |
| movimiento | 0 |
| recepcion_lectura | 0 |
| conciliacion_ciega | 0 |
| auditoria_eri | 0 |
