const historyMessage = 'Este trabajador tiene historial o registros vinculados. No se eliminó ni se cambió su estado. Su eliminación solo puede realizarse directamente en la base de datos.';

// An interrupted DELETE is ambiguous: verify with a fresh GET, never retry it.
export async function removePersonnel(api, id, { verifyOnly = false } = {}) {
  if (!verifyOnly) {
    try {
      const result = await api(`/usuarios/${id}`, { method: 'DELETE', retry: false });
      if (result?.tiene_historial === true && result.eliminado === false) {
        return { kind: 'history', message: result.mensaje || historyMessage };
      }
      if (result?.eliminado === true && !result.tiene_historial && !result.ya_no_existe) return { kind: 'deleted' };
      if (result?.ya_no_existe === true && result.eliminado === false && !result.tiene_historial) return { kind: 'already_removed' };
    } catch (error) {
      // Explicit rejections are definitive; network failures, timeouts and 5xx are not.
      if ([400, 401, 403, 409, 422, 429].includes(error.status)) throw error;
    }
  }
  try {
    const result = await api(`/usuarios/${id}/estado-eliminacion`, { cacheTtlMs: 0, retry: false });
    if (result?.existe === false) return { kind: 'already_removed' };
    if (result?.existe === true) return { kind: 'retained', message: 'Se comprobó que el trabajador sigue registrado. No se confirmó la eliminación. Puedes volver a intentarlo; no se reenvió la eliminación automáticamente.' };
  } catch (error) {
    if ([401, 403].includes(error.status)) return { kind: 'unknown', message: `${error.message} No se pudo comprobar el resultado de la eliminación. No vuelvas a eliminarlo hasta verificar su estado.` };
  }
  return { kind: 'unknown', message: 'No se pudo confirmar si el trabajador fue eliminado. Comprueba la conexión y pulsa “Verificar estado”; no se volverá a enviar la eliminación.' };
}
