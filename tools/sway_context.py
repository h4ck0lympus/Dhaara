#!/usr/bin/env python3
"""Opt-in Sway WINDOW METADATA observer. Never captures pixels, clipboard or keys.

The helper needs both --observe-window-context and the server Settings toggle.
Metadata polling is every five seconds; stable context gets a 30-second heartbeat.
A title change must survive a second observation before it updates your focus.
"""
import argparse
import json
import os
import socket
import subprocess
import time
from client import Client

def focused_context(tree,monitor='',workspace=''):
    if tree.get('type')=='output':monitor=tree.get('name','')
    if tree.get('type')=='workspace':workspace=tree.get('name','')
    if tree.get('focused') and (tree.get('app_id') or tree.get('window_properties') or tree.get('pid')):
        props=tree.get('window_properties') or {}
        return {'device':socket.gethostname()[:80],'app':(tree.get('app_id') or props.get('class') or '')[:160],
                'title':(tree.get('name') or '')[:1000],'workspace':workspace[:80],'monitor':monitor[:80]}
    for child in tree.get('nodes',[])+tree.get('floating_nodes',[]):
        found=focused_context(child,monitor,workspace)
        if found:return found
    return None

def sway_json(kind):
    result=subprocess.run(['swaymsg','-r','-t',kind],capture_output=True,text=True,timeout=4,check=True)
    return json.loads(result.stdout)

class Observer:
    def __init__(self,client):self.client=client;self.candidate=None;self.previous=None;self.last_sent=0
    def step(self,summary=None):
        summary=summary or self.client.request('/companion')
        if not summary['settings']['observation_enabled']:
            self.candidate=None;self.previous=None;return summary
        data=focused_context(sway_json('get_tree'))
        if not data:return summary
        # Opening Dhara itself should not replace the work context being resumed.
        if data['app'].lower().startswith('dhara') or data['title'].startswith('Dhara'):return summary
        signature=json.dumps(data,sort_keys=True)
        if signature!=self.candidate:self.candidate=signature;return summary
        if signature!=self.previous or time.monotonic()-self.last_sent>=30:
            self.client.request('/context',data);self.previous=signature;self.last_sent=time.monotonic()
        return summary

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--url',default='http://127.0.0.1:8765');p.add_argument('--observe-window-context',action='store_true')
    args=p.parse_args()
    if not args.observe_window_context:p.error('Explicit --observe-window-context is required. No observation was started.')
    if not os.getenv('SWAYSOCK'):p.error('Run this helper inside your Sway session.')
    try:client=Client(args.url)
    except ValueError as e:p.error(str(e))
    print('Window metadata observer enabled locally. No screenshots are taken. Pause in Dhara Settings or Ctrl-C.')
    observer=Observer(client)
    while True:
        try:observer.step()
        except KeyboardInterrupt:return
        except Exception as e:print(type(e).__name__+': observer unavailable; retrying in 5 seconds.',flush=True)
        time.sleep(5)
if __name__=='__main__':main()
