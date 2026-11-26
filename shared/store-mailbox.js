const laterThan = (a, b) => Date.parse(a.created_at) > Date.parse(b.created_at)
  || (Date.parse(a.created_at) === Date.parse(b.created_at) && Number(a.id) > Number(b.id));

export function mailboxMessageStatus(message, messages) {
  const answered = messages.some(reply => Number(reply.tienda_id) === Number(message.tienda_id)
    && Number(reply.remitente_id) === Number(message.destinatario_id)
    && Number(reply.destinatario_id) === Number(message.remitente_id)
    && reply.mensaje?.trim() && laterThan(reply, message));
  return answered ? "respondidos" : message.leido_en ? "vistos" : "pendientes";
}

export function mailboxConversation(messages, userId) {
  const ordered = [...messages].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || Number(a.id) - Number(b.id));
  const received = ordered.filter(message => Number(message.destinatario_id) === Number(userId));
  const unanswered = received.filter(message => mailboxMessageStatus(message, ordered) !== "respondidos");
  return {
    messages: ordered,
    latest: ordered.at(-1),
    unread: received.filter(message => !message.leido_en).length,
    status: unanswered.some(message => !message.leido_en) ? "pendientes"
      : unanswered.length ? "vistos" : received.length ? "respondidos"
        : ordered.length ? mailboxMessageStatus(ordered.at(-1), ordered) : null,
    needsReply: unanswered.length > 0,
    pendingReplies: unanswered.length,
  };
}

