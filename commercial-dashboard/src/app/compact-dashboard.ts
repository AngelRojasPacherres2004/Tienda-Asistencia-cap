type DictionaryRows = {
  encoding: 'dictionary-v1';
  columns: string[];
  dictionary: Record<string, unknown[]>;
  rows: unknown[][];
};
type SellerGroupedRows = {
  encoding: 'seller-grouped-v1';
  groupColumns: string[];
  dictionary: Record<string, unknown[]>;
  groups: number[][];
  rows: unknown[][];
};
export type CompactRows = DictionaryRows | SellerGroupedRows;
export type DailyCompact = {
  encoding: 'daily-v1';
  dictionary: Record<string, unknown[]>;
  dailyStore: unknown[][];
  hourlySales: unknown[][];
};
export type PredictiveCompact = {
  encoding: 'predictive-v1';
  note: string;
  dictionary: { storeId: string[]; productId: string[] };
  rows: unknown[][];
};
export type StockCompact = {
  encoding: 'stock-v1';
  stores: string[];
  products: unknown[][];
  rows: unknown[][];
};

function indexedValue(dictionary: unknown, value: unknown): unknown {
  if (!Array.isArray(dictionary) || typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= dictionary.length) {
    throw new Error('Índice de dimensión comercial no válido.');
  }
  return dictionary[value];
}

export function decodeCompactRows<T extends object>(payload: CompactRows, signal?: AbortSignal): T[] {
  if (payload?.encoding === 'seller-grouped-v1') {
    const expected = ['periodId', 'storeId', 'category', 'line', 'subline'];
    if (!Array.isArray(payload.groupColumns) || payload.groupColumns.join('|') !== expected.join('|') ||
        !payload.dictionary || !Array.isArray(payload.groups) || !Array.isArray(payload.rows)) {
      throw new Error('Formato de vendedores no válido.');
    }
    return payload.rows.map((values, rowIndex) => {
      if (rowIndex % 4096 === 0) signal?.throwIfAborted();
      if (!Array.isArray(values) || (values.length !== 4 && values.length !== 5)) throw new Error('Fila de vendedor incompleta.');
      const group = indexedValue(payload.groups, values[0]);
      if (!Array.isArray(group) || group.length !== expected.length) throw new Error('Grupo de vendedor no válido.');
      const record: Record<string, unknown> = {};
      expected.forEach((column, index) => { record[column] = indexedValue(payload.dictionary[column], group[index]); });
      record['seller'] = indexedValue(payload.dictionary['seller'], values[1]);
      record['net'] = values[2];
      record['units'] = values[3];
      record['transactions'] = values.length === 5 ? values[4] : values[3];
      return record as T;
    });
  }
  if (payload?.encoding !== 'dictionary-v1' || !Array.isArray(payload.columns) ||
      !payload.dictionary || !Array.isArray(payload.rows)) {
    throw new Error('Formato de detalle comercial no válido.');
  }
  const columns = payload.columns;
  if (new Set(columns).size !== columns.length) throw new Error('Columnas repetidas en detalle comercial.');
  if (columns.some(column => !column || ['__proto__', 'constructor', 'prototype'].includes(column))) {
    throw new Error('Columna comercial no válida.');
  }
  return payload.rows.map((values, rowIndex) => {
    if (rowIndex % 4096 === 0) signal?.throwIfAborted();
    if (!Array.isArray(values) || values.length !== columns.length) throw new Error('Fila comercial incompleta.');
    const record: Record<string, unknown> = {};
    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index];
      const dictionary = payload.dictionary[column];
      const value = values[index];
      if (dictionary) {
        record[column] = indexedValue(dictionary, value);
      } else {
        record[column] = value;
      }
    }
    return record as T;
  });
}

