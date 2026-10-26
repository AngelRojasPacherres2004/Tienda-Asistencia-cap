"""Validate Angular/React chart screenshots with a small raster tolerance."""
from pathlib import Path
import os
from PIL import Image, ImageChops

root = Path(os.environ.get("LOCALAPPDATA", ".")) / "DashBoardGeneral" / "audits"
chart_id = os.environ.get("AUDIT_CHART_ID", "growth")
capture_state = os.environ.get("AUDIT_CAPTURE_STATE", "ready")
if chart_id not in {"growth", "meta-vs-real", "hourly-performance", "category-participation", "price-range", "store-ranking", "brand-sales", "gender-donut", "gender-bar", "inventory-rotation", "inventory-capacity", "inventory-store-value"}:
    raise SystemExit("Unknown chart")
if capture_state not in {"ready", "loading"}:
    raise SystemExit("Unknown capture state")
suffix = "-loading" if capture_state == "loading" else ""
view_suffix = ("-fallback" if chart_id == "store-ranking" and os.environ.get("AUDIT_RANKING_FALLBACK") == "1"
               else "-markup" if chart_id == "store-ranking" and os.environ.get("AUDIT_RANKING_VIEW") == "MARKUP"
               else "-expanded" if chart_id in {"brand-sales", "inventory-store-value"} and os.environ.get("AUDIT_EXPANDED") == "1"
               else "-textil" if chart_id == "gender-donut" and os.environ.get("AUDIT_GENDER_RUBRO") == "TEXTIL" else "")
scenarios = (
    ("gerente_comercial", 1440, 2026),
    ("gerente_comercial", 820, 2025),
    ("jefe_zonal", 1440, 2026),
    ("jefe_zonal", 820, 2025),
    ("jefe_tienda", 1440, 2026),
    ("jefe_tienda", 820, 2025),
)
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
        allowed = max(25, int(a.width * a.height * (0.004 if pie_label else 0.001)))
        bounds = difference.getbbox()
        label_width = 50 if chart_id == "gender-donut" else 42
        confined_label = not pie_label or bounds is None or (
            bounds[2] - bounds[0] <= label_width and bounds[3] - bounds[1] <= 35
        )
        print(f"{prefix}: {changed}/{a.width * a.height} changed pixels (limit {allowed}, bounds {bounds})")
        if changed > allowed or not confined_label:
            raise SystemExit(f"{prefix}: visual parity failed")
