#!/usr/bin/env python3
"""Explicit model download, separate from starting Noema."""
import argparse
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('size',choices=['tiny','base','small','medium','large-v3'])
p.add_argument('--output')
a=p.parse_args()
try:from faster_whisper.utils import download_model
except ImportError:raise SystemExit('Install the optional speech dependencies first: pip install -e ".[speech]"')
destination=Path(a.output or f'.data/models/whisper-{a.size}').resolve()
print(f'Downloading {a.size} into {destination}. This may use substantial disk space.')
download_model(a.size,output_dir=str(destination))
print(f'\nSet NOEMA_SPEECH_MODEL to: {destination}')
