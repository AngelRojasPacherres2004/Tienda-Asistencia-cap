-- Preserve course IDs, assignments and progress; remove only the CAP prefix.
UPDATE public.cursos
SET nombre = trim(regexp_replace(nombre, '^CAP[[:space:]]*[0-9]+[[:space:]]*(-[[:space:]]*)?', '', 'i'))
WHERE nombre ~* '^CAP[[:space:]]*[0-9]+';
