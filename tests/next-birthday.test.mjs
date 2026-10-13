import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBirthday } from '../commercial-dashboard/src/app/next-birthday.ts';

test('next birthday follows the current date across months and years', () => {
  const rows = [{name:'Pasado',birthdayMonth:10,birthdayDay:2}, {name:'Próximo',birthdayMonth:11,birthdayDay:3}];
  assert.equal(nextBirthday(rows, '2026-10-12').person.name, 'Próximo');
  assert.equal(nextBirthday(rows, '2026-12-31').date, '2027-10-02');
});
test('today is included and invalid dates are skipped', () => {
  assert.equal(nextBirthday([{name:'Hoy',birthDate:'1990-10-12'}], '2026-10-12').date, '2026-10-12');
  assert.equal(nextBirthday([{name:'Inválido',birthdayMonth:4,birthdayDay:31}], '2026-10-12'), null);
  assert.equal(nextBirthday([], '2026-10-12'), null);
});
test('February 29 stays on a valid leap year', () => {
  assert.equal(nextBirthday([{name:'Bisiesto',birthdayMonth:2,birthdayDay:29}], '2026-10-12').date, '2028-02-29');
});
