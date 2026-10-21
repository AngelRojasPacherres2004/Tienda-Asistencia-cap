# Design QA

Date: 2026-10-21

## Visual truth

- Price-range reference: `C:/Users/joela/AppData/Local/Temp/codex-clipboard-34558cd6-83e4-4edb-8c62-c819eeb9acbb.png` (1917 × 858).
- Store-layout reference: `C:/Users/joela/AppData/Local/Temp/codex-clipboard-0bc80c8e-0cfe-4f4b-97c0-8c494c76be3f.png` (1915 × 861).
- Sidebar identity reference: `C:/Users/joela/AppData/Local/Temp/codex-clipboard-afb17437-76d2-4349-82e1-91c299bd4c46.png` (307 × 856).
- Implementation inspected in the Codex in-app browser at `http://127.0.0.1:4200/` using the local dashboard dataset.

## Viewports checked

- Desktop: 1915 × 861.
- Tablet: 1024 × 768.
- Mobile: 390 × 844.

## Comparison passes

- Layout and spacing: the price-range chart and its detail table share the available desktop row; below 1100 px they stack without page-level clipping. The store selector was moved into the dashboard context bar and the dashboard shell no longer adds outer padding.
- Typography and content: year labels, range labels, sales, participation, units, and average price follow the supplied visual hierarchy. The user identity uses a concise name, abbreviated role, and DNI.
- Responsiveness: a mobile page-level horizontal overflow was found during QA and fixed by constraining every chart host to its parent. The price table keeps its own intentional horizontal scroll on narrow screens.
- Colors and surfaces: the comparison series preserve the purple/blue visual language from the reference, with paired bar and line encodings and matching table accents.
- Interaction and states: the comparison-year selector exposes 2025/2024, the chart expansion control remains available, and the chart/table remain visible together. The administrative KPI now resolves the real source roles `ADMINISTRADOR` and `ASISTENTE ADMINISTRATIVO`; the local dataset displays 10 instead of 0.
- Accessibility: controls have accessible labels, focusable native inputs/selects are retained, and the dashboard remains readable without page-level horizontal overflow at the tested widths.

## Verification

- Production build passed.
- ESLint passed with zero warnings.
- Node regression suite: 107 tests, 103 passed, 4 skipped, 0 failed.
- Python dashboard partition tests: 3 passed.

final result: passed
