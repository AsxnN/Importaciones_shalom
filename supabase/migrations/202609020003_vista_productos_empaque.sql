-- ==============================================================================
-- Vista: v_productos_empaque
-- Sistema de inventario RFID - Importaciones Shalom
-- Proporciona una consulta consolidada de producto + categoría + regla de empaque
-- con cálculos automáticos de cajas por paleta, unidades por paleta y volumen.
-- ==============================================================================

create or replace view public.v_productos_empaque
with (security_invoker = true)
as
select
  p.id_producto,
  p.sku,
  p.descripcion,
  p.nombre,
  p.activo as producto_activo,
  p.created_at,
  c.id_categoria,
  c.nombre as categoria_nombre,
  c.descripcion as categoria_descripcion,
  r.id_empaque,
  r.unidades_por_caja,
  r.cajas_por_camada,
  r.numero_camadas,
  (coalesce(r.cajas_por_camada, 0) * coalesce(r.numero_camadas, 0)) as cajas_por_paleta,
  (coalesce(r.cajas_por_camada, 0) * coalesce(r.numero_camadas, 0) * coalesce(r.unidades_por_caja, 0)) as unidades_por_paleta,
  r.permite_puchos,
  r.notas_armado,
  r.imagen_armado_path,
  r.largo_caja_cm,
  r.ancho_caja_cm,
  r.alto_caja_cm,
  r.peso_caja_kg,
  case
    when r.largo_caja_cm is not null and r.ancho_caja_cm is not null and r.alto_caja_cm is not null
    then round((r.largo_caja_cm * r.ancho_caja_cm * r.alto_caja_cm / 1000000.0), 4)
    else null
  end as volumen_caja_m3,
  case
    when r.largo_caja_cm is not null and r.ancho_caja_cm is not null and r.alto_caja_cm is not null and r.cajas_por_camada is not null and r.numero_camadas is not null
    then round(((r.largo_caja_cm * r.ancho_caja_cm * r.alto_caja_cm / 1000000.0) * (r.cajas_por_camada * r.numero_camadas)), 4)
    else null
  end as volumen_paleta_m3
from public.producto p
left join public.categoria c on c.id_categoria = p.id_categoria
left join public.regla_empaque r on r.id_producto = p.id_producto;

grant select on public.v_productos_empaque to authenticated;
