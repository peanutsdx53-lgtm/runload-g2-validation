import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const files={
 real:'audit/real_indexeddb_actions.json',
 edge:'audit/real_exception_acceptance_actions.json',
 sharing:'audit/real_sharing_contract_actions.json',
 deep:'audit/real_deep_acceptance_actions.json'
};
const evidence=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,JSON.parse(fs.readFileSync(file,'utf8'))]));
for(const [id,links] of [
 ['G1-EX17',[['real','REAL-04']]],
 ['G1-EX18',[['edge','EDGE-03'],['edge','EDGE-04']]],
 ['G1-EX19',[['sharing','SH08']]],
 ['G1-EX20',[['edge','EDGE-10']]],
 ['G1-EX21',[['edge','EDGE-05'],['deep','DEEP-11']]]
]){
 test(id+': existing real-browser evidence was measured and marked PASS',()=>{
   for(const [suite,caseId] of links){
     const recorded=evidence[suite].checks.find(c=>c.id===caseId);
     assert.ok(recorded,'Missing real-browser evidence '+suite+'/'+caseId);
     assert.equal(recorded.status,'PASS','Non-PASS browser evidence '+suite+'/'+caseId);
   }
 });
}
