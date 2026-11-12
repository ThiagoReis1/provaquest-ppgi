from pathlib import Path
import shutil

root=Path(__file__).resolve().parents[1]
source=Path(__import__('os').environ.get('PPGI_OCR_IMAGE', str(root / '.sources/2026-02-page-1.jpg')))
target=root/'client/public/evidence/2026-02-page-1.jpg'
if source.exists():
    shutil.copyfile(source,target)
print(target)
