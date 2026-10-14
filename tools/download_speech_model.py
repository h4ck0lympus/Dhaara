#!/usr/bin/env python3
"""Explicit model download, separate from starting Dhara."""
import argparse
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('size',choices=['tiny','tiny.en','base','base.en','small','small.en','medium','medium.en','large-v3'],help='.en models are English-only: faster and more accurate for English notes on a CPU')
p.add_argument('--output')
a=p.parse_args()
try:from faster_whisper.utils import download_model
except ImportError:raise SystemExit('Install the optional speech dependencies first: pip install -e ".[speech]"')
destination=Path(a.output or f'.data/models/whisper-{a.size}').resolve()
print(f'Downloading {a.size} into {destination}. This may use substantial disk space.')
download_model(a.size,output_dir=str(destination))
print(f'\nSet DHARA_SPEECH_MODEL to: {destination}')
