
-- Municipios
CREATE TABLE public.municipios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);
GRANT SELECT ON public.municipios TO anon, authenticated;
GRANT ALL ON public.municipios TO service_role;
ALTER TABLE public.municipios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read municipios" ON public.municipios FOR SELECT USING (true);

-- Contaminantes
CREATE TABLE public.contaminantes (
  id SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL
);
GRANT SELECT ON public.contaminantes TO anon, authenticated;
GRANT ALL ON public.contaminantes TO service_role;
ALTER TABLE public.contaminantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read contaminantes" ON public.contaminantes FOR SELECT USING (true);

-- Mediciones SIATA
CREATE TABLE public.mediciones_siata (
  id SERIAL PRIMARY KEY,
  estacion TEXT NOT NULL,
  latitud DOUBLE PRECISION NOT NULL,
  longitud DOUBLE PRECISION NOT NULL,
  pm25_ica NUMERIC NOT NULL,
  categoria_ica TEXT NOT NULL,
  municipio_id INT REFERENCES public.municipios(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mediciones_siata TO anon, authenticated;
GRANT ALL ON public.mediciones_siata TO service_role;
ALTER TABLE public.mediciones_siata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read mediciones" ON public.mediciones_siata FOR SELECT USING (true);

-- Análisis de riesgo
CREATE TABLE public.analisis_riesgo (
  id SERIAL PRIMARY KEY,
  municipio_id INT NOT NULL REFERENCES public.municipios(id),
  contaminante_id INT NOT NULL REFERENCES public.contaminantes(id),
  grupo_edad TEXT NOT NULL,
  sexo TEXT NOT NULL,
  beta NUMERIC NOT NULL,
  porcentaje_incremento_riesgo NUMERIC NOT NULL
);
GRANT SELECT ON public.analisis_riesgo TO anon, authenticated;
GRANT ALL ON public.analisis_riesgo TO service_role;
ALTER TABLE public.analisis_riesgo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read riesgo" ON public.analisis_riesgo FOR SELECT USING (true);

-- Enfermedades
CREATE TABLE public.enfermedades (
  id SERIAL PRIMARY KEY,
  municipio_id INT NOT NULL REFERENCES public.municipios(id),
  periodo INT NOT NULL,
  casos INT NOT NULL
);
GRANT SELECT ON public.enfermedades TO anon, authenticated;
GRANT ALL ON public.enfermedades TO service_role;
ALTER TABLE public.enfermedades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read enfermedades" ON public.enfermedades FOR SELECT USING (true);

-- Defunciones
CREATE TABLE public.defunciones (
  id SERIAL PRIMARY KEY,
  municipio_id INT NOT NULL REFERENCES public.municipios(id),
  periodo INT NOT NULL,
  muertes INT NOT NULL
);
GRANT SELECT ON public.defunciones TO anon, authenticated;
GRANT ALL ON public.defunciones TO service_role;
ALTER TABLE public.defunciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read defunciones" ON public.defunciones FOR SELECT USING (true);

-- ============== SEED DATA ==============
INSERT INTO public.municipios (id, nombre) VALUES
  (1,'Medellín'),(2,'Bello'),(3,'Itagüí'),(4,'Envigado'),(5,'Sabaneta'),
  (6,'La Estrella'),(7,'Caldas'),(8,'Copacabana'),(9,'Girardota'),(10,'Barbosa');
SELECT setval('municipios_id_seq', 10);

INSERT INTO public.contaminantes (id, codigo, nombre) VALUES
  (1,'pm25','Material Particulado PM2.5'),
  (2,'pm10','Material Particulado PM10'),
  (3,'o3','Ozono');
SELECT setval('contaminantes_id_seq', 3);

-- Estaciones SIATA reales (aprox)
INSERT INTO public.mediciones_siata (estacion, latitud, longitud, pm25_ica, categoria_ica, municipio_id) VALUES
  ('Estación #12 - Tráfico Centro', 6.2526, -75.5696, 24.0, 'Moderada', 1),
  ('Estación #25 - Poblado',        6.2087, -75.5685, 18.5, 'Moderada', 1),
  ('Estación #38 - Aranjuez',       6.2790, -75.5570, 22.0, 'Moderada', 1),
  ('Estación #44 - Belén',          6.2342, -75.6018, 16.0, 'Buena',    1),
  ('Estación #56 - Bello Centro',   6.3373, -75.5586, 21.0, 'Moderada', 2),
  ('Estación #62 - Itagüí Sur',     6.1716, -75.6121, 27.0, 'Dañina a grupos sensibles', 3),
  ('Estación #71 - Envigado',       6.1701, -75.5836, 15.0, 'Buena',    4),
  ('Estación #78 - Sabaneta',       6.1517, -75.6166, 13.5, 'Buena',    5),
  ('Estación #84 - La Estrella',    6.1660, -75.6427, 12.0, 'Buena',    6),
  ('Estación #89 - Caldas',         6.0911, -75.6362, 10.5, 'Buena',    7),
  ('Estación #94 - Santa Elena',    6.2364, -75.4985,  4.0, 'Buena',    1),
  ('Estación #99 - Copacabana',     6.3486, -75.5079, 19.0, 'Moderada', 8);

-- analisis_riesgo: beta por (municipio, contaminante, grupo_edad, sexo)
DO $$
DECLARE m INT; g TEXT; s TEXT; b NUMERIC;
BEGIN
  FOR m IN 1..10 LOOP
    FOREACH g IN ARRAY ARRAY['0-14','15-44','45-64','65+'] LOOP
      FOREACH s IN ARRAY ARRAY['M','F'] LOOP
        b := round((0.04 + random()*0.08)::numeric, 6);
        INSERT INTO public.analisis_riesgo
          (municipio_id, contaminante_id, grupo_edad, sexo, beta, porcentaje_incremento_riesgo)
        VALUES (m, 1, g, s, b, round((b*100)::numeric, 2));
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- Enfermedades y defunciones 2008-2023 por municipio (curva creciente)
DO $$
DECLARE m INT; y INT; base INT; casos INT; muertes INT; pop_factor NUMERIC;
BEGIN
  FOR m IN 1..10 LOOP
    -- factor poblacional: Medellín mucho más grande
    pop_factor := CASE m WHEN 1 THEN 50 WHEN 2 THEN 5 WHEN 3 THEN 4 WHEN 4 THEN 3
                         WHEN 5 THEN 1.5 WHEN 6 THEN 1 WHEN 7 THEN 1.2
                         WHEN 8 THEN 1.3 WHEN 9 THEN 0.8 ELSE 0.7 END;
    FOR y IN 2008..2023 LOOP
      base := (1000 + (y-2008)*250)::int;
      casos := (base * pop_factor * (0.9 + random()*0.2))::int;
      muertes := (casos * 0.012 * (0.8 + random()*0.4))::int;
      INSERT INTO public.enfermedades (municipio_id, periodo, casos) VALUES (m, y, casos);
      INSERT INTO public.defunciones  (municipio_id, periodo, muertes) VALUES (m, y, muertes);
    END LOOP;
  END LOOP;
END $$;
