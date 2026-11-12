import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCommercialTraffic, availableTrafficMonths, trafficMonthsForStores } from '../src/lib/commercialTraffic.js';
import { closingCommercialPeriod } from '../src/lib/currentCommercialPeriod.js';

test('traffic after sales closing remains available without changing the default or existing sales', () => {
 const published={metadata:{salesCutoff:'2026-10-31',years:[2026]},monthlyStore:[{periodId:202610,storeId:'A',net:100,transactions:2,traffic:999}]};
 const daily=[{date:'2026-10-31',storeId:'A',traffic:12},{date:'2026-11-10',storeId:'A',traffic:30}];
 const result=mergeCommercialTraffic(published,{daily,cutoff:'2026-11-10'});
 assert.equal(result.metadata.salesCutoff,'2026-10-31');
 assert.equal(result.metadata.trafficCutoff,'2026-11-10');
 assert.deepEqual(closingCommercialPeriod(result.metadata.salesCutoff),{year:2026,month:10});
 assert.deepEqual(result.dailyTraffic,daily);
 assert.equal(result.monthlyStore[0].net,100);
 assert.equal(result.monthlyStore[0].traffic,12);
 assert.equal(result.monthlyStore[1].periodId,202611);
 assert.equal(result.monthlyStore[1].traffic,30);
 assert.equal(result.monthlyStore[1].net,0);
 assert.equal(published.monthlyStore[0].traffic,999);
});

test('only months registered within the account store scope are enabled, including zero-count records', () => {
 const daily=[{date:'2026-11-01',storeId:'A',traffic:0},{date:'2026-12-01',storeId:'B',traffic:5},{date:'2025-09-01',storeId:'A',traffic:2}];
 assert.deepEqual(availableTrafficMonths(daily,2026,new Set(['A'])),[11]);
 assert.deepEqual(availableTrafficMonths(daily,2026,new Set(['C'])),[]);
});

test('traffic can enable a new calendar year while retaining the published closing year', () => {
 const result=mergeCommercialTraffic({metadata:{salesCutoff:'2026-12-31',years:[2026]},monthlyStore:[]},{daily:[{date:'2027-01-01',storeId:'A',traffic:2}]});
 assert.deepEqual(result.metadata.years,[2026,2027]);
 assert.deepEqual(closingCommercialPeriod(result.metadata.salesCutoff),{year:2026,month:12});
});

test('monthly traffic uses the selected stores, distinguishes zero from missing, and tracks the last date', () => {
 const rows = [
   { date: '2026-11-08', storeId: 'A', traffic: 0 },
   { date: '2026-11-02', storeId: 'A', traffic: 257 },
   { date: '2026-10-30', storeId: 'A', traffic: 0 },
   { date: '2026-11-12', storeId: 'B', traffic: 99 },
   { date: '2025-11-08', storeId: 'A', traffic: 99 },
 ];
 rows.push(
   { date: '2026-02-17', storeId: 'Puno', traffic: 12 },
   { date: '2026-07-01', storeId: 'Puno', traffic: 16258 },
 );
 const stores = new Map([['A', {}], ['Puno', { closingDate: '2026-02-17' }]]);
 const months = trafficMonthsForStores(rows, 2026, stores);
 assert.deepEqual(months.get(2), { traffic: 12, through: '2026-02-17' });
 assert.equal(months.has(7), false);
 assert.deepEqual(months.get(11), { traffic: 257, through: '2026-11-08' });
 assert.deepEqual(months.get(10), { traffic: 0, through: '2026-10-30' });
 assert.equal(months.has(9), false);
});
