#!/usr/bin/env python3
"""Isolated CPU transcription process; exits afterwards to release model memory.

Only loads already-downloaded models. No model download occurs in this script.
"""
import argparse
import json
import sys

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--model',required=True);p.add_argument('--audio',required=True)
    args=p.parse_args()
    try:from faster_whisper import WhisperModel
    except ImportError:
        print('Install the speech extra first: pip install -e ".[speech]"',file=sys.stderr);return 2
    model=WhisperModel(args.model,device='cpu',compute_type='int8',cpu_threads=4,num_workers=1,local_files_only=True)
    segments,info=model.transcribe(args.audio,beam_size=5,vad_filter=True,
        initial_prompt='Technical notes. CTF, pwning, reverse engineering, heap, ROP, Ghidra, Binary Ninja, LeetCode, backpropagation.')
    parts=[{'start':s.start,'end':s.end,'text':s.text} for s in segments]
    print(json.dumps({'text':' '.join(p['text'].strip() for p in parts),'segments':parts,'language':info.language},ensure_ascii=False))
    return 0
if __name__=='__main__':raise SystemExit(main())
