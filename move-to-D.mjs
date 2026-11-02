import * as fs from 'node:fs/promises';
import {createReadStream,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const sourceRoot=path.dirname(fileURLToPath(import.meta.url));
const destinationRoot='D:\\PartyGame';

async function digest(file){
 const hash=createHash('sha256');
 for await(const chunk of createReadStream(file))hash.update(chunk);
 return hash.digest('hex');
}
async function inventory(root){
 const entries=new Map();
 async function visit(relative=''){
  const absolute=path.join(root,relative),stat=await fs.lstat(absolute);
  if(stat.isSymbolicLink())throw Error('為避免複製到其他位置，不接受連結或 junction：'+absolute);
  if(stat.isDirectory()){
   entries.set(relative,{directory:true});
   for(const name of (await fs.readdir(absolute)).sort())await visit(path.join(relative,name));
  }else if(stat.isFile())entries.set(relative,{hash:await digest(absolute),size:stat.size});
  else throw Error('無法複製此類型：'+absolute);
 }
 await visit();return entries;
}
export async function copyProject(source,destination){
 source=path.resolve(source);destination=path.resolve(destination);
 if(source.toLowerCase()===destination.toLowerCase())return {alreadyThere:true,files:0,bytes:0};
 const inside=(parent,child)=>{const relative=path.relative(parent,child);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
 if(inside(source,destination)||inside(destination,source))throw Error('來源與目的資料夾不能互相包含。');
 const expected=await inventory(source);
 let existing=new Map();
 try{existing=await inventory(destination);}catch(error){if(error.code!=='ENOENT')throw error;}
 // Check every conflict before writing; never overwrite existing different files.
 for(const [relative,entry] of expected){
  const current=existing.get(relative);
  if(current&&(!!current.directory!==!!entry.directory||(!entry.directory&&current.hash!==entry.hash)))throw Error('目的地已有不同內容，已停止且未覆蓋：'+path.join(destination,relative));
 }
 let files=0,bytes=0;
 for(const [relative,entry] of expected){
  const target=path.join(destination,relative);
  if(entry.directory)await fs.mkdir(target,{recursive:true});
  else{
   if(!existing.has(relative))await fs.copyFile(path.join(source,relative),target,constants.COPYFILE_EXCL);
   files++;bytes+=entry.size;
  }
 }
 for(const [relative,entry] of expected){
  if(!entry.directory&&await digest(path.join(destination,relative))!==entry.hash)throw Error('檔案核對失敗：'+relative);
 }
 return {alreadyThere:false,files,bytes};
}
function run(args,cwd){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd,stdio:'inherit',windowsHide:true});
  child.once('error',reject);
  child.once('exit',(code,signal)=>code===0?resolve():reject(Error(args.join(' ')+' 執行失敗：'+(signal||code))));
 });
}
async function main(){
 console.log('來源：'+sourceRoot+'\n目的地：'+destinationRoot+'\n核對並複製所有檔案（包含隱藏檔、素材與測試），原資料夾會保留。');
 const result=await copyProject(sourceRoot,destinationRoot);
 console.log(result.alreadyThere?'目前已在目的資料夾。':`複製完成：${result.files} 個檔案，${(result.bytes/1024/1024).toFixed(1)} MB，SHA-256 核對一致。`);
 console.log('\n從 D:\\PartyGame 執行遊戲與多人連線測試…');
 await run(['work/test.mjs'],destinationRoot);
 await run(['work/network-test.mjs'],destinationRoot);
 console.log('\n測試通過，即將開啟 D:\\PartyGame 的網站。之後可直接雙擊 D:\\PartyGame\\start-local.cmd。');
 await run(['start-local.mjs'],destinationRoot);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error('\n未完成：'+error.message+'\n原專案未刪除。');process.exitCode=1;});
