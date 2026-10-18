import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {applyCommand,createSession,publicView} from '../src/domain/index.js';
import {provePuzzle} from '../src/domain/proof.js';
const raw=readFileSync('evaluation/paraphrases.json','utf8');const corpus=JSON.parse(raw);const ids=new Set<string>();
for(const split of ['development','heldOut']){
 const cases=corpus[split];assert.equal(cases?.length,30,`${split} must contain 30 cases`);
 for(const item of cases){assert.ok(!ids.has(item.id));ids.add(item.id);let state=createSession();for(const command of item.setupCommands)state=applyCommand(state,command,state.revision);const view=publicView(state);if(item.expected.actionId!==null){const action=view.actions.find(a=>a.id===item.expected.actionId);assert.ok(action,`${item.id}: expected action unavailable`);assert.equal(action.label,item.expected.narration,`${item.id}: authored label mismatch`);}}
}
const report={checkedAt:new Date().toISOString(),corpusSha256:createHash('sha256').update(raw).digest('hex'),validDevelopmentCases:30,validHeldOutCases:30,modelRequests:0,meaning:'Fixture setup and expected action availability only; no language-model accuracy result.',domain:provePuzzle()};
writeFileSync('evaluation/fixture-validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
