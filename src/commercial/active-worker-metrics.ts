export type ActiveWorker = { storeId: string; role: string; name: string; gender: string; birthDate: string | null };

export function workerRoleLabel(role: string): string {
  const value = String(role || '').toUpperCase().replace(/_/g, ' ').trim();
  return ['JEFE TIENDA', 'JEFE DE TIENDA', 'ADMINISTRADOR', 'ADMINISTRADOR TIENDA'].includes(value)
    ? 'ADMINISTRADOR DE TIENDA' : value || 'SIN ROL';
}

export function activeWorkerMetrics(workers: ActiveWorker[], today: string, month: number) {
  let male = 0, female = 0;
  const ages: number[] = [];
  const birthdays: (ActiveWorker & { day: number })[] = [];
  for (const worker of workers) {
    if (worker.gender === 'M') male++;
    if (worker.gender === 'F') female++;
    const birth = worker.birthDate;
    if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) continue;
    const parsed = new Date(`${birth}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birth || birth > today) continue;
    const age = Number(today.slice(0, 4)) - Number(birth.slice(0, 4)) - (today.slice(5) < birth.slice(5) ? 1 : 0);
    if (age < 16 || age > 90) continue;
    ages.push(age);
    if (Number(birth.slice(5, 7)) === month) birthdays.push({ ...worker, role: workerRoleLabel(worker.role), day: Number(birth.slice(8, 10)) });
  }
  return {
    male, female, unknownGender: workers.length - male - female,
    averageAge: ages.length ? ages.reduce((sum, age) => sum + age, 0) / ages.length : null,
    ageCount: ages.length, missingBirthDates: workers.length - ages.length,
    birthdays: birthdays.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, 'es')),
  };
}
