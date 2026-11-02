import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const {createPartyServer}=createRequire(import.meta.url)('./server.cjs');
const checkOnly=process.argv.includes('--check');
const noOpen=checkOnly||process.argv.includes('--no-open');
// Always start our own process on an available port; never reuse an old checkout's server.
const app=createPartyServer({host:'127.0.0.1',port:0});
let closing=false;
async function close(){if(closing)return;closing=true;await app.close();}
process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
const hash=data=>createHash('sha256').update(data).digest('hex');
try{
 const address=await new Promise((resolve,reject)=>{
  app.server.once('error',reject);
  app.server.listen(0,'127.0.0.1',()=>resolve(app.server.address()));
 });
 const url=`http://127.0.0.1:${address.port}/`;
 const health=await fetch(url+'health',{signal:AbortSignal.timeout(5000)});
 const status=await health.json();
 if(!health.ok||!status.ok||status.protocol!==2)throw Error('多人連線服務檢查失敗');
 for(const file of ['index.html','game.js','assets/characters/bunny.gltf']){
  const response=await fetch(url+file,{signal:AbortSignal.timeout(5000)});
  if(!response.ok||hash(Buffer.from(await response.arrayBuffer()))!==hash(await readFile(path.join(root,'dist',file))))throw Error('網站檔案核對失敗：'+file);
 }
 console.log('\n網站檔案來源：'+path.join(root,'dist')+'\n測試網址：'+url+'\n遊戲網頁、程式、角色素材與多人連線服務檢查通過。');
 if(checkOnly)await close();
 else{
  await writeFile(path.join(root,'LOCAL-URL.txt'),url+'\n\n網站檔案來源：'+path.join(root,'dist')+'\n本機測試網址，請保持啟動視窗開啟。關閉後請重新執行 start-local.cmd。\n');
  console.log('請保持這個視窗開啟；按 Ctrl+C 結束。此網址供這台電腦測試。');
  if(!noOpen){
   const browser=spawn('cmd.exe',['/d','/s','/c',`start "" "${url}"`],{windowsHide:true,stdio:'ignore'});
   browser.on('error',()=>console.log('請手動開啟上方網址。'));
  }
 }
}catch(error){console.error(error.message);process.exitCode=1;await close();}
