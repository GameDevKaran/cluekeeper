import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const image=process.argv[2]??'cluekeeper:local-20261018';
const name='cluekeeper-verify-'+randomUUID().slice(0,8),base='http://127.0.0.1:3237';
function docker(args:string[]){const r=spawnSync('docker',args,{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||r.stdout);return r.stdout.trim();}
async function healthy(){for(let i=0;i<30;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error('Container did not become healthy.');}
let started=false;const client=new Client({name:'cluekeeper-container-check',version:'1'});
try{
 const imageId=docker(['image','inspect',image,'--format','{{.Id}}']);
 docker(['run','--rm','-d','--name',name,'-p','127.0.0.1:3237:3230','-e','NODE_ENV=development',image]);started=true;await healthy();
 const initial=await fetch(base+'/api/bootstrap');const cookie=initial.headers.get('set-cookie')!.split(';')[0];const view=(await initial.json()).view;
 await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{cookie}}}));
 assert.deepEqual((await client.listTools()).tools.map(t=>t.name).sort(),['get_game','perform_action']);
 const result=await client.callTool({name:'perform_action',arguments:{command:{type:'inspect',targetId:'display-plinth'},expectedRevision:view.revision,expectedSessionId:view.id,requestId:randomUUID()}});assert.ok(!result.isError);await client.close();
 docker(['restart',name]);await healthy();const restored=(await (await fetch(base+'/api/bootstrap',{headers:{cookie}})).json()).view;
 assert.equal(restored.id,view.id);assert.equal(restored.revision,1);assert.equal(restored.ledger[0].id,'transfer-tab');
 mkdirSync('.local',{recursive:true});const report={checkedAt:new Date().toISOString(),image,imageId,health:'passed',actualMcp:'passed',restartPersistence:'passed',publicDeployment:false,productionTls:false};writeFileSync('.local/container-verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await client.close().catch(()=>{});if(started)docker(['stop',name]);}
