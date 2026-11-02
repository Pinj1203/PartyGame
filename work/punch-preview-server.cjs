const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../dist');
http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://local').pathname;
 const file=pathname==='/'?path.join(__dirname,'punch-preview.html'):path.resolve(root,'.'+pathname);
 if(pathname!=='/'&&!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');res.end(data);});
}).listen(4190,'127.0.0.1',()=>console.log('Pose preview http://127.0.0.1:4190/'));
