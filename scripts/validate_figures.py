from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "client" / "src" / "data" / "questions.json"
FIGURES_DIR = ROOT / "client" / "public" / "figures"


def validate() -> dict:
    try:
        from PIL import Image
    except ImportError as exc:
        raise SystemExit("Dependência ausente: instale requirements.txt antes de validar figuras") from exc

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    refs: dict[str, tuple[int, int, str]] = {}
    for edition in data["editions"]:
        for question in edition["questions"]:
            for figure in question.get("figures") or []:
                filename = Path(figure["src"]).name
                assert filename not in refs, f"Figura referenciada mais de uma vez: {filename}"
                refs[filename] = (figure["width"], figure["height"], f"{edition['id']}-Q{question['number']}")

    files = {path.name for path in FIGURES_DIR.glob("*.webp")}
    assert files == set(refs), f"Diferença entre metadados e arquivos: {files ^ set(refs)}"
    for filename, (width, height, owner) in refs.items():
        path = FIGURES_DIR / filename
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            assert image.width == width and image.height == height, f"Dimensão divergente em {filename}: {owner}"
            assert image.width > 0 and image.height > 0
    return {"referenced": len(refs), "files": len(files)}


if __name__ == "__main__":
    result = validate()
    print("OK: " + ", ".join(f"{key}={value}" for key, value in result.items()))
