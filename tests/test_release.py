"""Release inputs (packaging spec §3, §6): what release/build.sh consumes is valid before any build runs."""
import configparser
import json
import subprocess
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / 'release'
PYPROJECT = tomllib.loads((ROOT / 'pyproject.toml').read_text())


def test_versions_match_between_pyproject_and_electron():
    assert json.loads((ROOT / 'electron/package.json').read_text())['version'] == PYPROJECT['project']['version']


def test_release_extra_pins_pyinstaller_exactly():
    assert PYPROJECT['project']['optional-dependencies']['release'] == ['pyinstaller==6.22.3', 'pyinstaller-hooks-contrib==2026.8']


def test_service_spec_is_one_directory_console_with_the_web_bundle():
    spec = (RELEASE / 'dhara-service.spec').read_text()
    compile(spec, 'dhara-service.spec', 'exec')
    assert "name='dhara-service'" in spec and 'console=True' in spec and 'COLLECT(' in spec
    assert "os.path.join('web', 'dist')" in spec and 'uvicorn.lifespan.on' in spec and "excludes=['faster_whisper']" in spec


def test_desktop_entry_names_the_icon_and_one_category():
    entry = configparser.ConfigParser(interpolation=None)
    entry.read(RELEASE / 'dhara.desktop')
    e = entry['Desktop Entry']
    assert (e['Type'], e['Name'], e['Exec'], e['Icon'], e['Categories'], e['Terminal']) == ('Application', 'Dhara', 'dhara', 'dhara', 'Office;', 'false')


def test_build_script_parses_and_its_outputs_are_ignored():
    subprocess.run(['bash', '-n', RELEASE / 'build.sh'], check=True)
    subprocess.run(['sh', '-n', RELEASE / 'AppRun'], check=True)
    ignored = (ROOT / '.gitignore').read_text().splitlines()
    assert 'release/out/' in ignored and 'release/cache/' in ignored
    assert json.loads((ROOT / 'electron/package.json').read_text())['scripts']['package'] == 'bash ../release/build.sh'
