import { computed as coreComputed, effect as coreEffect, signal as coreSignal } from '@preact/signals-core';

type WritableSignal<T> = (() => T) & { set(value: T): void; update(fn: (value: T) => T): void };

export function signal<T>(initial: T): WritableSignal<T> {
  const source = coreSignal(initial);
  const read = (() => source.value) as WritableSignal<T>;
  read.set = value => { source.value = value; };
  read.update = fn => { source.value = fn(source.value); };
  return read;
}

export function computed<T>(calculate: () => T): () => T {
  const source = coreComputed(calculate);
  return () => source.value;
}

export function effect(run: (onCleanup: (cleanup: () => void) => void) => void): { destroy(): void } {
  let disposed = false;
  let stop: (() => void) | undefined;
  // Class field effects must start after every field has been initialized.
  queueMicrotask(() => {
    if (disposed) return;
    stop = coreEffect(() => {
      const cleanups: Array<() => void> = [];
      run(cleanup => cleanups.push(cleanup));
      return () => { for (const cleanup of cleanups) cleanup(); };
    });
  });
  return { destroy() { disposed = true; stop?.(); } };
}

const services = new Map<Function, unknown>();

export function withReactServices<T>(values: Array<[Function, unknown]>, create: () => T): T {
  for (const [key, value] of values) services.set(key, value);
  try { return create(); }
  finally { for (const [key] of values) services.delete(key); }
}

export function inject<T>(token: new (...args: never[]) => T): T {
  if (!services.has(token)) throw new Error(`Servicio comercial no registrado: ${token.name}`);
  return services.get(token) as T;
}

export function Injectable(): ClassDecorator { return () => undefined; }
export interface OnInit { ngOnInit(): void | Promise<void> }
