import { Injectable, OnInit, computed, effect, inject, signal } from './reactivity-react';
import type { EChartsOption } from 'echarts';
import { AssistantService } from './assistant.service';
import { blackChartText } from './chart-text';
import type { DashboardHeaderModel, DashboardFilterAction, DashboardFiltersModel } from './view-models';
import { readRuntimeConfig } from './runtime-config';
import { adaptiveValueScale } from './chart-scale';
import { CloudDataService, type AnnualGoal, type CompanyRankingData, type OperationalSummary, type StockInsights, type StoreGoal } from './cloud-data.service';
import { nextBirthday } from './next-birthday';
import { stockTransfers, transferTotals } from './stock-transfers';
import { aggregateStoreMetrics, stockExtremes, aggregateSellerRanking, dashboardMoneyFormat, dashboardNumberFormat, dashboardPercentFormat } from './inventory-performance';
import { SectionLoads } from './section-loads';
import { resolveProductSize, type ShoeSizeSystem, type SizeRubro } from './product-sizes';
import { decodeCompactRows, decodeDailyCompact, decodePredictiveCompact, decodeStockCompact, decodeSizeCompact,
  type CompactRows, type DailyCompact, type PredictiveCompact, type StockCompact, type SizeCompact } from './compact-dashboard';

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
type BrandRow = { periodId: number; storeId: string; category?: string; line?: string; subline?: string; brand: string; net: number; units: number };
type PriceRangeRow = { periodId: number; storeId: string; category: string; line: string; subline: string; bandOrder: number; priceBand: string; net: number; units: number };
type SellerPerformanceRow = { periodId: number; storeId: string; category: string; line: string; subline: string; seller: string; net: number; units: number; transactions: number };
type ClientPerformanceRow = { periodId: number; storeId: string; category: string; line: string; subline: string; client: string; net: number; units: number; transactions: number };
type ProductRow = {
  storeId: string; productId: string; productCode?: string; product: string; category: string; line: string; subline: string; brand: string;
  stockUnits: number; stockValue: number; goodUnits?: number; mermaStockUnits?: number; desmedroStockUnits?: number;
  units30: number; sales30: number; units12: number; sales12: number;
};
type StockOrigin = { storeId: string; category: string; line: string; subline: string; originPeriodId: number; units: number; value: number };
type StockHierarchyRow = { storeId: string; category: string; line: string; subline: string; brand: string;
  stockUnits: number; stockValue: number; goodUnits: number; units30: number; sales30: number;
  mermaStockUnits?: number; desmedroStockUnits?: number };
type SizeProductRow = { storeId: string; productId: string; productCode: string; product: string;
  category: SizeRubro; line: string; subline: string; brand?: string; stockUnits: number; units30: number; units90?: number };
type SizeSaleRow = { periodId: number; storeId: string; productId: string; productCode: string; product: string;
  category: SizeRubro; line: string; subline: string; brand: string; units90: number };
type PredictiveStore = { storeId: string; stockUnits: number; stockValue: number; units30: number; sales30: number; coverageDays: number | null; rotation: number | null };
type PredictiveCategory = { storeId: string; category: string; stockUnits: number; stockValue: number; units30: number; sales30: number; rotation: number | null };
type HourlySalesRow = { periodId: number; date?: string; storeId: string; hour: number; transactions: number; net: number };
type BrandSummary = { name: string; net: number; units: number; share: number; category: string };
type CategorySummary = { name: string; net: number; units: number; share: number; topLine: string; color: string };
type CategoryView = 'RUBRO' | 'LINEA';
type RankingMetric = 'ROTATION' | 'MARKUP' | 'TICKET' | 'SALE_M2';
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
type SizeMetric = 'SALES' | 'STOCK' | 'TRANSFERS';
type SizeChartRow = {
  label: string; sort: number; codes: Set<string>; productIds: Set<string>;
  sales: number; stock: number; transfers: number;
};
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
const SECTION_HEADINGS: Record<string, { mark: string; title: string; section?: string }> = {
  commercial: { mark: '01', title: 'RESUMEN COMERCIAL' },
  'commercial-a': { mark: 'A', title: 'INDICADORES CLAVE', section: '01.A Indicadores clave' },
  'commercial-b': { mark: 'B', title: 'CUMPLIMIENTO Y AVANCE', section: '01.B Cumplimiento y avance' },
  'commercial-c': { mark: 'C', title: 'COMPORTAMIENTO COMERCIAL', section: '01.C Comportamiento comercial' },
  'commercial-d': { mark: 'D', title: 'COMPOSICIÓN DE LA VENTA', section: '01.D Composición de la venta' },
  inventory: { mark: '02', title: 'CONTROL DE INVENTARIO' },
  'inventory-a': { mark: 'A', title: 'VISIÓN GENERAL DE STOCK', section: '02.A Visión general de stock' },
  'inventory-b': { mark: 'B', title: 'COBERTURA Y DISTRIBUCIÓN', section: '02.B Cobertura y distribución' },
  'inventory-c': { mark: 'C', title: 'SEÑALES DE REPOSICIÓN', section: '02.C Señales de reposición' },
  talent: { mark: '03', title: 'GESTIÓN DE TALENTO' },
  'talent-a': { mark: 'A', title: 'DOTACIÓN Y EVOLUCIÓN', section: '03.A Dotación y evolución' },
  'talent-b': { mark: 'B', title: 'PRODUCTIVIDAD Y DISTRIBUCIÓN', section: '03.B Productividad y distribución' },
  'talent-c': { mark: 'C', title: 'DESARROLLO Y CONTINUIDAD', section: '03.C Desarrollo y continuidad' },
};

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

@Injectable()
export class CommercialDashboardController implements OnInit {
  readonly cloud = inject(CloudDataService);
  private readonly assistant = inject(AssistantService);
  readonly Math = Math;
  readonly monthNamesFull = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  readonly data = signal<DashboardData | null>(null);
  readonly storeGoalOverrides = signal<StoreGoal[]>([]);
  readonly annualGoalOverrides = signal<AnnualGoal[]>([]);
  readonly storeGoalsReady = signal(false);
  private goalLoadToken = 0;
  readonly dataWarnings = computed(() => this.data()?.metadata.dataWarnings ?? []);
  readonly salesCutoffYear = computed(() => Number(this.data()?.metadata.salesCutoff?.slice(0, 4)) || new Date().getFullYear());
  readonly loadingError = signal('');
  readonly loginEmail = signal('');
  readonly loginPassword = signal('');
  readonly loginBusy = signal(false);
  readonly detailLoading = signal(false);
  readonly stockDetailLoading = signal(false);
  readonly stockDetailProgress = signal(0);
  readonly productCodeLoading = signal(false);
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
  readonly priceRangeComparisonYear = signal(2025);
  readonly stockOriginData = signal<StockOrigin[]>([]);
  readonly stockHierarchyData = signal<StockHierarchyRow[]>([]);
  readonly stockInsightsData = signal<StockInsights | null>(null);
  private readonly stockInsightsActivated = signal(false);
  private readonly stockInsightsRetry = signal(0);
  readonly stockHierarchyLoaded = signal(false);
  readonly stockTransferProductsData = signal<ProductRow[]>([]);
  readonly stockTransfersLoaded = signal(false);
  readonly stockTransfersError = signal('');
  readonly sizeProductsData = signal<Record<SizeRubro, SizeProductRow[]>>({ CALZADO: [], TEXTIL: [] });
  readonly sizeDetailLoaded = signal<Record<SizeRubro, boolean>>({ CALZADO: false, TEXTIL: false });
  readonly sizeSalesData = signal<SizeSaleRow[]>([]);
  readonly sizeSalesLoadedKey = signal('');
  readonly sizeSalesLoading = signal(false);
  readonly sizeDetailSelected = signal('');
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
  private brandDetailAbort?: AbortController;
  private brandDetailGeneration = 0;
  private sublineDetailPromise?: Promise<void>;
  private stockOriginPromise?: Promise<void>;
  private stockHierarchyPromise?: Promise<void>;
  private stockTransfersPromise?: Promise<void>;
  private sizeDetailPromises = new Map<SizeRubro, Promise<void>>();
  private stockDetailPromise?: Promise<void>;
  private stockDetailObserver?: IntersectionObserver;
  private legacyStockPromise?: Promise<{ stockOrigin: StockOrigin[]; stockProducts: ProductRow[] }>;
  private predictiveDetailPromise?: Promise<void>;
  private priceRangeDetailPromise?: Promise<void>;
  private priceRangeDetailAbort?: AbortController;
  private priceRangeDetailGeneration = 0;
  private sellerDetailPromise?: Promise<void>;
  private sellerDetailAbort?: AbortController;
  private sellerDetailGeneration = 0;
  private pageOverflowBeforeModal = '';
  private readonly sectionLoads = new SectionLoads();

  private indexPeriodStore<T extends { periodId: number; storeId: string }>(rows: T[]): Map<string, T[]> {
    const index = new Map<string, T[]>();
    for (const row of rows) {
      const key = `${row.periodId}|${row.storeId}`;
      const bucket = index.get(key);
      if (bucket) bucket.push(row); else index.set(key, [row]);
    }
    return index;
  }

