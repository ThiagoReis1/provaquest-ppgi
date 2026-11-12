"""Extrai a figura de cada questão direto do PDF oficial da prova.

Por que este script existe
--------------------------
O `prepare_data.py` só lê o texto do OCR (.txt). Figura, árvore, grafo, tabela e
diagrama não existem no texto: o OCR os descarta. Resultado: toda questão que diz
"considere a árvore a seguir" ficava sem a árvore.

Aqui a figura é recortada da página real do PDF, o que cobre os três formatos que
aparecem nos editais do PPGI/UFAM:

  * imagens embutidas (JPEG/PNG) — 2026/01, 2025/01, 2025/02, 2020/01;
  * desenhos vetoriais (Word/Google Docs) — 2024/01, 2024/02, 2025/01;
  * página escaneada sem camada de texto — 2026/02 (precisa de OCR para achar
    onde cada questão começa).

Método: renderiza a página, apaga a tinta que pertence a linhas de texto (caixas
do `page.get_text()` ou do OCR), agrupa o que sobrou e recorta. O recorte sai da
página original (sem a máscara), então os rótulos dentro do desenho — números dos
nós, pesos das arestas — aparecem normalmente.

Falsos positivos tratados aqui:
  * bloco de código em caixa sombreada (só a borda sobra depois da máscara);
  * régua horizontal do cabeçalho;
  * fragmentos de fórmula matemática vetorial (lista EXCLUDE, conferida à mão).

Uso (a partir da raiz do projeto, com os PDFs em .sources/):

    python3 scripts/extract_figures.py            # todas as provas
    python3 scripts/extract_figures.py 2026-01    # uma prova
    python3 scripts/extract_figures.py --report   # só relatório, não grava nada

Saída: client/public/figures/<edicao>-<questao>-<n>.webp e o campo `figures` de
cada questão em client/src/data/questions.json (+ questions.ts).
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / ".sources"
FIGDIR = ROOT / "client/public/figures"
DATA = ROOT / "client/src/data/questions.json"
TS = ROOT / "client/src/data/questions.ts"

PDFS = {
    "2026-02": "2026-02.pdf",
    "2026-01": "2026-01.pdf",
    "2025-02": "2025-02.pdf",
    "2025-01": "2025-01.pdf",
    "2024-02": "2024-02.pdf",
    "2024-01": "2024-01.pdf",
    "2020-01": "2020-01.pdf",
}

# Questões em que a detecção automática pega texto/fórmula vetorial em vez de
# figura. Conferido página por página.
EXCLUDE = {
    "2025-01-19": "fórmula f(n) desenhada como vetor (é texto, não figura)",
    "2020-01-5": "bloco de código em caixa",
    "2020-01-7": "bloco de código em caixa",
    "2024-01-1": "bloco de código em caixa",
    "2024-01-6": "bloco de código em caixa",
    "2024-01-15": "bloco de código em caixa",
    "2024-01-17": "bloco de código em caixa",
    "2024-01-18": "bloco de código em caixa",
    "2024-01-20": "bloco de código em caixa",
}

HDR = re.compile(r"^(?:QUEST[ÃA]O\s*)?(\d{1,2})\s*[\.\-–\u200b]", re.I)
DPI = 200
SCALE = DPI / 72.0
HEADER_ZONE = 118      # pt — faixa do cabeçalho institucional (logo, sigla, régua)
FOOTER_ZONE = 60       # pt — faixa do rodapé / número de página
PAD_PT = 8             # respiro em volta do recorte
MIN_W, MIN_H = 36, 30  # pt — menor tamanho aceitável para uma figura
MAX_W = 1500           # px — largura máxima do webp


def grow(rect: pymupdf.Rect, d: float) -> pymupdf.Rect:
    """Infla o retângulo em d pontos por lado (Rect + tuple faria união, não inflate)."""
    return pymupdf.Rect(rect.x0 - d, rect.y0 - d, rect.x1 + d, rect.y1 + d)


# --------------------------------------------------------------------- texto
def text_lines(page) -> list[pymupdf.Rect]:
    out = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            out.append(pymupdf.Rect(line["bbox"]))
    return out


def ocr_page(page) -> tuple[list[pymupdf.Rect], list[tuple[float, int]]]:
    """OCR da página escaneada: caixas das palavras e posição de cada 'Questão N'."""
    pix = page.get_pixmap(dpi=300)
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "p.png"
        pix.save(png)
        out = subprocess.run(
            ["tesseract", str(png), "stdout", "-l", "por", "--psm", "6", "tsv"],
            capture_output=True, text=True, check=True,
        ).stdout
    words = []
    for row in out.splitlines()[1:]:
        cols = row.split("\t")
        if len(cols) < 12 or not cols[11].strip():
            continue
        try:
            left, top, width, height = int(cols[6]), int(cols[7]), int(cols[8]), int(cols[9])
        except ValueError:
            continue
        rect = pymupdf.Rect(left / 300 * 72, top / 300 * 72,
                            (left + width) / 300 * 72, (top + height) / 300 * 72)
        words.append((rect, cols[11].strip(), top))
    rows: dict[int, list] = {}
    for rect, text, top in words:
        rows.setdefault(int(round(top / 25)), []).append((rect.x0, text, top))
    headers = []
    for line in rows.values():
        line.sort()
        joined = " ".join(w[1] for w in line).strip()
        m = HDR.match(joined)
        if m and 1 <= int(m.group(1)) <= 20:
            headers.append((min(w[2] for w in line) / 300 * 72, int(m.group(1))))
    return [w[0] for w in words], headers


def group_lines(words: list[pymupdf.Rect]) -> list[pymupdf.Rect]:
    """Agrupa palavras do OCR em linhas (para o ajuste de bordas funcionar igual ao PDF nativo)."""
    rows: list[list[pymupdf.Rect]] = []
    for w in sorted(words, key=lambda r: (round(r.y0 / 3), r.x0)):
        if rows and abs(rows[-1][-1].y0 - w.y0) < 3:
            rows[-1].append(w)
        else:
            rows.append([w])
    out = []
    for row in rows:
        box = row[0]
        for w in row[1:]:
            box = box | w
        out.append(box)
    return out


def question_markers(doc) -> list[tuple[int, float, int]]:
    markers = []
    for pno in range(len(doc)):
        page = doc[pno]
        if page.get_text("text").strip():
            raw = []
            for block in page.get_text("dict")["blocks"]:
                if block["type"] != 0:
                    continue
                for line in block["lines"]:
                    s = "".join(sp["text"] for sp in line["spans"]).strip().replace("\u200b", " ")
                    m = HDR.match(s)
                    if m and 1 <= int(m.group(1)) <= 20:
                        raw.append((line["bbox"][1], int(m.group(1))))
        else:
            raw = ocr_page(page)[1]
        markers.extend((pno, y, q) for y, q in raw)
    # mantém a sequência 1..20 para descartar "1." de lista e número de página
    clean, expected = [], 1
    for pno, y, q in markers:
        if q == expected:
            clean.append((pno, y, q))
            expected += 1
    return clean


def regions(doc, markers) -> dict[int, tuple[int, float, int, float]]:
    """q -> (página inicial, y inicial, página final, y final)."""
    out = {}
    for idx, (pno, y, q) in enumerate(markers):
        if idx + 1 < len(markers):
            p1, y1, _ = markers[idx + 1]
        else:
            p1, y1 = pno, doc[pno].rect.height
        out[q] = (pno, y - 6, p1, y1 - 2)
    return out


# --------------------------------------------------------------------- figuras
def ink_mask(page, lines, threshold: int, pad: float, dilate: int) -> np.ndarray:
    """Pixels de tinta que não pertencem a texto (cabeçalho/rodapé já removidos)."""
    pix = page.get_pixmap(dpi=DPI, colorspace=pymupdf.csGRAY)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    ink = img < threshold
    ink[: int(HEADER_ZONE * SCALE)] = False
    ink[int((page.rect.height - FOOTER_ZONE) * SCALE):] = False
    for r in lines:
        x0 = int(max(0, (r.x0 - pad) * SCALE)); x1 = int(min(pix.width, (r.x1 + pad) * SCALE))
        y0 = int(max(0, (r.y0 - pad) * SCALE)); y1 = int(min(pix.height, (r.y1 + pad) * SCALE))
        ink[y0:y1, x0:x1] = False
    return ndimage.binary_dilation(ink, iterations=dilate)


def merge_boxes(boxes: list[pymupdf.Rect], gap: float, pr: pymupdf.Rect,
                proximity: float = 0) -> list[pymupdf.Rect]:
    """Agrupa pedaços do mesmo desenho: células de tabela, rótulos, arestas soltas."""
    def same(a, b) -> bool:
        if proximity and not (grow(a, proximity) & b).is_empty:
            return True          # scan: traços finos e quebrados, basta a distância
        if not (grow(a, gap / 2) & b).is_empty:
            return True
        v_overlap = min(a.y1, b.y1) - max(a.y0, b.y0)
        h_overlap = min(a.x1, b.x1) - max(a.x0, b.x0)
        h_gap = max(a.x0, b.x0) - min(a.x1, b.x1)
        v_gap = max(a.y0, b.y0) - min(a.y1, b.y1)
        if v_overlap > 0.6 * min(a.height, b.height) and h_gap < gap:
            return True                      # mesma linha de tabela
        if h_overlap > 0.6 * min(a.width, b.width) and v_gap < gap:
            return True                      # mesma coluna de tabela
        return False

    boxes = list(boxes)
    merged = True
    while merged:
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                if same(boxes[i], boxes[j]):
                    boxes[i] = (boxes[i] | boxes[j]) & pr
                    boxes.pop(j)
                    merged = True
                    break
            if merged:
                break
    return boxes


def ink_boxes(page, lines, threshold=200, pad=2.0, gap=14, dilate=3,
              proximity=0) -> list[pymupdf.Rect]:
    """Regiões da página que têm tinta e não são texto."""
    pr = page.rect
    ink = ink_mask(page, lines, threshold, pad, dilate)
    labels, _ = ndimage.label(ink)
    raw = []
    for sl in ndimage.find_objects(labels):
        if sl is None:
            continue
        y0, y1 = sl[0].start / SCALE, sl[0].stop / SCALE
        x0, x1 = sl[1].start / SCALE, sl[1].stop / SCALE
        raw.append(pymupdf.Rect(x0 + 3 / SCALE, y0 + 3 / SCALE,
                                x1 - 3 / SCALE, y1 - 3 / SCALE))
    boxes = [r for r in raw if not r.is_empty and r.width >= 3 and r.height >= 3]
    boxes = merge_boxes(boxes, gap, pr, proximity)

    out = []
    for r in boxes:
        r = grow(r, 2) & pr
        if r.width > pr.width * 0.94 and r.height > pr.height * 0.94:
            continue                                   # moldura da página
        if r.height < 6 or r.width < 18:
            continue                                   # régua / sublinhado
        if r.width < MIN_W or r.height < MIN_H:
            continue                                   # fragmento
        # caixa só com borda = bloco de código / quadro de texto: não é figura
        inner = r & pymupdf.Rect(r.x0 + 5, r.y0 + 5, r.x1 - 5, r.y1 - 5)
        if inner.is_empty:
            continue
        sl = (slice(int(r.y0 * SCALE), int(r.y1 * SCALE)), slice(int(r.x0 * SCALE), int(r.x1 * SCALE)))
        sli = (slice(int(inner.y0 * SCALE), int(inner.y1 * SCALE)), slice(int(inner.x0 * SCALE), int(inner.x1 * SCALE)))
        total = int(ink[sl].sum())
        inside = int(ink[sli].sum())
        if total and inside / total < 0.12:
            continue
        out.append(r)
    out.sort(key=lambda r: (round(r.y0), r.x0))
    return out


def snap_to_ink(page, rect, lines, threshold: int, pad: float, dilate: int) -> pymupdf.Rect:
    """Cresce o recorte até pegar o desenho inteiro, sem invadir o texto.

    Tinta bruta da página, em componentes. Um componente entra se tiver pelo menos
    um pixel que a máscara de texto não apagou. Assim o círculo de um nó entra
    inteiro (só o número dentro dele foi mascarado), mas nenhuma palavra entra
    (palavra é 100% mascarada).
    """
    window = grow(rect, 24)
    pix = page.get_pixmap(dpi=DPI, clip=window, colorspace=pymupdf.csGRAY)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    raw = ndimage.binary_dilation(img < threshold, iterations=dilate)
    full_mask = ink_mask(page, lines, threshold, pad, dilate)
    x0, y0 = int(window.x0 * SCALE), int(window.y0 * SCALE)
    mask = full_mask[max(0, y0):max(0, y0) + raw.shape[0], max(0, x0):max(0, x0) + raw.shape[1]]
    labels, n = ndimage.label(raw)
    if not n:
        return rect
    free = np.bincount(labels[mask].ravel(), minlength=n + 1)      # pixels fora do texto
    total = np.bincount(labels.ravel(), minlength=n + 1)
    # componente entra se não for essencialmente texto (palavra é ~100% mascarada)
    valid = (free / np.maximum(total, 1)) > 0.25
    keep = np.isin(labels, np.flatnonzero(valid))
    ys, xs = np.where(keep)
    if not len(ys):
        return rect
    return pymupdf.Rect(window.x0 + xs.min() / SCALE, window.y0 + ys.min() / SCALE,
                        window.x0 + xs.max() / SCALE, window.y0 + ys.max() / SCALE)


def trim_partial_lines(rect, lines) -> pymupdf.Rect:
    """Evita que uma linha de texto cortada pela metade entre no recorte."""
    out = pymupdf.Rect(rect)
    for line in lines:
        inter = line & out
        if inter.is_empty or inter.get_area() >= 0.6 * line.get_area():
            continue
        if inter.y0 - out.y0 < out.height / 2:
            out.y0 = min(out.y1 - 10, inter.y1 + 1)
        else:
            out.y1 = max(out.y0 + 10, inter.y0 - 1)
    return out


_MASK_CACHE: dict = {}


def masked_ink(page, lines, opts) -> np.ndarray:
    key = (page.number, id(page), tuple(sorted(opts.items())))
    if key not in _MASK_CACHE:
        _MASK_CACHE.clear()
        _MASK_CACHE[key] = ink_mask(page, lines, opts.get("threshold", 200), opts.get("pad", 2.0), opts.get("dilate", 3))
    return _MASK_CACHE[key]


def band_has_drawing(page, band, lines, opts) -> bool:
    """True se a faixa contém tinta que não é texto (ou seja, o desenho começa ali)."""
    if band.height <= 0.5:
        return False
    mask = masked_ink(page, lines, opts)
    y0 = max(0, int(band.y0 * SCALE))
    y1 = max(0, int(band.y1 * SCALE))
    x0 = max(0, int(band.x0 * SCALE))
    x1 = max(0, int(band.x1 * SCALE))
    return bool(mask[y0:y1, x0:x1].any())


def adjust_edges(page, rect, lines, opts, max_shift: float = 8) -> pymupdf.Rect:
    """Ajusta as bordas para não cortar uma linha de texto pela metade.

    Só recua quando a faixa a remover não tem desenho — figura nunca é cortada.
    """
    out = pymupdf.Rect(rect)
    for line in lines:
        if line.width < 12:
            continue                       # sobra de texto, não é linha de verdade
        inter = line & out
        if inter.is_empty:
            continue
        ratio = inter.get_area() / max(line.get_area(), 1)
        if ratio >= 0.6:
            continue                       # linha inteira dentro: é rótulo da figura
        if inter.y0 - out.y0 < out.height / 2:
            shift = inter.y1 + 2 - out.y0
            band = pymupdf.Rect(out.x0, out.y0, out.x1, out.y0 + max(shift, 0))
            if shift < max_shift and not band_has_drawing(page, band, lines, opts):
                out.y0 = inter.y1 + 2
        else:
            shift = out.y1 - (inter.y0 - 2)
            band = pymupdf.Rect(out.x0, out.y1 - max(shift, 0), out.x1, out.y1)
            if shift < max_shift and not band_has_drawing(page, band, lines, opts):
                out.y1 = inter.y0 - 2
    # linha que termina logo acima do recorte: desce 3 pt para não pegar os pés das letras
    for line in lines:
        if 0 <= out.y0 - line.y1 <= 6 and line.width > 12:
            band = pymupdf.Rect(out.x0, out.y0, out.x1, line.y1 + 3)
            if not band_has_drawing(page, band, lines, opts):
                out.y0 = line.y1 + 3
    return out


def include_headers(rect, page, lines) -> pymupdf.Rect:
    """Inclui um cabeçalho de tabela logo acima da figura (linha de índices 0 1 2…).

    Só entra linha curta (menos da metade da largura da figura) ou linha feita só
    de dígitos/símbolos — nunca um pedaço do enunciado.
    """
    out = pymupdf.Rect(rect)
    for line in lines:
        gap = out.y0 - line.y1
        if not (-1 <= gap <= 9):
            continue
        if not (line & out).is_empty:
            continue
        if line.x0 < out.x0 - 6 or line.x1 > out.x1 + 6:
            continue                       # fora da largura da figura
        if line.width < 12:
            continue                       # sobra de texto (resto de coluna, bullet)
        text = page.get_textbox(line).strip()
        digits_only = bool(text) and re.fullmatch(r"[\d\s\.\,\-–()\[\]\|]+", text) is not None
        short = line.width < 0.6 * out.width
        if short or digits_only:
            out.y0 = line.y0 - 2
    return out


def crop(page, rect, dest: Path) -> tuple[int, int]:
    pix = page.get_pixmap(dpi=DPI, clip=rect)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    if img.width > MAX_W:
        img = img.resize((MAX_W, round(img.height * MAX_W / img.width)), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "WEBP", quality=84, method=6)
    return img.width, img.height


# --------------------------------------------------------------------- dados
def load_data() -> dict:
    return json.loads(DATA.read_text())


def save_data(data: dict) -> None:
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    TS.write_text(
        "// Generated from the official PPGI/UFAM exam PDFs.\n"
        "export const studyData = " + json.dumps(data, ensure_ascii=False, indent=2) + " as const;\n"
    )


def merge_stacked(boxes: list[tuple[int, pymupdf.Rect]]) -> list[tuple[int, pymupdf.Rect]]:
    """Junta as figuras de uma mesma questão (alternativas A, B, C, D desenhadas)."""
    out = list(boxes)
    merged = True
    while merged:
        merged = False
        for i in range(len(out)):
            for j in range(i + 1, len(out)):
                (p1, a), (p2, b) = out[i], out[j]
                if p1 != p2:
                    continue
                h_overlap = min(a.x1, b.x1) - max(a.x0, b.x0)
                v_overlap = min(a.y1, b.y1) - max(a.y0, b.y0)
                h_gap = max(a.x0, b.x0) - min(a.x1, b.x1)
                v_gap = max(a.y0, b.y0) - min(a.y1, b.y1)
                stacked = h_overlap > 0.4 * min(a.width, b.width) and v_gap < 130
                side_by_side = v_overlap > 0.4 * min(a.height, b.height) and h_gap < 80
                if stacked or side_by_side:
                    out[i] = (p1, a | b)
                    out.pop(j)
                    merged = True
                    break
            if merged:
                break
    return out


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    report_only = "--report" in sys.argv
    targets = args or list(PDFS)
    data = load_data()
    by_id = {e["id"]: e for e in data["editions"]}
    total = 0
    for eid in targets:
        pdf = SOURCES / PDFS[eid]
        if not pdf.exists():
            print(f"!! {eid}: PDF ausente em {pdf}")
            continue
        doc = pymupdf.open(pdf)
        markers = question_markers(doc)
        reg = regions(doc, markers)
        scanned = not any(doc[p].get_text("text").strip() for p in range(len(doc)))
        # scan tem antialiasing: limiar mais frouxo, máscara mais generosa
        opts = dict(threshold=235, pad=3.0, gap=24, dilate=5, proximity=100) if scanned else dict()
        found: dict[int, list[tuple[int, pymupdf.Rect]]] = {}
        for pno in range(len(doc)):
            page = doc[pno]
            words = ocr_page(page)[0] if scanned else []
            lines = words if scanned else text_lines(page)
            for r in ink_boxes(page, lines, **opts):
                for q, (p0, y0, p1, y1) in reg.items():
                    if pno < p0 or pno > p1:
                        continue
                    top = y0 if pno == p0 else HEADER_ZONE
                    bottom = y1 if pno == p1 else page.rect.height - FOOTER_ZONE
                    inter = r & pymupdf.Rect(0, top, page.rect.width, bottom)
                    if inter.is_empty or inter.height < 12 or inter.width < 30:
                        continue
                    if inter.get_area() < 0.6 * r.get_area():
                        continue          # sobra de outra questão
                    found.setdefault(q, []).append((pno, inter))
                    break
        edition = by_id[eid]
        count = 0
        for question in edition["questions"]:
            q = question["number"]
            items = [] if f"{eid}-{q}" in EXCLUDE else merge_stacked(found.get(q, []))
            figures = []
            for n, (pno, rect) in enumerate(items, start=1):
                page = doc[pno]
                lines = group_lines(ocr_page(page)[0]) if scanned else text_lines(page)
                rect = snap_to_ink(page, rect, lines, opts.get("threshold", 200), opts.get("pad", 2.0), opts.get("dilate", 3))
                if not scanned:
                    rect = include_headers(rect, page, lines)
                rect = grow(rect, 20 if scanned else 4) & page.rect
                rect = adjust_edges(page, rect, lines, opts, max_shift=14)
                # No PDF 2024/02 q5, o marcador de texto imediatamente acima da
                # árvore encosta no recorte após a rasterização; ele não pertence à figura.
                if eid == "2024-02" and q == 5:
                    rect.y0 = min(rect.y1 - 1, rect.y0 + 3)
                dest = FIGDIR / f"{eid}-{q}-{n}.webp"
                w, h = (0, 0) if report_only else crop(page, rect, dest)
                figures.append({
                    "src": f"/figures/{eid}-{q}-{n}.webp",
                    "page": pno + 1,
                    "width": w,
                    "height": h,
                    "alt": f"Figura da questão {q} — {edition['label']}, página {pno + 1}",
                    "caption": f"Figura original · página {pno + 1}",
                })
            if not report_only:
                if figures:
                    question["figures"] = figures
                else:
                    question.pop("figures", None)
            count += len(figures)
            if figures:
                print(f"  {eid} q{q}: {len(figures)} — " +
                      ", ".join(f"p{f['page']} {f['width']}x{f['height']}" for f in figures))
        total += count
        print(f"{eid}: {count} figuras em {len(found)} questões (marcadores {len(markers)}{', scan' if scanned else ''})")
    if not report_only:
        save_data(data)
        print(f"OK: {total} figuras gravadas em {FIGDIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
