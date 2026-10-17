1. Enums
Enum	Valores
almacen_tipo	PRINCIPAL, TIENDA, MERMA
orden_estado	BORRADOR, TRANSITO, RECIBIDA
contenedor_tipo	20FT, 40FT, LCL
tipo_paleta	COMPLETO, PUCHO
etiqueta_estado	ACTIVA, VACIA, EXTRAVIADA (NO existe INACTIVA)
sesion_estado	ACTIVA, PAUSADA, FINALIZADA
movimiento_tipo	INGRESO_COMPLETO, INGRESO_PUCHO, DESPACHO_COMPLETO, RETIRO_PARCIAL
conciliacion_estado	COMPLETA, FALTANTES, SOBRANTES
rol_nombre	ADMINISTRADOR, COMPRADOR, OPERARIO, AUDITOR
permiso_accion	VER, CREAR, EDITAR, ELIMINAR
red_estado	ONLINE, OFFLINE
2. Tablas (todas con RLS habilitado)

Convención: PK = llave primaria · NN = NOT NULL · N = admite NULL · UQ = único.
Maestros

categoria: id_categoria PK identity · nombre varchar NN UQ · descripcion text NN · activo bool NN default true

producto: id_producto PK identity · id_categoria bigint N → categoria · sku varchar NN UQ · nombre varchar N · descripcion text NN · unidad_medida varchar N · peso_unitario_kg numeric N · clasificacion_abc char N (A/B/C) · costo_unitario numeric N · activo bool NN default true · created_at timestamptz NN default now()

regla_empaque (una por producto): id_empaque PK identity · id_producto bigint NN UQ → producto · unidades_por_caja int NN (>0) · cajas_por_camada int NN (>0) · numero_camadas int NN (>0) · cajas_por_camita int N (>0) · camitas_por_paleta int N (>0) · cajas_por_fila int N · filas_por_camada int N · permite_puchos bool NN default true · volumen_caja_m3 numeric N · volumen_total_m3 numeric N · largo_caja_cm / ancho_caja_cm / alto_caja_cm / peso_caja_kg numeric N · notas_armado text N · imagen_armado_path text N
Cajas por paleta = cajas_por_camada × numero_camadas.

proveedor: id_proveedor PK identity · razon_social varchar NN (NO es único) · calificacion_otif numeric N · tiempo_lead_time_dias int N · activo bool NN default true

almacen: id_almacen PK identity · nombre varchar NN UQ · tipo almacen_tipo NN default PRINCIPAL · capacidad_m3 numeric N · activo bool NN default true · prefijo_rfid varchar N (índice único almacen_prefijo_rfid_uq)
Inventario y compras

inventario: id_inventario PK identity · id_producto → producto · id_almacen → almacen · stock_real numeric NN default 0 · stock_minimo numeric NN default 0 · consumo_abs numeric NN default 0 · estado_semaforo varchar NN default 'VERDE' (VERDE/AMARILLO/ROJO) · fecha_quiebre_estimada date N · UQ (id_producto, id_almacen) · NO tiene updated_at

orden_importacion: id_orden PK identity · numero_orden varchar NN UQ · id_proveedor N → proveedor · estado orden_estado NN default BORRADOR · fecha_emision date N · tipo_contenedor contenedor_tipo N · volumen_ocupado_m3 numeric N

detalle_orden: id_detalle PK identity · id_orden → orden_importacion · id_producto → producto · cantidad_pedida int NN · subtotal_peso_kg numeric N · subtotal_volumen_m3 numeric N
Usuarios y permisos

