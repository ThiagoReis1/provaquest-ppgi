from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Gera questions.ts a partir do JSON canônico.")
    parser.add_argument("--input", type=Path, default=ROOT / "client/src/data/questions.json")
    parser.add_argument("--output", type=Path, default=ROOT / "client/src/data/questions.ts")
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "// Generated from the official PPGI/UFAM exam PDFs.\n"
        "// Do not edit manually; update questions.json and run scripts/json_to_ts.py.\n"
        "export const studyData = "
        + json.dumps(data, ensure_ascii=False, indent=2)
        + " as const;\n",
        encoding="utf-8",
    )
    print(args.output)


if __name__ == "__main__":
    main()
