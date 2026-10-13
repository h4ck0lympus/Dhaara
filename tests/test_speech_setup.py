"""The speech setup helper offers the English-only models, which are faster and more accurate for English notes on a CPU."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_download_helper_offers_english_only_models():
    out = subprocess.run([sys.executable, str(ROOT / 'tools/download_speech_model.py'), '--help'], capture_output=True, text=True, cwd=ROOT).stdout
    for size in ('tiny.en', 'base.en', 'small.en', 'medium.en'):
        assert size in out, out
