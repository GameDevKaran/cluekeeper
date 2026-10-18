import {spawn} from 'node:child_process';
import {createApp} from '../src/server/app.js';
import {Store} from '../src/server/store.js';
const store=new Store(':memory:');const server=createApp({store}).listen(3231,'127.0.0.1');await new Promise<void>((r,j)=>{server.once('listening',r);server.once('error',j);});
const modelStore=new Store(':memory:');const modelServer=createApp({store:modelStore,modelLabel:'TEST DOUBLE — no live inference',interpreter:async({text,view})=>{
 if(text==='Fail the provider')throw new Error('Test failure');
 if(text==='Invent a clue')return{proposal:{actionId:'inspect-display-plinth',narration:'An invented clue changes the solution.'},trace:{provider:'TEST DOUBLE',model:'invalid',latencyMs:0}};
 const action=view.actions.find(a=>a.id==='inspect-display-plinth')??view.actions[0];
 return{proposal:{actionId:action.id,narration:action.label},trace:{provider:'TEST DOUBLE',model:'not live',latencyMs:0}};
}}).listen(3233,'127.0.0.1');await new Promise<void>((r,j)=>{modelServer.once('listening',r);modelServer.once('error',j);});
const child=spawn(process.execPath,['node_modules/playwright/cli.js','test',...process.argv.slice(2)],{stdio:'inherit',shell:false});
const code=await new Promise<number>(r=>{child.once('exit',c=>r(c??1));child.once('error',()=>r(1));});
for(const [s,db] of [[server,store],[modelServer,modelStore]] as const){s.closeAllConnections();await new Promise<void>(r=>s.close(()=>r()));db.close();}process.exitCode=code;
