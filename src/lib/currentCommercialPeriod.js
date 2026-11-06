export function currentCommercialPeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: 'numeric',
  }).formatToParts(now);
  return {
    year: Number(parts.find(part => part.type === 'year').value),
    month: Number(parts.find(part => part.type === 'month').value),
  };
}

export function closingCommercialPeriod(salesCutoff) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(salesCutoff || '');
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) {
    return { year: Number(match[1]), month: Number(match[2]) };
  }
  return currentCommercialPeriod();
}
