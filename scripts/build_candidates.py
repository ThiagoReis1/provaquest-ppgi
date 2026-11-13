import json, pathlib, re, unicodedata, requests
from bs4 import BeautifulSoup

root = pathlib.Path(__import__('os').environ.get('PPGI_RESULT_TEXT_DIR', str(pathlib.Path(__file__).resolve().parents[1] / '.sources' / 'results')) )
out = pathlib.Path(__file__).resolve().parents[1] / 'client/src/data/candidates.ts'
num_re = re.compile(r'(?<!\w)(\d{1,3}(?:[.,]\d{1,2})?)(?!\w)')
skip = ('PODER EXECUTIVO','MINISTÉRIO','UNIVERSIDADE','INSTITUTO','PROGRAMA','EDITAL','RESULTADO','CANDIDATO','NOTA','MANAUS','COORDENADOR','AV. GAL','FONE','PROCESSO','SELETIVO','ANEXO','TÍTULOS','PROPOSTA','PROVA','FINAL','SITUAÇÃO','HOMOLOGAÇÃO','ERRATA','RETIFICAÇÃO','RETIFICACAO','COMUNICADO','AVISO','TABELA','RELAÇÃO','LISTA')

def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def clean(s):
    return re.sub(r'\s+', ' ', s).strip(' .:-')

def number(s):
    try: return float(s.replace('.', '').replace(',', '.')) if ',' in s else float(s)
    except ValueError: return None

def parse_rows(path, kind):
    """Parse official layout text. Each row retains the published score(s)."""
    rows, degree = [], ''
    for raw in path.read_text(errors='ignore').splitlines():
        s = clean(raw)
        if not s: continue
        low = s.lower()
        if low in ('mestrado','doutorado','mestrado – vagas regulares','doutorado – vagas regulares','mestrado – vagas suplementares','doutorado – vagas suplementares','doutorado – vagas exclusivas tae'):
            degree = s.title(); continue
        status_match = re.search(r'\s+(Homologada|Não Homologada|Sim|Não)\s*$', s, re.I)
        if kind == 'inscricoes' and status_match:
            name = clean(s[:status_match.start()])
            if len(name.split()) >= 2 and not any(name.upper().startswith(k) for k in skip):
                rows.append({'name': name, 'degree': degree, 'status': status_match.group(1), 'score': None})
            continue
        matches = list(num_re.finditer(s))
        if not matches: continue
        name = clean(s[:matches[0].start()])
        if len(name.split()) < 2 or any(name.upper().startswith(k) for k in skip): continue
        # Linhas de cabeçalho ("Errata do Resultado...", "Retificação...") têm
        # cara de nome + número, mas não são candidatos.
        if any(word in name.upper() for word in ('ERRATA','RETIFICAÇÃO','RETIFICACAO','COMUNICADO','TABELA','RELAÇÃO')): continue
        scores = [number(m.group(1)) for m in matches]
        scores = [x for x in scores if x is not None]
        if not scores: continue
        status = None
        tail = s[matches[-1].end():].strip()
        if tail and len(tail) < 50 and not re.search(r'[0-9]', tail): status = tail
        row = {'name': name, 'degree': degree, 'status': status or 'Publicado', 'score': scores[0]}
        if kind == 'final':
            # Alguns PDFs quebram a linha entre o nome e os componentes. Só
            # rotulamos uma nota final quando há componentes suficientes para
            # identificar a coluna final com segurança.
            if len(scores) >= 2:
                row['finalScore'] = scores[-1]
                row['componentScores'] = scores
        rows.append(row)
    # Deduplicate only within a document; the same person can appear in multiple modalities/pages.
    seen, result = set(), []
    for row in rows:
        key = norm(row['name'])
        if key not in seen:
            seen.add(key); result.append(row)
    return result

sources = {
 '2026-02':'https://ppgi.ufam.edu.br/encerrados.html?id=162',
 '2026-01':'https://ppgi.ufam.edu.br/encerrados/2-uncategorised/157-mestrado-2026-01.html',
 '2025-02':'https://ppgi.ufam.edu.br/encerrados/2-uncategorised/155-selecao-2025-02.html',
 '2025-01':'https://ppgi.ufam.edu.br/encerrados/2-uncategorised/151-selecao2025-1.html',
 '2024-02':'https://ppgi.ufam.edu.br/encerrados/2-uncategorised/146-editais-031-2024.html',
 '2024-01':'https://ppgi.ufam.edu.br/encerrados/2-uncategorised/143-editais-vigentes-4.html',
 '2020-01':'https://ppgi.ufam.edu.br/encerrados/2-uncategorised/86-selecao-2020-01-cursos-de-mestrado-e-doutorado.html',
}
urls = json.load(open('/tmp/ppgi_result_pdfs/urls.json'))

