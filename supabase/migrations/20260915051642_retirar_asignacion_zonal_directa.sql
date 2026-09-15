-- El clúster es ahora la única fuente activa. Se conserva la relación anterior como respaldo.
ALTER TABLE IF EXISTS public.tienda_jefes_zonales RENAME TO tienda_jefes_zonales_legacy;
