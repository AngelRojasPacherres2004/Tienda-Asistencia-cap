import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AlertTriangle, ArrowDownUp, BarChart3, Box, CalendarDays, Gauge,
  LayoutGrid, RefreshCcw, Tag, Target, TrendingUp, Trophy, Warehouse,
} from "lucide-react";

const icons = {
  alert: AlertTriangle,
  box: Box,
  brand: Tag,
  calendar: CalendarDays,
  category: LayoutGrid,
  comparison: BarChart3,
  gauge: Gauge,
  ranking: Trophy,
  reorder: ArrowDownUp,
  rotate: RefreshCcw,
  target: Target,
  trend: TrendingUp,
  warehouse: Warehouse,
};

const symbols = Object.entries(icons).map(([id, Icon]) => {
  const markup = renderToStaticMarkup(React.createElement(Icon));
  const paths = markup.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return `<symbol id="${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</symbol>`;
});

const target = fileURLToPath(new URL("../public/comercial/assets/icons.svg", import.meta.url));
await mkdir(fileURLToPath(new URL("../public/comercial/assets/", import.meta.url)), { recursive: true });
await writeFile(target, `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join("")}</svg>\n`);
