from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "client/src/data/questions.json"


def norm(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()


def text_of(question: dict) -> str:
    blocks = question.get("blocks", [])
    # O campo subject de alguns editais antigos contém rótulos incorretos.
    # A taxonomia deve ser inferida do enunciado, blocos e alternativas.
    parts = [question.get("prompt", "")]
    for block in blocks:
        if block.get("type") == "list":
            parts.extend(f"{item.get('label', '')} {item.get('text', '')}" for item in block.get("items", []))
        else:
            parts.append(block.get("text", ""))
    return norm(" ".join(parts))


def classify(question: dict) -> tuple[str, str, list[str]]:
    t = text_of(question)
    def has(*terms: str) -> bool:
        return any(term in t for term in terms)

    if has("dijkstra", "caminho minimo", "menor caminho"):
        return "Grafos", "Dijkstra e caminho mínimo", ["dijkstra", "caminho mínimo", "menor caminho", "shortest path"]
    if has("grafo", "digrafo", "vertices", "arestas", "conectado"):
        if has("busca em profundidade", "dfs", "profundidade"):
            sub = "DFS e conectividade"
        elif has("busca em largura", "bfs", "largura"):
            sub = "BFS e conectividade"
        else:
            sub = "Representação e propriedades de grafos"
        return "Grafos", sub, ["grafo", "grafos", "vértices", "arestas"]
    if has("tabela hash", "tabela de espalhamento", "funcao hash", "funcao de dispersao", "espalhamento"):
        if has("enderecamento aberto", "sondagem", "linear probing"):
            sub = "Endereçamento aberto"
        elif has("encadeamento", "colis"):
            sub = "Colisões e encadeamento"
        else:
            sub = "Funções hash e colisões"
        return "Hash e espalhamento", sub, ["hash", "tabela hash", "tabela de espalhamento", "espalhamento"]
    if has("arvore avl", "arvores avl"):
        return "Árvores", "AVL e balanceamento", ["árvore", "avl", "balanceamento", "rotações"]
    if has("rubro-negra", "rubro negra", "vermelho e preto", "vermelho-preto"):
        return "Árvores", "Rubro-negra", ["árvore", "rubro-negra", "vermelho-preto", "balanceamento"]
    if re.search(r"\barvores? b(?:\+|\s+(?:e|de|ordem)|\s*$)", t):
        return "Árvores", "Árvores B e B+", ["árvore", "árvore B", "árvore B+"]
    if has("heap", "heapsort", "fila de prioridades"):
        return "Heaps", "Heap e fila de prioridades", ["heap", "heapsort", "fila de prioridades"]
    if has("arvore binaria de busca", "arvore de busca binaria", "bst"):
        return "Árvores", "BST e percursos", ["árvore", "bst", "árvore binária de busca", "percursos"]
    if has("arvore binaria", "arvore de busca", "arvore"):
        return "Árvores", "Árvores binárias e percursos", ["árvore", "árvore binária", "percursos"]
    if has("pilha", "stack", "desfazer"):
        return "Estruturas lineares", "Pilhas (LIFO)", ["pilha", "stack", "lifo", "desfazer"]
    if has("fila", "queue"):
        return "Estruturas lineares", "Filas (FIFO)", ["fila", "queue", "fifo"]
    if has("lista duplamente", "lista dupla", "lista simplesmente", "lista ligada", "lista encadeada"):
        return "Estruturas lineares", "Listas encadeadas", ["lista", "lista encadeada", "lista ligada", "ponteiro"]
    if has("ponteiro", "vetor e passado", "passado para uma sub", "campo prox"):
        return "Programação", "Ponteiros e memória", ["ponteiro", "vetor", "memória", "linguagem C"]
    if has("bitwise", "complemento bit", "inverte todos os bits"):
        return "Programação", "Operações bit a bit", ["bitwise", "bits", "complemento bit a bit"]
    if has("quick sort", "quicksort", "merge sort", "mergesort", "insertion sort", "selection sort", "heapsort", "radix", "counting sort", "algoritmo de ordenacao", "algoritmo de ordenação", "ordenar um vetor", "ordenacao"):
        return "Ordenação", "Algoritmos de ordenação", ["ordenação", "quicksort", "mergesort", "insertion sort", "vetor"]
    if has("busca binaria", "busca binária", "pesquisa binaria", "pesquisa binária"):
        return "Busca", "Busca binária", ["busca", "busca binária", "pesquisa"]
    if has("recurs", "recorrencia", "recorrência", "fibonacci"):
        return "Recursão", "Recursão e recorrências", ["recursão", "recorrência", "fibonacci"]
    if has("complexidade", "funcao de custo", "funcao custo", "notacao o(", "notacao omega", "notacao teta", "custo no pior", "tempo o(", "ordem de"):
        return "Complexidade", "Análise assintótica", ["complexidade", "big O", "notação assintótica", "custo"]
    if has("linguagem c", "programa em c", "pseudocodigo", "pseudocódigo", "python"):
        return "Programação", "Leitura de código", ["código", "pseudocódigo", "linguagem C", "Python"]
    return question.get("subject", "Outros"), "Fundamentos", [question.get("subject", "Outros")]


def main() -> None:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    counts: dict[str, int] = {}
    broad_subject = {
        "Árvores": "Estruturas de dados",
        "Heaps": "Estruturas de dados",
        "Hash e espalhamento": "Estruturas de dados",
        "Estruturas lineares": "Estruturas de dados",
        "Busca": "Algoritmos",
        "Ordenação": "Algoritmos",
        "Recursão": "Algoritmos",
        "Programação": "Algoritmos",
    }
    overrides = {
        ("2026-02", 4): (
            "Ordenação",
            "Estabilidade de ordenação",
            ["ordenação", "estabilidade", "algoritmo estável", "quicksort", "mergesort", "heapsort"],
        ),
        ("2026-02", 7): (
            "Ordenação",
            "Ordenação por seleção",
            ["ordenação", "selection sort", "ordenação por seleção", "seleção do menor elemento"],
        ),
    }
    for edition in data["editions"]:
        for question in edition["questions"]:
            override = overrides.get((edition["id"], question["number"]))
            topic, subtopic, terms = override or classify(question)
            question["subject"] = broad_subject.get(topic, topic)
            question["topic"] = topic
            question["subtopic"] = subtopic
            question["searchTerms"] = terms
            counts[topic] = counts.get(topic, 0) + 1
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Temas classificados:", ", ".join(f"{key}={value}" for key, value in sorted(counts.items())))


if __name__ == "__main__":
    main()
