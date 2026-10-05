import {mkdir,cp,copyFile,chmod,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const windows=process.platform==='win32';
const platform=windows ? 'windows':'mac';
const folder=path.resolve('dist/Chrome Capture');
await rm(folder,{recursive:true,force:true});await mkdir(folder,{recursive:true});
await cp('chrome-extension',path.join(folder,'chrome-extension'),{recursive:true});
await cp(windows ? 'native-host-windows':'native-host-mac',path.join(folder,windows ? 'native-host-windows':'native-host-mac'),{recursive:true});
await cp('packaging/'+platform,folder,{recursive:true});
await copyFile('README.md',path.join(folder,'사용법.md'));
const zip=path.resolve('dist/'+(windows ? 'Win':'Mac')+'_Chrome_Capture.zip');
await rm(zip,{force:true});
if(windows){
 execFileSync('powershell.exe',['-NoProfile','-Command',"Compress-Archive -LiteralPath 'dist\\Chrome Capture' -DestinationPath 'dist\\Win_Chrome_Capture.zip' -CompressionLevel Optimal"],{stdio:'inherit'});
}else{
 for(const name of ['저장 도우미 설치.command','저장 도우미 제거.command'])await chmod(path.join(folder,name),0o755);
 for(const name of ['install-host.sh','uninstall-host.sh','diagnose-host.sh','host.cjs'])await chmod(path.join(folder,'native-host-mac',name),0o755);
 execFileSync('ditto',['-c','-k','--norsrc','--keepParent',folder,zip],{stdio:'inherit'});
}
console.log('Created '+zip);
