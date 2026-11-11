import assert from 'node:assert/strict';
import test from 'node:test';
import { readableChartTypography } from '../src/components/commercialChartTypography.js';

test('manager chart labels get a readable minimum without shrinking large metrics or changing callbacks', () => {
 const formatter = value => String(value);
 const original = { xAxis:{ axisLabel:{fontSize:8,formatter} }, series:[{label:{fontSize:28}}], legend:{textStyle:{fontSize:9}},title:{textStyle:{fontSize:24}} };
 const result = readableChartTypography(original,'',13);
 assert.equal(result.xAxis.axisLabel.fontSize,13);
 assert.equal(result.legend.textStyle.fontSize,13);
 assert.equal(result.series[0].label.fontSize,28);
 assert.equal(result.title.textStyle.fontSize,24);
 assert.equal(result.xAxis.axisLabel.formatter,formatter);
 assert.equal(original.xAxis.axisLabel.fontSize,8);
});

test('the existing store chart typography remains unchanged', () => {
 assert.equal(readableChartTypography({label:{fontSize:8}}).label.fontSize,12);
});
