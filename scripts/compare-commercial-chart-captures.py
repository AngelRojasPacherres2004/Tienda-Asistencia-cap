"""Validate Angular/React chart screenshots with a small raster tolerance."""
from pathlib import Path
import os
from PIL import Image, ImageChops

root = Path(os.environ.get("LOCALAPPDATA", ".")) / "DashBoardGeneral" / "audits"
chart_id = os.environ.get("AUDIT_CHART_ID", "growth")
capture_state = os.environ.get("AUDIT_CAPTURE_STATE", "ready")
if chart_id not in {"growth", "meta-vs-real", "hourly-performance", "category-participation", "price-range", "store-ranking", "brand-sales", "gender-donut", "gender-bar", "inventory-rotation", "inventory-capacity", "inventory-store-value", "inventory-sizes", "inventory-antiquity", "talent-history", "talent-team-productivity", "talent-seller-performance", "talent-area-distribution", "talent-store-productivity", "talent-training", "talent-exit", "talent-incidents", "predictive-health", "predictive-replenishment", "predictive-projection", "modal-ticket", "modal-conversion", "modal-traffic", "page-tabs", "header", "filters", "primary-kpis", "key-kpis", "progress", "talent-kpis", "size-controls", "talent-capacity", "stock-matrix", "birthday-modal", "growth-card", "meta-vs-real-card", "hourly-card", "talent-history-card", "talent-team-card", "talent-area-card", "talent-store-card", "talent-exit-card", "talent-incidents-card", "talent-training-card", "size-card", "store-value-card", "category-card", "brand-card", "ranking-card"}:
    raise SystemExit("Unknown chart")
if capture_state not in {"ready", "loading"}:
    raise SystemExit("Unknown capture state")
suffix = "-loading" if capture_state == "loading" else ""
view_suffix = ("-fallback" if chart_id == "store-ranking" and os.environ.get("AUDIT_RANKING_FALLBACK") == "1"
               else "-markup" if chart_id == "store-ranking" and os.environ.get("AUDIT_RANKING_VIEW") == "MARKUP"
               else "-expanded" if chart_id in {"brand-sales", "inventory-store-value"} and os.environ.get("AUDIT_EXPANDED") == "1"
               else "-textil" if chart_id == "gender-donut" and os.environ.get("AUDIT_GENDER_RUBRO") == "TEXTIL" else "")
if chart_id == "inventory-sizes":
    selected = ["textil" if os.environ.get("AUDIT_SIZE_RUBRO") == "TEXTIL" else "",
                os.environ.get("AUDIT_SIZE_METRIC", "SALES").lower() if os.environ.get("AUDIT_SIZE_METRIC", "SALES") != "SALES" else "",
                "eur" if os.environ.get("AUDIT_SIZE_SYSTEM") == "EUR" else ""]
    selected = [part for part in selected if part]
    view_suffix = "-" + "-".join(selected) if selected else ""
scenarios = (
    ("gerente_comercial", 1440, 2026),
    ("gerente_comercial", 820, 2025),
    ("jefe_zonal", 1440, 2026),
    ("jefe_zonal", 820, 2025),
    ("jefe_tienda", 1440, 2026),
    ("jefe_tienda", 820, 2025),
)[:int(os.environ.get("AUDIT_SCENARIO_LIMIT", "6"))]
for role, width, year in scenarios:
    prefix = f"{chart_id}-{role}-{width}-{year}{view_suffix}"
    with Image.open(root / f"{prefix}-angular{suffix}.png") as source, Image.open(root / f"{prefix}-react{suffix}.png") as target:
        a, b = source.convert("RGB"), target.convert("RGB")
        if a.size != b.size:
            raise SystemExit(f"{prefix}: size differs: {a.size} vs {b.size}")
        difference = ImageChops.difference(a, b)
        changed = sum(any(pixel) for pixel in difference.get_flattened_data())
        # ECharts may place one outside pie label a few pixels differently after
        # switching Rubro/Categoría. Limit the tolerance to that small label box.
        pie_label = chart_id in {"category-participation", "gender-donut"} and capture_state == "ready"
        edge_chrome = chart_id == "inventory-sizes" and capture_state == "ready"
        training_labels = chart_id in {"talent-training", "talent-training-card"} and capture_state == "ready"
        replenishment_label = chart_id == "predictive-replenishment" and capture_state == "ready"
        allowed = max(25, int(a.width * a.height * (0.004 if pie_label else 0.003 if edge_chrome or replenishment_label else 0.022 if training_labels else 0.001)))
        bounds = difference.getbbox()
        label_width = 50 if chart_id == "gender-donut" else 42
        confined_label = not pie_label or bounds is None or (
            bounds[2] - bounds[0] <= label_width and bounds[3] - bounds[1] <= 35
        )
        # An overlaid assistant bubble and the small title icon may rasterize a
        # few pixels differently; the chart, controls and summary must match.
        confined_edges = not edge_chrome or not difference.crop((50, 0, a.width - 45, a.height)).getbbox()
        confined_training_labels = not training_labels or not difference.crop((125, 0, a.width, a.height)).getbbox()
        confined_replenishment_label = not replenishment_label or bounds is None or (
            bounds[2] - bounds[0] <= 90 and bounds[3] - bounds[1] <= 10 and bounds[0] < 125
        )
        print(f"{prefix}: {changed}/{a.width * a.height} changed pixels (limit {allowed}, bounds {bounds})")
        if changed > allowed or not confined_label or not confined_edges or not confined_training_labels or not confined_replenishment_label:
            raise SystemExit(f"{prefix}: visual parity failed")
