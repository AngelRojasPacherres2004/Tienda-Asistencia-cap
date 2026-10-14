// Los res?menes documentarios se env?an con la programaci?n elegida por el usuario.
// Esta funci?n antigua ya no tiene una tarea diaria ni env?a correos adicionales.
export default async function expiredDocumentsCron() {
  return new Response("Los avisos documentarios usan las programaciones de correo.");
}
