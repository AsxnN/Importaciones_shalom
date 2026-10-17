================================================================================
GUIA DE MEJORAS - SISTEMA TACTICO SHALOM (SUPABASE: "Importaciones shalom")
Fecha de elaboracion: 14/10/2026
================================================================================

ESTADO ACTUAL VERIFICADO EN SUPABASE
- Almacenes existentes: Almacen Principal (PRINCIPAL), Tienda Central (TIENDA), Mermas (MERMA).
- Funciones existentes: conciliar_recepcion(p_id_orden, p_id_producto, p_id_almacen,
  p_lecturas, p_id_transaccion_offline) y ejecutar_movimiento_despacho(p_id_almacen, p_movimientos).
- NO existen todavia: columna almacen.prefijo_rfid, tablas secuencia_rfid y alerta_sistema,
  funciones generar_uid_rfid, transferir_carga_entre_almacenes, resolver_alerta,
  dar_baja_etiqueta_rfid.

REGLAS DE NEGOCIO ACORDADAS
1. Cada etiqueta RFID pertenece a un solo almacen. Al transferir mercaderia a otro almacen
   NO se mueve el codigo: la etiqueta de origen se cierra (VACIA) y se crea una etiqueta nueva
   en el destino con un codigo propio de ese almacen.
2. Formato del codigo: prefijo del almacen + numero consecutivo de 5 digitos.
   Prefijo = 3 primeras letras de cada palabra del nombre, unidas.
   Ejemplos: Almacen Principal -> ALMPRI00001 | Tienda Central -> TIECEN00001 | Mermas -> MER00001
3. Solo puede haber UNA paleta de puchos activa por producto en cada almacen.
4. Si al transferir puchos el destino ya tiene un pucho de ese producto, se suman las cajas.
   Si el total alcanza el limite de paleta (cajas_por_camada x numero_camadas de regla_empaque):
   - el pucho anterior se cierra,
   - se crea una paleta COMPLETO con codigo nuevo,
   - si sobran cajas, se crea un nuevo pucho con otro codigo,
   - se genera una alerta (tabla alerta_sistema) para el menu principal: "verificar".
5. Las etiquetas NUNCA se borran fisicamente (DELETE). Se dan de baja (estado VACIA) para
   conservar el historial en movimiento, recepcion_lectura y auditorias.
6. movimiento.cantidad_afectada siempre es mayor que cero (CHECK). Nunca insertar negativos.
7. Valores validos de etiqueta_estado: ACTIVA, VACIA, EXTRAVIADA (no existe INACTIVA).
8. El conteo de paletas por almacen se obtiene de etiqueta_rfid (estado ACTIVA e
   id_almacen_actual), NO de inventario (que guarda unidades) ni de movimiento (historico).

ORDEN DE EJECUCION
Ejecutar en Supabase > SQL Editor > New query, un script a la vez, en este orden:
  PASO 1 - Script 1 (prefijos, codigos, alertas, transferencia)
  PASO 2 - Script 2 (baja de etiqueta)
  PASO 3 - Script 3 (vista de conteo de paletas)
  PASO 4 - Consultas de verificacion
  PASO 5 (OPCIONAL, DESTRUCTIVO) - Script 5 de limpieza de datos
  PASO 6 - Mejoras pendientes en funciones existentes y en la app

Antes de ejecutar: haz copia de seguridad de las tablas importantes.


================================================================================
SCRIPT 1 - PREFIJOS, CODIGOS RFID, ALERTAS Y TRANSFERENCIA ENTRE ALMACENES
================================================================================

begin;

-- 1. PREFIJO RFID: 3 PRIMERAS LETRAS DE CADA PALABRA
alter table public.almacen
  add column if not exists prefijo_rfid varchar(20);

