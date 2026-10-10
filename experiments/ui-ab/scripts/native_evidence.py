"""Capture only own app windows on a private Xvfb, never the user's display."""
import argparse
import json
import os
from pathlib import Path
from x11_input import Input
import re
import subprocess
import time
import tempfile
ROOT=Path(__file__).resolve().parents[1]
XVFB='/tmp/noema-webview-sdk-V3K1nA/root/usr/bin/Xvfb'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',default='evidence/native-round1');parser.add_argument('--host',choices=['a','b','both'],default='both');parser.add_argument('--width',type=int,default=1546);parser.add_argument('--height',type=int,default=835);parser.add_argument('--screen',default='Now');parser.add_argument('--panel',default='open');parser.add_argument('--companion-checks',action='store_true');args=parser.parse_args()
    out=ROOT/args.output;out.mkdir(parents=True,exist_ok=True)
    xvfb=subprocess.Popen([XVFB,'-displayfd','1','-screen','0','1600x950x24','-nolisten','tcp','-noreset'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    display=':'+xvfb.stdout.readline().strip();assert display[1:].isdigit()
    processes=[];reports=[];desktop=[]
    try:
        env=os.environ.copy();env.pop('WAYLAND_DISPLAY',None);env.pop('SWAYSOCK',None);env.update(DISPLAY=display,GDK_BACKEND='x11',LIBGL_ALWAYS_SOFTWARE='1',WEBKIT_DISABLE_DMABUF_RENDERER='1',NOEMA_SCREEN=args.screen,NOEMA_PANEL=args.panel,NOEMA_WIDTH=str(args.width),NOEMA_HEIGHT=str(args.height),NOEMA_DISPLAY_BACKEND='x11',XDG_SESSION_TYPE='x11',NOEMA_RUN_ID=out.name)
        if args.companion_checks:
            sdk=Path('/tmp/noema-companion-qa-sdk/root')
            env['LD_LIBRARY_PATH']=str(sdk/'usr/lib/x86_64-linux-gnu')
            env['XDG_DATA_DIRS']=str(sdk/'usr/share')+':/usr/local/share:/usr/share'
            config=out/'private-openbox.xml'
            config.write_text('<openbox_config xmlns="http://openbox.org/3.4/rc"><theme><name>Clearlooks</name></theme><applications><application name="*"><decor>no</decor><position><x>0</x><y>0</y></position></application></applications></openbox_config>')
            desktop.append(subprocess.Popen([str(sdk/'usr/bin/openbox'),'--config-file',str(config)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
            time.sleep(.7)
            desktop.append(subprocess.Popen([str(sdk/'usr/bin/xcompmgr'),'-n'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
            subprocess.run(['xsetroot','-solid','#36475f'],env=env,check=True)
        for host in (['a','b'] if args.host=='both' else [args.host]):
            log=open(out/f'{host}-{args.screen}-{args.panel}.log','w')
            native=subprocess.Popen(['dbus-run-session','--','python3','scripts/launch.py',host],cwd=ROOT,env=env,stdout=log,stderr=log,start_new_session=True);processes.append(native)
            found=None
            for _ in range(150):
                if native.poll() is not None: break
                tree=subprocess.check_output(['xwininfo','-display',display,'-root','-tree'],text=True)
                match=re.search(r'(0x[0-9a-fA-F]+) "Noema · '+host.upper()+r' · isolated demo"',tree)
                if match: found=match[1];break
                time.sleep(.1)
            time.sleep(3)
            if found and native.poll() is None:
                position=Input(display,found);position.move(args.width-18,args.height-130);position.close()
                target=out/f'{host}-{args.screen.lower()}-{args.panel}.png'
                subprocess.run(['import','-display',display,'-window',found,str(target)],check=True,timeout=15)
                report={'host':host,'image':target.name,'display':'Private Xvfb / X11, software rendering requested','css_viewport':[args.width,args.height],'scale':1,'fixture':'populated','security':'Engine sandbox retained; no permission requests or production data'}
                screenshots=[target.name]
                def capture(name):
                    target=out/f'{host}-{name}.png'
                    subprocess.run(['import','-display',display,'-window',found,str(target)],check=True,timeout=15);screenshots.append(target.name)
                if args.companion_checks:
                    pet=None
                    tree=subprocess.check_output(['xwininfo','-display',display,'-root','-tree'],text=True)
                    match=re.search(r'(0x[0-9a-fA-F]+) "Noema desktop companion"',tree)
                    assert match,'Independent companion window missing'
                    pet=match[1]
                    pointer=Input(display,found)
                    # Real multiline task input, keyboard submission and isolated persistence.
                    pointer.click(974,530);time.sleep(.2);pointer.type('leetcode by tonight');pointer.key('Return','Control_L');time.sleep(.6);capture('task-added')
                    pointer.key('Escape');pointer.click(80,295);capture('plan');pointer.click(80,196);capture('capture');pointer.click(440,315);pointer.type('A private learning note');capture('capture-typed')
                    pointer.click(1020,552);time.sleep(.5);pointer.click(80,247);capture('note');pointer.click(80,146)
                    # Companion controls toggle observation through the restricted native preload.
                    subprocess.run(['import','-display',display,'-window','root',str(out/f'{host}-desktop-before-controls.png')],check=True,timeout=15)
                    cat=Input(display,pet);cat.click(48,48);cat.close();time.sleep(.4)
                    tree=subprocess.check_output(['xwininfo','-display',display,'-root','-tree'],text=True)
                    pop=re.search(r'(0x[0-9a-fA-F]+) "Noema companion controls"',tree);assert pop,tree
                    controls=Input(display,pop[1]);controls.click(120,149);controls.close()
                    activity=subprocess.Popen(['xmessage','-title','LeetCode · controlled activity','-buttons','Close:0','Private fixture window'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);processes.append(activity)
                    time.sleep(11)
                    pointer.minimize(found)
                    info=subprocess.check_output(['xwininfo','-display',display,'-id',found],text=True);assert 'IsUnMapped' in info
                    pet_info=subprocess.check_output(['xwininfo','-display',display,'-id',pet],text=True);assert 'IsViewable' in pet_info
                    subprocess.run(['import','-display',display,'-window','root',str(out/f'{host}-desktop-main-minimized.png')],check=True,timeout=15)
                    activity_file=ROOT/'.demo/evidence'/out.name/host/'companion/activity.json'
                    saved=json.loads(activity_file.read_text());assert saved['activity']['practice']['app']=='Xmessage';assert saved['activity']['practice']['seconds']>0
                    activity.terminate();activity.wait(timeout=5)
                    pointer.restore(found);time.sleep(3.5);capture('observed-task');pointer.close()
                    if host=='b':
                        saved=json.loads((ROOT/'.demo/evidence'/out.name/'b/demo-populated.json').read_text())
                        assert any(t['raw']=='leetcode by tonight' for t in saved['tasks'])
                        assert saved['pin']=='allocator';assert saved['tasks'][4]['status']=='ready'
                        assert saved['tasks'][4].get('activity',{}).get('seconds',0)>0
                        report['storage_check']={'task_saved':True,'pin_preserved':True,'matched_activity_synced':True,'completion_not_inferred':True}
                    report['companion_checks']={'own_window':True,'main_minimized':True,'pet_still_viewable':True,'active_window_observed':'Controlled Xmessage on private X11','activity_recorded':True,'compositing':'Private xcompmgr; inspect transparent silhouette against plain desktop'}
                report['screenshots']=screenshots;reports.append(report)
            else: reports.append({'host':host,'launch':'failed','log':f'{host}-{args.screen}-{args.panel}.log'})
            # Normal native close checkpoints demo state; only our private window is addressed.
            if found and native.poll() is None:
                import sys
                sys.path.insert(0,str(ROOT.parents[1]/'qa'))
                from managed_screenshots import close_window
                close_window(display,int(found,16))
                try:
                    code=native.wait(timeout=15)
                    reports[-1]['normal_close_exit']=code
                except subprocess.TimeoutExpired:
                    reports[-1]['normal_close_exit']='timeout'
            # Fallback terminates only this harness's own group.
            if native.poll() is None:
                import signal
                os.killpg(native.pid,signal.SIGTERM);native.wait(timeout=15)
            log.close()
        (out/'results.json').write_text(json.dumps(reports,indent=2)+'\n');print(json.dumps(reports))
    finally:
        import signal
        for proc in processes:
            if proc.poll() is None:os.killpg(proc.pid,signal.SIGTERM);proc.wait(timeout=15)
        for proc in desktop:
            if proc.poll() is None:proc.terminate();proc.wait(timeout=5)
        xvfb.terminate();xvfb.wait(timeout=5)
if __name__=='__main__':main()