def drive_view(url):
    if not url:
        return url
    match = re.search(r"[?&]id=([^&]+)", url)
    if match and "drive.google.com" in url:
        return f"https://drive.google.com/file/d/{match.group(1)}/view"
    match = re.search(r"/file/d/([^/]+)", url)
    if match and "drive.google.com" in url:
        return f"https://drive.google.com/file/d/{match.group(1)}/view"
    return url

edition_meta = {
 '2026-02': {'editalUrl': 'https://edoc.ufam.edu.br/bitstream/123456789/11516/1/EDITAL%20N.%c2%ba%20014-2026-PROPESP-UFAM-PPGI-M-2026-2-Site.pdf', 'editalLabel': 'Edital 014/2026'},
 '2026-01': {'editalUrl': 'https://drive.google.com/file/d/1uxWtOzC0LI1H9pfFK_SYSxV1P1nKfajl/view', 'editalLabel': 'Edital 098/2025'},
 '2025-02': {'editalUrl': 'https://edoc.ufam.edu.br/bitstream/123456789/10194/1/EDITAL%20N.%c2%ba%20048-2025-PROPESP-UFAM-PPGI-M-D-2025-2-Site.pdf', 'editalLabel': 'Edital 048/2025'},
 '2025-01': {'editalUrl': 'https://edoc.ufam.edu.br/bitstream/123456789/9214/1/EDITAL%20N.%c2%ba%20092-2024-PROPESP-UFAM-PPGI-M-D-2025-1-Site.pdf', 'editalLabel': 'Edital 092/2024'},
 '2024-02': {'editalUrl': 'https://edoc.ufam.edu.br/bitstream/123456789/8339/1/EDITAL%20N.%c2%ba%20031-2024-PROPESP-UFAM-PPGI-M-D-2024-2-Site.pdf', 'editalLabel': 'Edital 031/2024'},
 '2024-01': {'editalUrl': 'https://drive.google.com/file/d/1rWUIHlm7onS5sYCQZ06UaPF_ciVRe8pU/view', 'editalLabel': 'Edital 071/2023'},
 '2020-01': {'editalUrl': 'https://ppgi.ufam.edu.br/images/editais/Edital_060_2019_PPGI.pdf', 'editalLabel': 'Edital 060/2019'},
}

# 2020/01 publishes the homologation table in official HTML.
h = BeautifulSoup(requests.get('https://antigoppgi.ufam.edu.br/selecao-ppg/2020-01/homologacao-das-inscricoes-edital-060-2019').text, 'html.parser')
manual_2020, current = [], ''
for tr in h.find_all('tr'):
    cells = [clean(c.get_text(' ', strip=True)) for c in tr.find_all(['th','td'])]
    joined = ' '.join(cells)
    if 'DOUTORADO' in joined.upper(): current = 'Doutorado'
    elif 'MESTRADO' in joined.upper(): current = 'Mestrado'
    elif len(cells) >= 2 and cells[1].lower() in ('homologada','não homologada') and len(cells[0].split()) >= 2:
        manual_2020.append({'name':cells[0], 'degree':current, 'status':cells[1], 'score':None})