update public.almacen
set prefijo_rfid = (
  select string_agg(upper(left(w, 3)), '')
  from regexp_split_to_table(
    regexp_replace(
      translate(nombre, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn'),
      '[^A-Za-z ]', '', 'g'
    ),
    '\s+'
  ) as w
  where w <> ''
);

create unique index if not exists almacen_prefijo_rfid_uq
  on public.almacen (prefijo_rfid);


-- 2. CONTADOR CONSECUTIVO POR ALMACEN
create table if not exists public.secuencia_rfid (
  id_almacen bigint primary key
    references public.almacen (id_almacen) on delete cascade,
  ultimo_numero integer not null default 0
);

alter table public.secuencia_rfid enable row level security;

create or replace function public.generar_uid_rfid(p_id_almacen bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefijo text;
  v_numero integer;
begin
  select a.prefijo_rfid
  into v_prefijo
  from public.almacen a
  where a.id_almacen = p_id_almacen
    and a.activo = true;

  if v_prefijo is null then
    raise exception
      'El almacén % no existe, está inactivo o no tiene prefijo RFID.',
      p_id_almacen;
  end if;

  insert into public.secuencia_rfid (id_almacen, ultimo_numero)
  values (p_id_almacen, 1)
  on conflict (id_almacen)
  do update set ultimo_numero = public.secuencia_rfid.ultimo_numero + 1
  returning ultimo_numero into v_numero;

  return v_prefijo || lpad(v_numero::text, 5, '0');
end;
$$;

revoke all on function public.generar_uid_rfid(bigint)
from public, anon, authenticated;


-- 3. UN SOLO PUCHO ACTIVO POR PRODUCTO Y ALMACEN
create unique index if not exists etiqueta_un_pucho_activo_uq
  on public.etiqueta_rfid (id_producto, id_almacen_actual)
  where tipo_paleta = 'PUCHO' and estado = 'ACTIVA';


-- 4. ALERTAS PARA EL MENU PRINCIPAL
create table if not exists public.alerta_sistema (
  id_alerta bigint generated always as identity primary key,
  tipo varchar(40) not null,
  id_almacen bigint references public.almacen (id_almacen) on delete set null,
  id_producto bigint references public.producto (id_producto) on delete set null,
  id_etiqueta bigint references public.etiqueta_rfid (id_etiqueta) on delete set null,
  mensaje text not null,
  resuelta boolean not null default false,
  created_at timestamptz not null default now(),
  resuelta_por bigint references public.usuario (id_usuario),
  fecha_resolucion timestamptz
);

alter table public.alerta_sistema enable row level security;

drop policy if exists alerta_sistema_lectura on public.alerta_sistema;
create policy alerta_sistema_lectura
on public.alerta_sistema
for select
to authenticated
using (
  exists (
    select 1 from public.usuario u
    where u.auth_user_id = auth.uid() and u.activo = true
  )
);

do $$
begin
  alter publication supabase_realtime add table public.alerta_sistema;
exception when duplicate_object then null;
end $$;

create or replace function public.resolver_alerta(p_id_alerta bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id_usuario bigint;
begin
  select u.id_usuario into v_id_usuario
  from public.usuario u
  where u.auth_user_id = auth.uid() and u.activo = true
  limit 1;

  if not found then
    raise exception 'Usuario no válido o inactivo.';
  end if;

  update public.alerta_sistema
  set resuelta = true,
      resuelta_por = v_id_usuario,
      fecha_resolucion = now()
  where id_alerta = p_id_alerta
    and resuelta = false;

  if not found then
    raise exception 'La alerta no existe o ya fue resuelta.';
  end if;

  return jsonb_build_object('ok', true, 'id_alerta', p_id_alerta);
end;
$$;

grant execute on function public.resolver_alerta(bigint) to authenticated;


-- 5. TRANSFERENCIA ENTRE ALMACENES (COMPLETOS Y PUCHOS)
drop function if exists public.transferir_carga_entre_almacenes(
  text, bigint, bigint, text
);

create or replace function public.transferir_carga_entre_almacenes(
  p_uid_origen text,
  p_id_almacen_origen bigint,
  p_id_almacen_destino bigint,
  p_motivo text default 'Transferencia entre almacenes'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id_usuario bigint;
  v_origen public.etiqueta_rfid%rowtype;
  v_pucho_dest public.etiqueta_rfid%rowtype;
  v_hay_pucho_dest boolean := false;

  v_sku text;
  v_nombre_destino text;
  v_unidades_por_caja integer;
  v_cajas_por_paleta integer;

  v_total_cajas integer;
  v_resto integer;

  v_uid_principal text;
  v_uid_resto text;
  v_uid_cerrado text;
  v_id_etiqueta_destino bigint;
  v_id_etiqueta_resto bigint;
  v_alerta boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if p_id_almacen_origen = p_id_almacen_destino then
    raise exception 'El almacén destino debe ser distinto del origen.';
  end if;

  select u.id_usuario into v_id_usuario
  from public.usuario u
  where u.auth_user_id = auth.uid() and u.activo = true
  limit 1;

  if not found then
    raise exception 'Usuario no válido o inactivo.';
  end if;

  select a.nombre into v_nombre_destino
  from public.almacen a
  where a.id_almacen = p_id_almacen_destino and a.activo = true;

  if not found then
    raise exception 'El almacén destino no existe o está inactivo.';
  end if;

  select * into v_origen
  from public.etiqueta_rfid
  where uid_tag = trim(p_uid_origen)
    and id_almacen_actual = p_id_almacen_origen
    and estado = 'ACTIVA'
  for update;

  if not found then
    raise exception
      'La etiqueta % no está activa en el almacén origen.', p_uid_origen;
  end if;

  if v_origen.cantidad_actual <= 0 or v_origen.cantidad_paquetes <= 0 then
    raise exception 'La etiqueta % no tiene cantidad para transferir.', p_uid_origen;
  end if;

  select p.sku into v_sku
  from public.producto p
  where p.id_producto = v_origen.id_producto;

  select re.unidades_por_caja, re.cajas_por_camada * re.numero_camadas
  into v_unidades_por_caja, v_cajas_por_paleta
  from public.regla_empaque re
  where re.id_producto = v_origen.id_producto;

  if not found or v_unidades_por_caja <= 0 or v_cajas_por_paleta <= 0 then
    raise exception 'El producto % no tiene una regla de empaque válida.', v_sku;
  end if;

  -- CARGA COMPLETA: etiqueta nueva COMPLETO en el destino
  if v_origen.tipo_paleta = 'COMPLETO' then

    v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);

    insert into public.etiqueta_rfid (
      uid_tag, id_producto, tipo_paleta, cantidad_paquetes,
      cantidad_actual, estado, id_almacen_actual, notas
    )
    values (
      v_uid_principal, v_origen.id_producto, 'COMPLETO',
      v_origen.cantidad_paquetes, v_origen.cantidad_actual,
      'ACTIVA'::public.etiqueta_estado, p_id_almacen_destino,
      'Transferida desde ' || v_origen.uid_tag
    )
    returning id_etiqueta into v_id_etiqueta_destino;

  -- PUCHO: fusionar en el pucho del destino o crearlo
  else

    select * into v_pucho_dest
    from public.etiqueta_rfid
    where id_producto = v_origen.id_producto
      and id_almacen_actual = p_id_almacen_destino
      and tipo_paleta = 'PUCHO'
      and estado = 'ACTIVA'
    for update;

    v_hay_pucho_dest := found;

    v_total_cajas := v_origen.cantidad_paquetes
      + case when v_hay_pucho_dest then v_pucho_dest.cantidad_paquetes else 0 end;

    if v_total_cajas < v_cajas_por_paleta then

      if v_hay_pucho_dest then
        update public.etiqueta_rfid
        set cantidad_paquetes = v_total_cajas,
            cantidad_actual = v_total_cajas * v_unidades_por_caja
        where id_etiqueta = v_pucho_dest.id_etiqueta;

        v_uid_principal := v_pucho_dest.uid_tag;
        v_id_etiqueta_destino := v_pucho_dest.id_etiqueta;
      else
        v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);

        insert into public.etiqueta_rfid (
          uid_tag, id_producto, tipo_paleta, cantidad_paquetes,
          cantidad_actual, estado, id_almacen_actual, notas
        )
        values (
          v_uid_principal, v_origen.id_producto, 'PUCHO',
          v_origen.cantidad_paquetes, v_origen.cantidad_actual,
          'ACTIVA'::public.etiqueta_estado, p_id_almacen_destino,
          'Pucho transferido desde ' || v_origen.uid_tag
        )
        returning id_etiqueta into v_id_etiqueta_destino;
      end if;

    else
      -- Limite alcanzado: pasa a paleta completa con codigo nuevo
      if v_hay_pucho_dest then
        v_uid_cerrado := v_pucho_dest.uid_tag;

        update public.etiqueta_rfid
        set estado = 'VACIA',
            cantidad_paquetes = 0,
            cantidad_actual = 0,
            id_almacen_actual = null,
            id_celda = null,
            notas = trim(coalesce(notas, '') || ' Consolidado en paleta completa')
        where id_etiqueta = v_pucho_dest.id_etiqueta;
      end if;

      v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);

      insert into public.etiqueta_rfid (
        uid_tag, id_producto, tipo_paleta, cantidad_paquetes,
        cantidad_actual, estado, id_almacen_actual, notas
      )
      values (
        v_uid_principal, v_origen.id_producto, 'COMPLETO',
        v_cajas_por_paleta, v_cajas_por_paleta * v_unidades_por_caja,
        'ACTIVA'::public.etiqueta_estado, p_id_almacen_destino,
        'Paleta completa formada al consolidar puchos'
      )
      returning id_etiqueta into v_id_etiqueta_destino;

      v_resto := v_total_cajas - v_cajas_por_paleta;

      if v_resto > 0 then
        v_uid_resto := public.generar_uid_rfid(p_id_almacen_destino);

        insert into public.etiqueta_rfid (
          uid_tag, id_producto, tipo_paleta, cantidad_paquetes,
          cantidad_actual, estado, id_almacen_actual, notas
        )
        values (
          v_uid_resto, v_origen.id_producto, 'PUCHO',
          v_resto, v_resto * v_unidades_por_caja,
          'ACTIVA'::public.etiqueta_estado, p_id_almacen_destino,
          'Remanente tras formar paleta completa ' || v_uid_principal
        )
        returning id_etiqueta into v_id_etiqueta_resto;
      end if;

      insert into public.alerta_sistema (
        tipo, id_almacen, id_producto, id_etiqueta, mensaje
      )
      values (
        'PUCHO_COMPLETADO',
        p_id_almacen_destino,
        v_origen.id_producto,
        v_id_etiqueta_destino,
        format(
          'En %s, los puchos de %s alcanzaron el límite de %s cajas. Se creó la paleta completa %s%s. Verificar físicamente.',
          v_nombre_destino, v_sku, v_cajas_por_paleta, v_uid_principal,
          case when v_uid_resto is not null
               then ' y un nuevo pucho ' || v_uid_resto
               else '' end
        )
      );

      v_alerta := true;
    end if;

  end if;

  -- Cerrar etiqueta de origen (queda como historial)
  update public.etiqueta_rfid
  set estado = 'VACIA',
      cantidad_paquetes = 0,
      cantidad_actual = 0,
      id_almacen_actual = null,
      id_celda = null,
      notas = trim(coalesce(notas, '') || ' Transferida a ' || v_uid_principal)
  where id_etiqueta = v_origen.id_etiqueta;

  -- Kardex: salida del origen
  insert into public.movimiento (
    id_usuario, id_etiqueta, id_producto, tipo,
    cantidad_afectada, destino_almacen, motivo
  )
  values (
    v_id_usuario, v_origen.id_etiqueta, v_origen.id_producto,
    'DESPACHO_COMPLETO'::public.movimiento_tipo,
    v_origen.cantidad_actual, p_id_almacen_destino,
    format('Transferencia: sale %s, entra %s. %s',
           v_origen.uid_tag, v_uid_principal, p_motivo)
  );

  -- Kardex: ingreso al destino
  insert into public.movimiento (
    id_usuario, id_etiqueta, id_producto, tipo,
    cantidad_afectada, destino_almacen, motivo
  )
  values (
    v_id_usuario, v_id_etiqueta_destino, v_origen.id_producto,
    case when v_origen.tipo_paleta = 'COMPLETO'
         then 'INGRESO_COMPLETO'::public.movimiento_tipo
         else 'INGRESO_PUCHO'::public.movimiento_tipo end,
    v_origen.cantidad_actual, p_id_almacen_destino,
    format('Transferencia: ingresa a %s desde %s. %s',
           v_uid_principal, v_origen.uid_tag, p_motivo)
  );

  -- Inventario origen
  update public.inventario
  set stock_real = greatest(0, stock_real - v_origen.cantidad_actual),
      estado_semaforo = case
        when greatest(0, stock_real - v_origen.cantidad_actual) <= 0 then 'ROJO'
        when greatest(0, stock_real - v_origen.cantidad_actual) <= stock_minimo then 'AMARILLO'
        else 'VERDE'
      end
  where id_producto = v_origen.id_producto
    and id_almacen = p_id_almacen_origen;

  -- Inventario destino
  insert into public.inventario (
    id_producto, id_almacen, stock_real, stock_minimo,
    consumo_abs, estado_semaforo
  )
  values (
    v_origen.id_producto, p_id_almacen_destino,
    v_origen.cantidad_actual, 0, 0, 'VERDE'
  )
  on conflict (id_producto, id_almacen)
  do update set
    stock_real = public.inventario.stock_real + excluded.stock_real,
    estado_semaforo = case
      when public.inventario.stock_real + excluded.stock_real <= 0 then 'ROJO'
      when public.inventario.stock_real + excluded.stock_real
           <= public.inventario.stock_minimo then 'AMARILLO'
      else 'VERDE'
    end;

  return jsonb_build_object(
    'ok', true,
    'uid_origen', v_origen.uid_tag,
    'uid_destino', v_uid_principal,
    'uid_pucho_restante', v_uid_resto,
    'uid_pucho_cerrado', v_uid_cerrado,
    'alerta_generada', v_alerta,
    'unidades_transferidas', v_origen.cantidad_actual,
    'mensaje', case
      when v_alerta then 'Transferencia registrada. Se completó una paleta: verificar físicamente.'
      else 'Transferencia registrada correctamente.'
    end
  );
end;
$$;

grant execute
on function public.transferir_carga_entre_almacenes(text, bigint, bigint, text)
to authenticated;

notify pgrst, 'reload schema';

commit;


================================================================================
SCRIPT 2 - BAJA DE ETIQUETA RFID (SIN BORRAR HISTORIAL)
================================================================================
Uso: cuando una paleta sale del sistema (consumida, danada, retirada). La fila se conserva
en etiqueta_rfid como VACIA y el historial queda en movimiento.

begin;

create or replace function public.dar_baja_etiqueta_rfid(
  p_uid_tag text,
  p_motivo text default 'Baja de etiqueta'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id_usuario bigint;
  v_e public.etiqueta_rfid%rowtype;
  v_almacen bigint;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select u.id_usuario into v_id_usuario
  from public.usuario u
  where u.auth_user_id = auth.uid() and u.activo = true
  limit 1;

  if not found then
    raise exception 'Usuario no válido o inactivo.';
  end if;

  select * into v_e
  from public.etiqueta_rfid
  where uid_tag = trim(p_uid_tag)
  for update;

  if not found then
    raise exception 'La etiqueta % no existe.', p_uid_tag;
  end if;

  if v_e.estado <> 'ACTIVA' then
    raise exception 'La etiqueta % no está activa (estado: %).', p_uid_tag, v_e.estado;
  end if;

  v_almacen := v_e.id_almacen_actual;

  if v_e.cantidad_actual > 0 then
    insert into public.movimiento (
      id_usuario, id_etiqueta, id_producto, tipo,
      cantidad_afectada, destino_almacen, motivo
    )
    values (
      v_id_usuario, v_e.id_etiqueta, v_e.id_producto,
      'RETIRO_PARCIAL'::public.movimiento_tipo,
      v_e.cantidad_actual, null,
      format('Baja de etiqueta %s. %s', v_e.uid_tag, p_motivo)
    );

    if v_almacen is not null then
      update public.inventario
      set stock_real = greatest(0, stock_real - v_e.cantidad_actual),
          consumo_abs = coalesce(consumo_abs, 0) + v_e.cantidad_actual,
          estado_semaforo = case
            when greatest(0, stock_real - v_e.cantidad_actual) <= 0 then 'ROJO'
            when greatest(0, stock_real - v_e.cantidad_actual) <= stock_minimo then 'AMARILLO'
            else 'VERDE'
          end
      where id_producto = v_e.id_producto
        and id_almacen = v_almacen;
    end if;
  end if;

  update public.etiqueta_rfid
  set estado = 'VACIA',
      cantidad_paquetes = 0,
      cantidad_actual = 0,
      id_almacen_actual = null,
      id_celda = null,
      notas = trim(coalesce(notas, '') || ' Baja: ' || p_motivo)
  where id_etiqueta = v_e.id_etiqueta;

  return jsonb_build_object(
    'ok', true,
    'uid_tag', v_e.uid_tag,
    'estado_anterior', v_e.estado,
    'estado_nuevo', 'VACIA',
    'mensaje', 'Etiqueta dada de baja. El historial se conserva.'
  );
end;
$$;

grant execute on function public.dar_baja_etiqueta_rfid(text, text) to authenticated;

notify pgrst, 'reload schema';

commit;


================================================================================
SCRIPT 3 - VISTA PARA EL CONTEO DE PALETAS EN TIEMPO REAL POR ALMACEN
================================================================================

create or replace view public.v_conteo_paletas_almacen
with (security_invoker = true) as
select
  a.id_almacen,
  a.nombre as almacen,
  p.id_producto,
  p.sku,
  p.nombre as producto,
  count(e.id_etiqueta) as paletas_activas,
  count(*) filter (where e.tipo_paleta = 'COMPLETO') as paletas_completas,
  count(*) filter (where e.tipo_paleta = 'PUCHO') as puchos,
  coalesce(sum(e.cantidad_actual), 0) as unidades_en_paletas
from public.almacen a
left join public.etiqueta_rfid e
  on e.id_almacen_actual = a.id_almacen
 and e.estado = 'ACTIVA'
left join public.producto p
  on p.id_producto = e.id_producto
group by a.id_almacen, a.nombre, p.id_producto, p.sku, p.nombre;

-- Conteo total por almacen (consulta directa):
select
  a.id_almacen,
  a.nombre as almacen,
  count(e.id_etiqueta) as total_paletas_activas,
  count(*) filter (where e.tipo_paleta = 'COMPLETO') as paletas_completas,
  count(*) filter (where e.tipo_paleta = 'PUCHO') as puchos,
  coalesce(sum(e.cantidad_actual), 0) as unidades_en_paletas
from public.almacen a
left join public.etiqueta_rfid e
  on e.id_almacen_actual = a.id_almacen
 and e.estado = 'ACTIVA'
group by a.id_almacen, a.nombre
order by a.nombre;


================================================================================
SCRIPT 4 - CONSULTAS DE VERIFICACION (EJECUTAR DESPUES DE LOS SCRIPTS 1 A 3)
================================================================================

-- Prefijos esperados: ALMPRI, MER, TIECEN
select id_almacen, nombre, prefijo_rfid from public.almacen order by id_almacen;

-- Funciones creadas
select p.proname, pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'generar_uid_rfid', 'transferir_carga_entre_almacenes',
    'resolver_alerta', 'dar_baja_etiqueta_rfid'
  )
order by p.proname;

-- Alertas pendientes (para el menu principal)
select * from public.alerta_sistema where resuelta = false order by created_at desc;

-- Ver el codigo fuente de las funciones actuales que aun hay que revisar
select pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('conciliar_recepcion', 'ejecutar_movimiento_despacho');


================================================================================
SCRIPT 5 (OPCIONAL, DESTRUCTIVO) - LIMPIAR DATOS OPERATIVOS PARA EMPEZAR DE NUEVO
================================================================================
ATENCION: TRUNCATE es irreversible. Ejecutalo solo si quieres borrar productos, paletas,
ordenes, inventario, recepciones, movimientos y auditorias.
CONSERVA: auth.users, usuario, rol, usuario_rol, permiso, rol_permiso, categoria,
proveedor, almacen, carril, nivel_carril, celda_rack, dispositivo_iot.
Ejecutar este script ANTES de volver a cargar datos y DESPUES de los scripts 1 a 3.

begin;

truncate table
  public.alerta_sistema,
  public.auditoria_sesion_lectura,
  public.auditoria_sesion_producto,
  public.auditoria_sesion,
  public.auditoria_eri,
  public.recepcion_lectura,
  public.conciliacion_ciega,
  public.sesion_recepcion,
  public.movimiento,
  public.etiqueta_rfid,
  public.inventario,
  public.detalle_orden,
  public.orden_importacion,
  public.regla_empaque,
  public.producto
restart identity cascade;

-- Reinicia los contadores de codigos RFID (ALMPRI00001, TIECEN00001, MER00001...)
truncate table public.secuencia_rfid;

commit;

-- Verificacion: todas deben dar 0
select 'producto' as tabla, count(*) from public.producto
union all select 'etiqueta_rfid', count(*) from public.etiqueta_rfid
union all select 'inventario', count(*) from public.inventario
union all select 'movimiento', count(*) from public.movimiento
union all select 'orden_importacion', count(*) from public.orden_importacion;

-- Verificacion: la autenticacion sigue intacta
select
  (select count(*) from auth.users) as usuarios_auth,
  (select count(*) from public.usuario) as perfiles_usuario,
  (select count(*) from public.rol) as roles,
  (select count(*) from public.usuario_rol) as asignaciones_rol;


================================================================================
PASO 6 - MEJORAS PENDIENTES (AUN NO TIENEN SQL; DEBEN IMPLEMENTARSE)
================================================================================

A. conciliar_recepcion (recepcion de mercaderia)
   - Hoy recibe el uid desde la app y lo guarda tal cual.
   - Mejorar: que genere el codigo con generar_uid_rfid(p_id_almacen) cuando la paleta sea
     nueva, y devuelva los codigos asignados en el JSON de respuesta para etiquetar fisicamente.
   - Aplicar la regla de un solo pucho por producto y almacen: si ya existe un pucho activo,
     sumar cajas; si llega al limite de paleta, crear COMPLETO con codigo nuevo, dejar el
     remanente como pucho y crear una alerta en alerta_sistema (tipo PUCHO_COMPLETADO).
   - Registrar un movimiento por etiqueta (INGRESO_COMPLETO o INGRESO_PUCHO) con id_etiqueta.
   - Mantener: validacion de auth.uid(), usuario activo, almacen activo, producto activo,
     producto perteneciente a la orden, UIDs sin duplicados, idempotencia con
     p_id_transaccion_offline.

B. ejecutar_movimiento_despacho (despachos y retiros)
   - Revisar con la consulta pg_get_functiondef del Script 4 que la version desplegada:
     * use estado 'VACIA' y no 'INACTIVA' (el enum no tiene INACTIVA),
     * inserte cantidad_afectada positiva en movimiento,
     * registre id_etiqueta en movimiento,
     * NO otorgue execute al rol anon (solo authenticated),
     * valide auth.uid(), usuario activo y almacen activo.
   - Las transferencias entre almacenes deben hacerse con transferir_carga_entre_almacenes
     (codigo nuevo en el destino) y no moviendo la misma etiqueta con id_almacen_destino.
   - En RETIRO_PARCIAL de una paleta COMPLETO, el remanente pasa a PUCHO: aplicar la regla de
     un solo pucho por producto y almacen (si ya existe, sumar cajas al pucho existente o
     bloquear segun la regla definida por el negocio).

C. Seguridad
   - Mantener RLS activo en todas las tablas; la escritura de recepciones, despachos,
     transferencias y bajas solo por funciones RPC security definer.
   - Opcional: validar rol ADMINISTRADOR u OPERARIO dentro de las funciones.
   - No usar politicas "for all ... using (true)" para usuarios autenticados.

D. App React Native / Expo
   - Menu principal: mostrar contador de alertas pendientes y suscribirse a alerta_sistema.
   - Pantalla de transferencia: mostrar al operario el codigo nuevo (uid_destino) y, si
     existe, uid_pucho_restante, para etiquetar fisicamente.
   - Pantalla de baja de etiqueta: llamar a dar_baja_etiqueta_rfid.
   - Conteo de paletas por almacen: leer la vista v_conteo_paletas_almacen.
   - Usar los nombres exactos de parametros (p_id_producto, no p_idproducto).

Ejemplos de llamadas:

  // Transferir una paleta o pucho
  const { data, error } = await supabase.rpc('transferir_carga_entre_almacenes', {
    p_uid_origen: 'ALMPRI00007',
    p_id_almacen_origen: 1,
    p_id_almacen_destino: 2,
    p_motivo: 'Reposicion Tienda Central',
  });
  // data.uid_destino, data.uid_pucho_restante, data.alerta_generada

  // Dar de baja una etiqueta
  const { data, error } = await supabase.rpc('dar_baja_etiqueta_rfid', {
    p_uid_tag: 'ALMPRI00007',
    p_motivo: 'Paleta consumida',
  });

  // Contador de alertas pendientes
  const { count } = await supabase
    .from('alerta_sistema')
    .select('*', { count: 'exact', head: true })
    .eq('resuelta', false);

  // Resolver una alerta
  await supabase.rpc('resolver_alerta', { p_id_alerta: 1 });

  // Conteo de paletas por almacen
  const { data } = await supabase
    .from('v_conteo_paletas_almacen')
    .select('*')
    .eq('id_almacen', 1);

E. Pruebas recomendadas despues de aplicar todo
   1. Recibir una paleta COMPLETO en Almacen Principal y confirmar el codigo ALMPRI00001.
   2. Transferirla a Tienda Central y confirmar: ALMPRI00001 queda VACIA y aparece TIECEN00001
      ACTIVA; el conteo de Almacen Principal baja y el de Tienda Central sube.
   3. Transferir un pucho a un almacen sin pucho de ese producto: se crea una paleta PUCHO.
   4. Transferir otro pucho del mismo producto: las cajas se suman a la paleta PUCHO existente.
   5. Llevar el pucho al limite de paleta: se crea COMPLETO con codigo nuevo, queda el remanente
      como nuevo pucho y aparece la alerta PUCHO_COMPLETADO.
   6. Dar de baja una etiqueta y confirmar que su historial sigue en movimiento.
   7. Confirmar que los codigos se numeran por almacen: ALMPRI00001, TIECEN00001, MER00001.


================================================================================
PROMPT PARA TU CLI DE IA (COPIAR Y PEGAR)
================================================================================

Actua como desarrollador senior de Supabase, PostgreSQL y React Native con Expo.

Proyecto: Sistema Tactico Shalom (importaciones, recepcion RFID, inventario, despachos,
transferencias y auditorias). Base de datos: Supabase "Importaciones shalom".

Tablas clave (schema public): categoria, producto (sku unico), regla_empaque (una por
producto), proveedor, almacen (con prefijo_rfid), inventario (unico por producto y almacen),
orden_importacion, detalle_orden, usuario, rol, usuario_rol, permiso, rol_permiso,
etiqueta_rfid (uid_tag unico), sesion_recepcion, recepcion_lectura, conciliacion_ciega,
movimiento, carril, nivel_carril, celda_rack, auditoria_eri, auditoria_sesion,
auditoria_sesion_producto, auditoria_sesion_lectura, secuencia_rfid, alerta_sistema.

Enums: almacen_tipo (PRINCIPAL, TIENDA, MERMA); orden_estado (BORRADOR, TRANSITO, RECIBIDA);
contenedor_tipo (20FT, 40FT, LCL); tipo_paleta (COMPLETO, PUCHO); etiqueta_estado (ACTIVA,
VACIA, EXTRAVIADA); sesion_estado (ACTIVA, PAUSADA, FINALIZADA); movimiento_tipo
(INGRESO_COMPLETO, INGRESO_PUCHO, DESPACHO_COMPLETO, RETIRO_PARCIAL); conciliacion_estado
(COMPLETA, FALTANTES, SOBRANTES); rol_nombre (ADMINISTRADOR, COMPRADOR, OPERARIO, AUDITOR).

Reglas obligatorias:
1. Cada etiqueta RFID pertenece a un solo almacen. Al transferir, se cierra la etiqueta de
   origen (estado VACIA, almacen y celda en null) y se crea una nueva en el destino con codigo
   generado por generar_uid_rfid (prefijo de 3 letras por palabra del nombre del almacen +
   consecutivo de 5 digitos: ALMPRI00001, TIECEN00001, MER00001).
2. Nunca hacer DELETE sobre etiqueta_rfid. Usar dar_baja_etiqueta_rfid.
3. Solo una paleta PUCHO activa por producto y almacen (indice unico parcial). Si el pucho
   alcanza cajas_por_camada x numero_camadas, se crea una paleta COMPLETO con codigo nuevo,
   el remanente queda como nuevo pucho y se inserta una alerta PUCHO_COMPLETADO en
   alerta_sistema para mostrarla en el menu principal.
4. movimiento.cantidad_afectada siempre positiva; registrar id_etiqueta en cada movimiento.
5. Escrituras solo mediante RPC security definer; permisos solo para authenticated (nunca anon).
6. Conteo de paletas por almacen: etiqueta_rfid con estado ACTIVA e id_almacen_actual
   (vista v_conteo_paletas_almacen). No usar inventario ni movimiento para contar paletas.
7. RPC existentes: conciliar_recepcion(p_id_orden, p_id_producto, p_id_almacen, p_lecturas,
   p_id_transaccion_offline), ejecutar_movimiento_despacho(p_id_almacen, p_movimientos),
   transferir_carga_entre_almacenes(p_uid_origen, p_id_almacen_origen, p_id_almacen_destino,
   p_motivo), dar_baja_etiqueta_rfid(p_uid_tag, p_motivo), resolver_alerta(p_id_alerta).
8. La app funciona offline con cola de sincronizacion e idempotencia
   (id_transaccion_offline / idempotency_key).

Tareas: (a) adaptar conciliar_recepcion para generar codigos por almacen y aplicar la regla
del pucho con alerta; (b) corregir ejecutar_movimiento_despacho (estado VACIA, cantidad
positiva, id_etiqueta, sin grant a anon); (c) implementar en la app el contador de alertas,
la pantalla de transferencia que muestre el codigo nuevo, la baja de etiquetas y el conteo
de paletas por almacen. Entrega SQL completo, grants y ejemplos de supabase.rpc.

================================================================================
FIN DEL DOCUMENTO
================================================================================
