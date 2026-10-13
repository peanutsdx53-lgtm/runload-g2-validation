import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Workflow} from '../js/app/workflow.js';
import {createTestDatabase} from './helpers/test-memory-database.mjs';

test('G1-IN40 assembly boundary: unselected run fields are not even read',()=>{
 const run={recordId:'TEST_ONLY_SHARE',revision:1,recordDate:'2026-10-12'};
 Object.defineProperty(run,'reflection',{enumerable:true,get(){throw Error('Unselected personal reflection was accessed');}});
 const w=new Workflow();w.active={run,snapshot:{recordId:run.recordId,recordRevision:1,resultSnapshotId:'TEST_SNAPSHOT',regionResults:[]},fatigue:[],bodyObservations:[],followups:[]};
 w.pastDetails=[];w.shareSelection={recordDate:true};
 const out=w.buildShare();assert.deepEqual(out.rows,[['走行日','2026-10-12','fact']]);
 assert.equal(JSON.stringify(out).includes('reflection'),false);
});

test('G1-IN40 assembly boundary: unselected observation note is not read',()=>{
 const w=new Workflow();const body={observationId:'secret',regionId:'R01'};
 Object.defineProperty(body,'note',{enumerable:true,get(){throw Error('Unselected observation accessed');}});
 w.active={run:{recordId:'TEST_ONLY_SHARE',revision:1,recordDate:'2026-10-12'},snapshot:{recordId:'TEST_ONLY_SHARE',recordRevision:1,resultSnapshotId:'TEST_SNAPSHOT',regionResults:[]},fatigue:[],bodyObservations:[body],followups:[]};
 w.pastDetails=[];w.shareSelection={recordDate:true};
 assert.equal(w.buildShare().rows.length,1);
});

test('G1-ACT35: preview captures complete per-store counts and current schema',async()=>{
 const w=new Workflow();w.db=createTestDatabase();
 const info=await w.previewBackup();assert.equal(info.storageSchemaVersion,1);
 assert.deepEqual(Object.keys(info.counts).sort(),['records','recordRevisions','draftSessions','fatigueObservations','bodyObservations','resultSnapshots','followups','appMetadata'].sort());
});

test('G1-ACT37: preview reports all conflicting IDs and never writes',async()=>{
 const {validateRecord}=await import('../js/domain/record.js');
 const {calculateReference}=await import('../js/engines/reference.js');
 const {saveRecord}=await import('../js/storage/repository.js');
 const {createBackup,inspectBackup,previewRestore}=await import('../js/storage/interchange.js');
 const {readAll}=await import('../js/storage/database.js');
 const db=createTestDatabase();
 const run=validateRecord({recordDate:'2026-10-12',distanceKm:5,durationSeconds:1800,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving'},'2026-10-13').record;
 const regions=calculateReference(run);
 const snapshot={regionResults:regions,sourceHashMap:Object.fromEntries(regions.map(r=>[r.regionId,r.sourceHash])),researchVersion:'R_20261013',modelVersion:'R_G1_A1A2B_1',meaningVersion:'G1_REFERENCE_V1',interpretationVersion:'G1_I01_I24_1'};
 await saveRecord(db,{recordId:'TEST_CONFLICT_A',run,snapshot});
 await saveRecord(db,{recordId:'TEST_CONFLICT_B',run,snapshot});
 const root=await inspectBackup(await createBackup(db));
 root.stores.records[0].reflection='different one';root.stores.records[1].reflection='different two';
 const before=await readAll(db);
 await assert.rejects(()=>previewRestore(db,root),e=>e.conflicts?.length===2&&/2 件/.test(e.message));
 assert.deepEqual(await readAll(db),before);
});

test('G1-ACT38: in-transaction readback mismatch aborts all stores',async()=>{
 const {validateRecord}=await import('../js/domain/record.js');
 const {calculateReference}=await import('../js/engines/reference.js');
 const {saveRecord}=await import('../js/storage/repository.js');
 const {createBackup,inspectBackup,restoreBackup}=await import('../js/storage/interchange.js');
 const {readAll}=await import('../js/storage/database.js');
 const source=createTestDatabase();
 const run=validateRecord({recordDate:'2026-10-12',distanceKm:5,durationSeconds:1800,runningMix:'run',speedPattern:'stable',elapsedTimeBasis:'moving'},'2026-10-13').record;
 const regions=calculateReference(run),snapshot={regionResults:regions,sourceHashMap:Object.fromEntries(regions.map(r=>[r.regionId,r.sourceHash])),researchVersion:'R_20261013',modelVersion:'R_G1_A1A2B_1',meaningVersion:'G1_REFERENCE_V1',interpretationVersion:'G1_I01_I24_1'};
 await saveRecord(source,{recordId:'TEST_ABORT_SOURCE',run,snapshot});
 const backup=await inspectBackup(await createBackup(source));
 const db=createTestDatabase(),original=db.transaction.bind(db);
 db.transaction=(names,mode='readonly')=>{
  const tx=original(names,mode);
  if(mode==='readwrite'){
   const getStore=tx.objectStore.bind(tx);let recordReads=0;
   tx.objectStore=name=>{
    const store=getStore(name);
    if(name==='records'){
     const read=store.get;
     store.get=key=>{
      recordReads++;
      return recordReads>=2?tx.request(()=>({...backup.stores.records[0],reflection:'CORRUPTED_READBACK'})):read(key);
     };
    }
    return store;
   };
  }
  return tx;
 };
 await assert.rejects(()=>restoreBackup(db,backup),/全取引を中止/);
 const all=await readAll(db);
 assert.equal(all.records.length,0);assert.equal(all.recordRevisions.length,0);assert.equal(all.resultSnapshots.length,0);
});