  private async indexPeriodStoreAsync<T extends { periodId: number; storeId: string }>(rows: T[], signal?: AbortSignal): Promise<Map<string, T[]>> {
    const index = new Map<string, T[]>();
    for (let i = 0; i < rows.length; i += 1) {
      if (i % 10_000 === 0) signal?.throwIfAborted();
      const row = rows[i];
      const key = `${row.periodId}|${row.storeId}`;
      const bucket = index.get(key);
      if (bucket) bucket.push(row); else index.set(key, [row]);
      if (i > 0 && i % 10_000 === 0) await this.yieldToBrowser();
    }
    signal?.throwIfAborted();
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
  readonly operationalSummary = signal<OperationalSummary | null>(null);
  readonly companyRankingData = signal<CompanyRankingData | null>(null);
  readonly expandedChart = signal<string | null>(null);
  readonly ticketChartYear = signal(new Date().getFullYear());
  readonly ticketChartSelectedStores = signal<string[]>([]);
  readonly kpiDetailMonth = signal(0);
  readonly trafficChartType = signal<'METRO' | 'OTHER'>('METRO');
  readonly ticketChartYears = computed(() => [2026, 2025, 2024].filter(year => (this.data()?.metadata.years ?? []).includes(year)));
  readonly ticketChartStores = computed(() => {
    const d = this.data();
    const year = this.ticketChartYear();
    return (d?.stores ?? []).filter(store =>
      this.storeAllowedByAccess(store) && this.storeBelongsToSelectedCluster(store)
      && this.formatMatches(store) && this.storeOverlapsPeriod(store, year * 100 + 1, year * 100 + 12)
    ).sort((a, b) => (a.alias || a.store).localeCompare(b.alias || b.store));
  });
  readonly trafficChartLabel = computed(() => this.trafficChartType() === 'METRO' ? 'TRÁFICO METRO' : 'TRÁFICO OTRAS TIENDAS');
  readonly trafficChartStores = computed(() => this.ticketChartStores().filter(store => {
    const isMetro = store.format?.trim().toUpperCase() === 'METRO';
    return this.trafficChartType() === 'METRO' ? isMetro : !isMetro;
  }));
  readonly trafficMonthlyRows = computed(() => {
    this.data();
    const year = this.ticketChartYear();
    const selectedStores = new Set(this.ticketChartSelectedStores());
    const ids = new Set(this.trafficChartStores()
      .filter(store => !selectedStores.size || selectedStores.has(store.storeId))
      .map(store => store.storeId));
    return MONTHS.map((label, index) => {
      const rows = this.indexedRows(this.monthlyStoreIndex, [year * 100 + index + 1], ids);
      const traffic = sum(rows, 'traffic');
      const transactions = sum(rows, 'transactions');
      return { label, traffic, transactions, conversion: traffic > 0 ? transactions / traffic : null };
    });
  });
  readonly trafficChartHasData = computed(() => this.trafficMonthlyRows().some(row => row.traffic > 0));
  readonly trafficMonthlyOption = computed<EChartsOption>(() => {
    const rows = this.trafficMonthlyRows();
    return {
      animation: false,
      grid: { left: 24, right: 24, top: 35, bottom: 30, containLabel: true },
      tooltip: { trigger: 'axis', confine: true, formatter: (params: any) => {
        const row = rows[params[0]?.dataIndex ?? 0];
        return this.tooltip(`${row.label} ${this.ticketChartYear()}`, [
          { label: this.trafficChartLabel(), value: this.number(row.traffic) },
          { label: 'Transacciones', value: this.number(row.transactions) },
          { label: 'Conversión', value: this.percent(row.conversion) },
        ]);
      } },
      xAxis: { type: 'category', data: MONTHS, axisLabel: { color: C.slate } },
      yAxis: { type: 'value', axisLabel: { formatter: (value: number) => this.short(value), color: C.slate }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      series: [{ name: this.trafficChartLabel(), type: 'line', data: rows.map(row => row.traffic),
        connectNulls: false, symbolSize: 8, itemStyle: { color: C.navy },
        lineStyle: { width: 3 }, areaStyle: { color: C.pale, opacity: .5 } }],
    };
  });
  readonly ticketMonthlyRows = computed(() => {
    this.data();
    const year = this.ticketChartYear();
    const selectedStores = new Set(this.ticketChartSelectedStores());
    const ids = new Set(this.ticketChartStores()
      .filter(store => !selectedStores.size || selectedStores.has(store.storeId))
      .map(store => store.storeId));
    return MONTHS.map((label, index) => {
      const rows = this.rowsForPeriods([year * 100 + index + 1], ids);
      const net = sum(rows, 'net');
      const transactions = sum(rows, 'transactions');
      return { label, net, transactions, ticket: transactions > 0 ? net / transactions : null };
    });
  });
  readonly conversionMonthlyRows = computed(() => {
    this.data();
    const year = this.ticketChartYear();
    const selectedStores = new Set(this.ticketChartSelectedStores());
    const ids = new Set(this.ticketChartStores()
      .filter(store => !selectedStores.size || selectedStores.has(store.storeId))
      .map(store => store.storeId));
    return MONTHS.map((label, index) => {
      const rows = this.indexedRows(this.monthlyStoreIndex, [year * 100 + index + 1], ids);
      const transactions = sum(rows, 'transactions');
      const traffic = sum(rows, 'traffic');
      return { label, transactions, traffic, conversion: traffic > 0 ? transactions / traffic : null };
    });
  });
  readonly conversionChartHasData = computed(() => this.conversionMonthlyRows().some(row => row.conversion !== null));
  readonly conversionMonthlyOption = computed<EChartsOption>(() => {
    const rows = this.conversionMonthlyRows();
    return {
      animation: false,
      grid: { left: 24, right: 24, top: 35, bottom: 30, containLabel: true },
      tooltip: { trigger: 'axis', confine: true, formatter: (params: any) => {
        const row = rows[params[0]?.dataIndex ?? 0];
        return this.tooltip(`${row.label} ${this.ticketChartYear()}`, [
          { label: 'Conversión', value: this.percent(row.conversion) },
          { label: 'Transacciones', value: this.number(row.transactions) },
          { label: 'Tráfico', value: this.number(row.traffic) },
        ]);
      } },
      xAxis: { type: 'category', data: MONTHS, axisLabel: { color: C.slate } },
      yAxis: { type: 'value', axisLabel: { formatter: (value: number) => `${Math.round(value * 100)}%` } },
      series: [{ name: 'Conversión', type: 'line', data: rows.map(row => row.conversion),
        connectNulls: false, symbolSize: 8, itemStyle: { color: C.navy },
        lineStyle: { width: 3 }, areaStyle: { color: C.pale, opacity: .5 } }],
    };
  });
  readonly ticketChartHasData = computed(() => this.ticketMonthlyRows().some(row => row.ticket !== null));
  readonly ticketMonthlyExtremes = computed(() => {
    const rows = this.ticketMonthlyRows().filter(row => row.transactions > 0);
    const bounds = (field: 'ticket' | 'transactions' | 'net') => {
      const values = rows.map(row => row[field]).filter((value): value is number => value !== null && Number.isFinite(value));
      return { min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null };
    };
    return { ticket: bounds('ticket'), transactions: bounds('transactions'), net: bounds('net') };
  });
  ticketCellHighlight(field: 'ticket' | 'transactions' | 'net', value: number | null, transactions: number): string {
    if (transactions <= 0 || value === null) return '';
    const bounds = this.ticketMonthlyExtremes()[field];
    if (value === bounds.max && value === bounds.min) return 'ticket-extreme-equal';
    if (value === bounds.max) return 'ticket-extreme-max';
    if (value === bounds.min) return 'ticket-extreme-min';
    return '';
  }
  ticketCellDescription(field: 'ticket' | 'transactions' | 'net', value: number | null, transactions: number): string {
    const highlight = this.ticketCellHighlight(field, value, transactions);
    return highlight === 'ticket-extreme-equal' ? 'Máximo y mínimo (mismo valor)' : highlight === 'ticket-extreme-max' ? 'Máximo de la columna' : highlight === 'ticket-extreme-min' ? 'Mínimo de la columna' : '';
  }
  readonly ticketMonthlyOption = computed<EChartsOption>(() => {
    const rows = this.ticketMonthlyRows();
    return {
      animation: false,
      grid: { left: 24, right: 24, top: 35, bottom: 30, containLabel: true },
      tooltip: { trigger: 'axis', confine: true, formatter: (params: any) => {
        const row = rows[params[0]?.dataIndex ?? 0];
        return this.tooltip(`${row.label} ${this.ticketChartYear()}`, [
          { label: 'Ticket promedio', value: this.money(row.ticket) },
          { label: 'Venta neta', value: this.money(row.net) },
          { label: 'Transacciones', value: this.number(row.transactions) }
        ]);
      } },
      xAxis: { type: 'category', data: MONTHS, axisLabel: { color: C.slate } },
      yAxis: { type: 'value', axisLabel: { formatter: (value: number) => this.money(value, true) } },
      series: [{ name: 'Ticket promedio', type: 'line', data: rows.map(row => row.ticket),
        connectNulls: false, symbolSize: 8, itemStyle: { color: C.navy },
        lineStyle: { width: 3 }, areaStyle: { color: C.pale, opacity: .5 } }]
    };
  });
  openTicketChart(): void {
    this.ticketChartYear.set(this.ticketChartYears()[0] || 2026);
    this.ticketChartSelectedStores.set([]);
    this.toggleChartExpansion('ticket-average');
    requestAnimationFrame(() => document.querySelector('app-root')?.shadowRoot?.querySelector<HTMLSelectElement>('.ticket-year-selector select')?.focus());
  }
  openConversionChart(): void {
    this.ticketChartYear.set(this.ticketChartYears()[0] || 2026);
    this.ticketChartSelectedStores.set([]);
    this.toggleChartExpansion('conversion-average');
  }
  openTrafficChart(type: 'METRO' | 'OTHER'): void {
    this.trafficChartType.set(type);
    this.ticketChartYear.set(this.ticketChartYears()[0] || 2026);
    this.ticketChartSelectedStores.set([]);
    this.toggleChartExpansion('traffic-average');
    requestAnimationFrame(() => document.querySelector('app-root')?.shadowRoot?.querySelector<HTMLSelectElement>('.ticket-year-selector select')?.focus());
  }
  setTicketChartYear(year: number): void {
    this.ticketChartYear.set(year);
    const available = new Set(this.ticketChartStores().map(store => store.storeId));
    this.ticketChartSelectedStores.update(ids => ids.filter(id => available.has(id)));
  }
  toggleTicketChartStore(storeId: string): void {
    this.ticketChartSelectedStores.update(ids => ids.includes(storeId) ? ids.filter(id => id !== storeId) : [...ids, storeId]);
  }
  keepTicketFocus(event: Event): void {
    const key = event as KeyboardEvent;
    const modal = event.currentTarget as HTMLElement;
    const controls = modal.querySelectorAll<HTMLElement>('button:not([disabled]), select, input');
    const first = controls[0], last = controls[controls.length - 1];
    const active = modal.getRootNode() as ShadowRoot;
    if (key.shiftKey && active.activeElement === first) { key.preventDefault(); last.focus(); }
    else if (!key.shiftKey && active.activeElement === last) { key.preventDefault(); first.focus(); }
  }
  readonly year = signal(0);
  // Filtros múltiples. Arreglo vacío = TODOS / ACUMULADO.
  readonly selectedMonths = signal<number[]>([]);
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly categoryView = signal<CategoryView>('RUBRO');
  readonly rankingMetrics = signal<RankingMetric[]>(['ROTATION', 'MARKUP', 'TICKET', 'SALE_M2']);
  readonly selectedStores = signal<string[]>([]);
  readonly selectedCategories = signal<string[]>([]);
  readonly selectedGenders = signal<string[]>([]);
  readonly selectedLines = signal<string[]>([]);
  readonly selectedSublines = signal<string[]>([]);
  readonly openFilter = signal<FilterKey | null>(null);
  readonly filtersOpen = signal(false);
  readonly reactFiltersEnabled = !!readRuntimeConfig().reactModules?.includes('filters')
    && typeof window !== 'undefined' && typeof window.mountReactCommercialFilters === 'function';
  readonly reactTalentPageEnabled = !!readRuntimeConfig().reactModules?.includes('talent-page')
    && typeof window !== 'undefined' && typeof window.mountReactCommercialModule === 'function';
  readonly reactCommercialPageEnabled = !!readRuntimeConfig().reactModules?.includes('commercial-page')
    && typeof window !== 'undefined' && typeof window.mountReactCommercialModule === 'function';
  readonly reactInventoryPageEnabled = !!readRuntimeConfig().reactModules?.includes('inventory-page')
    && typeof window !== 'undefined' && typeof window.mountReactCommercialModule === 'function';
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
  readonly sectionAdviceEnabled = computed(() => ['gerente_comercial', 'jefe_comercial', 'jefe_zonal', 'coach']
    .includes(this.cloud.accessProfile()?.roleCode || ''));
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
  readonly healthyCoverageDays = signal(90);
  readonly healthyCoverageUnit = signal<PredictiveTimeUnit>('MONTHS');
  readonly overstockDays = signal(120);
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
    this.invalidateSellerDetailForMonth();
    this.invalidatePriceRangeDetailForMonth();
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
    this.invalidateSellerDetail();
    this.invalidatePriceRangeDetail();
    this.invalidateBrandDetail();
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
    this.invalidateSellerDetail();
    this.invalidatePriceRangeDetail();
    this.invalidateBrandDetail();
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
    this.invalidateSellerDetail();
    this.invalidatePriceRangeDetail();
    this.invalidateBrandDetail();
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
  readonly sizeSalesPeriod = computed(() => this.year() * 100 + (this.selectedMonths().at(-1) || this.selectedMonth()));
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
    if (this.selectedSublines().length) {
      this.sublineDetailLoaded();
      return this.monthlySublineIndex;
    }
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
      try {
        const payload = await this.loadDetail<{ dailyCompact: DailyCompact }>(`dashboard-daily-compact-${key}.json`);
        detail = decodeDailyCompact<Monthly, HourlySalesRow>(payload.dailyCompact);
      } catch {
        // Publicaciones anteriores tienen el detalle mensual sin codificar.
      }
      if (!detail && !this.cloud.remoteEnabled()) {
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
    const configuredGoals = this.storeGoalOverrides();
    const overrides = new Map(configuredGoals.filter(row => !row.category).map(row => [`${row.periodId}|${row.storeId}`, row.target]));
    const officialFor = (period: number, storeId: string) => {
      const key = `${period}|${storeId}`;
      return overrides.has(key) ? overrides.get(key)! : sum(this.monthlyStoreIndex.get(key) || [], 'target');
    };
    const official = periods.reduce((total, period) => total + [...storeIds].reduce((subtotal, storeId) => subtotal + officialFor(period, storeId), 0), 0);
    const hierarchyActive = this.selectedCategories().length || this.selectedGenders().length || this.selectedLines().length || this.selectedSublines().length;
    if (!hierarchyActive) {
      const corporateTarget = this.annualGoalOverrides().find(row => row.year === this.year())?.target;
      return corporateTarget != null && this.isFullCompanyScope() && this.isFullYear(periods)
        ? corporateTarget
        : official;
    }
    const configuredCategoryGoals = configuredGoals.filter(row => row.category && periods.includes(row.periodId) && storeIds.has(row.storeId));
    const configuredKeys = new Set(configuredCategoryGoals.map(row => `${row.periodId}|${row.storeId}|${this.normalized(row.category)}`));
    const direct = this.indexedRows(this.monthlyCategoryTargetIndex, periods, storeIds)
      .filter(row => !configuredKeys.has(`${row.periodId}|${row.storeId}|${this.normalized(row.category)}`))
      .concat(configuredCategoryGoals.map(row => ({ periodId: row.periodId, storeId: row.storeId, category: row.category!, target: row.target, source: 'DEFINIDA' as const })));
    const categorySales = this.indexedRows(this.monthlyCategoryIndex, periods, storeIds);
    const selectedSales = this.currentDimensionFilter(this.indexedRows(this.currentDimensionIndex(), periods, storeIds));
    const byKey = grouped(direct, row => `${row.periodId}|${row.storeId}`);
    const categorySalesByKey = grouped(categorySales, row => `${row.periodId}|${row.storeId}`);
    const selectedSalesByKey = grouped(selectedSales, row => `${row.periodId}|${row.storeId}`);
    let total = 0;
    for (const period of periods) for (const storeId of storeIds) {
      const key = `${period}|${storeId}`;
      const officialTarget = officialFor(period, storeId);
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
  readonly headerModel = computed<DashboardHeaderModel>(() => ({
    title: `DASHBOARD EJECUTIVO COMERCIAL ${this.year()} · ${this.selectedMonths().length ? `PERÍODO ${this.monthFilterLabel()}` : `CIERRE ${this.monthNamesFull[this.selectedMonth() - 1]}`}`,
    cutoffDate: this.formatDate(this.data()?.metadata.salesCutoff),
    version: this.cloud.dataVersion(),
    storeSummary: this.cloud.accessProfile()?.scopeType === 'all' ? this.annualStoreSummary() : null,
    showLogout: this.cloud.remoteEnabled() && !this.cloud.portalEnabled,
    userName: this.cloud.userName(),
  }));

  readonly filtersModel = computed<DashboardFiltersModel>(() => ({
    open: this.filtersOpen(), year: this.year(), years: (this.data()?.metadata.years ?? []).filter(y => y >= 2024),
    openFilter: this.openFilter(), search: this.filterSearch(), monthNames: this.monthNamesFull,
    selected: {
      month: this.selectedMonths(), cluster: this.selectedClusters(), format: this.selectedFormats(),
      store: this.selectedStores(), category: this.selectedCategories(), gender: this.selectedGenders(),
      line: this.selectedLines(), subline: this.selectedSublines(),
    },
    options: {
      month: this.searchedMonths(), cluster: this.searchedClusters(), format: this.searchedFormats(),
      store: this.searchedStores(), category: this.searchedCategories(), gender: this.genderOptions(),
      line: this.searchedLines(), subline: this.searchedSublines(),
    },
    labels: {
      month: this.monthFilterLabel(), cluster: this.clusterFilterLabel(), format: this.formatFilterLabel(),
      store: this.storeFilterLabel(), category: this.categoryFilterLabel(), gender: this.genderFilterLabel(),
      line: this.lineFilterLabel(), subline: this.sublineFilterLabel(),
    },
    storeLocked: this.storeFilterLocked(), clusterLocked: this.clusterFilterLocked(), genderEnabled: this.genderFilterEnabled(),
    dayEnabled: this.dayFilterEnabled(), dateRangeActive: this.dateRangeActive(), dayLabel: this.dayFilterLabel(),
    calendarOpen: this.calendarOpen(), calendarTitle: this.dayFilterEnabled() ? `${this.monthNamesFull[this.selectedMonths()[0] - 1]} ${this.year()}` : '',
    calendarDays: this.calendarDays(), fromDate: this.fromDate(), toDate: this.toDate(),
    dayLoading: this.dayFilterLoading(), dayError: this.dayFilterError(),
  }));

  readonly primaryKpiModel = computed<Record<string, unknown>>(() => {
    const metrics = this.metrics();
    const gap = this.accumulatedGap();
    return { cards: [
      { label: 'META', className: 'meta-kpi', title: 'Fórmula: suma de las metas mensuales del año para las tiendas, rubros y demás filtros aplicables.', value: this.money(metrics.annualTarget, true) },
      { label: 'VENTA BRUTA', className: 'gross-kpi', title: 'Fórmula: Σ(precio sugerido × cantidad) de las ventas positivas del período filtrado.', value: this.money(metrics.gross, true) },
      { label: 'NOTAS DE CRÉDITO', title: 'Fórmula: Σ(importe de notas de crédito) del período filtrado.', value: this.money(metrics.notes, true) },
      { label: 'DESCUENTO TOTAL', title: 'Fórmula: Σ(descuento aplicado) del período filtrado.', value: this.money(metrics.discount, true) },
      { label: 'VENTA NETA', className: 'net-kpi', title: 'Fórmula: Σ(importe neto de las ventas registradas), incluidas las notas de crédito. No se obtiene restando directamente a la venta bruta sugerida.', value: this.money(metrics.net, true) },
      { label: 'PROYECCIÓN CIERRE', className: 'projection-kpi', title: 'Fórmula: promedio ponderado del pronóstico YTD, histórico estacional y ritmo diario anualizado; el factor de crecimiento reciente ajusta los meses pendientes.', value: this.money(metrics.projectedClose, true) },
      { label: 'BRECHA ACUMULADA', className: 'projection-meta-kpi', title: 'Fórmula: meta anual − proyección de cierre. Una brecha positiva indica venta proyectada por debajo de la meta.', value: `${gap != null && gap <= 0 ? '▲ ' : '▼ '}${this.money(Math.abs(gap || 0), true)}`, valueClass: (gap || 0) <= 0 ? 'positive' : 'negative' },
      { label: 'VENTA PROMEDIO DIARIA', className: 'featured-kpi daily-average-kpi', title: 'Fórmula: venta neta del período filtrado ÷ días calendario correspondientes (hasta el día de corte en un mes parcial).', value: this.money(metrics.dailyAverage, true) },
    ] };
  });

  readonly keyKpiModel = computed<Record<string, unknown>>(() => {
    const metrics = this.metrics();
    const locked = this.storeFilterLocked();
    const format = this.filteredStores()[0]?.format?.toUpperCase();
    const actions = [];
    if (!locked || format === 'METRO') actions.push({ label: 'TRÁFICO METRO', className: 'ticket-kpi traffic-kpi', title: 'Ver evolución mensual del tráfico de tiendas METRO', action: 'trafficMetro', value: this.number(metrics.trafficMetro), valueClass: metrics.trafficMetro == null ? 'missing' : '' });
    if (!locked || format !== 'METRO') actions.push({ label: 'TRÁFICO OTRAS TDS.', className: 'ticket-kpi traffic-kpi', title: 'Ver evolución mensual del tráfico de otras tiendas', action: 'trafficOther', value: this.number(metrics.trafficOther), valueClass: metrics.trafficOther == null ? 'missing' : '' });
    actions.push({ label: 'CONVERSIÓN', className: 'ticket-kpi conversion-kpi', title: 'Fórmula: transacciones ÷ tráfico × 100. Ver evolución mensual', action: 'conversion', value: this.percent(metrics.conversion), valueClass: '' });
    actions.push({ label: 'TICKET PROMEDIO', className: 'ticket-kpi', title: 'Ver ticket promedio por mes', action: 'ticket', value: this.money(metrics.ticket), valueClass: '' });
    return {
      actions, saleM2: this.money(metrics.saleM2), personnel: this.number(metrics.personnel),
      saleCollaborator: this.money(metrics.saleCollaborator, true), saleCollaboratorMissing: metrics.saleCollaborator == null,
      markup: this.trend(metrics.priceVariation), markupPositive: (metrics.priceVariation || 0) >= 0,
      sellThroughStock: metrics.sellThroughStock ? this.number(metrics.sellThroughStock, ' und') : '',
      sellThrough: this.percent(metrics.sellThrough), sellThroughMissing: metrics.sellThrough == null,
    };
  });

  readonly progressModel = computed<Record<string, unknown>>(() => {
    const metrics = this.metrics();
    const advance = this.advanceMetrics();
    const monthlyContext = this.monthlyContextLabel();
    return {
      monthlyContext,
      annual: {
        actualGrow: Math.max(.12, Math.min(1, advance.annualPct || 0)),
        actualPct: this.percent(advance.annualPct), actualValue: this.money(advance.net, true),
        remainingGrow: Math.max(.12, 1 - Math.min(1, advance.annualPct || 0)),
        remainingPct: this.percent(advance.annualPct == null ? null : Math.max(0, 1 - advance.annualPct)),
        remainingValue: this.money(advance.annualTarget ? Math.max(0, advance.annualTarget - advance.net) : null, true),
      },
      monthly: {
        actualGrow: Math.max(.12, Math.min(1, metrics.monthlyPct || 0)),
        actualPct: this.percent(metrics.monthlyPct), actualValue: this.money(metrics.monthNet, true),
        remainingGrow: Math.max(.12, 1 - Math.min(1, metrics.monthlyPct || 0)),
        remainingPct: metrics.monthlyPct == null ? 'N/A' : this.percent(Math.min(0, metrics.monthlyPct - 1)),
        remainingValue: this.money(metrics.monthTarget ? Math.max(0, metrics.monthTarget - metrics.monthNet) : null, true),
      },
      annualRows: [
        { label: `META ANUAL ${this.year()}`, value: this.money(metrics.annualTarget, true) },
        { label: `REAL ${this.annualContextLabel()}`, value: this.money(metrics.net, true) },
        { label: 'CUMPL. META ANUAL', value: this.percent(metrics.annualPct) },
        { label: this.annualVariationLabel(), title: `Compara con ${this.annualPreviousContextLabel()}`, value: this.trend(metrics.annualGrowth), valueClass: (metrics.annualGrowth || 0) >= 0 ? 'positive' : 'negative' },
      ],
      monthlyRows: [
        { label: `META ${monthlyContext}`, value: this.money(metrics.monthTarget, true) },
        { label: `REAL ${monthlyContext}`, value: this.money(metrics.monthNet, true) },
        { label: 'CUMPL. META', value: this.percent(metrics.monthlyPct) },
        { label: this.monthlyVariationLabel(), value: this.trend(metrics.monthVariation), valueClass: (metrics.monthVariation || 0) >= 0 ? 'positive' : 'negative' },
      ],
    };
  });

  readonly talentKpiModel = computed<Record<string, unknown>>(() => {
    const metrics = this.metrics();
    const profile = this.talentProfileSummary();
    const personnel = metrics.personnel == null ? 'N/A' : this.number(Math.round(metrics.personnel));
    return {
      personnel, personnelMissing: metrics.personnel == null,
      saleCollaborator: this.money(metrics.saleCollaborator, true), saleCollaboratorMissing: metrics.saleCollaborator == null,
      gender: `${this.number(profile.male)} / ${this.number(profile.female)}`,
      averageAge: this.number(profile.averageAge, ' años'), salesStaff: this.number(profile.salesStaff),
      administrativeStaff: this.number(profile.administrativeStaff),
      topStore: this.talentStoreRows()[0]?.alias || 'N/A', birthdays: this.number(this.birthdayMonthRows().length),
    };
  });

  readonly talentCapacityModel = computed<Record<string, unknown>>(() => ({
    storeLocked: this.storeFilterLocked(),
    rows: this.talentStoreRows().slice(0, 10).map(row => ({
      alias: row.alias, baseStaff: this.number(row.baseStaff), campaignStaff: this.number(row.campaignStaff),
      staff: this.number(row.staff), gap: `${row.gap > 0 ? '+' : ''}${this.number(row.gap)}`,
      gapPositive: row.gap >= 0, productivity: this.money(row.productivity, true),
    })),
  }));

  readonly birthdayModalModel = computed<Record<string, unknown>>(() => ({
    month: this.monthNamesFull[this.selectedMonth() - 1]?.toUpperCase() || '',
    rows: this.birthdayMonthRows(),
  }));

  readonly growthCardModel = computed<Record<string, unknown>>(() => ({ option: blackChartText(this.growthOption()) }));
  readonly metaVsRealCardModel = computed<Record<string, unknown>>(() => ({
    moduleId: 'meta-vs-real-card', cardClass: 'meta-vs-real', icon: 'comparison', title: 'AVANCE META VS REAL',
    chartId: 'meta-vs-real', label: 'Venta real y meta por mes', ready: this.storeGoalsReady(),
    loadingText: 'Cargando metas…', option: this.storeGoalsReady() ? blackChartText(this.metaVsRealOption()) : null,
  }));
  readonly hourlyCardModel = computed<Record<string, unknown>>(() => ({
    moduleId: 'hourly-card', cardClass: 'hourly-performance-card', icon: 'trend', title: 'DESEMPEÑO COMERCIAL POR HORA',
    chartId: 'hourly-performance', label: 'Afluencia de tickets y venta neta por hora', ready: true,
    option: blackChartText(this.hourlyPerformanceOption()),
  }));
  readonly talentHistoryCardModel = computed<Record<string, unknown>>(() => ({
    moduleId: 'talent-history-card', baseClasses: 'card talent-card', cardClass: 'history-card',
    icon: 'calendar', title: `EVOLUCIÓN MENSUAL DE PERSONAL · ${this.year()}`,
    chartId: 'talent-history', label: 'Cantidad real y esperada de personal por mes', ready: true,
    option: blackChartText(this.talentHistoryOption()),
  }));
  readonly talentTeamCardModel = computed<Record<string, unknown>>(() => ({
    moduleId: 'talent-team-card', baseClasses: 'card talent-card', cardClass: 'team-productivity-card',
    icon: 'comparison', title: 'VENTA PROM. × COLAB. POR EQUIPO',
    chartId: 'talent-team-productivity', label: 'Venta mensual promedio por colaborador de cada equipo comercial', ready: true,
    option: blackChartText(this.talentTeamProductivityOption()),
  }));
  readonly talentAreaCardModel = computed<Record<string, unknown>>(() => ({
    moduleId: 'talent-area-card', baseClasses: 'card talent-card', cardClass: 'area-distribution-card',
    icon: 'category', title: 'DISTRIBUCIÓN DEL EQUIPO POR ÁREA',
    chartId: 'talent-area-distribution', label: 'Distribución de colaboradores por área', ready: true,
    option: blackChartText(this.talentAreaOption()),
  }));
  readonly talentStoreCardModel = computed<Record<string, unknown>>(() => ({
    moduleId: 'talent-store-card', baseClasses: 'card talent-card', cardClass: 'store-productivity-card',
    icon: 'gauge', title: 'PRODUCTIVIDAD POR TIENDA',
    chartId: 'talent-store-productivity', label: 'Venta por colaborador de las tiendas con mayor productividad', ready: true,
    option: blackChartText(this.talentStoreProductivityOption()),
  }));
  readonly talentExitCardModel = computed<Record<string, unknown>>(() => ({
    moduleId: 'talent-exit-card', baseClasses: 'card talent-card', cardClass: 'exit-card',
    icon: 'rotate', title: 'RETIROS POR MOTIVO',
    chartId: 'talent-exit', label: 'Retiros por motivo registrado', ready: true,
    option: blackChartText(this.talentExitOption()),
  }));
  readonly talentIncidentsCardModel = computed<Record<string, unknown>>(() => ({
    moduleId: 'talent-incidents-card', baseClasses: 'card talent-card', cardClass: 'incidents-card',
    icon: 'alert', title: 'INCIDENCIAS EXTERNAS Y TERCEROS',
    chartId: 'talent-incidents', label: 'Distribución de problemas externos', ready: true,
    option: blackChartText(this.talentIncidentsOption()),
  }));
  readonly talentTrainingCardModel = computed<Record<string, unknown>>(() => ({
    expanded: this.expandedChart() === 'training-progress', storeLocked: this.storeFilterLocked(),
    audience: this.trainingAudience(),
    label: this.storeFilterLocked() ? 'Cursos pendientes de vendedores' : this.trainingAudience() === 'SELLERS' ? 'Avance de cursos para vendedores' : 'Avance de cursos para administradores',
    option: blackChartText(this.selectedTrainingOption()),
  }));

  onReactTrainingAction({ type, value }: { type: string; value?: string | number }): void {
    if (type === 'expand') this.toggleChartExpansion('training-progress');
    else if (type === 'audience' && !this.storeFilterLocked() && (value === 'SELLERS' || value === 'ADMINISTRATORS')) this.trainingAudience.set(value);
  }

  onReactBirthdayAction({ type }: { type: string }): void {
    if (type === 'close') this.closeExpandedChart();
  }

  onReactTalentKpiAction({ type }: { type: string }): void {
    if (type === 'birthdays') this.toggleChartExpansion('birthday-list');
  }

  readonly sizeControlsModel = computed<Record<string, unknown>>(() => ({
    rubro: this.sizeRubro(), metric: this.sizeMetric(), system: this.shoeSizeSystem(),
  }));
  readonly sizeCardModel = computed<Record<string, unknown>>(() => {
    const rubro = this.sizeRubro(); const metric = this.sizeMetric();
    const transferError = metric === 'TRANSFERS' ? this.stockTransfersError() : '';
    const loading = !transferError && (metric === 'SALES' ? this.sizeSalesLoading()
      : !this.stockDetailLoaded() && (!this.sizeDetailLoaded()[rubro] || (metric === 'TRANSFERS' && !this.stockTransfersLoaded())));
    const coverage = this.sizeChartCoverage(); const noRows = !this.sizeChartRows().length;
    return {
      expanded: this.expandedChart() === 'size-distribution', rubro, metric,
      controls: this.sizeControlsModel(), loading, transferError, productCodeLoading: this.productCodeLoading(),
      textilEmpty: rubro === 'TEXTIL' && noRows, codeError: this.transferCodeError(), noRows,
      label: `${this.sizeMetricLabel()} por talla ${rubro.toLowerCase()} · corte ${this.sizeSalesPeriod()}`,
      periodLabel: this.periodLabel(this.sizeSalesPeriod()), stockCutoff: this.formatDate(this.data()?.metadata.stockCutoff || ''),
      option: loading ? null : blackChartText(this.sizeDistributionOption()),
      coverage: { total: this.number(coverage.total), mapped: this.number(coverage.mapped),
        pending: this.number(coverage.pending), pendingRaw: coverage.pending },
    };
  });

  readonly sizeDetailModel = computed<Record<string, unknown>>(() => {
    const size = this.sizeDetailSelected(); const rubro = this.sizeRubro(); const system = this.shoeSizeSystem();
    const rows = new Map<string, { brand: string; product: string; code: string; sales: number; stock: number }>();
    const add = (row: { storeId: string; productId: string; productCode?: string; product?: string; brand?: string; category?: string; line?: string }, field: 'sales' | 'stock', value: number) => {
      if (resolveProductSize(row, rubro, system)?.label !== size) return;
      const brand = row.brand || 'SIN MARCA'; const key = `${brand}|${row.productId}`;
      const current = rows.get(key) || { brand, product: row.product || row.productId, code: row.productCode || '', sales: 0, stock: 0 };
      current[field] += Number(value) || 0; rows.set(key, current);
    };
    for (const row of this.sizeProductsForChart(rubro)) add(row, 'stock', row.stockUnits);
    if (this.sizeSalesLoadedKey() === `${this.sizeSalesPeriod()}-${rubro}`) {
      for (const row of this.sizeSalesData()) if (this.filteredStoreIds().has(row.storeId) && this.categoryMatches(row.category) && this.lineMatches(row.line) && this.sublineMatches(row.subline)) add(row, 'sales', row.units90);
    } else if (this.sizeSalesLoadedKey() === 'legacy') {
      for (const row of this.sizeProductsForChart(rubro)) add(row, 'sales', row.units90 ?? row.units30);
    }
    const detail = [...rows.values()].sort((a, b) => a.brand.localeCompare(b.brand, 'es') || b.sales - a.sales || a.product.localeCompare(b.product, 'es'));
    const brandGroups = [...grouped(detail, row => row.brand)].map(([brand, products]) => ({
      brand, count: products.length, sales: this.number(products.reduce((total, row) => total + row.sales, 0), ' und'),
      stock: this.number(products.reduce((total, row) => total + row.stock, 0), ' und'),
      rows: products.map(row => ({ ...row, sales: this.number(row.sales, ' und'), stock: this.number(row.stock, ' und') })),
    }));
    return { size, rubro, system, loading: !this.sizeDetailLoaded()[rubro] && !this.stockDetailLoaded(),
      period: this.periodLabel(this.sizeSalesPeriod()), stockCutoff: this.formatDate(this.data()?.metadata.stockCutoff || ''),
      totalSales: this.number(detail.reduce((total, row) => total + row.sales, 0), ' und'),
      totalStock: this.number(detail.reduce((total, row) => total + row.stock, 0), ' und'),
      rows: detail, brandGroups };
  });

  readonly storeValueCardModel = computed<Record<string, unknown>>(() => {
    const ready = this.stockHierarchyLoaded() || this.stockDetailLoaded();
    return {
      ready, expanded: this.expandedChart() === 'store-value-coverage',
      option: ready ? blackChartText(this.storeValueCoverageOption()) : null,
      health: this.inventoryHealthSummary(), matrix: this.stockMatrixModel(),
    };
  });

  readonly categoryCardModel = computed<Record<string, unknown>>(() => ({
    expanded: this.expandedChart() === 'category', view: this.categoryView(),
    option: blackChartText(this.categoryOption()),
    rows: this.categorySummary().map(row => ({ name: row.name, net: this.money(row.net, true),
      share: this.percent(row.share), units: this.number(row.units), topLine: row.topLine, color: row.color })),
  }));

  onReactCategoryAction({ type, value }: { type: string; value?: string | number }): void {
    if (type === 'expand') this.toggleChartExpansion('category');
    else if (type === 'view' && (value === 'RUBRO' || value === 'LINEA')) this.categoryView.set(value);
  }

  readonly brandCardModel = computed<Record<string, unknown>>(() => ({
    expanded: this.expandedChart() === 'brand', option: blackChartText(this.brandOption()),
    rows: this.brandSummary().map(row => ({ name: row.name, net: this.money(row.net, true),
      share: this.percent(row.share), units: this.number(row.units) })),
  }));

  onReactBrandAction({ type }: { type: string }): void {
    if (type === 'expand') this.toggleChartExpansion('brand');
  }

  readonly rankingCardModel = computed<Record<string, unknown>>(() => ({
    countLabel: this.rankingStoreCountLabel(), metrics: this.rankingMetrics(),
    option: blackChartText(this.rankingOption()),
  }));

  onReactRankingAction({ type, value }: { type: string; value?: string | number }): void {
    if (type === 'metric' && (value === 'ROTATION' || value === 'MARKUP' || value === 'TICKET' || value === 'SALE_M2')) this.toggleRankingMetric(value);
  }

  readonly genderCardModel = computed<Record<string, unknown>>(() => ({
    expanded: this.expandedChart() === 'gender', rubros: this.genderRubros(),
    donut: blackChartText(this.genderOption()), bar: blackChartText(this.genderBarOption()),
  }));

  onReactGenderAction({ type, value }: { type: string; value?: string | number }): void {
    if (type === 'expand') this.toggleChartExpansion('gender');
    else if (type === 'rubro' && (value === 'TEXTIL' || value === 'CALZADO')) this.toggleGenderRubro(value);
  }

  readonly priceRangeCardModel = computed<Record<string, unknown>>(() => ({
    expanded: this.expandedChart() === 'price-range', year: this.year(),
    years: this.priceRangeComparisonYears(), comparisonYear: this.effectivePriceRangeComparisonYear(),
    ready: this.priceRangeDetailLoaded(), option: this.priceRangeDetailLoaded() ? blackChartText(this.priceRangeOption()) : null,
    rows: this.priceRangeSummary().map(row => ({ label: row.label, year: row.year,
      net: this.money(row.net, true), share: this.percent(row.share),
      units: this.number(row.units), averagePrice: this.money(row.averagePrice) })),
  }));

  onReactPriceRangeAction({ type, value }: { type: string; value?: string | number }): void {
    if (type === 'expand') this.toggleChartExpansion('price-range');
    else if (type === 'year' && value != null) this.setPriceRangeComparisonYear(value);
  }

  readonly rotationCardModel = computed<Record<string, unknown>>(() => {
    const totals = this.inventoryOverviewTotals();
    return {
      view: this.rotationView(), hierarchyReady: this.stockHierarchyLoaded() && this.stockHierarchyData().length > 0,
      ready: this.stockHierarchyLoaded() || this.stockDetailLoaded(),
      rotationOption: this.rotationView() === 'rotation' && (this.stockHierarchyLoaded() || this.stockDetailLoaded()) ? blackChartText(this.rotationOption()) : null,
      capacityOption: this.rotationView() === 'inventory' ? blackChartText(this.inventoryOverviewOption()) : null,
      occupancy: this.percent(totals.capacity ? totals.units / totals.capacity : null),
      areas: this.inventoryAreaSummary().map(area => ({ area: area.area, color: area.color, share: this.percent(area.share) })),
      stockValue: this.money(totals.value, true), overCapacity: totals.capacity - totals.units < 0,
      capacityDifference: this.number(Math.abs(totals.capacity - totals.units), ' und'),
    };
  });

  onReactRotationAction({ type, value }: { type: string; value?: string | number }): void {
    if (type === 'view' && (value === 'rotation' || value === 'inventory')) this.rotationView.set(value);
  }

  readonly antiquityCardModel = computed<Record<string, unknown>>(() => {
    const summary = this.stockHistorySummary(); const selected = this.stockHistoryBucketsSelected();
    return {
      expanded: this.expandedChart() === 'antiquity', ready: this.stockOriginLoaded(),
      detailLoading: this.detailLoading(), label: this.stockHistoryLabel(),
      buckets: this.stockHistoryBuckets.map(bucket => ({ ...bucket,
        active: bucket.value === 'ALL' ? selected.length === 0 : selected.includes(bucket.value) })),
      option: blackChartText(this.antiquityOption()),
      summary: { units: this.number(summary.units, ' und'), value: this.money(summary.value, true), share: this.percent(summary.share) },
    };
  });

  onReactAntiquityAction({ type, value }: { type: string; value?: string | number }): void {
    if (type === 'expand') this.toggleChartExpansion('antiquity');
    else if (type === 'bucket' && typeof value === 'string') this.toggleStockHistoryBucket(value as StockHistoryBucket);
    else if (type === 'detail' && typeof value === 'number') this.openStockOriginDetail({ data: { period: value } });
  }

  readonly healthCardModel = computed<Record<string, unknown>>(() => ({
    option: blackChartText(this.predictiveHealthOption()),
    rows: this.predictiveHealthRows().map(row => ({ status: row.status, color: row.color,
      value: this.money(row.value, true), share: this.percent(row.share) })),
  }));

  readonly projectionCardModel = computed<Record<string, unknown>>(() => ({
    horizon: this.coverageProjectionHorizon(), option: blackChartText(this.predictiveProjectionOption()),
    rows: this.predictiveProjectionRows().map(row => ({ status: row.status, color: row.color,
      value: this.money(row.value, true), share: this.percent(row.share), products: this.number(row.products) })),
    products: this.predictivePriorityProducts().map(row => ({ storeId: row.storeId, product: row.product,
      store: row.store, coverageDays: row.coverageDays, coverage: this.number(row.coverageDays, ' días'),
      color: this.predictiveStatusColor(row.status) })),
  }));

  onReactProjectionAction({ type, value }: { type: string; value?: string | number }): void {
    if (type === 'horizon' && (value === 0 || value === 30 || value === 60 || value === 90)) this.coverageProjectionHorizon.set(value);
  }

  readonly replenishmentCardModel = computed<Record<string, unknown>>(() => ({
    expanded: this.expandedChart() === 'predictive-replenishment',
    option: blackChartText(this.predictiveReplenishmentOption()),
    rows: this.predictiveReplenishmentRows().map(row => ({ name: row.name,
      priority: row.priority, color: row.priorityColor,
      deficitUnits: this.number(row.deficitUnits, ' und'),
      coverage: row.coverageDays == null ? 'SIN MOVIMIENTO' : this.number(row.coverageDays, ' días'),
      vendibleUnits: this.number(row.vendibleUnits, ' und') })),
  }));

  onReactReplenishmentAction({ type }: { type: string }): void {
    if (type === 'expand') this.toggleChartExpansion('predictive-replenishment');
  }

  readonly predictiveParametersModel = computed<Record<string, unknown>>(() => ({
    rubros: this.predictiveRubros(), storeLocked: this.storeFilterLocked(),
    store: this.predictiveStore(), lockedStore: this.predictiveStoreOptions()[0]?.store,
    stores: this.predictiveStoreOptions().map(store => ({ id: store.storeId, label: store.alias || store.store })),
    demand: { value: this.timeValue(this.demandWindow(), this.demandWindowUnit()), unit: this.demandWindowUnit() },
    healthy: { value: this.timeValue(this.healthyCoverageDays(), this.healthyCoverageUnit()), unit: this.healthyCoverageUnit() },
    overstock: { value: this.timeValue(this.overstockDays(), this.overstockUnit()), unit: this.overstockUnit() },
    noMovement: { value: this.monthTimeValue(this.noMovementMonths(), this.noMovementUnit()), unit: this.noMovementUnit() },
    merma: this.predictiveMermaPct(),
  }));

  onReactPredictiveParametersAction({ type, value }: { type: string; value?: string | number }): void {
    if (type === 'rubro' && typeof value === 'string') this.togglePredictiveRubro(value);
    else if (type === 'store' && typeof value === 'string') this.predictiveStore.set(value);
    else if (type === 'demand-value') this.setDemandWindowValue(Number(value));
    else if (type === 'healthy-value') this.setHealthyCoverageValue(Number(value));
    else if (type === 'overstock-value') this.setOverstockValue(Number(value));
    else if (type === 'no-movement-value') this.setNoMovementValue(Number(value));
    else if (type === 'merma') this.setPredictiveMerma(Number(value));
    else if ((type === 'demand-unit' || type === 'healthy-unit' || type === 'overstock-unit' || type === 'no-movement-unit')
      && (value === 'MONTHS' || value === 'YEARS')) {
      if (type === 'demand-unit') this.demandWindowUnit.set(value);
      else if (type === 'healthy-unit') this.healthyCoverageUnit.set(value);
      else if (type === 'overstock-unit') this.overstockUnit.set(value);
      else this.noMovementUnit.set(value);
    }
  }

  sectionHeadingModel(id: string): Record<string, unknown> {
    const heading = SECTION_HEADINGS[id];
    return { id, kind: heading.section ? 'block' : 'page', mark: heading.mark,
      title: heading.title, section: heading.section, adviceEnabled: this.sectionAdviceEnabled(),
      advice: heading.section ? this.sectionAdviceFor(id) : null,
      transferVisible: id === 'inventory-b', predictive: id === 'inventory-c' };
  }

  onReactSectionHeadingAction({ type, value }: { type: string; value?: string | number }): void {
    if (type === 'transfers') this.openTransfers();
    else if (type === 'advice' && typeof value === 'string') {
      const section = SECTION_HEADINGS[value]?.section;
      if (typeof section === 'string') void this.requestSectionAdvice(value, section);
    }
  }

  commercialAccessModel(mode: string): Record<string, unknown> {
    return { mode, error: mode === 'error' ? this.loadingError() : this.cloud.authError(),
      email: this.loginEmail(), password: this.loginPassword(), busy: this.loginBusy() };
  }

  onReactCommercialAccessAction({ type, value }: { type: string; value?: string | number }): void {
    if (type === 'identity' && typeof value === 'string') this.loginEmail.set(value);
    else if (type === 'password' && typeof value === 'string') this.loginPassword.set(value);
    else if (type === 'login') void this.signIn();
    else if (type === 'retry') this.retryDashboardLoad();
  }

  readonly sellerCardModel = computed<Record<string, unknown>>(() => ({
    expanded: this.expandedChart() === 'seller-ranking', ready: this.sellerDetailLoaded(),
    loading: this.sellerDetailLoading(),
    option: this.sellerDetailLoading() ? null : blackChartText(this.sellerPerformanceOption()),
    rows: this.talentSellerRows().map(row => ({ seller: row.seller,
      net: this.money(row.net, true), units: this.number(row.units), transactions: this.number(row.transactions) })),
  }));

  onReactSellerAction({ type }: { type: string }): void {
    if (type === 'expand') this.toggleChartExpansion('seller-ranking');
  }

  readonly talentPageModel = computed<Record<string, unknown>>(() => ({
    operationalSummaryReady: !!this.operationalSummary(),
    headings: {
      talent: this.sectionHeadingModel('talent'), a: this.sectionHeadingModel('talent-a'),
      b: this.sectionHeadingModel('talent-b'), c: this.sectionHeadingModel('talent-c'),
    },
    kpis: this.talentKpiModel(), capacity: this.talentCapacityModel(),
    history: this.talentHistoryCardModel(), team: this.talentTeamCardModel(),
    seller: this.sellerCardModel(), area: this.talentAreaCardModel(),
    store: this.talentStoreCardModel(), training: this.talentTrainingCardModel(),
    exit: this.talentExitCardModel(), incidents: this.talentIncidentsCardModel(),
  }));

  onReactTalentPageAction({ source, type, value }: { source?: string; type: string; value?: string | number }): void {
    const action = { type, value };
    if (source === 'section') this.onReactSectionHeadingAction(action);
    else if (source === 'kpis') this.onReactTalentKpiAction(action);
    else if (source === 'seller') this.onReactSellerAction(action);
    else if (source === 'training') this.onReactTrainingAction(action);
  }

  readonly commercialPageModel = computed<Record<string, unknown>>(() => ({
    headings: {
      commercial: this.sectionHeadingModel('commercial'), a: this.sectionHeadingModel('commercial-a'),
      b: this.sectionHeadingModel('commercial-b'), c: this.sectionHeadingModel('commercial-c'),
      d: this.sectionHeadingModel('commercial-d'),
    },
    primary: this.primaryKpiModel(), key: this.keyKpiModel(), progress: this.progressModel(),
    meta: this.metaVsRealCardModel(), category: this.categoryCardModel(), brand: this.brandCardModel(),
    hourly: this.hourlyCardModel(), ranking: this.rankingCardModel(), gender: this.genderCardModel(),
    growth: this.growthCardModel(), price: this.priceRangeCardModel(),
  }));

  onReactCommercialPageAction({ source, type, value }: { source?: string; type: string; value?: string | number }): void {
    const action = { type, value };
    if (source === 'section') this.onReactSectionHeadingAction(action);
    else if (source === 'key') this.onReactKeyKpiAction(action);
    else if (source === 'category') this.onReactCategoryAction(action);
    else if (source === 'brand') this.onReactBrandAction(action);
    else if (source === 'ranking') this.onReactRankingAction(action);
    else if (source === 'gender') this.onReactGenderAction(action);
    else if (source === 'price') this.onReactPriceRangeAction(action);
  }

  readonly inventoryPageModel = computed<Record<string, unknown>>(() => {
    const detailState = this.stockDetailFailed() ? 'error'
      : !this.stockDetailLoaded() && !this.stockInsightsData() ? 'loading' : 'ready';
    return {
      headings: {
        inventory: this.sectionHeadingModel('inventory'), a: this.sectionHeadingModel('inventory-a'),
        b: this.sectionHeadingModel('inventory-b'), c: this.sectionHeadingModel('inventory-c'),
      },
      rotation: this.rotationCardModel(), antiquity: this.antiquityCardModel(),
      storeValue: this.storeValueCardModel(), size: this.sizeCardModel(),
      detailState, detailProgress: this.stockDetailProgress(),
      predictive: detailState === 'ready' ? {
        parameters: this.predictiveParametersModel(), health: this.healthCardModel(),
        replenishment: this.replenishmentCardModel(), projection: this.projectionCardModel(),
      } : null,
    };
  });

  onReactInventoryPageAction({ source, type, value }: { source?: string; type: string; value?: string | number }): void {
    const action = { type, value };
    if (source === 'section') this.onReactSectionHeadingAction(action);
    else if (source === 'rotation') this.onReactRotationAction(action);
    else if (source === 'antiquity') this.onReactAntiquityAction(action);
    else if (source === 'storeValue') this.onReactStoreValueAction(action);
    else if (source === 'size') this.onReactSizeCardAction(action);
    else if (source === 'parameters') this.onReactPredictiveParametersAction(action);
    else if (source === 'replenishment') this.onReactReplenishmentAction(action);
    else if (source === 'projection') this.onReactProjectionAction(action);
    else if (source === 'detail' && type === 'retry') this.retryStockDetail();
  }

  readonly reactStandaloneModel = computed<Record<string, unknown>>(() => {
    if (!this.cloud.authReady()) return { mode: 'validating', access: this.commercialAccessModel('validating') };
    if (!this.cloud.hasAccess()) return { mode: this.cloud.portalEnabled ? 'denied' : 'login',
      access: this.commercialAccessModel(this.cloud.portalEnabled ? 'denied' : 'login') };
    if (this.loadingError()) return { mode: 'error', access: this.commercialAccessModel('error') };
    if (!this.data()) return { mode: 'loading', access: this.commercialAccessModel('loading') };
    const page = this.page(); const expanded = this.expandedChart();
    return {
      mode: 'ready', page, expanded, header: this.headerModel(), filters: this.filtersModel(),
      commercial: page === 1 ? this.commercialPageModel() : null,
      inventory: page === 2 ? this.inventoryPageModel() : null,
      talent: page === 3 ? this.talentPageModel() : null,
      modal: expanded === 'birthday-list' ? { type: 'birthday', model: this.birthdayModalModel() }
        : expanded === 'stock-transfers' ? { type: 'transfer', model: this.transferModalModel() }
        : expanded === 'antiquity-detail' ? { type: 'stock-origin', model: this.stockOriginModalModel() }
        : expanded === 'ticket-average' ? { type: 'monthly', model: this.ticketModalModel() }
        : expanded === 'conversion-average' ? { type: 'monthly', model: this.conversionModalModel() }
        : expanded === 'traffic-average' ? { type: 'monthly', model: this.trafficModalModel() }
        : expanded?.startsWith('kpi-') ? { type: 'monthly', model: this.kpiDetailModel() }
        : expanded === 'size-detail' ? { type: 'size-detail', model: this.sizeDetailModel() } : null,
      assistantEnabled: this.cloud.assistantEnabled,
      assistantRole: this.cloud.accessProfile()?.roleCode || '',
      assistantContext: this.assistantContext(),
    };
  });

  askReactAssistant(messages: import('./assistant.service').AssistantMessage[], context: string): Promise<string> {
    return this.assistant.ask(messages, context);
  }

  transcribeReactAssistant(audio: Blob, name: string): Promise<string> {
    return this.assistant.transcribe(audio, name);
  }

  private monthlyModalModel(kind: 'ticket' | 'conversion' | 'traffic'): Record<string, unknown> {
    const year = this.ticketChartYear();
    const stores = kind === 'traffic' ? this.trafficChartStores() : this.ticketChartStores();
    const common = {
      moduleId: `${kind}-modal`, year, years: this.ticketChartYears(),
      storeLocked: this.storeFilterLocked(), selectedStores: this.ticketChartSelectedStores(),
      stores: stores.map(store => ({ storeId: store.storeId, label: store.alias || store.store })),
      allStoresLabel: kind === 'traffic' ? 'Todas las tiendas del formato' : 'Todas las tiendas permitidas',
    };
    if (kind === 'ticket') return { ...common, titleId: 'ticket-chart-title', title: 'TICKET PROMEDIO POR MES',
      closeLabel: 'Cerrar gráfico de ticket promedio', chartId: 'modal-ticket', chartLabel: 'Evolución mensual del ticket promedio',
      hasData: this.ticketChartHasData(), emptyText: `No hay transacciones disponibles para ${year} con estos filtros.`,
      option: blackChartText(this.ticketMonthlyOption()), tableLabel: 'Ticket promedio, transacciones y venta neta por mes',
      headers: ['Mes', 'Ticket promedio', 'Transacciones', 'Venta neta'], legend: true,
      rows: this.ticketMonthlyRows().map(row => ({ label: row.label, cells: [
        { text: this.money(row.ticket), className: this.ticketCellHighlight('ticket', row.ticket, row.transactions), title: this.ticketCellDescription('ticket', row.ticket, row.transactions) },
        { text: this.number(row.transactions), className: this.ticketCellHighlight('transactions', row.transactions, row.transactions), title: this.ticketCellDescription('transactions', row.transactions, row.transactions) },
        { text: this.money(row.net), className: this.ticketCellHighlight('net', row.net, row.transactions), title: this.ticketCellDescription('net', row.net, row.transactions) },
      ] })) };
    if (kind === 'conversion') return { ...common, titleId: 'conversion-chart-title', title: 'CONVERSIÓN POR MES',
      closeLabel: 'Cerrar gráfico de conversión', chartId: 'modal-conversion', chartLabel: 'Evolución mensual de conversión',
      hasData: this.conversionChartHasData(), emptyText: `No hay tráfico registrado para calcular la conversión de ${year}.`,
      option: blackChartText(this.conversionMonthlyOption()), tableLabel: 'Conversión, transacciones y tráfico por mes',
      headers: ['Mes', 'Conversión', 'Transacciones', 'Tráfico'], legend: false,
      rows: this.conversionMonthlyRows().map(row => ({ label: row.label, cells: [
        { text: this.percent(row.conversion) }, { text: this.number(row.transactions) }, { text: this.number(row.traffic) },
      ] })) };
    return { ...common, titleId: 'traffic-chart-title', title: `${this.trafficChartLabel()} POR MES`,
      closeLabel: 'Cerrar gráfico de tráfico', chartId: 'modal-traffic', chartLabel: `Evolución mensual de ${this.trafficChartLabel().toLowerCase()}`,
      hasData: this.trafficChartHasData(), emptyText: `No hay tráfico registrado para ${year} con estos filtros.`,
      option: blackChartText(this.trafficMonthlyOption()), tableLabel: 'Tráfico mensual por formato',
      headers: ['Mes', 'Tráfico', 'Transacciones', 'Conversión'], legend: false,
      rows: this.trafficMonthlyRows().map(row => ({ label: row.label, cells: [
        { text: this.number(row.traffic) }, { text: this.number(row.transactions) }, { text: this.percent(row.conversion) },
      ] })) };
  }

  readonly ticketModalModel = computed(() => this.monthlyModalModel('ticket'));
  readonly conversionModalModel = computed(() => this.monthlyModalModel('conversion'));
  readonly trafficModalModel = computed(() => this.monthlyModalModel('traffic'));

  readonly kpiDetailModel = computed<Record<string, unknown>>(() => {
    const metric = this.expandedChart()?.slice(4) || 'saleM2';
    const year = this.ticketChartYear();
    const selectedStores = new Set(this.ticketChartSelectedStores());
    const stores = this.ticketChartStores();
    const ids = new Set(stores.filter(store => !selectedStores.size || selectedStores.has(store.storeId)).map(store => store.storeId));
    const area = stores.filter(store => ids.has(store.storeId)).reduce((total, store) => total + Math.max(0, store.areaM2 || 0) * .8, 0);
    const stock = (this.data()?.predictiveStore || []).filter(row => ids.has(row.storeId)).reduce((total, row) => total + (row.stockUnits || 0), 0);
    const categories = this.personnelCategories();
    const months = MONTHS.map((label, index) => {
      const periodId = year * 100 + index + 1;
      const rows = this.rowsForPeriods([periodId], ids);
      const personnelRows = this.indexedRows(this.monthlyPersonnelAreaIndex, [periodId], ids).filter(row => !categories.length ||
        (this.normalized(row.areaType) === 'COMERCIAL' && categories.some(category => this.personnelAreaMatchesCategory(row, category))));
      const net = sum(rows, 'net'), gross = sum(rows, 'gross'), positive = sum(rows, 'positiveReal');
      const units = sum(rows, 'units'), received = sum(rows, 'received'), personnel = sum(personnelRows, 'personnel');
      const value = metric === 'saleM2' ? (area ? net / area : null)
        : metric === 'saleCollaborator' ? (personnel ? net / personnel : null)
        : metric === 'markup' ? (gross ? (positive - gross) / gross : null)
        : stock + received > 0 ? units / (stock + received) : null;
      return { label, periodId, value, net, personnel, units, received };
    });
    const percentMetric = metric === 'markup' || metric === 'sellThrough';
    const titles: Record<string, string> = { saleM2: 'VENTA × M²', saleCollaborator: 'VENTA × COLABORADOR', markup: 'MARKUP', sellThrough: 'SELL-THROUGH' };
    const selectedMonth = this.kpiDetailMonth();
    const selectedPeriods = selectedMonth ? new Set([year * 100 + selectedMonth])
      : year === this.year() ? this.selectedPeriods()
        : new Set(Array.from({ length: this.yearOnlyMonthLimit(year) }, (_, index) => year * 100 + index + 1));
    const personnelPeriods = selectedMonth ? [year * 100 + selectedMonth]
      : year === this.year() && this.selectedMonths().length ? [...selectedPeriods]
        : [year * 100 + (year === this.year() ? this.selectedMonth() : this.yearOnlyMonthLimit(year))];
    const sellerRows = metric === 'saleCollaborator' ? aggregateSellerRanking(this.sellerPerformanceData().filter(row =>
      ids.has(row.storeId) && selectedPeriods.has(row.periodId) && this.categoryMatches(row.category) && this.lineMatches(row.line) && this.sublineMatches(row.subline))) : [];
    const totalNet = sum(this.rowsForPeriods(selectedPeriods, ids), 'net');
    const selectedPersonnelRows = this.indexedRows(this.monthlyPersonnelAreaIndex, personnelPeriods, ids).filter(row => !categories.length ||
      (this.normalized(row.areaType) === 'COMERCIAL' && categories.some(category => this.personnelAreaMatchesCategory(row, category))));
    const personnelByPeriod = grouped(selectedPersonnelRows, row => row.periodId);
    const averagePersonnel = personnelPeriods.length ? personnelPeriods.reduce((total, period) => total + sum(personnelByPeriod.get(period) || [], 'personnel'), 0) / personnelPeriods.length : 0;
    const unmatchedNet = totalNet - sellerRows.reduce((total, row) => total + row.net, 0);
    return {
      moduleId: `${metric}-modal`, titleId: 'kpi-detail-title', title: titles[metric] || 'INDICADOR', closeLabel: 'Cerrar detalle del indicador',
      chartId: `modal-${metric}`, chartLabel: `Evolución mensual de ${titles[metric] || metric}`,
      year, years: [this.year()], storeLocked: this.storeFilterLocked(), selectedStores: this.ticketChartSelectedStores(),
      stores: stores.map(store => ({ storeId: store.storeId, label: store.alias || store.store })), allStoresLabel: 'Todas las tiendas permitidas',
      hasData: months.some(row => row.value != null), emptyText: 'No hay datos comparables para este año y estos filtros.',
      dataNote: metric === 'sellThrough' ? `El denominador usa stock al ${this.formatDate(this.data()?.metadata.stockCutoff || '')}; no hay fotos históricas mensuales de stock.` : '',
      option: blackChartText({ animation: false, grid: { left: 32, right: 20, top: 30, bottom: 38, containLabel: true },
        tooltip: { trigger: 'axis', confine: true, formatter: (params: any[]) => { const row = months[params[0]?.dataIndex ?? 0]; return this.tooltip(`${row.label} ${year}`, [{ label: titles[metric], value: percentMetric ? this.percent(row.value) : this.money(row.value) }]); } },
        xAxis: { type: 'category', data: MONTHS, axisLabel: { color: C.slate } },
        yAxis: { type: 'value', axisLabel: { color: C.slate, formatter: (value: number) => percentMetric ? `${Math.round(value * 100)}%` : this.short(value) }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
        series: [{ type: 'line', data: months.map(row => row.value), connectNulls: false, symbolSize: 7, lineStyle: { color: C.navy, width: 3 }, itemStyle: { color: C.navy } }]
      } as EChartsOption),
      tableLabel: `Comparación mensual de ${titles[metric]}`, headers: ['Mes', titles[metric], 'Venta neta', ...(metric === 'saleCollaborator' ? ['Colaboradores'] : metric === 'sellThrough' ? ['Unidades'] : [])],
      rows: months.map(row => ({ label: row.label, cells: [
        { text: percentMetric ? this.percent(row.value) : this.money(row.value) }, { text: this.money(row.net, true) },
        ...(metric === 'saleCollaborator' ? [{ text: this.number(row.personnel) }] : metric === 'sellThrough' ? [{ text: this.number(row.units) }] : []),
      ] })), legend: false,
      sellerDetail: metric === 'saleCollaborator' ? { loading: this.sellerDetailLoading(), month: selectedMonth,
        rows: [...sellerRows.map(row => ({ seller: row.seller, net: this.money(row.net, true), contribution: averagePersonnel ? this.money(row.net / averagePersonnel) : 'N/A' })),
          ...(Math.abs(unmatchedNet) > .01 ? [{ seller: 'Sin vendedor asignado / ajuste', net: this.money(unmatchedNet, true), contribution: averagePersonnel ? this.money(unmatchedNet / averagePersonnel) : 'N/A' }] : [])],
        net: this.money(totalNet, true), personnel: this.number(averagePersonnel), kpi: averagePersonnel ? this.money(totalNet / averagePersonnel) : 'N/A' } : null,
    };
  });

  onReactMonthlyModalAction({ type, value }: { type: string; value?: string | number }): void {
    if (type === 'close') this.closeExpandedChart();
    else if (type === 'year' && value != null) this.setTicketChartYear(Number(value));
    else if (type === 'clear-stores') this.ticketChartSelectedStores.set([]);
    else if (type === 'store' && typeof value === 'string') this.toggleTicketChartStore(value);
    else if (type === 'month') this.kpiDetailMonth.set(Number(value) || 0);
  }

  readonly stockOriginModalModel = computed<Record<string, unknown>>(() => {
    const totals = this.stockOriginDetailTotals();
    return {
      period: this.periodLabel(this.stockOriginDetailPeriod()!),
      cutoff: this.formatDate(this.data()!.metadata.stockCutoff),
      units: this.number(totals.units, ' und'), value: this.money(totals.value),
      rows: this.stockOriginDetailRows().map(row => ({ store: row.store, storeId: row.storeId,
        category: row.category || 'Sin clasificación', line: row.line || 'Sin clasificación',
        subline: row.subline || 'Sin clasificación', units: this.number(row.units), value: this.money(row.value) })),
    };
  });

  onReactStockOriginModalAction({ type }: { type: string }): void {
    if (type === 'close') this.closeExpandedChart();
  }

  readonly transferModalModel = computed<Record<string, unknown>>(() => {
    const ready = this.stockDetailLoaded() || this.stockTransfersLoaded();
    const rows = this.transferMatrixRows();
    const page = this.transferCurrentPage();
    return {
      sizeMode: this.transferSizeMode(),
      stockUnits: ready ? this.number(this.transferSummary().stockUnits) : '—',
      salesUnits: ready ? this.number(this.transferSummary().salesUnits) : '—',
      rubro: this.transferRubro(), rubros: this.transferRubros().map(value => ({ value, label: value })),
      sizeSystem: this.transferSizeSystem(), size: this.transferSize(), sizes: this.transferSizes().map(value => ({ value, label: value })),
      line: this.transferLine(), lines: this.transferLines().map(value => ({ value, label: value })),
      brand: this.transferBrand(), brands: this.transferBrands().map(value => ({ value, label: value })),
      store: this.transferStore(), stores: this.transferStores().map(store => ({ value: store.storeId, label: `${store.alias || store.store} · ${store.store}` })),
      priority: this.transferPriority(), search: this.transferSearch(), codeError: this.transferCodeError(),
      stockCutoff: this.formatDate(this.data()!.metadata.stockCutoff),
      salesCutoff: this.formatDate(this.data()!.metadata.salesCutoff),
      busy: this.transferBusy(), calculationError: this.transferCalculationError(),
      transferError: this.stockTransfersError(),
      detailFailed: this.stockDetailFailed() && !this.stockTransfersLoaded(), detailReady: ready,
      noTransferProducts: ready && !this.transferRubros().length,
      routeCount: this.transferRecommendations().length, productCount: this.number(rows.length),
      from: page * this.transferPageSize + 1, to: Math.min((page + 1) * this.transferPageSize, rows.length),
      page, pageCount: this.transferPageCount(), hasEstimates: this.transferHasEstimates(),
      rows: this.transferPageRows().map(row => ({
        key: row.key, open: this.transferExpandedRow() === row.key,
        productTitle: `Código: ${row.origin.productCode || 'No disponible'}\n${row.origin.brand} / ${row.origin.category}`,
        product: row.origin.product,
        size: row.origin.category === 'CALZADO' || row.origin.category === 'TEXTIL' ? this.transferSizeLabel(row.origin) : '',
        sourceName: row.origin.sourceName, sourceStock: this.number(row.origin.sourceStock),
        sourceSales: this.number(row.origin.sourceSales),
        sourceDays: row.origin.sourceDays == null ? 'Sin ventas' : `${this.number(row.origin.sourceDays)} días`,
        bestDescription: this.transferRouteDescription(row.best), bestName: row.best.destinationName,
        bestStock: this.number(row.best.destinationStock), bestSales: this.number(row.best.destinationSales),
        bestDays: `${this.number(row.best.destinationDays)} días`, quantity: this.number(row.best.suggested),
        options: row.options.map(route => ({ destination: route.destination,
          best: route.destination === row.best.destination, name: route.destinationName,
          stock: this.number(route.destinationStock), sales: this.number(route.destinationSales),
          days: this.number(route.destinationDays), critical: route.critical, suggested: this.number(route.suggested) })),
      })),
    };
  });

  onReactTransferAction({ type, value }: { type: string; value?: string | number }): void {
    if (type === 'close') this.closeExpandedChart();
    else if (type === 'chart') this.openSizeChart();
    else if (type === 'reset') this.resetTransferFilters();
    else if (type === 'retry-codes') this.retryProductCodes();
    else if (type === 'retry-transfers') this.retryStockTransfers();
    else if (type === 'row' && typeof value === 'string') this.toggleTransferRow(value);
    else if (type === 'page' && value != null) this.transferPage.set(Number(value));
    else if (type === 'rubro' && typeof value === 'string') {
      this.transferRubro.set(value); this.transferLine.set(''); this.transferBrand.set(''); this.transferSize.set(''); this.transferPage.set(0);
    } else if (type === 'size-system' && (value === 'USA' || value === 'EUR')) {
      this.transferSizeSystem.set(value); this.transferSize.set(''); this.transferPage.set(0);
    } else if (type === 'size' && typeof value === 'string') {
      this.transferSize.set(value); this.transferExpandedRow.set(''); this.transferPage.set(0);
    } else if (type === 'line' && typeof value === 'string') {
      this.transferLine.set(value); this.transferBrand.set(''); this.transferSize.set(''); this.transferPage.set(0);
    } else if (type === 'brand' && typeof value === 'string') {
      this.transferBrand.set(value); this.transferSize.set(''); this.transferPage.set(0);
    } else if (type === 'store' && typeof value === 'string') { this.transferStore.set(value); this.transferPage.set(0); }
    else if (type === 'priority' && typeof value === 'string') { this.transferPriority.set(value); this.transferPage.set(0); }
    else if (type === 'search' && typeof value === 'string') { this.transferSearch.set(value); this.transferPage.set(0); }
  }

  onReactStoreValueAction({ type }: { type: string }): void {
    if (type === 'expand') this.toggleChartExpansion('store-value-coverage');
  }

  onReactSizeCardAction(action: { type: string; value?: string | number }): void {
    if (action.type === 'expand') this.toggleChartExpansion('size-distribution');
    else if (action.type === 'detail' && typeof action.value === 'string') {
      this.sizeDetailSelected.set(action.value); this.expandedChart.set('size-detail'); this.setPageScrollLocked(true);
      void this.ensureSizeDetail(this.sizeRubro());
    }
    else if (action.type === 'retry') this.retryProductCodes();
    else if (action.type === 'retry-transfers') this.retryStockTransfers();
    else this.onReactSizeAction(action);
  }

  readonly stockMatrixModel = computed<Record<string, unknown>>(() => ({
    rows: this.inventoryMatrixRows().map(row => ({
      storeId: row.storeId, alias: row.alias, tone: row.tone, status: row.status,
      capacityTitle: this.number(row.capacity, ' unidades'), capacity: this.number(row.capacity, ' und'),
      stockTitle: this.number(row.stockUnits, ' unidades'), stock: this.number(row.stockUnits, ' und'),
      receivedTitle: this.number(row.receivedDaily, ' unidades por día'), received: this.number(row.receivedDaily, ' und/día'),
      salesTitle: this.number(row.dailySales, ' unidades por día'), sales: this.number(row.dailySales, ' und/día'),
      coverageTitle: row.coverageDays == null ? 'Sin venta reciente' : this.number(row.coverageDays, ' días de cobertura'),
      coverage: row.coverageDays == null ? 'SIN VENTA' : this.number(row.coverageDays, ' días'),
    })),
  }));

  onReactSizeAction({ type, value }: { type: string; value?: string | number }): void {
    if (type === 'rubro' && (value === 'CALZADO' || value === 'TEXTIL')) this.selectSizeRubro(value);
    else if (type === 'metric' && (value === 'SALES' || value === 'STOCK' || value === 'TRANSFERS')) this.selectSizeMetric(value);
    else if (type === 'system' && (value === 'USA' || value === 'EUR')) this.shoeSizeSystem.set(value);
    else if (type === 'matrix') this.openSizeTransfers();
  }

  onReactKeyKpiAction({ type }: { type: string }): void {
    if (type === 'trafficMetro') this.openTrafficChart('METRO');
    else if (type === 'trafficOther') this.openTrafficChart('OTHER');
    else if (type === 'conversion') this.openConversionChart();
    else if (type === 'ticket') this.openTicketChart();
    else if (['saleM2', 'saleCollaborator', 'markup', 'sellThrough'].includes(type)) {
      this.ticketChartYear.set(this.year()); this.ticketChartSelectedStores.set([...this.selectedStores()]); this.kpiDetailMonth.set(0);
      this.toggleChartExpansion(`kpi-${type}`);
      if (type === 'saleCollaborator') void this.ensureSellerDetail();
    }
  }

  onReactFilterAction({ type, value }: DashboardFilterAction): void {
    if (type === 'toggleDrawer') { this.filtersOpen.set(!this.filtersOpen()); return; }
    if (type === 'closeDrawer') { this.filtersOpen.set(false); return; }
    if (type === 'year') { this.onYear(Number(value)); return; }
    if (type === 'toggleCalendar') { this.toggleCalendar(); return; }
    if (type === 'closeCalendar') { this.closeCalendar(); return; }
    if (type === 'clearDateRange') { this.clearDateRange(); return; }
    if (type === 'calendarDay') { void this.onCalendarDayClick(String(value)); return; }
    if (type === 'reset') { this.resetFilters(); return; }
    if (type === 'toggleFilter') {
      const key = String(value) as FilterKey;
      if ((key === 'store' && this.storeFilterLocked()) || (key === 'cluster' && this.clusterFilterLocked()) || (key === 'gender' && !this.genderFilterEnabled())) return;
      this.closeCalendar(); this.openFilter.set(this.openFilter() === key ? null : key); return;
    }
    if (type === 'search') {
      const input = String(value); const divider = input.indexOf(':');
      if (divider >= 0) this.setFilterSearch(input.slice(0, divider) as FilterKey, input.slice(divider + 1));
      return;
    }
    const clear: Record<string, () => void> = {
      month: () => this.clearMonths(), cluster: () => this.clearClusters(), format: () => this.clearFormats(),
      store: () => this.clearStores(), category: () => this.clearCategories(), gender: () => this.clearGenders(),
      line: () => this.clearLines(), subline: () => this.clearSublines(),
    };
    const toggle: Record<string, (input: string) => void> = {
      month: input => this.toggleMonth(Number(input)), cluster: input => this.toggleCluster(input),
      format: input => this.toggleFormat(input), store: input => this.toggleStore(input),
      category: input => this.toggleCategory(input), gender: input => this.toggleGender(input),
      line: input => this.toggleLine(input), subline: input => this.toggleSubline(input),
    };
    if (type.startsWith('clear:')) clear[type.slice(6)]?.();
    if (type.startsWith('toggle:')) toggle[type.slice(7)]?.(String(value));
  }

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
    const periods = this.personnelPeriods();
    const applicable = this.personnelAreaRowsForContext(periods);
    const byPeriod = new Map<number, number>();
    applicable.forEach(row => byPeriod.set(row.periodId, (byPeriod.get(row.periodId) || 0) + (row.personnel || 0)));
    const total = periods.reduce((value, period) => value + (byPeriod.get(period) || 0), 0);
    return total > 0 ? total / Math.max(1, periods.length) : null;
  }

  private personnelPeriods(): number[] {
    return this.selectedMonths().length ? [...this.selectedPeriods()] : [this.selectedPeriod()];
  }

  private personnelAreaRowsForContext(periods: number[]): PersonnelAreaRow[] {
    const rows = this.indexedRows(this.monthlyPersonnelAreaIndex, periods, this.filteredStoreIds());
    const categories = this.personnelCategories();
    return categories.length
      ? rows.filter(row => this.normalized(row.areaType) === 'COMERCIAL' && categories.some(category => this.personnelAreaMatchesCategory(row, category)))
      : rows;
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
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const currentYear = Number(today.find(part => part.type === 'year')?.value);
    const currentMonth = Number(today.find(part => part.type === 'month')?.value);
    const currentDay = Number(today.find(part => part.type === 'day')?.value);
    const currentDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
    const ids = this.filteredStoreIds(); const categories = this.personnelCategories();
    const birthdayProfiles = (this.data()?.personnelProfiles || []).filter(row =>
      ids.has(row.storeId)
      && !['POR INGRESAR', 'NO INGRESO', 'ANULADO'].includes(this.normalized(row.status))
      && (!row.hireDate || row.hireDate <= currentDate)
      && (!row.retirementDate || row.retirementDate >= currentDate)
      && (!categories.length || (row.areaType === 'COMERCIAL' && categories.some(category => this.personnelAreaMatchesCategory(row, category)))));
    const birthday = nextBirthday(birthdayProfiles, currentDate);
    const periods = this.personnelPeriods();
    const personnelRows = this.personnelAreaRowsForContext(periods);
    const personnelAverage = this.personnelForSelectedContext();
    const averageTotal = Math.round(personnelAverage || 0);
    const salesAverage = personnelRows.filter(row => this.normalized(row.areaType) === 'COMERCIAL')
      .reduce((total, row) => total + (row.personnel || 0), 0) / Math.max(1, periods.length);
    const salesStaff = Math.min(averageTotal, Math.round(salesAverage));
    // El desglose por género proviene de fichas individuales. Se distribuye sobre
    // la misma dotación promedio oficial para evitar mezclar un mes con varios.
    const genderProfiles = this.data()?.personnelProfiles || [];
    let maleCount = 0; let femaleCount = 0;
    for (const selectedPeriod of periods) {
      const selectedYear = Math.floor(selectedPeriod / 100); const selectedMonth = selectedPeriod % 100;
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth, 0).getDate()).padStart(2, '0')}`;
      for (const row of genderProfiles) {
        if (!ids.has(row.storeId) || this.normalized(row.status) !== 'ACTIVO'
          || (row.hireDate && row.hireDate > endDate) || (row.retirementDate && row.retirementDate < startDate)
          || (categories.length && (row.areaType !== 'COMERCIAL' || !categories.some(category => this.personnelAreaMatchesCategory(row, category))))) continue;
        if (row.gender === 'M') maleCount += 1;
        if (row.gender === 'F') femaleCount += 1;
      }
    }
    const knownGenders = maleCount + femaleCount;
    const male = knownGenders ? Math.round(averageTotal * maleCount / knownGenders) : null;
    return {
      male,
      female: male == null ? null : averageTotal - male,
      averageAge: ages.length ? ages.reduce((total, value) => total + value, 0) / ages.length : null,
      salesStaff: personnelAverage == null ? null : salesStaff,
      administrativeStaff: profiles.filter(row => ['ADMINISTRADOR', 'ADMINISTRADOR DE TIENDA', 'ADMINISTRADOR TIENDA', 'JEFE DE TIENDA', 'JEFE TIENDA', 'JEFE_TIENDA', 'ASISTENTE ADMINISTRATIVO', 'ASISTENTE DE TIENDA', 'ASISTENTE TIENDA', 'ASISTENTE_TIENDA'].includes(this.normalized(row.role))).length,
      birthdayLabel: birthday?.person.name || 'N/A',
      birthdayDate: birthday ? birthday.date.split('-').reverse().join('/') : '',
    };
  });
  readonly birthdayMonthRows = computed(() => {
    const month = this.selectedMonth();
    const stores = new Map((this.data()?.stores || []).map(store => [store.storeId, store.alias || store.store]));
    return this.talentProfiles().filter(row => row.birthDate && Number(row.birthDate.slice(5, 7)) === month)
      .map(row => ({ name: row.name, store: stores.get(row.storeId) || row.storeId,
        role: row.role, day: Number(row.birthDate!.slice(8, 10)) }))
      .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
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
    return aggregateSellerRanking(rows);
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
      const averagePersonnel = personnelTotal > 0 ? Math.max(1, Math.round(personnelTotal / periodCount)) : 0;
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
    const source = this.operationalSummary()
      ? this.operationalSummary()!.departures.map(row => ({ storeId: row.storeId, retirementDate: row.date, retirementReason: row.reason }))
      : (this.data()?.personnelProfiles || []);
    for (const row of source) {
      if (!ids.has(row.storeId) || !row.retirementReason || !row.retirementDate || !this.selectedPeriods().has(Number(row.retirementDate.slice(0, 7).replace('-', '')))) continue;
      const reason = this.normalized(row.retirementReason);
      const category = reason.includes('MEJOR OFERTA') || reason.includes('OTRO EMPLEO') ? 'MEJOR OFERTA'
        : reason.includes('SALUD') ? 'SALUD'
        : reason.includes('AUSENT') ? 'AUSENTISMO'
        : reason.includes('DESERC') ? 'DESERCIÓN'
        : reason.includes('CAMBIO') && reason.includes('TIENDA') ? 'CAMBIO DE TIENDA'
        : reason.includes('PERSONAL') ? 'PERSONAL' : 'PERSONAL';
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

  private courseProgressOption(rows: { name: string; value: number; total: number }[], color: string): EChartsOption {
    const expanded = this.expandedChart() === 'training-progress';
    return { animation: false, grid: { left: expanded ? 250 : 128, right: 42, top: 8, bottom: 22 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: (params: any[]) => { const row = rows[params[0]?.dataIndex ?? 0]; return this.tooltip(row?.name || '', [{ label: 'Avance registrado', value: this.percent((row?.value || 0) / 100) }, { label: 'Asignaciones', value: this.number(row?.total || 0) }]); } },
      xAxis: { type: 'value', min: 0, max: 100, interval: 25, axisLabel: { formatter: (value: number) => `${value}%`, color: '#64748B', fontSize: 8 }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      yAxis: { type: 'category', inverse: true, data: rows.map(row => row.name), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { width: expanded ? 238 : 116, overflow: expanded ? 'break' : 'truncate', color: '#111', fontSize: expanded ? 12 : 9, fontWeight: 700 } },
      series: [{ type: 'bar', data: rows.map(row => row.value), barMaxWidth: 19, showBackground: true, backgroundStyle: { color: '#EEF2F7', borderRadius: 5 }, itemStyle: { color, borderRadius: [0, 5, 5, 0] }, label: { show: false } }]
    } as EChartsOption;
  }
  private trainingRowsFor(audience: 'SELLERS' | 'ADMINISTRATORS') {
    const ids = this.filteredStoreIds();
    const rows = (this.operationalSummary()?.training || []).filter(row => ids.has(row.storeId)
      && (audience === 'SELLERS' ? row.role === 'vendedor' : ['jefe_tienda', 'asistente_tienda'].includes(row.role)));
    const courses = grouped(rows, row => row.course);
    return (this.operationalSummary()?.courses || []).slice(0, 5).map(name => {
      const assigned = courses.get(name) || [];
      const completed = assigned.filter(row => row.state === 'completado').length;
      return { name, total: assigned.length, pending: assigned.length - completed,
        value: assigned.length ? Math.round(100 * completed / assigned.length) : 0 };
    });
  }
  readonly sellerTrainingOption = computed<EChartsOption>(() => this.courseProgressOption(this.trainingRowsFor('SELLERS'), C.teal));
  readonly administratorTrainingOption = computed<EChartsOption>(() => this.courseProgressOption(this.trainingRowsFor('ADMINISTRATORS'), C.purple));
  readonly sellerPendingTrainingOption = computed<EChartsOption>(() => {
    const rows = this.trainingRowsFor('SELLERS'); const expanded = this.expandedChart() === 'training-progress';
    const max = Math.max(1, ...rows.map(row => row.pending));
    return { animation: false, grid: { left: expanded ? 250 : 128, right: 38, top: 8, bottom: 22 },
      tooltip: { trigger: 'item', formatter: (item: any) => this.tooltip(rows[item.dataIndex]?.name || '', [{ label: 'Pendientes', value: this.number(Number(item.value)) }, { label: 'Asignaciones', value: this.number(rows[item.dataIndex]?.total || 0) }]), confine: true },
      xAxis: { type: 'value', min: 0, max, minInterval: 1, axisLabel: { color: '#111', fontSize: 11 } },
      yAxis: { type: 'category', inverse: true, data: rows.map(row => row.name), axisLabel: { width: expanded ? 238 : 116, overflow: expanded ? 'break' : 'truncate', color: '#111', fontSize: expanded ? 12 : 9 } },
      series: [{ type: 'bar', data: rows.map(row => row.pending), barMaxWidth: 19, itemStyle: { color: C.teal }, label: { show: false } }] } as EChartsOption;
  });
  readonly selectedTrainingOption = computed<EChartsOption>(() => this.storeFilterLocked()
    ? this.sellerPendingTrainingOption() : this.trainingAudience() === 'SELLERS'
      ? this.sellerTrainingOption() : this.administratorTrainingOption());
  readonly talentIncidentRows = computed(() => {
    const ids = this.filteredStoreIds();
    const periods = this.selectedPeriods();
    const counts = new Map<string, number>();
    const externalTypes = new Set(['robo', 'robo_frustrado', 'estafa', 'asalto', 'fiscalizacion',
      'proveedor', 'logistica_externa', 'infraestructura_externa']);
    const labels: Record<string, string> = { robo: 'Robo', robo_frustrado: 'Robo frustrado', cambio_precio: 'Cambio de precio',
      proveedor: 'Proveedor', logistica_externa: 'Logística externa', infraestructura_externa: 'Infraestructura externa', fiscalizacion: 'Fiscalización', otro: 'Otros' };
    for (const row of this.operationalSummary()?.incidents || []) {
      if (!externalTypes.has(row.type) || !ids.has(row.storeId) || !periods.has(Number(row.date.slice(0, 7).replace('-', '')))) continue;
      const label = labels[row.type] || row.type.replaceAll('_', ' ');
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()].map(([name, value], index) => ({ name, value, itemStyle: { color: [C.red, C.orange, C.purple, C.blue, C.gold, C.teal][index % 6] } }));
  });
  readonly talentIncidentsOption = computed<EChartsOption>(() => ({
    animation: false, tooltip: { trigger: 'item', confine: true, formatter: (params: any) => this.tooltip(params.name, [{ label: 'Casos registrados', value: this.number(Number(params.value)) }, { label: 'Participación', value: `${params.percent}%` }]) },
    legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 8 } },
    series: [{ type: 'pie', radius: ['43%', '73%'], center: ['50%', '44%'], label: { show: true, fontSize: 8, formatter: '{b}\n{d}%' }, data: this.talentIncidentRows() }]
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
      moduloVisible: this.page() === 1 ? 'Gestión comercial' : this.page() === 2 ? 'Inventario y predictivo' : 'Gestión de talento',
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
      inventario: this.inventoryMatrixRows().length ? { salud: this.inventoryHealthSummary(), cobertura: this.coverageKpis() } : null,
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
    const storeOptions = this.predictiveStoreOptions();
    const storeIds = new Set(storeOptions.map(store => store.storeId)); const rubros = new Set(this.predictiveRubros());
    // El alcance de tienda manda sobre el control local, incluso si su valor
    // fue restaurado de otra sesión o modificado desde el navegador.
    const selectedStore = this.storeFilterLocked() ? storeOptions[0]?.storeId : this.predictiveStore();
    return this.staticPredictiveProducts().filter(row => storeIds.has(row.storeId) && ['TEXTIL', 'CALZADO'].includes(row.category) && rubros.has(row.category) &&
      (selectedStore === 'TODAS' || row.storeId === selectedStore) && this.lineMatches(row.line) && this.sublineMatches(row.subline));
  });
  readonly predictiveStoreOptions = computed(() => this.inventoryStoresIgnoringStoreFilter());
  readonly transferRubro = signal('');
  readonly transferSizeMode = signal(false);
  readonly transferSize = signal('');
  readonly transferSizeSystem = signal<ShoeSizeSystem>('USA');
  readonly transferBusy = signal(false);
  readonly transferCalculationError = signal('');
  readonly transferWorkerRoutes = signal<ReturnType<typeof stockTransfers> | null>(null);
  transferRouteDescription(route: ReturnType<typeof this.transferRecommendations>[number]): string {
    return [
      route.destinationName,
      `Stock vendible destino: ${this.number(route.destinationStock)} und`,
      `Ventas destino 30D: ${this.number(route.destinationSales)} und`,
      `Cobertura destino: ${this.number(route.destinationDays)} días`,
      `Prioridad: ${route.critical ? 'Crítico' : 'Alerta'}`,
      'Se prioriza menor cobertura y luego mayores ventas en 30 días.',
    ].join('\n');
  }
  transferSizeLabel(row: { productCode?: string; category?: string; line?: string; product?: string }): string {
    if (row.category !== 'TEXTIL' && row.category !== 'CALZADO') return 'Sin talla';
    const size = resolveProductSize(row, row.category, this.transferSizeSystem());
    return size ? `${size.label}${row.category === 'CALZADO' ? ' ' + this.transferSizeSystem() : ''}` : 'Sin talla';
  }
  readonly transferLine = signal('');
  readonly transferBrand = signal('');
  readonly transferStore = signal('');
  readonly transferSearch = signal('');
  readonly transferPriority = signal('');
  readonly transferPage = signal(0);
  readonly transferExpandedRow = signal('');
  toggleTransferRow(key: string): void {
    this.transferExpandedRow.set(this.transferExpandedRow() === key ? '' : key);
  }
  readonly transferCodeError = signal(false);
  readonly sizeRubro = signal<SizeRubro>('CALZADO');
  selectSizeRubro(rubro: SizeRubro): void {
    this.sizeRubro.set(rubro);
    if (this.page() === 2 && this.sizeMetric() !== 'SALES') void this.ensureSizeDetail(rubro);
  }
  readonly shoeSizeSystem = signal<ShoeSizeSystem>('USA');
  readonly sizeMetric = signal<SizeMetric>('SALES');
  selectSizeMetric(metric: SizeMetric): void {
    this.sizeMetric.set(metric);
    if (metric !== 'SALES') void this.ensureSizeDetail(this.sizeRubro());
    if (metric === 'TRANSFERS') void this.ensureStockTransfers();
  }
  readonly transferPageSize = 10;
  readonly storeTransferRoutes = signal<ReturnType<typeof stockTransfers> | null>(null);
  readonly storeTransferStores = signal<Store[]>([]);
  readonly transferProducts = computed(() => {
    if (this.storeTransferRoutes() !== null) return this.stockTransferProductsData();
    const ids = new Set(this.predictiveStoreOptions().filter(store => store.isStore).map(store => store.storeId));
    const products = this.stockTransfersLoaded() ? this.stockTransferProductsData()
      : this.stockDetailLoaded() ? this.stockProductsData() : this.stockTransferProductsData();
    return products.filter(row => ids.has(row.storeId));
  });
  readonly transferRubros = computed(() => [...new Set(this.transferProducts()
    .map(row => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')));
  readonly transferLines = computed(() => [...new Set(this.transferProducts()
    .filter(row => !this.transferRubro() || row.category === this.transferRubro()).map(row => row.line).filter(Boolean))].sort());
  readonly transferBrands = computed(() => [...new Set(this.transferProducts()
    .filter(row => (!this.transferRubro() || row.category === this.transferRubro())
      && (!this.transferLine() || row.line === this.transferLine()))
    .map(row => row.brand).filter(Boolean))].sort());
  readonly transferStores = computed(() => this.storeTransferRoutes() !== null ? this.storeTransferStores() : this.predictiveStoreOptions().filter(store => store.isStore));
  readonly transferSizeLabels = computed(() => {
    const labels = new Map<string, string>();
    if (!this.transferRubro()) return labels;
    for (const row of this.transferProducts()) {
      if (row.category === this.transferRubro() && !labels.has(row.productId)) {
        labels.set(row.productId, this.transferSizeLabel(row));
      }
    }
    return labels;
  });
  readonly transferSizes = computed(() => {
    const labels = this.transferSizeLabels();
    const options = new Set<string>();
    for (const row of this.transferProducts()) {
      if (row.category === this.transferRubro() && (!this.transferLine() || row.line === this.transferLine())
        && (!this.transferBrand() || row.brand === this.transferBrand())) {
        options.add(labels.get(row.productId) || 'Sin talla');
      }
    }
    return [...options].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  });
  readonly transferFilteredProducts = computed(() => {
    const query = this.normalized(this.transferSearch());
    const sizeLabels = this.transferSize() ? this.transferSizeLabels() : null;
    return this.transferProducts().filter(row => (!this.transferRubro() || row.category === this.transferRubro())
      && (!this.transferLine() || row.line === this.transferLine())
      && (!this.transferBrand() || row.brand === this.transferBrand())
      && (!this.transferSize() || sizeLabels?.get(row.productId) === this.transferSize())
      && (!query || this.normalized(`${row.productCode || ''} ${row.productId} ${row.product} ${row.brand}`).includes(query)));
  });
  readonly transferAllRecommendations = computed(() => {
    const names = new Map(this.transferStores().map(store => [store.storeId, store.alias || store.store]));
    const selected = new Set(this.transferFilteredProducts().map(row => JSON.stringify([row.productId, row.storeId])));
    const scoped = this.storeTransferRoutes()?.filter(row => selected.has(JSON.stringify([row.productId, row.source])) && selected.has(JSON.stringify([row.productId, row.destination])));
    const routes = scoped ?? (typeof Worker === 'undefined' ? stockTransfers(this.transferFilteredProducts(), 30, 90, false)
      : this.transferWorkerRoutes() || []);
    return routes.map(row => ({ ...row, sourceName: names.get(row.source) || row.source,
      destinationName: names.get(row.destination) || row.destination }));
  });
  private readonly stockTransferCalculationEffect = effect(onCleanup => {
    if (this.expandedChart() !== 'stock-transfers') return;
    if (this.storeTransferRoutes() !== null) {
      this.transferBusy.set(false);
      this.transferCalculationError.set('');
      return;
    }
    this.transferWorkerRoutes.set(null);
    this.transferCalculationError.set('');
    if (!this.transferRubro()) { this.transferBusy.set(false); return; }
    const products = this.transferFilteredProducts();
    this.transferBusy.set(true);
    let worker: Worker | undefined;
    // Let the loading state paint before cloning the filtered payload.
    const timer = setTimeout(() => {
      try {
        worker = new Worker(new URL('./stock-transfers.worker', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          this.transferWorkerRoutes.set(data.routes || []);
          this.transferCalculationError.set(data.error || '');
          this.transferBusy.set(false);
          worker?.terminate();
        };
        worker.onerror = () => {
          this.transferCalculationError.set('No se pudieron calcular los traslados. Cambia de rubro para reintentar.');
          this.transferBusy.set(false);
          worker?.terminate();
        };
        worker.postMessage(products.map(({ productId, productCode, product, storeId, category, line, brand, stockUnits, goodUnits, units30 }) =>
          ({ productId, productCode, product, storeId, category, line, brand, stockUnits, goodUnits, units30 })));
      } catch {
        this.transferCalculationError.set('No se pudo iniciar el cálculo de traslados. Recarga la página para reintentar.');
        this.transferBusy.set(false);
        worker?.terminate();
      }
    }, 100);
    onCleanup(() => { clearTimeout(timer); worker?.terminate(); });
  });
  readonly transferRecommendations = computed(() => this.transferAllRecommendations().filter(row =>
    (!this.transferPriority() || (this.transferPriority() === 'CRITICAL' ? row.critical : !row.critical))
    && (!this.transferStore() || row.source === this.transferStore() || row.destination === this.transferStore())));
  readonly transferSummary = computed(() => transferTotals(this.transferFilteredProducts(), this.transferRecommendations(), this.transferStore()));
  readonly transferHasEstimates = computed(() => this.transferRecommendations().some(row => row.estimated));
  readonly transferMatrixRows = computed(() => {
    type Route = ReturnType<typeof this.transferRecommendations>[number];
    const groups = new Map<string, { key: string; origin: Route; destinations: Map<string, Route> }>();
    for (const route of this.transferRecommendations()) {
      const key = JSON.stringify([route.productId, route.source]);
      const group = groups.get(key) || { key, origin: route, destinations: new Map<string, Route>() };
      group.destinations.set(route.destination, route);
      groups.set(key, group);
    }
    return [...groups.values()].map(group => {
      const options = [...group.destinations.values()].sort((a, b) =>
        a.destinationDays - b.destinationDays || b.destinationSales - a.destinationSales
        || b.suggested - a.suggested || a.destination.localeCompare(b.destination));
      return { ...group, best: options[0], options };
    });
  });
  readonly transferPageCount = computed(() => Math.max(1, Math.ceil(this.transferMatrixRows().length / this.transferPageSize)));
  readonly transferCurrentPage = computed(() => Math.min(this.transferPage(), this.transferPageCount() - 1));
  readonly transferPageRows = computed(() => this.transferMatrixRows().slice(this.transferCurrentPage() * this.transferPageSize, (this.transferCurrentPage() + 1) * this.transferPageSize));
  readonly transferMatrixStores = computed(() => {
    const destinations = new Map<string, string>();
    for (const row of this.transferPageRows()) {
      for (const route of row.destinations.values()) destinations.set(route.destination, route.destinationName);
    }
    return [...destinations].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  private sizeProductsForChart(rubro: SizeRubro): Array<ProductRow | SizeProductRow> {
    if (!this.sizeDetailLoaded()[rubro] && this.stockDetailLoaded()) return this.inventoryProductsIgnoringStoreFilter().filter(row => row.category === rubro && this.filteredStoreIds().has(row.storeId));
    const ids = this.filteredStoreIds();
    return this.sizeProductsData()[rubro].filter(row => ids.has(row.storeId) &&
      this.categoryMatches(row.category) && this.lineMatches(row.line) && this.sublineMatches(row.subline));
  }

  private sizeTransfersForChart(rubro: SizeRubro): ProductRow[] {
    if (!this.stockTransfersLoaded() && this.stockDetailLoaded()) return this.inventoryProductsIgnoringStoreFilter().filter(row => row.category === rubro && this.filteredStoreIds().has(row.storeId));
    const ids = this.filteredStoreIds();
    return this.stockTransferProductsData().filter(row => ids.has(row.storeId) && row.category === rubro &&
      this.categoryMatches(row.category) && this.lineMatches(row.line) && this.sublineMatches(row.subline));
  }

  readonly sizeChartRows = computed(() => {
    const rubro = this.sizeRubro(); const system = this.shoeSizeSystem();
    const products = this.sizeProductsForChart(rubro);
    const rows = new Map<string, SizeChartRow>();
    const add = (row: { productId: string; productCode?: string; category?: string; line?: string; product?: string }, field: 'sales' | 'stock' | 'transfers', value: number) => {
      const size = resolveProductSize(row, rubro, system); if (!size) return;
      const key = `${size.sort}|${size.label}`;
      const current = rows.get(key) || { label: size.label, sort: size.sort, codes: new Set<string>(), productIds: new Set<string>(), sales: 0, stock: 0, transfers: 0 };
      current.codes.add(size.code); current.productIds.add(row.productId); current[field] += Number(value) || 0;
      rows.set(key, current);
    };
    const period = this.sizeSalesPeriod();
    const cutoffPeriod = Number((this.data()?.metadata.stockCutoff || '').slice(0, 7).replace('-', ''));
    const currentKey = `${period}-${rubro}`;
    const salesRows = this.sizeSalesLoadedKey() === currentKey
      ? this.sizeSalesData().filter(row => this.filteredStoreIds().has(row.storeId) && this.categoryMatches(row.category) && this.lineMatches(row.line) && this.sublineMatches(row.subline))
      : [];
    if (this.sizeMetric() !== 'SALES' || salesRows.length || (period === cutoffPeriod && this.sizeSalesLoadedKey() === 'legacy'))
      for (const row of products) add(row, 'stock', row.stockUnits);
    if (salesRows.length) for (const row of salesRows) add(row, 'sales', row.units90);
    else if (period === cutoffPeriod && this.sizeSalesLoadedKey() === 'legacy')
      for (const row of products) add(row, 'sales', row.units90 ?? row.units30);
    if (this.sizeMetric() === 'TRANSFERS') {
      const eligible = new Set(this.sizeTransfersForChart(rubro).map(row => row.productId));
      const routes = this.storeTransferRoutes()?.filter(row => row.category === rubro && eligible.has(row.productId))
        ?? stockTransfers(this.sizeTransfersForChart(rubro));
      for (const transfer of routes) add(transfer, 'transfers', transfer.suggested);
    }
    return [...rows.values()].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'es'));
  });

  readonly sizeChartCoverage = computed(() => {
    const rubro = this.sizeRubro(); const system = this.shoeSizeSystem();
    const products = this.sizeMetric() === 'SALES' && this.sizeSalesLoadedKey() === `${this.sizeSalesPeriod()}-${rubro}`
      ? this.sizeSalesData().filter(row => this.filteredStoreIds().has(row.storeId) && this.categoryMatches(row.category) && this.lineMatches(row.line) && this.sublineMatches(row.subline))
      : this.sizeProductsForChart(rubro);
    const unique = new Map<string, ProductRow | SizeProductRow>();
    for (const row of products) if (!unique.has(row.productId)) unique.set(row.productId, row);
    const coded = [...unique.values()].filter(row => !!row.productCode);
    const mapped = coded.filter(row => !!resolveProductSize(row, rubro, system));
    return { total: unique.size, coded: coded.length, mapped: mapped.length, pending: Math.max(0, unique.size - mapped.length) };
  });

  readonly sizeMetricLabel = computed(() => ({ SALES: 'VENTA 90D', STOCK: 'STOCK', TRANSFERS: 'TRASLADO SUGERIDO' })[this.sizeMetric()]);
  readonly sizeDistributionOption = computed<EChartsOption>(() => {
    const rows = this.sizeChartRows(); const metric = this.sizeMetric(); const rubro = this.sizeRubro();
    const stockReady = this.sizeDetailLoaded()[rubro] || this.stockDetailLoaded();
    const field: Record<SizeMetric, keyof Pick<SizeChartRow, 'sales' | 'stock' | 'transfers'>> = { SALES: 'sales', STOCK: 'stock', TRANSFERS: 'transfers' };
    const color = metric === 'SALES' ? C.navy : metric === 'STOCK' ? C.teal : C.gold;
    const values = rows.map(row => Number(row[field[metric]]) || 0);
    if (!rows.length) return {
      animation: false,
      graphic: this.productCodeLoading() ? [] : [{ type: 'text', left: 'center', top: 'middle', style: { text: 'SIN CÓDIGOS DE TALLA MAPEADOS', fill: '#64748B', fontSize: 11, fontWeight: 800 } }]
    } as EChartsOption;
    return {
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, position: this.tooltipToRight, formatter: (params: any[]) => {
        const row = rows[params[0]?.dataIndex ?? 0];
        return this.tooltip(`${rubro === 'CALZADO' ? this.shoeSizeSystem() : 'TALLA'} ${row?.label || ''}`, [
          { label: 'Venta 90D', value: this.number(row?.sales ?? null, ' und') },
          { label: 'Stock actual', value: stockReady ? this.number(row?.stock ?? null, ' und') : 'Abre la talla para ver stock' },
          { label: 'Traslado sugerido', value: this.number(row?.transfers ?? null, ' und') },
          { label: 'SKU', value: this.number(row?.productIds.size ?? null) },
          { label: 'Sufijo Nissei', value: [...(row?.codes || [])].sort().join(', ') || 'N/A' }
        ]);
      } },
      grid: { left: 48, right: 20, top: 16, bottom: 72 },
      xAxis: { type: 'category', data: rows.map(row => row.label), axisTick: { show: false }, axisLine: { lineStyle: { color: '#CBD5E1' } }, axisLabel: { interval: 0, rotate: 90, align: 'right', verticalAlign: 'middle', margin: 32, color: '#475569', fontSize: 9, fontWeight: 800 } },
      yAxis: { type: 'value', min: 0, minInterval: 1, name: 'UNIDADES', nameTextStyle: { color: '#64748B', fontSize: 8, fontWeight: 800 }, axisLabel: { color: '#64748B', fontSize: 8, formatter: (value: number) => this.short(value) }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      series: [{ name: this.sizeMetricLabel(), type: 'bar', barMaxWidth: 26, data: values.map((value, index) => ({ value, size: rows[index].label, itemStyle: { color, borderRadius: [4, 4, 0, 0] } })),
        label: { show: rows.length <= 14, position: 'top', color: '#334155', fontSize: 8, fontWeight: 800, formatter: (params: any) => Number(params.value) > 0 ? this.short(Number(params.value)) : '' } }]
    } as EChartsOption;
  });

  resetTransferFilters(): void {
    this.transferExpandedRow.set('');
    this.transferSize.set('');
    this.transferRubro.set(''); this.transferLine.set(''); this.transferBrand.set(''); this.transferStore.set('');
    this.transferSearch.set(''); this.transferPriority.set(''); this.transferPage.set(0);
  }
  openSizeTransfers(): void {
    const resume = this.transferSizeMode();
    this.transferSizeMode.set(true);
    if (!resume) {
      this.transferSizeSystem.set(this.shoeSizeSystem());
      this.resetTransferFilters();
      this.transferRubro.set(this.sizeRubro());
    }
    if (this.expandedChart()) this.closeExpandedChart();
    this.toggleChartExpansion('stock-transfers');
    void this.ensureStockTransfers();
    requestAnimationFrame(() => document.querySelector('app-root')?.shadowRoot?.querySelector<HTMLSelectElement>('.transfer-modal select')?.focus());
  }
  openSizeChart(): void {
    this.closeExpandedChart();
    this.toggleChartExpansion('size-distribution');
    requestAnimationFrame(() => document.querySelector('app-root')?.shadowRoot?.querySelector<HTMLButtonElement>('.size-distribution-card .size-view-switch button')?.focus());
  }
  openTransfers(): void {
    this.transferSizeMode.set(false);
    this.resetTransferFilters();
    this.toggleChartExpansion('stock-transfers');
    void this.ensureStockTransfers();
    requestAnimationFrame(() => document.querySelector('app-root')?.shadowRoot?.querySelector<HTMLSelectElement>('.transfer-modal select')?.focus());
  }
  readonly predictiveBrandRows = computed<PredictiveBrand[]>(() => {
    const window = this.demandWindow(); const movementDays = Math.max(1, this.noMovementMonths()) * 30;
    const nonSellableRate = Math.min(.95, Math.max(0, .18 + this.predictiveMermaPct() / 100));
    const serverRows = this.stockInsightsData()?.brandRows;
    const brands = serverRows || [...grouped(this.predictiveScopedProducts(), row => row.brand || 'SIN MARCA').entries()]
      .map(([name, rows]) => ({ name, stockUnits: sum(rows, 'stockUnits'), stockValue: sum(rows, 'stockValue'),
        demandUnits: rows.reduce((total, row) => total + this.predictiveWindowUnits(row, window), 0),
        movementUnits: rows.reduce((total, row) => total + this.predictiveWindowUnits(row, movementDays), 0) }));
    return brands.map(({ name, stockUnits, stockValue, demandUnits, movementUnits }) => {
      const demandDaily = demandUnits / window; const vendibleUnits = stockUnits * (1 - nonSellableRate); const vendibleValue = stockValue * (1 - nonSellableRate);
      const coverageDays = demandDaily > 0 ? vendibleUnits / demandDaily : null; const status = this.predictiveStatus(coverageDays, movementUnits <= 0);
      const targetUnits = demandDaily * this.healthyCoverageDays(); const deficitUnits = Math.max(targetUnits - vendibleUnits, 0); const priority = this.predictivePriority(status.label, deficitUnits);
      return { name, stockUnits, stockValue, vendibleUnits, vendibleValue, demandUnits, demandDaily, coverageDays, status: status.label, color: status.color,
        targetUnits, deficitUnits, priority: priority.label, priorityColor: priority.color, priorityIndex: priority.index + (targetUnits > 0 ? deficitUnits / targetUnits * 20 : 0) };
    }).sort((a, b) => a.coverageDays == null ? 1 : b.coverageDays == null ? -1 : a.coverageDays - b.coverageDays);
  });
  readonly predictiveReplenishmentRows = computed(() => [...this.predictiveBrandRows()]
    .sort((a, b) => b.priorityIndex - a.priorityIndex || a.name.localeCompare(b.name)));
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
    const serverRows = this.stockInsightsData()?.healthRows;
    const raw = serverRows
      ? new Map(serverRows.map(row => [row.status, { value: row.value, products: row.products }]))
      : new Map([...grouped(this.predictiveProductHealthRows(), row => row.status).entries()]
        .map(([status, rows]) => [status, { value: rows.reduce((value, row) => value + row.vendibleValue, 0), products: rows.length }] as const));
    const total = [...raw.values()].reduce((value, row) => value + row.value, 0);
    return order.map(status => { const row = raw.get(status); const value = row?.value || 0;
      return { status, value, brands: row?.products || 0, share: total ? value / total : 0, color: colors[status] }; });
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
    const serverRows = this.stockInsightsData()?.priorityProducts;
    if (serverRows) return serverRows.map(row => ({ ...row, store: stores.get(row.storeId) || row.storeId }));
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
    const serverRows = this.stockInsightsData()?.projectionRows;
    if (serverRows) {
      for (const row of serverRows) {
        const bucket = buckets.get(row.status) || buckets.get('SIN ROTACIÓN')!;
        bucket.value += row.value; bucket.products += row.products;
      }
    } else {
      this.predictiveProductHealthRows().forEach(row => {
        const status = row.status === 'SIN ROTACIÓN' || row.coverageDays == null ? 'SIN ROTACIÓN' : this.predictiveStatus(Math.max(0, row.coverageDays - days), false).label;
        const bucket = buckets.get(status) || buckets.get('SIN ROTACIÓN')!; bucket.value += row.vendibleValue; bucket.products += 1;
      });
    }
    const raw = statuses.map(status => ({ status, ...buckets.get(status)!, color: colors[status] }));
    const total = raw.reduce((value, row) => value + row.value, 0);
    return raw.map(row => ({ ...row, share: total ? row.value / total : 0 }));
  }
  readonly predictiveProjectionRows = computed(() => this.coverageProjectionRowsFor(this.coverageProjectionHorizon()));
  readonly predictiveStoreRiskRows = computed(() => {
    const days = this.coverageProjectionHorizon();
    const stores = new Map((this.data()?.stores || []).map(store => [store.storeId, store.alias || store.store]));
    const serverRows = this.stockInsightsData()?.riskRows;
    if (serverRows) return serverRows.map(row => ({ ...row, store: stores.get(row.storeId) || row.storeId,
      share: row.totalValue ? row.riskValue / row.totalValue : 0 }))
      .sort((a, b) => b.riskValue - a.riskValue).slice(0, 7);
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
    return stockExtremes(this.inventoryProductsIgnoringStoreFilter());
  });

  readonly inventoryHierarchyRowsIgnoringStoreFilter = computed(() => {
    const ids = this.inventoryStoreIdsIgnoringStoreFilter();
    return this.stockHierarchyData().filter(row => ids.has(row.storeId) &&
      this.categoryMatches(row.category) && this.lineMatches(row.line) && this.sublineMatches(row.subline));
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
    const stockRows: Array<ProductRow | StockHierarchyRow> = hierarchyActive
      ? this.stockDetailLoaded() ? this.filteredProducts()
        : this.inventoryHierarchyRowsIgnoringStoreFilter().filter(row => selectedIds.has(row.storeId))
      : [];
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
  readonly stockOriginDetailPeriod = signal<number | null>(null);
  readonly stockOriginDetailRows = computed(() => {
    const period = this.stockOriginDetailPeriod();
    const rows = this.selectedStockOrigins().filter(row => row.originPeriodId === period);
    const stores = new Map((this.data()?.stores || []).map(store => [store.storeId, store.alias || store.store]));
    return [...grouped(rows, row => JSON.stringify([row.storeId, row.category, row.line, row.subline])).values()]
      .map(items => ({ storeId: items[0].storeId, store: stores.get(items[0].storeId) || items[0].storeId,
        category: items[0].category, line: items[0].line, subline: items[0].subline,
        units: sum(items, 'units'), value: sum(items, 'value') }))
      .sort((a, b) => b.units - a.units || a.store.localeCompare(b.store));
  });
  readonly stockOriginDetailTotals = computed(() => ({
    units: sum(this.stockOriginDetailRows(), 'units'), value: sum(this.stockOriginDetailRows(), 'value')
  }));
  openStockOriginDetail(event: { data: unknown }): void {
    const period = Number((event.data as { period?: number } | null)?.period);
    if (!Number.isInteger(period) || !this.selectedStockOrigins().some(row => row.originPeriodId === period)) return;
    this.stockOriginDetailPeriod.set(period);
    if (this.expandedChart()) this.expandedChart.set('antiquity-detail');
    else this.toggleChartExpansion('antiquity-detail');
    requestAnimationFrame(() => document.querySelector('app-root')?.shadowRoot?.querySelector<HTMLButtonElement>('.stock-origin-detail .chart-expand')?.focus());
  }
  readonly stockHistorySummary = computed(() => {
    const rows = this.selectedStockOrigins();
    const units = sum(rows, 'units'); const value = sum(rows, 'value'); const total = sum(this.stockOrigins(), 'units');
    return { units, value, share: total ? units / total : null };
  });

  private coverageStatus(days: number | null): { label: string; color: string } {
    if (days == null || !Number.isFinite(days)) return { label: 'FALTA INFORMACIÓN', color: C.slate };
    if (days < 30) return { label: 'CRÍTICO', color: C.red };
    if (days < 60) return { label: 'DÉFICIT', color: C.orange };
    if (days <= 120) return { label: 'ÓPTIMO · META 90D', color: C.green };
    return { label: 'EXCESO', color: C.blue };
  }
  readonly inventoryStoreMetrics = computed(() => aggregateStoreMetrics(this.stockDetailLoaded()
    ? this.inventoryProductsIgnoringStoreFilter() : this.inventoryHierarchyRowsIgnoringStoreFilter()));
  readonly coverageRows = computed<CoverageRow[]>(() => {
    const storeMap = new Map(this.inventoryStoresIgnoringStoreFilter().map(store => [store.storeId, store]));
    const groups = this.inventoryStoreMetrics();
    const predictiveByStore = new Map((this.data()?.predictiveStore || []).map(row => [row.storeId, row]));
    const stockByStore = new Map((this.data()?.stockStore || []).map(row => [row.storeId, row]));
    return [...storeMap.keys()].map(storeId => {
      const aggregate = groups.get(storeId);
      const hasRows = !!aggregate?.count;
      const predictive = predictiveByStore.get(storeId); const stock = stockByStore.get(storeId);
      const stockUnits = hasRows ? aggregate!.stockUnits : Number(predictive?.stockUnits ?? stock?.units) || 0;
      const stockValue = hasRows ? aggregate!.stockValue : Number(predictive?.stockValue ?? stock?.value) || 0;
      const units30 = hasRows ? aggregate!.units30 : Number(predictive?.units30) || 0;
      const sales30 = hasRows ? aggregate!.sales30 : Number(predictive?.sales30) || 0;
      const goodUnits = aggregate?.goodUnits || 0;
      const hasStateBreakdown = aggregate?.hasStateBreakdown || false;
      const effectiveUnits = hasStateBreakdown ? goodUnits : stockUnits * (1 - (this.data()?.metadata.nonSellableRate ?? .18));
      const calculatedDays = units30 > 0 ? effectiveUnits * 30 / units30 : null;
      const days = hasRows ? calculatedDays : (predictive?.coverageDays ?? calculatedDays);
      const status = this.coverageStatus(days);
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
    const stores = (this.companyRankingData()?.stores || this.data()?.stores || []).filter(store => store.isStore)
      .filter(store => this.storeOverlapsPeriod(store, this.year() * 100 + 1, this.year() * 100 + 12));
    const closed = stores.filter(store => store.closingDate?.startsWith(`${this.year()}-`)).length;
    const active = Math.max(0, stores.length - closed);
    return `${stores.length} TIENDA${stores.length === 1 ? '' : 'S'} · ${active} ACTIVA${active === 1 ? '' : 'S'}${closed ? ` + ${closed} CERRADA${closed === 1 ? '' : 'S'}` : ''}`;
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
      grid: { left: 8, right: 14, top: 30, bottom: 52, containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: months.map(month => MONTHS[month - 1]), axisTick: { show: false }, axisLabel: { interval: 0, rotate: 90, align: 'right', verticalAlign: 'middle', margin: 30, color: '#64748B', fontSize: 8, hideOverlap: false } },
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
    const company = this.companyRankingData();
    const selectedMetrics = this.rankingMetrics();
    const selectedYear = this.year(); const periods = this.selectedPeriods();
    // El universo siempre incluye todas las tiendas que estuvieron vigentes en
    // algún momento del año, incluso si una cerró durante ese ejercicio.
    const candidates = (company?.stores || d.stores)
      .filter(store => store.isStore)
      .filter(store => this.storeOverlapsPeriod(store, selectedYear * 100 + 1, selectedYear * 100 + 12));
    const candidateIds = new Set(candidates.map(store => store.storeId));
    const factRows = company
      ? company.monthlyStore.filter(row => candidateIds.has(row.storeId) && periods.has(row.periodId))
      : this.dateRangeActive()
        ? this.dailyRowsInRange(candidateIds, true)
        : this.currentDimensionFilter(this.indexedRows(this.currentDimensionIndex(), periods, candidateIds));
    const groups = grouped(factRows, row => row.storeId);
    // El resumen de rotación por tienda ya viene en dashboard.json. Usarlo aquí
    // evita depender del detalle pesado de productos, que se carga recién en Inventario.
    const predictive = new Map((company?.predictiveStore || d.predictiveStore || []).map(row => [row.storeId, row]));
    const stockYear = Number(d.metadata.stockCutoff.slice(0, 4));
    const metrics = candidates.map(store => {
      const rows = groups.get(store.storeId) || [];
      const gross = sum(rows, 'gross');
      const positiveReal = sum(rows, 'positiveReal');
      const net = sum(rows, 'net');
      const transactions = sum(rows, 'transactions');
      const ticket = transactions > 0 ? net / transactions : 0;
      const predictiveRow = predictive.get(store.storeId);
      const rotation = selectedYear === stockYear && predictiveRow
        ? (predictiveRow.rotation ?? (predictiveRow.stockValue > 0 ? predictiveRow.sales30 / predictiveRow.stockValue : null))
        : null;
      const sellingAreaM2 = Math.max(0, Number(store.areaM2) || 0) * .8;
      const saleM2 = sellingAreaM2 > 0 ? net / sellingAreaM2 : 0;
      const markup = gross > 0 ? (positiveReal - gross) / gross : null;
      const label = `${store.alias || store.store}${store.closingDate?.startsWith(`${selectedYear}-`) ? ' · CERRADA' : ''}`;
      return { store, label, net, saleM2, ticket, rotation, markup };
    });
    const metricValue = (row: (typeof metrics)[number], metric: RankingMetric): number | null => {
      if (metric === 'ROTATION') return row.rotation;
      if (metric === 'MARKUP') return row.markup;
      if (metric === 'TICKET') return row.ticket;
      return row.saleM2;
    };
    const metricLabel: Record<RankingMetric, string> = {
      ROTATION: 'Rotación', MARKUP: 'Markup', TICKET: 'Ticket prom.', SALE_M2: 'Venta × m²'
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
    const formatMetric = (metric: RankingMetric, value: number | null): string => {
      if (value == null) return 'N/A';
      if (metric === 'ROTATION' || metric === 'MARKUP') return this.percent(value);
      return this.money(value);
    };
    if (!rows.length) return {
      animation: false,
      graphic: [{ type: 'text', left: 'center', top: 'middle', style: { text: 'N/A PARA LOS FILTROS SELECCIONADOS', fill: '#64748B', fontSize: 11, fontWeight: 800 } }]
    } as EChartsOption;
    return {
      animation: false,
      tooltip: { trigger: 'item', confine: true, borderColor: C.gold, position: this.tooltipToRight, formatter: (params: any) => {
        const row = rows[params.dataIndex ?? 0];
        return this.tooltip(row.label, row.details.map(detail => ({
          label: `${metricLabel[detail.metric]} #${detail.points}`,
          value: formatMetric(detail.metric, detail.value)
        })));
      } },
      grid: { left: 48, right: 18, top: 25, bottom: 78 },
      xAxis: { type: 'category', data: rows.map(row => row.label), axisTick: { show: false }, axisLine: { lineStyle: { color: '#CBD5E1' } }, axisLabel: { interval: 0, rotate: 90, align: 'right', verticalAlign: 'middle', margin: 42, fontWeight: 800, color: '#475569', fontSize: 7, width: 62, overflow: 'truncate', lineHeight: 8 } },
      yAxis: { type: 'value', min: 0, max: positionScaleMax + 1, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
      series: [{ type: 'bar', data: rows.map((_, index) => positionScaleMax - index), barMaxWidth: 25, barCategoryGap: '22%', itemStyle: { color: singleMetric === 'ROTATION' ? C.green : singleMetric === 'MARKUP' ? C.teal : singleMetric === 'TICKET' ? C.purple : singleMetric === 'SALE_M2' ? C.blue : C.gold, borderRadius: [4, 4, 0, 0] },
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
    const hourRange = (hour: number) => `${hour}-${hour + 1}`;
    const peakTickets = Math.max(0, ...hours.map(row => row.transactions));
    const totalTickets = hours.reduce((total, row) => total + row.transactions, 0);
    const totalNet = hours.reduce((total, row) => total + row.net, 0);
    return {
      animation: false,
      color: [C.navy, C.teal],
      legend: { top: 0, right: 18, selectedMode: false, itemGap: 16, itemWidth: 13, itemHeight: 7, textStyle: { color: '#475569', fontSize: 8, fontWeight: 700 }, data: ['Tickets', 'Venta neta'] },
      tooltip: { trigger: 'item', confine: true, position: this.tooltipToRight, formatter: (params: any) => {
        const row = hours[params.dataIndex ?? 0]; return this.tooltip(hourRange(row?.hour ?? 0), [
          { label: 'Tickets', value: this.number(row?.transactions ?? null) },
          { label: 'Participación tickets', value: totalTickets ? this.percent((row?.transactions || 0) / totalTickets) : 'N/A' },
          { label: 'Venta neta', value: this.money(row?.net ?? null, true) },
          { label: 'Participación venta', value: totalNet ? this.percent((row?.net || 0) / totalNet) : 'N/A' },
          { label: 'Ticket promedio', value: this.money(row?.ticket ?? null) }
        ]);
      } },
      grid: { left: 50, right: 58, top: 30, bottom: 66 },
      xAxis: { type: 'category', triggerEvent: false, axisPointer: { show: false }, data: hours.map(row => hourRange(row.hour)), axisTick: { show: false }, axisLabel: { color: '#64748B', fontSize: 8, interval: 0, rotate: 90, align: 'right', verticalAlign: 'middle', margin: 32 } },
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
    const rows = (this.data()?.predictiveCategory || []).filter(row => ids.has(row.storeId));
    const groups = grouped(rows, row => this.areaHead(row.category));
    const totalValue = rows.reduce((total, row) => total + (Number(row.stockValue) || 0), 0);
    const colors: Record<string, string> = { TEXTIL: C.navy, CALZADO: C.red, HOGAR: C.gold, ELECTRO: C.blue, TECNOLOGIA: C.teal, 'PERFUMERÍA Y JOYERÍA': C.purple, 'FERRETERÍA Y AUTOMOTRIZ': C.orange, 'PRODUCTOS VARIOS': C.slate };
    return [...groups.entries()].map(([area, areaRows]) => {
      const value = areaRows.reduce((total, row) => total + (Number(row.stockValue) || 0), 0);
      return { area: area === 'TECNOLOGIA' ? 'TECNOLOGÍA' : area, value, units: areaRows.reduce((total, row) => total + (Number(row.stockUnits) || 0), 0), share: totalValue ? value / totalValue : 0, color: colors[area] || C.slate };
    }).filter(row => row.value > 0).sort((a, b) => b.value - a.value);
  });

  readonly inventoryOverviewTotals = computed(() => {
    const ids = this.filteredStoreIds();
    const rows = (this.data()?.stockStore || []).filter(row => ids.has(row.storeId));
    return { units: sum(rows, 'units'), value: sum(rows, 'value'),
      capacity: this.filteredStores().reduce((total, store) => total + (store.capacity || 0), 0) };
  });

  readonly inventoryOverviewOption = computed<EChartsOption>(() => {
    const rows = this.inventoryAreaSummary();
    const totals = this.inventoryOverviewTotals();
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
    // de esa forma el motor reactivo tampoco registra esas señales como dependencias del
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
    const visibleBrandLabels = new Set<number>();
    values.slice(0, visible).map((row, index) => ({ index, share: row.share }))
      .filter(row => row.share >= .025)
      .sort((left, right) => right.share - left.share)
      .forEach(row => {
        if (visibleBrandLabels.size < 4 && [...visibleBrandLabels].every(index => Math.abs(index - row.index) > 1)) {
          visibleBrandLabels.add(row.index);
        }
      });
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
        label: { show: true, position: 'top', formatter: (params: any) => visibleBrandLabels.has(params.dataIndex) ? this.percent(values[params.dataIndex]?.share ?? null) : '', color: '#172033', fontSize: 10, fontWeight: 700, distance: 5, backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderWidth: 1, padding: [2, 4], borderRadius: 3 } }]
    } as EChartsOption;
  });
  readonly brandSummary = computed<BrandSummary[]>(() => {
    this.brandDetailLoaded();
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
  readonly priceRangeComparisonYears = computed(() => (this.data()?.metadata.years || [])
    .filter(year => year >= 2024 && year !== this.year()).sort((a, b) => b - a));
  readonly effectivePriceRangeComparisonYear = computed(() => this.priceRangeComparisonYears().includes(this.priceRangeComparisonYear())
    ? this.priceRangeComparisonYear() : this.priceRangeComparisonYears()[0] || this.year() - 1);
  private priceRangeSummaryFor(year: number, base = false) {
    this.priceRangeData();
    const ids = this.filteredStoreIds(); const periods = this.activeMonths().map(month => year * 100 + month);
    const rows = (base && this.dateRangeActive() ? this.dailyRowsForSelection(ids) : this.indexedRows(this.monthlyPriceRangeIndex, periods, ids)).filter(row =>
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
    return values.map(value => ({ ...value, year, share: total ? value.net / total : null, averagePrice: value.units ? value.net / value.units : null }));
  }
  readonly priceRangeSummary = computed(() => [
    ...this.priceRangeSeries().base,
    ...this.priceRangeSeries().comparison,
  ]);
  readonly priceRangeSeries = computed(() => ({
    base: this.priceRangeSummaryFor(this.year(), true),
    comparison: this.priceRangeSummaryFor(this.effectivePriceRangeComparisonYear()),
  }));
  setPriceRangeComparisonYear(value: number | string): void {
    const year = Number(value);
    if (!this.priceRangeComparisonYears().includes(year) || year === this.priceRangeComparisonYear()) return;
    this.cancelPendingSectionLoads();
    this.priceRangeComparisonYear.set(year);
    this.priceRangeData.set([]);
    this.monthlyPriceRangeIndex.clear();
    this.priceRangeDetailLoaded.set(false);
    void this.ensurePriceRangeDetail();
    if (this.selectedSublines().length || this.selectedLines().length || this.selectedCategories().length) this.deferHierarchyDetails();
  }
  readonly priceRangeOption = computed<EChartsOption>(() => {
    const { base, comparison } = this.priceRangeSeries();
    const bands = base.map(value => value.label); const baseYear = this.year(); const comparisonYear = this.effectivePriceRangeComparisonYear();
    const totals = { base: base.reduce((value, row) => value + row.net, 0), comparison: comparison.reduce((value, row) => value + row.net, 0) };
    const priceScale = adaptiveValueScale([...base, ...comparison].map(value => value.net), 3);
    const valueName = (year: number) => `VENTA ${year}`; const unitsName = (year: number) => `UNIDADES ${year}`;
    // Selección estable de porcentajes destacados, separados al menos por una
    // banda. Evita el amontonamiento y decisiones de ocultación dependientes
    // del momento en que ECharts mide el lienzo.
    const visibleShares = new Set<number>();
    base.map((row, index) => ({ index, share: totals.base ? row.net / totals.base : 0 }))
      .filter(row => row.share >= .02)
      .sort((left, right) => right.share - left.share)
      .forEach(row => {
        if (visibleShares.size < 4 && [...visibleShares].every(index => Math.abs(index - row.index) > 1)) visibleShares.add(row.index);
      });
    const shareLabel = (total: number) => ({ show: true, position: 'top' as const, formatter: (params: any) => {
      const share = total ? Number(params.value) / total : 0;
      return visibleShares.has(params.dataIndex) ? this.percent(share) : '';
    }, color: '#172033', fontSize: 8, fontWeight: 700, distance: 3, backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderWidth: 1, padding: [1, 3], borderRadius: 3 });
    return {
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, position: this.tooltipToRight, padding: [6, 8], textStyle: { fontSize: 10 }, formatter: (params: any[]) => {
        const index = params[0]?.dataIndex ?? 0; const current = base[index]; const previous = comparison[index];
        return this.tooltip(current?.label || previous?.label || '', [
          { label: valueName(baseYear), value: this.money(current?.net ?? null, true) }, { label: unitsName(baseYear), value: this.number(current?.units ?? null, ' und') },
          { label: valueName(comparisonYear), value: this.money(previous?.net ?? null, true) }, { label: unitsName(comparisonYear), value: this.number(previous?.units ?? null, ' und') },
        ]);
      } },
      legend: { data: [valueName(baseYear), valueName(comparisonYear), unitsName(baseYear), unitsName(comparisonYear)], top: 0, left: 'center', itemWidth: 18, itemHeight: 8, textStyle: { fontSize: 9, fontWeight: 800 } },
      grid: { left: 58, right: 58, top: 46, bottom: 78 },
      xAxis: { type: 'category', data: bands, axisTick: { show: false }, axisLabel: { interval: 0, rotate: 90, align: 'right', verticalAlign: 'middle', margin: 34, fontSize: 8, color: '#475569' }, axisLine: { lineStyle: { color: '#CBD5E1' } } },
      yAxis: [
        { type: 'value', min: 0, ...priceScale, axisLabel: { formatter: (value: number) => `S/ ${this.short(value)}`, color: '#64748B', fontSize: 9 }, splitLine: { lineStyle: { color: '#E5E7EB' } } },
        { type: 'value', min: 0, splitNumber: 3, axisLabel: { formatter: (value: number) => this.short(value), color: C.slate, fontSize: 9 }, splitLine: { show: false } }
      ],
      series: [
        { name: valueName(baseYear), type: 'bar', data: base.map(row => row.net), barMaxWidth: 24, z: 5, itemStyle: { color: '#BFD4F3', borderColor: C.navy, borderWidth: 1, borderRadius: [3, 3, 0, 0] }, label: shareLabel(totals.base) },
        { name: valueName(comparisonYear), type: 'bar', data: comparison.map(row => row.net), barMaxWidth: 24, z: 5, itemStyle: { color: '#E2E8F0', borderColor: C.slate, borderWidth: 1, borderRadius: [3, 3, 0, 0] } },
        { name: unitsName(baseYear), type: 'line', yAxisIndex: 1, data: base.map(row => row.units), symbol: 'circle', symbolSize: 6, z: 20, lineStyle: { width: 3, color: C.navy }, itemStyle: { color: C.navy, borderColor: '#FFFFFF', borderWidth: 1 } },
        { name: unitsName(comparisonYear), type: 'line', yAxisIndex: 1, data: comparison.map(row => row.units), symbol: 'diamond', symbolSize: 7, z: 20, lineStyle: { width: 3, type: 'dashed', color: C.slate }, itemStyle: { color: C.slate, borderColor: '#FFFFFF', borderWidth: 1 } },
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
      series: [{ type: 'bar', data: rows.map(row => ({ value: row.units, period: row.period })), barMaxWidth: 28, itemStyle: { color: C.indigo, borderRadius: [5, 5, 0, 0] }, label: { show: true, position: 'top', formatter: (params: any) => this.short(Number(params.value)), color: '#172033', fontSize: 10, fontWeight: 900, backgroundColor: 'rgba(255,255,255,.92)', padding: [1, 3], borderRadius: 3 } }]
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
    const groups = this.inventoryStoreMetrics();
    const rows = [...storeMap.entries()].map(([storeId, label]) => {
      const aggregate = groups.get(storeId);
      const sales = aggregate?.sales30 || 0; const value = aggregate?.stockValue || 0;
      const units = aggregate?.stockUnits || 0; const sold = aggregate?.units30 || 0;
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
      grid: { left: 38, right: this.expandedChart() === 'store-value-coverage' ? '25%' : '38%', top: 6, bottom: 30 },
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
    if (days < 60) return { status: 'DÉFICIT', tone: 'deficit', color: C.red };
    if (days <= 120) return { status: 'ÓPTIMO', tone: 'optimal', color: C.teal };
    return { status: 'EXCESO', tone: 'excess', color: C.navy };
  }
  readonly inventoryMatrixRows = computed<InventoryMatrixRow[]>(() => {
    const targetDays = 90;
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
      { label: 'DÉFICIT <60D', tone: 'deficit', count: rows.filter(row => row.tone === 'deficit').length },
      { label: 'ÓPTIMO 60–120D · META 90D', tone: 'optimal', count: rows.filter(row => row.tone === 'optimal').length },
      { label: 'EXCESO >120D', tone: 'excess', count: rows.filter(row => row.tone === 'excess').length }
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

  private readonly sizeSalesEffect = effect(onCleanup => {
    if (!this.data() || this.page() !== 2) return;
    const period = this.sizeSalesPeriod();
    const rubro = this.sizeRubro();
    const key = `${period}-${rubro}`;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    this.sizeSalesLoading.set(true);
    this.sizeSalesLoadedKey.set('');
    this.sizeSalesData.set([]);
    const file = `dashboard-size-sales-${Math.floor(period / 100)}-${String(period % 100).padStart(2, '0')}-${rubro.toLowerCase()}.json`;
    void this.loadDetail<{ sizeSales90: CompactRows }>(file, controller.signal).then(payload => {
      if (controller.signal.aborted) return;
      this.sizeSalesData.set(decodeCompactRows<SizeSaleRow>(payload.sizeSales90, controller.signal));
      this.sizeSalesLoadedKey.set(key);
    }).catch(() => {
      if (controller.signal.aborted) return;
      // Una publicación previa aún no contiene cortes históricos por talla.
      this.sizeSalesLoadedKey.set('legacy');
    }).finally(() => { if (!controller.signal.aborted) this.sizeSalesLoading.set(false); });
  });

  private readonly stockInsightsEffect = effect(onCleanup => {
    if (!this.cloud.portalEnabled || this.page() !== 2 || !this.stockInsightsActivated()) return;
    this.stockInsightsRetry();
    const stores = this.inventoryStoresIgnoringStoreFilter();
    const allowedStores = new Set(this.cloud.accessProfile()?.allowedStoreIds || []);
    const selectedStore = this.storeFilterLocked() ? stores[0]?.storeId : this.predictiveStore();
    const filters = {
      storeIds: stores.map(store => store.storeId).filter(id => allowedStores.has(id) && (selectedStore === 'TODAS' || id === selectedStore)),
      rubros: this.predictiveRubros(), lines: this.selectedLines(), sublines: this.selectedSublines(),
      windowDays: this.demandWindow(), movementDays: Math.max(1, this.noMovementMonths()) * 30,
      healthyDays: this.healthyCoverageDays(), overstockDays: this.overstockDays(),
      mermaPct: this.predictiveMermaPct(), horizonDays: this.coverageProjectionHorizon(),
    };
    if (!filters.storeIds.length) {
      this.stockInsightsData.set({ rowCount: 0, brandRows: [], healthRows: [], projectionRows: [], riskRows: [], priorityProducts: [] });
      this.stockDetailLoading.set(false);
      return;
    }
    const controller = new AbortController();
    this.stockInsightsData.set(null);
    this.stockDetailFailed.set(false);
    this.stockDetailLoading.set(true);
    this.stockDetailProgress.set(10);
    const timer = setTimeout(() => {
      this.cloud.stockInsights(filters, controller.signal).then(result => {
        if (controller.signal.aborted) return;
        this.stockInsightsData.set(result);
        this.stockDetailProgress.set(100);
      }).catch(error => {
        if (controller.signal.aborted) return;
        this.stockDetailFailed.set(true);
        this.predictiveNote.set(`La analítica de inventario no está disponible: ${error instanceof Error ? error.message : error}`);
      }).finally(() => {
        if (!controller.signal.aborted) this.stockDetailLoading.set(false);
      });
    }, 120);
    onCleanup(() => { clearTimeout(timer); controller.abort(); });
  });

  disposeReactRuntime(): void {
    this.stockTransferCalculationEffect.destroy();
    this.stockInsightsEffect.destroy();
    this.sizeSalesEffect.destroy();
  }

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
    this.goalLoadToken += 1;
    await this.cloud.signOut();
    this.releaseSectionDetails();
    this.data.set(null);
    this.operationalSummary.set(null);
    this.companyRankingData.set(null);
    this.storeGoalOverrides.set([]);
    this.annualGoalOverrides.set([]);
    this.storeGoalsReady.set(false);
    this.sellerPerformanceData.set([]);
    this.sellerDetailLoaded.set(false);
    this.loadingError.set('');
  }

  async retryDashboardLoad(): Promise<void> {
    this.loadingError.set('');
    await this.loadDashboardBase();
  }

  private async loadDashboardBase(): Promise<void> {
    const goalLoadToken = ++this.goalLoadToken;
    this.storeGoalsReady.set(false);
    this.companyRankingData.set(null);
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
      // Metas desbloquea el gráfico principal; iniciar esta consulta antes de
      // la analítica secundaria evita que compita por las conexiones del navegador.
      const goalsReady = this.cloud.storeGoals().then(result => {
        if (goalLoadToken !== this.goalLoadToken) return;
        this.storeGoalOverrides.set(result.goals); this.annualGoalOverrides.set(result.annualTargets);
      }).catch(() => {
        if (goalLoadToken !== this.goalLoadToken) return;
        this.storeGoalOverrides.set([]); this.annualGoalOverrides.set([]);
      }).finally(() => {
        if (goalLoadToken === this.goalLoadToken) this.storeGoalsReady.set(true);
      });
      // Los archivos de detalle compiten por las conexiones HTTP. Dar a metas
      // una ventana breve para terminar evita que quede esperando tras un 200.
      void Promise.race([goalsReady, new Promise<void>(resolve => setTimeout(resolve, 2500))]).then(() => {
        if (goalLoadToken !== this.goalLoadToken) return;
        this.cloud.operationalSummary().then(summary => this.operationalSummary.set(summary)).catch(() => this.operationalSummary.set(null));
        this.cloud.companyRanking().then(ranking => {
          if (goalLoadToken === this.goalLoadToken) this.companyRankingData.set(ranking);
        }).catch(() => {
          if (goalLoadToken === this.goalLoadToken) this.companyRankingData.set(null);
        });
        if (this.page() === 1) void this.ensurePriceRangeDetail();
      });
      const cutoffYear = Number(loaded.metadata.salesCutoff.slice(0, 4)); this.year.set(loaded.metadata.years.includes(cutoffYear) ? cutoffYear : Math.max(...loaded.metadata.years));
      this.selectedMonths.set([]); this.fromDate.set(''); this.toDate.set(''); this.orderCost.set(loaded.metadata.eoq.orderCost); this.holdingCost.set(loaded.metadata.eoq.annualHoldingCost);
      this.applyAccessScope();
      // Rango de precios se carga tras la consulta prioritaria de metas.
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
  toggleFilter(key: FilterKey, event: Event): void {
    event.preventDefault();
    if ((key === 'store' && this.storeFilterLocked()) || (key === 'cluster' && this.clusterFilterLocked()) || (key === 'gender' && !this.genderFilterEnabled())) return;
    this.closeCalendar();
    this.openFilter.set(this.openFilter() === key ? null : key);
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
        case 'talent-a': return { dotacionPromedio: metrics.personnel, capacidadTiendas: this.talentStoreRows().slice(0, 10), evolucionMensual: this.talentHistoryRows() };
        case 'talent-b': return { ventaColaborador: metrics.saleCollaborator, tiendaProductiva: this.talentStoreRows()[0], desempeno: this.talentSellerRows().slice(0, 10) };
        case 'talent-c': return { retirosRegistradosPorMotivo: this.talentExitRows(), dotacionPromedio: metrics.personnel };
        default: return {};
      }
    })();
    return JSON.stringify({ ...base, datos: data });
  }
  sectionAdviceFor(id: string): { text: string; loading: boolean; error: boolean } | null {
    return this.sectionAdvices()[id] ?? null;
  }
  private formatSectionAdvice(text: string): string {
    const clean = text.replace(/\*\*|__/g, '').replace(/(?:^|\n)\s*(?:HALLAZGO|LECTURA)\s*:[\s\S]*?(?=\bRECOMENDACI[ÓO]N\s*:|\bPR[ÓO]XIMO PASO\s*:|$)/gi, '').trim();
    const recommendation = clean.match(/RECOMENDACI[ÓO]N\s*:\s*([\s\S]*?)(?=\bPR[ÓO]XIMO PASO\s*:|$)/i)?.[1]?.trim();
    const next = clean.match(/PR[ÓO]XIMO PASO\s*:\s*([\s\S]*)/i)?.[1]?.trim();
    return [recommendation && `RECOMENDACIÓN: ${recommendation}`, next && `PRÓXIMO PASO: ${next}`].filter(Boolean).join('\n\n') || `RECOMENDACIÓN: ${clean}`;
  }
  async requestSectionAdvice(id: string, section: string): Promise<void> {
    if (!this.sectionAdviceEnabled() || this.sectionAdviceFor(id)?.loading) return;
    this.sectionAdvices.update(items => ({ ...items, [id]: { text: '', loading: true, error: false } }));
    try {
      const text = await this.assistant.ask([
        { role: 'user', content: `MODO CONSEJO POR BLOQUE. Sección: ${section}. Usa exclusivamente los indicadores entregados y no pidas aclaraciones. Responde en dos puntos breves y específicos: RECOMENDACIÓN (qué hacer y con qué indicador se sustenta) y PRÓXIMO PASO (acción concreta). No incluyas HALLAZGO ni LECTURA. Si un dato no existe, omítelo.` },
      ], this.sectionAdviceContext(id, section));
      this.sectionAdvices.update(items => ({ ...items, [id]: { text: this.formatSectionAdvice(text), loading: false, error: false } }));
    } catch {
      this.sectionAdvices.update(items => ({ ...items, [id]: { text: 'El consejo no está disponible en este momento. Los indicadores del bloque permanecen visibles.', loading: false, error: true } }));
    }
  }
  closeExpandedChart(): void {
    const wasTicket = this.expandedChart() === 'ticket-average';
    const wasConversion = this.expandedChart() === 'conversion-average';
    const wasTraffic = this.expandedChart() === 'traffic-average';
    this.expandedChart.set(null); this.setPageScrollLocked(false);
    if (wasTicket) document.querySelector('app-root')?.shadowRoot?.querySelector<HTMLElement>('.ticket-kpi')?.focus();
    if (wasConversion) document.querySelector('app-root')?.shadowRoot?.querySelector<HTMLElement>('.conversion-kpi')?.focus();
    if (wasTraffic) document.querySelector('app-root')?.shadowRoot?.querySelector<HTMLElement>('.traffic-kpi')?.focus();
  }
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
    this.invalidateSellerDetailForMonth();
    this.invalidatePriceRangeDetailForMonth();
  }
  toggleMonth(value: number): void {
    const month = Number(value); if (!this.availableMonths().includes(month)) return;
    // ÚNICA mutación de este evento: selectedMonths.
    this.selectedMonths.set(this.toggleValue(this.selectedMonths(), month).sort((a, b) => a - b));
    this.clearDateRange();
    this.invalidateSellerDetailForMonth();
    this.invalidatePriceRangeDetailForMonth();
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
  clearCategories(): void { this.selectedCategories.set([]); this.selectedGenders.set([]); this.selectedLines.set([]); this.selectedSublines.set([]); this.productId.set('AUTO'); this.invalidateSellerDetail(); this.invalidatePriceRangeDetail(); this.invalidateBrandDetail(); }
  toggleCategory(value: string): void {
    if (!this.categories().includes(value)) return;
    this.selectedCategories.set(this.toggleValue(this.selectedCategories(), value)); this.selectedGenders.set([]); this.selectedLines.set([]); this.selectedSublines.set([]); this.productId.set('AUTO');
    this.invalidateSellerDetail();
    this.invalidatePriceRangeDetail();
    this.invalidateBrandDetail();
    this.deferHierarchyDetails();
  }
  clearGenders(): void { this.selectedGenders.set([]); this.productId.set('AUTO'); }
  toggleGender(value: string): void {
    if (!this.genderFilterEnabled() || !GENDER_ORDER.includes(value)) return;
    this.selectedGenders.set(this.toggleValue(this.selectedGenders(), value)); this.productId.set('AUTO');
  }
  clearLines(): void { this.selectedLines.set([]); this.selectedSublines.set([]); this.productId.set('AUTO'); this.invalidateSellerDetail(); this.invalidatePriceRangeDetail(); this.invalidateBrandDetail(); this.deferHierarchyDetails(); }
  toggleLine(value: string): void {
    if (!this.lines().includes(value)) return;
    this.selectedLines.set(this.toggleValue(this.selectedLines(), value)); this.selectedSublines.set([]); this.productId.set('AUTO');
    this.invalidateSellerDetail();
    this.invalidatePriceRangeDetail();
    this.invalidateBrandDetail();
    this.deferHierarchyDetails();
  }
  clearSublines(): void { this.selectedSublines.set([]); this.productId.set('AUTO'); this.invalidateSellerDetail(); this.invalidatePriceRangeDetail(); this.invalidateBrandDetail(); this.deferHierarchyDetails(); }
  toggleSubline(value: string): void {
    if (!this.sublines().includes(value)) return;
    this.selectedSublines.set(this.toggleValue(this.selectedSublines(), value)); this.productId.set('AUTO');
    this.invalidateSellerDetail();
    this.invalidatePriceRangeDetail();
    this.invalidateBrandDetail();
    this.deferHierarchyDetails();
  }
  private hierarchyDetailTimer?: ReturnType<typeof setTimeout>;
  private deferHierarchyDetails(): void {
    if (this.hierarchyDetailTimer) clearTimeout(this.hierarchyDetailTimer);
    this.hierarchyDetailTimer = setTimeout(() => {
      // Solo la sublínea requiere el detalle completo; rubro y línea usan
      // agregados más livianos o índices presentes en el núcleo.
      if (this.selectedSublines().length) void this.ensureSublineDetail();
      if (this.selectedCategories().length || this.selectedLines().length || this.selectedSublines().length) {
        void this.ensureBrandDetail();
      }
    }, 250);
  }

  private invalidateBrandDetail(): void {
    this.brandDetailGeneration += 1;
    this.brandDetailAbort?.abort();
    this.brandDetailAbort = undefined;
    this.brandDetailPromise = undefined;
    this.monthlyBrandIndex = this.indexPeriodStore(this.data()?.monthlyBrand || []);
    this.brandDetailLoaded.set(false);
  }

  private invalidateSellerDetail(): void {
    this.sellerDetailGeneration += 1;
    this.sellerDetailAbort?.abort();
    this.sellerDetailAbort = undefined;
    this.sellerDetailPromise = undefined;
    this.sellerDetailLoading.set(false);
    this.sellerDetailLoaded.set(false);
    this.sellerPerformanceData.set([]);
    if (this.page() === 3) void this.ensureSellerDetail();
  }

  private invalidateSellerDetailForMonth(): void {
    if (this.selectedCategories().length || this.selectedLines().length || this.selectedSublines().length) {
      this.invalidateSellerDetail();
    }
  }

  private invalidatePriceRangeDetail(): void {
    this.priceRangeDetailGeneration += 1;
    this.priceRangeDetailAbort?.abort();
    this.priceRangeDetailAbort = undefined;
    this.brandDetailGeneration += 1;
    this.brandDetailAbort?.abort();
    this.brandDetailAbort = undefined;
    this.priceRangeDetailPromise = undefined;
    this.priceRangeDetailLoaded.set(false);
    this.monthlyPriceRangeIndex.clear();
    this.priceRangeData.set([]);
    if (this.page() === 1) void this.ensurePriceRangeDetail();
  }

  private invalidatePriceRangeDetailForMonth(): void {
    if (this.selectedCategories().length || this.selectedLines().length || this.selectedSublines().length) {
      this.invalidatePriceRangeDetail();
    }
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
    this.resetYearScopedDetails();
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
    this.cancelPendingSectionLoads();
    this.sectionAdvices.set({});
    this.page.set(value);
    if (this.selectedSublines().length || this.selectedLines().length || this.selectedCategories().length) this.deferHierarchyDetails();
    if (value === 1) { void this.ensurePriceRangeDetail(); return; }
    if (value === 3) {
      await this.nextPaint();
      if (this.page() !== value) return;
      void this.ensureSellerDetail();
      return;
    }
    if (value !== 2) return;
    await this.nextPaint();
    if (this.page() !== value) return;
    // La parte superior usa agregados de dashboard.json y aparece de inmediato.
    // Antigüedad pesa ~4 MB; el detalle por producto (~54 MB) se prepara en tiempo ocioso.
    void this.ensureStockOrigin();
    void this.ensureStockHierarchy();
    if (this.sizeMetric() !== 'SALES') void this.ensureSizeDetail(this.sizeRubro());
    if (this.sizeMetric() === 'TRANSFERS') void this.ensureStockTransfers();
    this.scheduleInventoryProductDetail();
  }

  private scheduleInventoryProductDetail(): void {
    if (this.cloud.portalEnabled) {
      this.stockInsightsActivated.set(true);
      return;
    }
    if (this.stockDetailLoaded() || this.stockDetailPromise || this.stockDetailFailed()) return;
    const start = (): void => {
      if (this.page() !== 2) return;
      void this.ensureStockDetail().then(() => {
        if (this.page() === 2 && this.stockDetailLoaded()) void this.ensurePredictiveDetail();
      });
    };
    const idleWindow = typeof window === 'undefined' ? undefined : window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    };
    const observe = (): void => {
      if (this.page() !== 2 || this.stockDetailLoaded() || this.stockDetailPromise) return;
      if (typeof document === 'undefined') { start(); return; }
      const target = document.querySelector('app-root')?.shadowRoot?.querySelector('.stock-product-detail-trigger');
      if (!target || typeof IntersectionObserver === 'undefined') { start(); return; }
      this.stockDetailObserver?.disconnect();
      this.stockDetailObserver = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        this.stockDetailObserver?.disconnect();
        this.stockDetailObserver = undefined;
        start();
      }, { rootMargin: '400px 0px' });
      this.stockDetailObserver.observe(target);
    };
    if (idleWindow?.requestIdleCallback) idleWindow.requestIdleCallback(observe, { timeout: 250 });
    else setTimeout(observe, 0);
  }
  private cancelPendingSectionLoads(): void {
    this.sectionLoads.release();
    this.stockDetailObserver?.disconnect(); this.stockDetailObserver = undefined;
    this.sellerDetailGeneration += 1;
    this.sellerDetailAbort?.abort();
    this.sellerDetailAbort = undefined;
    this.priceRangeDetailGeneration += 1;
    this.priceRangeDetailAbort?.abort();
    this.priceRangeDetailAbort = undefined;
    if (this.hierarchyDetailTimer) clearTimeout(this.hierarchyDetailTimer);
    this.stockDetailPromise = undefined; this.stockOriginPromise = undefined; this.stockHierarchyPromise = undefined;
    this.stockTransfersPromise = undefined; this.legacyStockPromise = undefined;
    this.sizeDetailPromises.clear();
    this.predictiveDetailPromise = undefined; this.sellerDetailPromise = undefined;
    this.brandDetailPromise = undefined; this.sublineDetailPromise = undefined; this.priceRangeDetailPromise = undefined;
    this.detailLoading.set(false); this.stockDetailLoading.set(false); this.stockDetailProgress.set(0); this.productCodeLoading.set(false);
    this.predictiveDetailLoading.set(false); this.sellerDetailLoading.set(false);
  }
  private resetYearScopedDetails(): void {
    this.cancelPendingSectionLoads();
    this.sellerPerformanceData.set([]); this.sellerDetailLoaded.set(false);
    this.priceRangeData.set([]); this.monthlyPriceRangeIndex.clear(); this.priceRangeDetailLoaded.set(false);
    this.monthlyBrandIndex = this.indexPeriodStore(this.data()?.monthlyBrand || []);
    this.monthlySublineIndex = this.indexPeriodStore(this.data()?.monthlySubline || []);
    this.brandDetailLoaded.set(false); this.sublineDetailLoaded.set(false);
    this.data.update(data => data ? { ...data } : data);

    if (this.page() === 1) void this.ensurePriceRangeDetail();
    if (this.page() === 3) void this.ensureSellerDetail();
    if (this.page() === 2) {
      if (!this.stockOriginLoaded()) void this.ensureStockOrigin();
      if (!this.stockHierarchyLoaded()) void this.ensureStockHierarchy();
      if (this.sizeMetric() !== 'SALES' && !this.sizeDetailLoaded()[this.sizeRubro()]) void this.ensureSizeDetail(this.sizeRubro());
      if (this.sizeMetric() === 'TRANSFERS' && !this.stockTransfersLoaded()) void this.ensureStockTransfers();
      this.scheduleInventoryProductDetail();
    }
    if (this.selectedSublines().length || this.selectedLines().length || this.selectedCategories().length) this.deferHierarchyDetails();
  }
  private releaseSectionDetails(): void {
    this.cancelPendingSectionLoads();
    this.stockInsightsActivated.set(false); this.stockInsightsData.set(null);
    this.stockProductsByStore.clear(); this.stockProductsByCategory.clear(); this.predictiveProductsByProduct.clear();
    this.stockProductsData.set([]); this.staticPredictiveProductsData.set([]); this.stockOriginData.set([]);
    this.stockHierarchyData.set([]); this.stockHierarchyLoaded.set(false);
    this.stockTransferProductsData.set([]); this.stockTransfersLoaded.set(false); this.stockTransfersError.set('');
    this.storeTransferRoutes.set(null); this.storeTransferStores.set([]);
    this.sizeProductsData.set({ CALZADO: [], TEXTIL: [] });
    this.sizeDetailLoaded.set({ CALZADO: false, TEXTIL: false });
    this.stockAggregateByStore.set(new Map()); this.predictiveAggregateByStore.set(new Map());
    this.predictiveAggregateByProduct.set(new Map()); this.predictiveIndex.set(new Map());
    this.stockDetailLoaded.set(false); this.stockOriginLoaded.set(false); this.stockDetailFailed.set(false);
    this.predictiveDetailLoaded.set(false); this.predictiveDetailFailed.set(false); this.predictiveDetailLoading.set(false);
    this.detailLoading.set(false); this.stockDetailLoading.set(false); this.stockDetailProgress.set(0); this.productCodeLoading.set(false); this.predictiveNote.set('');
    this.sellerPerformanceData.set([]); this.sellerDetailLoaded.set(false); this.sellerDetailLoading.set(false);
    this.priceRangeData.set([]); this.monthlyPriceRangeIndex.clear(); this.priceRangeDetailLoaded.set(false);
    this.monthlyBrandIndex = this.indexPeriodStore(this.data()?.monthlyBrand || []);
    this.monthlySublineIndex = this.indexPeriodStore(this.data()?.monthlySubline || []);
    this.brandDetailLoaded.set(false); this.sublineDetailLoaded.set(false);
    // Invalidates computations using non-reactive indexes as well.
    this.data.update(data => data ? { ...data } : data);
    // Los valores calculados retienen el último resultado hasta que vuelven a leerse.
    // Evaluate product-level caches against the cleared source to release old rows.
    this.filteredProducts(); this.staticPredictiveProducts(); this.predictiveProducts(); this.activeProductRows();
    this.predictiveScopedProducts(); this.transferProducts(); this.transferLines(); this.transferBrands();
    this.transferFilteredProducts(); this.transferAllRecommendations(); this.transferPageRows(); this.transferSummary(); this.transferMatrixRows(); this.transferMatrixStores();
    this.predictiveHealthOption(); this.predictiveBreakageOption(); this.predictiveReplenishmentOption();
    this.predictiveProjectionOption(); this.predictivePriorityProducts(); this.productExtremes();
    this.inventoryProductsIgnoringStoreFilter(); this.stockOriginDetailRows(); this.stockOrigins(); this.selectedStockOrigins();
    this.talentSellerRows(); this.sellerPerformanceOption();
    this.yearRows(); this.monthRows(); this.previousYearRows(); this.previousMonthRows();
  }
  retryStockDetail(): void {
    this.stockDetailFailed.set(false);
    this.predictiveNote.set('');
    if (this.cloud.portalEnabled) {
      this.stockInsightsRetry.update(value => value + 1);
      return;
    }
    this.scheduleInventoryProductDetail();
  }
  retryProductCodes(): void {
    if (this.productCodeLoading()) return;
    const products = this.stockProductsData();
    const missingCodes = [...new Set(products.filter(row => !row.productCode).map(row => row.productId))];
    if (!missingCodes.length || !this.cloud.portalEnabled) return;
    this.transferCodeError.set(false);
    void this.enrichProductCodes(products, missingCodes, this.sectionLoads.signal);
  }
  selectStore(id: string): void { if (!this.storeFilterLocked()) this.toggleStore(id); }
  resetFilters(): void {
    const cutoff = this.data()?.metadata.salesCutoff || ''; this.year.set(Number(cutoff.slice(0, 4))); this.selectedMonths.set([]); this.fromDate.set(''); this.toDate.set('');
    this.selectedClusters.set([]); this.selectedFormats.set([]); this.selectedStores.set([]); this.selectedCategories.set([]); this.selectedGenders.set([]); this.selectedLines.set([]); this.selectedSublines.set([]);
    this.productId.set('AUTO'); this.demandWindow.set(30); this.orderCost.set(this.data()?.metadata.eoq.orderCost || 5000); this.holdingCost.set(this.data()?.metadata.eoq.annualHoldingCost || 8);
    this.replenishmentType.set('internal'); this.internalLeadTime.set(30); this.supplierLeadTime.set(30); this.securityDays.set(15);
    this.predictiveRubros.set(['TEXTIL', 'CALZADO']); this.genderRubros.set(['TEXTIL', 'CALZADO']); this.rankingMetrics.set(['ROTATION', 'MARKUP', 'TICKET', 'SALE_M2']); this.predictiveStore.set('TODAS'); this.healthyCoverageDays.set(90); this.overstockDays.set(120); this.noMovementMonths.set(3); this.predictiveMermaPct.set(2); this.rotationView.set('rotation');
    this.demandWindowUnit.set('MONTHS'); this.healthyCoverageUnit.set('MONTHS'); this.overstockUnit.set('MONTHS'); this.noMovementUnit.set('MONTHS'); this.leadTimeUnit.set('DAYS');
    this.openFilter.set(null); this.filterSearch.set({ month: '', store: '', category: '', gender: '', line: '', subline: '', cluster: '', format: '' }); this.stockHistoryBucketsSelected.set([]);
    this.calendarOpen.set(false);
    this.applyAccessScope();
    this.invalidateSellerDetail();
    this.invalidatePriceRangeDetail();
    this.invalidateBrandDetail();
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
    return dashboardMoneyFormat.format(value);
  }
  number(value: number | null, suffix = ''): string { return value == null || !Number.isFinite(value) ? 'N/A' : `${dashboardNumberFormat.format(value)}${suffix}`; }
  timeValue(value: number, unit: PredictiveTimeUnit): number { return Math.max(1, Math.round(value / (unit === 'YEARS' ? 365 : 30))); }
  monthTimeValue(value: number, unit: PredictiveTimeUnit): number { return Math.max(1, Math.round(value / (unit === 'YEARS' ? 12 : 1))); }
  leadTimeValue(): number { return Number((this.internalLeadTime() / (this.leadTimeUnit() === 'MONTHS' ? 30 : 1)).toFixed(2)); }
  percent(value: number | null): string { return value == null || !Number.isFinite(value) ? 'N/A' : dashboardPercentFormat.format(value); }
  trend(value: number | null): string { return value == null ? 'N/A' : `${value >= 0 ? '▲' : '▼'} ${this.percent(Math.abs(value))}`; }

  private async loadDetail<T>(file: string, signal?: AbortSignal, onProgress?: (progress: number) => void): Promise<T> {
    signal?.throwIfAborted();
    onProgress?.(1);
    const source = await this.cloud.jsonSource(file);
    signal?.throwIfAborted();
    const fallbackUrls = [
      `assets/data/${file}`,
      `./assets/data/${file}`,
      `/${file}`,
      `./${file}`,
    ];

    if (typeof Worker === 'undefined') {
      const loadUrls = async (urls: string[], encoding: 'identity' | 'gzip'): Promise<T> => {
        const chunks: BlobPart[] = [];
        for (let index = 0; index < urls.length; index += 1) {
          const url = urls[index];
          const response = await fetch(url, { cache: 'default', signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          chunks.push(await response.blob());
          onProgress?.(Math.round(((index + 1) / urls.length) * 82));
        }
        let stream: ReadableStream<Uint8Array> = new Blob(chunks).stream();
        if (encoding === 'gzip') {
          if (typeof DecompressionStream === 'undefined') throw new Error('El navegador no admite archivos comprimidos.');
          const decompressor = new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>;
          stream = stream.pipeThrough(decompressor);
        }
        onProgress?.(90);
        const result = JSON.parse(await new Response(stream).text()) as T;
        onProgress?.(100);
        return result;
      };
      try {
        return await loadUrls(source.urls, source.encoding);
      } catch {
        signal?.throwIfAborted();
        if (this.cloud.remoteEnabled()) throw new Error(`No se pudo cargar ${file} de la versión autorizada.`);
        const attempted = new Set(source.urls);
        for (const url of fallbackUrls) {
          signal?.throwIfAborted();
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
      const finish = (): void => { worker.terminate(); signal?.removeEventListener('abort', abort); };
      const abort = (): void => { finish(); reject(signal?.reason ?? new DOMException('Carga cancelada', 'AbortError')); };
      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = ({ data }: MessageEvent<{ progress: number } | { ok: boolean; data?: T; error?: string }>) => {
        if ('progress' in data) {
          onProgress?.(Math.max(1, Math.min(99, data.progress)));
          return;
        }
        finish();
        if (data.ok) {
          onProgress?.(100);
          resolve(data.data as T);
        } else reject(new Error(`${data.error || 'Error desconocido'} en ${file}`));
      };
      worker.onerror = event => {
        finish();
        reject(new Error(`${event.message || 'No se pudo cargar el detalle'} en ${file}`));
      };
      worker.postMessage(source);
    });
  }

  private async loadYearDetail<T extends { periodId: number }>(
    legacyFile: string,
    key: string,
    years: number[],
    signal?: AbortSignal,
    onProgress?: (progress: number) => void,
  ): Promise<T[]> {
    const selectedYears = [...new Set(years.filter(year => Number.isInteger(year) && year > 0))].sort((a, b) => a - b);
    if (!selectedYears.length) return [];
    const partitionName = (year: number) => legacyFile.replace(/\.json$/i, `-${year}.json`);
    if (['sellerPerformance', 'monthlyBrand', 'monthlySubline', 'monthlyPriceRange'].includes(key)) {
      try {
        const payloads = await Promise.all(selectedYears.map(year => this.loadDetail<Record<string, CompactRows>>(
          legacyFile.replace(/\.json$/i, `-compact-${year}.json`), signal,
        )));
        signal?.throwIfAborted();
        const rows = payloads.flatMap(payload => decodeCompactRows<T>(payload[key], signal));
        signal?.throwIfAborted();
        return rows;
      } catch {
        signal?.throwIfAborted();
        // Las publicaciones antiguas contienen los detalles anuales sin codificar.
      }
    }
    try {
      const payloads = await Promise.all(selectedYears.map((year, index) => this.loadDetail<Record<string, T[]>>(
        partitionName(year),
        signal,
        progress => onProgress?.(Math.round(((index + progress / 100) / selectedYears.length) * 100)),
      )));
      signal?.throwIfAborted();
      return payloads.flatMap(payload => Array.isArray(payload[key]) ? payload[key] : []);
    } catch (error) {
      signal?.throwIfAborted();
      // Las publicaciones anteriores a la partición anual siguen siendo válidas.
      const payload = await this.loadDetail<Record<string, T[]>>(legacyFile, signal, onProgress);
      const allowed = new Set(selectedYears);
      return (Array.isArray(payload[key]) ? payload[key] : [])
        .filter(row => allowed.has(Math.floor(Number(row.periodId) / 100)));
    }
  }

  private loadLegacyStock(signal = this.sectionLoads.signal): Promise<{ stockOrigin: StockOrigin[]; stockProducts: ProductRow[] }> {
    signal.throwIfAborted();
    if (!this.legacyStockPromise) {
      this.legacyStockPromise = this.loadDetail<{ stockOrigin: StockOrigin[]; stockProducts: ProductRow[] }>('dashboard-stock.json', signal);
    }
    return this.legacyStockPromise;
  }
  private async ensureBrandDetail(): Promise<void> {
    if (this.brandDetailLoaded()) return;
    if (this.brandDetailPromise) return this.brandDetailPromise;
    const controller = new AbortController();
    this.brandDetailAbort = controller;
    const signal = controller.signal;
    const generation = this.brandDetailGeneration;
    const categoryOnly = this.selectedCategories().length > 0 && !this.selectedLines().length && !this.selectedSublines().length;
    this.brandDetailPromise = (async () => {
      try {
        let rows: BrandRow[];
        if (categoryOnly) {
          try {
            const payload = await this.loadDetail<{ monthlyBrand: BrandRow[] }>(`dashboard-brand-category-${this.year()}.json`, signal);
            rows = payload.monthlyBrand || [];
          } catch {
            signal.throwIfAborted();
            rows = await this.loadYearDetail<BrandRow>('dashboard-brand.json', 'monthlyBrand', [this.year()], signal);
          }
        } else {
          rows = await this.loadYearDetail<BrandRow>('dashboard-brand.json', 'monthlyBrand', [this.year()], signal);
        }
        signal.throwIfAborted();
        const index = await this.indexPeriodStoreAsync(rows, signal);
        signal.throwIfAborted();
        if (generation !== this.brandDetailGeneration) return;
        this.monthlyBrandIndex = index;
        this.brandDetailLoaded.set(true);
      } catch (error) {
        if (signal.aborted || generation !== this.brandDetailGeneration) return;
        this.loadingError.set(`No se pudo abrir el detalle de marcas: ${error instanceof Error ? error.message : error}`);
      } finally {
        if (signal.aborted || generation !== this.brandDetailGeneration) return;
        this.brandDetailPromise = undefined;
        this.brandDetailAbort = undefined;
      }
    })();
    return this.brandDetailPromise;
  }
  private async ensureSublineDetail(): Promise<void> {
    if (this.sublineDetailLoaded()) return;
    if (this.sublineDetailPromise) return this.sublineDetailPromise;
    const signal = this.sectionLoads.signal;
    this.sublineDetailPromise = (async () => {
      try {
        const rows = await this.loadYearDetail<Monthly>('dashboard-subline.json', 'monthlySubline', [this.year()], signal);
        signal.throwIfAborted();
        this.monthlySublineIndex = await this.indexPeriodStoreAsync(rows, signal);
        this.sublineDetailLoaded.set(true);
      } catch (error) {
        if (signal.aborted) return;
        this.loadingError.set(`No se pudo abrir el detalle de sublíneas: ${error instanceof Error ? error.message : error}`);
      } finally {
        if (signal.aborted) return;
        this.sublineDetailPromise = undefined;
      }
    })();
    return this.sublineDetailPromise;
  }
  private async ensurePriceRangeDetail(): Promise<void> {
    if (this.priceRangeDetailLoaded()) return;
    if (this.priceRangeDetailPromise) return this.priceRangeDetailPromise;
    const controller = new AbortController();
    this.priceRangeDetailAbort = controller;
    const signal = controller.signal;
    const generation = this.priceRangeDetailGeneration;
    const years = [...new Set([this.year(), this.effectivePriceRangeComparisonYear()])];
    const hierarchyActive = this.selectedCategories().length > 0 || this.selectedLines().length > 0 || this.selectedSublines().length > 0;
    const categoryOnly = this.selectedCategories().length > 0 && !this.selectedLines().length && !this.selectedSublines().length;
    this.priceRangeDetailPromise = (async () => {
      try {
        let rows: PriceRangeRow[];
        if (categoryOnly) {
          try {
            const payloads = await Promise.all(years.map(year => this.loadDetail<{ monthlyPriceRange: PriceRangeRow[] }>(
              `dashboard-price-range-category-${year}.json`, signal,
            )));
            rows = payloads.flatMap(payload => payload.monthlyPriceRange || []);
          } catch {
            signal.throwIfAborted();
            rows = await this.loadYearDetail<PriceRangeRow>('dashboard-price-range.json', 'monthlyPriceRange', years, signal);
          }
        } else if (hierarchyActive) {
          const month = this.selectedMonths().length === 1 ? this.selectedMonths()[0] : 0;
          if (month) {
            try {
              const payloads = await Promise.all(years.map(year => this.loadDetail<{ monthlyPriceRange: PriceRangeRow[] }>(
                `dashboard-price-range-${year}-${String(month).padStart(2, '0')}.json`, signal,
              )));
              rows = payloads.flatMap(payload => payload.monthlyPriceRange || []);
            } catch {
              signal.throwIfAborted();
              const yearly = await this.loadYearDetail<PriceRangeRow>('dashboard-price-range.json', 'monthlyPriceRange', years, signal);
              rows = yearly.filter(row => row.periodId % 100 === month);
            }
          } else {
            rows = await this.loadYearDetail<PriceRangeRow>('dashboard-price-range.json', 'monthlyPriceRange', years, signal);
          }
        } else {
          try {
            const payloads = await Promise.all(years.map(year => this.loadDetail<{ monthlyPriceRange: PriceRangeRow[] }>(
              `dashboard-price-range-summary-${year}.json`, signal,
            )));
            rows = payloads.flatMap(payload => payload.monthlyPriceRange || []);
          } catch {
            signal.throwIfAborted();
            // El manifiesto anterior al resumen aún usa los años completos.
            rows = await this.loadYearDetail<PriceRangeRow>('dashboard-price-range.json', 'monthlyPriceRange', years, signal);
          }
        }
        signal.throwIfAborted();
        const index = await this.indexPeriodStoreAsync(rows, signal);
        signal.throwIfAborted();
        if (generation !== this.priceRangeDetailGeneration) return;
        this.monthlyPriceRangeIndex = index;
        this.priceRangeData.set(rows);
        this.priceRangeDetailLoaded.set(true);
      } catch (error) {
        if (signal.aborted || generation !== this.priceRangeDetailGeneration) return;
        this.loadingError.set(`No se pudo abrir el detalle de rangos de precio: ${error instanceof Error ? error.message : error}`);
      } finally {
        if (signal.aborted || generation !== this.priceRangeDetailGeneration) return;
        this.priceRangeDetailPromise = undefined;
        this.priceRangeDetailAbort = undefined;
      }
    })();
    return this.priceRangeDetailPromise;
  }
  private async ensureSellerDetail(): Promise<void> {
    if (this.sellerDetailLoaded()) return;
    if (this.sellerDetailPromise) return this.sellerDetailPromise;
    const controller = new AbortController();
    this.sellerDetailAbort = controller;
    const signal = controller.signal;
    const generation = this.sellerDetailGeneration;
    const hierarchyActive = this.selectedCategories().length > 0 || this.selectedLines().length > 0 || this.selectedSublines().length > 0;
    const categoryOnly = this.selectedCategories().length > 0 && !this.selectedLines().length && !this.selectedSublines().length;
    this.sellerDetailLoading.set(true);
    this.sellerDetailPromise = (async () => {
      try {
        let rows: SellerPerformanceRow[];
        if (categoryOnly) {
          try {
            const payload = await this.loadDetail<{ sellerPerformance: SellerPerformanceRow[] }>(`dashboard-sellers-category-${this.year()}.json`, signal);
            rows = payload.sellerPerformance || [];
          } catch {
            signal.throwIfAborted();
            // Publicaciones anteriores no incluyen el resumen por rubro.
            rows = await this.loadYearDetail<SellerPerformanceRow>('dashboard-sellers.json', 'sellerPerformance', [this.year()], signal);
          }
        } else if (hierarchyActive) {
          const month = this.selectedMonths().length === 1 ? this.selectedMonths()[0] : 0;
          if (month) {
            try {
              const name = `dashboard-sellers-${this.year()}-${String(month).padStart(2, '0')}.json`;
              const payload = await this.loadDetail<{ sellerPerformance: SellerPerformanceRow[] }>(name, signal);
              rows = payload.sellerPerformance || [];
            } catch {
              signal.throwIfAborted();
              // Compatibilidad con publicaciones anteriores sin particiones mensuales.
              const yearly = await this.loadYearDetail<SellerPerformanceRow>('dashboard-sellers.json', 'sellerPerformance', [this.year()], signal);
              rows = yearly.filter(row => row.periodId % 100 === month);
            }
          } else {
            rows = await this.loadYearDetail<SellerPerformanceRow>('dashboard-sellers.json', 'sellerPerformance', [this.year()], signal);
          }
        } else {
          try {
            const payload = await this.loadDetail<{ sellerPerformance: SellerPerformanceRow[] }>(`dashboard-sellers-summary-${this.year()}.json`, signal);
            rows = payload.sellerPerformance || [];
          } catch {
            signal.throwIfAborted();
            // Una publicación anterior no contiene el resumen; conserva el ranking original.
            rows = await this.loadYearDetail<SellerPerformanceRow>('dashboard-sellers.json', 'sellerPerformance', [this.year()], signal);
          }
        }
        signal.throwIfAborted();
        if (generation !== this.sellerDetailGeneration) return;
        this.sellerPerformanceData.set(rows);
        this.sellerDetailLoaded.set(true);
      } catch {
        if (signal.aborted || generation !== this.sellerDetailGeneration) return;
        // Las demás métricas de Talento deben seguir disponibles si falla este detalle.
        signal.throwIfAborted();
        this.sellerPerformanceData.set([]);
      } finally {
        if (signal.aborted || generation !== this.sellerDetailGeneration) return;
        this.sellerDetailLoading.set(false);
        this.sellerDetailPromise = undefined;
        this.sellerDetailAbort = undefined;
      }
    })();
    return this.sellerDetailPromise;
  }
  private async ensureStockOrigin(): Promise<void> {
    if (this.stockOriginLoaded()) return;
    if (this.stockOriginPromise) return this.stockOriginPromise;
    const signal = this.sectionLoads.signal;
    this.detailLoading.set(true);
    this.stockOriginPromise = (async () => {
      try {
        let rows: StockOrigin[];
        try {
          const payload = await this.loadDetail<{ stockOrigin: StockOrigin[] }>('dashboard-stock-origin.json', signal);
          signal.throwIfAborted();
          rows = payload.stockOrigin || [];
        } catch {
          if (signal.aborted) return;
          rows = (await this.loadLegacyStock(signal)).stockOrigin || [];
        }
        signal.throwIfAborted();
        this.stockOriginData.set(rows);
        this.stockOriginLoaded.set(true);
      } catch (error) {
        if (signal.aborted) return;
        signal.throwIfAborted();
        this.stockOriginData.set([]);
        this.stockOriginLoaded.set(true);
        this.predictiveNote.set(`La antigüedad de stock no está disponible: ${error instanceof Error ? error.message : error}`);
      } finally {
        if (signal.aborted) return;
        this.detailLoading.set(false);
        this.stockOriginPromise = undefined;
      }
    })();
    return this.stockOriginPromise;
  }

  private async ensureStockHierarchy(): Promise<void> {
    if (this.stockHierarchyLoaded() || this.stockHierarchyPromise) return this.stockHierarchyPromise;
    const signal = this.sectionLoads.signal;
    let promise!: Promise<void>;
    promise = (async () => {
      try {
        const payload = await this.loadDetail<{ stockHierarchy: CompactRows }>('dashboard-stock-hierarchy.json', signal);
        signal.throwIfAborted();
        this.stockHierarchyData.set(decodeCompactRows<StockHierarchyRow>(payload.stockHierarchy, signal));
      } catch {
        if (signal.aborted) return;
        // Las versiones previas siguen utilizando el detalle por producto.
        this.stockHierarchyData.set([]);
      } finally {
        if (this.stockHierarchyPromise === promise) this.stockHierarchyPromise = undefined;
        if (!signal.aborted) this.stockHierarchyLoaded.set(true);
      }
    })();
    this.stockHierarchyPromise = promise;
    return promise;
  }

  retryStockTransfers(): void { void this.ensureStockTransfers(); }

  private async ensureStockTransfers(): Promise<void> {
    if (this.stockTransfersLoaded() || this.stockTransfersPromise) return this.stockTransfersPromise;
    this.stockTransfersError.set('');
    const signal = this.sectionLoads.signal;
    let promise!: Promise<void>;
    promise = (async () => {
      try {
        if (this.cloud.accessProfile()?.scopeType === 'store') {
          const scoped = await this.cloud.storeTransfers(signal);
          signal.throwIfAborted();
          if (scoped) {
            if (!Array.isArray(scoped.products) || !Array.isArray(scoped.routes) || !Array.isArray(scoped.stores)) {
              throw new Error('La respuesta de traslados no tiene el formato esperado.');
            }
            this.stockTransferProductsData.set(scoped.products as ProductRow[]);
            this.storeTransferStores.set(scoped.stores);
            this.storeTransferRoutes.set(scoped.routes);
            this.stockTransfersLoaded.set(true);
            return;
          }
        }
        const payload = await this.loadDetail<{ stockCompact: StockCompact }>('dashboard-stock-transfers.json', signal);
        signal.throwIfAborted();
        this.stockTransferProductsData.set(decodeStockCompact<ProductRow>(payload.stockCompact, signal));
        this.stockTransfersLoaded.set(true);
      } catch (error) {
        if (signal.aborted) return;
        if (this.cloud.accessProfile()?.scopeType === 'store') {
          this.stockTransfersError.set(error instanceof Error ? error.message : 'No se pudieron cargar los traslados de la tienda.');
          return;
        }
        // Una publicación anterior conserva el detalle completo.
        await this.ensureStockDetail();
      } finally {
        if (this.stockTransfersPromise === promise) this.stockTransfersPromise = undefined;
      }
    })();
    this.stockTransfersPromise = promise;
    return promise;
  }

  private async ensureSizeDetail(rubro: SizeRubro): Promise<void> {
    if (this.sizeDetailLoaded()[rubro]) return;
    const pending = this.sizeDetailPromises.get(rubro);
    if (pending) return pending;
    const signal = this.sectionLoads.signal;
    let promise!: Promise<void>;
    promise = (async () => {
      try {
        const payload = await this.loadDetail<{ sizeCompact: SizeCompact }>(
          `dashboard-stock-sizes-${rubro.toLowerCase()}.json`, signal,
        );
        signal.throwIfAborted();
        if (payload.sizeCompact.category !== rubro) throw new Error('Rubro de tallas incorrecto.');
        const rows = decodeSizeCompact<SizeProductRow>(payload.sizeCompact, signal);
        this.sizeProductsData.update(current => ({ ...current, [rubro]: rows }));
        this.sizeDetailLoaded.update(current => ({ ...current, [rubro]: true }));
      } catch {
        if (signal.aborted) return;
        // La publicación anterior mantiene el detalle por SKU completo.
        await this.ensureStockDetail();
      } finally {
        if (this.sizeDetailPromises.get(rubro) === promise) this.sizeDetailPromises.delete(rubro);
      }
    })();
    this.sizeDetailPromises.set(rubro, promise);
    return promise;
  }

  private async ensureStockDetail(): Promise<void> {
    if (this.stockDetailLoaded()) return;
    if (this.stockDetailPromise) return this.stockDetailPromise;
    const signal = this.sectionLoads.signal;
    this.stockDetailLoading.set(true);
    this.stockDetailProgress.set(1);
    this.stockDetailPromise = (async () => {
      try {
        let payload: { stockProducts: ProductRow[] };
        try {
          payload = await this.loadDetail<{ stockProducts: ProductRow[] }>('dashboard-stock-products.json', signal, progress => this.stockDetailProgress.set(progress));
        } catch {
          if (signal.aborted) return;
          payload = await this.loadLegacyStock(signal);
        }
        const products = payload.stockProducts || [];
        this.transferCodeError.set(false);
        const missingCodes = [...new Set(products.filter(row => !row.productCode).map(row => row.productId))];
        signal.throwIfAborted();
        const byStore = new Map<string, ProductRow[]>();
        const byCategory = new Map<string, ProductRow[]>();
        const allByStore = new Map<string, StockAggregate>();
        const predictiveByStore = new Map<string, StockAggregate>();
        const predictiveByProduct = new Map<string, ProductAggregate>();
        const predictiveRowsByProduct = new Map<string, ProductRow[]>();
        const predictiveProducts: ProductRow[] = [];
        for (let i = 0; i < products.length; i += 1) {
          if (i % 10_000 === 0) signal.throwIfAborted();
          const row = products[i];
          const storeRows = byStore.get(row.storeId);
          if (storeRows) storeRows.push(row);
          else byStore.set(row.storeId, [row]);
          const categoryRows = byCategory.get(row.category);
          if (categoryRows) categoryRows.push(row);
          else byCategory.set(row.category, [row]);
          const storeAggregate = allByStore.get(row.storeId) || { stockUnits: 0, stockValue: 0, units30: 0, sales30: 0 };
          storeAggregate.stockUnits += row.stockUnits || 0;
          storeAggregate.stockValue += row.stockValue || 0;
          storeAggregate.units30 += row.units30 || 0;
          storeAggregate.sales30 += row.sales30 || 0;
          allByStore.set(row.storeId, storeAggregate);
          if (this.isPredictiveProduct(row)) {
            predictiveProducts.push(row);
            const productRows = predictiveRowsByProduct.get(row.productId);
            if (productRows) productRows.push(row);
            else predictiveRowsByProduct.set(row.productId, [row]);
            const predictiveStore = predictiveByStore.get(row.storeId) || { stockUnits: 0, stockValue: 0, units30: 0, sales30: 0 };
            predictiveStore.stockUnits += row.stockUnits || 0;
            predictiveStore.stockValue += row.stockValue || 0;
            predictiveStore.units30 += row.units30 || 0;
            predictiveStore.sales30 += row.sales30 || 0;
            predictiveByStore.set(row.storeId, predictiveStore);
            const productKey = `${row.productId}|${row.product}`;
            const productAggregate = predictiveByProduct.get(productKey) || { name: row.product, units: 0, value: 0 };
            productAggregate.units += row.stockUnits || 0;
            productAggregate.value += row.stockValue || 0;
            predictiveByProduct.set(productKey, productAggregate);
          }
          if (i > 0 && i % 10_000 === 0) await this.yieldToBrowser();
        }
        signal.throwIfAborted();
        this.stockProductsByStore = byStore;
        this.stockProductsByCategory = byCategory;
        this.predictiveProductsByProduct = predictiveRowsByProduct;
        this.stockAggregateByStore.set(allByStore);
        this.predictiveAggregateByStore.set(predictiveByStore);
        this.predictiveAggregateByProduct.set(predictiveByProduct);
        this.staticPredictiveProductsData.set(predictiveProducts);
        this.stockProductsData.set(products);
        this.stockDetailLoaded.set(true);
        this.stockDetailProgress.set(100);
        if (missingCodes.length && this.cloud.portalEnabled) void this.enrichProductCodes(products, missingCodes, signal);
      } catch (error) {
        if (signal.aborted) return;
        this.stockDetailFailed.set(true);
        this.predictiveNote.set(`El detalle por producto no está disponible: ${error instanceof Error ? error.message : error}`);
      } finally {
        if (signal.aborted) return;
        this.stockDetailLoading.set(false);
        this.stockDetailPromise = undefined;
      }
    })();
    return this.stockDetailPromise;
  }

  private async enrichProductCodes(products: ProductRow[], missingCodes: string[], signal: AbortSignal): Promise<void> {
    this.productCodeLoading.set(true);
    try {
      const codes = await this.cloud.productCodes(missingCodes, signal);
      signal.throwIfAborted();
      let changed = false;
      for (const row of products) {
        const code = !row.productCode ? codes[row.productId] : undefined;
        if (code) { row.productCode = code; changed = true; }
      }
      if (changed) this.stockProductsData.set([...products]);
    } catch {
      if (!signal.aborted) this.transferCodeError.set(true);
    } finally {
      if (!signal.aborted) this.productCodeLoading.set(false);
    }
  }
  private async ensurePredictiveDetail(): Promise<void> {
    if (this.predictiveDetailLoaded() || this.predictiveDetailFailed()) return;
    if (this.predictiveDetailPromise) return this.predictiveDetailPromise;
    const signal = this.sectionLoads.signal;
    this.predictiveDetailLoading.set(true);
    this.predictiveDetailPromise = (async () => {
      try {
        let payload: { note: string; rows: PredictiveRow[] };
        try {
          const compact = await this.loadDetail<{ predictiveCompact: PredictiveCompact }>('dashboard-predictive-compact.json', signal);
          payload = decodePredictiveCompact<PredictiveRow>(compact.predictiveCompact, signal);
        } catch {
          signal.throwIfAborted();
          payload = await this.loadDetail<{ note: string; rows: PredictiveRow[] }>('dashboard-predictive.json', signal);
        }
        signal.throwIfAborted();
        const rows = payload.rows || [];
        signal.throwIfAborted();
        const index = new Map<string, PredictiveRow>();
        signal.throwIfAborted();
        for (let i = 0; i < rows.length; i += 1) {
          if (i % 10_000 === 0) signal.throwIfAborted();
          const row = rows[i];
          index.set(`${row.storeId}|${row.productId}`, row);
          if (i > 0 && i % 10_000 === 0) await this.yieldToBrowser();
        }
        signal.throwIfAborted();
        this.predictiveIndex.set(index);
        this.predictiveNote.set(payload.note || '');
        this.predictiveDetailLoaded.set(true);
      } catch (error) {
        if (signal.aborted) return;
        // El detalle predictivo es complementario: un 404 no debe tumbar todo el dashboard.
        signal.throwIfAborted();
        this.predictiveIndex.set(new Map());
        this.predictiveNote.set(`Detalle predictivo no disponible: ${error instanceof Error ? error.message : error}`);
        this.predictiveDetailFailed.set(true);
      } finally {
        if (signal.aborted) return;
        this.predictiveDetailLoading.set(false);
        this.predictiveDetailPromise = undefined;
      }
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
  private tooltip(title: string, rows: Detail[], floating = false): string {
    if (floating) {
      // This tooltip lives outside the shadow root and carries its own styles.
      return `<div class="transfer-chart-tooltip" style="width:min(360px,calc(100vw - 56px));font:12px/1.4 Arial,sans-serif;white-space:normal;color:#172033"><strong style="display:block;margin-bottom:10px;font-size:13px;overflow-wrap:anywhere">${safe(title)}</strong>${rows.map(r => `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin:5px 0"><span style="color:#64748b">${safe(r.label)}</span><b style="text-align:right;overflow-wrap:anywhere">${safe(r.value)}</b></div>`).join('')}</div>`;
    }
    return `<div class="chart-tooltip" style="box-sizing:border-box;width:205px;max-width:205px;font:10px/1.22 Arial,sans-serif;white-space:normal;color:#172033"><strong>${safe(title)}</strong>${rows.map(r => `<div><span>${safe(r.label)}</span><b>${safe(r.value)}</b></div>`).join('')}</div>`;
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
