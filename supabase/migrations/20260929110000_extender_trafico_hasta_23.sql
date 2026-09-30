-- Habilita el último rango de conteo del día para Seguridad y la matriz de tráfico.
ALTER TABLE public.trafico_tienda
  DROP CONSTRAINT IF EXISTS trafico_tienda_rango_hora_check;

ALTER TABLE public.trafico_tienda
  ADD CONSTRAINT trafico_tienda_rango_hora_check CHECK (
    rango_hora IN (
      '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00',
      '13:00-14:00', '14:00-15:00', '15:00-16:00', '16:00-17:00',
      '17:00-18:00', '18:00-19:00', '19:00-20:00', '20:00-21:00',
      '21:00-22:00', '22:00-23:00'
    )
  );