usuario: id_usuario PK identity · auth_user_id uuid N UQ (Supabase Auth) · nombre_completo varchar NN · codigo_operario varchar N UQ · correo varchar N · activo bool NN default true · created_at timestamptz NN default now()
rol: id_rol PK · nombre_rol rol_nombre NN UQ · descripcion varchar N · activo bool NN default true
usuario_rol: id_usuario_rol PK · id_usuario → usuario · id_rol → rol · fecha_asignacion timestamptz NN default now() · asignado_por bigint N → usuario · activo bool NN default true
permiso: id_permiso PK · codigo_modulo varchar NN · accion permiso_accion NN
rol_permiso: id_rol_permiso PK · id_rol → rol · id_permiso → permiso
RFID, recepción y movimientos

dispositivo_iot: id_dispositivo PK · mac_address varchar NN UQ · ip_local inet N · nivel_bateria int N · version_firmware varchar N · estado_red red_estado NN default OFFLINE · id_almacen N → almacen · ultimo_contacto timestamptz N

etiqueta_rfid: id_etiqueta PK identity · uid_tag varchar NN UQ · id_producto → producto · tipo_paleta tipo_paleta NN default COMPLETO · cantidad_paquetes int NN default 0 (cajas) · cantidad_actual numeric NN default 0 (unidades) · estado etiqueta_estado NN default ACTIVA · fecha_enrolamiento timestamptz NN default now() · id_almacen_actual bigint N → almacen · id_celda bigint N → celda_rack · codigo_barras varchar N · notas text N
Índice único parcial etiqueta_un_pucho_activo_uq: un solo PUCHO ACTIVA por (id_producto, id_almacen_actual).

sesion_recepcion: id_sesion PK · id_orden bigint N → orden_importacion · id_producto → producto · id_almacen → almacen · id_usuario → usuario · estado sesion_estado NN default ACTIVA · total_paletas_completas int NN default 0 · total_paquetes_puchos int NN default 0 · fecha_inicio / fecha_ultima_actividad timestamptz NN default now() · fecha_finalizacion timestamptz N · id_transaccion_offline text N (índice único parcial si no es null)

recepcion_lectura: id_lectura PK · id_sesion → sesion_recepcion · id_etiqueta N → etiqueta_rfid · uid_tag varchar NN · tipo_carga tipo_paleta NN · cantidad_paquetes int NN default 0 · cantidad_unidades numeric NN default 0 · leido_en timestamptz NN default now() · valido bool NN default true · motivo_invalidez text N

conciliacion_ciega: id_conciliacion PK · id_sesion UQ → sesion_recepcion · fecha_cruce timestamptz NN default now() · tags_esperados int N · tags_leidos int NN default 0 · total_paletas_completas int NN default 0 · total_paquetes_puchos int NN default 0 · estado conciliacion_estado NN

movimiento (kardex): id_movimiento PK · id_usuario N → usuario · id_dispositivo N → dispositivo_iot · id_etiqueta N → etiqueta_rfid · id_producto → producto · tipo movimiento_tipo NN · cantidad_afectada numeric NN CHECK > 0 · fecha_hora timestamptz NN default now() · destino_almacen bigint N → almacen · motivo text N · id_sesion N → sesion_recepcion · es_sincronizado_offline bool NN default false · idempotency_key uuid N UQ

secuencia_rfid: id_almacen PK → almacen · ultimo_numero int NN default 0 (quedará sin uso con el algoritmo de huecos)

alerta_sistema: id_alerta PK identity always · tipo varchar NN · id_almacen N → almacen · id_producto N → producto · id_etiqueta N → etiqueta_rfid · mensaje text NN · resuelta bool NN default false · created_at timestamptz NN default now() · resuelta_por bigint N → usuario · fecha_resolucion timestamptz N
Ubicaciones (rack / drive-in)

carril: id_carril PK identity always · id_almacen → almacen · codigo_carril varchar NN · nombre varchar N · activo bool NN default true · created_at timestamptz NN
nivel_carril: id_nivel PK identity always · id_carril → carril · numero_nivel int NN (>=1) · nombre_nivel varchar N · capacidad_paletas int NN default 1 (>=0) · created_at timestamptz NN
celda_rack: id_celda PK identity always · id_almacen → almacen · tipo_ubicacion varchar NN default 'RACK' (RACK/CAMPO) · id_carril N → carril · id_nivel N → nivel_carril · posicion_fondo int N (>=1) · codigo_ubicacion varchar NN · descripcion varchar N · activo bool NN default true · created_at timestamptz NN
Auditorías

