from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path('/home/ubuntu/provaquest')
SRC = Path('/tmp/ppgi_provas')
ASSETS = ROOT / 'client/public/evidence'
ASSETS.mkdir(parents=True, exist_ok=True)

KEYS = {
    '2026-02': {1:'B',2:'B',3:'C',4:'B',5:'D',6:'D',7:'C',8:'A',9:'D',10:'C',11:None,12:'D',13:None,14:'C',15:'D',16:'A',17:'A',18:'D',19:'C',20:None},
    '2026-01': {1:'C',2:'D',3:'A',4:'C',5:None,6:'B',7:None,8:'C',9:None,10:None,11:None,12:None,13:'C',14:'C',15:None,16:'B',17:'B',18:'A',19:'B',20:'C'},
    '2025-02': {1:'B',2:'A',3:'A',4:'C',5:None,6:None,7:'A',8:'A',9:'C',10:'B',11:'B',12:'D',13:'C',14:'B',15:'D',16:'A',17:'D',18:'D',19:None,20:'A'},
    '2025-01': {1:'A',2:None,3:'A',4:'E',5:None,6:None,7:'C',8:'C',9:'B',10:'D',11:'B',12:'C',13:'B',14:'D',15:None,16:'E',17:'C',18:'C',19:'E',20:'D'},
    '2024-02': {1:None,2:'C',3:'A',4:'D',5:'A',6:'A',7:None,8:'A',9:'C',10:'C',11:'C',12:'A',13:'B',14:'A',15:'B',16:None,17:'B',18:'A',19:'C',20:'C'},
    '2024-01': {1:None,2:'A',3:'B',4:'C',5:'B',6:'B',7:None,8:'D',9:'B',10:None,11:'D',12:'B',13:'C',14:'D',15:'B',16:'A',17:'C',18:'D',19:'B',20:'B'},
    '2020-01': {1:'C',2:'A',3:'D',4:'C',5:'B',6:'C',7:'D',8:'B',9:'A',10:'E',11:None,12:'D',13:None,14:'A',15:'A',16:None,17:'A',18:'A',19:'E',20:'E'},
}

STRUCTURED = {
    ('2026-02', 1): {
        'intro': 'Considere o pseudocódigo a seguir, no qual conta(A, n) recebe um vetor A de tamanho n. Suponha que as operações aritméticas, comparações e acessos a vetores têm custo constante.',
        'code': '''int conta(int A[], int n) {
    int s = 0;
    int i, j;

    for (i = 1; i <= n; i = i * 2) {
        for (j = 0; j < i && j < n; j++) {
            s = s + A[j];
        }
    }

    return s;
}''',
        'ask': 'Quais as complexidades de tempo e espaço auxiliar do algoritmo em função de n?',
        'sourcePageImage': '/evidence/2026-02-page-1.jpg',
        'sourcePageLabel': 'Página 1 · prova original',
    },
    ('2026-02', 2): {
        'prompt': 'Com relação à estrutura de heap implementada como uma árvore binária, quais afirmações são verdadeiras?\nI. O maior valor em um heap máximo está no elemento raiz da árvore.\nII. O menor valor no heap máximo está no elemento raiz da árvore.\nIII. O heap pode ser utilizado como base para o método de ordenação Heap Sort.\nIV. O heap pode ser utilizado como uma fila de prioridades.',
        'options': [
            {'id': 'A', 'text': 'Apenas I, II e III.'},
            {'id': 'B', 'text': 'Apenas I, III e IV.'},
            {'id': 'C', 'text': 'Apenas II, III e IV.'},
            {'id': 'D', 'text': 'Todas as afirmações são verdadeiras.'},
        ],
    },
    ('2026-02', 3): {
        'intro': 'O pseudocódigo seguinte é uma função recursiva para calcular a potência b^e, com o pré-requisito de que o parâmetro e seja um inteiro maior ou igual a 1.',
        'code': '''def pot(b, e):
    if e <= 1:
        return b

    if e % 2 == 1:
        fator = b
        e -= 1
    else:
        fator = 1

    return fator * pot(b, e // 2) * pot(b, e // 2)''',
        'ask': 'Qual é a complexidade temporal do algoritmo, respectivamente, no melhor e no pior caso? Considere que a operação de multiplicação tem complexidade constante.',
        'prompt': 'O pseudocódigo seguinte é uma função recursiva para calcular a potência b^e, com o pré-requisito de que o parâmetro e seja um inteiro maior ou igual a 1.\ndef pot(b, e):\n    if e <= 1:\n        return b\n\n    if e % 2 == 1:\n        fator = b\n        e -= 1\n    else:\n        fator = 1\n\n    return fator * pot(b, e // 2) * pot(b, e // 2)\n\nQual é a complexidade temporal do algoritmo, respectivamente, no melhor e no pior caso? Considere que a operação de multiplicação tem complexidade constante.',
    },
}

