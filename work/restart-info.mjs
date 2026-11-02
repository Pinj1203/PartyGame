import {execFileSync} from 'node:child_process';const output=execFileSync('netstat.exe',['-ano','-p','tcp'],{encoding:'utf8'});console.log(output.split(/\r?\n/).filter(l=>l.includes(':4173')&&l.includes('LISTENING')).join('\n'));
console.log(execFileSync('tasklist.exe',['/FI','PID eq 136048','/FO','CSV','/NH'],{encoding:'utf8'}));
