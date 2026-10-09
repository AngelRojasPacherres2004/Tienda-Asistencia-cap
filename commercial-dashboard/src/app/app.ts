import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { EChartsOption } from 'echarts';
import { DashboardAssistantWidgetComponent } from './assistant-widget';
import { AssistantService } from './assistant.service';
import { DashboardChartComponent } from './chart';
import { adaptiveValueScale } from './chart-scale';
import { CloudDataService } from './cloud-data.service';

type Store = {
  storeId: string; store: string; alias: string; format: string; cluster: string;
  isStore: boolean; areaM2: number; capacity: number; normalStaff?: number; campaignStaff?: number; openingDate?: string; closingDate?: string; status: string;
};
type Monthly = {
  periodId: number; year?: number; month?: number; storeId: string; gross: number; positiveReal: number;
  notes: number; discount: number; net: number; transactions: number; units: number; received: number;
  target?: number; traffic?: number; personnel?: number; category?: string; line?: string; subline?: string; bandOrder?: number;
  date?: string; brand?: string;
};
type CategoryTargetRow = { periodId: number; storeId: string; category: string; target: number; source?: 'DEFINIDA' | 'APROXIMADA' };
type PersonnelAreaRow = { periodId: number; storeId: string; area: string; areaType: string; personnel: number };
type PersonnelProfile = {
  name: string; storeId: string; gender: 'M' | 'F' | 'N/A'; birthDate?: string; birthdayMonth?: number; birthdayDay?: number;
  role: string; area: string; areaType: string; hireDate?: string; retirementDate?: string; retirementReason?: string; status: string;
};
type BrandRow = { periodId: number; storeId: string; category: string; line: string; subline: string; brand: string; net: number; units: number };
type PriceRangeRow = { periodId: number; storeId: string; category: string; line: string; subline: string; bandOrder: number; priceBand: string; net: number; units: number };
type SellerPerformanceRow = { periodId: number; storeId: string; category: string; line: string; subline: string; seller: string; net: number; units: number; transactions: number };
type ClientPerformanceRow = { periodId: number; storeId: string; category: string; line: string; subline: string; client: string; net: number; units: number; transactions: number };
type ProductRow = {
  storeId: string; productId: string; product: string; category: string; line: string; subline: string; brand: string;
  stockUnits: number; stockValue: number; goodUnits?: number; mermaStockUnits?: number; desmedroStockUnits?: number;
  units30: number; sales30: number; units12: number; sales12: number;
};
type StockOrigin = { storeId: string; category: string; line: string; subline: string; originPeriodId: number; units: number; value: number };
type PredictiveStore = { storeId: string; stockUnits: number; stockValue: number; units30: number; sales30: number; coverageDays: number | null; rotation: number | null };
type PredictiveCategory = { storeId: string; category: string; stockUnits: number; stockValue: number; units30: number; sales30: number; rotation: number | null };
type HourlySalesRow = { periodId: number; date?: string; storeId: string; hour: number; transactions: number; net: number };
type BrandSummary = { name: string; net: number; units: number; share: number; category: string };
type CategorySummary = { name: string; net: number; units: number; share: number; topLine: string; color: string };
type CategoryView = 'RUBRO' | 'LINEA';
type RankingMetric = 'ROTATION' | 'NET' | 'TICKET' | 'SALE_M2';
type GenderSummary = { name: string; net: number; units: number; share: number; averagePrice: number | null; topLine: string; color: string };
// Fila cruda del archivo dashboard-predictive.json: ventanas 30/60/90 de venta y merma
// ancladas al corte de stock/ventas (FactStock solo tiene una foto = el último corte,
// por eso el ancla NO se mueve con el filtro MES; ver nota en dashboard-predictive.json).
type PredictiveRow = { storeId: string; productId: string; units60: number; units90: number; merma30: number; merma60: number; merma90: number };
type PredictiveCalculation = {
  cutoffDate: string; windowDays: number; unitsSold: number; unitsMermadas: number; mermaPct: number;
  vendability: number; demandDaily: number; annualDemand: number; stockActual: number; stockVendible: number;
  coverageDays: number | null;
};
type DataWarning = { source: string; message: string };
type DashboardData = {
  metadata: {
    generatedAt: string; salesCutoff: string; stockCutoff: string; years: number[]; nonSellableRate: number;
    selectedCutoff?: string; salesDataThrough?: string | null; stockDataThrough?: string | null;
    dataWarnings?: DataWarning[];
    eoq: { available: boolean; pilot: boolean; orderCost: number; annualHoldingCost: number };
    rop: { available: boolean; pilot: boolean; leadTimeDays: number; safetyStockUnits: number };
    coverageRanges: { min: number; max: number; label: string; color: string }[]; capacityIsProvisional: boolean;
  };
  stores: Store[]; monthlyStore: Monthly[]; monthlyPersonnelArea: PersonnelAreaRow[]; personnelProfiles?: PersonnelProfile[]; monthlyCategory: Monthly[]; monthlyCategoryTarget?: CategoryTargetRow[]; monthlyLine: Monthly[];
  monthlyHourlySales?: HourlySalesRow[];
  dailyStore?: Monthly[];
  dailyTraffic?: { date: string; storeId: string; traffic: number }[];
  dailyReceived?: { date: string; storeId: string; received: number }[];
  // Reposición conciliada entre cortes de stock y ventas. Solo cubre huecos
  // cuando el input FactIngresos no tiene movimientos para la tienda/período.
  inferredReceivedDaily?: { storeId: string; daily: number }[];
  monthlySubline: Monthly[]; monthlyBrand: BrandRow[]; monthlyPriceRange: PriceRangeRow[]; sellerPerformance?: SellerPerformanceRow[]; clientPerformance?: ClientPerformanceRow[];
  hierarchyCatalog: { category: string; line: string; subline: string }[];
  stockStore: { storeId: string; units: number; value: number; capacity: number }[];
  stockOrigin: StockOrigin[]; stockProducts: ProductRow[]; predictiveStore: PredictiveStore[]; predictiveCategory: PredictiveCategory[];
};

type Detail = { label: string; value: string };
type CoverageRow = { storeId: string; alias: string; stockUnits: number; effectiveUnits: number; stockValue: number; units30: number; sales30: number; days: number | null; status: string; color: string };
type StockAggregate = { stockUnits: number; stockValue: number; units30: number; sales30: number };
type ProductAggregate = { name: string; units: number; value: number };
type PredictiveBrand = {
  name: string; stockUnits: number; stockValue: number; vendibleUnits: number; vendibleValue: number;
  demandUnits: number; demandDaily: number; coverageDays: number | null; status: string; color: string;
  targetUnits: number; deficitUnits: number; priority: string; priorityColor: string; priorityIndex: number;
};
type FilterKey = 'month' | 'store' | 'category' | 'gender' | 'line' | 'subline' | 'cluster' | 'format';
type StockHistoryBucket = 'ALL' | '2026' | '2025' | '2024' | '2023' | '2022' | '2021' | '2020' | '2019_PLUS';
type RotationView = 'rotation' | 'inventory';
type PredictiveTimeUnit = 'MONTHS' | 'YEARS';
type LeadTimeUnit = 'DAYS' | 'MONTHS';
type InventoryMatrixRow = {
  storeId: string; alias: string; capacity: number; stockUnits: number; stockValue: number; units30: number; dailySales: number;
  receivedDaily: number;
  coverageDays: number | null; targetStock: number | null; gapUnits: number | null;
  status: 'DÉFICIT' | 'ÓPTIMO' | 'EXCESO';
  tone: 'deficit' | 'optimal' | 'excess'; color: string;
};

