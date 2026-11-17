export function rankingRelativeScore(bestScore, score) {
  if (!Number.isFinite(bestScore) || !Number.isFinite(score) || bestScore <= 0 || score <= 0) return null;
  return Math.min(1, bestScore / score);
}

export function rankingMetricShare(value, maximum) {
  if (value == null || !Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) return null;
  return value / maximum;
}
