Deno.serve((): Response =>
  Response.json({ error: 'Inicialización deshabilitada.' }, { status: 410 }),
);
