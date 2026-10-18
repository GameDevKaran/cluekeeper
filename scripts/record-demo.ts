import {chromium} from '@playwright/test';
import {mkdirSync,copyFileSync} from 'node:fs';
import {createApp} from '../src/server/app.js';
import {Store} from '../src/server/store.js';
const output='.local/demo';mkdirSync(output,{recursive:true});
const store=new Store(':memory:');const server=createApp({store}).listen(3235,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:1100},recordVideo:{dir:output,size:{width:1440,height:1100}}});const page=await context.newPage();const video=page.video()!;
async function caption(text:string,seconds=5){await page.evaluate(text=>{let box=document.getElementById('recording-caption');if(!box){box=document.createElement('div');box.id='recording-caption';document.body.append(box);Object.assign(box.style,{position:'fixed',bottom:'18px',left:'210px',right:'28px',zIndex:'9999',background:'#283d2f',color:'#fffaf0',padding:'18px 24px',borderRadius:'7px',font:'16px Arial,sans-serif',boxShadow:'0 4px 22px #0002'});}box.textContent='LOCAL DEMO · '+text;},text);await page.waitForTimeout(seconds*1000);}
try{
 await page.goto('http://127.0.0.1:3235');await caption('ClueKeeper: an original museum mystery. Actual MCP and authored dialogue; no live model or Alexa device.',7);
 await page.getByRole('button',{name:'Inspect Display plinth'}).click();await caption('Inspecting a real story object reveals one authorized clue. The ledger cannot be filled by a model claim.');
 await page.getByRole('button',{name:'Inspect Condition-card holder'}).click();await caption('The first clue unlocks its condition record. Prerequisites keep discoveries in order.');
 await page.getByRole('button',{name:'Pause & save',exact:true}).click();await page.reload();await caption('Pause, reload and return to the same room with the same evidence.');await page.getByRole('button',{name:'Resume the mystery'}).click();
 await page.getByLabel('Who moved it?').selectOption('mateo');await page.getByLabel('Where did it go?').selectOption('workshop');await page.getByLabel('Why was it moved?').selectOption('protect-thread');await page.getByRole('button',{name:'Test my explanation'}).click();await page.getByRole('alert').scrollIntoViewIfNeeded();await caption('Even a correct guess cannot close the case without all six discovered and cited records.',6);
 await page.locator('[data-room="archive"]').click();await page.getByRole('button',{name:'Inspect Transfer ledger'}).click();await caption('The archive records a signed transfer. The story and its answer stay fixed.');
 await page.locator('[data-room="workshop"]').click();await page.getByRole('button',{name:'Inspect Bench register'}).click();await page.getByRole('button',{name:'Ask Mateo Vale'}).click();await caption('The destination and witness account are evidence only after their prerequisites are satisfied.');
 await page.locator('[data-room="archive"]').click();await page.getByRole('button',{name:'Ask Priya Das'}).click();await caption('The registrar cross-checks the record. Six clues are now in the ledger.');
 for(const c of await page.locator('[data-cite]').all())await c.check();await page.locator('.hypothesis').scrollIntoViewIfNeeded();await caption('The player explicitly selects the explanation and cites the evidence.');
 await page.getByRole('button',{name:'Test my explanation'}).click();await page.locator('.narration').scrollIntoViewIfNeeded();await caption('Case resolved by the deterministic engine through actual MCP. Export the case or revisit its history.',7);
 await page.locator('.language summary').click();await page.locator('.language').scrollIntoViewIfNeeded();await caption('Optional Bedrock is off. Its adapter accepts only available actions and exact authored labels; live accuracy is unverified.',7);
 await page.screenshot({path:output+'/cluekeeper-demo-preview.png'});
}finally{await context.close();copyFileSync(await video.path(),output+'/cluekeeper-local-demo.webm');await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));store.close();}
console.log('Saved '+output+'/cluekeeper-local-demo.webm; actual local authored workflow, no live inference.');
