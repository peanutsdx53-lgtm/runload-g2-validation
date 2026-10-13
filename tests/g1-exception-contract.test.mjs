import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecord} from '../js/domain/record.js';
import {evaluateRegion,calculateReference} from '../js/engines/reference.js';
import {RESEARCH_CATALOG} from '../js/research/anchor-data.js';
import {compareReferenceResults,compatibleSeries} from '../js/domain/history.js';
import {observeFatigue,fatigueDifference} from '../js/domain/fatigue.js';
import {reasonLabel} from '../js/domain/reference-display.js';

const catalog=RESEARCH_CATALOG;
const a1=catalog.find(x=>x.method!=='A2');
const a2=catalog.find(x=>x.method==='A2');
const speed=(a1.speedRange[0]+a1.speedRange[1])/2;
const actual=evaluateRegion(speed,a1);
const positiveRun={recordDate:'2026-10-11',distanceKm:6,durationSeconds:1800,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving',distanceConfidence:'unknown'};
const today='2026-10-13';

// G1 §4.4 reason contracts: explicit scientific/output reason + no fabricated measurement.
test('G1-EX01: missing input rejects save before model generation',()=>{
 const r=validateRecord({...positiveRun,distanceKm:null},today);assert.equal(r.valid,false);assert.match(r.errors.join(' '),/距離/);
});
test('G1-EX02: invalid speed returns null (not zero or 100)',()=>{
 const r=evaluateRegion(NaN,a1);assert.equal(r.value,null);assert.equal(r.reference100,null);assert.deepEqual(r.reasonCodes,['invalid_speed']);
});
test('G1-EX03: nonsteady pace attaches warning, does not assume treadmill match',()=>{
 const r=calculateReference({...positiveRun,speedKmh:speed,speedPattern:'variable'},catalog);
 assert.equal(r.length,12);assert.ok(r.every(x=>x.applicabilityNotes.includes('nonsteady_average_speed')));
});
test('G1-EX04: mixed walking removes reference values without deleting run facts',()=>{
 const r=calculateReference({...positiveRun,speedKmh:speed,runningMix:'mixed'},catalog);
 assert.equal(r.length,12);assert.ok(r.some(x=>x.reasonCodes.includes('walking_mixed')));
 assert.ok(r.every(x=>x.eligibility!=='unavailable'||x.value===null));
});
test('G1-EX05: outside source speed range yields unavailable reason',()=>{
 const r=evaluateRegion(100,a1);assert.equal(r.value,null);assert.equal(r.reference100,null);assert.deepEqual(r.reasonCodes,['outside_source_range']);
});
test('G1-EX06: missing published anchors never interpolates a fabricated value',()=>{
 const r=evaluateRegion(speed,{...a1,anchors:[]});assert.deepEqual(r.reasonCodes,['missing_anchor']);assert.equal(r.value,null);
});
test('G1-EX07: altered source-hash is rejected',()=>{
 const r=evaluateRegion(speed,{...a1,sourceHash:'bad'});assert.deepEqual(r.reasonCodes,['source_mismatch']);assert.equal(r.reference100,null);
});
test('G1-EX08: differing metric identity prevents reference comparison',()=>{
 const r=compareReferenceResults(actual,{...actual,metricId:'different-metric'});assert.equal(r.compatible,false);assert.equal(r.value,null);assert.equal(r.field,'metricId');
});
test('G1-EX09: changed meaning version prevents numerical comparison',()=>{
 const r=compareReferenceResults(actual,{...actual,meaningVersion:'NOT_SAME'});assert.equal(r.compatible,false);assert.equal(r.value,null);assert.equal(r.reason,'version_mismatch');
});
test('G1-EX10: reference denominator zero never produces 100 or infinity',()=>{
 const r=evaluateRegion(speed,{...a1,referenceValue:0});assert.equal(r.value,null);assert.equal(r.reference100,null);assert.deepEqual(r.reasonCodes,['invalid_reference']);
});
test('G1-EX11: incomplete published coefficient set is rejected',()=>{
 assert.ok(a2);const v=evaluateRegion((a2.speedRange[0]+a2.speedRange[1])/2,{...a2,coefficients:[1]});assert.equal(v.value,null);assert.deepEqual(v.reasonCodes,['unverified_equation']);
});
test('G1-EX12: conditions unsupported by original paper are not silently corrected',()=>{
 const r=calculateReference({...positiveRun,speedKmh:speed,runningMix:'walk',environment:'outdoor',slope:18},catalog);
 assert.ok(r.some(x=>x.reasonCodes.includes('walking_mixed')));assert.ok(!r.some(x=>x.riskScore!==undefined));
});
test('G1-EX13: absent ROF-J is distinct from value zero',()=>{
 const a=observeFatigue('pre',0,'2026-10-11T00:00:00Z');assert.equal(a.value,0);assert.equal(fatigueDifference(null,a,null,null).difference,null);
});
test('G1-EX14: noneligible PRE/POST time order keeps answers but blocks delta',()=>{
 const pre=observeFatigue('pre',0,'2026-10-11T12:00:00Z'),post=observeFatigue('post',3,'2026-10-11T11:00:00Z');
 const r=fatigueDifference(pre,post,'2026-10-11T12:30:00Z','2026-10-11T13:00:00Z');assert.equal(r.eligible,false);assert.equal(r.difference,null);assert.equal(pre.value,0);assert.equal(post.value,3);
});
test('G1-EX15: history 0/1 does not invent a previous record',()=>{
 assert.deepEqual(compatibleSeries([],'R01'),[]);const r=compatibleSeries([{recordDate:'2026-10-11',recordId:'only',snapshot:{regionResults:[actual]}}],actual.regionId);assert.equal(r.length,1);
});
test('G1-EX16: incompatible history breaks line and numerical comparison',()=>{
 const wrong={...actual,meaningVersion:'OLD_MEANING'};
 const data=[{recordDate:'2026-10-10',recordId:'one',snapshot:{regionResults:[wrong]}},{recordDate:'2026-10-11',recordId:'two',snapshot:{regionResults:[actual]}}];
 const out=compatibleSeries(data,actual.regionId);assert.equal(out[1].compatible,false);assert.equal(out[1].plotValue,null);
});
test('G1-EX scientific reason labels never fall through to empty or technical identifier',()=>{
 for(const reason of ['invalid_speed','source_mismatch','outside_source_range','invalid_reference','unverified_equation','missing_anchor','walking_mixed','nonsteady_average_speed']){
   const label=reasonLabel([reason]);assert.ok(label.length>=10);assert.ok(!label.includes(reason));
 }
});