# The public result pages contain separate M/D documents in 2026; combine them into the same edition funnel.
config = {
 '2026-02': {'label':'2026/02', 'stages':[('inscricoes','Inscrições homologadas',['2026-02-m-inscricoes','2026-02-d-inscricoes']),('prova','Prova de conhecimentos',['2026-02-m-prova','2026-02-d-prova']),('titulos','Títulos e currículo',['2026-02-m-titulos','2026-02-d-titulos']),('final','Classificação final',['2026-02-m-final','2026-02-d-final'])], 'docUrls':urls.get('2026-02-m',{})},
 '2026-01': {'label':'2026/01', 'stages':[('inscricoes','Inscrições homologadas',['2026-01-m-inscricoes','2026-01-d-inscricoes']),('prova','Prova de conhecimentos',['2026-01-m-prova','2026-01-d-prova']),('titulos','Títulos e currículo',['2026-01-m-titulos','2026-01-d-titulos']),('final','Classificação final',['2026-01-m-final','2026-01-d-final'])], 'docUrls':urls.get('2026-01-m',{})},
 '2025-02': {'label':'2025/02', 'stages':[('inscricoes','Inscrições homologadas',['2025-02-inscricoes']),('prova','Prova de conhecimentos',['2025-02-prova']),('projetos','Análise de projetos',['2025-02-projetos']),('titulos','Prova de títulos',['2025-02-titulos']),('final','Classificação final',['2025-02-final'])], 'docUrls':urls.get('2025-02',{})},
 '2025-01': {'label':'2025/01', 'stages':[('inscricoes','Inscrições homologadas',['2025-01-inscricoes']),('prova','Prova de conhecimentos',['2025-01-prova']),('projetos','Análise de projetos',['2025-01-projetos']),('titulos','Prova de títulos',['2025-01-titulos']),('final','Classificação final',['2025-01-final'])], 'docUrls':urls.get('2025-01',{})},
 '2024-02': {'label':'2024/02', 'stages':[('inscricoes','Inscrições homologadas',['2024-02-inscricoes']),('prova','Prova de conhecimentos',['2024-02-prova']),('projetos','Análise de projetos',['2024-02-projetos']),('titulos','Prova de títulos',['2024-02-titulos']),('final','Classificação final',['2024-02-final'])], 'docUrls':urls.get('2024-02',{})},
 '2024-01': {'label':'2024/01', 'stages':[('inscricoes','Inscrições homologadas',['2024-01-inscricoes']),('prova','Prova de conhecimentos',['2024-01-prova']),('projetos','Análise de projetos',['2024-01-projetos']),('titulos','Prova de títulos',['2024-01-titulos']),('final','Classificação final',['2024-01-final'])], 'docUrls':urls.get('2024-01',{})},
 '2020-01': {'label':'2020/01', 'stages':[('inscricoes','Inscrições homologadas',['2020-01-inscricoes']),('prova','Prova de conhecimentos',['2020-01-prova']),('projetos','Análise de projetos',['2020-01-projetos']),('final','Classificação final',['2020-01-final'])], 'docUrls':urls.get('2020-01',{})},
}

all_parsed = {}
for p in root.glob('*.txt'):
    kind = 'inscricoes' if 'inscricoes' in p.stem else ('final' if 'final' in p.stem else ('projetos' if 'projetos' in p.stem else ('titulos' if 'titulos' in p.stem else 'prova')))
    all_parsed[p.stem] = parse_rows(p, kind)
all_parsed['2020-01-inscricoes'] = manual_2020

records = []
for eid, c in config.items():
    by_name = {}
    for stage, label, files in c['stages']:
        for file in files:
            for row in all_parsed.get(file, []):
                key = norm(row['name'])
                person = by_name.setdefault(key, {'name':row['name'], 'degree':row.get('degree') or 'Modalidade publicada no documento', 'stages':{}})
                if person['degree'] == 'Modalidade publicada no documento' and row.get('degree'): person['degree'] = row['degree']
                entry = {'status':row.get('status','Publicado')}
                if row.get('score') is not None: entry['score'] = row['score']
                if row.get('finalScore') is not None: entry['finalScore'] = row['finalScore']
                if row.get('componentScores'): entry['componentScores'] = row['componentScores']
                person['stages'][stage] = entry
    stage_keys = [x[0] for x in c['stages']]
    for person in by_name.values():
        st = person['stages']
        person['id'] = f"{eid}-{norm(person['name']).replace(' ','-')}"
        # A stage is considered passed only when the candidate is present in the official next-stage result.
        person['passedStages'] = [stage_keys[i] for i in range(len(stage_keys)-1) if stage_keys[i+1] in st]
        # Some official result documents omit the previous stage while still
        # publishing the candidate in the next one. Keep that passed stage in
        # the generated model so the UI can display the complete funnel.
        for stage in person['passedStages']:
            st.setdefault(stage, {'status': 'Aprovado'})
        records.append({'editionId':eid,'editionLabel':c['label'],'sourcePage':sources[eid],'editalUrl':edition_meta[eid]['editalUrl'],'editalLabel':edition_meta[eid]['editalLabel'],'documents':{stage: drive_view(url) for stage, url in c['docUrls'].items()},'candidate':person})

payload = {
 'generatedNote':'Notas extraídas dos resultados oficiais. Para cada etapa, “Passou” significa que o candidato aparece no resultado oficial da etapa seguinte; “Não passou” significa que não aparece nele. A nota permanece a publicada no documento, sem arredondamento inventado.',
 'rules': {'prova': {'label':'Corte de prova de conhecimentos','minimum':7.0,'note':'Referência de corte usada na leitura do processo; a situação exibida também respeita a publicação da etapa seguinte.'}},
 'records': records,
}
out.write_text('export const candidateData = '+json.dumps(payload,ensure_ascii=False,indent=2)+' as const;\n')
print('records',len(records))
for eid in config: print(eid, sum(1 for r in records if r['editionId']==eid))