export function decodeDailyCompact<D extends object, H extends object>(payload: DailyCompact, signal?: AbortSignal): {
  dailyStore: D[]; hourlySales: H[];
} {
  if (payload?.encoding !== 'daily-v1' || !payload.dictionary ||
      !Array.isArray(payload.dailyStore) || !Array.isArray(payload.hourlySales)) {
    throw new Error('Formato diario no válido.');
  }
  const dateParts = (value: unknown) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Fecha diaria no válida.');
    const year = Number(value.slice(0, 4)); const month = Number(value.slice(5, 7));
    if (month < 1 || month > 12) throw new Error('Mes diario no válido.');
    return { date: value, year, month, periodId: year * 100 + month };
  };
  const dimensions = ['date', 'storeId', 'category', 'line', 'subline', 'brand'];
  const optional = ['net', 'target', 'traffic', 'personnel', 'received'];
  const dailyStore = payload.dailyStore.map((values, rowIndex) => {
    if (rowIndex % 4096 === 0) signal?.throwIfAborted();
    if (!Array.isArray(values) || values.length < 14) throw new Error('Fila diaria incompleta.');
    const mask = values[13];
    if (typeof mask !== 'number' || !Number.isInteger(mask) || mask < 0 || mask > 31) throw new Error('Máscara diaria no válida.');
    const requiredLength = 14 + optional.filter((_, index) => mask & (1 << index)).length;
    if (values.length !== requiredLength) throw new Error('Fila diaria incompleta.');
    const dimensionsDecoded = Object.fromEntries(dimensions.map((column, index) => [
      column, indexedValue(payload.dictionary[column], values[index]),
    ]));
    const record: Record<string, unknown> = {
      ...dateParts(dimensionsDecoded['date']), ...dimensionsDecoded,
      bandOrder: values[6], gross: values[7], positiveReal: values[8], notes: values[9],
      discount: values[10], transactions: values[11], units: values[12],
    };
    let position = 14;
    optional.forEach((column, index) => {
      record[column] = mask & (1 << index) ? values[position++] : index === 0 ? values[8] : 0;
    });
    return record as D;
  });
  const hourlySales = payload.hourlySales.map((values, rowIndex) => {
    if (rowIndex % 4096 === 0) signal?.throwIfAborted();
    if (!Array.isArray(values) || values.length !== 5) throw new Error('Fila horaria incompleta.');
    const date = indexedValue(payload.dictionary['date'], values[0]);
    return {
      date, periodId: dateParts(date).periodId, storeId: indexedValue(payload.dictionary['storeId'], values[1]),
      hour: values[2], transactions: values[3], net: values[4],
    } as H;
  });
  return { dailyStore, hourlySales };
}

export function decodePredictiveCompact<T extends object>(payload: PredictiveCompact, signal?: AbortSignal): {
  note: string; rows: T[];
} {
  if (payload?.encoding !== 'predictive-v1' || typeof payload.note !== 'string' ||
      !payload.dictionary || !Array.isArray(payload.rows)) {
    throw new Error('Formato predictivo no válido.');
  }
  const metrics = ['units60', 'units90', 'merma30', 'merma60', 'merma90'];
  const rows = payload.rows.map((values, rowIndex) => {
    if (rowIndex % 4096 === 0) signal?.throwIfAborted();
    if (!Array.isArray(values) || values.length < 3) throw new Error('Fila predictiva incompleta.');
    const mask = values[2];
    if (typeof mask !== 'number' || !Number.isInteger(mask) || mask < 0 || mask > 31 ||
        values.length !== 3 + metrics.filter((_, index) => mask & (1 << index)).length) {
      throw new Error('Máscara predictiva no válida.');
    }
    const record: Record<string, unknown> = {
      storeId: indexedValue(payload.dictionary.storeId, values[0]),
      productId: indexedValue(payload.dictionary.productId, values[1]),
    };
    let position = 3;
    metrics.forEach((metric, index) => {
      record[metric] = mask & (1 << index) ? values[position++] : index === 1 ? record['units60'] : 0;
    });
    return record as T;
  });
  return { note: payload.note, rows };
}

export function decodeStockCompact<T extends object>(payload: StockCompact, signal?: AbortSignal): T[] {
  if (payload?.encoding !== 'stock-v1' || !Array.isArray(payload.stores) ||
      !Array.isArray(payload.products) || !Array.isArray(payload.rows)) {
    throw new Error('Formato de stock no válido.');
  }
  const metadata = ['productId', 'productCode', 'product', 'category', 'line', 'subline', 'brand'];
  const metrics = ['stockValue', 'goodUnits', 'mermaStockUnits', 'desmedroStockUnits',
    'units30', 'sales30', 'units12', 'sales12'];
  return payload.rows.map((values, rowIndex) => {
    if (rowIndex % 4096 === 0) signal?.throwIfAborted();
    if (!Array.isArray(values) || values.length < 4 || typeof values[2] !== 'number') {
      throw new Error('Fila de stock incompleta.');
    }
    const mask = values[3];
    if (typeof mask !== 'number' || !Number.isInteger(mask) || mask < 0 || mask > 255 ||
        values.length !== 4 + metrics.filter((_, index) => mask & (1 << index)).length) {
      throw new Error('Máscara de stock no válida.');
    }
    const product = indexedValue(payload.products, values[1]);
    if (!Array.isArray(product) || product.length !== metadata.length) throw new Error('SKU de stock no válido.');
    const record: Record<string, unknown> = {
      storeId: indexedValue(payload.stores, values[0]),
      stockUnits: values[2],
    };
    metadata.forEach((column, index) => { record[column] = product[index]; });
    let position = 4;
    metrics.forEach((metric, index) => {
      record[metric] = mask & (1 << index) ? values[position++] : index === 1 ? values[2] : 0;
    });
    return record as T;
  });
}
