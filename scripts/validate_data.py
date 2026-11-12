from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "client" / "src" / "data" / "questions.json"
TS_PATH = ROOT / "client" / "src" / "data" / "questions.ts"
FIGURES_DIR = ROOT / "client" / "public" / "figures"


def load_data() -> dict:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def referenced_figures(data: dict) -> set[str]:
    names: set[str] = set()
    for edition in data["editions"]:
        for question in edition["questions"]:
            for figure in question.get("figures") or []:
                names.add(Path(figure["src"]).name)
    return names


def validate() -> dict:
    data = load_data()
    editions = data["editions"]
    assert len(editions) == 7, len(editions)
    assert all(len(edition["questions"]) == 20 for edition in editions)

    ids: set[str] = set()
    review = annulled = valid = 0
    figure_names = referenced_figures(data)
    for edition in editions:
        assert edition.get("id") and edition.get("examUrl") and edition.get("keyUrl")
        for question in edition["questions"]:
            question_key = f"{edition['id']}-{question['number']}"
            assert question_key not in ids, f"ID duplicado: {question_key}"
            ids.add(question_key)
            assert "needsReview" in question
            assert "annulled" in question
            assert question.get("topic") and question.get("subtopic")
            assert question.get("searchTerms")
            assert not any("ver enunciado original" in option["text"].lower() for option in question["options"])
            option_ids = {option["id"] for option in question["options"]}
            if question["annulled"]:
                annulled += 1
                assert question["correct"] is None, question_key
            elif question["needsReview"]:
                review += 1
                assert question["correct"] is None or question["correct"] in option_ids, question_key
            else:
                valid += 1
                assert question["correct"] in option_ids, question_key
                assert len(option_ids) >= 3, question_key
                solution = question.get("solution") or {}
                assert len(solution.get("steps", [])) >= 2, question_key
                assert solution.get("conclusion"), question_key
                assert solution.get("distractors"), question_key
            for figure in question.get("figures") or []:
                assert figure.get("src") and figure.get("alt"), question_key
                filename = Path(figure["src"]).name
                assert (FIGURES_DIR / filename).is_file(), f"Figura ausente: {filename}"
                assert figure.get("width", 0) > 0 and figure.get("height", 0) > 0, question_key

    actual_figures = {path.name for path in FIGURES_DIR.glob("*.webp")}
    assert actual_figures == figure_names, f"Figuras órfãs ou ausentes: arquivos={actual_figures ^ figure_names}"
    ts_text = TS_PATH.read_text(encoding="utf-8")
    generated = (
        "// Generated from the official PPGI/UFAM exam PDFs.\n"
        "// Do not edit manually; update questions.json and run scripts/json_to_ts.py.\n"
        "export const studyData = "
        + json.dumps(data, ensure_ascii=False, indent=2)
        + " as const;\n"
    )
    formatted = subprocess.run(
        [
            "pnpm",
            "exec",
            "prettier",
            "--parser",
            "typescript",
            "--stdin-filepath",
            str(TS_PATH.relative_to(ROOT)),
        ],
        input=generated,
        text=True,
        capture_output=True,
        cwd=ROOT,
        check=True,
    ).stdout
    assert ts_text == formatted, "questions.ts diverge de questions.json; execute scripts/json_to_ts.py"
    return {"editions": len(editions), "questions": len(ids), "annulled": annulled, "review": review, "valid": valid, "figures": len(figure_names)}


if __name__ == "__main__":
    result = validate()
    print("OK: " + ", ".join(f"{key}={value}" for key, value in result.items()))
