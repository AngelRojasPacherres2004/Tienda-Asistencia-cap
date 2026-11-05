export function currentCommercialPeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: 'numeric',
  }).formatToParts(now);
  return {
    year: Number(parts.find(part => part.type === 'year').value),
    month: Number(parts.find(part => part.type === 'month').value),
  };
}
