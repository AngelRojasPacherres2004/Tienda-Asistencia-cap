export function marketingError(error) {
  const message = typeof error === "string" ? error : error?.message;
  if (!message || /failed to fetch|networkerror|load failed|fetch failed/i.test(message)) return "No pudimos conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.";
  if (/constraint|PGRST|SQL|TypeError|undefined|null|exception|stack|migraci|estructura de la base|falta habilitar/i.test(message)) return "No pudimos guardar los datos por un problema del sistema. Inténtalo nuevamente; si continúa, informa al administrador.";
  return message;
}

export function fieldWarning(control) {
  const label = control.closest(".field")?.querySelector("span")?.textContent || control.getAttribute("aria-label") || "este campo";
  const validity = control.validity;
  if (validity.valueMissing) return `Completa el campo «${label}» para continuar.`;
  if (validity.typeMismatch && control.type === "email") return `Escribe un correo válido en «${label}», por ejemplo nombre@correo.com.`;
  if (validity.rangeUnderflow) return `El campo «${label}» debe ser igual o mayor que ${control.min}.`;
  if (validity.rangeOverflow) return `El campo «${label}» debe ser igual o menor que ${control.max}.`;
  if (validity.stepMismatch) return `Revisa «${label}»: utiliza un valor con el incremento permitido (${control.step}).`;
  return `Revisa el campo «${label}» e ingresa un valor válido.`;
}

