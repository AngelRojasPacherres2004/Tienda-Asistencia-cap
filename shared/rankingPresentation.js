export function rankingRelativeScore(bestScore, score) {
  if (!Number.isFinite(bestScore) || !Number.isFinite(score) || bestScore <= 0 || score <= 0) return null;
  return Math.min(1, bestScore / score);
}

export function visibleRankingDetails(details, role) {
  return role === 'jefe_tienda' ? details.filter(detail => !['SALES', 'SALE_M2'].includes(detail.metric)) : details;
}