const C = {
  navy: '#123A8C', red: '#E11D2E', gold: '#F4B400', teal: '#0F9D8A', purple: '#6F42C1',
  indigo: '#4F46E5', green: '#16A34A', blue: '#2878D0', orange: '#F97316', slate: '#64748B', pale: '#E8EDF6'
};
const CATEGORY_COLORS = [C.navy, C.red, C.blue, C.gold, C.teal, C.purple, C.orange, '#94A3B8', '#0EA5E9', '#84CC16', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6', '#A16207', '#64748B'];
const GENDER_COLORS: Record<string, string> = { DAMA: '#C91482', CABALLERO: '#1428D4', BEBE: '#F97316', JOVENCITA: '#7C3AED', JOVENCITO: '#0F9D8A', 'NIÑO': '#16A34A', 'NIÑA': '#EC4899', UNISEX: '#F4B400' };
const GENDER_ORDER = ['DAMA', 'CABALLERO', 'BEBE', 'JOVENCITA', 'JOVENCITO', 'NIÑO', 'NIÑA', 'UNISEX'];
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function sum<T>(rows: T[], field: keyof T): number {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}
function grouped<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row); const bucket = out.get(value);
    if (bucket) bucket.push(row); else out.set(value, [row]);
  }
  return out;
}
function safe(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c] || c);
}
function denseRanks(values: Array<number | null>, descending = true): Map<number, number> {
  const unique = [...new Set(values.filter((value): value is number => value != null && Number.isFinite(value)))]
    .sort((a, b) => descending ? b - a : a - b);
  return new Map(unique.map((value, index) => [value, index + 1]));
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, DashboardChartComponent, DashboardAssistantWidgetComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  readonly cloud = inject(CloudDataService);
  private readonly assistant = inject(AssistantService);
  readonly Math = Math;
  readonly monthNamesFull = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  readonly data = signal<DashboardData | null>(null);
  readonly dataWarnings = computed(() => this.data()?.metadata.dataWarnings ?? []);
  readonly salesCutoffYear = computed(() => Number(this.data()?.metadata.salesCutoff?.slice(0, 4)) || new Date().getFullYear());
  readonly loadingError = signal('');
  readonly loginEmail = signal('');
  readonly loginPassword = signal('');
  readonly loginBusy = signal(false);
  readonly detailLoading = signal(false);
  readonly predictiveDetailLoading = signal(false);
  readonly brandDetailLoaded = signal(false); readonly sublineDetailLoaded = signal(false); readonly stockOriginLoaded = signal(false); readonly stockDetailLoaded = signal(false); readonly priceRangeDetailLoaded = signal(false);
  readonly stockDetailFailed = signal(false);
  readonly predictiveDetailLoaded = signal(false);
  readonly predictiveDetailFailed = signal(false);
  readonly predictiveIndex = signal<Map<string, PredictiveRow>>(new Map());
  readonly predictiveNote = signal('');
  readonly sectionAdvices = signal<Record<string, { text: string; loading: boolean; error: boolean }>>({});
  readonly sellerDetailLoaded = signal(false);
  readonly sellerDetailLoading = signal(false);
  readonly sellerPerformanceData = signal<SellerPerformanceRow[]>([]);
  readonly stockProductsData = signal<ProductRow[]>([]);
  readonly priceRangeData = signal<PriceRangeRow[]>([]);
  readonly stockOriginData = signal<StockOrigin[]>([]);
  readonly staticPredictiveProductsData = signal<ProductRow[]>([]);
  readonly stockAggregateByStore = signal<Map<string, StockAggregate>>(new Map());
  readonly predictiveAggregateByStore = signal<Map<string, StockAggregate>>(new Map());
  readonly predictiveAggregateByProduct = signal<Map<string, ProductAggregate>>(new Map());
  // Índices de inventario construidos una sola vez al cargar el detalle de productos.
  // Evitan recorrer las ~240k filas de stock desde cero en cada cambio de filtro.
  private stockProductsByStore = new Map<string, ProductRow[]>();
  private stockProductsByCategory = new Map<string, ProductRow[]>();
  private predictiveProductsByProduct = new Map<string, ProductRow[]>();

  // Índices livianos para no recorrer 100k–250k filas en cada cambio de filtro.
  // Clave: periodo|tienda. Se construyen una sola vez al cargar cada JSON.
  private monthlyStoreIndex = new Map<string, Monthly[]>();
  private dailyStoreRows: Monthly[] = [];
  private dailyHourlySalesRows: HourlySalesRow[] = [];
  private dailyDetailPromise?: Promise<void>;
  private dailyDetailRange = '';
  readonly dailyDetailLoaded = signal(false);
  private dailyTrafficRows: { date: string; storeId: string; traffic: number }[] = [];
  private dailyReceivedRows: { date: string; storeId: string; received: number }[] = [];
  private monthlyPersonnelAreaIndex = new Map<string, PersonnelAreaRow[]>();
  private monthlyCategoryIndex = new Map<string, Monthly[]>();
  private monthlyCategoryTargetIndex = new Map<string, CategoryTargetRow[]>();
  private monthlyLineIndex = new Map<string, Monthly[]>();
  private monthlySublineIndex = new Map<string, Monthly[]>();
  private monthlyBrandIndex = new Map<string, BrandRow[]>();
  private monthlyPriceRangeIndex = new Map<string, PriceRangeRow[]>();
  private brandDetailPromise?: Promise<void>;
  private sublineDetailPromise?: Promise<void>;
  private stockOriginPromise?: Promise<void>;
  private stockDetailPromise?: Promise<void>;
  private legacyStockPromise?: Promise<{ stockOrigin: StockOrigin[]; stockProducts: ProductRow[] }>;
  private predictiveDetailPromise?: Promise<void>;
  private priceRangeDetailPromise?: Promise<void>;
  private sellerDetailPromise?: Promise<void>;
  private pageOverflowBeforeModal = '';

  private indexPeriodStore<T extends { periodId: number; storeId: string }>(rows: T[]): Map<string, T[]> {
    const index = new Map<string, T[]>();
    for (const row of rows) {
      const key = `${row.periodId}|${row.storeId}`;
      const bucket = index.get(key);
      if (bucket) bucket.push(row); else index.set(key, [row]);
    }
    return index;
  }

  private async indexPeriodStoreAsync<T extends { periodId: number; storeId: string }>(rows: T[]): Promise<Map<string, T[]>> {
    const index = new Map<string, T[]>();
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const key = `${row.periodId}|${row.storeId}`;
      const bucket = index.get(key);
      if (bucket) bucket.push(row); else index.set(key, [row]);
      if (i > 0 && i % 10_000 === 0) await this.yieldToBrowser();
    }
    return index;
  }

  private yieldToBrowser(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  private nextPaint(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  private indexedRows<T>(index: Map<string, T[]>, periods: Iterable<number>, storeIds: Iterable<string>): T[] {
    const out: T[] = [];
    for (const period of periods) {
      for (const storeId of storeIds) {
        const bucket = index.get(`${period}|${storeId}`);
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }

  private rangePeriods(fromPeriod: number, toPeriod: number): number[] {
    const out: number[] = [];
    let year = Math.floor(fromPeriod / 100), month = fromPeriod % 100;
    const endYear = Math.floor(toPeriod / 100), endMonth = toPeriod % 100;
    while (year < endYear || (year === endYear && month <= endMonth)) {
      out.push(year * 100 + month);
      month += 1;
      if (month === 13) { month = 1; year += 1; }
    }
    return out;
  }
  readonly page = signal<1 | 2 | 3>(1);
  readonly expandedChart = signal<string | null>(null);
  readonly year = signal(0);
  // Filtros múltiples. Arreglo vacío = TODOS / ACUMULADO.
  readonly selectedMonths = signal<number[]>([]);
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly categoryView = signal<CategoryView>('RUBRO');
  readonly rankingMetrics = signal<RankingMetric[]>(['ROTATION', 'NET', 'TICKET', 'SALE_M2']);
  readonly selectedStores = signal<string[]>([]);
  readonly selectedCategories = signal<string[]>([]);
  readonly selectedGenders = signal<string[]>([]);
  readonly selectedLines = signal<string[]>([]);
  readonly selectedSublines = signal<string[]>([]);
  readonly openFilter = signal<FilterKey | null>(null);
  readonly filterSearch = signal<Record<FilterKey, string>>({ month: '', store: '', category: '', gender: '', line: '', subline: '', cluster: '', format: '' });
  // Vacío equivale a GENERAL. Los años pueden combinarse libremente.
  readonly stockHistoryBucketsSelected = signal<StockHistoryBucket[]>([]);
  readonly rotationView = signal<RotationView>('rotation');
  readonly trainingAudience = signal<'SELLERS' | 'ADMINISTRATORS'>('SELLERS');
  readonly coverageProjectionHorizon = signal<0 | 30 | 60 | 90>(0);
  readonly stockHistoryBuckets: { value: StockHistoryBucket; label: string; title: string }[] = [
    { value: 'ALL', label: 'GENERAL', title: 'Todo el histórico' },
    { value: '2026', label: '2026', title: 'Origen 2026' },
    { value: '2025', label: '2025', title: 'Origen 2025' },
    { value: '2024', label: '2024', title: 'Origen 2024' },
    { value: '2023', label: '2023', title: 'Origen 2023' },
    { value: '2022', label: '2022', title: 'Origen 2022' },
    { value: '2021', label: '2021', title: 'Origen 2021' },
    { value: '2020', label: '2020', title: 'Origen 2020' },
    { value: '2019_PLUS', label: '2019+', title: '2019 y años anteriores' },
  ];
  readonly selectedClusters = signal<string[]>([]); readonly selectedFormats = signal<string[]>([]);
  readonly storeFilterLocked = computed(() => this.cloud.accessProfile()?.scopeType === 'store');
  readonly clusterFilterLocked = computed(() => {
    const scope = this.cloud.accessProfile()?.scopeType;
    return scope === 'store' || scope === 'cluster';
  });
  readonly productId = signal('AUTO');
  readonly demandWindow = signal(30);
  readonly demandWindowUnit = signal<PredictiveTimeUnit>('MONTHS');
  readonly orderCost = signal(5000); readonly holdingCost = signal(8);
  readonly replenishmentType = signal<'internal' | 'supplier'>('internal');
  // Lead time manual en ambos casos: FactGuiasTransito solo registra guías EN TRÁNSITO/INCOMPLETO
  // (no hay histórico de guías ya recepcionadas), así que "interno" no se puede calcular todavía.
  readonly internalLeadTime = signal(30);
  readonly leadTimeUnit = signal<LeadTimeUnit>('DAYS');
  readonly supplierLeadTime = signal<15 | 30 | 45 | 60 | 90>(30);
  readonly securityDays = signal<7 | 15 | 30>(15);
  // Parámetros exclusivos de Analítica Predictiva. El análisis siempre se limita
  // a TEXTIL y CALZADO, aun cuando el tablero comercial tenga otro rubro activo.
  readonly predictiveRubros = signal<string[]>(['TEXTIL', 'CALZADO']);
  readonly genderRubros = signal<string[]>(['TEXTIL', 'CALZADO']);
  readonly predictiveStore = signal('TODAS');
  readonly healthyCoverageDays = signal(30);
  readonly healthyCoverageUnit = signal<PredictiveTimeUnit>('MONTHS');
  readonly overstockDays = signal(90);
  readonly overstockUnit = signal<PredictiveTimeUnit>('MONTHS');
  readonly noMovementMonths = signal(3);
  readonly noMovementUnit = signal<PredictiveTimeUnit>('MONTHS');
  readonly predictiveMermaPct = signal(2);
  readonly dayFilterEnabled = computed(() => this.selectedMonths().length === 1);
  readonly dateRangeActive = computed(() => !!this.fromDate() || !!this.toDate());
  readonly dayFilterLoading = signal(false);
  readonly dayFilterError = signal('');
  private shortDay(iso: string): string {
    const [, month, day] = iso.split('-');
    return month && day ? `${day}/${month}` : iso;
  }
  readonly dayFilterLabel = computed(() => {
    const from = this.fromDate();
    const to = this.toDate();
    if (!from) return 'TODOS';
    return to ? `${this.shortDay(from)} - ${this.shortDay(to)}` : this.shortDay(from);
  });
  readonly dayFilterMin = computed(() => {
    if (!this.dayFilterEnabled()) return '';
    const m = this.selectedMonths()[0];
    return `${this.year()}-${String(m).padStart(2, '0')}-01`;
  });
  readonly dayFilterMax = computed(() => {
    if (!this.dayFilterEnabled()) return '';
    const month = this.selectedMonths()[0]; const last = new Date(Date.UTC(this.year(), month, 0)).getUTCDate();
    const cutoff = this.data()?.metadata.salesCutoff || `${this.year()}-${String(month).padStart(2, '0')}-${last}`;
    return cutoff.slice(0, 7) === `${this.year()}-${String(month).padStart(2, '0')}` ? cutoff : `${this.year()}-${String(month).padStart(2, '0')}-${last}`;
  });

  readonly calendarOpen = signal(false);

  readonly calendarDays = computed(() => {
    if (!this.dayFilterEnabled()) return [];
    const year = this.year();
    const month = this.selectedMonths()[0];
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0 = Domingo
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const maxDate = this.dayFilterMax();

    const blanks = Array.from({ length: firstDayOfWeek }, (_, i) => ({ blank: true, key: `b-${i}`, day: 0, date: '', disabled: true }));
    const days = Array.from({ length: lastDayOfMonth }, (_, i) => {
      const dayNum = i + 1;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const disabled = !!maxDate && dateStr > maxDate;
      return {
        blank: false,
        key: dateStr,
        day: dayNum,
        date: dateStr,
        disabled,
      };
    });
    return [...blanks, ...days];
  });

  async onCalendarDayClick(dateStr: string): Promise<void> {
    if (!dateStr || !this.dayFilterEnabled() || this.dayFilterLoading()) return;
    const range = this.nextDayRange(dateStr);
    this.dayFilterLoading.set(true);
    this.dayFilterError.set('');
    try {
      await this.ensureDailyDetail(range.from, range.to);
      const month = this.selectedMonths()[0];
      const expectedPrefix = `${this.year()}-${String(month).padStart(2, '0')}`;
      if (!range.from.startsWith(expectedPrefix)) return;
      this.fromDate.set(range.from); this.toDate.set(range.to === range.from ? '' : range.to);
    } catch {
      this.dayFilterError.set('No se pudo cargar ese día. Intenta nuevamente.');
    } finally {
      this.dayFilterLoading.set(false);
    }
  }

  toggleCalendar(): void {
    if (!this.dayFilterEnabled()) return;
    this.calendarOpen.set(!this.calendarOpen());
  }

  closeCalendar(): void {
    this.calendarOpen.set(false);
  }

  readonly selectedMonthSingle = computed(() => this.selectedMonths().length === 1 ? this.selectedMonths()[0] : 0);
  onMonthSelectChange(val: any): void {
    const m = Number(val);
    if (m === 0) {
      this.selectedMonths.set([]);
    } else {
      this.selectedMonths.set([m]);
    }
    this.clearDateRange();
    this.calendarOpen.set(false);
  }

  readonly selectedStoreSingle = computed(() => this.selectedStores().length === 1 ? this.selectedStores()[0] : 'TODAS');
  onStoreSelectChange(val: string): void {
    if (!val || val === 'TODAS') {
      this.selectedStores.set([]);
    } else {
      this.selectedStores.set([val]);
    }
    this.productId.set('AUTO');
  }

  readonly selectedCategorySingle = computed(() => this.selectedCategories().length === 1 ? this.selectedCategories()[0] : 'TODOS');
  onCategorySelectChange(val: string): void {
    if (!val || val === 'TODOS') {
      this.selectedCategories.set([]);
      this.selectedGenders.set([]);
      this.selectedLines.set([]);
      this.selectedSublines.set([]);
    } else {
      this.selectedCategories.set([val]);
      this.selectedLines.set([]);
      this.selectedSublines.set([]);
    }
    this.productId.set('AUTO');
    this.deferHierarchyDetails();
  }

  readonly selectedGenderSingle = computed(() => this.selectedGenders().length === 1 ? this.selectedGenders()[0] : 'TODOS');
  onGenderSelectChange(val: string): void {
    if (!val || val === 'TODOS') {
      this.selectedGenders.set([]);
    } else {
      this.selectedGenders.set([val]);
    }
    this.productId.set('AUTO');
  }

  readonly selectedLineSingle = computed(() => this.selectedLines().length === 1 ? this.selectedLines()[0] : 'TODAS');
  onLineSelectChange(val: string): void {
    if (!val || val === 'TODAS') {
      this.selectedLines.set([]);
      this.selectedSublines.set([]);
    } else {
      this.selectedLines.set([val]);
      this.selectedSublines.set([]);
    }
    this.productId.set('AUTO');
    this.deferHierarchyDetails();
  }

  readonly selectedSublineSingle = computed(() => this.selectedSublines().length === 1 ? this.selectedSublines()[0] : 'TODAS');
  onSublineSelectChange(val: string): void {
    if (!val || val === 'TODAS') {
      this.selectedSublines.set([]);
    } else {
      this.selectedSublines.set([val]);
    }
    this.productId.set('AUTO');
    this.deferHierarchyDetails();
  }

  private hasMonthlyData(row: Monthly): boolean {
    return [row.gross, row.positiveReal, row.notes, row.discount, row.net, row.transactions, row.units,
      row.received, row.traffic, row.personnel]
      .some(value => Math.abs(Number(value) || 0) > 0);
  }

  private isPredictiveProduct(row: ProductRow): boolean {
    if (row.category !== 'TEXTIL' && row.category !== 'CALZADO') return false;
    const product = row.product.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ');
    return !(/BOLSA(S)? (DE )?(PLASTICO|PAPEL)/.test(product) || /BOLSA -?NO TEJIDA/.test(product));
  }

  private periodStart(period: number): string {
    const year = Math.floor(period / 100); const month = period % 100;
    return `${year}-${String(month).padStart(2, '0')}-01`;
  }

  private periodEnd(period: number): string {
    const year = Math.floor(period / 100); const month = period % 100;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  private storeOverlapsPeriod(store: Store, fromPeriod: number, toPeriod: number): boolean {
    const from = this.periodStart(fromPeriod); const to = this.periodEnd(toPeriod);
    if (store.openingDate && store.openingDate > to) return false;
    if (store.closingDate && store.closingDate < from) return false;
    return true;
  }

  private storeActiveAtDate(store: Store, date: string): boolean {
    return store.isStore && (!store.openingDate || store.openingDate <= date) && (!store.closingDate || store.closingDate >= date);
  }

  readonly availableMonths = computed(() => {
    const d = this.data(); if (!d) return [];
    const cutoffYear = Number(d.metadata.salesCutoff.slice(0, 4));
    const cutoffMonth = Number(d.metadata.salesCutoff.slice(5, 7));
    const storeIds = new Set(d.stores.filter(store => store.isStore && this.storeAllowedByAccess(store)).map(store => store.storeId));
    const periods = d.monthlyStore
      .filter(row => Math.floor(row.periodId / 100) === this.year())
      .filter(row => this.year() !== cutoffYear || row.periodId % 100 <= cutoffMonth)
      .filter(row => storeIds.has(row.storeId) && this.hasMonthlyData(row))
      .map(row => row.periodId % 100);
    return [...new Set(periods)].sort((a, b) => a - b);
  });
  readonly activeMonths = computed(() => {
    const available = new Set(this.availableMonths());
    const selected = this.selectedMonths().filter(month => available.has(month));
    return (selected.length ? selected : this.availableMonths()).slice().sort((a, b) => a - b);
  });
  // Sin filtro de mes, los indicadores mensuales usan siempre el último mes disponible.
  readonly latestAvailableMonth = computed(() => this.availableMonths().at(-1) ?? 12);
  readonly selectedMonth = computed(() => this.activeMonths().at(-1) ?? this.latestAvailableMonth());
  readonly selectedPeriod = computed(() => this.year() * 100 + this.selectedMonth());
  readonly selectedPeriods = computed(() => new Set(this.activeMonths().map(month => this.year() * 100 + month)));
  readonly contextFromPeriod = computed(() => this.year() * 100 + (this.activeMonths().at(0) ?? 1));
  readonly selectedToPeriod = computed(() => this.year() * 100 + (this.activeMonths().at(-1) ?? 12));

  private categoryMatches(value?: string): boolean {
    const selected = this.selectedCategories();
    return !selected.length || (!!value && selected.includes(value));
  }
  readonly genderFilterEnabled = computed(() => {
    const categories = this.selectedCategories();
    return categories.length > 0 && categories.every(value => value === 'TEXTIL' || value === 'CALZADO');
  });
  readonly genderOptions = computed(() => this.genderFilterEnabled() ? GENDER_ORDER : []);
  readonly genderFilterLabel = computed(() => this.multiLabel(this.selectedGenders(), 'TODOS', 'GÉNEROS'));
  private genderMatches(line?: string): boolean {
    const selected = this.selectedGenders();
    return !this.genderFilterEnabled() || !selected.length || selected.includes(this.genderFromLine(line) || '');
  }
  private lineMatches(value?: string): boolean {
    const selected = this.selectedLines();
    return !selected.length || (!!value && selected.includes(value));
  }
  private sublineMatches(value?: string): boolean {
    const selected = this.selectedSublines();
    return !selected.length || (!!value && selected.includes(value));
  }

  private isDistributionChannel(store: Store): boolean {
    const key = this.normalized(`${store.storeId} ${store.store} ${store.alias}`);
    return store.storeId === 'T019' || store.storeId === 'T020' || key.includes('ONLINE') || /(^| )CD( |$)/.test(key);
  }
  private storeBelongsToSelectedCluster(store: Store): boolean {
    const clusters = this.selectedClusters();
    if (this.isDistributionChannel(store)) return clusters.includes('CD');
    return store.isStore && (!clusters.length || clusters.includes(store.cluster));
  }
  private formatMatches(store: Store): boolean {
    const formats = this.selectedFormats();
    return !formats.length || formats.includes(store.format);
  }
  private storeSupportsSelectedScope(store: Store): boolean {
    return this.storeAllowedByAccess(store) && this.storeBelongsToSelectedCluster(store) && this.formatMatches(store);
  }
  private storeAllowedByAccess(store: Store): boolean {
    const access = this.cloud.accessProfile();
    if (!access || access.scopeType === 'all') return true;
    if (access.scopeType === 'none') return false;
    if (access.scopeType === 'cluster') {
      const allowed = new Set(access.clusters.map(value => this.normalized(value)));
      return allowed.has(this.normalized(store.cluster));
    }
    const storeKey = this.normalized(`${store.storeId} ${store.store} ${store.alias}`);
    return access.stores.some(value => {
      const normalized = this.normalized(value);
      return normalized === this.normalized(store.storeId)
        || normalized === this.normalized(store.store)
        || normalized === this.normalized(store.alias)
        || storeKey.includes(normalized);
    });
  }

  // Universo de tiendas del AÑO, independiente del filtro MES. Esto evita que una
  // tienda seleccionada desaparezca del filtro simplemente porque se cambió de mes.
  // Si una tienda ya estaba seleccionada, se conserva incluso al cambiar de año;
  // en un año sin movimiento simplemente devolverá 0, pero el filtro no se pierde.
  readonly yearStoreUniverse = computed(() => {
    const d = this.data(); if (!d) return [];
    const from = this.year() * 100 + 1; const to = this.year() * 100 + 12;
    const selected = new Set(this.selectedStores());
    return d.stores.filter(store => this.storeAllowedByAccess(store) && this.storeBelongsToSelectedCluster(store) && (
      this.storeOverlapsPeriod(store, from, to) || selected.has(store.storeId)
    ));
  });
  readonly clusters = computed(() => {
    const d = this.data();
    const allowedStores = (d?.stores || []).filter(store => this.storeAllowedByAccess(store));
    const values = new Set(allowedStores.filter(s => s.isStore).map(s => s.cluster).filter(Boolean));
    if (allowedStores.some(store => this.isDistributionChannel(store))) values.add('CD');
    this.selectedClusters().forEach(value => { if (values.has(value)) values.add(value); });
    return [...values].sort();
  });
  readonly formats = computed(() => {
    const values = new Set(this.yearStoreUniverse()
      .filter(s => this.storeBelongsToSelectedCluster(s))
      .map(s => s.format).filter(Boolean));
    this.selectedFormats().forEach(value => values.add(value));
    return [...values].sort();
  });
  readonly storeOptions = computed(() => this.yearStoreUniverse().filter(s =>
    this.storeSupportsSelectedScope(s)
  ));
  readonly filteredStores = computed(() => {
    const selected = new Set(this.selectedStores());
    const options = this.storeOptions();
    return selected.size ? options.filter(store => selected.has(store.storeId)) : options;
  });
  readonly filteredStoreIds = computed(() => new Set(this.filteredStores().map(s => s.storeId)));

  // Contexto histórico anual para visuales que deben IGNORAR el filtro MES.
  // Sí respeta Año, Clúster, Formato y Tienda. El filtro de producto se aplica
  // después sobre las filas de venta para no inventar una meta por rubro/línea.
  readonly historicalYearStoreIds = computed(() => {
    const d = this.data(); if (!d) return new Set<string>();
    const from = this.year() * 100 + 1; const to = this.year() * 100 + 12;
    const selected = new Set(this.selectedStores());
    return new Set(d.stores
      .filter(store => this.storeAllowedByAccess(store) && this.storeBelongsToSelectedCluster(store) && this.storeOverlapsPeriod(store, from, to))
      .filter(store => this.formatMatches(store))
      .filter(store => !selected.size || selected.has(store.storeId))
      .map(store => store.storeId));
  });
  // Universo anual de la jerarquía de producto. Deliberadamente NO depende de MES:
  // cambiar Ene/Feb/Mar no puede borrar Rubro, Línea o Sublínea ya seleccionados.
  readonly historicalYearPeriods = computed(() => {
    const limit = this.yearOnlyMonthLimit(this.year());
    return this.rangePeriods(this.year() * 100 + 1, this.year() * 100 + limit);
  });

  readonly categories = computed(() => {
    const ids = this.historicalYearStoreIds();
    const rows = this.indexedRows(this.monthlyCategoryIndex, this.historicalYearPeriods(), ids);
    const values = new Set(rows.filter(row => this.hasMonthlyData(row)).map(row => row.category).filter(Boolean) as string[]);
    this.selectedCategories().forEach(value => values.add(value));
    return [...values].sort();
  });
  readonly lines = computed(() => {
    const ids = this.historicalYearStoreIds();
    const rows = this.indexedRows(this.monthlyLineIndex, this.historicalYearPeriods(), ids);
    const values = new Set(rows.filter(row => this.hasMonthlyData(row) && this.categoryMatches(row.category)).map(row => row.line).filter(Boolean) as string[]);
    this.selectedLines().forEach(value => values.add(value));
    return [...values].sort();
  });
  readonly sublines = computed(() => {
    const ids = this.historicalYearStoreIds();
    const rows = this.indexedRows(this.monthlySublineIndex, this.historicalYearPeriods(), ids);
    const values = new Set(rows.filter(row => this.hasMonthlyData(row) && this.categoryMatches(row.category) && this.lineMatches(row.line)).map(row => row.subline).filter(Boolean) as string[]);
    this.selectedSublines().forEach(value => values.add(value));
    return [...values].sort();
  });

  readonly searchedMonths = computed(() => this.availableMonths().filter(month =>
    this.matchesSearch(MONTHS[month - 1], this.filterSearch().month)));
  readonly searchedStores = computed(() => this.storeOptions().filter(store =>
    this.matchesSearch(`${store.alias} ${store.store}`, this.filterSearch().store)));
  readonly searchedCategories = computed(() => this.categories().filter(value =>
    this.matchesSearch(value, this.filterSearch().category)));
  readonly searchedLines = computed(() => this.lines().filter(value =>
    this.matchesSearch(value, this.filterSearch().line)));
  readonly searchedSublines = computed(() => this.sublines().filter(value =>
    this.matchesSearch(value, this.filterSearch().subline)));
  readonly searchedClusters = computed(() => this.clusters().filter(value => this.matchesSearch(value, this.filterSearch().cluster)));
  readonly searchedFormats = computed(() => this.formats().filter(value => this.matchesSearch(value, this.filterSearch().format)));

  readonly monthFilterLabel = computed(() => {
    const selected = this.selectedMonths();
    if (!selected.length) return 'ACUMULADO';
    const labels = selected.slice().sort((a, b) => a - b).map(m => MONTHS[m - 1]);
    return labels.length <= 2 ? labels.join(' + ') : `${labels.length} MESES`;
  });
  readonly storeFilterLabel = computed(() => this.multiLabel(this.selectedStores().map(id => this.storeOptions().find(s => s.storeId === id)?.alias || id), 'TODAS', 'TIENDAS'));
  readonly clusterFilterLabel = computed(() => this.multiLabel(this.selectedClusters(), 'TODOS', 'CLÚSTERES'));
  readonly formatFilterLabel = computed(() => this.multiLabel(this.selectedFormats(), 'TODOS', 'FORMATOS'));
  readonly categoryFilterLabel = computed(() => this.multiLabel(this.selectedCategories(), 'TODOS', 'RUBROS'));
  readonly lineFilterLabel = computed(() => this.multiLabel(this.selectedLines(), 'TODAS', 'LÍNEAS'));
  readonly sublineFilterLabel = computed(() => this.multiLabel(this.selectedSublines(), 'TODAS', 'SUBLÍNEAS'));
  readonly annualContextLabel = computed(() => this.periodContextLabel(this.activeMonths(), this.year()));
  readonly annualPreviousContextLabel = computed(() => this.periodContextLabel(this.activeMonths(), this.year() - 1));
  readonly annualVariationLabel = computed(() => {
    const months = this.activeMonths();
    const comparedYear = this.year() - 1;
    if (!months.length) return `VAR. INTERANUAL ${this.year()} VS ${comparedYear}`;
    const first = MONTHS[months[0] - 1].toUpperCase();
    const last = MONTHS[months.at(-1)! - 1].toUpperCase();
    return `VAR. INTERANUAL ${first}${first === last ? '' : `–${last}`} ${this.year()} VS ${comparedYear}`;
  });
  readonly monthlyContextLabel = computed(() => {
    if (this.dateRangeActive()) return this.dayFilterLabel().toUpperCase();
    return this.selectedMonths().length > 1
      ? this.periodContextLabel(this.activeMonths(), this.year())
      : this.periodLabel(this.selectedPeriod()).toUpperCase();
  });
  readonly previousMonthContextLabel = computed(() => {
    const period = this.selectedPeriod();
    const previous = period % 100 === 1 ? (Math.floor(period / 100) - 1) * 100 + 12 : period - 1;
    return this.periodLabel(previous).toUpperCase();
  });
  readonly monthlyVariationLabel = computed(() => this.selectedMonths().length > 1
    ? 'VAR. MENSUAL: NO APLICA'
    : `VAR. MENSUAL VS ${this.previousMonthContextLabel().split(' ')[0]}`);


  private currentDimensionIndex(): Map<string, Monthly[]> {
    if (this.selectedGenders().length && this.genderFilterEnabled()) return this.monthlyLineIndex;
    if (this.selectedSublines().length) return this.monthlySublineIndex;
    if (this.selectedLines().length) return this.monthlyLineIndex;
    if (this.selectedCategories().length) return this.monthlyCategoryIndex;
    return this.monthlyStoreIndex;
  }

  private currentDimensionFilter(rows: Monthly[]): Monthly[] {
    if (this.selectedSublines().length) return rows.filter(r => this.categoryMatches(r.category) && this.genderMatches(r.line) && this.lineMatches(r.line) && this.sublineMatches(r.subline));
    if (this.selectedLines().length || (this.selectedGenders().length && this.genderFilterEnabled())) return rows.filter(r => this.categoryMatches(r.category) && this.genderMatches(r.line) && this.lineMatches(r.line));
    if (this.selectedCategories().length) return rows.filter(r => this.categoryMatches(r.category) && this.genderMatches(r.line));
    return rows;
  }

  private rowsForPeriods(periods: Iterable<number>, ids: Iterable<string>): Monthly[] {
    return this.currentDimensionFilter(this.indexedRows(this.currentDimensionIndex(), periods, ids));
  }

  private dailyRowsForSelection(ids: Iterable<string>): Monthly[] {
    return this.dailyRowsInRange(ids, true);
  }
  private dailyRowsInRange(ids: Iterable<string>, applyHierarchy = false): Monthly[] {
    if (!this.dailyDetailLoaded()) return [];
    const from = this.fromDate() || '0000-01-01';
    const to = this.toDate() || this.fromDate() || '9999-12-31';
    const selectedIds = new Set(ids);
    const rows = this.dailyStoreRows.filter(row =>
      !!row.date && row.date >= from && row.date <= to && selectedIds.has(row.storeId)
    );
    return applyHierarchy ? this.currentDimensionFilter(rows) : rows;
  }
  async setDayDate(value: string): Promise<void> {
    if (!value || !this.dayFilterEnabled()) return;
    const month = this.selectedMonths()[0];
    const expectedPrefix = `${this.year()}-${String(month).padStart(2, '0')}`;
    if (!value.startsWith(expectedPrefix)) return;

    const range = this.nextDayRange(value);
    await this.ensureDailyDetail(range.from, range.to);
    this.fromDate.set(range.from); this.toDate.set(range.to === range.from ? '' : range.to);
  }

  private nextDayRange(date: string): { from: string; to: string } {
    if (!this.fromDate() || this.toDate()) return { from: date, to: date };
    return date < this.fromDate() ? { from: date, to: this.fromDate() } : { from: this.fromDate(), to: date };
  }

  private async ensureDailyDetail(from: string, to: string): Promise<void> {
    const key = from.slice(0, 7);
    if (this.dailyDetailLoaded() && this.dailyDetailRange === key) return;
    if (this.dailyDetailPromise && this.dailyDetailRange === key) return this.dailyDetailPromise;
    this.dailyDetailLoaded.set(false);
    this.dailyDetailRange = key;
    const [year, month] = key.split('-').map(Number);
    const monthFrom = `${key}-01`;
    const monthTo = `${key}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
    const promise = (async () => {
      let detail: { dailyStore?: Monthly[]; hourlySales?: HourlySalesRow[] } | undefined;
      if (!this.cloud.remoteEnabled()) {
        try {
          const response = await fetch(`/api/dashboard/daily?from=${encodeURIComponent(monthFrom)}&to=${encodeURIComponent(monthTo)}`, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          detail = await response.json() as { dailyStore?: Monthly[]; hourlySales?: HourlySalesRow[] };
        } catch {
          // El servidor local es opcional; los archivos mensuales también sirven
          // para npm start y para la versión portátil.
        }
      }
      if (!detail) {
        try {
          detail = await this.loadDetail<{ dailyStore: Monthly[]; hourlySales?: HourlySalesRow[] }>(`dashboard-daily-${key}.json`);
        } catch {
          // Permite abrir una publicación anterior durante la transición.
          detail = await this.loadDetail<{ dailyStore: Monthly[]; hourlySales?: HourlySalesRow[] }>('dashboard-daily.json');
        }
      }
      if (this.dailyDetailRange !== key) return;
      this.dailyStoreRows = (detail.dailyStore || []).filter(row => !!row.date && row.date >= monthFrom && row.date <= monthTo);
      this.dailyHourlySalesRows = (detail.hourlySales || []).filter(row => !!row.date && row.date >= monthFrom && row.date <= monthTo);
      this.dailyDetailLoaded.set(true);
    })();
    this.dailyDetailPromise = promise;
    try { await promise; } finally { if (this.dailyDetailPromise === promise) this.dailyDetailPromise = undefined; }
  }

  private salesRows(fromPeriod: number, toPeriod: number): Monthly[] {
    return this.rowsForPeriods(this.rangePeriods(fromPeriod, toPeriod), this.filteredStoreIds());
  }
  private baseRows(fromPeriod: number, toPeriod: number): Monthly[] {
    return this.indexedRows(this.monthlyStoreIndex, this.rangePeriods(fromPeriod, toPeriod), this.filteredStoreIds());
  }
  private receivingRows(fromPeriod: number, toPeriod: number): Monthly[] {
    const d = this.data(); if (!d) return [];
    const receivingIds = d.stores.filter(store => !store.isStore && this.storeAllowedByAccess(store)).map(store => store.storeId);
    return this.rowsForPeriods(this.rangePeriods(fromPeriod, toPeriod), receivingIds);
  }
  readonly yearRows = computed(() => this.dateRangeActive()
    ? this.dailyRowsForSelection(this.filteredStoreIds())
    : this.rowsForPeriods(this.selectedPeriods(), this.filteredStoreIds()));
  readonly monthRows = computed(() => {
    if (this.dateRangeActive()) return this.yearRows();
    if (this.selectedMonths().length) return this.yearRows();
    return this.rowsForPeriods([this.selectedPeriod()], this.filteredStoreIds());
  });
  readonly baseYearRows = computed(() => this.indexedRows(this.monthlyStoreIndex, this.selectedPeriods(), this.filteredStoreIds()));
  readonly fullYearBaseRows = computed(() => this.baseRows(this.year() * 100 + 1, this.year() * 100 + 12));

  private targetCategories(): string[] {
    return this.personnelCategories().map(category => this.normalized(category));
  }

  // Meta corporativa aprobada. Solo aplica al total anual sin segmentar; al
  // filtrar tienda, formato, clúster o rubro se conserva el cálculo propio.
  private readonly corporateAnnualTargets: Record<number, number> = { 2026: 70_560_000 };

  private isFullCompanyScope(): boolean {
    return !this.selectedClusters().length && !this.selectedFormats().length && !this.selectedStores().length;
  }

  private isFullYear(periods: number[]): boolean {
    if (periods.length !== 12) return false;
    const expected = this.rangePeriods(this.year() * 100 + 1, this.year() * 100 + 12);
    return periods.every((period, index) => period === expected[index]);
  }

  // Con TEXTIL/CALZADO usa la meta cargada en la hoja METAS. Para otros rubros
  // distribuye el remanente de la meta total por su participación de ventas: es
  // una aproximación explícita, nunca una meta oficial inventada.
  private targetForPeriods(periods: number[]): number {
    const storeIds = this.filteredStoreIds();
    const official = sum(this.indexedRows(this.monthlyStoreIndex, periods, storeIds), 'target');
    const hierarchyActive = this.selectedCategories().length || this.selectedGenders().length || this.selectedLines().length || this.selectedSublines().length;
    if (!hierarchyActive) {
      const corporateTarget = this.corporateAnnualTargets[this.year()];
      return corporateTarget && this.isFullCompanyScope() && this.isFullYear(periods)
        ? corporateTarget
        : official;
    }
    const direct = this.indexedRows(this.monthlyCategoryTargetIndex, periods, storeIds);
    const categorySales = this.indexedRows(this.monthlyCategoryIndex, periods, storeIds);
    const selectedSales = this.currentDimensionFilter(this.indexedRows(this.currentDimensionIndex(), periods, storeIds));
    const byKey = grouped(direct, row => `${row.periodId}|${row.storeId}`);
    const categorySalesByKey = grouped(categorySales, row => `${row.periodId}|${row.storeId}`);
    const selectedSalesByKey = grouped(selectedSales, row => `${row.periodId}|${row.storeId}`);
    let total = 0;
    for (const period of periods) for (const storeId of storeIds) {
      const key = `${period}|${storeId}`;
      const officialTarget = sum((this.monthlyStoreIndex.get(key) || []), 'target');
      const targets = byKey.get(key) || [];
      const textil = targets.filter(row => this.normalized(row.category) === 'TEXTIL').reduce((v, row) => v + row.target, 0);
      const calzado = targets.filter(row => this.normalized(row.category) === 'CALZADO').reduce((v, row) => v + row.target, 0);
      const baseRows = categorySalesByKey.get(key) || [];
      const scopedRows = selectedSalesByKey.get(key) || [];
      const others = baseRows.filter(row => !['TEXTIL', 'CALZADO'].includes(this.normalized(row.category)));
      const otherSales = sum(others, 'net');
      const remaining = Math.max(0, officialTarget - textil - calzado);
      const baseByCategory = grouped(baseRows, row => this.normalized(row.category));
      const scopedByCategory = grouped(scopedRows, row => this.normalized(row.category));
      for (const [category, rows] of baseByCategory) {
        const baseNet = sum(rows, 'net'); const scopedNet = sum(scopedByCategory.get(category) || [], 'net');
        if (baseNet <= 0 || scopedNet <= 0) continue;
        const categoryTarget = category === 'TEXTIL' ? textil
          : category === 'CALZADO' ? calzado
          : otherSales > 0 ? remaining * baseNet / otherSales : 0;
        total += categoryTarget * Math.min(1, scopedNet / baseNet);
      }
    }
    return total;
  }

  // Para el año del corte muestra la foto exacta de tiendas activas a esa fecha.
  // Para años históricos muestra todas las tiendas que estuvieron operativas
  // en algún momento del año, respetando aperturas y cierres.
  readonly annualStoreSummary = computed(() => {
    const d = this.data(); if (!d) return { total: 0, metro: 0, outside: 0 };
    const cutoffYear = Number(d.metadata.salesCutoff.slice(0, 4));
    const stores = this.year() === cutoffYear
      ? d.stores.filter(store => this.storeAllowedByAccess(store) && this.storeActiveAtDate(store, d.metadata.salesCutoff))
      : d.stores.filter(store => this.storeAllowedByAccess(store) && store.isStore && this.storeOverlapsPeriod(store, this.year() * 100 + 1, this.year() * 100 + 12));
    const metro = stores.filter(store => store.format === 'METRO').length;
    return { total: stores.length, metro, outside: stores.length - metro };
  });

  readonly previousMonthRows = computed(() => {
    const p = this.selectedPeriod(); const previous = p % 100 === 1 ? (Math.floor(p / 100) - 1) * 100 + 12 : p - 1;
    return this.rowsForPeriods([previous], this.filteredStoreIds());
  });
  readonly previousYearRows = computed(() => {
    const periods = this.activeMonths().map(month => (this.year() - 1) * 100 + month);
    return this.rowsForPeriods(periods, this.filteredStoreIds());
  });

  private personnelCategories(): string[] {
    if (this.selectedCategories().length) return this.selectedCategories();
    if (!this.selectedLines().length && !this.selectedSublines().length) return [];
    const lines = new Set(this.selectedLines());
    const sublines = new Set(this.selectedSublines());
    return [...new Set((this.data()?.hierarchyCatalog || [])
      .filter(row => (!lines.size || lines.has(row.line)) && (!sublines.size || sublines.has(row.subline)))
      .map(row => row.category))];
  }

  private personnelAreaMatchesCategory(row: Pick<PersonnelAreaRow, 'area' | 'areaType'>, category: string): boolean {
    const area = this.normalized(row.area); const value = this.normalized(category);
    if (value === 'TEXTIL') return area === 'TEXTIL';
    if (value === 'CALZADO') return area === 'CALZADO';
    if (value === 'AUDIO Y VIDEO') return area.includes('AUDIO Y VIDEO');
    if (value === 'ELECTRO MENOR') return area.startsWith('ELECTRO MENOR');
    if (value === 'TECNOLOGIA' || value === 'COMPUTO') return area.includes('TECNOLOGIA');
    if (['HOGAR', 'BANO Y LAVANDERIA', 'LINEA BLANCA', 'MUEBLE', 'FERRETERIA'].includes(value)) return area.includes('HOGAR');
    return false;
  }

  private personnelForSelectedContext(): number | null {
    const periods = this.selectedMonths().length ? [...this.selectedPeriods()] : [this.selectedPeriod()];
    const rows = this.indexedRows(this.monthlyPersonnelAreaIndex, periods, this.filteredStoreIds());
    const categories = this.personnelCategories();
    const applicable = categories.length
      ? rows.filter(row => this.normalized(row.areaType) === 'COMERCIAL' && categories.some(category => this.personnelAreaMatchesCategory(row, category)))
      : rows;
    const byPeriod = new Map<number, number>();
    applicable.forEach(row => byPeriod.set(row.periodId, (byPeriod.get(row.periodId) || 0) + (row.personnel || 0)));
    const total = periods.reduce((value, period) => value + (byPeriod.get(period) || 0), 0);
    return total > 0 ? total / Math.max(1, periods.length) : null;
  }

  // Proyección anual: combina comparables del mismo período, estacionalidad de
  // dos años, ritmo diario del corte parcial y tendencia reciente. No usa la
  // meta como resultado: la meta sirve solo para contrastar el forecast.
  private salesProjection(actual: number): { value: number | null; base: number | null; growth: number | null; error: number | null } {
    const currentYear = this.year();
    const lastMonth = this.activeMonths().at(-1) ?? this.yearOnlyMonthLimit(currentYear);
    const actualPeriods = Array.from({ length: lastMonth }, (_, index) => currentYear * 100 + index + 1);
    const actualYtd = sum(this.rowsForPeriods(actualPeriods, this.filteredStoreIds()), 'net');
    if (!lastMonth || lastMonth >= 12) return { value: actualYtd || actual, base: 0, growth: null, error: null };
    const cutoff = this.data()?.metadata.salesCutoff || '';
    const cutoffYear = Number(cutoff.slice(0, 4));
    const cutoffDay = Number(cutoff.slice(8, 10));
    const isPartialCutoffMonth = currentYear === cutoffYear && !this.selectedMonths().length && cutoffDay > 0;
    const monthProgress = isPartialCutoffMonth ? Math.min(1, cutoffDay / new Date(currentYear, lastMonth, 0).getDate()) : 1;
    const historicalToDate = (year: number): number => Array.from({ length: lastMonth }, (_, index) => index + 1)
      .reduce((total, month) => total + sum(this.rowsForPeriods([year * 100 + month], this.filteredStoreIds()), 'net') * (month === lastMonth ? monthProgress : 1), 0);
    const priorComparable = historicalToDate(currentYear - 1);
    const twoYearsComparable = historicalToDate(currentYear - 2);
    const historicYtd = priorComparable && twoYearsComparable ? priorComparable * .6 + twoYearsComparable * .4 : priorComparable || twoYearsComparable;
    const rawGrowth = historicYtd > 0 ? actualYtd / historicYtd : 1;
    const recentMonths = Array.from({ length: Math.min(3, lastMonth) }, (_, index) => lastMonth - index);
    const recentActual = recentMonths.reduce((total, month) => total + sum(this.rowsForPeriods([currentYear * 100 + month], this.filteredStoreIds()), 'net'), 0);
    const recentHistoric = recentMonths.reduce((total, month) => total + (sum(this.rowsForPeriods([(currentYear - 1) * 100 + month], this.filteredStoreIds()), 'net') || sum(this.rowsForPeriods([(currentYear - 2) * 100 + month], this.filteredStoreIds()), 'net')), 0);
    const recentGrowth = recentHistoric > 0 ? recentActual / recentHistoric : rawGrowth;
    // Límites prudentes: protegen contra una campaña puntual o un mes incompleto.
    const growth = Math.min(1.3, Math.max(.7, rawGrowth * .72 + recentGrowth * .28));
    const remaining = [
      ...(monthProgress < 1 ? [{ month: lastMonth, weight: 1 - monthProgress }] : []),
      ...Array.from({ length: 12 - lastMonth }, (_, index) => ({ month: lastMonth + index + 1, weight: 1 })),
    ];
    const base = remaining.reduce((total, { month, weight }) => {
      const previous = sum(this.rowsForPeriods([(currentYear - 1) * 100 + month], this.filteredStoreIds()), 'net');
      const twoYearsAgo = sum(this.rowsForPeriods([(currentYear - 2) * 100 + month], this.filteredStoreIds()), 'net');
      const seasonal = previous > 0 && twoYearsAgo > 0 ? previous * .6 + twoYearsAgo * .4 : previous || twoYearsAgo;
      return total + seasonal * weight;
    }, 0);
    const historicAnnualValues = [currentYear - 1, currentYear - 2].map(year =>
      sum(this.rowsForPeriods(Array.from({ length: 12 }, (_, month) => year * 100 + month + 1), this.filteredStoreIds()), 'net'));
    const historicAnnual = historicAnnualValues[0] && historicAnnualValues[1] ? historicAnnualValues[0] * .6 + historicAnnualValues[1] * .4 : historicAnnualValues[0] || historicAnnualValues[1];
    const annualGrowth = Math.min(1.18, Math.max(.82, 1 + (growth - 1) * .7));
    const seasonalForecast = historicAnnual * annualGrowth;
    const ytdForecast = actualYtd + base * growth;
    const observedMonths = lastMonth - 1 + monthProgress;
    const elapsedDays = Array.from({ length: lastMonth }, (_, index) => index + 1)
      .reduce((total, month) => total + (month === lastMonth ? Math.max(1, Math.round(new Date(currentYear, month, 0).getDate() * monthProgress)) : new Date(currentYear, month, 0).getDate()), 0);
    const annualDays = new Date(currentYear, 1, 29).getMonth() === 1 ? 366 : 365;
    const runRateForecast = elapsedDays ? actualYtd / elapsedDays * annualDays : ytdForecast;
    const runRateWeight = Math.min(.28, .10 + observedMonths / 55);
    const ytdWeight = Math.min(.7, .42 + observedMonths / 28);
    const seasonalWeight = Math.max(.1, 1 - ytdWeight - runRateWeight);
    const value = ytdForecast * ytdWeight + seasonalForecast * seasonalWeight + runRateForecast * runRateWeight;
    const candidates = [ytdForecast, seasonalForecast, runRateForecast].filter(value => value > 0);
    const average = candidates.reduce((sumValue, value) => sumValue + value, 0) / Math.max(1, candidates.length);
    const dispersion = average ? Math.sqrt(candidates.reduce((sumValue, value) => sumValue + (value - average) ** 2, 0) / candidates.length) / average : .2;
    const error = value > 0 ? Math.min(.25, Math.max(.03, dispersion * .7 + (1 - Math.min(1, observedMonths / 8)) * .05)) : null;
    return { value, base, growth: historicYtd > 0 ? rawGrowth - 1 : null, error };
  }


  readonly metrics = computed(() => {
    const ytd = this.yearRows(); const month = this.monthRows(); const base = this.baseYearRows();
    const net = sum(ytd, 'net'); const monthNet = sum(month, 'net');
    const selectedPeriods = [...this.selectedPeriods()];
    const targetYtd = this.targetForPeriods(selectedPeriods); const monthTarget = this.selectedMonths().length ? targetYtd : this.targetForPeriods([this.selectedPeriod()]);
    const annualTarget = this.targetForPeriods(this.rangePeriods(this.year() * 100 + 1, this.year() * 100 + 12)); const priorMonth = sum(this.previousMonthRows(), 'net');
    const previousYtd = sum(this.previousYearRows(), 'net'); const tx = sum(ytd, 'transactions');
    const storeMap = new Map(this.data()?.stores.map(s => [s.storeId, s]) || []);
    let traffic = 0;
    let trafficMetro: number | null = null;
    let trafficOther: number | null = null;

    if (this.dateRangeActive()) {
      const from = this.fromDate();
      const to = this.toDate() || this.fromDate();
      const selectedStoreIds = this.filteredStoreIds();
      const dailyTrafficFiltered = this.dailyTrafficRows.filter(row =>
        row.date >= from && row.date <= to && selectedStoreIds.has(row.storeId)
      );
      traffic = dailyTrafficFiltered.reduce((total, row) => total + (row.traffic || 0), 0);
      const metroVal = dailyTrafficFiltered.filter(r => storeMap.get(r.storeId)?.format === 'METRO').reduce((total, r) => total + (r.traffic || 0), 0);
      const otherVal = dailyTrafficFiltered.filter(r => storeMap.get(r.storeId)?.format !== 'METRO').reduce((total, r) => total + (r.traffic || 0), 0);
      trafficMetro = traffic > 0 ? metroVal : null;
      trafficOther = traffic > 0 ? otherVal : null;
    } else {
      traffic = sum(base, 'traffic');
      const metroVal = base.filter(r => storeMap.get(r.storeId)?.format === 'METRO').reduce((t, r) => t + (r.traffic || 0), 0);
      const otherVal = base.filter(r => storeMap.get(r.storeId)?.format !== 'METRO').reduce((t, r) => t + (r.traffic || 0), 0);
      trafficMetro = traffic > 0 ? metroVal : null;
      trafficOther = traffic > 0 ? otherVal : null;
    }
    const units = sum(ytd, 'units');
    // Sell-through comercial: unidades vendidas del período sobre el inventario
    // disponible, definido como stock actual más unidades recibidas del período.
    const d = this.data(); const sellThroughStores = this.filteredStoreIds();
    const sellThroughSource = this.selectedCategories().length
      ? (d?.predictiveCategory || []).filter(row => sellThroughStores.has(row.storeId) && this.categoryMatches(row.category))
      : (d?.predictiveStore || []).filter(row => sellThroughStores.has(row.storeId));
    const sellThroughStock = sellThroughSource.reduce((total, row) => total + (row.stockUnits || 0), 0);
    const canCompareSellThrough = !this.selectedLines().length && !this.selectedSublines().length;
    const personnel = this.personnelForSelectedContext();
    const area = this.filteredStores().reduce((t, s) => t + (s.areaM2 || 0) * .8, 0);
    const cutoff = this.data()?.metadata.salesCutoff || ''; const cutoffYear = Number(cutoff.slice(0, 4)); const cutoffMonth = Number(cutoff.slice(5, 7));
    let dailyAverageDivisor: number;
    if (this.dateRangeActive()) {
      const from = this.fromDate();
      const to = this.toDate() || this.fromDate();
      const fromParts = from.split('-').map(Number);
      const toParts = to.split('-').map(Number);
      const fromUtc = Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2]);
      const toUtc = Date.UTC(toParts[0], toParts[1] - 1, toParts[2]);
      dailyAverageDivisor = Math.max(1, Math.round((toUtc - fromUtc) / (1000 * 60 * 60 * 24)) + 1);
    } else {
      const selectedDays = this.selectedMonths().length
        ? this.activeMonths().reduce((total, selectedMonth) => total + (this.year() === cutoffYear && selectedMonth === cutoffMonth ? Number(cutoff.slice(8, 10)) : new Date(this.year(), selectedMonth, 0).getDate()), 0)
        : (this.year() === cutoffYear && this.selectedMonth() === cutoffMonth ? Number(cutoff.slice(8, 10)) : new Date(this.year(), this.selectedMonth(), 0).getDate());
      const accumulatedMonths = Math.max(1, this.activeMonths().length);
      dailyAverageDivisor = this.selectedMonths().length ? selectedDays : selectedDays * accumulatedMonths;
    }
    const gross = sum(ytd, 'gross'); const positive = sum(ytd, 'positiveReal');
    const projection = this.salesProjection(net);
    return {
      gross, notes: sum(ytd, 'notes'), discount: sum(ytd, 'discount'), net, transactions: tx, traffic,
      trafficMetro,
      trafficOther,
      units, annualTarget, targetYtd, monthNet, monthTarget,
      annualPct: annualTarget ? net / annualTarget : null, accumulatedPct: targetYtd ? net / targetYtd : null,
      monthlyPct: monthTarget ? monthNet / monthTarget : null, monthVariation: this.selectedMonths().length > 1 ? null : (priorMonth ? monthNet / priorMonth - 1 : null),
      // Venta promedio diaria = venta neta del período seleccionado ÷ días calendario del mismo período.
      // En ACUMULADO usa Ene..corte; al elegir un mes usa solo los días de ese mes.
      annualGrowth: previousYtd ? net / previousYtd - 1 : null, dailyAverage: dailyAverageDivisor ? net / dailyAverageDivisor : null,
      returnRatio: positive > 0 ? sum(ytd, 'notes') / positive : null,
      conversion: traffic ? tx / traffic : null, ticket: tx ? net / tx : null, saleM2: area ? net / area : null,
      personnel, saleCollaborator: personnel && net ? net / personnel : null, priceVariation: gross ? (positive - gross) / gross : null,
      sellThrough: canCompareSellThrough && sellThroughStock + sum(ytd, 'received') > 0
        ? units / (sellThroughStock + sum(ytd, 'received'))
        : null,
      sellThroughStock,
      projectedClose: projection.value, projectionBase: projection.base, projectionGrowth: projection.growth, projectionError: projection.error,
    };
  });
  // El avance acumulado se lee al mes completo. El selector DÍA sirve para el
  // detalle operativo, pero no altera el cumplimiento oficial de la meta.
  readonly advanceMetrics = computed(() => {
    const periods = [...this.selectedPeriods()];
    const rows = this.rowsForPeriods(periods, this.filteredStoreIds());
    const net = sum(rows, 'net');
    const targetYtd = this.targetForPeriods(periods);
    const annualTarget = this.targetForPeriods(this.rangePeriods(this.year() * 100 + 1, this.year() * 100 + 12));
    const previous = this.activeMonths().map(month => (this.year() - 1) * 100 + month);
    const previousNet = sum(this.rowsForPeriods(previous, this.filteredStoreIds()), 'net');
    return {
      net, targetYtd, annualTarget,
      annualPct: annualTarget ? net / annualTarget : null,
      accumulatedPct: targetYtd ? net / targetYtd : null,
      annualGrowth: previousNet ? net / previousNet - 1 : null,
    };
  });
  readonly projectionTargetPct = computed(() => {
    const metrics = this.metrics();
    return metrics.projectedClose != null && metrics.annualTarget > 0 ? metrics.projectedClose / metrics.annualTarget : null;
  });
  readonly accumulatedGap = computed(() => {
    const metrics = this.metrics();
    return metrics.annualTarget > 0 && metrics.projectedClose != null ? metrics.annualTarget - metrics.projectedClose : null;
  });

  readonly talentProfiles = computed(() => {
    const period = this.selectedPeriod(); const year = Math.floor(period / 100); const month = period % 100;
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    const ids = this.filteredStoreIds(); const categories = this.personnelCategories();
    return (this.data()?.personnelProfiles || []).filter(row => {
      const status = this.normalized(row.status);
      const active = !['POR INGRESAR', 'NO INGRESO', 'ANULADO'].includes(status)
        && (!row.hireDate || row.hireDate <= end) && (!row.retirementDate || row.retirementDate >= start);
      const categoryMatch = !categories.length || (row.areaType === 'COMERCIAL' && categories.some(category => this.personnelAreaMatchesCategory(row, category)));
      return ids.has(row.storeId) && active && categoryMatch;
    });
  });
  readonly talentProfileSummary = computed(() => {
    const profiles = this.talentProfiles(); const period = this.selectedPeriod();
    const year = Math.floor(period / 100); const month = period % 100; const day = new Date(year, month, 0).getDate();
    const ages = profiles.flatMap(row => {
      if (!row.birthDate) return [];
      const birth = new Date(`${row.birthDate}T00:00:00`); if (!Number.isFinite(birth.getTime())) return [];
      let age = year - birth.getFullYear();
      if (month < birth.getMonth() + 1 || (month === birth.getMonth() + 1 && day < birth.getDate())) age -= 1;
      return age >= 16 && age <= 90 ? [age] : [];
    });
    const birthdays = profiles.filter(row => row.birthdayMonth === month)
      .sort((a, b) => (a.birthdayDay || 99) - (b.birthdayDay || 99) || a.name.localeCompare(b.name));
    return {
      male: profiles.filter(row => row.gender === 'M').length,
      female: profiles.filter(row => row.gender === 'F').length,
      averageAge: ages.length ? ages.reduce((total, value) => total + value, 0) / ages.length : null,
      salesStaff: profiles.filter(row => this.normalized(row.role).includes('VENDEDOR')).length,
      administrativeStaff: profiles.filter(row => row.areaType === 'SOPORTE').length,
      birthdays,
      birthdayLabel: birthdays.length ? `${birthdays[0].name}${birthdays.length > 1 ? ` +${birthdays.length - 1}` : ''}` : 'N/A',
      birthdayTitle: birthdays.length ? birthdays.map(row => `${row.birthdayDay || '—'} · ${row.name}`).join('\n') : 'Sin cumpleaños registrados'
    };
  });

  // Capacidad de dotación real contra los dos parámetros maestros de DimTiendas.
  readonly talentStoreRows = computed(() => {
    const stores = new Map(this.filteredStores().map(store => [store.storeId, store]));
    const sales = grouped(this.yearRows(), row => row.storeId);
    const people = grouped(this.indexedRows(this.monthlyPersonnelAreaIndex, [this.selectedPeriod()], this.filteredStoreIds()), row => row.storeId);
    return [...stores.entries()].map(([storeId, store]) => {
      const net = sum(sales.get(storeId) || [], 'net');
      const rows = people.get(storeId) || [];
      const staff = sum(rows, 'personnel');
      const baseStaff = store.normalStaff || 0; const campaignStaff = store.campaignStaff || baseStaff;
      const plannedStaff = [2, 7, 12].includes(this.selectedMonth()) ? campaignStaff : baseStaff;
      return { alias: store.alias, net, staff, baseStaff, campaignStaff, plannedStaff, gap: staff - plannedStaff, productivity: staff ? net / staff : null };
    }).sort((a, b) => (b.productivity || 0) - (a.productivity || 0));
  });
  readonly sellerPerformanceMode = signal<'top' | 'bottom'>('top');
  readonly talentSellerRows = computed(() => {
    const ids = this.filteredStoreIds(); const periods = this.selectedPeriods();
    const rows = this.sellerPerformanceData().filter(row =>
      ids.has(row.storeId) && periods.has(row.periodId) && this.categoryMatches(row.category) && this.lineMatches(row.line) && this.sublineMatches(row.subline));
    const bySeller = grouped(rows, row => row.seller || 'SIN VENDEDOR');
    const ranking = [...bySeller.entries()].map(([seller, sellerRows]) => ({
      seller, net: sum(sellerRows, 'net'), units: sum(sellerRows, 'units'), transactions: sum(sellerRows, 'transactions'),
    })).filter(row => row.net !== 0);
    return ranking.sort((a, b) => b.net - a.net);
  });
  readonly talentClientRows = computed(() => {
    const ids = this.filteredStoreIds(); const periods = this.selectedPeriods();
    const rows = (this.data()?.clientPerformance || []).filter(row =>
      ids.has(row.storeId) && periods.has(row.periodId) && this.categoryMatches(row.category) && this.lineMatches(row.line) && this.sublineMatches(row.subline));
    const byClient = grouped(rows, row => row.client || 'SIN CLIENTE');
    return [...byClient.entries()].map(([client, clientRows]) => ({
      client, net: sum(clientRows, 'net'), units: sum(clientRows, 'units'), transactions: sum(clientRows, 'transactions'),
    })).filter(row => row.net !== 0).sort((a, b) => b.net - a.net).slice(0, 5);
  });
  readonly talentPerformanceMock = [
    { label: 'Venta por colaborador', value: 82, text: 'S/ 5.2 mil', tone: 'blue' },
    { label: 'Certificación de caja', value: 91, text: '91%', tone: 'teal' },
    { label: 'Protocolo de venta', value: 84, text: '84%', tone: 'purple' },
    { label: 'Cobertura de turnos', value: 94, text: '94%', tone: 'gold' },
  ];
  readonly talentContinuityMock = [
    { label: 'Roles críticos con respaldo', value: 78, text: '78%', tone: 'blue' },
    { label: 'Plan de sucesión activo', value: 67, text: '67%', tone: 'teal' },
    { label: 'Documentación al día', value: 96, text: '96%', tone: 'purple' },
    { label: 'Conversaciones 1:1 cerradas', value: 72, text: '72%', tone: 'gold' },
  ];
  readonly talentHistoryRows = computed(() => {
    const ids = this.filteredStoreIds(); const targetYear = this.year();
    const monthLimit = this.yearOnlyMonthLimit(targetYear);
    const selectedAreas = this.personnelCategories();
    const rows = this.indexedRows(this.monthlyPersonnelAreaIndex, new Set(Array.from({ length: monthLimit }, (_, index) => targetYear * 100 + index + 1)), ids)
      .filter(row => !selectedAreas.length || selectedAreas.some(category => this.personnelAreaMatchesCategory(row, category)));
    const byPeriod = grouped(rows, row => String(row.periodId));
    const stores = this.filteredStores();
    const base = stores.reduce((total, store) => total + (store.normalStaff || 0), 0);
    const campaign = stores.reduce((total, store) => total + (store.campaignStaff || store.normalStaff || 0), 0);
    return Array.from({ length: monthLimit }, (_, index) => {
      const periodId = targetYear * 100 + index + 1; const monthRows = byPeriod.get(String(periodId)) || [];
      const month = index + 1;
      return { label: this.periodLabel(periodId).replace(` ${targetYear}`, ''), actual: monthRows.length ? sum(monthRows, 'personnel') : null,
        base, planned: [2, 7, 12].includes(month) ? campaign : base };
    });
  });
  readonly talentHistoryOption = computed<EChartsOption>(() => {
    const rows = this.talentHistoryRows(); const values = rows.map(row => row.actual);
    const max = Math.max(1, ...values.filter((value): value is number => value != null), ...rows.map(row => row.planned));
    return {
      animation: false, grid: { left: 46, right: 18, top: 34, bottom: 40 },
      tooltip: { trigger: 'axis', confine: true, position: this.tooltipToRight, formatter: (params: any[]) => {
        const index = params[0]?.dataIndex ?? 0; const row = rows[index];
        return this.tooltip(`${row.label} ${this.year()}`, [
          { label: 'Dotación real', value: row.actual == null ? 'SIN REGISTRO' : this.number(row.actual) },
          { label: 'Dotación esperada', value: this.number(row.planned) }
        ]);
      } },
      legend: { top: 0, data: ['REAL', 'ESPERADO'], itemWidth: 16, itemHeight: 8, textStyle: { fontSize: 8, color: '#475569', fontWeight: 800 } },
      xAxis: { type: 'category', name: 'MES', nameLocation: 'middle', nameGap: 27, nameTextStyle: { color: '#64748B', fontSize: 9, fontWeight: 800 }, data: rows.map(row => row.label), axisTick: { show: false }, axisLabel: { color: '#64748B', fontSize: 9 } },
      yAxis: { type: 'value', name: 'CANTIDAD', nameTextStyle: { color: '#64748B', fontSize: 8, fontWeight: 800 }, min: 0, max: Math.ceil(max * 1.15 / 10) * 10, splitNumber: 4, minInterval: 1, axisLabel: { color: '#64748B' }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      series: [
        { name: 'REAL', type: 'bar', data: values, barMaxWidth: 18, itemStyle: { color: C.blue, borderRadius: [4, 4, 0, 0] } },
        { name: 'ESPERADO', type: 'line', data: rows.map(row => row.planned), symbol: 'circle', symbolSize: 7, lineStyle: { color: C.gold, width: 3 }, itemStyle: { color: C.gold, borderColor: '#FFFFFF', borderWidth: 1.5 } }
      ]
    } as EChartsOption;
  });
  readonly talentAreaRows = computed(() => {
    const rows = this.indexedRows(this.monthlyPersonnelAreaIndex, [this.selectedPeriod()], this.filteredStoreIds());
    const selectedAreas = this.personnelCategories();
    const applicable = selectedAreas.length ? rows.filter(row => selectedAreas.some(category => this.personnelAreaMatchesCategory(row, category))) : rows;
    return [...grouped(applicable, row => row.area || 'SIN ÁREA').entries()]
      .map(([area, values]) => ({ area, personnel: sum(values, 'personnel') }))
      .filter(row => row.personnel > 0).sort((a, b) => b.personnel - a.personnel).slice(0, 8);
  });
  readonly talentAreaOption = computed<EChartsOption>(() => {
    const rows = this.talentAreaRows(); const max = Math.max(1, ...rows.map(row => row.personnel));
    return { animation: false, grid: { left: 104, right: 34, top: 8, bottom: 20 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: (params: any[]) => { const row = rows[params[0]?.dataIndex ?? 0]; return this.tooltip(row?.area || '', [{ label: 'Colaboradores', value: this.number(row?.personnel ?? null) }]); } },
      xAxis: { type: 'value', max: max * 1.15, axisLabel: { color: '#64748B', fontSize: 8 }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      yAxis: { type: 'category', inverse: true, data: rows.map(row => row.area), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { width: 92, overflow: 'truncate', color: '#334155', fontSize: 8, fontWeight: 700 } },
      series: [{ type: 'bar', data: rows.map(row => row.personnel), barMaxWidth: 18, itemStyle: { color: C.purple, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: '#172033', fontSize: 9, fontWeight: 800 } }]
    } as EChartsOption;
  });
  readonly talentTeamProductivityRows = computed(() => {
    const ids = this.filteredStoreIds(); const periods = this.selectedPeriods();
    const comparableTeams = new Set(['TEXTIL', 'CALZADO', 'HOGAR', 'ELECTRO', 'TECNOLOGIA']);
    const salesSource = this.dateRangeActive()
      ? this.dailyRowsForSelection(ids)
      : this.indexedRows(this.selectedSublines().length ? this.monthlySublineIndex : this.monthlyLineIndex, periods, ids)
          .filter(row => this.categoryMatches(row.category) && this.genderMatches(row.line) && this.lineMatches(row.line) && this.sublineMatches(row.subline));
    const salesByTeam = grouped(salesSource.filter(row => comparableTeams.has(this.areaHead(row.category))), row => this.areaHead(row.category));
    const personnelRows = this.indexedRows(this.monthlyPersonnelAreaIndex, periods, ids)
      .filter(row => this.normalized(row.areaType) === 'COMERCIAL' && comparableTeams.has(this.areaHead(row.area)));
    const personnelByTeamPeriod = grouped(personnelRows, row => `${this.areaHead(row.area)}|${row.periodId}`);
    const periodCount = Math.max(1, periods.size);
    return [...salesByTeam.entries()].map(([team, rows]) => {
      const personnelTotal = [...periods].reduce((total, period) => total + sum(personnelByTeamPeriod.get(`${team}|${period}`) || [], 'personnel'), 0);
      const averagePersonnel = personnelTotal / periodCount;
      const averageMonthlySales = sum(rows, 'net') / periodCount;
      return { team, averagePersonnel, averageMonthlySales, productivity: averagePersonnel ? averageMonthlySales / averagePersonnel : null };
    }).filter(row => row.averagePersonnel > 0 && row.productivity != null)
      .sort((a, b) => (b.productivity || 0) - (a.productivity || 0));
  });
  readonly talentTeamProductivityOption = computed<EChartsOption>(() => {
    const rows = this.talentTeamProductivityRows(); const max = Math.max(1, ...rows.map(row => row.productivity || 0));
    return {
      animation: false, grid: { left: 102, right: 68, top: 8, bottom: 28 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: (params: any[]) => {
        const row = rows[params[0]?.dataIndex ?? 0];
        return this.tooltip(row?.team || '', [
          { label: 'Venta promedio mensual', value: this.money(row?.averageMonthlySales ?? null, true) },
          { label: 'Colaboradores promedio', value: this.number(row?.averagePersonnel ?? null) },
          { label: 'Venta mensual por colaborador', value: this.money(row?.productivity ?? null, true) }
        ]);
      } },
      xAxis: { type: 'value', min: 0, max: max * 1.2, name: 'VENTA / COLAB.', nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: '#64748B', fontSize: 8, fontWeight: 800 }, axisLabel: { color: '#64748B', fontSize: 8, formatter: (value: number) => `S/ ${this.short(value)}` }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      yAxis: { type: 'category', inverse: true, data: rows.map(row => row.team), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { width: 90, overflow: 'truncate', color: '#334155', fontSize: 8, fontWeight: 800 } },
      series: [{ type: 'bar', data: rows.map(row => row.productivity), barMaxWidth: 18, itemStyle: { color: C.gold, borderRadius: [0, 5, 5, 0] }, label: { show: true, position: 'right', color: '#172033', fontSize: 8, fontWeight: 800, formatter: (params: any) => this.money(Number(params.value), true) } }]
    } as EChartsOption;
  });
  readonly sellerPerformanceOption = computed<EChartsOption>(() => {
    const rows = this.talentSellerRows().slice(0, 30); const max = Math.max(1, ...rows.map(row => Math.abs(row.net))); const visible = Math.min(7, rows.length);
    return { animation: false, grid: { left: 116, right: 90, top: 8, bottom: 22 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: (params: any[]) => { const row = rows[params[0]?.dataIndex ?? 0]; return this.tooltip(row?.seller || '', [{ label: 'Venta neta', value: this.money(row?.net ?? null, true) }, { label: 'Unidades', value: this.number(row?.units ?? null) }, { label: 'Transacciones', value: this.number(row?.transactions ?? null) }]); } },
      dataZoom: rows.length > visible ? [{ type: 'inside', yAxisIndex: 0, startValue: 0, endValue: visible - 1, zoomLock: true, moveOnMouseWheel: true }, { type: 'slider', yAxisIndex: 0, orient: 'vertical', right: 5, top: 6, bottom: 6, width: 21, startValue: 0, endValue: visible - 1, showDetail: false, brushSelect: false, showDataShadow: false, backgroundColor: '#E2E8F0', fillerColor: 'rgba(15,157,138,.42)', borderColor: '#8DA0BA', handleSize: '135%', moveHandleSize: 15, handleStyle: { color: C.teal, borderColor: '#0F766E', borderWidth: 2 } }] : [],
      xAxis: { type: 'value', max: max * 1.32, axisLabel: { color: '#64748B', fontSize: 8, formatter: (value: number) => `S/ ${this.short(value)}` }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      yAxis: { type: 'category', inverse: true, data: rows.map(row => row.seller), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { width: 108, overflow: 'truncate', color: '#334155', fontSize: 8, fontWeight: 700 } },
      series: [{ type: 'bar', data: rows.map(row => row.net), barMaxWidth: 20, itemStyle: { color: C.teal, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', formatter: (params: any) => this.money(Number(params.value), true), color: '#172033', fontSize: 8, fontWeight: 800 } }]
    } as EChartsOption;
  });
  readonly talentStoreProductivityOption = computed<EChartsOption>(() => {
    const rows = this.talentStoreRows().filter(row => row.productivity != null).slice(0, 7);
    const max = Math.max(1, ...rows.map(row => row.productivity || 0));
    return {
      animation: false, grid: { left: 48, right: 70, top: 8, bottom: 26 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: (params: any[]) => {
        const row = rows[params[0]?.dataIndex ?? 0];
        return this.tooltip(row?.alias || '', [
          { label: 'Venta neta', value: this.money(row?.net ?? null, true) },
          { label: 'Colaboradores', value: this.number(row?.staff ?? null) },
          { label: 'Venta por colaborador', value: this.money(row?.productivity ?? null, true) }
        ]);
      } },
      xAxis: { type: 'value', min: 0, max: max * 1.2, axisLabel: { color: '#64748B', fontSize: 8, formatter: (value: number) => `S/ ${this.short(value)}` }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      yAxis: { type: 'category', inverse: true, data: rows.map(row => row.alias), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#334155', fontSize: 8, fontWeight: 800 } },
      series: [{ type: 'bar', data: rows.map(row => row.productivity), barMaxWidth: 18, itemStyle: { color: C.blue, borderRadius: [0, 5, 5, 0] }, label: { show: true, position: 'right', color: '#172033', fontSize: 8, fontWeight: 800, formatter: (params: any) => this.money(Number(params.value), true) } }]
    } as EChartsOption;
  });
  readonly clientPerformanceOption = computed<EChartsOption>(() => {
    const rows = this.talentClientRows(); const max = Math.max(1, ...rows.map(row => Math.abs(row.net)));
    return {
      animation: false, grid: { left: 116, right: 46, top: 12, bottom: 24 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, position: this.tooltipToRight, formatter: (params: any[]) => {
        const row = rows[params[0]?.dataIndex ?? 0]; return this.tooltip(row?.client || '', [
          { label: 'Venta neta', value: this.money(row?.net ?? null, true) }, { label: 'Unidades', value: this.number(row?.units ?? null, ' und') }, { label: 'Transacciones', value: this.number(row?.transactions ?? null) }
        ]);
      } },
      xAxis: { type: 'value', min: 0, max: max * 1.18, axisLabel: { color: '#64748B', fontSize: 9, formatter: (value: number) => `S/ ${this.short(value)}` }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      yAxis: { type: 'category', inverse: true, data: rows.map(row => row.client), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#334155', fontSize: 9, fontWeight: 800, width: 108, overflow: 'truncate' } },
      series: [{ type: 'bar', data: rows.map(row => row.net), barMaxWidth: 22, itemStyle: { color: C.teal, borderRadius: [0, 5, 5, 0] }, label: { show: true, position: 'right', color: '#172033', fontSize: 9, fontWeight: 800, formatter: (params: any) => this.money(Number(params.value), true) } }]
    } as EChartsOption;
  });
  readonly talentExitRows = computed(() => {
    const categories = ['MEJOR OFERTA', 'SALUD', 'AUSENTISMO', 'PERSONAL', 'DESERCIÓN', 'CAMBIO DE TIENDA'];
    const counts = new Map(categories.map(category => [category, 0])); const ids = this.filteredStoreIds();
    for (const row of this.data()?.personnelProfiles || []) {
      if (!ids.has(row.storeId) || !row.retirementReason || (row.retirementDate && !row.retirementDate.startsWith(String(this.year())))) continue;
      const reason = this.normalized(row.retirementReason);
      const category = reason.includes('MEJOR OFERTA') || reason.includes('OTRO EMPLEO') ? 'MEJOR OFERTA'
        : reason.includes('SALUD') ? 'SALUD'
        : reason.includes('AUSENT') ? 'AUSENTISMO'
        : reason.includes('DESERC') ? 'DESERCIÓN'
        : reason.includes('CAMBIO') && reason.includes('TIENDA') ? 'CAMBIO DE TIENDA'
        : reason.includes('PERSONAL') ? 'PERSONAL' : '';
      if (category) counts.set(category, (counts.get(category) || 0) + 1);
    }
    return categories.map(category => ({ category, count: counts.get(category) || 0 }));
  });
  readonly talentExitOption = computed<EChartsOption>(() => {
    const rows = this.talentExitRows(); const max = Math.max(1, ...rows.map(row => row.count));
    return { animation: false, grid: { left: 112, right: 32, top: 8, bottom: 20 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: (params: any[]) => { const row = rows[params[0]?.dataIndex ?? 0]; return this.tooltip(row?.category || '', [{ label: 'Retiros registrados', value: this.number(row?.count ?? 0) }]); } },
      xAxis: { type: 'value', min: 0, max, minInterval: 1, axisLabel: { color: '#64748B', fontSize: 8 }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      yAxis: { type: 'category', inverse: true, data: rows.map(row => row.category), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#334155', fontSize: 8, fontWeight: 700 } },
      series: [{ type: 'bar', data: rows.map(row => row.count), barMaxWidth: 17, showBackground: true, backgroundStyle: { color: '#EEF2F7', borderRadius: 4 }, itemStyle: { color: C.red, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: '#172033', fontSize: 9, fontWeight: 800 } }]
    } as EChartsOption;
  });

  private courseProgressOption(rows: { name: string; value: number }[], color: string): EChartsOption {
    return { animation: false, grid: { left: 128, right: 42, top: 8, bottom: 22 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: (params: any[]) => { const row = rows[params[0]?.dataIndex ?? 0]; return this.tooltip(row?.name || '', [{ label: 'Avance visual', value: this.percent((row?.value || 0) / 100) }, { label: 'Estado', value: 'PENDIENTE DE FUENTE' }]); } },
      xAxis: { type: 'value', min: 0, max: 100, interval: 25, axisLabel: { formatter: (value: number) => `${value}%`, color: '#64748B', fontSize: 8 }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      yAxis: { type: 'category', inverse: true, data: rows.map(row => row.name), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { width: 116, overflow: 'truncate', color: '#334155', fontSize: 8, fontWeight: 700 } },
      series: [{ type: 'bar', data: rows.map(row => row.value), barMaxWidth: 19, showBackground: true, backgroundStyle: { color: '#EEF2F7', borderRadius: 5 }, itemStyle: { color, borderRadius: [0, 5, 5, 0] }, label: { show: true, position: 'right', formatter: '{c}%', color: '#172033', fontSize: 9, fontWeight: 800 } }]
    } as EChartsOption;
  }
  readonly sellerTrainingOption = computed<EChartsOption>(() => this.courseProgressOption([
    { name: 'Técnicas de venta', value: 72 }, { name: 'Producto y surtido', value: 58 },
    { name: 'Atención y reclamos', value: 64 }, { name: 'Venta omnicanal', value: 41 }
  ], C.teal));
  readonly administratorTrainingOption = computed<EChartsOption>(() => this.courseProgressOption([
    { name: 'Liderazgo operativo', value: 68 }, { name: 'Inventario y merma', value: 74 },
    { name: 'Seguridad y SST', value: 55 }, { name: 'Gestión de equipos', value: 46 }
  ], C.purple));
  readonly selectedTrainingOption = computed<EChartsOption>(() => this.trainingAudience() === 'SELLERS'
    ? this.sellerTrainingOption() : this.administratorTrainingOption());
  readonly talentIncidentsOption = computed<EChartsOption>(() => ({
    animation: false, tooltip: { trigger: 'item', confine: true, formatter: (params: any) => this.tooltip(params.name, [{ label: 'Casos referenciales', value: this.number(Number(params.value)) }, { label: 'Participación', value: `${params.percent}%` }]) },
    legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 8 } },
    series: [{ type: 'pie', radius: ['43%', '73%'], center: ['50%', '44%'], label: { show: true, fontSize: 8, formatter: '{b}\n{d}%' }, data: [
      { name: 'Libro de reclamaciones', value: 12, itemStyle: { color: C.red } }, { name: 'Denuncias', value: 3, itemStyle: { color: C.orange } },
      { name: 'Indecopi', value: 5, itemStyle: { color: C.purple } }, { name: 'Fiscalización municipal', value: 7, itemStyle: { color: C.blue } },
      { name: 'Defensa Civil', value: 4, itemStyle: { color: C.gold } }
    ] }]
  }));

  readonly assistantContext = computed(() => {
    const dashboard = this.data();
    if (!dashboard) return '{}';
    const metrics = this.metrics();
    return JSON.stringify({
      fuente: 'Dashboard Comercial Almacén de Remates',
      corteVentas: dashboard.metadata.salesCutoff,
      corteStock: dashboard.metadata.stockCutoff,
      periodo: { anio: this.year(), meses: this.monthFilterLabel() },
      filtros: {
        cluster: this.clusterFilterLabel(), formato: this.formatFilterLabel(), tiendas: this.storeFilterLabel(),
        rubros: this.categoryFilterLabel(), lineas: this.lineFilterLabel(), sublineas: this.sublineFilterLabel(),
      },
      kpisVisibles: {
        ventaBruta: metrics.gross, notasCredito: metrics.notes, descuentos: metrics.discount,
        ventaNeta: metrics.net, proyeccionCierre: metrics.projectedClose,
        metaAnual: metrics.annualTarget, cumplimientoAnual: metrics.annualPct,
        metaAcumulada: metrics.targetYtd, cumplimientoAcumulado: metrics.accumulatedPct,
        ventaPeriodo: metrics.monthNet, metaPeriodo: metrics.monthTarget, cumplimientoPeriodo: metrics.monthlyPct,
        ventaPromedioDiaria: metrics.dailyAverage, ticketPromedio: metrics.ticket, conversion: metrics.conversion,
        sellThrough: metrics.sellThrough, stockSellThroughUnidades: metrics.sellThroughStock,
        ventaPorM2: metrics.saleM2, ventaPorColaborador: metrics.saleCollaborator,
        colaboradores: metrics.personnel, ratioDevoluciones: metrics.returnRatio,
      },
      formulasKpi: {
        ventaBruta: 'Σ(precio sugerido × cantidad) para ventas positivas',
        ventaNeta: 'Σ(total de venta), incluyendo notas de crédito',
        ticketPromedio: 'venta neta ÷ número de transacciones',
        conversion: 'transacciones ÷ tráfico',
        ventaPromedioDiaria: 'venta neta del período ÷ días calendario seleccionados',
        ventaPorColaborador: 'venta neta del período ÷ colaboradores promedio',
        sellThrough: 'unidades vendidas ÷ (stock actual + unidades recibidas)',
        cumplimientoMeta: 'venta neta ÷ meta del mismo período',
      },
      metodologiaProyeccionCierre: {
        formula: 'Mezcla ponderada del forecast YTD y el forecast anual histórico, ajustados por crecimiento comparable',
        promedioHistorico: '60% del mismo período del año anterior + 40% de dos años antes',
        factorCrecimiento: 'Venta YTD actual ÷ YTD histórico ponderado, acotado entre 75% y 125%',
        ventaHistoricaMesesRestantes: metrics.projectionBase,
        factorCrecimientoActual: metrics.projectionGrowth,
        resultado: metrics.projectedClose,
      },
      regla: 'Responde solo con este resumen visible. No solicites datos adicionales ni menciones campos ausentes; omite lo que no esté disponible y no inventes valores.',
    });
  });

  private yearOnlyMonthLimit(year = this.year()): number {
    const d = this.data(); if (!d) return 12;
    const cutoffYear = Number(d.metadata.salesCutoff.slice(0, 4));
    const cutoffMonth = Number(d.metadata.salesCutoff.slice(5, 7));
    if (year === cutoffYear) return cutoffMonth;
    const available = d.monthlyStore.filter(row => Math.floor(row.periodId / 100) === year).map(row => row.periodId % 100);
    return available.length ? Math.max(...available) : 12;
  }
  private yearOnlyRows(year: number, monthLimit: number): Monthly[] {
    return (this.data()?.monthlyStore || []).filter(row => row.periodId >= year * 100 + 1 && row.periodId <= year * 100 + monthLimit);
  }
  private indexedStockCandidates(): ProductRow[] {
    const d = this.data(); if (!d || !this.stockProductsData().length) return [];
    const categories = this.selectedCategories();
    // Un filtro de rubro suele reducir mucho más que tienda; úsalo primero.
    if (categories.length) {
      const rows: ProductRow[] = [];
      for (const category of categories) rows.push(...(this.stockProductsByCategory.get(category) || []));
      return rows;
    }
    const ids = this.filteredStoreIds();
    if (ids.size && ids.size < d.stores.filter(store => store.isStore && this.storeAllowedByAccess(store)).length) {
      const rows: ProductRow[] = [];
      for (const id of ids) rows.push(...(this.stockProductsByStore.get(id) || []));
      return rows;
    }
    return this.stockProductsData();
  }
  readonly filteredProducts = computed(() => {
    const ids = this.filteredStoreIds();
    const candidates = this.indexedStockCandidates();
    const allStores = (this.data()?.stores || []).filter(store => store.isStore && this.storeAllowedByAccess(store)).length;
    if (!this.selectedCategories().length && !this.selectedLines().length && !this.selectedSublines().length && ids.size === allStores) return candidates;
    return candidates.filter(r => ids.has(r.storeId) &&
      this.categoryMatches(r.category) && this.lineMatches(r.line) && this.sublineMatches(r.subline));
  });
  // Snapshot fijo del último reporte. No depende de filtros comerciales, pero sí
  // respeta el alcance de acceso del usuario (tienda o clúster).
  readonly staticPredictiveProducts = computed(() => {
    const allowedIds = new Set((this.data()?.stores || [])
      .filter(store => this.storeAllowedByAccess(store))
      .map(store => store.storeId));
    return this.staticPredictiveProductsData().filter(row => allowedIds.has(row.storeId));
  });
  readonly predictiveApplicable = computed(() => {
    if (this.year() !== 2026) return false;
    const rubros = this.selectedCategories();
    // Si el usuario no filtra RUBRO (TODOS), el bloque sigue funcionando pero solo
    // calcula sobre TEXTIL + CALZADO. Si filtra explícitamente, solo aplica cuando
    // todos los rubros elegidos son TEXTIL/CALZADO.
    return !rubros.length || rubros.every(rubro => rubro === 'TEXTIL' || rubro === 'CALZADO');
  });
  readonly predictiveTemporalAvailable = computed(() => {
    const cutoff = this.data()?.metadata.stockCutoff || '';
    const cutoffYear = Number(cutoff.slice(0, 4)); const cutoffMonth = Number(cutoff.slice(5, 7));
    return this.year() === cutoffYear && (this.selectedMonths().length === 0 || this.selectedMonth() === cutoffMonth);
  });
  readonly predictiveTemporalMessage = computed(() => {
    if (this.predictiveTemporalAvailable()) return '';
    const cutoff = this.data()?.metadata.stockCutoff || '';
    return `FALTA HISTÓRICO PARA EL CORTE ${this.monthNamesFull[this.selectedMonth() - 1]} ${this.year()}. El JSON predictivo y el stock exportado están anclados al ${this.formatDate(cutoff)}.`;
  });
  readonly predictiveProducts = computed(() => {
    const ids = this.filteredStoreIds();
    return this.staticPredictiveProducts().filter(row => ids.has(row.storeId) &&
      this.categoryMatches(row.category) && this.lineMatches(row.line) && this.sublineMatches(row.subline));
  });
  readonly productOptions = computed(() => {
    const unfiltered = !this.selectedClusters().length && !this.selectedFormats().length && !this.selectedStores().length &&
      !this.selectedCategories().length && !this.selectedLines().length && !this.selectedSublines().length;
    if (unfiltered) {
      return [...this.predictiveAggregateByProduct().entries()]
        .map(([key, aggregate]) => ({ id: key.split('|')[0], name: aggregate.name, stock: aggregate.units }))
        .sort((a, b) => b.stock - a.stock || a.name.localeCompare(b.name)).slice(0, 500);
    }
    const groups = grouped(this.predictiveProducts(), r => `${r.productId}|${r.product}`);
    return [...groups.entries()].map(([key, rows]) => ({ id: key.split('|')[0], name: key.split('|').slice(1).join('|'), stock: sum(rows, 'stockUnits') }))
      .sort((a, b) => b.stock - a.stock || a.name.localeCompare(b.name)).slice(0, 500);
  });
  readonly activeProductId = computed(() => this.productId() === 'AUTO' ? (this.productOptions()[0]?.id || '') : this.productId());
  readonly activeProductRows = computed(() => {
    this.stockDetailLoaded();
    const ids = this.filteredStoreIds();
    return (this.predictiveProductsByProduct.get(this.activeProductId()) || []).filter(row => ids.has(row.storeId) &&
      this.categoryMatches(row.category) && this.lineMatches(row.line) && this.sublineMatches(row.subline));
  });
  readonly activeProduct = computed(() => {
    const rows = this.activeProductRows();
    return {
      id: this.activeProductId(), name: rows[0]?.product || 'FALTA INFORMACIÓN', category: rows[0]?.category || '',
      stockUnits: sum(rows, 'stockUnits'), stockValue: sum(rows, 'stockValue'),
      goodUnits: rows.reduce((t, r) => t + (r.goodUnits || 0), 0),
      mermaStockUnits: rows.reduce((t, r) => t + (r.mermaStockUnits || 0), 0),
      desmedroStockUnits: rows.reduce((t, r) => t + (r.desmedroStockUnits || 0), 0),
      units30: sum(rows, 'units30'), sales30: sum(rows, 'sales30'), units12: sum(rows, 'units12'), sales12: sum(rows, 'sales12')
    };
  });
  // Cálculo 100% en el navegador (no hay backend /api/predictive en este proyecto).
  // El ancla de fecha es SIEMPRE el corte de stock/ventas (fijo), no la selección de AÑO/MES:
  // FactStock es una sola foto (regla 5) y la regla 2 dice que MES es solo "contexto", no
  // debe recortar la ventana de 30/60/90 días.
  readonly predictiveCalculation = computed<PredictiveCalculation | null>(() => {
    if (!this.predictiveApplicable() || !this.predictiveDetailLoaded()) return null;
    const productId = this.activeProductId(); if (!productId) return null;
    const storeIds = this.filteredStoreIds(); if (!storeIds.size) return null;
    const window = this.demandWindow();
    const index = this.predictiveIndex();
    const productRows = this.activeProductRows().filter(r => storeIds.has(r.storeId));
    if (!productRows.length) return null;
    const stockActual = sum(productRows, 'stockUnits');
    let unitsSold = 0; let unitsMermadas = 0;
    for (const row of productRows) {
      const extra = index.get(`${row.storeId}|${row.productId}`);
      unitsSold += this.windowTotal(window, row.units30, extra?.units60, extra?.units90);
      unitsMermadas += this.windowTotal(window, extra?.merma30, extra?.merma60, extra?.merma90);
    }
    const mermaPct = (unitsSold + unitsMermadas) > 0 ? unitsMermadas / (unitsSold + unitsMermadas) : 0;
    // La vendibilidad actual sale del ESTADO real: BUENO sí vende; MERMA/DESMEDRO no.
    // El 18% solo queda como compatibilidad con JSON anteriores sin desglose de estado.
    const goodStock = productRows.reduce((t, row) => t + (row.goodUnits || 0), 0);
    const hasStateBreakdown = productRows.some(row => row.goodUnits != null || row.mermaStockUnits != null || row.desmedroStockUnits != null);
    const fallbackVendability = 1 - (this.data()?.metadata.nonSellableRate ?? .18);
    const vendability = stockActual > 0 ? (hasStateBreakdown ? goodStock / stockActual : fallbackVendability) : 0;
    const demandDaily = unitsSold / window;
    const annualDemand = demandDaily * 365;
    const stockVendible = hasStateBreakdown ? goodStock : stockActual * Math.max(0, vendability);
    const coverageDays = demandDaily > 0 ? stockVendible / demandDaily : null;
    return {
      cutoffDate: this.data()?.metadata.stockCutoff || '', windowDays: window, unitsSold, unitsMermadas, mermaPct,
      vendability, demandDaily, annualDemand, stockActual, stockVendible, coverageDays,
    };
  });
  private windowTotal(days: number, value30?: number, value60?: number, value90?: number): number {
    const d = Math.max(1, days); const v30 = Math.max(0, value30 || 0);
    const v60 = Math.max(v30, value60 ?? v30 * 2); const v90 = Math.max(v60, value90 ?? v60 * 1.5);
    if (d <= 30) return v30 * d / 30;
    if (d <= 60) return v30 + (v60 - v30) * (d - 30) / 30;
    if (d <= 90) return v60 + (v90 - v60) * (d - 60) / 30;
    return v90 * d / 90;
  }
  private predictiveWindowUnits(row: ProductRow, days: number): number {
    const detail = this.predictiveIndex().get(`${row.storeId}|${row.productId}`);
    // Para ventanas mayores a 90 días, el modelo proyecta el promedio observado
    // en los últimos 90 días porque el origen solo contiene cortes 30/60/90.
    return this.windowTotal(days, row.units30, detail?.units60, detail?.units90);
  }
  private predictiveStatus(days: number | null, noMovement: boolean): { label: string; color: string } {
    if (noMovement) return { label: 'SIN ROTACIÓN', color: '#94A3B8' };
    if (days == null) return { label: 'SIN DATOS', color: C.slate };
    if (days <= this.healthyCoverageDays() / 2) return { label: 'CRÍTICO', color: '#DC2626' };
    if (days <= this.healthyCoverageDays()) return { label: 'ALERTA', color: C.orange };
    if (days <= this.overstockDays()) return { label: 'ÓPTIMO', color: C.green };
    return { label: 'BAJA ROTACIÓN', color: C.gold };
  }
  private predictivePriority(status: string, deficitUnits: number): { label: string; color: string; index: number } {
    if (status === 'CRÍTICO') return { label: 'URGENTE', color: '#DC2626', index: 100 };
    if (status === 'ALERTA') return { label: 'ALTA', color: C.orange, index: 75 };
    if (status === 'ÓPTIMO' && deficitUnits > 0) return { label: 'MEDIA', color: C.navy, index: 50 };
    if (status === 'ÓPTIMO') return { label: 'BAJA', color: C.green, index: 25 };
    return { label: 'NO REPONER', color: '#94A3B8', index: 5 };
  }
  readonly predictiveScopedProducts = computed(() => {
    const storeIds = new Set(this.predictiveStoreOptions().map(store => store.storeId)); const rubros = new Set(this.predictiveRubros()); const selectedStore = this.predictiveStore();
    return this.staticPredictiveProducts().filter(row => storeIds.has(row.storeId) && ['TEXTIL', 'CALZADO'].includes(row.category) && rubros.has(row.category) &&
      (selectedStore === 'TODAS' || row.storeId === selectedStore) && this.lineMatches(row.line) && this.sublineMatches(row.subline));
  });
  readonly predictiveStoreOptions = computed(() => this.inventoryStoresIgnoringStoreFilter());
  readonly predictiveBrandRows = computed<PredictiveBrand[]>(() => {
    const byBrand = grouped(this.predictiveScopedProducts(), row => row.brand || 'SIN MARCA');
    const window = this.demandWindow(); const movementDays = Math.max(1, this.noMovementMonths()) * 30;
    const nonSellableRate = Math.min(.95, Math.max(0, .18 + this.predictiveMermaPct() / 100));
    return [...byBrand.entries()].map(([name, brandRows]) => {
      const stockUnits = sum(brandRows, 'stockUnits'); const stockValue = sum(brandRows, 'stockValue');
      const demandUnits = brandRows.reduce((total, row) => total + this.predictiveWindowUnits(row, window), 0);
      const movementUnits = brandRows.reduce((total, row) => total + this.predictiveWindowUnits(row, movementDays), 0);
      const demandDaily = demandUnits / window; const vendibleUnits = stockUnits * (1 - nonSellableRate); const vendibleValue = stockValue * (1 - nonSellableRate);
      const coverageDays = demandDaily > 0 ? vendibleUnits / demandDaily : null; const status = this.predictiveStatus(coverageDays, movementUnits <= 0);
      const targetUnits = demandDaily * this.healthyCoverageDays(); const deficitUnits = Math.max(targetUnits - vendibleUnits, 0); const priority = this.predictivePriority(status.label, deficitUnits);
      return { name, stockUnits, stockValue, vendibleUnits, vendibleValue, demandUnits, demandDaily, coverageDays, status: status.label, color: status.color,
        targetUnits, deficitUnits, priority: priority.label, priorityColor: priority.color, priorityIndex: priority.index + (targetUnits > 0 ? deficitUnits / targetUnits * 20 : 0) };
    }).sort((a, b) => a.coverageDays == null ? 1 : b.coverageDays == null ? -1 : a.coverageDays - b.coverageDays);
  });
  readonly predictiveReplenishmentRows = computed(() => [...this.predictiveBrandRows()]
    .sort((a, b) => b.priorityIndex - a.priorityIndex));
  readonly predictiveProductHealthRows = computed(() => {
    const window = this.demandWindow(); const movementDays = Math.max(1, this.noMovementMonths()) * 30;
    const nonSellableRate = Math.min(.95, Math.max(0, .18 + this.predictiveMermaPct() / 100));
    return this.predictiveScopedProducts().map(row => {
      const demandUnits = this.predictiveWindowUnits(row, window);
      const movementUnits = this.predictiveWindowUnits(row, movementDays);
      const demandDaily = demandUnits / window;
      const vendibleValue = row.stockValue * (1 - nonSellableRate);
      const coverageDays = demandDaily > 0 ? row.stockUnits * (1 - nonSellableRate) / demandDaily : null;
      const status = this.predictiveStatus(coverageDays, movementUnits <= 0);
      return { status: status.label, vendibleValue, product: row.product, brand: row.brand, storeId: row.storeId, coverageDays, stockUnits: row.stockUnits };
    });
  });
  readonly predictiveHealthRows = computed(() => {
    const order = ['CRÍTICO', 'ALERTA', 'ÓPTIMO', 'BAJA ROTACIÓN', 'SIN ROTACIÓN'];
    const colors: Record<string, string> = { 'CRÍTICO': '#DC2626', 'ALERTA': C.orange, 'ÓPTIMO': C.green, 'BAJA ROTACIÓN': C.gold, 'SIN ROTACIÓN': '#94A3B8' };
    // Salud se clasifica por SKU, no por marca: una marca con un artículo activo no
    // puede ocultar otros artículos sin movimiento dentro de la misma marca.
    const rowsByStatus = grouped(this.predictiveProductHealthRows(), row => row.status); const total = this.predictiveProductHealthRows().reduce((value, row) => value + row.vendibleValue, 0);
    return order.map(status => { const rows = rowsByStatus.get(status) || []; const value = rows.reduce((sumValue, row) => sumValue + row.vendibleValue, 0);
      return { status, value, brands: rows.length, share: total ? value / total : 0, color: colors[status] }; });
  });
  predictiveStatusColor(status: string): string {
    return ({ 'CRÍTICO': '#DC2626', 'ALERTA': C.orange, 'ÓPTIMO': C.green, 'BAJA ROTACIÓN': C.gold, 'SIN ROTACIÓN': '#94A3B8' } as Record<string, string>)[status] || C.slate;
  }
  readonly predictiveHealthOption = computed<EChartsOption>(() => {
    const rows = this.predictiveHealthRows().filter(row => row.value > 0 || row.brands > 0);
    return { animation: false, tooltip: { trigger: 'item', confine: true, position: this.tooltipToRight, formatter: (params: any) => {
      const row = rows[params.dataIndex ?? 0]; return this.tooltip(row?.status || '', [{ label: 'Valor de stock', value: this.money(row?.value ?? null, true) }, { label: 'Participación', value: this.percent(row?.share ?? null) }, { label: 'SKU evaluados', value: this.number(row?.brands ?? null) }]);
    } }, series: [{ type: 'pie', radius: ['56%', '78%'], center: ['50%', '50%'], startAngle: 90, clockwise: true, avoidLabelOverlap: true,
      label: { show: false }, labelLine: { show: false }, emphasis: { scale: true, scaleSize: 7 },
      data: rows.map(row => ({ name: row.status, value: row.value, itemStyle: { color: row.color, borderColor: '#fff', borderWidth: 3 } }))
    }] } as EChartsOption;
  });
  readonly predictivePriorityProducts = computed(() => {
    const priority: Record<string, number> = { 'CRÍTICO': 0, 'ALERTA': 1, 'SIN ROTACIÓN': 2, 'BAJA ROTACIÓN': 3, 'ÓPTIMO': 4 };
    const days = this.coverageProjectionHorizon();
    const stores = new Map(this.inventoryStoresIgnoringStoreFilter().map(store => [store.storeId, store.alias || store.store]));
    return [...this.predictiveProductHealthRows()]
      .map(row => {
        const coverageDays = row.coverageDays == null ? null : Math.max(0, row.coverageDays - days);
        const status = row.status === 'SIN ROTACIÓN' || coverageDays == null
          ? 'SIN ROTACIÓN'
          : this.predictiveStatus(coverageDays, false).label;
        return { ...row, coverageDays, status };
      })
      .sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9) || (a.coverageDays ?? -1) - (b.coverageDays ?? -1) || b.vendibleValue - a.vendibleValue)
      .slice(0, 5)
      .map(row => ({ ...row, store: stores.get(row.storeId) || row.storeId }));
  });
  readonly predictiveBreakageOption = computed<EChartsOption>(() => {
    const rows = this.predictiveBrandRows(); const visible = Math.min(7, rows.length);
    const scaleLimit = Math.max(this.overstockDays(), this.healthyCoverageDays() * 2);
    const values = rows.map(row => Math.min(row.coverageDays ?? 0, scaleLimit)); const max = scaleLimit * 1.18;
    return { animation: false, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, position: this.tooltipToRight, formatter: (params: any[]) => {
      const row = rows[params[0]?.dataIndex ?? 0]; return this.tooltip(row?.name || '', [{ label: 'Días de cobertura', value: row?.coverageDays == null ? 'SIN VENTA EN VENTANA' : this.number(row.coverageDays, ' días') }, { label: 'Estado', value: row?.status || '' }, { label: 'Stock vendible', value: this.number(row?.vendibleUnits ?? null, ' und') }, { label: 'Demanda diaria', value: this.number(row?.demandDaily ?? null, ' und/día') }]);
    } }, grid: { left: 102, right: 42, top: 8, bottom: 24 }, dataZoom: rows.length > visible ? [
      { type: 'inside', yAxisIndex: 0, startValue: 0, endValue: visible - 1, zoomLock: true, moveOnMouseWheel: true },
      { type: 'slider', yAxisIndex: 0, orient: 'vertical', right: 1, top: 8, bottom: 8, width: 14, startValue: 0, endValue: visible - 1, showDetail: false, brushSelect: false,
        backgroundColor: '#D8E0EC', fillerColor: 'rgba(220,38,38,.22)', borderColor: '#9AABC2', handleSize: '110%', handleStyle: { color: '#DC2626', borderColor: '#991B1B' } }
    ] : [], xAxis: { type: 'value', max, splitNumber: 4, axisLabel: { color: '#64748B', formatter: (value: number) => `${Math.round(value)}d` }, splitLine: { lineStyle: { color: '#E5E7EB' } } }, yAxis: { type: 'category', inverse: true, data: rows.map(row => row.name), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#334155', fontSize: 9, fontWeight: 700, width: 86, overflow: 'truncate' } }, series: [{ type: 'bar', data: values.map((value, index) => ({ value, itemStyle: { color: rows[index].color, borderRadius: [0, 5, 5, 0] } })), barMaxWidth: 18, label: { show: true, position: 'right', color: '#172033', fontSize: 9, fontWeight: 700, formatter: (params: any) => { const row = rows[params.dataIndex]; return row.coverageDays == null ? 'S/M' : `${Math.round(row.coverageDays)} d`; } } }] } as EChartsOption;
  });
  readonly predictiveReplenishmentOption = computed<EChartsOption>(() => {
    const rows = this.predictiveReplenishmentRows(); const visible = Math.min(7, rows.length);
    return { animation: false, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, position: this.tooltipToRight, formatter: (params: any[]) => { const row = rows[params[0]?.dataIndex ?? 0]; return this.tooltip(row?.name || '', [{ label: 'Prioridad', value: row?.priority || '' }, { label: 'Unidades sugeridas', value: this.number(row?.deficitUnits ?? null, ' und') }, { label: 'Cobertura actual', value: row?.coverageDays == null ? 'SIN VENTA EN VENTANA' : this.number(row.coverageDays, ' días') }]); } }, grid: { left: 112, right: 42, top: 8, bottom: 24 }, dataZoom: rows.length > visible ? [
      { type: 'inside', yAxisIndex: 0, startValue: 0, endValue: visible - 1, zoomLock: true, moveOnMouseWheel: true },
      { type: 'slider', yAxisIndex: 0, orient: 'vertical', right: 1, top: 8, bottom: 8, width: 14, startValue: 0, endValue: visible - 1, showDetail: false, brushSelect: false,
        backgroundColor: '#D8E0EC', fillerColor: 'rgba(18,58,140,.24)', borderColor: '#9AABC2', handleSize: '110%', handleStyle: { color: C.navy, borderColor: '#0C2D70' } }
    ] : [], xAxis: { type: 'value', max: 125, axisLabel: { show: false }, splitLine: { show: false } }, yAxis: { type: 'category', inverse: true, data: rows.map(row => row.name), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#334155', fontSize: 9, fontWeight: 700, width: 96, overflow: 'truncate' } }, series: [{ type: 'bar', data: rows.map(row => ({ value: Math.min(120, row.priorityIndex), itemStyle: { color: row.priorityColor, borderRadius: [0, 5, 5, 0] } })), barMaxWidth: 18, label: { show: true, position: 'right', color: '#172033', fontSize: 9, fontWeight: 700, formatter: (params: any) => rows[params.dataIndex]?.priority || '' } }] } as EChartsOption;
  });
  private coverageProjectionRowsFor(days: number) {
    const statuses = ['CRÍTICO', 'ALERTA', 'ÓPTIMO', 'BAJA ROTACIÓN', 'SIN ROTACIÓN'];
    const colors: Record<string, string> = { 'CRÍTICO': '#DC2626', 'ALERTA': C.orange, 'ÓPTIMO': C.green, 'BAJA ROTACIÓN': C.gold, 'SIN ROTACIÓN': '#94A3B8' };
    const buckets = new Map(statuses.map(status => [status, { value: 0, products: 0 }]));
    this.predictiveProductHealthRows().forEach(row => {
      const status = row.status === 'SIN ROTACIÓN' || row.coverageDays == null ? 'SIN ROTACIÓN' : this.predictiveStatus(Math.max(0, row.coverageDays - days), false).label;
      const bucket = buckets.get(status) || buckets.get('SIN ROTACIÓN')!; bucket.value += row.vendibleValue; bucket.products += 1;
    });
    const raw = statuses.map(status => ({ status, ...buckets.get(status)!, color: colors[status] }));
    const total = raw.reduce((value, row) => value + row.value, 0);
    return raw.map(row => ({ ...row, share: total ? row.value / total : 0 }));
  }
  readonly predictiveProjectionRows = computed(() => this.coverageProjectionRowsFor(this.coverageProjectionHorizon()));
  readonly predictiveStoreRiskRows = computed(() => {
    const days = this.coverageProjectionHorizon();
    const stores = new Map((this.data()?.stores || []).map(store => [store.storeId, store.alias || store.store]));
    const byStore = grouped(this.predictiveProductHealthRows(), row => row.storeId);
    return [...byStore.entries()].map(([storeId, storeRows]) => {
      const risky = storeRows.filter(row => {
        if (row.status === 'SIN ROTACIÓN' || row.coverageDays == null) return false;
        const status = this.predictiveStatus(Math.max(0, row.coverageDays - days), false).label;
        return status === 'CRÍTICO' || status === 'ALERTA';
      });
      const totalValue = storeRows.reduce((total, row) => total + row.vendibleValue, 0);
      const riskValue = risky.reduce((total, row) => total + row.vendibleValue, 0);
      return { storeId, store: stores.get(storeId) || storeId, riskValue, totalValue, share: totalValue ? riskValue / totalValue : 0, riskProducts: risky.length, products: storeRows.length };
    }).filter(row => row.riskValue > 0).sort((a, b) => b.riskValue - a.riskValue).slice(0, 7);
  });
  readonly predictiveProjectionOption = computed<EChartsOption>(() => {
    const days = this.coverageProjectionHorizon(); const rows = this.predictiveStoreRiskRows();
    const max = Math.max(1, ...rows.map(row => row.riskValue));
    const totalRisk = rows.reduce((total, row) => total + row.riskValue, 0);
    return {
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, position: this.tooltipToRight, formatter: (params: any[]) => {
        const row = rows[params[0]?.dataIndex ?? 0];
        return this.tooltip(row?.store || '', [
          { label: days ? `Valor en riesgo +${days} días` : 'Valor en riesgo actual', value: this.money(row?.riskValue ?? null, true) },
          { label: 'Participación del inventario', value: this.percent(row?.share ?? null) },
          { label: 'SKU en riesgo', value: this.number(row?.riskProducts ?? null) },
          { label: 'SKU evaluados', value: this.number(row?.products ?? null) }
        ]);
      } },
      graphic: [{ type: 'text', right: 5, top: 1, style: { text: `TOTAL ${this.money(totalRisk, true)}`, textAlign: 'right', fill: '#334155', fontSize: 9, fontWeight: 800 } }],
      grid: { left: 42, right: 78, top: 22, bottom: 22 },
      xAxis: { type: 'value', min: 0, max: max * 1.18, axisLabel: { color: '#64748B', fontSize: 8, formatter: (value: number) => `S/ ${this.short(value)}` }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      yAxis: { type: 'category', inverse: true, data: rows.map(row => row.store), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#334155', fontSize: 8, fontWeight: 850 } },
      series: [{ type: 'bar', barMaxWidth: 14, data: rows.map(row => ({ value: row.riskValue, itemStyle: { color: row.share >= .5 ? '#DC2626' : row.share >= .25 ? C.orange : C.gold, borderRadius: [0, 4, 4, 0] } })), label: { show: true, position: 'right', color: '#172033', fontSize: 8, fontWeight: 800, formatter: (params: any) => this.money(Number(params.value), true) } }]
    } as EChartsOption;
  });
  readonly productExtremes = computed<{ high: { name: string; units: number; value: number }[]; low: { name: string; units: number; value: number }[] }>(() => {
    const groups = grouped(this.inventoryProductsIgnoringStoreFilter(), row => `${row.productId}|${row.product}`);
    const values = [...groups.entries()].map(([key, rows]) => ({ name: key.split('|').slice(1).join('|'), units: sum(rows, 'stockUnits'), value: sum(rows, 'stockValue') }))
      .filter(x => x.units > 0).sort((a, b) => b.units - a.units);
    return { high: values.slice(0, 3), low: [...values].sort((a, b) => a.units - b.units).slice(0, 3) };
  });

  readonly stockTotals = computed(() => {
    const hierarchyActive = this.selectedCategories().length || this.selectedLines().length || this.selectedSublines().length;
    const selectedIds = this.filteredStoreIds();
    const aggregates = this.stockAggregateByStore();
    // stockStore llega con dashboard.json; usarlo como respaldo evita que el
    // medidor aparezca vacío mientras carga el detalle pesado por producto.
    const baseStockByStore = new Map<string, StockAggregate>();
    for (const row of this.data()?.stockStore || []) {
      const current = baseStockByStore.get(row.storeId) || { stockUnits: 0, stockValue: 0, units30: 0, sales30: 0 };
      current.stockUnits += Number(row.units) || 0;
      current.stockValue += Number(row.value) || 0;
      baseStockByStore.set(row.storeId, current);
    }
    const readyAggregates = aggregates.size ? aggregates : baseStockByStore;
    const stockRows = hierarchyActive ? this.filteredProducts() : [];
    return {
      capacity: this.filteredStores().reduce((t, s) => t + (s.capacity || 0), 0),
      units: hierarchyActive ? sum(stockRows, 'stockUnits') : [...selectedIds].reduce((total, id) => total + (readyAggregates.get(id)?.stockUnits || 0), 0),
      value: hierarchyActive ? sum(stockRows, 'stockValue') : [...selectedIds].reduce((total, id) => total + (readyAggregates.get(id)?.stockValue || 0), 0)
    };
  });
  // ANTIGÜEDAD STOCK es una foto de inventario: no debe depender del año ni
  // del mes comercial. Sí conserva Clúster, Formato, Tienda y producto.
  readonly inventoryStoreIds = computed(() => {
    const d = this.data(); if (!d) return new Set<string>();
    const selected = new Set(this.selectedStores());
    return new Set(d.stores
      .filter(store => this.storeAllowedByAccess(store) && this.storeBelongsToSelectedCluster(store) && (this.isDistributionChannel(store) || this.storeActiveAtDate(store, d.metadata.stockCutoff)))
      .filter(store => this.formatMatches(store))
      .filter(store => !selected.size || selected.has(store.storeId))
      .map(store => store.storeId));
  });
  // Inventario que responde a Clúster/Formato y jerarquía, pero deliberadamente no a TIENDA.
  // Así Rotación por tienda y Pronóstico de quiebre siempre conservan la comparación completa.
  readonly inventoryStoresIgnoringStoreFilter = computed(() => {
    const d = this.data(); if (!d) return [];
    return d.stores.filter(store =>
      this.storeAllowedByAccess(store) && this.storeBelongsToSelectedCluster(store) && this.formatMatches(store) &&
      (this.isDistributionChannel(store) || this.storeActiveAtDate(store, d.metadata.stockCutoff))
    );
  });
  readonly inventoryStoreIdsIgnoringStoreFilter = computed(() => new Set(this.inventoryStoresIgnoringStoreFilter().map(store => store.storeId)));
  readonly inventoryProductsIgnoringStoreFilter = computed(() => {
    const ids = this.inventoryStoreIdsIgnoringStoreFilter();
    const candidates = this.selectedCategories().length
      ? this.selectedCategories().flatMap(category => this.stockProductsByCategory.get(category) || [])
      : this.stockProductsData();
    return candidates.filter(row => ids.has(row.storeId) && this.categoryMatches(row.category) && this.lineMatches(row.line) && this.sublineMatches(row.subline));
  });
  readonly stockOrigins = computed(() => {
    const ids = this.inventoryStoreIds();
    return this.stockOriginData().filter(r => r.originPeriodId > 0 && ids.has(r.storeId) &&
      this.categoryMatches(r.category) && this.lineMatches(r.line) && this.sublineMatches(r.subline));
  });
  readonly selectedStockOrigins = computed(() => {
    const buckets = this.stockHistoryBucketsSelected();
    if (!buckets.length || buckets.includes('ALL')) return this.stockOrigins();
    return this.stockOrigins().filter(row => {
      const originYear = Math.floor(row.originPeriodId / 100);
      return buckets.some(bucket => bucket === '2019_PLUS' ? originYear <= 2019 : originYear === Number(bucket));
    });
  });
  readonly stockHistoryLabel = computed(() => {
    const selected = this.stockHistoryBucketsSelected();
    if (!selected.length) return 'GENERAL';
    return selected.map(value => this.stockHistoryBuckets.find(bucket => bucket.value === value)?.label || value).join(' + ');
  });
  readonly stockHistorySummary = computed(() => {
    const rows = this.selectedStockOrigins();
    const units = sum(rows, 'units'); const value = sum(rows, 'value'); const total = sum(this.stockOrigins(), 'units');
    return { units, value, share: total ? units / total : null };
  });

  private coverageStatus(days: number | null): { label: string; color: string } {
    if (days == null || !Number.isFinite(days)) return { label: 'FALTA INFORMACIÓN', color: C.slate };
    const match = this.data()?.metadata.coverageRanges.find(r => days >= r.min && days <= r.max);
    return match ? { label: match.label, color: match.color } : { label: 'OBSERVACIÓN', color: C.slate };
  }
  readonly coverageRows = computed<CoverageRow[]>(() => {
    const storeMap = new Map(this.inventoryStoresIgnoringStoreFilter().map(store => [store.storeId, store]));
    const groups = grouped(this.inventoryProductsIgnoringStoreFilter(), row => row.storeId);
    return [...storeMap.keys()].map(storeId => {
      const rows = groups.get(storeId) || [];
      const stockUnits = sum(rows, 'stockUnits'); const stockValue = sum(rows, 'stockValue');
      const units30 = sum(rows, 'units30'); const sales30 = sum(rows, 'sales30');
      const goodUnits = rows.reduce((total, row) => total + (row.goodUnits || 0), 0);
      const hasStateBreakdown = rows.some(row => row.goodUnits != null || row.mermaStockUnits != null || row.desmedroStockUnits != null);
      const effectiveUnits = hasStateBreakdown ? goodUnits : stockUnits * (1 - (this.data()?.metadata.nonSellableRate ?? .18));
      const days = units30 > 0 ? effectiveUnits * 30 / units30 : null; const status = this.coverageStatus(days);
      return { storeId, alias: storeMap.get(storeId)?.alias || storeId, stockUnits, effectiveUnits, stockValue, units30, sales30, days, status: status.label, color: status.color };
    }).sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
  });
  readonly coverageKpis = computed(() => {
    const valid = this.coverageRows().filter(r => r.days != null).map(r => r.days!).sort((a, b) => a - b);
    return { min: valid[0] ?? null, median: valid.length ? valid[Math.floor((valid.length - 1) / 2)] : null, max: valid.at(-1) ?? null,
      critical: this.coverageRows().filter(r => r.status === 'CRÍTICO').length, excess: this.coverageRows().filter(r => r.status === 'EXCESO').length };
  });

  readonly annualDemand = computed(() => this.predictiveCalculation()?.annualDemand ?? null);
  readonly leadTime = computed(() => this.replenishmentType() === 'internal' ? this.internalLeadTime() : this.supplierLeadTime());
  readonly safetyStock = computed(() => {
    const daily = this.predictiveCalculation()?.demandDaily;
    return daily == null ? null : daily * this.securityDays();
  });
  readonly eoq = computed(() => {
    const d = this.annualDemand(); const s = this.orderCost(); const h = this.holdingCost(); const ve = this.predictiveCalculation()?.vendability;
    const classic = d != null && d > 0 && s > 0 && h > 0 ? Math.sqrt(2 * d * s / h) : null;
    return { classic, value: classic == null || ve == null || ve <= 0 ? null : classic * (1 / ve) };
  });
  readonly rop = computed(() => {
    const calculation = this.predictiveCalculation(); const daily = calculation?.demandDaily ?? null; const ve = calculation?.vendability ?? null;
    const lead = this.leadTime(); const safety = this.safetyStock(); const current = calculation?.stockActual ?? null;
    const value = daily == null || lead == null || safety == null || ve == null || ve <= 0 ? null : (daily * lead + safety) / ve;
    const daysUntil = daily != null && daily > 0 && current != null && value != null ? Math.max(0, (current - value) / daily) : null;
    return { daily, value, daysUntil, current };
  });

  readonly metaVsRealOption = computed<EChartsOption>(() => {
    // Histórico mensual BLINDADO contra MES: no lee selectedMonths(), activeMonths(),
    // selectedPeriod() ni selectedPeriods(). Solo responde a Año + Tienda/Clúster/
    // Formato + Rubro/Línea/Sublínea.
    const months = this.historicalYearPeriods().map(period => period % 100);
    const ids = this.historicalYearStoreIds();
    const dimensionIndex = this.currentDimensionIndex();
    const realRowsForMonth = (month: number) => this.currentDimensionFilter(
      this.indexedRows(dimensionIndex, [this.year() * 100 + month], ids)
    );
    const real = months.map(month => sum(realRowsForMonth(month), 'net'));
    // Usa la misma lógica de meta que las tarjetas: al filtrar una o varias
    // tiendas muestra exclusivamente sus metas contra sus ventas mensuales.
    const target = months.map(month => this.targetForPeriods([this.year() * 100 + month]));
    const units = months.map(month => sum(realRowsForMonth(month), 'units'));
    return this.comboOption(months.map(month => MONTHS[month - 1]), real, target, units);
  });
  readonly rankingStoreCountLabel = computed(() => {
    const stores = (this.data()?.stores || []).filter(store => store.isStore && this.storeAllowedByAccess(store))
      .filter(store => this.storeOverlapsPeriod(store, this.year() * 100 + 1, this.year() * 100 + 12));
    const closed = stores.filter(store => store.closingDate?.startsWith(`${this.year()}-`)).length;
    const active = Math.max(0, stores.length - closed);
    return `${stores.length} TIENDAS · ${active} ACTIVAS${closed ? ` + ${closed} CERRADA${closed === 1 ? '' : 'S'}` : ''}`;
  });
  readonly growthOption = computed<EChartsOption>(() => {
    const selectedYear = this.year(); const previousYear = selectedYear - 1; const monthLimit = this.yearOnlyMonthLimit(selectedYear);
    const months = Array.from({ length: monthLimit }, (_, index) => index + 1); const ids = this.historicalYearStoreIds();
    const dimensionIndex = this.currentDimensionIndex();
    const monthlyValue = (year: number, month: number) => sum(this.currentDimensionFilter(
      this.indexedRows(dimensionIndex, [year * 100 + month], ids)
    ), 'net');
    const accumulate = (values: number[]) => { let total = 0; return values.map(value => total += value); };
    const current = accumulate(months.map(month => monthlyValue(selectedYear, month)));
    const previous = accumulate(months.map(month => monthlyValue(previousYear, month)));
    const variation = current.map((value, index) => previous[index] ? value / previous[index] - 1 : null);
    return {
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'line' }, confine: true, padding: [5, 7], textStyle: { fontSize: 9 }, position: this.tooltipToRight, formatter: (params: any[]) => {
        const i = params[0]?.dataIndex ?? 0;
        return this.tooltip(MONTHS[months[i] - 1], [
          { label: `Acumulado ${selectedYear}`, value: this.money(current[i], true) },
          { label: `Acumulado ${previousYear}`, value: this.money(previous[i], true) },
          { label: 'Variación interanual', value: variation[i] == null ? 'FALTA INFORMACIÓN' : this.trend(variation[i]) }
        ]);
      } },
      legend: { data: [String(selectedYear), String(previousYear)], top: 0, right: 4, itemWidth: 17, itemHeight: 7, textStyle: { color: '#475569', fontSize: 9, fontWeight: 700 } },
      grid: { left: 54, right: 18, top: 30, bottom: 28 },
      xAxis: { type: 'category', boundaryGap: false, data: months.map(month => MONTHS[month - 1]), axisTick: { show: false }, axisLabel: { color: '#64748B', fontSize: 9 } },
      yAxis: { type: 'value', axisLabel: { color: '#64748B', fontSize: 9, formatter: (value: number) => this.short(value) }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#E5E7EB', type: 'dotted' } } },
      series: [
        { name: String(selectedYear), type: 'line', data: current, smooth: true, symbol: 'circle', symbolSize: 6,
          lineStyle: { color: C.blue, width: 3 }, itemStyle: { color: C.blue }, areaStyle: { color: 'rgba(40,120,208,.10)' }, z: 4 },
        { name: String(previousYear), type: 'line', data: previous, smooth: true, symbol: 'circle', symbolSize: 5,
          lineStyle: { color: C.slate, width: 2, type: 'dashed' }, itemStyle: { color: C.slate }, z: 3 }
      ]
    } as EChartsOption;
  });
  readonly rankingOption = computed<EChartsOption>(() => {
    const d = this.data(); if (!d) return {};
    const selectedMetrics = this.rankingMetrics();
    const selectedYear = this.year(); const periods = this.selectedPeriods();
    // El universo siempre incluye todas las tiendas que estuvieron vigentes en
    // algún momento del año, incluso si una cerró durante ese ejercicio.
    const candidates = d.stores
      .filter(store => store.isStore && this.storeAllowedByAccess(store))
      .filter(store => this.storeOverlapsPeriod(store, selectedYear * 100 + 1, selectedYear * 100 + 12));
    const candidateIds = new Set(candidates.map(store => store.storeId));
    const factRows = this.dateRangeActive()
      ? this.dailyRowsInRange(candidateIds, true)
      : this.currentDimensionFilter(this.indexedRows(this.currentDimensionIndex(), periods, candidateIds));
    const groups = grouped(factRows, row => row.storeId);
    // El resumen de rotación por tienda ya viene en dashboard.json. Usarlo aquí
    // evita depender del detalle pesado de productos, que se carga recién en Inventario.
    const predictive = new Map((d.predictiveStore || []).map(row => [row.storeId, row]));
    const stockYear = Number(d.metadata.stockCutoff.slice(0, 4));
    const metrics = candidates.map(store => {
      const rows = groups.get(store.storeId) || [];
      const net = sum(rows, 'net');
      const transactions = sum(rows, 'transactions');
      const ticket = transactions > 0 ? net / transactions : 0;
      const predictiveRow = predictive.get(store.storeId);
      const rotation = selectedYear === stockYear && predictiveRow
        ? (predictiveRow.rotation ?? (predictiveRow.stockValue > 0 ? predictiveRow.sales30 / predictiveRow.stockValue : null))
        : null;
      const sellingAreaM2 = Math.max(0, Number(store.areaM2) || 0) * .8;
      const saleM2 = sellingAreaM2 > 0 ? net / sellingAreaM2 : 0;
      const label = `${store.alias || store.store}${store.closingDate?.startsWith(`${selectedYear}-`) ? ' · CERRADA' : ''}`;
      return { store, label, net, saleM2, ticket, rotation };
    });
    const metricValue = (row: (typeof metrics)[number], metric: RankingMetric): number | null => {
      if (metric === 'ROTATION') return row.rotation;
      if (metric === 'NET') return row.net;
      if (metric === 'TICKET') return row.ticket;
      return row.saleM2;
    };
    const metricLabel: Record<RankingMetric, string> = {
      ROTATION: 'Rotación', NET: 'Venta neta', TICKET: 'Ticket prom.', SALE_M2: 'Venta × m²'
    };
    const metricRanks = new Map<RankingMetric, Map<number, number>>(
      selectedMetrics.map(metric => [metric, denseRanks(metrics.map(row => metricValue(row, metric)), true)])
    );
    const scored = metrics.map(row => {
      const details = selectedMetrics.map(metric => {
        const value = metricValue(row, metric);
        const rankMap = metricRanks.get(metric)!;
        const rank = value == null ? null : rankMap.get(value) ?? null;
        // Los puntos son la posición conseguida en cada top. Si una tienda no
        // tiene dato para una métrica, recibe la última posición disponible.
        const points = rank ?? metrics.length;
        return { metric, value, rank, points };
      });
      const score = details.reduce((total, detail) => total + detail.points, 0);
      return { ...row, details, score };
    });
    const rows = scored.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label, 'es'));
    const positionScaleMax = Math.max(1, rows.length);
    const singleMetric = selectedMetrics.length === 1 ? selectedMetrics[0] : null;
    const totalNet = metrics.reduce((total, row) => total + Math.max(0, row.net), 0);
    const formatMetric = (metric: RankingMetric, value: number | null): string => {
      if (value == null) return 'N/A';
      if (metric === 'ROTATION') return this.percent(value);
      if (metric === 'NET') return totalNet > 0 ? this.percent(value / totalNet) : 'N/A';
      return this.money(value);
    };
    if (!rows.length) return {
      animation: false,
      graphic: [{ type: 'text', left: 'center', top: 'middle', style: { text: 'N/A PARA LOS FILTROS SELECCIONADOS', fill: '#64748B', fontSize: 11, fontWeight: 800 } }]
    } as EChartsOption;
    return {
      animation: false,
      tooltip: { trigger: 'item', confine: true, borderColor: C.gold, padding: [6, 8], textStyle: { fontSize: 10 }, position: this.tooltipToRight, extraCssText: 'max-width:none;white-space:nowrap;', formatter: (params: any) => {
        const row = rows[params.dataIndex ?? 0];
        return `<div class="chart-tooltip" style="min-width:185px;max-width:none;white-space:nowrap"><strong>${safe(row.label)}</strong>${row.details.map(detail =>
          `<div style="display:flex;justify-content:space-between;gap:16px;white-space:nowrap"><span>${safe(metricLabel[detail.metric])} #${detail.points}</span><b style="max-width:none;overflow-wrap:normal;white-space:nowrap">${safe(formatMetric(detail.metric, detail.value))}</b></div>`
        ).join('')}</div>`;
      } },
      grid: { left: 48, right: 18, top: 25, bottom: 78 },
      xAxis: { type: 'category', data: rows.map(row => row.label), axisTick: { show: false }, axisLine: { lineStyle: { color: '#CBD5E1' } }, axisLabel: { interval: 0, rotate: 90, align: 'right', verticalAlign: 'middle', margin: 42, fontWeight: 800, color: '#475569', fontSize: 7, width: 62, overflow: 'truncate', lineHeight: 8 } },
      yAxis: { type: 'value', min: 0, max: positionScaleMax + 1, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      series: [{ type: 'bar', data: rows.map((_, index) => positionScaleMax - index), barMaxWidth: 25, barCategoryGap: '22%', itemStyle: { color: singleMetric === 'ROTATION' ? C.green : singleMetric === 'NET' ? C.teal : singleMetric === 'TICKET' ? C.purple : singleMetric === 'SALE_M2' ? C.blue : C.gold, borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', formatter: (params: any) => String(Math.round(rows[params.dataIndex]?.score || 0)), color: '#172033', fontSize: 8, fontWeight: 900, backgroundColor: 'rgba(255,255,255,.92)', padding: [1, 3], borderRadius: 3 } }]
    } as EChartsOption;
  });

  readonly hourlyCommercialRows = computed<{ hour: number; transactions: number; net: number; ticket: number | null }[]>(() => {
    const d = this.data(); if (!d) return [];
    const ids = this.filteredStoreIds();
    const selectedPeriods = new Set(this.selectedPeriods());
    const rows = this.dateRangeActive()
      ? this.dailyHourlySalesRows.filter(row => !!row.date && row.date >= this.fromDate() && row.date <= (this.toDate() || this.fromDate()) && ids.has(row.storeId))
      : (d.monthlyHourlySales || []).filter(row => selectedPeriods.has(row.periodId) && ids.has(row.storeId));
    const byHour = new Map<number, { transactions: number; net: number }>();
    for (const row of rows) {
      const current = byHour.get(row.hour) || { transactions: 0, net: 0 };
      current.transactions += Number(row.transactions) || 0;
      current.net += Number(row.net) || 0;
      byHour.set(row.hour, current);
    }
    return Array.from({ length: 16 }, (_, index) => {
      const hour = index + 8;
      const values = byHour.get(hour) || { transactions: 0, net: 0 };
      return { hour, ...values, ticket: values.transactions > 0 ? values.net / values.transactions : null };
    });
  });

  readonly hourlyPerformanceOption = computed<EChartsOption>(() => {
    const hours = this.hourlyCommercialRows();
    const peakTickets = Math.max(0, ...hours.map(row => row.transactions));
    const totalTickets = hours.reduce((total, row) => total + row.transactions, 0);
    const totalNet = hours.reduce((total, row) => total + row.net, 0);
    return {
      animation: false,
      color: [C.navy, C.teal],
      legend: { top: 0, right: 18, selectedMode: false, itemGap: 16, itemWidth: 13, itemHeight: 7, textStyle: { color: '#475569', fontSize: 8, fontWeight: 700 }, data: ['Tickets', 'Venta neta'] },
      tooltip: { trigger: 'item', confine: true, position: this.tooltipToRight, formatter: (params: any) => {
        const row = hours[params.dataIndex ?? 0]; return this.tooltip(`${String(row?.hour ?? 0).padStart(2, '0')}:00`, [
          { label: 'Tickets', value: this.number(row?.transactions ?? null) },
          { label: 'Participación tickets', value: totalTickets ? this.percent((row?.transactions || 0) / totalTickets) : 'N/A' },
          { label: 'Venta neta', value: this.money(row?.net ?? null, true) },
          { label: 'Participación venta', value: totalNet ? this.percent((row?.net || 0) / totalNet) : 'N/A' },
          { label: 'Ticket promedio', value: this.money(row?.ticket ?? null) }
        ]);
      } },
      grid: { left: 50, right: 58, top: 30, bottom: 36 },
      xAxis: { type: 'category', triggerEvent: false, axisPointer: { show: false }, data: hours.map(row => `${String(row.hour).padStart(2, '0')}:00`), axisTick: { show: false }, axisLabel: { color: '#64748B', fontSize: 8, interval: 0 } },
      yAxis: [
        { type: 'value', min: 0, axisLabel: { color: '#64748B', fontSize: 8, formatter: (value: number) => this.short(value) }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
        { type: 'value', min: 0, axisLabel: { color: '#64748B', fontSize: 8, formatter: (value: number) => `S/ ${this.short(value)}` }, splitLine: { show: false } }
      ],
      series: [
        { name: 'Tickets', type: 'bar', yAxisIndex: 0, data: hours.map(row => ({ value: row.transactions, itemStyle: { color: row.transactions === peakTickets && peakTickets > 0 ? C.gold : C.navy, borderRadius: [4, 4, 0, 0] } })), barMaxWidth: 24,
          label: { show: true, position: 'top', color: '#334155', fontSize: 7, fontWeight: 800, formatter: (params: any) => Number(params.value) > 0 ? this.short(Number(params.value)) : '' } },
        { name: 'Venta neta', type: 'line', silent: true, tooltip: { show: false }, emphasis: { disabled: true }, yAxisIndex: 1, data: hours.map(row => row.net), smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { color: C.teal, width: 2.5 }, itemStyle: { color: C.teal }, z: 6 }
      ]
    } as EChartsOption;
  });

  readonly inventoryAreaSummary = computed(() => {
    const ids = this.filteredStoreIds();
    const rows = (this.data()?.predictiveCategory || []).filter(row => ids.has(row.storeId) && this.categoryMatches(row.category));
    const groups = grouped(rows, row => this.areaHead(row.category));
    const totalValue = rows.reduce((total, row) => total + (Number(row.stockValue) || 0), 0);
    const colors: Record<string, string> = { TEXTIL: C.navy, CALZADO: C.red, HOGAR: C.gold, ELECTRO: C.blue, TECNOLOGIA: C.teal, 'PERFUMERÍA Y JOYERÍA': C.purple, 'FERRETERÍA Y AUTOMOTRIZ': C.orange, 'PRODUCTOS VARIOS': C.slate };
    return [...groups.entries()].map(([area, areaRows]) => {
      const value = areaRows.reduce((total, row) => total + (Number(row.stockValue) || 0), 0);
      return { area: area === 'TECNOLOGIA' ? 'TECNOLOGÍA' : area, value, units: areaRows.reduce((total, row) => total + (Number(row.stockUnits) || 0), 0), share: totalValue ? value / totalValue : 0, color: colors[area] || C.slate };
    }).filter(row => row.value > 0).sort((a, b) => b.value - a.value);
  });

  readonly inventoryOverviewOption = computed<EChartsOption>(() => {
    const rows = this.inventoryAreaSummary();
    const totals = this.stockTotals();
    const occupied = Math.min(totals.units, totals.capacity);
    const free = Math.max(0, totals.capacity - totals.units);
    const overflow = Math.max(0, totals.units - totals.capacity);
    return {
      animation: false,
      color: rows.map(row => row.color),
      tooltip: { trigger: 'item', confine: true, position: this.tooltipToRight, formatter: (params: any) => {
        if (params.seriesIndex === 1) return this.tooltip('CAPACIDAD FÍSICA', [
          { label: 'Capacidad total', value: this.number(totals.capacity, ' und') },
          { label: 'Stock físico', value: this.number(totals.units, ' und') },
          { label: 'Espacio disponible', value: this.number(free, ' und') },
          { label: 'Sobrecapacidad', value: this.number(overflow, ' und') },
          { label: 'Ocupación', value: this.percent(totals.capacity ? totals.units / totals.capacity : null) }
        ]);
        const row = rows[params.dataIndex ?? 0]; return this.tooltip(row?.area || '', [
          { label: 'Valor de stock', value: this.money(row?.value ?? null, true) },
          { label: 'Participación', value: this.percent(row?.share ?? null) },
          { label: 'Unidades', value: this.number(row?.units ?? null, ' und') }
        ]);
      } },
      legend: { show: false },
      series: [{ name: 'Valor por área', type: 'pie', radius: ['54%', '82%'], center: ['50%', '52%'], avoidLabelOverlap: true,
        labelLine: { show: false }, label: { show: false },
        data: rows.map(row => ({ name: row.area, value: row.value, itemStyle: { color: row.color } })) },
        { name: 'Capacidad física', type: 'pie', radius: ['30%', '46%'], center: ['50%', '52%'], startAngle: 90, label: { show: false }, labelLine: { show: false }, data: [
          { name: 'Stock ocupado', value: occupied, itemStyle: { color: overflow > 0 ? C.red : C.teal } },
          { name: 'Capacidad libre', value: free, itemStyle: { color: '#D8E0EC' } }
        ] }]
    } as EChartsOption;
  });
  readonly categoryOption = computed<EChartsOption>(() => {
    // PARTICIPACIÓN RUBRO tiene un contexto deliberadamente distinto al resto:
    // RESPONDE a Año, Mes, Clúster, Formato y Tienda.
    // IGNORA por completo Rubro, Línea y Sublínea para conservar siempre la
    // composición total de rubros del contexto comercial seleccionado.
    //
    // Importante: usar SIEMPRE monthlyCategoryIndex. No seleccionar el índice de
    // línea/sublínea ni llamar categoryMatches/lineMatches/sublineMatches aquí;
    // de esa forma Angular tampoco registra esas señales como dependencias del
    // computed y el donut no se recalcula al tocar esos tres filtros.
    const rows = this.categorySummary(); const total = rows.reduce((value, row) => value + row.net, 0);
    return {
      animation: false, color: rows.map(row => row.color),
      tooltip: { trigger: 'item', confine: true, position: this.tooltipToRight, formatter: (params: any) => {
        const row = rows[params.dataIndex]; return this.tooltip(row?.name || '', [
          { label: 'Venta neta', value: this.money(row?.net ?? null, true) }, { label: 'Participación', value: this.percent(row?.share ?? null) },
          { label: 'Unidades', value: this.number(row?.units ?? null) }, { label: this.categoryView() === 'LINEA' ? 'Rubro con más venta' : 'Línea con más venta', value: row?.topLine || 'FALTA INFORMACIÓN' }
        ]);
      } },
      series: [{ type: 'pie', radius: ['35%', '56%'], center: ['50%', '51%'], minAngle: 2, avoidLabelOverlap: true,
        labelLine: { show: true, length: 8, length2: 4, lineStyle: { color: '#64748B', width: 1 } },
        labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
        label: { show: true, alignTo: 'edge', edgeDistance: 3, width: 96, overflow: 'break', bleedMargin: 0, color: '#172033', fontSize: 8, fontWeight: 800,
          formatter: (params: any) => `${params.name}\n${total ? Math.round(Number(params.value) / total * 100) : 0}%` },
        data: rows.map((row, index) => ({ name: row.name, value: row.net, itemStyle: { color: row.color }, label: { show: index < 3 }, labelLine: { show: index < 3 } }))
      }]
    } as EChartsOption;
  });
  readonly categorySummary = computed<CategorySummary[]>(() => {
    const ids = this.filteredStoreIds(); const periods = this.selectedPeriods();
    // Usa las filas crudas del contexto temporal: estos dos conjuntos ignoran
    // deliberadamente Rubro, Género, Línea y Sublínea.
    const sourceRows = this.dateRangeActive() ? this.dailyRowsInRange(ids, false) : this.indexedRows(this.monthlyCategoryIndex, periods, ids);
    const lineRows = this.dateRangeActive() ? this.dailyRowsInRange(ids, false) : this.indexedRows(this.monthlyLineIndex, periods, ids);
    const viewingCategories = this.categoryView() === 'LINEA';
    // CATEGORÍA representa las áreas comerciales homologadas (Textil, Calzado,
    // Hogar, Electro, etc.), evitando duplicados y variaciones de escritura.
    const categoryRows = viewingCategories
      ? lineRows.map(row => ({ ...row, category: this.areaHead(row.category) }))
      : sourceRows;
    const groups = grouped(categoryRows, row => row.category || 'SIN RUBRO');
    const total = sum(categoryRows, 'net');
    return [...groups.entries()].map(([name, groupedRows]) => {
      const relatedRows = viewingCategories
        ? lineRows.filter(row => this.areaHead(row.category) === name)
        : lineRows.filter(row => (row.category || 'SIN RUBRO') === name);
      const hierarchy = grouped(relatedRows, row => row.line || 'SIN LÍNEA');
      const topLine = [...hierarchy.entries()]
        .map(([line, rows]) => ({ line, net: sum(rows, 'net') }))
        .sort((a, b) => b.net - a.net)[0]?.line || 'FALTA INFORMACIÓN';
      const net = sum(groupedRows, 'net');
      return { name, net, units: sum(groupedRows, 'units'), share: total ? net / total : 0, topLine, color: '' };
    }).sort((a, b) => b.net - a.net).map((row, index) => ({ ...row, color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }));
  });
  private areaHead(value?: string): string {
    const name = this.normalized(value);
    if (name === 'TEXTIL' || ['MOCHILA', 'MALETA', 'MALETIN', 'CARTERA'].some(item => name.includes(item))) return 'TEXTIL';
    if (name === 'CALZADO' || name.includes('ACCESORIO DEPORTE') || name.includes('ACCESORIOS DE DEPORTE')) return 'CALZADO';
    if (['HOGAR', 'DEPORTE', 'MUEBLES', 'BANO Y LAVANDERIA', 'RECREACION', 'JUGUETES', 'CAMPING', 'ALIMENTOS Y BEBIDAS', 'TEMPORADA'].some(item => name.includes(item))) return 'HOGAR';
    if (['ELECTRO', 'LINEA BLANCA', 'AUDIO Y VIDEO', 'COMPUTO', 'ELECTRO MENOR'].some(item => name.includes(item))) return 'ELECTRO';
    if (name.includes('TECNOLOGIA')) return 'TECNOLOGIA';
    if (name.includes('PERFUMERIA') || name.includes('JOYERIA') || name.includes('JOYAS') || name.includes('BELLEZA')) return 'PERFUMERÍA Y JOYERÍA';
    if (name.includes('FERRETERIA') || name.includes('AUTOMOTRIZ')) return 'FERRETERÍA Y AUTOMOTRIZ';
    return 'PRODUCTOS VARIOS';
  }
  readonly brandOption = computed<EChartsOption>(() => {
    const values = this.brandSummary();
    const visible = Math.min(10, values.length);
    const endValue = Math.max(0, visible - 1);
    const axisScale = adaptiveValueScale(values.map(v => v.net));
    return {
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, backgroundColor: '#FFFFFF', borderColor: C.purple, borderWidth: 1, padding: [5, 7], textStyle: { color: '#111827', fontSize: 9 }, position: this.tooltipToRight, extraCssText: 'max-width:180px;', formatter: (params: any[]) => {
        const index = params[0]?.dataIndex ?? 0; const v = values[index];
        return this.tooltip(v.name, [
          { label: 'Venta neta', value: this.money(v.net, true) },
          { label: 'Participación', value: this.percent(v.share) },
          { label: 'Unidades', value: this.number(v.units) }
        ]);
      } },
      grid: { left: 48, right: 18, top: 14, bottom: 112 },
      dataZoom: values.length > visible ? [
        { type: 'inside', startValue: 0, endValue, zoomLock: true, zoomOnMouseWheel: false, moveOnMouseWheel: true, moveOnMouseMove: true },
        { type: 'slider', startValue: 0, endValue, height: 18, bottom: 3, showDetail: false, brushSelect: false,
          backgroundColor: '#D8E0EC', fillerColor: 'rgba(18,58,140,.38)', borderColor: '#9AABC2', handleSize: '115%', handleStyle: { color: '#123A8C', borderColor: '#0C2D70', borderWidth: 1 }, moveHandleStyle: { color: '#123A8C' } }
      ] : [],
      xAxis: { type: 'category', data: values.map(v => v.name), axisTick: { show: false }, axisLine: { lineStyle: { color: '#CBD5E1' } },
        axisLabel: { interval: 0, rotate: 90, align: 'center', verticalAlign: 'middle', margin: 42, hideOverlap: false, fontSize: 9, color: '#475569' } },
      yAxis: { type: 'value', min: 0, ...axisScale, axisLabel: { color: '#64748B', formatter: (v: number) => v === 0 ? 'S/ 0' : `S/ ${this.short(v)}` }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      series: [{ type: 'bar', data: values.map(v => ({ value: v.net, itemStyle: { color: C.purple, borderRadius: [5, 5, 0, 0] } })), barMaxWidth: 28, z: 5,
        label: { show: true, position: 'top', formatter: (params: any) => this.percent(values[params.dataIndex]?.share ?? null), color: '#172033', fontSize: 10, fontWeight: 700, distance: 5, backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderWidth: 1, padding: [2, 4], borderRadius: 3 }, labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' } }]
    } as EChartsOption;
  });
  readonly brandSummary = computed<BrandSummary[]>(() => {
    const ids = this.filteredStoreIds(); const periods = this.selectedPeriods();
    const rows = (this.dateRangeActive() ? this.dailyRowsForSelection(ids) : this.indexedRows(this.monthlyBrandIndex, periods, ids)).filter(row =>
      this.categoryMatches(row.category) && this.lineMatches(row.line) && this.sublineMatches(row.subline));
    const total = sum(rows, 'net'); const groups = grouped(rows, row => row.brand || 'N/A');
    return [...groups.entries()].map(([name, groupedRows]) => {
      const categories = [...grouped(groupedRows, row => row.category || 'N/A').entries()]
        .map(([category, categoryRows]) => ({ category, net: sum(categoryRows, 'net') }))
        .sort((a, b) => b.net - a.net);
      const net = sum(groupedRows, 'net');
      return { name, net, units: sum(groupedRows, 'units'), share: total ? net / total : 0, category: categories[0]?.category || 'FALTA INFORMACIÓN' };
    }).sort((a, b) => b.net - a.net);
  });
  private genderFromLine(line?: string): string | null {
    const value = this.normalized(line || '');
    if (value.endsWith('BEBE')) return 'BEBE';
    if (value.endsWith('JOVENCITA')) return 'JOVENCITA';
    if (value.endsWith('JOVENCITO')) return 'JOVENCITO';
    if (value.endsWith('CABALLERO')) return 'CABALLERO';
    if (value.endsWith('DAMA')) return 'DAMA';
    if (value.endsWith('NINA')) return 'NIÑA';
    if (value.endsWith('NINO')) return 'NIÑO';
    if (value.endsWith('UNISEX')) return 'UNISEX';
    return null;
  }
  readonly genderSummary = computed<GenderSummary[]>(() => {
    // Contexto exclusivo: Año, Mes, Clúster, Formato y Tienda. No lee los
    // filtros globales Rubro/Línea/Sublínea; TEXTIL/CALZADO se manejan localmente.
    const ids = this.filteredStoreIds(); const periods = this.selectedPeriods(); const rubros = new Set(this.genderRubros());
    const rows = (this.dateRangeActive() ? this.dailyRowsForSelection(ids) : this.indexedRows(this.monthlyLineIndex, periods, ids)).filter(row => rubros.has(row.category || ''));
    const mapped = rows.map(row => ({ row, gender: this.genderFromLine(row.line) })).filter(item => item.gender != null);
    const groups = grouped(mapped, item => item.gender!); const total = mapped.reduce((value, item) => value + (item.row.net || 0), 0);
    return GENDER_ORDER.map(name => {
      const items = groups.get(name) || []; const genderRows = items.map(item => item.row); const net = sum(genderRows, 'net'); const units = sum(genderRows, 'units');
      const lineGroups = grouped(genderRows, row => row.line || 'FALTA INFORMACIÓN');
      const topLine = [...lineGroups.entries()].map(([line, lineRows]) => ({ line, net: sum(lineRows, 'net') })).sort((a, b) => b.net - a.net)[0]?.line || 'FALTA INFORMACIÓN';
      return { name, net, units, share: total ? net / total : 0, averagePrice: units ? net / units : null, topLine, color: GENDER_COLORS[name] };
    }).filter(row => row.net !== 0 || row.units !== 0).sort((a, b) => b.net - a.net);
  });
  readonly genderOption = computed<EChartsOption>(() => {
    const rows = this.genderSummary(); const total = rows.reduce((value, row) => value + row.net, 0);
    const expanded = this.expandedChart() === 'gender';
    return {
      animation: false, color: rows.map(row => row.color),
      tooltip: { trigger: 'item', confine: true, padding: [6, 8], textStyle: { fontSize: 10 }, position: this.tooltipToRight, formatter: (params: any) => { const row = rows[params.dataIndex]; return this.tooltip(row?.name || '', [
        { label: 'Venta neta', value: this.money(row?.net ?? null, true) }, { label: 'Participación', value: this.percent(row?.share ?? null) },
        { label: 'Unidades', value: this.number(row?.units ?? null) }, { label: 'Precio promedio', value: this.money(row?.averagePrice ?? null) },
        { label: 'Línea con más venta', value: row?.topLine || 'FALTA INFORMACIÓN' }
      ]); } },
      series: [{ type: 'pie', radius: ['33%', '55%'], center: ['50%', '47%'], minAngle: 2, avoidLabelOverlap: true,
        emphasis: { scale: true, scaleSize: 7 },
        labelLine: { show: true, length: expanded ? 13 : 9, length2: expanded ? 10 : 6, minTurnAngle: 45, maxSurfaceAngle: 80, lineStyle: { color: '#64748B', width: 1.2 } },
        labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
        label: { show: true, alignTo: 'labelLine', distanceToLabelLine: 2, width: expanded ? 75 : 60, overflow: 'breakAll', bleedMargin: 1, color: '#334155', fontSize: expanded ? 9 : 8, fontWeight: 800, formatter: (params: any) => expanded ? params.name : `${params.name}\n${total ? Math.round(Number(params.value) / total * 100) : 0}%` },
        data: rows.map((row, index) => ({
          name: row.name, value: row.net, itemStyle: { color: row.color },
          label: { show: expanded || index < 3 }, labelLine: { show: expanded || index < 3 }
        })) }]
    } as EChartsOption;
  });
  readonly genderBarOption = computed<EChartsOption>(() => {
    const rows = this.genderSummary(); const max = Math.max(1, ...rows.map(row => row.net));
    return {
      animation: false, grid: { left: 92, right: 70, top: 28, bottom: 34 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, padding: [6, 8], textStyle: { fontSize: 10 }, position: this.tooltipToRight, formatter: (params: any[]) => { const row = rows[params[0]?.dataIndex ?? 0]; return this.tooltip(row?.name || '', [
        { label: 'Venta neta', value: this.money(row?.net ?? null, true) }, { label: 'Participación', value: this.percent(row?.share ?? null) },
        { label: 'Unidades', value: this.number(row?.units ?? null) }, { label: 'Precio promedio', value: this.money(row?.averagePrice ?? null) },
        { label: 'Línea con más venta', value: row?.topLine || 'FALTA INFORMACIÓN' }
      ]); } },
      xAxis: { type: 'value', max: max * 1.18, axisLabel: { color: '#64748B', formatter: (value: number) => `S/ ${this.short(value)}` }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      yAxis: { type: 'category', inverse: true, data: rows.map(row => row.name), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#334155', fontSize: 10, fontWeight: 800 } },
      series: [{ type: 'bar', data: rows.map(row => ({ value: row.net, itemStyle: { color: row.color, borderRadius: [0, 5, 5, 0] } })), barMaxWidth: 25,
        label: { show: true, position: 'right', color: '#172033', fontSize: 10, fontWeight: 800, formatter: (params: any) => this.percent(rows[params.dataIndex]?.share ?? null) } }]
    } as EChartsOption;
  });
  readonly priceRangeSummary = computed(() => {
    this.priceRangeData();
    const ids = this.filteredStoreIds(); const periods = this.selectedPeriods();
    const rows = (this.dateRangeActive() ? this.dailyRowsForSelection(ids) : this.indexedRows(this.monthlyPriceRangeIndex, periods, ids)).filter(row =>
      Number(row.bandOrder) > 0 && this.categoryMatches(row.category) && this.lineMatches(row.line) && this.sublineMatches(row.subline));
    const groups = grouped(rows, row => String(row.bandOrder));
    const bands = [
      'S/ 0–30', 'S/ 31–60', 'S/ 61–90', 'S/ 91–120', 'S/ 121–150', 'S/ 151–180',
      'S/ 181–210', 'S/ 211–240', 'S/ 241–270', 'S/ 271–300', 'S/ 301+'
    ];
    const values = bands.map((label, index) => {
      const groupedRows = groups.get(String(index + 1)) || [];
      return { label, net: sum(groupedRows, 'net'), units: sum(groupedRows, 'units') };
    });
    const total = values.reduce((sumValue, value) => sumValue + value.net, 0);
    return values.map(value => ({ ...value, share: total ? value.net / total : null, averagePrice: value.units ? value.net / value.units : null }));
  });
  readonly priceRangeOption = computed<EChartsOption>(() => {
    const values = this.priceRangeSummary();
    const bands = values.map(value => value.label);
    const total = values.reduce((sumValue, value) => sumValue + value.net, 0);
    const priceScale = adaptiveValueScale(values.map(value => value.net), 3);
    return {
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, position: this.tooltipToRight, padding: [6, 8], textStyle: { fontSize: 10 }, formatter: (params: any[]) => {
        const index = params[0]?.dataIndex ?? 0; const row = values[index];
        return this.tooltip(row.label, [
          { label: 'Venta', value: this.money(row.net, true) },
          { label: 'Unidades vendidas', value: this.number(row.units, ' und') },
          { label: 'Precio unitario', value: row.label }
        ]);
      } },
      legend: { data: ['VALOR', 'UNIDADES'], top: 0, right: 3, textStyle: { fontSize: 9, fontWeight: 800 } },
      grid: { left: 58, right: 54, top: 42, bottom: 82 },
      xAxis: { type: 'category', data: bands, axisTick: { show: false }, axisLabel: { interval: 0, rotate: 90, margin: 38, fontSize: 8, color: '#475569' }, axisLine: { lineStyle: { color: '#CBD5E1' } } },
      yAxis: [
        { type: 'value', min: 0, ...priceScale, axisLabel: { formatter: (value: number) => `S/ ${this.short(value)}`, color: '#64748B', fontSize: 9 }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
        { type: 'value', min: 0, splitNumber: 3, axisLabel: { formatter: (value: number) => this.short(value), color: '#B4127A', fontSize: 9 }, splitLine: { show: false } }
      ],
      series: [
        { name: 'VALOR', type: 'bar', data: values.map(row => row.net), barMaxWidth: 28, z: 5, itemStyle: { color: '#DCCAF3', borderColor: '#B99ADF', borderWidth: 1, borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: 'top', formatter: (params: any) => this.percent(total ? Number(params.value) / total : null), color: '#172033', fontSize: 10, fontWeight: 700, distance: 5, backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderWidth: 1, padding: [2, 4], borderRadius: 3 }, labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' } },
        { name: 'UNIDADES', type: 'line', yAxisIndex: 1, data: values.map(row => row.units), symbol: 'circle', symbolSize: 7, z: 20,
          lineStyle: { width: 3, color: C.purple }, itemStyle: { color: C.purple, borderColor: '#FFFFFF', borderWidth: 1 } }
      ]
    } as EChartsOption;
  });
  readonly antiquityOption = computed<EChartsOption>(() => {
    const groups = grouped(this.selectedStockOrigins(), r => String(r.originPeriodId));
    const total = sum(this.stockOrigins(), 'units');
    const rows = [...groups.entries()]
      .map(([p, rs]) => ({ period: Number(p), units: sum(rs, 'units'), value: sum(rs, 'value') }))
      .filter(row => row.period > 0 && row.units !== 0)
      // Regla visual: desde el origen MÁS RECIENTE del stock vigente hacia el MÁS ANTIGUO.
      .sort((a, b) => b.period - a.period);
    const visible = Math.min(12, rows.length);
    const endValue = Math.max(0, visible - 1);
    return {
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, borderColor: C.indigo, padding: [5, 7], textStyle: { fontSize: 9 }, position: this.tooltipToRight, formatter: (params: any[]) => { const index = params[0]?.dataIndex ?? 0; const row = rows[index]; return this.tooltip(this.periodLabel(row.period), [
        { label: 'Unidades', value: this.number(row.units, ' und') },
        { label: 'Valor sugerido', value: this.money(row.value, true) },
        { label: 'Participación', value: total ? this.percent(row.units / total) : 'FALTA INFORMACIÓN' }
      ]); } },
      grid: { left: 48, right: 18, top: 28, bottom: 112 },
      dataZoom: rows.length > visible ? [
        { type: 'inside', startValue: 0, endValue, zoomLock: true, zoomOnMouseWheel: false, moveOnMouseWheel: true, moveOnMouseMove: true },
        { type: 'slider', startValue: 0, endValue, height: 14, bottom: 5, showDetail: false, brushSelect: false }
      ] : [],
      xAxis: {
        type: 'category',
        data: rows.map(row => this.periodLabel(row.period).toUpperCase()),
        axisTick: { show: false },
        axisLabel: { interval: 0, rotate: 90, align: 'center', verticalAlign: 'middle', margin: 44, hideOverlap: false, fontSize: 9, color: '#475569' },
        axisLine: { lineStyle: { color: '#CBD5E1' } }
      },
      yAxis: { type: 'value', axisLabel: { formatter: (value: number) => this.short(value), color: '#64748B' }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      series: [{ type: 'bar', data: rows.map(row => row.units), barMaxWidth: 28, itemStyle: { color: C.indigo, borderRadius: [5, 5, 0, 0] }, label: { show: true, position: 'top', formatter: (params: any) => this.short(Number(params.value)), color: '#172033', fontSize: 10, fontWeight: 900, backgroundColor: 'rgba(255,255,255,.92)', padding: [1, 3], borderRadius: 3 } }]
    } as EChartsOption;
  });
  readonly agedStockByStore = computed(() => {
    const stores = this.inventoryStoresIgnoringStoreFilter(); const ids = new Set(stores.map(store => store.storeId));
    const cutoff = new Date(`${this.data()?.metadata.stockCutoff || '2026-01-01'}T00:00:00Z`); cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
    const oldPeriod = cutoff.getUTCFullYear() * 100 + cutoff.getUTCMonth() + 1;
    const rows = this.stockOriginData().filter(row => ids.has(row.storeId) && this.categoryMatches(row.category) && this.lineMatches(row.line) && this.sublineMatches(row.subline));
    const groups = grouped(rows, row => row.storeId);
    return stores.map(store => {
      const storeRows = groups.get(store.storeId) || []; const total = sum(storeRows, 'units'); const old = sum(storeRows.filter(row => row.originPeriodId <= oldPeriod), 'units');
      return { label: store.alias || store.store, total, old, share: total ? old / total : 0 };
    }).sort((a, b) => b.share - a.share);
  });
  readonly rotationOption = computed<EChartsOption>(() => {
    const storeMap = new Map(this.inventoryStoresIgnoringStoreFilter().map(store => [store.storeId, store.alias || store.store]));
    const groups = grouped(this.inventoryProductsIgnoringStoreFilter(), row => row.storeId);
    const rows = [...storeMap.entries()].map(([storeId, label]) => {
      const products = groups.get(storeId) || [];
      const sales = sum(products, 'sales30'); const value = sum(products, 'stockValue');
      const units = sum(products, 'stockUnits'); const sold = sum(products, 'units30');
      return { label, sales, value, units, sold, rotation: units > 0 ? sold / units : 0 };
    }).sort((a, b) => b.rotation - a.rotation);
    const visible = Math.min(7, rows.length); const rotationScale = adaptiveValueScale(rows.map(row => row.rotation));
    return {
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, position: this.tooltipToRight, padding: [6, 8], formatter: (params: any[]) => {
        const index = params[0]?.dataIndex ?? 0; const row = rows[index];
        return this.tooltip(row.label, [
          { label: 'Rotación 30D', value: this.percent(row.rotation) },
          { label: 'Venta 30D', value: this.money(row.sales, true) },
          { label: 'Valor stock', value: this.money(row.value, true) },
          { label: 'Stock físico', value: this.number(row.units, ' und') },
          { label: 'Vendidas 30D', value: this.number(row.sold, ' und') }
        ]);
      } },
      grid: { left: 48, right: 78, top: 8, bottom: 24 },
      dataZoom: rows.length > visible ? [
        { type: 'inside', yAxisIndex: 0, startValue: 0, endValue: visible - 1, zoomLock: true, moveOnMouseWheel: true },
        { type: 'slider', yAxisIndex: 0, orient: 'vertical', right: 3, top: 8, bottom: 8, width: 18, startValue: 0, endValue: visible - 1, showDetail: false, brushSelect: false,
          backgroundColor: '#D8E0EC', fillerColor: 'rgba(22,163,74,.25)', borderColor: '#9AABC2', handleSize: '125%', handleStyle: { color: C.green, borderColor: '#15803D' } }
      ] : [],
      xAxis: { type: 'value', min: 0, ...rotationScale, axisLabel: { formatter: (value: number) => this.percent(value), color: '#64748B' }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      yAxis: { type: 'category', inverse: true, data: rows.map(row => row.label), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { interval: 0, align: 'left', margin: 41, width: 38, overflow: 'truncate', color: '#475569', fontSize: 9, fontWeight: 800 } },
      series: [{ type: 'bar', data: rows.map(row => row.rotation), barMaxWidth: 18, barCategoryGap: '24%', itemStyle: { color: C.green, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', formatter: (params: any) => this.percent(Number(params.value)), color: '#172033', fontSize: 10, fontWeight: 700, backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderWidth: 1, padding: [2, 4], borderRadius: 3 } }]
    } as EChartsOption;
  });
  readonly coverageOption = computed<EChartsOption>(() => this.barOption(
    this.coverageRows().map(r => r.alias), this.coverageRows().map(r => r.days || 0), true, C.slate,
    this.coverageRows().map(r => [
      { label: 'Estado', value: r.status }, { label: 'Cobertura efectiva', value: r.days == null ? 'FALTA INFORMACIÓN' : this.number(r.days, ' días') },
      { label: 'Stock físico', value: this.number(r.stockUnits, ' und') }, { label: 'Stock vendible (82%)', value: this.number(r.effectiveUnits, ' und') },
      { label: 'Venta 30D', value: this.number(r.units30, ' und') }, { label: 'Valor sugerido', value: this.money(r.stockValue, true) }
    ]), 'días', this.coverageRows().map(r => r.color)
  ));
  readonly storeValueCoverageOption = computed<EChartsOption>(() => {
    const rows = [...this.inventoryMatrixRows()].sort((a, b) => b.stockValue - a.stockValue);
    const valueScale = adaptiveValueScale(rows.map(row => row.stockValue));
    return {
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, position: this.tooltipToRight, formatter: (params: any[]) => {
        const row = rows[params?.[0]?.dataIndex ?? 0];
        return this.tooltip(row?.alias || '', [
          { label: 'Valor inventario', value: this.money(row?.stockValue ?? null, true) },
          { label: 'Cobertura', value: row?.coverageDays == null ? 'SIN VENTA' : this.number(row.coverageDays, ' días') },
          { label: 'Estado', value: row?.status || 'SIN INFORMACIÓN' }
        ]);
      } },
      grid: { left: 38, right: 112, top: 6, bottom: 30 },
      xAxis: { type: 'value', min: 0, ...valueScale, name: 'VALOR INVENTARIO', nameLocation: 'middle', nameGap: 24, nameTextStyle: { color: '#64748B', fontSize: 9, fontWeight: 800 }, axisLabel: { color: '#64748B', formatter: (value: number) => `S/ ${this.short(value)}` }, splitLine: { lineStyle: { color: '#E5E7EB' } }, axisLine: { show: true, lineStyle: { color: '#CBD5E1' } } },
      yAxis: { type: 'category', inverse: true, data: rows.map(row => row.alias), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#334155', fontSize: 9, fontWeight: 850 } },
      series: [{ name: 'VALOR INVENTARIO', type: 'bar', barMaxWidth: 13, barCategoryGap: '24%',
        data: rows.map(row => ({ value: row.stockValue, itemStyle: { color: row.color, borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', distance: 5, color: '#334155', fontSize: 8, fontWeight: 800, formatter: (params: any) => {
          const row = rows[params.dataIndex];
          return `S/ ${this.short(row.stockValue)}`;
        } }
      }]
    } as EChartsOption;
  });
  private inventoryHealth(days: number | null, stockUnits: number): Pick<InventoryMatrixRow, 'status' | 'tone' | 'color'> {
    if (days == null || !Number.isFinite(days)) return stockUnits > 0
      ? { status: 'EXCESO', tone: 'excess', color: C.navy }
      : { status: 'DÉFICIT', tone: 'deficit', color: C.red };
    if (days < 180) return { status: 'DÉFICIT', tone: 'deficit', color: C.red };
    if (days <= 300) return { status: 'ÓPTIMO', tone: 'optimal', color: C.teal };
    return { status: 'EXCESO', tone: 'excess', color: C.navy };
  }
  readonly inventoryMatrixRows = computed<InventoryMatrixRow[]>(() => {
    const targetDays = 240;
    const cutoff = this.data()?.metadata.salesCutoff || '';
    const cutoffYear = Number(cutoff.slice(0, 4)); const cutoffMonth = Number(cutoff.slice(5, 7)); const cutoffDay = Number(cutoff.slice(8, 10));
    const periods = this.selectedPeriods();
    const daysInSelection = [...periods].reduce((total, period) => {
      const year = Math.floor(period / 100); const month = period % 100;
      return total + (year === cutoffYear && month === cutoffMonth ? cutoffDay : new Date(year, month, 0).getDate());
    }, 0);
    const receivedByStore = grouped((this.data()?.monthlyStore || []).filter(row => periods.has(row.periodId)), row => row.storeId);
    const inferredReceivedByStore = new Map((this.data()?.inferredReceivedDaily || [])
      .map(row => [row.storeId, Number(row.daily) || 0] as const));
    return this.coverageRows().map(row => {
      const health = this.inventoryHealth(row.days, row.stockUnits);
      const vendableRate = row.stockUnits > 0 ? Math.max(.01, row.effectiveUnits / row.stockUnits) : 1;
      const targetStock = row.units30 > 0 ? Math.round((row.units30 / 30) * targetDays / vendableRate) : null;
      const gapUnits = targetStock == null ? null : row.stockUnits - targetStock;
      const periodList = [...periods].sort((a, b) => a - b);
      const dailyReceived = periodList.length ? this.dailyReceivedRows.filter(item => item.date >= this.periodStart(periodList[0]) && item.date <= this.periodEnd(periodList.at(-1)!) && item.storeId === row.storeId) : [];
      const received = dailyReceived.length ? dailyReceived.reduce((total, item) => total + item.received, 0) : sum(receivedByStore.get(row.storeId) || [], 'received');
      // FactIngresos es la fuente primaria. Si esa tienda no tiene registros,
      // se concilia reposición entre dos cortes de stock consecutivos y las
      // ventas del intervalo, evitando presentar un cero inventado.
      const directDaily = daysInSelection > 0 ? received / daysInSelection : 0;
      const receivedDaily = directDaily > 0 ? directDaily : (inferredReceivedByStore.get(row.storeId) || 0);
      return { storeId: row.storeId, alias: row.alias, capacity: this.data()?.stores.find(store => store.storeId === row.storeId)?.capacity || 0,
        stockUnits: row.stockUnits, stockValue: row.stockValue, units30: row.units30, dailySales: row.units30 / 30,
        receivedDaily,
        coverageDays: row.days, targetStock, gapUnits, status: health.status, tone: health.tone, color: health.color };
    }).sort((a, b) => a.alias.localeCompare(b.alias));
  });
  readonly inventoryHealthSummary = computed(() => {
    const rows = this.inventoryMatrixRows();
    return [
      { label: 'DÉFICIT <180D', tone: 'deficit', count: rows.filter(row => row.tone === 'deficit').length },
      { label: 'ÓPTIMO 180–300D', tone: 'optimal', count: rows.filter(row => row.tone === 'optimal').length },
      { label: 'EXCESO >300D', tone: 'excess', count: rows.filter(row => row.tone === 'excess').length }
    ];
  });
  readonly ropOption = computed<EChartsOption>(() => {
    const r = this.rop(); const max = Math.max(r.current ?? 0, r.value ?? 0, this.safetyStock() ?? 0) * 1.15 || 100;
    return {
      animation: false, grid: { left: 28, right: 28, top: 25, bottom: 38 }, tooltip: { trigger: 'axis', confine: true, padding: [5, 7], textStyle: { fontSize: 9 }, position: this.tooltipToRight, formatter: () => this.tooltip('Punto de reorden', [
        { label: 'Stock actual', value: this.number(r.current, ' und') }, { label: 'ROP', value: this.number(r.value, ' und') },
        { label: 'Demanda diaria', value: this.number(r.daily, ' und/día') }, { label: 'Días hasta pedir', value: r.daysUntil == null ? 'FALTA INFORMACIÓN' : this.number(r.daysUntil, ' días') }
      ]) },
      xAxis: { type: 'value', max, axisLabel: { formatter: (v: number) => this.short(v) }, splitLine: { lineStyle: { color: '#E5E7EB' } } }, yAxis: { type: 'category', data: ['INVENTARIO'], axisTick: { show: false }, axisLine: { show: false } },
      series: [
        { name: 'Stock actual', type: 'bar', data: [r.current], barWidth: 34, itemStyle: { color: C.teal, borderRadius: 5 }, markLine: r.value == null ? undefined : { silent: true, symbol: 'none', label: { formatter: 'ROP {c} und', color: C.red, fontWeight: 800 }, lineStyle: { color: C.red, width: 3 }, data: [{ xAxis: r.value }] } },
        { name: 'Stock seguridad', type: 'bar', data: [this.safetyStock()], barGap: '-100%', barWidth: 10, itemStyle: { color: C.gold } }
      ]
    } as EChartsOption;
  });

  async ngOnInit(): Promise<void> {
    await this.cloud.initialize();
    if (!this.cloud.hasAccess()) return;
    await this.loadDashboardBase();
  }

  async signIn(): Promise<void> {
    if (this.loginBusy()) return;
    this.loginBusy.set(true);
    this.loadingError.set('');
    try {
      const signedIn = await this.cloud.signIn(this.loginEmail(), this.loginPassword());
      if (!signedIn) return;
      this.loginPassword.set('');
      await this.loadDashboardBase();
    } finally {
      this.loginBusy.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.cloud.signOut();
    this.data.set(null);
    this.sellerPerformanceData.set([]);
    this.sellerDetailLoaded.set(false);
    this.loadingError.set('');
  }

  async retryDashboardLoad(): Promise<void> {
    this.loadingError.set('');
    await this.loadDashboardBase();
  }

  private async loadDashboardBase(): Promise<void> {
    try {
      const loaded = await this.loadDetail<DashboardData>('dashboard.json');
      // T014 conserva su ID histórico, pero su nombre comercial visible es AGU.
      // La normalización aquí también protege archivos JSON antiguos regenerados.
      loaded.stores = (loaded.stores || []).map(store => store.storeId === 'T014' ? { ...store, store: 'AGU', alias: 'AGU' } : store);
      // Índices de las tablas compactas del dashboard base. Así los filtros no recorren
      // decenas de miles de filas completas cada vez que cambia un selector.
      this.monthlyStoreIndex = this.indexPeriodStore(loaded.monthlyStore || []);
      this.dailyTrafficRows = loaded.dailyTraffic || [];
      this.dailyReceivedRows = loaded.dailyReceived || [];
      this.monthlyPersonnelAreaIndex = this.indexPeriodStore(loaded.monthlyPersonnelArea || []);
      this.monthlyCategoryIndex = this.indexPeriodStore(loaded.monthlyCategory || []);
      this.monthlyCategoryTargetIndex = this.indexPeriodStore(loaded.monthlyCategoryTarget || []);
      this.monthlyLineIndex = this.indexPeriodStore(loaded.monthlyLine || []);
      this.monthlySublineIndex = this.indexPeriodStore(loaded.monthlySubline || []);
      this.monthlyBrandIndex = this.indexPeriodStore(loaded.monthlyBrand || []);
      this.sellerPerformanceData.set(loaded.sellerPerformance || []);
      this.sellerDetailLoaded.set((loaded.sellerPerformance || []).length > 0);
      this.data.set(loaded);
      const cutoffYear = Number(loaded.metadata.salesCutoff.slice(0, 4)); this.year.set(loaded.metadata.years.includes(cutoffYear) ? cutoffYear : Math.max(...loaded.metadata.years));
      this.selectedMonths.set([]); this.fromDate.set(''); this.toDate.set(''); this.orderCost.set(loaded.metadata.eoq.orderCost); this.holdingCost.set(loaded.metadata.eoq.annualHoldingCost);
      this.applyAccessScope();
      // Rango de precios vive ahora en la primera página; se carga en segundo plano para
      // no retrasar los KPIs iniciales, pero ya no depende de abrir Inventario.
      setTimeout(() => void this.ensurePriceRangeDetail(), 0);
      // NO cargar dashboard-brand.json (~35 MB) al abrir. Se carga solo si el usuario
      // entra a un nivel jerárquico que realmente necesita Marca por Rubro/Línea/SubLínea.
    } catch (error) { this.loadingError.set(`No se pudieron abrir los datos del dashboard: ${error instanceof Error ? error.message : error}`); }
  }

  private multiLabel(values: string[], allLabel: string, plural: string): string {
    if (!values.length) return allLabel;
    if (values.length <= 2) return values.join(' + ');
    return `${values.length} ${plural}`;
  }
  private normalized(value: unknown): string {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  }
  private matchesSearch(value: unknown, query: string): boolean {
    return !query.trim() || this.normalized(value).includes(this.normalized(query));
  }
  private periodContextLabel(months: number[], year: number): string {
    const ordered = [...months].sort((a, b) => a - b);
    if (!ordered.length) return String(year);
    if (ordered.length === 1) return `${this.monthNamesFull[ordered[0] - 1]} ${year}`;
    if (ordered.length === 2) return `${MONTHS[ordered[0] - 1].toUpperCase()} + ${MONTHS[ordered[1] - 1].toUpperCase()} ${year}`;
    return `${MONTHS[ordered[0] - 1].toUpperCase()}–${MONTHS[ordered.at(-1)! - 1].toUpperCase()} ${year}`;
  }
  onFilterToggle(key: FilterKey, event: Event): void {
    const details = event.currentTarget as HTMLDetailsElement;
    if ((key === 'store' && this.storeFilterLocked()) || (key === 'cluster' && this.clusterFilterLocked())) {
      details.open = false;
      this.openFilter.set(null);
      return;
    }
    if (details.open) this.openFilter.set(key);
    else if (this.openFilter() === key) this.openFilter.set(null);
  }
  setFilterSearch(key: FilterKey, value: string): void {
    this.filterSearch.update(current => ({ ...current, [key]: value }));
  }
  setDateRange(which: 'from' | 'to', value: string): void {
    const cutoff = this.data()?.metadata.salesCutoff || '';
    if (value && value > cutoff) return;
    const nextFrom = which === 'from' ? value : this.fromDate();
    const nextTo = which === 'to' ? value : this.toDate();
    if (nextFrom && nextTo && nextFrom > nextTo) return;
    if (which === 'from') this.fromDate.set(value); else this.toDate.set(value);
  }
  clearDateRange(): void { this.fromDate.set(''); this.toDate.set(''); }
  toggleStockHistoryBucket(value: StockHistoryBucket): void {
    if (value === 'ALL') { this.stockHistoryBucketsSelected.set([]); return; }
    this.stockHistoryBucketsSelected.set(this.toggleValue(this.stockHistoryBucketsSelected(), value).filter(bucket => bucket !== 'ALL'));
  }
  toggleChartExpansion(id: string): void {
    const next = this.expandedChart() === id ? null : id;
    this.expandedChart.set(next);
    this.setPageScrollLocked(!!next);
  }
  private sectionAdviceContext(id: string, section: string): string {
    const metrics = this.metrics();
    const base = { seccion: section, periodo: this.periodContextLabel(this.activeMonths(), this.year()), instruccion: 'Analiza exclusivamente esta sección. No hagas preguntas, no solicites datos y no menciones información ausente: describe únicamente lo disponible y recomienda una acción basada en ello.' };
    const data = (() => {
      switch (id) {
        case 'commercial-a': return { traficoMetro: metrics.trafficMetro, traficoOtrasTiendas: metrics.trafficOther, conversion: metrics.conversion, ticketPromedio: metrics.ticket, ventaM2: metrics.saleM2, ventaColaborador: metrics.saleCollaborator, devoluciones: metrics.returnRatio, sellThrough: metrics.sellThrough };
        case 'commercial-b': return { metaAnual: metrics.annualTarget, ventaNeta: metrics.net, cumplimientoAnual: metrics.annualPct, metaAcumulada: metrics.targetYtd, cumplimientoAcumulado: metrics.accumulatedPct, variacionAnual: metrics.annualGrowth, metaPeriodo: metrics.monthTarget, cumplimientoPeriodo: metrics.monthlyPct };
        case 'commercial-c': return { participacionRubros: this.categorySummary().slice(0, 5), marcas: this.brandSummary().slice(0, 5) };
        case 'commercial-d': return { ventaNeta: metrics.net, ventaBruta: metrics.gross, descuentos: metrics.discount, notasCredito: metrics.notes, proyeccionCierre: metrics.projectedClose };
        case 'inventory-a': return { stock: this.inventoryHealthSummary(), inventarioPorTienda: this.inventoryMatrixRows().slice(0, 8) };
        case 'inventory-b': return { cobertura: this.coverageKpis(), distribucion: this.inventoryMatrixRows().slice(0, 8) };
        case 'inventory-c': return { salud: this.predictiveHealthRows(), reposicion: this.predictiveReplenishmentRows().slice(0, 8), riesgoPorTienda: this.predictiveStoreRiskRows().slice(0, 10), horizonteDias: this.coverageProjectionHorizon(), corteStock: this.data()?.metadata.stockCutoff };
        case 'talent-a': return { dotacionPromedio: metrics.personnel, capacidadTiendas: this.talentStoreRows().slice(0, 10), coberturaTurnos: '94%', vacantesPrioritarias: 3 };
        case 'talent-b': return { ventaColaborador: metrics.saleCollaborator, tiendaProductiva: this.talentStoreRows()[0], desempeno: this.talentSellerRows(), desarrollo: this.talentPerformanceMock, continuidad: this.talentContinuityMock };
        default: return {};
      }
    })();
    return JSON.stringify({ ...base, datos: data });
  }
  sectionAdviceFor(id: string): { text: string; loading: boolean; error: boolean } | null {
    return this.sectionAdvices()[id] ?? null;
  }
  private formatSectionAdvice(text: string): string {
    let skipReading = false;
    return text.split(/\r?\n/).filter(line => {
      const heading = line.replace(/^[\s#>*\d.)_\-•]+/, '').replace(/\*\*|__/g, '').toUpperCase();
      if (/^LECTURA(?:\s|:|$)/.test(heading)) { skipReading = true; return false; }
      if (/^(HALLAZGO|RECOMENDACI[ÓO]N|PR[ÓO]XIMO PASO)\b/.test(heading)) skipReading = false;
      return !skipReading;
    }).join('\n').trim();
  }
  async requestSectionAdvice(id: string, section: string): Promise<void> {
    if (this.sectionAdviceFor(id)?.loading) return;
    this.sectionAdvices.update(items => ({ ...items, [id]: { text: '', loading: true, error: false } }));
    try {
      const text = await this.assistant.ask([
        { role: 'user', content: `MODO CONSEJO POR BLOQUE. Sección: ${section}. Usa exclusivamente los datos entregados y no pidas aclaraciones. Responde con tres líneas breves: HALLAZGO (qué merece atención), RECOMENDACIÓN (qué hacer) y PRÓXIMO PASO (acción concreta). No incluyas el apartado LECTURA. Si un dato no existe, simplemente omítelo.` },
      ], this.sectionAdviceContext(id, section));
      this.sectionAdvices.update(items => ({ ...items, [id]: { text: this.formatSectionAdvice(text), loading: false, error: false } }));
    } catch {
      this.sectionAdvices.update(items => ({ ...items, [id]: { text: 'El consejo no está disponible en este momento. Los indicadores del bloque permanecen visibles.', loading: false, error: true } }));
    }
  }
  closeExpandedChart(): void { this.expandedChart.set(null); this.setPageScrollLocked(false); }
  private setPageScrollLocked(locked: boolean): void {
    if (typeof document === 'undefined') return;
    if (locked) {
      this.pageOverflowBeforeModal = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = this.pageOverflowBeforeModal;
      this.pageOverflowBeforeModal = '';
    }
  }
  private toggleValue<T>(values: T[], value: T): T[] {
    return values.includes(value) ? values.filter(item => item !== value) : [...values, value];
  }
  clearMonths(): void {
    // MES es estrictamente temporal. No toca Tienda, Clúster, Formato, Rubro, Línea ni Sublínea.
    this.selectedMonths.set([]);
  }
  toggleMonth(value: number): void {
    const month = Number(value); if (!this.availableMonths().includes(month)) return;
    // ÚNICA mutación de este evento: selectedMonths.
    this.selectedMonths.set(this.toggleValue(this.selectedMonths(), month).sort((a, b) => a - b));
    this.clearDateRange();
  }
  clearStores(): void {
    if (this.storeFilterLocked()) return;
    this.selectedStores.set([]); this.productId.set('AUTO');
  }
  toggleStore(value: string): void {
    if (this.storeFilterLocked()) return;
    if (!this.storeOptions().some(store => store.storeId === value)) return;
    this.selectedStores.set(this.toggleValue(this.selectedStores(), value));
    this.productId.set('AUTO');
  }
  clearCategories(): void { this.selectedCategories.set([]); this.selectedGenders.set([]); this.selectedLines.set([]); this.selectedSublines.set([]); this.productId.set('AUTO'); }
  toggleCategory(value: string): void {
    if (!this.categories().includes(value)) return;
    this.selectedCategories.set(this.toggleValue(this.selectedCategories(), value)); this.selectedGenders.set([]); this.selectedLines.set([]); this.selectedSublines.set([]); this.productId.set('AUTO');
    this.deferHierarchyDetails();
  }
  clearGenders(): void { this.selectedGenders.set([]); this.productId.set('AUTO'); }
  toggleGender(value: string): void {
    if (!this.genderFilterEnabled() || !GENDER_ORDER.includes(value)) return;
    this.selectedGenders.set(this.toggleValue(this.selectedGenders(), value)); this.productId.set('AUTO');
  }
  clearLines(): void { this.selectedLines.set([]); this.selectedSublines.set([]); this.productId.set('AUTO'); }
  toggleLine(value: string): void {
    if (!this.lines().includes(value)) return;
    this.selectedLines.set(this.toggleValue(this.selectedLines(), value)); this.selectedSublines.set([]); this.productId.set('AUTO');
    this.deferHierarchyDetails();
  }
  clearSublines(): void { this.selectedSublines.set([]); this.productId.set('AUTO'); }
  toggleSubline(value: string): void {
    if (!this.sublines().includes(value)) return;
    this.selectedSublines.set(this.toggleValue(this.selectedSublines(), value)); this.productId.set('AUTO');
    this.deferHierarchyDetails();
  }
  private hierarchyDetailTimer?: ReturnType<typeof setTimeout>;
  private deferHierarchyDetails(): void {
    if (this.hierarchyDetailTimer) clearTimeout(this.hierarchyDetailTimer);
    this.hierarchyDetailTimer = setTimeout(() => {
      // Primero deja que la UI pinte el filtro. Los JSON grandes se cargan una sola vez
      // y ya indexados, evitando que Firefox parezca congelado en cada clic.
      void this.ensureSublineDetail();
      void this.ensureBrandDetail();
    }, 250);
  }

  onYear(value: number): void {
    // Conserva todos los filtros. MES solo descarta valores inexistentes en el nuevo año.
    const months = this.selectedMonths();
    const nextYear = Number(value);
    if (!Number.isFinite(nextYear) || nextYear < 2024) return;
    this.year.set(nextYear);
    this.clearDateRange();
    const available = new Set(this.availableMonths());
    this.selectedMonths.set(months.filter(month => available.has(month)));
  }
  setDemandWindow(value: number): void { this.demandWindow.set(Math.max(1, Math.round(Number(value) || 30))); }
  setDemandWindowValue(value: number): void { this.setDemandWindow((Number(value) || 1) * (this.demandWindowUnit() === 'YEARS' ? 365 : 30)); }
  togglePredictiveRubro(value: string): void {
    if (value !== 'TEXTIL' && value !== 'CALZADO') return;
    const next = this.toggleValue(this.predictiveRubros(), value);
    // El análisis no admite un universo vacío: siempre queda al menos un rubro activo.
    if (next.length) this.predictiveRubros.set(next);
    this.predictiveStore.set('TODAS');
  }
  toggleGenderRubro(value: string): void {
    if (value !== 'TEXTIL' && value !== 'CALZADO') return;
    const next = this.toggleValue(this.genderRubros(), value);
    if (next.length) this.genderRubros.set(next);
  }
  toggleRankingMetric(value: RankingMetric): void {
    const next = this.toggleValue(this.rankingMetrics(), value) as RankingMetric[];
    // El ranking necesita al menos una métrica activa para conservar su sentido.
    if (next.length) this.rankingMetrics.set(next);
  }
  setHealthyCoverage(value: number): void {
    const healthy = Math.max(1, Math.round(Number(value) || 30)); this.healthyCoverageDays.set(healthy);
    if (this.overstockDays() <= healthy) this.overstockDays.set(healthy + 30);
  }
  setHealthyCoverageValue(value: number): void { this.setHealthyCoverage((Number(value) || 1) * (this.healthyCoverageUnit() === 'YEARS' ? 365 : 30)); }
  setOverstockDays(value: number): void {
    const overstock = Math.max(1, Math.round(Number(value) || 30));
    this.overstockDays.set(Math.max(overstock, this.healthyCoverageDays() + 30));
  }
  setOverstockValue(value: number): void { this.setOverstockDays((Number(value) || 1) * (this.overstockUnit() === 'YEARS' ? 365 : 30)); }
  setNoMovementMonths(value: number): void { this.noMovementMonths.set(Math.max(1, Math.round(Number(value) || 1))); }
  setNoMovementValue(value: number): void { this.setNoMovementMonths((Number(value) || 1) * (this.noMovementUnit() === 'YEARS' ? 12 : 1)); }
  setPredictiveMerma(value: number): void { this.predictiveMermaPct.set(Math.min(50, Math.max(0, Math.round(Number(value) || 0)))); }
  setInternalLeadTime(value: number): void { this.internalLeadTime.set(Math.max(1, Math.round(Number(value) || 1))); }
  setLeadTimeValue(value: number): void { this.setInternalLeadTime((Number(value) || 1) * (this.leadTimeUnit() === 'MONTHS' ? 30 : 1)); }
  setSupplierLeadTime(value: number): void { if ([15, 30, 45, 60, 90].includes(Number(value))) this.supplierLeadTime.set(Number(value) as 15 | 30 | 45 | 60 | 90); }
  setSecurityDays(value: number): void { if ([7, 15, 30].includes(Number(value))) this.securityDays.set(Number(value) as 7 | 15 | 30); }
  clearClusters(): void {
    if (this.clusterFilterLocked()) return;
    this.selectedClusters.set([]);
    const validStores = new Set(this.storeOptions().map(store => store.storeId));
    this.selectedStores.update(ids => ids.filter(id => validStores.has(id)));
    this.productId.set('AUTO');
  }
  toggleCluster(value: string): void {
    if (this.clusterFilterLocked()) return;
    if (!this.clusters().includes(value)) return;
    this.selectedClusters.set(this.toggleValue(this.selectedClusters(), value));
    const validStores = new Set(this.storeOptions().map(store => store.storeId));
    this.selectedStores.update(ids => ids.filter(id => validStores.has(id)));
    this.productId.set('AUTO');
  }
  clearFormats(): void {
    this.selectedFormats.set([]);
    const validStores = new Set(this.storeOptions().map(store => store.storeId));
    this.selectedStores.update(ids => ids.filter(id => validStores.has(id)));
    this.productId.set('AUTO');
  }
  toggleFormat(value: string): void {
    if (!this.formats().includes(value)) return;
    this.selectedFormats.set(this.toggleValue(this.selectedFormats(), value));
    const validStores = new Set(this.storeOptions().map(store => store.storeId));
    this.selectedStores.update(ids => ids.filter(id => validStores.has(id)));
    this.productId.set('AUTO');
  }
  async goPage(value: 1 | 2 | 3): Promise<void> {
    if (this.page() === value) return;
    this.closeExpandedChart();
    this.sectionAdvices.set({});
    this.page.set(value);
    if (value === 3) {
      await this.nextPaint();
      void this.ensureSellerDetail();
      return;
    }
    if (value !== 2) return;
    await this.nextPaint();
    // La parte superior usa agregados de dashboard.json y aparece de inmediato.
    // Antigüedad pesa ~4 MB; el detalle por producto (~54 MB) se prepara en tiempo ocioso.
    void this.ensureStockOrigin();
    this.scheduleInventoryProductDetail();
  }

  private scheduleInventoryProductDetail(): void {
    if (this.stockDetailLoaded() || this.stockDetailPromise || this.stockDetailFailed()) return;
    const start = (): void => {
      void this.ensureStockDetail().then(() => {
        if (this.stockDetailLoaded()) void this.ensurePredictiveDetail();
      });
    };
    const idleWindow = typeof window === 'undefined' ? undefined : window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    };
    if (idleWindow?.requestIdleCallback) idleWindow.requestIdleCallback(start, { timeout: 1_500 });
    else setTimeout(start, 350);
  }
  selectStore(id: string): void { if (!this.storeFilterLocked()) this.toggleStore(id); }
  resetFilters(): void {
    const cutoff = this.data()?.metadata.salesCutoff || ''; this.year.set(Number(cutoff.slice(0, 4))); this.selectedMonths.set([]); this.fromDate.set(''); this.toDate.set('');
    this.selectedClusters.set([]); this.selectedFormats.set([]); this.selectedStores.set([]); this.selectedCategories.set([]); this.selectedGenders.set([]); this.selectedLines.set([]); this.selectedSublines.set([]);
    this.productId.set('AUTO'); this.demandWindow.set(30); this.orderCost.set(this.data()?.metadata.eoq.orderCost || 5000); this.holdingCost.set(this.data()?.metadata.eoq.annualHoldingCost || 8);
    this.replenishmentType.set('internal'); this.internalLeadTime.set(30); this.supplierLeadTime.set(30); this.securityDays.set(15);
    this.predictiveRubros.set(['TEXTIL', 'CALZADO']); this.genderRubros.set(['TEXTIL', 'CALZADO']); this.rankingMetrics.set(['ROTATION', 'NET', 'TICKET', 'SALE_M2']); this.predictiveStore.set('TODAS'); this.healthyCoverageDays.set(30); this.overstockDays.set(90); this.noMovementMonths.set(3); this.predictiveMermaPct.set(2); this.rotationView.set('rotation');
    this.demandWindowUnit.set('MONTHS'); this.healthyCoverageUnit.set('MONTHS'); this.overstockUnit.set('MONTHS'); this.noMovementUnit.set('MONTHS'); this.leadTimeUnit.set('DAYS');
    this.openFilter.set(null); this.filterSearch.set({ month: '', store: '', category: '', gender: '', line: '', subline: '', cluster: '', format: '' }); this.stockHistoryBucketsSelected.set([]);
    this.calendarOpen.set(false);
    this.applyAccessScope();
  }

  private applyAccessScope(): void {
    const access = this.cloud.accessProfile();
    const stores = this.data()?.stores ?? [];
    if (!access || access.scopeType === 'all') return;
    if (access.scopeType === 'store') {
      const allowedStores = stores.filter(store => this.storeAllowedByAccess(store));
      this.selectedStores.set(allowedStores.map(store => store.storeId));
      this.selectedClusters.set([...new Set(allowedStores.map(store => store.cluster).filter(Boolean))]);
      return;
    }
    if (access.scopeType === 'cluster') {
      const allowed = new Set(access.clusters.map(value => this.normalized(value)));
      this.selectedClusters.set([...new Set(stores
        .map(store => store.cluster)
        .filter(cluster => !!cluster && allowed.has(this.normalized(cluster))))]);
      this.selectedStores.set([]);
      return;
    }
    this.selectedClusters.set([]);
    this.selectedStores.set([]);
  }
  formatDate(value?: string): string { return value ? value.split('T')[0].split('-').reverse().join('/') : 'N/A'; }
  periodLabel(period: number): string { return period ? `${MONTHS[(period % 100) - 1]} ${Math.floor(period / 100)}` : 'N/A'; }
  money(value: number | null, compact = false): string {
    if (value == null || !Number.isFinite(value)) return 'N/A';
    if (compact && Math.abs(value) >= 1_000_000) return `S/ ${(value / 1_000_000).toFixed(2)} mill.`;
    if (compact && Math.abs(value) >= 1_000) return `S/ ${(value / 1_000).toFixed(1)} mil`;
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }).format(value);
  }
  number(value: number | null, suffix = ''): string { return value == null || !Number.isFinite(value) ? 'N/A' : `${new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(value)}${suffix}`; }
  timeValue(value: number, unit: PredictiveTimeUnit): number { return Math.max(1, Math.round(value / (unit === 'YEARS' ? 365 : 30))); }
  monthTimeValue(value: number, unit: PredictiveTimeUnit): number { return Math.max(1, Math.round(value / (unit === 'YEARS' ? 12 : 1))); }
  leadTimeValue(): number { return Number((this.internalLeadTime() / (this.leadTimeUnit() === 'MONTHS' ? 30 : 1)).toFixed(2)); }
  percent(value: number | null): string { return value == null || !Number.isFinite(value) ? 'N/A' : new Intl.NumberFormat('es-PE', { style: 'percent', maximumFractionDigits: 2 }).format(value); }
  trend(value: number | null): string { return value == null ? 'N/A' : `${value >= 0 ? '▲' : '▼'} ${this.percent(Math.abs(value))}`; }

  private async loadDetail<T>(file: string): Promise<T> {
    const source = await this.cloud.jsonSource(file);
    const fallbackUrls = [
      `assets/data/${file}`,
      `./assets/data/${file}`,
      `/${file}`,
      `./${file}`,
    ];

    if (typeof Worker === 'undefined') {
      const loadUrls = async (urls: string[], encoding: 'identity' | 'gzip'): Promise<T> => {
        const chunks: BlobPart[] = [];
        for (const url of urls) {
          const response = await fetch(url, { cache: 'default' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          chunks.push(await response.blob());
        }
        let stream: ReadableStream<Uint8Array> = new Blob(chunks).stream();
        if (encoding === 'gzip') {
          if (typeof DecompressionStream === 'undefined') throw new Error('El navegador no admite archivos comprimidos.');
          const decompressor = new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>;
          stream = stream.pipeThrough(decompressor);
        }
        return JSON.parse(await new Response(stream).text()) as T;
      };
      try {
        return await loadUrls(source.urls, source.encoding);
      } catch {
        if (this.cloud.remoteEnabled()) throw new Error(`No se pudo cargar ${file} de la versión autorizada.`);
        const attempted = new Set(source.urls);
        for (const url of fallbackUrls) {
          if (attempted.has(url)) continue;
          attempted.add(url);
          try {
            return await loadUrls([url], 'identity');
          } catch {
            continue;
          }
        }
        throw new Error(`El archivo ${file} no existe en la versión publicada.`);
      }
    }
    return new Promise<T>((resolve, reject) => {
      const worker = new Worker(new URL('./json-loader.worker', import.meta.url), { type: 'module' });
      const finish = (): void => worker.terminate();
      worker.onmessage = ({ data }: MessageEvent<{ ok: boolean; data?: T; error?: string }>) => {
        finish();
        if (data.ok) resolve(data.data as T);
        else reject(new Error(`${data.error || 'Error desconocido'} en ${file}`));
      };
      worker.onerror = event => {
        finish();
        reject(new Error(`${event.message || 'No se pudo cargar el detalle'} en ${file}`));
      };
      worker.postMessage(source);
    });
  }

  private loadLegacyStock(): Promise<{ stockOrigin: StockOrigin[]; stockProducts: ProductRow[] }> {
    if (!this.legacyStockPromise) {
      this.legacyStockPromise = this.loadDetail<{ stockOrigin: StockOrigin[]; stockProducts: ProductRow[] }>('dashboard-stock.json');
    }
    return this.legacyStockPromise;
  }
  private async ensureBrandDetail(): Promise<void> {
    if (this.brandDetailLoaded()) return;
    if (this.brandDetailPromise) return this.brandDetailPromise;
    this.brandDetailPromise = (async () => {
    try {
      const payload = await this.loadDetail<{ monthlyBrand: BrandRow[] }>('dashboard-brand.json');
      this.monthlyBrandIndex = await this.indexPeriodStoreAsync(payload.monthlyBrand || []);
      this.brandDetailLoaded.set(true);
    }
    catch (error) { this.loadingError.set(`No se pudo abrir el detalle de marcas: ${error instanceof Error ? error.message : error}`); }
    finally { this.brandDetailPromise = undefined; }
    })();
    return this.brandDetailPromise;
  }
  private async ensureSublineDetail(): Promise<void> {
    if (this.sublineDetailLoaded()) return;
    if (this.sublineDetailPromise) return this.sublineDetailPromise;
    this.sublineDetailPromise = (async () => {
    try {
      const payload = await this.loadDetail<{ monthlySubline: Monthly[] }>('dashboard-subline.json');
      this.monthlySublineIndex = await this.indexPeriodStoreAsync(payload.monthlySubline || []);
      this.sublineDetailLoaded.set(true);
    }
    catch (error) { this.loadingError.set(`No se pudo abrir el detalle de sublíneas: ${error instanceof Error ? error.message : error}`); }
    finally { this.sublineDetailPromise = undefined; }
    })();
    return this.sublineDetailPromise;
  }
  private async ensurePriceRangeDetail(): Promise<void> {
    if (this.priceRangeDetailLoaded()) return;
    if (this.priceRangeDetailPromise) return this.priceRangeDetailPromise;
    this.priceRangeDetailPromise = (async () => {
      try {
        const payload = await this.loadDetail<{ monthlyPriceRange: PriceRangeRow[] }>('dashboard-price-range.json');
        const rows = payload.monthlyPriceRange || [];
        this.monthlyPriceRangeIndex = await this.indexPeriodStoreAsync(rows);
        this.priceRangeData.set(rows);
        this.priceRangeDetailLoaded.set(true);
      } catch (error) {
        this.loadingError.set(`No se pudo abrir el detalle de rangos de precio: ${error instanceof Error ? error.message : error}`);
      } finally {
        this.priceRangeDetailPromise = undefined;
      }
    })();
    return this.priceRangeDetailPromise;
  }
  private async ensureSellerDetail(): Promise<void> {
    if (this.sellerDetailLoaded()) return;
    if (this.sellerDetailPromise) return this.sellerDetailPromise;
    this.sellerDetailLoading.set(true);
    this.sellerDetailPromise = (async () => {
      try {
        const payload = await this.loadDetail<{ sellerPerformance: SellerPerformanceRow[] }>('dashboard-sellers.json');
        this.sellerPerformanceData.set(payload.sellerPerformance || []);
        this.sellerDetailLoaded.set(true);
      } catch {
        // Las demás métricas de Talento deben seguir disponibles si falla este detalle.
        this.sellerPerformanceData.set([]);
      } finally {
        this.sellerDetailLoading.set(false);
        this.sellerDetailPromise = undefined;
      }
    })();
    return this.sellerDetailPromise;
  }
  private async ensureStockOrigin(): Promise<void> {
    if (this.stockOriginLoaded()) return;
    if (this.stockOriginPromise) return this.stockOriginPromise;
    this.detailLoading.set(true);
    this.stockOriginPromise = (async () => {
      try {
        let rows: StockOrigin[];
        try {
          const payload = await this.loadDetail<{ stockOrigin: StockOrigin[] }>('dashboard-stock-origin.json');
          rows = payload.stockOrigin || [];
        } catch {
          rows = (await this.loadLegacyStock()).stockOrigin || [];
        }
        this.stockOriginData.set(rows);
        this.stockOriginLoaded.set(true);
      } catch (error) {
        this.stockOriginData.set([]);
        this.stockOriginLoaded.set(true);
        this.predictiveNote.set(`La antigüedad de stock no está disponible: ${error instanceof Error ? error.message : error}`);
      } finally {
        this.detailLoading.set(false);
        this.stockOriginPromise = undefined;
      }
    })();
    return this.stockOriginPromise;
  }

  private async ensureStockDetail(): Promise<void> {
    if (this.stockDetailLoaded()) return;
    if (this.stockDetailPromise) return this.stockDetailPromise;
    this.stockDetailPromise = (async () => {
    try {
      let payload: { stockProducts: ProductRow[] };
      try {
        payload = await this.loadDetail<{ stockProducts: ProductRow[] }>('dashboard-stock-products.json');
      } catch {
        payload = await this.loadLegacyStock();
      }
      const products = payload.stockProducts || [];
      const byStore = new Map<string, ProductRow[]>(); const byCategory = new Map<string, ProductRow[]>();
      const allByStore = new Map<string, StockAggregate>();
      const predictiveByStore = new Map<string, StockAggregate>();
      const predictiveByProduct = new Map<string, ProductAggregate>();
      const predictiveRowsByProduct = new Map<string, ProductRow[]>();
      const predictiveProducts: ProductRow[] = [];
      for (let i = 0; i < products.length; i += 1) {
        const row = products[i];
        const storeRows = byStore.get(row.storeId); if (storeRows) storeRows.push(row); else byStore.set(row.storeId, [row]);
        const categoryRows = byCategory.get(row.category); if (categoryRows) categoryRows.push(row); else byCategory.set(row.category, [row]);
        const storeAggregate = allByStore.get(row.storeId) || { stockUnits: 0, stockValue: 0, units30: 0, sales30: 0 };
        storeAggregate.stockUnits += row.stockUnits || 0; storeAggregate.stockValue += row.stockValue || 0;
        storeAggregate.units30 += row.units30 || 0; storeAggregate.sales30 += row.sales30 || 0;
        allByStore.set(row.storeId, storeAggregate);
        if (this.isPredictiveProduct(row)) {
          predictiveProducts.push(row);
          const productRows = predictiveRowsByProduct.get(row.productId); if (productRows) productRows.push(row); else predictiveRowsByProduct.set(row.productId, [row]);
          const predictiveStore = predictiveByStore.get(row.storeId) || { stockUnits: 0, stockValue: 0, units30: 0, sales30: 0 };
          predictiveStore.stockUnits += row.stockUnits || 0; predictiveStore.stockValue += row.stockValue || 0;
          predictiveStore.units30 += row.units30 || 0; predictiveStore.sales30 += row.sales30 || 0;
          predictiveByStore.set(row.storeId, predictiveStore);
          const productKey = `${row.productId}|${row.product}`;
          const productAggregate = predictiveByProduct.get(productKey) || { name: row.product, units: 0, value: 0 };
          productAggregate.units += row.stockUnits || 0; productAggregate.value += row.stockValue || 0;
          predictiveByProduct.set(productKey, productAggregate);
        }
        if (i > 0 && i % 10_000 === 0) await this.yieldToBrowser();
      }
      this.stockProductsByStore = byStore; this.stockProductsByCategory = byCategory;
      this.predictiveProductsByProduct = predictiveRowsByProduct;
      this.stockAggregateByStore.set(allByStore);
      this.predictiveAggregateByStore.set(predictiveByStore);
      this.predictiveAggregateByProduct.set(predictiveByProduct);
      this.staticPredictiveProductsData.set(predictiveProducts);
      this.stockProductsData.set(products);
      this.stockDetailLoaded.set(true);
    }
    catch (error) {
      this.stockDetailFailed.set(true);
      this.predictiveNote.set(`El detalle por producto no está disponible: ${error instanceof Error ? error.message : error}`);
    }
    finally { this.stockDetailPromise = undefined; }
    })();
    return this.stockDetailPromise;
  }
  private async ensurePredictiveDetail(): Promise<void> {
    if (this.predictiveDetailLoaded() || this.predictiveDetailFailed()) return;
    if (this.predictiveDetailPromise) return this.predictiveDetailPromise;
    this.predictiveDetailLoading.set(true);
    this.predictiveDetailPromise = (async () => {
    try {
      const payload = await this.loadDetail<{ note: string; rows: PredictiveRow[] }>('dashboard-predictive.json');
      const rows = payload.rows || [];
      const index = new Map<string, PredictiveRow>();
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        index.set(`${row.storeId}|${row.productId}`, row);
        if (i > 0 && i % 10_000 === 0) await this.yieldToBrowser();
      }
      this.predictiveIndex.set(index);
      this.predictiveNote.set(payload.note || '');
      this.predictiveDetailLoaded.set(true);
    } catch (error) {
      // El detalle predictivo es complementario: un 404 no debe tumbar todo el dashboard.
      this.predictiveIndex.set(new Map());
      this.predictiveNote.set(`Detalle predictivo no disponible: ${error instanceof Error ? error.message : error}`);
      this.predictiveDetailFailed.set(true);
    }
    finally { this.predictiveDetailLoading.set(false); this.predictiveDetailPromise = undefined; }
    })();
    return this.predictiveDetailPromise;
  }

  private short(v: number): string {
    const absolute = Math.abs(v);
    if (absolute >= 1_000_000) return `${Number((v / 1_000_000).toFixed(1))}M`;
    if (absolute >= 1_000) return `${Number((v / 1_000).toFixed(1))}k`;
    return Number(v.toFixed(absolute > 0 && absolute < 1 ? 6 : 2)).toLocaleString('es-PE');
  }
  private readonly tooltipToRight = (point: number[], _params: unknown, _element: HTMLElement, _rect: unknown, size: any): [number, number] => {
    const gap = 16; const content = size?.contentSize || [160, 80]; const view = size?.viewSize || [400, 300];
    const fitsRight = point[0] + gap + content[0] <= view[0] - 4;
    const x = fitsRight ? point[0] + gap : Math.max(4, point[0] - content[0] - gap);
    const y = Math.max(4, Math.min(point[1] - content[1] / 2, view[1] - content[1] - 4));
    return [x, y];
  };
  private tooltip(title: string, rows: Detail[]): string {
    return `<div class="chart-tooltip"><strong>${safe(title)}</strong>${rows.map(r => `<div><span>${safe(r.label)}</span><b>${safe(r.value)}</b></div>`).join('')}</div>`;
  }
  private barOption(labels: string[], values: number[], horizontal: boolean, color: string, details: Detail[][], unit: string, colors?: string[], verticalLabels = false): EChartsOption {
    const visibleRows = horizontal ? Math.min(7, labels.length) : labels.length;
    const categoryLabel = horizontal
      ? { color: '#374151', interval: 0, rotate: 0, fontSize: 10, width: 70, overflow: 'truncate' as const }
      : verticalLabels
        ? { color: '#374151', interval: 0, rotate: 90, align: 'center' as const, verticalAlign: 'middle' as const, margin: 42, hideOverlap: false, fontSize: 9, overflow: 'none' as const }
        : { color: '#374151', interval: 0, rotate: labels.length > 8 ? 45 : 0, fontSize: 10, overflow: 'none' as const };
    const category = { type: 'category' as const, data: labels, axisLabel: categoryLabel, axisTick: { show: false }, axisLine: { lineStyle: { color: '#CBD5E1' } } };
    const value = { type: 'value' as const, axisLabel: { color: '#64748B', formatter: (v: number) => unit === '%' ? `${Math.round(v * 100)}%` : unit === 'x' ? `${v.toFixed(2)}x` : this.short(v) }, splitLine: { lineStyle: { color: '#E5E7EB' } } };
    const total = values.reduce((a, b) => a + b, 0);
    return {
      animation: false, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, backgroundColor: '#FFFFFF', borderColor: color, borderWidth: 1, padding: [5, 7], textStyle: { color: '#111827', fontSize: 9 }, position: this.tooltipToRight, formatter: (params: any[]) => { const index = params[0]?.dataIndex ?? 0; return this.tooltip(labels[index] || '', [
        ...(details[index] || []), ...((details[index] || []).some(d => d.label === 'Participación') || !total || unit === '%' ? [] : [{ label: 'Participación', value: this.percent(values[index] / total) }])
      ]); } },
      grid: { left: horizontal ? 82 : 48, right: horizontal && labels.length > visibleRows ? 30 : 18, top: 14, bottom: verticalLabels ? 108 : labels.length > 8 && !horizontal ? 70 : 38 },
      dataZoom: horizontal && labels.length > visibleRows ? [
        { type: 'inside', yAxisIndex: 0, startValue: 0, endValue: visibleRows - 1, zoomLock: true, moveOnMouseWheel: true },
        { type: 'slider', yAxisIndex: 0, orient: 'vertical', right: 1, top: 8, bottom: 8, width: 14, startValue: 0, endValue: visibleRows - 1, showDetail: false, brushSelect: false,
          backgroundColor: '#D8E0EC', fillerColor: 'rgba(18,58,140,.3)', borderColor: '#9AABC2', handleSize: '110%', handleStyle: { color: '#123A8C', borderColor: '#0C2D70' } }
      ] : [],
      xAxis: horizontal ? value : category, yAxis: horizontal ? category : value,
      series: [{ type: 'bar', data: values.map((v, i) => ({ value: v, itemStyle: { color: colors?.[i] || color, borderRadius: horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0] } })), barMaxWidth: horizontal ? 20 : 34, barCategoryGap: horizontal ? '24%' : undefined, label: { show: horizontal && labels.length <= 20, position: 'right', formatter: (p: any) => `${this.short(Number(p.value))}${unit === 'días' ? ' d' : ''}`, color: '#172033', fontSize: 10, fontWeight: 900, backgroundColor: 'rgba(255,255,255,.92)', padding: [1, 3], borderRadius: 3 } }]
    } as EChartsOption;
  }
  private donutOption(values: { name: string; value: number; units: number; color?: string }[]): EChartsOption {
    const total = values.reduce((t, v) => t + v.value, 0);
    const topNames = new Set(values.slice(0, 4).map(value => value.name));
    return {
      animation: false,
      color: values.map((value, index) => value.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length]),
      tooltip: { trigger: 'item', confine: true, padding: [5, 7], textStyle: { fontSize: 9 }, position: this.tooltipToRight, formatter: (p: any) => { const item = values[p.dataIndex]; return this.tooltip(item.name, [
        { label: 'Venta neta', value: this.money(item.value, true) }, { label: 'Participación', value: total ? this.percent(item.value / total) : 'FALTA INFORMACIÓN' }, { label: 'Unidades', value: this.number(item.units) }
      ]); } },
      legend: { show: false }, series: [{ type: 'pie', radius: ['36%', '59%'], center: ['49%', '51%'], avoidLabelOverlap: true,
        label: { show: false }, labelLine: { show: false },
        emphasis: { scale: true, scaleSize: 6 }, data: values.map(v => {
          const top = topNames.has(v.name);
          return {
            name: v.name, value: v.value,
            label: { show: top, position: 'outside', color: '#172033', fontSize: 10, fontWeight: 700, width: 130, overflow: 'break', lineHeight: 13,
              formatter: `${v.name}\n${total ? Math.round(v.value / total * 100) : 0}%` },
            labelLine: { show: top, length: 8, length2: 6, lineStyle: { color: '#94A3B8' } }
          };
        }) }]
    } as EChartsOption;
  }
  private comboOption(labels: string[], real: number[], target: number[], units: number[]): EChartsOption {
    const labelHeights = real.map((value, index) => Math.max(value, target[index] || 0) * 1.015);
    return {
      animation: false,
      color: [C.blue, C.gold], tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, padding: [5, 7], textStyle: { fontSize: 9 }, position: this.tooltipToRight, formatter: (p: any[]) => { const i = p[0]?.dataIndex ?? 0; const pct = target[i] ? real[i] / target[i] : null; return this.tooltip(labels[i], [
        { label: 'Venta real', value: this.money(real[i], true) }, { label: 'Meta', value: this.money(target[i], true) }, { label: 'Cumplimiento', value: this.percent(pct) },
        { label: 'Brecha', value: this.money(real[i] - target[i], true) }, { label: 'Unidades', value: this.number(units[i]) }
      ]); } },
      legend: { data: ['VENTA REAL', 'META'], top: 0, textStyle: { fontSize: 10 } }, grid: { left: 50, right: 18, top: 34, bottom: 38 },
      xAxis: { type: 'category', data: labels, axisTick: { show: false } }, yAxis: { type: 'value', max: (extent: { max: number }) => extent.max * 1.12, axisLabel: { formatter: (v: number) => this.short(v) }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      series: [{ name: 'VENTA REAL', type: 'bar', data: real, barMaxWidth: 28, z: 2, itemStyle: { color: C.blue, borderRadius: [4, 4, 0, 0] },
        label: { show: false } },
        { name: 'META', type: 'line', data: target, symbol: 'circle', symbolSize: 7, z: 5, lineStyle: { width: 3, color: C.gold }, itemStyle: { color: C.gold } },
        { name: 'CUMPLIMIENTO', type: 'bar', data: labelHeights, barMaxWidth: 28, barGap: '-100%', silent: true, z: 20,
          itemStyle: { color: 'rgba(255,255,255,0)' },
          label: { show: true, position: 'top', distance: 3, formatter: (params: any) => this.percent(target[params.dataIndex] ? real[params.dataIndex] / target[params.dataIndex] : null), color: '#172033', fontSize: 8, fontWeight: 700, backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderWidth: 1, padding: [1, 3], borderRadius: 3 },
          labelLayout: { hideOverlap: false } }
      ]
    } as EChartsOption;
  }
}