EDITIONS = [
    {'id':'2026-02','label':'Mestrado 2026/02','examUrl':'https://drive.google.com/file/d/11XQsev4g5wn1PfgxElCN1wfIHRX58SoG/view?usp=sharing','keyUrl':'https://drive.google.com/file/d/11wCulVUskHybras1UMRWq99pYDvkOmSS/view?usp=sharing','title':'Edital 014/2026','subtitle':'Prova de conceitos · 05 jun 2026','file':'2026-02-ocr.txt','subjects':['Algoritmos','Estruturas de dados','Grafos']},
    {'id':'2026-01','label':'Mestrado 2026/01','examUrl':'https://drive.google.com/file/d/1shVppMY4lUK2DVS3lbmF5VAIl-b8aXq2/view?usp=sharing','keyUrl':'https://drive.google.com/file/d/1xxU3OnzvpzOyYhT93twE6mI3CHujbqxy/view?usp=sharing','title':'Edital 098/2025','subtitle':'Prova de conceitos · 05 fev 2026','file':'2026-01.txt','subjects':['Estruturas de dados','Algoritmos','Grafos']},
    {'id':'2025-02','label':'Mestrado e Doutorado 2025/02','examUrl':'https://drive.google.com/file/d/1cZ8WHwtn2w5ss20QuuPsJD1AfpaVKYAa/view?usp=sharing','keyUrl':'https://drive.google.com/file/d/108eCXIqBQu-Pj8WRLtJf1qwW2KgLc3mU/view?usp=sharing','title':'Edital 048/2025','subtitle':'Prova de conceitos · 15 ago 2025','file':'2025-02.txt','subjects':['Estruturas de dados','Algoritmos','Grafos']},
    {'id':'2025-01','label':'Mestrado e Doutorado 2025/01','examUrl':'https://drive.google.com/file/d/1dgMdVquQk6bRWwjP9fcgbMBJM17lqfj9/view?usp=sharing','keyUrl':'https://drive.google.com/file/d/19Sx7b9HZzHn8irWWpFcB6j-gz96wTTT3/view?usp=sharing','title':'Edital 092/2024','subtitle':'Prova de conceitos · 30 jan 2025','file':'2025-01.txt','subjects':['Estruturas de dados','Algoritmos','Complexidade']},
    {'id':'2024-02','label':'Mestrado e Doutorado 2024/02','examUrl':'https://drive.google.com/file/d/15bdnFE6wyQmUFUEn7CpSmfGuB0cosl0a/view?usp=sharing','keyUrl':'https://drive.google.com/file/d/14h4rFRXHrmzQEDIvjXIlSKHz74VNuNwn/view?usp=sharing','title':'Edital 031/2024','subtitle':'Prova de conceitos · 17 jun 2024','file':'2024-02.txt','subjects':['Algoritmos','Estruturas de dados','Complexidade']},
    {'id':'2024-01','label':'Mestrado e Doutorado 2024/01','examUrl':'https://ppgi.ufam.edu.br/images/editais/2024_01/Prova_Processo_Seletivo2024_01.pdf','keyUrl':'https://ppgi.ufam.edu.br/images/editais/2024_01/5_GABARITO_DEFINITIVO.pdf','title':'Edital 071/2023','subtitle':'Prova de conceitos · 26 jan 2024','file':'2024-01.txt','subjects':['Algoritmos','Estruturas de dados','Complexidade']},
    {'id':'2020-01','label':'Mestrado e Doutorado 2020/01','examUrl':'https://ppgi.ufam.edu.br/images/editais/Caderno_Questoes_Edital_060_2019.pdf','keyUrl':'https://ppgi.ufam.edu.br/images/editais/Gabarito_Edital_060_2019.pdf','title':'Edital 060/2019','subtitle':'Prova de conhecimento · 30 jan 2020','file':'2020-01-raw.txt','subjects':['Estruturas de dados','Algoritmos','Complexidade']},
]


