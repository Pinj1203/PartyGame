import {spawn} from 'node:child_process';
import {existsSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||4180);
const local=`http://127.0.0.1:${port}`;
const executable=process.env.CLOUDFLARED_PATH||path.join(root,'work','downloads','cloudflared.exe');
const children=[];
let stopping=false;
function stop(code=0){
 if(stopping)return;stopping=true;
 for(const child of children)child.kill();
 process.exitCode=code;
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
async function health(){
 try{const response=await fetch(`${local}/health`,{signal:AbortSignal.timeout(800)});const data=await response.json();return response.ok&&data.ok&&data.protocol===1;}catch{return false;}
}
if(!existsSync(executable)){
 console.error('找不到 cloudflared。請保留 work/downloads/cloudflared.exe，或設定 CLOUDFLARED_PATH。');
 process.exitCode=1;
}else{
 if(!await health()){
  const server=spawn(process.execPath,['server.cjs'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:String(port)}});
  children.push(server);server.stdout.pipe(process.stdout);server.stderr.pipe(process.stderr);
  server.on('error',error=>{console.error(error.message);stop(1);});
  server.on('exit',code=>{if(!stopping){console.error(`遊戲伺服器已停止（${code}）。`);stop(1);}});
  let ready=false;
  for(let attempt=0;attempt<30&&!stopping;attempt++){if(await health()){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,200));}
  if(!ready&&!stopping){console.error('遊戲伺服器無法啟動，請確認連接埠未被其他程式占用。');stop(1);}
 }
 if(!stopping){
  console.log(`本機遊戲：${local}/\n正在建立外網網址，請稍候…`);
  const tunnel=spawn(executable,['tunnel','--url',local,'--protocol','http2','--no-autoupdate'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  children.push(tunnel);let output='',announced=false;
  const read=chunk=>{
   const text=chunk.toString();output=(output+text).slice(-16000);
   const match=output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
   if(match&&!announced){
    announced=true;const url=match[0]+'/';
    writeFileSync(path.join(root,'ONLINE-URL.txt'),url+'\n\n這是暫時網址，請保持伺服器與這個視窗開啟。重新啟動後會取得新網址。\n');
    console.log(`\n朋友共用的遊戲網址：\n${url}\n\n所有人開啟此網址；房主按「開房間」，朋友輸入房號。\n請等待連線就緒後開始遊戲。保持此視窗開啟，Ctrl+C 結束。\n`);
   }
   if(text.includes('Registered tunnel connection'))console.log('外網連線已就緒。');
   if(text.includes('ERR '))process.stderr.write(text);
  };
  tunnel.stdout.on('data',read);tunnel.stderr.on('data',read);
  tunnel.on('error',error=>{console.error(error.message);stop(1);});
  tunnel.on('exit',code=>{if(!stopping){console.error(`外網連線已停止（${code}）。請重新執行啟動檔。`);stop(code||1);}});
 }
}
