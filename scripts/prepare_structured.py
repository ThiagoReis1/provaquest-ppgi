from pathlib import Path
import shutil

root=Path('/home/ubuntu/provaquest')
source=Path('/tmp/ppgi_ocr/2026-01.jpg')
target=root/'client/public/evidence/2026-02-page-1.jpg'
if source.exists():
    shutil.copyfile(source,target)
print(target)
