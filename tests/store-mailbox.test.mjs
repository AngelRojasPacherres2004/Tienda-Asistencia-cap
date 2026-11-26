import test from 'node:test';
import assert from 'node:assert/strict';
import { mailboxConversation, mailboxMessageStatus } from '../shared/store-mailbox.js';

const incoming = { id: 1, tienda_id: 10, remitente_id: 2, destinatario_id: 1, mensaje: 'Revisa la asistencia', created_at: '2026-11-26T10:00:00Z', leido_en: null };
const reply = { ...incoming, id: 2, remitente_id: 1, destinatario_id: 2, mensaje: 'Ya lo revisé', created_at: '2026-11-26T11:00:00Z' };

test('ver un mensaje no cuenta como responder', () => {
  assert.equal(mailboxMessageStatus(incoming, [incoming]), 'pendientes');
  const read = { ...incoming, leido_en: '2026-11-26T10:05:00Z' };
  assert.equal(mailboxMessageStatus(read, [read]), 'vistos');
  assert.equal(mailboxConversation([read], 1).needsReply, true);
  assert.equal(mailboxConversation([read], 1).pendingReplies, 1);
});

test('solo una respuesta posterior de la contraparte y tienda correctas cuenta', () => {
  for (const invalid of [{ ...reply, tienda_id: 11 }, { ...reply, remitente_id: 3 }, { ...reply, destinatario_id: 3 }, { ...reply, mensaje: '  ' }, { ...reply, created_at: '2026-11-26T09:00:00Z' }]) {
    assert.equal(mailboxMessageStatus(incoming, [incoming, invalid]), 'pendientes');
  }
  assert.equal(mailboxMessageStatus(incoming, [incoming, reply]), 'respondidos');
  assert.equal(mailboxConversation([reply, incoming], 1).status, 'respondidos');
  assert.equal(mailboxConversation([reply, incoming], 1).pendingReplies, 0);
});

test('el resumen suma mensajes sin ver y vistos sin responder', () => {
  const read = { ...incoming, id: 3, leido_en: '2026-11-26T10:05:00Z' };
  assert.equal(mailboxConversation([incoming, read], 1).pendingReplies, 2);
});

test('una conversación vacía no tiene estado pendiente ni mensajes por contestar', () => {
  const summary = mailboxConversation([], 1);
  assert.equal(summary.status, null);
  assert.equal(summary.pendingReplies, 0);
  assert.equal(summary.needsReply, false);
});

test('un nuevo mensaje recibido vuelve a requerir respuesta', () => {
  const next = { ...incoming, id: 3, created_at: '2026-11-26T12:00:00Z' };
  const conversation = mailboxConversation([next, reply, incoming], 1);
  assert.equal(conversation.status, 'pendientes');
  assert.equal(conversation.needsReply, true);
  assert.equal(conversation.unread, 2);
  assert.equal(conversation.latest.id, 3);
});

test('la lectura y la respuesta se evalúan también desde la cuenta del remitente', () => {
  assert.equal(mailboxConversation([incoming], 2).status, 'pendientes');
  assert.equal(mailboxConversation([{ ...incoming, leido_en: '2026-11-26T10:05:00Z' }], 2).status, 'vistos');
  assert.equal(mailboxConversation([incoming, reply], 2).needsReply, true);
});
