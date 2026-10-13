import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
const cwd=process.cwd();
const content=file=>readFileSync(join(cwd,file),'utf8');
const modules=[
 ['M01','js/app/start.js',/new Workflow|Workflow\(/],
 ['M02','js/app/workflow.js',/export class Workflow/],
 ['M03','js/research/source-catalog.js',/export const COLUMNS/],
 ['M04','js/research/anchor-data.js',/export const RESEARCH_CATALOG/],
 ['M05','js/domain/record.js',/export function validateRecord/],
 ['M06','js/domain/fatigue.js',/export function fatigueDifference/],
 ['M07','js/domain/history.js',/export function compareReferenceResults/],
 ['M08','js/domain/sharing.js',/export function buildShareData/],
 ['M09','js/engines/reference.js',/export function evaluateRegion/],
 ['M10','js/engines/interpretation.js',/export function interpretRun/],
 ['M11','js/storage/database.js',/export function openDatabase/],
 ['M12','js/storage/repository.js',/export async function saveRecord/],
 ['M13','js/storage/interchange.js',/export async function restoreBackup/],
 ['M14','js/ui/views.js',/export function render/],
 ['M15','js/ui/actions.js',/export function attachActions/],
 ['M16','js/ui/share-view.js',/export async function copyPreview/],
 ['M17','tests/runner.js',/NOT_RUN/],
];
for(const [id,file,entry] of modules){
 test('G1-'+id+': planned source path and its public responsibility are present',()=>{
  assert.ok(existsSync(join(cwd,file)),file+' missing');
  assert.match(content(file),entry);
 });
}
test('G1-M18: four independent presentation layers exist',()=>{
 for(const file of ['styles/base.css','styles/layout-mobile.css','styles/layout-desktop.css','styles/print.css']){
  assert.ok(existsSync(join(cwd,file)),file+' missing');
  assert.ok(content(file).trim().length>100);
 }
});
test('G1-M03: selectColumn implementation belongs to domain, not research catalog',()=>{
 assert.doesNotMatch(content('js/research/source-catalog.js'),/function\s+selectColumn\s*\(/);
 assert.match(content('js/domain/column.js'),/export function selectColumn/);
 assert.match(content('js/app/workflow.js'),/from '\.\.\/domain\/column\.js'/);
});
test('G1-M05–M10: pure scientific/domain files contain no browser storage or DOM access',()=>{
 for(const file of ['js/domain/record.js','js/domain/fatigue.js','js/domain/history.js','js/domain/sharing.js','js/engines/reference.js','js/engines/interpretation.js']){
  const source=content(file);
  assert.doesNotMatch(source,/\b(?:document|window|indexedDB|localStorage|navigator\.clipboard)\b/,file);
  assert.doesNotMatch(source,/\bfetch\s*\(/,file);
 }
});
test('G1-M01–M16: source imports resolve without cycles',()=>{
 const jsFiles=[];
 function walk(path){
  for(const ent of readdirSync(join(cwd,path),{withFileTypes:true})){
   const p=path+'/'+ent.name;
   if(ent.isDirectory())walk(p);
   else if(ent.isFile()&&ent.name.endsWith('.js'))jsFiles.push(p);
  }
 }
 walk('js');
 const graph=new Map();
 for(const p of jsFiles){
  const source=content(p),deps=[];
  const reg=/^\s*import[\s\S]*?\sfrom\s+['"](\.[^'"]+)['"]/gm;
  for(const match of source.matchAll(reg)){
    const file=resolve(cwd,dirname(p),match[1]);
    assert.ok(existsSync(file),p+' missing import '+match[1]);
    const relative=file.slice(cwd.length+1);
    if(relative.endsWith('.js'))deps.push(relative);
  }
  graph.set(p,deps);
 }
 const visited=new Set(),visiting=new Set();
 const dfs=p=>{assert.equal(visiting.has(p),false,'Import cycle at '+p);if(visited.has(p))return;visiting.add(p);for(const dep of graph.get(p)??[])dfs(dep);visiting.delete(p);visited.add(p)};
 for(const p of graph.keys())dfs(p);
 assert.ok(visited.size>=18);
});
