from pathlib import Path
import json
src=Path('/home/ubuntu/provaquest/client/src/data/questions.json')
out=Path('/home/ubuntu/provaquest/client/src/data/questions.ts')
data=json.loads(src.read_text())
out.write_text('// Generated from the official PPGI/UFAM exam PDFs.\nexport const studyData = '+json.dumps(data,ensure_ascii=False,indent=2)+' as const;\n')
print(out)