def clean(s: str) -> str:
    s = s.replace('\u200b', '').replace('\ufeff', '').replace('\u00ad', '')
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'\b(Página|Pagina)\s+\d+\s+de\s+\d+\.?', '', s, flags=re.I)
    s = s.replace('QUESTÃO ', 'Questão ')
    return s.strip()


def question_blocks(text: str):
    # Accept both OCR "Questão 1." and native PDFs "1.​ Ao"/"QUESTÃO 01."
    pat = re.compile(r'(?im)^\s*(?:quest[aã]o\s*)?(\d{1,2})\s*[\.-]\s*')
    matches = list(pat.finditer(text))
    candidates = []
    seen = set()
    for m in matches:
        q = int(m.group(1))
        if q < 1 or q > 20 or q in seen:
            continue
        candidates.append((q, m))
        seen.add(q)
    blocks = []
    for idx, (q, m) in enumerate(candidates):
        end = candidates[idx + 1][1].start() if idx + 1 < len(candidates) else len(text)
        raw = text[m.end():end]
        blocks.append((q, raw))
    return blocks


def split_options(raw: str):
    # Capture A) through E) even when there is line-wrap or zero-width punctuation.
    normalized = raw.replace('\u200b', '').replace('​', '')
    starts = list(re.finditer(r'(?im)(?:^|\n)\s*([A-Ea-e])\s*[\)\.]\s*', normalized))
    if not starts:
        return clean(raw), []
    prompt = clean(normalized[:starts[0].start()])
    options = []
    for i, m in enumerate(starts):
        end = starts[i+1].start() if i + 1 < len(starts) else len(normalized)
        value = clean(normalized[m.end():end])
        if value:
            options.append({'id':m.group(1).upper(), 'text':value})
    return prompt, options


def subject_for(q: int, edition: dict) -> str:
    labels = ['Algoritmos','Estruturas de dados','Complexidade','Estruturas de dados','Algoritmos']
    return labels[(q - 1) % len(labels)] if edition['id'] in {'2026-02','2026-01'} else edition['subjects'][(q - 1) % len(edition['subjects'])]


def make_thumb(edition_id: str):
    source = SRC / f'{edition_id}.pdf'
    out = ASSETS / f'{edition_id}.jpg'
    if source.exists() and not out.exists():
        subprocess.run(['pdftoppm','-f','1','-l','1','-jpeg','-r','100','-singlefile',str(source),str(out.with_suffix(''))], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return f'/evidence/{edition_id}.jpg' if out.exists() else ''

all_editions = []
for edition in EDITIONS:
    text = (SRC / edition['file']).read_text(errors='ignore')
    blocks = {q: raw for q, raw in question_blocks(text)}
    questions = []
    for q in range(1, 21):
        raw = blocks.get(q, '')
        if raw:
            prompt, options = split_options(raw)
        else:
            prompt, options = f'Questão {q} da prova oficial. Consulte o documento original para o enunciado completo.', []
        structured = STRUCTURED.get((edition['id'], q), {})
        prompt = structured.get('prompt', prompt)
        options = structured.get('options', options)
        if len(prompt) > 3600:
            prompt = prompt[:3600].rstrip() + '…'
        needs_review = len(options) < 3
        if needs_review:
            # Never fabricate answer choices when OCR loses a diagram or option block.
            options = []
        questions.append({'number':q,'subject':subject_for(q, edition),'prompt':prompt,'intro':structured.get('intro'), 'code':structured.get('code'), 'ask':structured.get('ask'), 'sourcePageImage':structured.get('sourcePageImage'), 'sourcePageLabel':structured.get('sourcePageLabel'), 'options':options,'correct':KEYS[edition['id']][q],'annulled':KEYS[edition['id']][q] is None,'needsReview':needs_review})
    all_editions.append({**{k: edition[k] for k in ['id','label','examUrl','keyUrl','title','subtitle','subjects']},'thumbnail':make_thumb(edition['id']),'questions':questions})

out = ROOT / 'client/src/data/questions.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({'editions': all_editions}, ensure_ascii=False, indent=2))
print('wrote', out)
for e in all_editions:
    print(e['id'], sum(not q['annulled'] and not q['needsReview'] for q in e['questions']), 'interactive,', sum(q['needsReview'] for q in e['questions']), 'needs review')