auditoria_eri: id_auditoria PK · id_almacen → almacen · id_usuario N · id_dispositivo N · fecha_auditoria timestamptz NN · tags_esperados int NN default 0 · tags_leidos int NN default 0 · porcentaje_eri numeric N · observaciones text N
auditoria_sesion: id_auditoria PK identity always · id_almacen → almacen · id_usuario N → usuario · fecha_inicio timestamptz NN · fecha_fin timestamptz N · estado varchar NN default 'EN_PROCESO' (EN_PROCESO/PARCIAL/COMPLETADA) · total_productos, productos_auditados, paletas_esperadas, paletas_auditadas int NN default 0 · porcentaje_eri numeric N (0-100) default 0 · observaciones text N · created_at timestamptz NN
auditoria_sesion_producto: id_auditoria_prod PK identity always · id_auditoria → auditoria_sesion · id_producto → producto · paletas_esperadas, paletas_leidas int NN default 0 · estado varchar NN default 'PENDIENTE' (PENDIENTE/AUDITADO) · nota_confirmacion text N · fecha_confirmacion timestamptz N
auditoria_sesion_lectura: id_lectura PK identity always · id_auditoria → auditoria_sesion · id_auditoria_prod → auditoria_sesion_producto · id_etiqueta → etiqueta_rfid · id_producto → producto · id_celda N → celda_rack · codigo_ubicacion_esperada varchar N · leido bool NN default false · metodo_lectura varchar N (RFID/CODIGO_BARRAS/MANUAL) · fecha_lectura timestamptz N
3. Vistas

v_conteo_paletas_almacen · v_productos_empaque · v_stock_por_sku
4. Funciones RPC existentes en public
Función	Firma
Función	Firma
conciliar_recepcion	(p_id_orden bigint, p_id_producto bigint, p_id_almacen bigint, p_lecturas jsonb, p_id_transaccion_offline text)
ejecutar_movimiento_despacho	(p_id_almacen bigint, p_movimientos jsonb)
transferir_carga_entre_almacenes	(p_uid_origen text, p_id_almacen_origen bigint, p_id_almacen_destino bigint, p_motivo text)
generar_uid_rfid	(p_id_almacen bigint) · solo postgres/service_role
dar_baja_etiqueta_rfid	(p_uid_tag text, p_motivo text)
eliminar_paleta_liberar_codigo	SOBRECARGA 1: (p_id_etiqueta bigint, p_uid_tag varchar, p_id_almacen bigint)
eliminar_paleta_liberar_codigo	SOBRECARGA 2: (p_uid_tag varchar, p_id_almacen bigint, p_motivo text)
resolver_alerta	(p_id_alerta bigint)
sincronizar_stock_con_paletas_almacen	(p_id_almacen bigint)
asegurar_zona_campo	(p_id_almacen bigint)
configurar_carril_drivein	(p_id_almacen bigint, p_codigo_carril varchar, p_nombre varchar, p_niveles jsonb)
tiene_rol	(roles_permitidos text[])
mi_perfil_acceso	()
rls_auto_enable	()

Triggers en public: NINGUNO.
5. Índices únicos relevantes

    almacen: almacen_nombre_key, almacen_prefijo_rfid_uq

    etiqueta_rfid: etiqueta_rfid_uid_tag_key y etiqueta_rfid_uid_tag_uq (DUPLICADOS), etiqueta_un_pucho_activo_uq (parcial)

    inventario: inventario_id_producto_id_almacen_key e inventario_producto_almacen_uq (DUPLICADOS)

    sesion_recepcion: sesion_recepcion_id_transaccion_offline_uq (parcial)