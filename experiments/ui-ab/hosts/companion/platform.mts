import { execFile,spawn,type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
const run=promisify(execFile);
export type ActivityContext={app:string;title:string;workspace:string;monitor:string;bounds?:{x:number;y:number;width:number;height:number}};
export interface ActivityProvider {id:string;read():Promise<ActivityContext|null>;dispose?():void}
const command=async(file:string,args:string[])=>String((await run(file,args,{timeout:4000,maxBuffer:256_000,windowsHide:true})).stdout).trim();
export function providerFor(platform=process.platform,env=process.env):ActivityProvider {
 if(platform==='win32'){let worker:ChildProcessWithoutNullStreams|null=null;let pending:{resolve:(value:ActivityContext)=>void;reject:(error:Error)=>void}|null=null;
 const dispose=()=>{worker?.kill();worker=null;pending?.reject(Error('Foreground worker stopped'));pending=null;};
 return {id:'windows-foreground',dispose,async read(){
  const script=`Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public class NoemaForeground {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder t, int n);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
}
'@
while ($null -ne [Console]::ReadLine()) { try { $h=[NoemaForeground]::GetForegroundWindow(); $t=New-Object Text.StringBuilder 1001; [void][NoemaForeground]::GetWindowText($h,$t,1001); [uint32]$p=0; [void][NoemaForeground]::GetWindowThreadProcessId($h,[ref]$p); $r=New-Object NoemaForeground+Rect; [void][NoemaForeground]::GetWindowRect($h,[ref]$r); @{app=(Get-Process -Id $p).ProcessName;title=$t.ToString();workspace='';monitor='';bounds=@{x=$r.Left;y=$r.Top;width=$r.Right-$r.Left;height=$r.Bottom-$r.Top}} | ConvertTo-Json -Compress } catch { [Console]::WriteLine('{}') } }`;
  if(!worker){worker=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:'pipe'});worker.stderr.resume();createInterface({input:worker.stdout}).on('line',line=>{if(!pending)return;const request=pending;pending=null;try{const value=JSON.parse(line);if(typeof value.app!=='string'||typeof value.title!=='string')throw Error('Unavailable foreground metadata');request.resolve(value);}catch{request.reject(Error('Unavailable foreground metadata'));}});const started=worker;worker.on('error',()=>{if(worker===started)dispose();});worker.on('exit',()=>{if(worker===started)dispose();});}
 if(pending)throw Error('Foreground sample already pending');
 return new Promise<ActivityContext>((resolve,reject)=>{const timer=setTimeout(()=>dispose(),4000);pending={resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}};worker!.stdin.write('sample\n',error=>{if(error)dispose();});});
 }};}
 if(platform==='darwin')return {id:'macos-frontmost',async read(){
  // System Events access may require the user's macOS Accessibility permission.
  const script=`tell application "System Events"
set p to first application process whose frontmost is true
set appName to name of p
set windowTitle to ""
set bx to 0
set by to 0
set bw to 1
set bh to 1
if exists front window of p then
set windowTitle to name of front window of p
set {bx, by} to position of front window of p
set {bw, bh} to size of front window of p
end if
return appName & linefeed & windowTitle & linefeed & bx & "," & by & "," & bw & "," & bh
end tell`;
  const lines=(await command('/usr/bin/osascript',['-e',script])).split('\n');
  const [x,y,width,height]=lines.pop()!.split(',').map(Number);
  return {app:lines.shift()||'',title:lines.join('\n'),monitor:'',workspace:'',bounds:{x,y,width,height}};
 }};
 if(platform==='linux'&&env.SWAYSOCK&&env.XDG_SESSION_TYPE!=='x11')return {id:'linux-sway',async read(){
  const tree=JSON.parse(await command('swaymsg',['-r','-t','get_tree']));
  function walk(node:any,monitor='',workspace=''):ActivityContext|null{
   if(node.type==='output')monitor=node.name||'';
   if(node.type==='workspace')workspace=node.name||'';
   if(node.focused&&(node.app_id||node.window_properties||node.pid))return {app:node.app_id||node.window_properties?.class||'',title:node.name||'',monitor,workspace,bounds:node.rect};
   for(const child of [...(node.nodes||[]),...(node.floating_nodes||[])]){const found=walk(child,monitor,workspace);if(found)return found;}
   return null;
  }
  return walk(tree);
 }};
 if(platform==='linux'&&(env.XDG_SESSION_TYPE==='x11'||(!env.WAYLAND_DISPLAY&&env.DISPLAY)))return {id:'linux-x11',async read(){
  const active=(await command('xprop',['-root','_NET_ACTIVE_WINDOW'])).match(/0x[0-9a-f]+/i)?.[0];
  if(!active||active==='0x0')return null;
  const properties=await command('xprop',['-id',active,'WM_CLASS','_NET_WM_NAME','WM_NAME']);
  const quoted=(line:string)=>Array.from(line.matchAll(/"((?:\\.|[^"\\])*)"/g),m=>m[1].replace(/\\"/g,'"'));
  const lines=properties.split('\n'),classes=quoted(lines.find(l=>l.startsWith('WM_CLASS'))||'');
  const title=quoted(lines.find(l=>l.startsWith('_NET_WM_NAME')&&l.includes('='))||lines.find(l=>l.startsWith('WM_NAME'))||'')[0]||'';
  const desktop=await command('xprop',['-root','_NET_CURRENT_DESKTOP']).catch(()=>'');
  const geometry=await command('xwininfo',['-id',active]);
  const value=(name:string)=>Number(geometry.match(new RegExp(name+':\\s*(-?\\d+)'))?.[1]||0);
  return {app:classes.at(-1)||'',title,workspace:desktop.match(/=\s*(\d+)/)?.[1]||'',monitor:'',bounds:{x:value('Absolute upper-left X'),y:value('Absolute upper-left Y'),width:value('Width'),height:value('Height')}};
 }};
 return {id:platform==='linux'?'linux-wayland-unavailable':'unsupported',async read(){throw Error('This desktop does not expose a supported active-window API. No observation is running.');}};
}
export function matchTask(context:ActivityContext,tasks:{id:string;status:string;activityMatch?:string}[]):string|null{
 const haystack=(context.app+' '+context.title).toLowerCase();
 const matches=tasks.filter(t=>t.status!=='complete'&&t.activityMatch?.trim()&&haystack.includes(t.activityMatch.trim().toLowerCase()));
 return matches.length===1?matches[0].id:null;
}
