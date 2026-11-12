import json
from pathlib import Path

root=Path('/home/ubuntu/provaquest')
data=json.loads((root/'client/src/data/questions.json').read_text())
solutions=json.loads((root/'client/src/data/solutions.json').read_text())['solutions']
for edition in data['editions']:
    for question in edition['questions']:
        key=f"{edition['id']}-{question['number']}"
        if key in solutions:
            question['solution']=solutions[key]
            question['solution'].setdefault('method', 'Conte as iterações do algoritmo e relacione-as ao tamanho de n.')
        elif question['annulled']:
            question['solution']={
                'method':'Questão anulada',
                'steps':['Este item foi anulado no gabarito final do edital.', 'Por isso, ele não recebe uma resposta correta única e não entra na pontuação.'],
                'conclusion':'Questão anulada — não pontua.',
                'distractors':'As alternativas não são comparadas para fins de nota em uma questão anulada.'
            }
        else:
            question['solution']={
                'method':'Conferência visual da prova original',
                'steps':['A extração automática não recuperou com segurança todas as alternativas ou o diagrama desta questão.', 'Abra a prova original na área de Fontes oficiais para conferir o enunciado completo.'],
                'conclusion':'Item em revisão — ainda não é respondível.',
                'distractors':'O item permanece fora dos simulados até a conferência visual.'
            }
        if key == '2026-02-1':
            question['solution']={
                'method':'Contagem de iterações + soma geométrica',
                'steps':[
                    'Primeiro, conte o laço externo. Como i começa em 1 e dobra (i = i × 2), seus valores são 1, 2, 4, 8, … até ultrapassar n. Portanto, ele executa ⌊log₂ n⌋ + 1 vezes, isto é, Θ(log n) vezes.',
                    'Agora analise o laço interno em uma volta qualquer. Ele começa em j = 0 e incrementa j de 1 em 1 enquanto j < i e j < n. Como o laço externo só chega a i ≤ n, nessa volta o teste efetivo é j < i: são exatamente i acessos ao vetor.',
                    'Liste o trabalho de cada volta externa: quando i = 1, o custo é 1; quando i = 2, é 2; depois 4, 8, …; na última volta o custo é aproximadamente n. Assim, o total não é Θ(n) repetido Θ(log n) vezes: é a soma 1 + 2 + 4 + 8 + … + n.',
                    'Essa é uma soma geométrica. Se L = ⌊log₂ n⌋, então 1 + 2 + … + 2ᴸ = 2ᴸ⁺¹ − 1. Como 2ᴸ ≤ n < 2ᴸ⁺¹, essa expressão fica limitada por constantes vezes n; logo, o tempo é Θ(n).',
                    'Para o espaço, conte apenas a memória extra: s, i e j são três variáveis escalares. O vetor A já é entrada e não foi criado pelo algoritmo; portanto, o espaço auxiliar é Θ(1).',
                ],
                'conclusion':'Resposta B — tempo Θ(n) e espaço auxiliar Θ(1).',
                'distractors':'A trata cada nível como se percorresse n posições; C confunde log n níveis com custo total logarítmico; D ignora a soma dos acessos e atribui espaço auxiliar proporcional a n.',
                'methodNote':'O Teorema Mestre não se aplica: ele é usado para recorrências de algoritmos recursivos, como T(n) = aT(n/b) + f(n). Aqui não há chamada recursiva; a ferramenta correta é contar as iterações dos laços e somar os custos por nível.',
            }
(root/'client/src/data/questions.json').write_text(json.dumps(data, ensure_ascii=False, indent=2))
print('merged', sum('solution' in q for e in data['editions'] for q in e['questions']), 'solutions across', sum(len(e['questions']) for e in data['editions']), 'questions')
