export type DashboardHeaderModel = {
  title: string;
  cutoffDate: string;
  version: string;
  storeSummary: { total: number; metro: number; outside: number } | null;
  showLogout: boolean;
  userName: string;
};

export type DashboardFiltersModel = Record<string, unknown>;
export type DashboardFilterAction = { type: string; value?: string | number };
