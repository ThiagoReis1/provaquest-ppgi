import json
from pathlib import Path

data = json.loads(Path('/home/ubuntu/provaquest/client/src/data/questions.json').read_text())
editions = data['editions']
assert len(editions) == 7, len(editions)
assert all(len(edition['questions']) == 20 for edition in editions)
for edition in editions:
    for question in edition['questions']:
        assert 'needsReview' in question
        assert not any('ver enunciado original' in option['text'] for option in question['options'])
        if question['annulled']:
            assert question['correct'] is None
        elif not question['needsReview']:
            assert question['correct'] in {option['id'] for option in question['options']}
            assert len(question['options']) >= 3
            assert len(question['solution']['steps']) >= 2
            assert question['solution']['conclusion']
            assert question['solution']['distractors']
print(f"OK: {len(editions)} editais, 140 questões, {sum(q['annulled'] for e in editions for q in e['questions'])} anuladas e {sum(q['needsReview'] for e in editions for q in e['questions'])} em revisão.")
