import test from 'node:test';
import assert from 'node:assert/strict';
import { teamProductivity } from '../src/commercial/team-productivity.js';
const sales = [{periodId:202610,team:'TEXTIL',net:1000}];
const people = [{periodId:202610,team:'TEXTIL',personnel:10},{periodId:202611,team:'TEXTIL',personnel:20}];

test('adding a traffic-only month does not change sales productivity or use the following month staff', () => {
 const october=teamProductivity(sales,people,new Set([202610]),'2026-10-31');
 assert.deepEqual(teamProductivity(sales,people,new Set([202610,202611]),'2026-10-31'),october);
 assert.equal(october[0].productivity,100);
 assert.deepEqual(teamProductivity(sales,people,new Set([202611]),'2026-10-31'),[]);
});

test('uses matched monthly sales and average personnel when both months have data', () => {
 const rows=teamProductivity([...sales,{periodId:202611,team:'TEXTIL',net:3000}],people,new Set([202610,202611]),'2026-11-30');
 assert.equal(rows[0].periodCount,2);
 assert.equal(rows[0].averageMonthlySales,2000);
 assert.equal(rows[0].personnel,15);
 assert.equal(rows[0].productivity,2000/15);
});

test('a published zero-sales month counts, but a month without personnel is not compared', () => {
 const rows=teamProductivity([...sales,{periodId:202611,team:'TEXTIL',net:0}],people,new Set([202610,202611]),'2026-11-30');
 assert.equal(rows[0].periodCount,2);
 assert.equal(rows[0].averageMonthlySales,500);
 assert.deepEqual(teamProductivity(sales,[],new Set([202610]),'2026-10-31'),[]);
});
