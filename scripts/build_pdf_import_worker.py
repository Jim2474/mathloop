"""Build a self-contained Mac worker; Python is needed only on the build host."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
worker = root / 'scripts/pdf_import/app_worker.py'
requirements = root / 'scripts/pdf_import/requirements-app.txt'
output = root / 'src-tauri/resources/pdf-import-worker'
build = root / '.pdf-worker-build'
inputs = sorted(worker.parent.glob("*.py")) + sorted(worker.parent.glob("*_catalog.json")) + [requirements]
signature = hashlib.sha256(b"".join(p.read_bytes() for p in inputs) + os.uname().machine.encode()).hexdigest()
if (output / 'mathloop-pdf-worker').is_file() and (output / 'build-signature').is_file() and (output / 'build-signature').read_text() == signature:
    print('PDF worker is up to date')
    sys.exit(0)
if sys.platform != 'darwin':
    raise SystemExit('The PDF import worker is currently packaged for macOS only')
venv = root / '.venv-pdf-import'
python = venv / 'bin/python'
if not python.is_file():
    subprocess.run([sys.executable, '-m', 'venv', str(venv)], check=True)
subprocess.run([str(python), '-m', 'pip', 'install', '-r', str(requirements)], check=True)
catalog_args = [arg for path in sorted(worker.parent.glob('*_catalog.json'))
                for arg in ('--add-data', str(path) + ':.')]
subprocess.run([str(python), '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
                '--name', 'mathloop-pdf-worker', *catalog_args, '--distpath', str(build / 'dist'),
                '--workpath', str(build / 'work'), '--specpath', str(build), str(worker)], check=True)
source = build / 'dist/mathloop-pdf-worker'
if output.exists():
    shutil.rmtree(output)
shutil.copytree(source, output, symlinks=True)
(output / 'build-signature').write_text(signature)
print('Bundled PDF worker:', output)
