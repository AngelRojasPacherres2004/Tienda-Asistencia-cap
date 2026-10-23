export type SizeRubro = 'CALZADO' | 'TEXTIL';
export type ShoeSizeSystem = 'USA' | 'EUR';

export type ProductSizeInput = {
  productCode?: string;
  category?: string;
  line?: string;
  product?: string;
};

export type ResolvedProductSize = {
  code: string;
  label: string;
  sort: number;
  gender: string;
};

type FootwearSize = {
  gender: 'CABALLERO' | 'DAMA' | 'KIDS' | 'JUVENIL' | 'BEBE';
  eu: number;
  us: number;
  code: string;
};

// Fuente: TABLA TALLAS GENERAL CALZADO.xlsx, Hoja1!A3:D56.
// El codigo es el sufijo USA de tres caracteres que viaja al final del codigo Nissei.
export const FOOTWEAR_SIZE_GUIDE: readonly FootwearSize[] = [
  ['CABALLERO', 39, 6, '006'], ['CABALLERO', 39.5, 6.5, '065'],
  ['CABALLERO', 40, 7, '007'], ['CABALLERO', 40.5, 7.5, '075'],
  ['CABALLERO', 41, 8, '008'], ['CABALLERO', 41.5, 8.5, '085'],
  ['CABALLERO', 42, 9, '009'], ['CABALLERO', 42.5, 9.5, '095'],
  ['CABALLERO', 43, 10, '010'], ['CABALLERO', 43.5, 10.5, '105'],
  ['CABALLERO', 44, 11, '011'], ['CABALLERO', 44.5, 11.5, '115'],
  ['CABALLERO', 45, 12, '012'], ['CABALLERO', 45.5, 12.5, '125'],
  ['CABALLERO', 46, 13, '013'], ['CABALLERO', 47, 13.5, '135'],
  ['CABALLERO', 47.5, 14, '014'], ['CABALLERO', 48, 14.5, '145'],
  ['DAMA', 35, 5, '005'], ['DAMA', 35.5, 5.5, '055'],
  ['DAMA', 36, 6, '006'], ['DAMA', 36.5, 6.5, '065'],
  ['DAMA', 37, 7, '007'], ['DAMA', 37.5, 7.5, '075'],
  ['DAMA', 38, 8, '008'], ['DAMA', 38.5, 8.5, '085'],
  ['DAMA', 39, 9, '009'], ['DAMA', 39.5, 9.5, '095'],
  ['DAMA', 40, 10, '010'], ['DAMA', 40, 11, '011'],
  ['KIDS', 27, 10.5, '105'], ['KIDS', 27.5, 11, '011'],
  ['KIDS', 28, 11.5, '115'], ['KIDS', 28.5, 12, '012'],
  ['KIDS', 29, 12.5, '125'], ['KIDS', 30, 13, '013'],
  ['KIDS', 31, 13.5, '135'], ['KIDS', 32, 1, '001'],
  ['KIDS', 33, 1.5, '015'], ['KIDS', 33.5, 2, '002'],
  ['JUVENIL', 34, 2.5, '025'], ['JUVENIL', 35, 3, '003'],
  ['JUVENIL', 35.5, 3.5, '035'], ['JUVENIL', 36, 4, '004'],
  ['JUVENIL', 36.5, 4.5, '045'], ['JUVENIL', 37, 5, '005'],
  ['JUVENIL', 37.5, 5.5, '055'], ['JUVENIL', 38, 6, '006'],
  ['BEBE', 21, 5, '005'], ['BEBE', 22, 6, '006'],
  ['BEBE', 23, 7, '007'], ['BEBE', 24, 8, '008'],
  ['BEBE', 25, 9, '009'], ['BEBE', 26, 10, '010'],
].map(([gender, eu, us, code]) => ({ gender, eu, us, code })) as readonly FootwearSize[];

const TEXTILE_SIZES: Readonly<Record<string, { label: string; sort: number; audience: 'KIDS' | 'JUVENIL' | 'ADULT' }>> = {
  '002': { label: '2', sort: 2, audience: 'KIDS' },
  '004': { label: '4', sort: 4, audience: 'KIDS' },
  '006': { label: '6', sort: 6, audience: 'KIDS' },
  '008': { label: '8', sort: 8, audience: 'KIDS' },
  '010': { label: '10', sort: 10, audience: 'KIDS' },
  '012': { label: '12', sort: 12, audience: 'JUVENIL' },
  '014': { label: '14', sort: 14, audience: 'JUVENIL' },
  '016': { label: '16', sort: 16, audience: 'JUVENIL' },
  '00S': { label: 'S', sort: 101, audience: 'ADULT' },
  '00M': { label: 'M', sort: 102, audience: 'ADULT' },
  '00L': { label: 'L', sort: 103, audience: 'ADULT' },
  '0XL': { label: 'XL', sort: 104, audience: 'ADULT' },
  '2XL': { label: '2XL', sort: 105, audience: 'ADULT' },
  '3XL': { label: '3XL', sort: 106, audience: 'ADULT' },
};

const FOOTWEAR_CODES = new Set(FOOTWEAR_SIZE_GUIDE.map(size => size.code));
const FOOTWEAR_BY_GENDER_CODE = new Map(FOOTWEAR_SIZE_GUIDE.map(size => [`${size.gender}|${size.code}`, size]));

function normalized(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function nisseiSizeCode(code?: string): string | null {
  const value = normalized(code).replace(/\s+/g, '').replace(/\.0+$/, '');
  return value.length >= 3 ? value.slice(-3) : null;
}

export function normalizeSizeGender(...values: Array<string | undefined>): string {
  const value = normalized(values.filter(Boolean).join(' '));
  if (/BEBE/.test(value)) return 'BEBE';
  if (/JUVEN|JOVENCIT/.test(value)) return 'JUVENIL';
  if (/\b(KIDS|NINO|NINA|INFANTIL)\b/.test(value)) return 'KIDS';
  if (/DAMA|MUJER|FEMEN/.test(value)) return 'DAMA';
  if (/CABALLERO|HOMBRE|MASCUL/.test(value)) return 'CABALLERO';
  return 'SIN GENERO';
}

function textileAudience(gender: string): 'KIDS' | 'JUVENIL' | 'ADULT' {
  if (gender === 'KIDS' || gender === 'BEBE') return 'KIDS';
  if (gender === 'JUVENIL') return 'JUVENIL';
  return 'ADULT';
}

export function resolveProductSize(input: ProductSizeInput, rubro: SizeRubro, system: ShoeSizeSystem = 'USA'): ResolvedProductSize | null {
  const code = nisseiSizeCode(input.productCode);
  if (!code) return null;
  const gender = normalizeSizeGender(input.line, input.product);
  if (rubro === 'TEXTIL') {
    const size = TEXTILE_SIZES[code];
    if (!size || size.audience !== textileAudience(gender)) return null;
    return { code, label: size.label, sort: size.sort, gender };
  }
  if (!FOOTWEAR_CODES.has(code)) return null;
  const match = FOOTWEAR_BY_GENDER_CODE.get(`${gender}|${code}`);
  if (system === 'EUR') {
    if (!match) return null;
    return { code, label: String(match.eu), sort: match.eu, gender };
  }
  const us = match?.us ?? FOOTWEAR_SIZE_GUIDE.find(size => size.code === code)?.us;
  return us == null ? null : { code, label: String(us), sort: us, gender };
}
