type BirthdayProfile = { name: string; birthdayMonth?: number; birthdayDay?: number; birthDate?: string };

export function nextBirthday<T extends BirthdayProfile>(profiles: T[], today: string): { person: T; date: string } | null {
  const year = Number(today.slice(0, 4));
  const upcoming = profiles.flatMap(person => {
    const month = person.birthdayMonth ?? Number(person.birthDate?.slice(5, 7));
    const day = person.birthdayDay ?? Number(person.birthDate?.slice(8, 10));
    if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) return [];
    for (let candidateYear = year; candidateYear <= year + 8; candidateYear++) {
      const candidate = new Date(Date.UTC(candidateYear, month - 1, day));
      if (candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) continue;
      const date = candidate.toISOString().slice(0, 10);
      if (date >= today) return [{ person, date }];
    }
    return [];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.person.name.localeCompare(b.person.name));
  return upcoming[0] ?? null;
}
