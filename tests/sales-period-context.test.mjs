import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedSalesPeriods, publishedSalesDays, averageRecordedPersonnel } from '../src/commercial/sales-period-context.js';

test('a traffic-only month cannot affect a sales average or its personnel denominator', () => {
 const periods=publishedSalesPeriods([202610,202611],'2026-10-31');
 assert.deepEqual(periods,[202610]);
 assert.equal(publishedSalesDays(periods,'2026-10-31'),31);
 assert.equal(publishedSalesDays([202611],'2026-10-31'),0);
 const rows=[{periodId:202610,personnel:10},{periodId:202611,personnel:100}];
 assert.equal(averageRecordedPersonnel(rows,new Set(periods)),10);
});

test('partial sales months count only published days and date ranges stop at the sales cutoff', () => {
 assert.equal(publishedSalesDays([202610,202611],'2026-11-10'),41);
 assert.equal(publishedSalesDays([202611],'2026-11-10','2026-11-05','2026-11-20'),6);
 assert.equal(publishedSalesDays([202611],'2026-11-10','2026-11-11'),0);
});

test('actual calendar days are used across leap years and missing personnel is not a zero-person month', () => {
 assert.equal(publishedSalesDays([202401,202402],'2024-02-29'),60);
 assert.equal(averageRecordedPersonnel([{periodId:202610,personnel:10}],new Set([202610,202611])),10);
 assert.equal(averageRecordedPersonnel([],new Set([202610])),null);
 assert.deepEqual(publishedSalesPeriods([202701,202612],'2026-12-31'),[202612]);
});
