"""Reformata os enunciados de client/src/data/questions.json.

Cada questão ganha o campo `blocks`, uma lista ordenada de blocos:

    {"type": "p",    "text": "..."}                    parágrafo
    {"type": "code", "text": "...\\n..."}               código / dados, com quebras e indentação
    {"type": "list", "style": "roman|bullet|number",   lista, um item por linha
     "items": [{"label": "I.", "text": "...", "code": false, "level": 0}]}

Alternativas que contêm código recebem `"code": true` e o texto passa a ter
quebras de linha e indentação.

O campo `prompt` é mantido (texto corrido) porque a busca e os resumos usam esse campo.
Também é removido o ruído de cabeçalho/rodapé das páginas do PDF (“Universidade Federal
do Amazonas…”, cartão de respostas, números de página) que o OCR deixou dentro dos textos.

Uso (a partir da raiz do projeto):

    python3 scripts/format_questions.py

O script reescreve questions.json e regenera questions.ts. Pode ser executado mais de uma vez.
"""
from __future__ import annotations

import json
import re
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "client/src/data"


# --------------------------------------------------------------------------- helpers
def dd(text: str) -> str:
    return textwrap.dedent(text).strip("\n")


def P(text: str) -> dict:
    return {"type": "p", "text": text}


def C(text: str) -> dict:
    return {"type": "code", "text": dd(text)}


ROMAN = ["I", "II", "III", "IV", "V"]


def R(*texts: str, paren: bool = False) -> dict:
    """Lista de itens I, II, III… (um por linha)."""
    sep = ")" if paren else "."
    return {
        "type": "list",
        "style": "roman",
        "items": [{"label": f"{ROMAN[i]}{sep}", "text": t} for i, t in enumerate(texts)],
    }


def RC(*codes: str) -> dict:
    """Lista I, II, III… cujos itens são trechos de código."""
    return {
        "type": "list",
        "style": "roman",
        "items": [{"label": f"{ROMAN[i]}.", "text": dd(c), "code": True} for i, c in enumerate(codes)],
    }


def B(*texts: str) -> dict:
    return {"type": "list", "style": "bullet", "items": [{"label": "•", "text": t} for t in texts]}


def N(*texts: str) -> dict:
    return {
        "type": "list",
        "style": "number",
        "items": [{"label": f"{i + 1}.", "text": t} for i, t in enumerate(texts)],
    }


def NL(*rows: tuple) -> dict:
    """Lista numerada com rótulos próprios e nível de indentação: (rótulo, texto, nível)."""
    return {
        "type": "list",
        "style": "number",
        "items": [{"label": l, "text": t, **({"level": lv} if lv else {})} for l, t, lv in rows],
    }


def opt(text: str) -> tuple[str, bool]:
    """Alternativa de código (multilinha)."""
    return dd(text), True


# --------------------------------------------------------------------------- blocos por questão
VEC_TABLE = """
posição:  0  1  2  3  4   5   6   7   8
valor:    2  4  6  8  10  12  14  16  18
"""

BUSCA_REC = """
def pesquisa_binaria_recursiva(A, esquerda, direita, item):
    if direita < esquerda:
        return -1
    meio = (esquerda + direita) // 2
    if A[meio] == item:
        return meio
    elif A[meio] > item:
        return pesquisa_binaria_recursiva(A, esquerda, meio - 1, item)
    else:
        return pesquisa_binaria_recursiva(A, meio + 1, direita, item)

A = [0, 100, 20, 30, 40, 50, 60, 70]
print("Pesquisa com sucesso:", pesquisa_binaria_recursiva(A, 0, len(A) - 1, %s))
"""

CHAMADA_FIB = """
def chamada(n):
    print("PPGI")
    if n <= 1:
        return n
    else:
        return (chamada(n-1) + chamada(n-2))
"""

BLOCKS: dict[str, list[dict]] = {
    # ------------------------------------------------------------------ 2026/02
    "2026-02-2": [
        P("Com relação à estrutura de heap implementada como uma árvore binária, quais afirmações são verdadeiras?"),
        R(
            "O maior valor em um heap máximo está no elemento raiz da árvore.",
            "O menor valor no heap máximo está no elemento raiz da árvore.",
            "O heap pode ser utilizado como base para o método de ordenação Heap Sort.",
            "O heap pode ser utilizado como uma fila de prioridades.",
        ),
    ],
    "2026-02-4": [
        P("Sejam x[i] e x[j] dois elementos de iguais chaves armazenados em um vetor. Um algoritmo de ordenação é dito estável se ao final da ordenação x[i] e x[j] mantêm suas posições relativas inalteradas. Considere as seguintes afirmações:"),
        R(
            "A implementação clássica do algoritmo Quick Sort não é estável;",
            "A implementação clássica do algoritmo Merge Sort é sempre estável, independentemente do critério de desempate adotado na fase de intercalação;",
            "A implementação clássica do algoritmo Heap Sort não é estável.",
        ),
        P("Considere que, por implementação clássica, a questão refere-se à versão usual dos algoritmos, na qual o algoritmo apenas realiza comparações de chaves, sem fazer uso de mecanismos auxiliares para garantir a estabilidade."),
        P("Quais afirmações são verdadeiras?"),
    ],
    "2026-02-5": [
        P("Seja um vetor semi-ordenado que contém 16 elementos indexados de 1 a 16 com a seguinte propriedade: cada elemento a[i] contém a chave i, mas a subsequência em que i é múltiplo de 3 contém uma permutação aleatória das chaves 3, 6, 9, 12 e 15. Por exemplo, o conteúdo do vetor pode ser o seguinte (as chaves em negrito são múltiplos de 3):"),
        C("1, 2, 6, 4, 5, 12, 7, 8, 9, 10, 11, 15, 13, 14, 3, 16"),
        P("Considere a situação em que algum vetor respeitando essa propriedade (não necessariamente o exemplo mostrado acima) foi usado como entrada para uma implementação clássica do algoritmo de ordenação Merge Sort — isto é, aquele que divide o vetor em duas metades de tamanhos iguais, ordena recursivamente cada metade de maneira crescente e depois as intercala. Identifique as afirmativas verdadeiras."),
        R(
            "As chaves 2 e 10 jamais serão comparadas entre si;",
            "Sempre que as chaves 2 e 6 forem comparadas entre si, as chaves 4 e 6 também serão comparadas entre si;",
            "As chaves 1 e 3 necessariamente serão comparadas entre si.",
        ),
    ],
    "2026-02-6": [
        P("Considere um vetor com n elementos no qual apenas um está fora de ordem (contém um único elemento a[i] < a[i − 1]) e não sei em que posição está esse elemento. Finalmente, considere como “busca binária” apenas o algoritmo clássico apresentado na bibliografia do presente edital de seleção, sem alterações."),
        R(
            "Posso descobrir onde está o elemento fora de ordem usando busca binária, que o identificaria em no máximo log₂(n) + 1 comparações entre chaves, mesmo para n > 20;",
            "Posso fazer uma busca binária por qualquer chave no vetor com garantia de corretude da busca caso o valor de n, que indica o número de elementos do vetor, seja menor ou igual a 20;",
            "Posso fazer uma busca sequencial no vetor, seja qual for o valor de n, e ela encontrará o elemento buscado, ou indicará se o elemento não existe, ao comparar a chave com, no máximo n, elementos do vetor.",
        ),
    ],
    "2026-02-7": [
        P("Considere o pseudocódigo a seguir, no qual uma linha do algoritmo foi substituída pela string ???"),
        C("""
            void f(int v[], int n) {
                int tmp1, tmp2, x, y;
                for (x = 0; x < n; x++) {
                    tmp1 = v[x];
                    tmp2 = x;
                    for (y = x + 1; y < n; y++) {
                        ???
                    }
                    tmp1 = v[tmp2];
                    v[tmp2] = v[x];
                    v[x] = tmp1;
                }
            }
        """),
        P("Considere ainda as opções:"),
        RC(
            """
            if (v[y] < v[tmp2]) {
                tmp2 = y;
            }
            """,
            """
            if (v[y] > v[tmp2]) {
                tmp2 = y;
            }
            """,
            """
            if (v[y] > v[tmp2]) {
                v[y] = v[y+1];
            }
            """,
        ),
        P("Assinale a alternativa correta."),
    ],
    "2026-02-8": [
        P("Considere uma árvore AVL inicialmente vazia na qual serão inseridos os valores 30, 20, 10, 40, 50 e 25, exatamente nessa ordem, com aplicação imediata das rotações necessárias após cada inserção que causar desbalanceamento."),
        R(
            "Após a inserção dos três primeiros valores (30, 20 e 10), o nó 20 torna-se raiz da árvore em decorrência de uma rotação simples aplicada no nó 30;",
            "Após a inserção dos cinco primeiros valores (30, 20, 10, 40 e 50), é necessária exatamente uma rotação simples no nó 30 para restaurar o balanceamento da árvore;",
            "Após a inserção do sexto valor (25), uma rotação simples no nó 20 é suficiente para restaurar o balanceamento da árvore.",
        ),
    ],
    "2026-02-9": [
        P("Considere o programa em C abaixo. Qual será o valor impresso?"),
        C(r"""
            #include <stdio.h>

            int main(void) {
                unsigned v1 = 16;
                unsigned *v2 = &v1;
                int cont = 0;
                while (*v2 > 0) {
                    v1 >>= 1;
                    cont++;
                }
                printf("%d\n", cont);
                return 0;
            }
        """),
    ],
    "2026-02-11": [
        P("Deseja-se ordenar um vetor A com n > 2 inteiros não negativos, todos menores que n³. Considere as seguintes afirmações sobre o uso de Radix Sort com Counting Sort como sub-rotina."),
        R(
            "Se for usada base n, cada número terá no máximo 3 dígitos, e cada chamada ao Counting Sort custará O(n). Portanto, o tempo total será O(n);",
            "Para que o Radix Sort funcione corretamente ordenando do dígito menos significativo para o mais significativo, o algoritmo usado para ordenar por cada dígito deve ser estável;",
            "Se for usado Counting Sort diretamente sobre os valores inteiros completos, sem decomposição em dígitos, o tempo será O(n), pois há apenas n elementos no vetor;",
            "Se for usada base 10, cada valor terá no máximo log(n) dígitos e, como cada chamada ao Counting Sort tem custo temporal O(n), o tempo total do Radix Sort será O(n log(n)).",
        ),
        P("Quais afirmações são verdadeiras?"),
    ],
    "2026-02-12": [
        P("Em uma tabela de espalhamento com tamanho m = 7, foram inseridas 6 chaves. A função de dispersão utilizada foi h(k) = k mod m. A ordem exata de inserção das chaves é desconhecida, mas a chave k₆ = 9 foi a última. O conteúdo final da tabela imediatamente após a inserção da chave k₆ = 9 foi o seguinte (o símbolo @ representa uma posição vazia):"),
        # A tabela é uma figura; o OCR só recuperou os trechos abaixo, mantidos como estavam.
        C("""
            índices: O, 4d, De 3, ay 5, 6
            elementos: [70, 9, 2y Ds 4, 705, 27]
        """),
        P("Sabendo que as colisões foram tratadas por endereçamento aberto e que nenhuma outra operação de inserção ou remoção foi realizada, selecione a alternativa que representa uma possível função de sondagem empregada na elaboração dessa tabela."),
    ],
    "2026-02-13": [
        P("Considere uma implementação do algoritmo Quick Sort para ordenar vetores em ordem crescente que emprega a estratégia de particionamento de Lomuto ou a estratégia de Hoare. Suponha que essa implementação foi utilizada para ordenar o vetor"),
        C("[2, 8, 3, 10, 5, 1, 7, 6, 4]"),
        P("Suponha ainda que, imediatamente após o primeiro particionamento e antes de qualquer chamada recursiva ser realizada, o conteúdo do vetor era"),
        C("[2, 3, 1, 4, 5, 8, 7, 6, 10]"),
        P("Com base nisso, analise as afirmativas e assinale a alternativa correta."),
        R(
            "Tanto a chave 4 quanto a chave 5 podem ter sido escolhidas como pivô para particionar esse vetor;",
            "Foi empregado o algoritmo de Hoare para particionar esse vetor;",
            "Foi empregado o algoritmo de Lomuto para particionar esse vetor.",
        ),
    ],
    "2026-02-14": [
        P("Considere a seguinte definição de tipo de dados para pilha com vetor na linguagem de programação C:"),
        C("""
            struct TipoPilha {
                int n;       /* número de elementos armazenados */
                int dim;     /* tamanho do vetor */
                float* vet;  /* vetor dos elementos */
            } pilha;
        """),
        P("Considere que:"),
        B(
            "struct TipoPilha é o nome do tipo de dados;",
            "pilha é uma variável global desse tipo de dados;",
            "pilha.vet é um vetor usado para armazenar os elementos da pilha;",
            "pilha.dim é a capacidade máxima da pilha (número de elementos do vetor);",
            "pilha.n é o número de elementos armazenados na pilha.",
        ),
        P("Supondo que desejamos uma implementação eficiente, em qual elemento deve ser encontrado o topo da pilha não vazia?"),
    ],
    "2026-02-15": [
        P("Qual será a saída da função a seguir se os parâmetros de entrada forem a=200 e b=-50?"),
        C("""
            def fun(a, b):
                if (a < 0 and b < 0) or (a > 0 and b > 0):
                    passo = 1
                else:
                    passo = -1
                res = 0
                for i in range(abs(a)):
                    for j in range(abs(b)):
                        res += passo
                return res
        """),
    ],
    "2026-02-16": [
        P("Considere a inserção de um elemento v em uma fila implementada com lista simplesmente encadeada em C:"),
        C("""
            struct No {
                float info;        // valor da chave
                struct No *prox;   // próximo nó da lista
            };

            struct Fila {
                struct No* ini;    // início da lista
                struct No* fim;    // fim da lista
            };

            void fila_insere(struct Fila* f, float v) {
                struct No* n = malloc(sizeof(struct No));
                if (n == NULL) return;
                n->info = v;
                n->prox = NULL;
                if (f->fim != NULL) {
                    f->fim->prox = n;
                } else {
                    f->ini = n;
                }
                f->fim = n;
            }
        """),
        P("O que acontece quando a fila está vazia antes da inserção?"),
    ],
    "2026-02-17": [
        P("Considere a árvore de busca binária a seguir. Observe que algumas chaves foram substituídas por incógnitas."),
        P("Considere que as chaves dessa árvore devem necessariamente ser valores inteiros e que a árvore não admite inserção de chaves repetidas. Considere que os valores de x, y, z, s e t são tais que é possível inserir a chave 10 nessa árvore. Qual será o percurso pré-ordem da árvore após a inserção da chave 10?"),
    ],
    "2026-02-19": [
        P("A figura a seguir representa um grafo ponderado e não direcionado com 4 vértices e 5 arestas. Qual das alternativas é um subgrafo encontrado pelo algoritmo de Prim durante o processamento do grafo acima?"),
    ],
    "2026-02-20": [
        P("Seja G = (V, E) um digrafo no qual V é um conjunto de vértices e E é um conjunto de arestas. Construímos um grafo Gᵀ a partir de G com os seguintes passos:"),
        N(
            "Gᵀ é inicialmente vazio;",
            "Cada vértice v ∈ V é inserido em Gᵀ;",
            "Para cada aresta (u, v) ∈ E, inserimos uma aresta (v, u) em Gᵀ.",
        ),
        P("Assinale a alternativa correta."),
    ],
    # ------------------------------------------------------------------ 2026/01
    "2026-01-1": [
        P("Considere a função seguinte, desenvolvida na linguagem C:"),
        C("""
            int f(int n) {
                int count = 0;
                for (int i = 0; i < 10; i++) {
                    for (int j = 1; j <= n; j++) {
                        for (int k = 0; k < n; k++) {
                            count++;
                        }
                    }
                }
                return count;
            }
        """),
        P("Qual será o valor retornado por f para qualquer n ≥ 0?"),
    ],
    "2026-01-2": [
        P("Considere uma tabela hash de tamanho m = 10, que utiliza encadeamento separado para tratar colisões. A função hash usada é:"),
        C("h(k) = k mod 10"),
        P("Suponha que as seguintes chaves inteiras sejam inseridas nesta ordem:"),
        C("22, 42, 31, 52, 62, 14, 72"),
        P("Após todas as inserções, qual será o tamanho da maior lista encadeada presente na tabela?"),
    ],
    "2026-01-3": [
        P("Considere o grafo ponderado e direcionado abaixo, com pesos não negativos:"),
        P("Aplicando o algoritmo de Dijkstra a partir do vértice A, utilizando uma fila de prioridades (min-heap) para selecionar o próximo vértice, qual será a ordem em que os vértices são removidos da fila de prioridades (do primeiro ao último)?"),
    ],
    "2026-01-4": [
        P("Considere a árvore binária de busca (BST) a seguir, em que cada nó armazena um número inteiro:"),
        P("Dois novos nós com chaves 37 e 67 são inseridos nesta ordem (primeiro 37, depois 67), seguindo as regras de inserção de uma BST. Após as duas inserções, qual é a sequência resultante do caminhamento em pós-ordem?"),
    ],
    "2026-01-5": [
        P("Considere as afirmações abaixo sobre a eficiência de operações em diferentes estruturas de dados:"),
        R(
            "Se uma lista encadeada estiver ordenada, o acesso aos elementos tem a mesma eficiência de uma árvore balanceada, pois pode-se usar busca binária para a pesquisa.",
            "Uma tabela hash com encadeamento separado requer mais memória do que uma tabela hash com sondagem linear ou quadrática de igual tamanho, mesmo quando os elementos armazenados nas duas são idênticos.",
            "Se a árvore de busca binária não for balanceada, a pesquisa pode ser tão ineficiente (em número de acessos) quanto a pesquisa linear em um vetor não ordenado.",
            "Uma árvore AVL pode ser tão eficiente (em número de acessos) quanto a pesquisa binária em um vetor ordenado e ainda tem a vantagem de permitir inserção e remoção eficientes.",
        ),
        P("Quais afirmações são verdadeiras?"),
    ],
    "2026-01-6": [
        P("Considere os seguintes cenários:"),
        R(
            "Desfazer/refazer operações em um editor de texto.",
            "Gerenciamento de requisições em uma impressora compartilhada.",
            "Inserção e remoção frequente de elementos em posições arbitrárias.",
        ),
        P("A alternativa que melhor representa a associação correta entre cenário e estrutura de dados é:"),
    ],
    "2026-01-7": [
        P("Qual será o resultado do primeiro particionamento obtido pelo algoritmo de ordenação Quick Sort ao ordenar de maneira crescente o vetor abaixo se a estratégia de particionamento adotada for o algoritmo de Hoare e o pivô for escolhido a partir do elemento central?"),
        C("42, 67, 23, 54, 42, 18, 16, 45, 58"),
    ],
    "2026-01-8": [
        P("Selecione a alternativa que preenche corretamente o espaços vazios do código abaixo para que a função buscaBin seja uma implementação correta do algoritmo de busca binária."),
        C("""
            int buscaBin(int vetor[], int tamanho, int chave) {
                int i = 0;
                int j = I;
                while (II) {
                    int meio = (i + j) / 2;
                    if (vetor[meio] == chave)
                        return meio;
                    if (vetor[meio] < chave)
                        III;
                    else
                        IV;
                }
                return -1;
            }
        """),
    ],
    "2026-01-10": [
        P("Sabendo que o operador ~, denominado operador de complemento bit-a-bit (bitwise NOT), “inverte” todos os bits de um número inteiro em C, o que o programa a seguir imprime?"),
        C(r"""
            #include <stdio.h>

            int main(void) {
                int d = 42;
                printf("%d\n", ~d + 1);
            }
        """),
    ],
    "2026-01-12": [
        P("O que a função em C a seguir faz?"),
        P("Considere que unsigned é o tipo de dados para armazenar números inteiros sem sinal."),
        C("""
            unsigned f(unsigned A, unsigned B) {
                if (A < B)
                    return 0;
                else
                    return 1 + f(A - B, B);
            }
        """),
    ],
    "2026-01-15": [
        P("Considere as afirmações abaixo sobre implementações eficientes para pilhas e filas."),
        R(
            "Se uma pilha for implementada com uma lista armazenada em vetor, o topo da pilha deve estar no fim da lista.",
            "Se uma lista simplesmente encadeada for usada, então o topo da pilha deve estar no início da lista.",
            "Ao implementar filas, se uma lista duplamente encadeada circular for usada, então o início/a frente da fila pode ser tanto o primeiro nó quanto o último nó da lista.",
            "Ao implementar filas, se uma lista simplesmente encadeada for usada, então o primeiro nó deve ser considerado o início/a frente da fila e o último nó deve ser considerado o fim.",
        ),
        P("Quais afirmações são verdadeiras?"),
    ],
    "2026-01-16": [
        P("Você está programando o motor de um aplicativo de streaming de música. A fila de reprodução atual é uma lista duplamente encadeada, na qual cada música é um nó que possui os ponteiros “próxima” e “anterior”. Considere a seguinte sequência de músicas na fila:"),
        P("O usuário decide remover a [Música B] da lista. Para que a lista continue funcionando corretamente (permitindo que o usuário mude da Música A diretamente para a C, e volte da C para a A) quais alterações de ponteiros são estritamente necessárias?"),
    ],
    "2026-01-17": [
        P("Um editor de imagens possui uma funcionalidade “balde” que preenche uma região de pixels com uma nova cor, como mostrado na figura abaixo. Todos os pixels que tinham cor branca sob o ponteiro do mouse foram coloridos de cinza. Essa funcionalidade é implementada com os seguintes passos:"),
        NL(
            ("1.", "Uma lista inicialmente vazia é criada", 0),
            ("2.", "As coordenadas do pixel inicial são inseridas na lista", 0),
            ("3.", "Enquanto a lista não estiver vazia…", 0),
            ("3a.", "O último elemento da lista é removido", 1),
            ("3b.", "O pixel nas coordenadas desse último elemento é colorido com a cor de preenchimento do “balde”", 1),
            ("3c.", "As coordenadas dos quatro pixels adjacentes ao pixel que foi colorido que tiverem cor igual à cor do pixel inicial são inseridas no fim da lista", 1),
        ),
        P("A forma como a lista é utilizada nesse algoritmo descreve uma estrutura de dados clássica. Que estrutura de dados é essa?"),
    ],
    "2026-01-18": [
        P("Considere a árvore de busca binária a seguir. Observe que algumas chaves foram substituídas por incógnitas."),
        P("Assinale a alternativa verdadeira. Considere que todas as chaves devem ser inteiras e que a árvore não admite chaves repetidas."),
    ],
    "2026-01-19": [
        P("Considere a árvore AVL balanceada a seguir."),
        P("Após remover a chave 9 e aplicar as rotações necessárias, qual será a chave localizada na raiz da árvore?"),
    ],
    "2026-01-20": [
        P("Analise o código a seguir e responda o que se pede:"),
        C("""
            int f(int n) {
                if (n == 0)
                    return 1;
                return n * f(n - 1);
            }
        """),
        P("Qual valor é retornado por f(4)?"),
    ],
    # ------------------------------------------------------------------ 2025/02
    "2025-02-1": [
        P("Um navegador mantém um histórico ativo de páginas visitadas usando uma pilha:"),
        B(
            'Visitar("Página") → adiciona a página informada no topo da pilha.',
            "Voltar() → remove a página que está no topo da pilha, voltando para a anterior.",
        ),
        P("Considere a seguinte sequência de comandos:"),
        C("""
            Visitar("UFAM")
            Visitar("PPGI")
            Visitar("Edital")
            Voltar()
            Visitar("Biblioteca")
            Voltar()
        """),
        P("Ao final dessa sequência, quantas páginas permanecem no histórico ativo do navegador?"),
    ],
    "2025-02-2": [
        P("Um consultório mantém a lista de espera de pacientes usando uma lista encadeada simples, qual:"),
        B(
            "Inserir no fim → adiciona um novo paciente após o último da fila.",
            "Remover no início → remove o paciente que está no início da fila (próximo a ser atendido).",
        ),
        P("Inicialmente, a lista está vazia. Então ocorre a seguinte sequência de eventos:"),
        N(
            "Chegam: Ana, João, Maria, Pedro (nesta ordem).",
            "Dois pacientes são atendidos.",
            "Chegam: Carla e Lucas (nesta ordem).",
        ),
        P("Qual é a ordem da lista neste momento? Considere que o primeiro nome é o que está no início da lista encadeada."),
    ],
    "2025-02-3": [
        P("Um call center processa pedidos em uma fila, na qual:"),
        B(
            "Novo(código) → insere o pedido no fim da fila.",
            "Atender() → remove o pedido que está no início da fila (o mais antigo).",
        ),
        P("A fila inicialmente contém:"),
        C("[101, 102, 103]"),
        P("Durante o expediente, as seguintes ações ocorrem:"),
        C("""
            Atender()
            Novo(104)
            Novo(105)
            Atender()
            Novo(106)
        """),
        P("Qual será o conteúdo final da fila? Considere que o primeiro elemento representa o início da fila"),
    ],
    "2025-02-4": [
        P("Um sistema de biblioteca armazena livros em uma árvore binária de busca não balanceada. A inserção dos livros ocorre sempre de acordo com o código numérico"),
        P("A sequência de inserção é:"),
        C("50, 30, 70, 20, 40, 60, 80"),
        P("Se a árvore for visitada em um percurso pré-ordem, qual será a sequência em que os códigos numéricos dos livros serão encontrados?"),
    ],
    "2025-02-5": [
        P("Um sistema armazena identificadores de acesso em uma tabela hash com tamanho 7 (índices de 0 a 6)."),
        B(
            "A função de hash utilizada é h(x) = x % 7 (resto da divisão por 7).",
            "O método de tratamento de colisões é a sondagem linear.",
            "A função da sondagem linear é h’(x, i) = (h(x) + i) % 7.",
            "Considere que a tabela começa vazia.",
        ),
        P("Insira, nessa ordem, os valores:"),
        C("10, 21, 4, 18, 25"),
        P("Quantas colisões ocorrem durante essas inserções?"),
    ],
    "2025-02-6": [
        P("Considere que desejamos ordenar em ordem crescente um vetor de preços usando Quicksort. Considere ainda que o conteúdo do vetor, após o primeiro particionamento e antes da primeira divisão, é o seguinte:"),
        C("12, 8, 7, 10, 14, 15, 18"),
        P("Conhecendo o funcionamento do algoritmo Quick Sort, qual das seguintes opções pode pode ter sido o valor do pivô?"),
    ],
    "2025-02-7": [
        P("Considere o vetor abaixo, que será ordenado em ordem crescente usando o algoritmo Merge Sort:"),
        C("[42, 17, 8, 99, 23, 4, 16, 50, 31]"),
        P("O Merge Sort será implementado sem otimizações (sempre divide o vetor exatamente ao meio e intercala as metades), seguindo estas regras:"),
        N(
            "Divide recursivamente até obter sublistas de tamanho 1.",
            "Durante a intercalação, se dois elementos são iguais, mantém primeiro o que veio da sublista da esquerda (estabilidade).",
            "Cada intercalação é feita totalmente, produzindo uma sublista ordenada, antes de passar à próxima.",
        ),
        P("A execução é acompanhada passo a passo. Queremos saber o estado exato do vetor imediatamente após concluir a intercalação da sublista que originalmente ocupava as posições 0 a 4 do vetor inicial."),
        P("Atenção:"),
        B(
            "Esse momento ocorre antes de começar a intercalação da parte direita (posições 5 a 8).",
            "As posições 0 a 4 estarão ordenadas entre si, mas o restante do vetor (posições 5 a 8) ainda estará na mesma ordem original.",
        ),
        P("Qual será o vetor nesse momento?"),
    ],
    "2025-02-8": [
        P("Você vai inserir, nesta ordem, as chaves abaixo em uma árvore rubro-negra inicialmente vazia, usando as regras padrão (novo nó nasce vermelho; raiz sempre preta; rotações e recolorações conforme os casos de violação do vermelho-vermelho; árvore é binária de busca):"),
        C("41, 38, 31, 12, 19, 8"),
        P("Após todas as inserções e correções, quais nós ficam vermelhos no estado final?"),
    ],
    "2025-02-9": [
        P("Uma tabela hash tem tamanho m = 11 (índices 0 a 10)."),
        B(
            "A função de hash primária é h(k) = k % 11.",
            "A resolução de colisões usa sondagem quadrática com: h’(k, i) = (h(k) + i²) % 11",
            "A tabela inicia vazia.",
        ),
        P("Insira, nessa ordem, as chaves:"),
        C("22, 1, 13, 11, 24, 33"),
        P("Em qual índice a chave 33 ficará armazenada ao final?"),
    ],
    "2025-02-10": [
        P("Uma árvore AVL armazena inteiros e faz rebalanceamentos automáticos após cada inserção. Regras usadas:"),
        B(
            "Inserção segue a ordem da árvore binária de busca.",
            "Se o fator de balanceamento (altura esquerda − altura direita) de algum nó ficar fora de {−1, 0, 1}, aplica-se a rotação necessária (incluindo casos LL, RR, LR, RL).",
        ),
        P("Considere as inserções, nesta ordem:"),
        C("30, 5, 10, 42, 15, 20"),
        P("Qual será a chave na raiz da árvore após todas as inserções e rebalanceamentos?"),
    ],
    "2025-02-11": [
        P("Um editor de imagens mantém um histórico de ações usando uma pilha para implementar a função Desfazer."),
        B(
            "Aplicar(filtro) → coloca o filtro no topo da pilha.",
            "Desfazer() → remove o filtro no topo da pilha, voltando para o estado anterior.",
        ),
        P("Um designer está editando uma foto e executa a seguinte sequência:"),
        C("""
            Aplicar("Brilho+10")
            Aplicar("Saturação+20")
            Aplicar("Desfoque")
            Desfazer()
            Aplicar("Contraste-15")
            Desfazer()
            Desfazer()
        """),
        P("Qual é o conteúdo final da pilha de filtros?"),
    ],
    "2025-02-12": [
        P("Um serviço de streaming mantém um catálogo de filmes ordenado alfabeticamente pelo título. Para encontrar rapidamente um filme, o sistema usa busca binária. O catálogo (ordenado) é:"),
        C('["Avatar", "Duna", "Gladiador", "Interestelar", "Matrix", "Oppenheimer", "Titanic"]'),
        P('O usuário procura pelo filme "Matrix". Na busca binária, qual é a sequência de títulos verificados até encontrar o filme?'),
    ],
    "2025-02-13": [
        P("Considere uma árvore binária de busca não balanceada inicialmente vazia. Insira as seguintes chaves, na ordem dada:"),
        C("50, 30, 70, 20, 40, 60, 80, 35, 45"),
        P("Em seguida, remova a chave 30. Qual das alternativas representa uma das possíveis ordens de caminhamento pré-ordem da árvore resultante?"),
    ],
    "2025-02-14": [
        P("Uma biblioteca digital armazena IDs de livros em uma tabela hash de tamanho m = 7 usando:"),
        B(
            "Função hash: h(k) = k % 7",
            "Sondagem linear: hᵢ(k) = (h(k) + i) mod 7",
            "Remoção: quando um livro é excluído, o índice recebe uma marca de tombstone (vaga especial que pode ser reutilizada, mas não interrompe buscas).",
        ),
        P("A tabela começa vazia e recebe as seguintes operações, nesta ordem:"),
        C("""
            Inserir 10
            Inserir 24
            Inserir 31
            Inserir 18
            Remover 24
            Inserir 38
            Buscar 24
        """),
        P("Sabendo que a operação Buscar 24 retorna \"não encontrado\", em qual índice o 38 está armazenado ao final?"),
    ],
    "2025-02-16": [
        P("Um sistema de aeroporto mantém os horários de decolagem (em minutos após 00:00) em um vetor ordenado. A busca por um voo específico usa busca binária iterativa com limites inclusivos esq e dir e cálculo do meio meio = (esq + dir) // 2."),
        P("Vetor de horários:"),
        C("[510, 540, 555, 600, 615, 660, 705, 720, 735, 780]"),
        P("O passageiro procura o voo que decola às 12:15 (ou seja, 735 minutos). Na execução da busca binária, qual é a sequência de valores comparados, o número de iterações até encontrar, e o índice retornado?"),
    ],
    "2025-02-17": [
        P("Considere a árvore de busca binária a seguir. Observe que algumas chaves foram substituídas por incógnitas."),
        P("Assinale a alternativa verdadeira. Considere que todas as chaves devem ser inteiras e que a árvore não admite chaves repetidas."),
    ],
    "2025-02-18": [
        P("Um sistema de controle de estoque ordena códigos de produtos usando um algoritmo que funciona assim:"),
        N(
            "Percorre o vetor da esquerda para a direita, mantendo a parte inicial sempre ordenada.",
            "Para ordenar o próximo elemento, desloca para a direita todos os elementos maiores até encontrar a posição correta.",
            "Insere o elemento na posição encontrada, mantendo a ordenação.",
            "É eficiente para listas pequenas ou quase ordenadas, mas lento para listas grandes desordenadas.",
            "O algoritmo é estável, in-place e não usa pivôs.",
        ),
        P("Qual é o algoritmo de ordenação descrito?"),
    ],
    "2025-02-19": [
        P("Um sistema de autenticação mantém registros de usuários em uma Árvore Rubro-Negra (ARN). Durante a inserção do valor 40, a árvore passou a ter a seguinte configuração (apenas os nós relevantes mostrados, N representa nó nulo/preto):"),
        C("""
                      (50, preto)
                     /           \\
            (30, vermelho)     (70, preto)
              /          \\
            (20, preto)  (40, vermelho)
        """),
        P("Problema detectado: o nó (30, vermelho) tem um filho (40, vermelho), violando a regra de que um nó vermelho não pode ter filho vermelho. O desenvolvedor implementou quatro possíveis funções de correção. Qual delas corrige o problema seguindo o algoritmo de inserção da ARN?"),
    ],
    "2025-02-20": [
        P("Um sistema de listas de músicas mantém as faixas em uma lista duplamente encadeada. Durante a implementação da função removerMusica(No *musica), o desenvolvedor identificou que, ao remover um nó que não é nem o primeiro nem o último, a lista ficava corrompida (links quebrados). Considere a estrutura:"),
        C("""
            typedef struct No {
                char titulo[50];
                struct No *prev;
                struct No *next;
            } No;
        """),
        P("Qual dos trechos de código abaixo corrige corretamente o problema ao remover um nó intermediário?"),
    ],
    # ------------------------------------------------------------------ 2025/01
    "2025-01-1": [
        P("Ao compilar e executar o programa a seguir escrito em linguagem de programação C, quantas vezes será impressa a string Teste?"),
        C(r"""
            #include <stdio.h>

            int main(void) {
                int i, j;
                for (i = 2; i <= 4; i++) {
                    for (j = 1; j < 3; j++) {
                        printf("Teste\n");
                    }
                }
            }
        """),
    ],
    "2025-01-2": [
        P("Considere que o algoritmo de ordenação Insertion Sort foi empregado para ordenar, de maneira crescente, o vetor (4, 3, 2, 1). Analise as afirmativas abaixo."),
        R(
            "A configuração (4, 4, 2, 1) jamais pode ocorrer durante os passos da ordenação;",
            "A configuração (2, 3, 4, 1) necessariamente ocorre durante os passos da ordenação;",
            "A configuração (1, 4, 3, 2) jamais ocorre durante os passos da ordenação.",
        ),
        P("Assinale a alternativa correta."),
    ],
    "2025-01-3": [
        P("Ao compilar e executar o programa a seguir escrito em linguagem de programação C, o que será impresso?"),
        C(r"""
            #include <stdio.h>

            int main(void) {
                int x, i, cont = 0;
                x = 18;
                for (i = 1; i <= x; i++) {
                    if ((x % i) == 0) {
                        cont = cont + 1;
                    }
                }
                printf("%d", cont);
            }
        """),
    ],
    "2025-01-4": [
        P("Considere a seguinte sequência de operações em uma pilha inicialmente vazia, considerando que Push implementa a operação de empilhar um elemento e Pop a operação de desempilhar um elemento:"),
        C("""
            Push(4);
            Pop();
            Push(2);
            Push(3);
            Pop();
            Push(1);
            Pop();
            Pop();
            Push(6);
            Push(7);
        """),
        P("Após todas as operações serem realizadas, qual será o número de elementos na pilha?"),
    ],
    "2025-01-5": [
        P("Considere as seguintes afirmações sobre pilhas e filas:"),
        R(
            "Uma forma de implementar pilhas é usando um vetor alocado dinamicamente. Sempre que a pilha ficar cheia, o vetor pode ser redimensionado (realocado).",
            "Se a fila for armazenada em uma lista simplesmente ligada, então uma forma eficiente de implementar é realizando inserções no final e remoções no início da lista, guardando sempre um ponteiro para o primeiro nó e um ponteiro para o último nó.",
            "Se a pilha for armazenada em uma lista duplamente encadeada, então as operações de inserção e remoção serão eficientes tanto se elas forem realizadas no início quanto no final da lista.",
        ),
        P("Assinale a alternativa correta."),
    ],
    "2025-01-6": [
        P("A seguir é apresentada uma árvore AVL com 9 nós. Considere as seguintes afirmativas acerca dessa árvore e de árvores AVL em geral."),
        R(
            "Esta árvore é incorreta, pois o nó que contém a chave 8 está desbalanceado.",
            "É possível inserir ao menos uma chave nessa árvore sem que seja necessário realizar rotações.",
            "Se a chave 4 for inserida na árvore, será necessário realizar uma rotação simples que altera a raiz da árvore, a qual contém atualmente o nó com valor 6, para que ela permaneça balanceada.",
        ),
        P("Assinale a alternativa correta."),
    ],
    "2025-01-7": [
        P("Qual é a altura máxima de qualquer árvore AVL com 9 nós, considerando aqui que a altura de uma árvore com um único nó é zero e com dois nós é 1?"),
    ],
    "2025-01-8": [
        P("Considere que o particionamento realizado em um vetor pelo algoritmo Quicksort deve garantir que ao final o vetor esteja corretamente ordenado e considere uma implementação na qual a escolha do pivô é feita de forma aleatória a partir de um dos elementos do vetor. O vetor abaixo apresenta o resultado do primeiro particionamento do Quicksort em um processo de ordenação de forma crescente, feito portanto considerando o vetor completo como intervalo."),
        C("3 7 2 5 4 7 8 8"),
        P("Selecione a alternativa correta."),
    ],
    "2025-01-10": [
        P("Considere o seguinte programa (pseudocódigo) e indique qual das alternativas é a verdadeira."),
        C(r"""
            #include <stdio.h>
            #include <stdlib.h>

            typedef struct No {
                int dado;
                struct No* prox;
            } No;

            No* criarNo(int valor) {
                No* novo = malloc(sizeof(No));
                novo->dado = valor;
                novo->prox = NULL;
                return novo;
            }

            void inserirNo(No** cabeca, int valor) {
                No* novo = criarNo(valor);
                novo->prox = *cabeca;
                *cabeca = novo;
            }

            int main() {
                No* lista = NULL;
                inserirNo(&lista, 10);
                inserirNo(&lista, 20);
                inserirNo(&lista, 30);
                printf("Lista criada com os elementos!\n");
                return 0;
            }
        """),
    ],
    "2025-01-11": [
        P("Considerando o seguinte programa (pseudocódigo) indique qual das afirmações é a verdadeira."),
        C("""
            #include <stdio.h>
            #include <stdlib.h>

            typedef struct No {
                int dado;
                struct No* prox;
            } No;

            No* criarNo(int valor) {
                No* novo = malloc(sizeof(No));
                novo->dado = valor;
                novo->prox = NULL;
                return novo;
            }

            void inserirNo(No** cabeca, int valor) {
                No* novo = criarNo(valor);
                if (*cabeca == NULL) {
                    *cabeca = novo;
                } else {
                    No* atual = *cabeca;
                    while (atual->prox != NULL) {
                        atual = atual->prox;
                    }
                    atual->prox = novo;
                }
            }

            int main() {
                No* lista = NULL;
                inserirNo(&lista, 10);
                inserirNo(&lista, 20);
                inserirNo(&lista, 30);
                return 0;
            }
        """),
    ],
    "2025-01-12": [
        P("Considerando o seguinte programa (pseudocódigo) indique qual das afirmações é a verdadeira."),
        C(r"""
            #include <stdio.h>

            int buscaBinaria(int vetor[], int tamanho, int valor) {
                int inicio = 0;
                int fim = tamanho - 1;
                while (inicio <= fim) {
                    int meio = (inicio + fim) / 2;
                    if (vetor[meio] == valor) {
                        return meio;
                    }
                    if (vetor[meio] < valor) {
                        inicio = meio + 1;
                    } else {
                        fim = meio - 1;
                    }
                }
                return -1;
            }

            int main() {
                int vetor[] = {1, 3, 5, 7, 9, 11, 13, 15, 17, 19};
                int tamanho = sizeof(vetor) / sizeof(vetor[0]);
                int valor = 15;
                int resultado = buscaBinaria(vetor, tamanho, valor);
                printf("%d\n", resultado);
                return 0;
            }
        """),
    ],
    "2025-01-13": [
        P("Considere a função em Python a seguir."),
        C("""
            def funcao(n):
                if n == 0:
                    return 0
                return n % 10 + funcao(n // 10)
        """),
        P("Qual o valor retornado pela função quando chamada da seguinte forma: funcao(42)?"),
    ],
    "2025-01-14": [
        P("Considere a função em Python a seguir."),
        C("""
            def funcao(n, r=0):
                if n == 0:
                    return r
                return funcao(n // 10, r * 10 + n % 10)
        """),
        P("Qual o retorno da função quando chamada da seguinte forma: funcao(42)?"),
    ],
    "2025-01-15": [
        P("Considere o grafo a seguir:"),
        P("Ao executar o algoritmo de Dijkstra para calcular o caminho mínimo entre os vértices A e D, qual das alternativas abaixo representa uma possível ordem em que os vértices são visitados (i.e., o vértice é retirado da fila de vértices a visitar)?"),
    ],
    "2025-01-17": [
        P("Analise as afirmações a seguir sobre tabelas de espalhamento (hash)."),
        R(
            "A sondagem linear (linear probing) pode causar aglomeração de chaves devido ao excesso de colisões em regiões muito próximas da posição de inserção original de uma chave qualquer.",
            "Uma estratégia importante para evitar que o algoritmo entre em loop infinito é sempre manter ao menos uma posição vazia na tabela. Assim, sempre será possível inserir uma chave na sua posição correta, independentemente da estratégia de resolução de colisão adotada.",
            "Na sondagem quadrática (quadratic probing), é possível que a sondagem entre em loop infinito mesmo que a tabela ainda tenha várias posições vazias.",
        ),
        P("Assinale a alternativa correta."),
    ],
    "2025-01-18": [
        P("O código abaixo imprime como resultado:"),
        C(r"""
            #include <stdio.h>
            #include <stdlib.h>

            typedef struct tipoNo {
                int d;
                struct tipoNo *prox;
            } tipoNo;

            typedef struct tipoLista {
                tipoNo *ea;
                tipoNo *eb;
            } tipoLista;

            void funcao(tipoLista *p, int num) {
                tipoNo *aux;
                aux = (tipoNo *) malloc(sizeof(tipoNo));
                aux->d = num;
                aux->prox = p->ea;
                p->ea = aux;
                p->eb = p->ea->prox;
            }

            void mostra(tipoLista *p) {
                tipoNo *temp = p->eb;
                while (temp) {
                    printf("%d ", temp->d);
                    temp = temp->prox;
                }
            }

            int main() {
                tipoLista l;
                l.ea = NULL;
                l.eb = NULL;
                funcao(&l, 2);
                funcao(&l, 4);
                funcao(&l, 6);
                funcao(&l, 8);
                mostra(&l);
            }
        """),
    ],
    "2025-01-19": [
        P("Para gerar a sequência de Fibonacci usamos a relação de recorrência abaixo (I). Complete o pseudo-código (II) para que o cálculo da sequência de Fibonacci esteja correto utilizando uma das opções abaixo:"),
    ],
    "2025-01-20": [
        P("Considere as afirmações abaixo sobre diferentes tipos de árvores binárias de pesquisa e marque uma das alternativas"),
        R(
            "Os algoritmos de busca tanto em árvores sem balanceamento, quanto em árvores com balanceamento, têm o número máximo de comparações da chave de busca com valores na árvore, na pior das hipóteses, proporcional a altura da árvore, não importando se a árvore é sem balanceamento ou com balanceamento.",
            "Dependendo da ordem de inserção dos elementos, é possível que a altura de uma árvore sem balanceamento seja menor ou igual que a de uma árvore com balanceamento, mesmo que as duas contenham os mesmos elementos, todos inseridos na mesma ordem",
            "O mesmo algoritmo de busca pode ser usado tanto para árvores com balanceamento quanto para árvores sem balanceamento",
            paren=True,
        ),
    ],
    # ------------------------------------------------------------------ 2024/02
    "2024-02-1": [
        P("Considere a função abaixo escrita em linguagem C e com o objetivo de ordenar um vetor de inteiros com n elementos de maneira crescente:"),
        C("""
            void ordena(int v[], unsigned tamanhoDoVetor) {
                int i, j, k;
                for (i = 1; i < tamanhoDoVetor; i++) {
                    k = v[i];
                    for (j = i - 1; ((j >= 0) && (v[j] > k)); j--) {
                        v[j + 1] = v[j];
                    }
                    v[j] = k;
                }
            }
        """),
        P("Assinale a alternativa correta:"),
    ],
    "2024-02-2": [
        P("Se um programador fez testes para avaliar o tempo de execução para entradas de tamanho 1000 em um programa O(n²) e obteve tempo de 1 minuto, quanto tempo demoraria para uma entrada de tamanho 2000?"),
        P("(considere que 1000 é suficientemente grande para desprezar fatores menores na função de custo e que o custo unitário por operação não variou com o tamanho do problema entre os dois experimentos)"),
    ],
    "2024-02-3": [
        P("Sobre as afirmativas abaixo:"),
        R(
            "Se f(n) = log₂(n) então f(n) é O(log₁₀(n))",
            "Se um algoritmo tem função de custo T(n) = 3n então é correto afirmar que o algoritmo é O(n²)",
            "Se um algoritmo A tem função de custo T₁(n) na classe de complexidade Ω(n) e um algoritmo B tem função de custo T₂(n) na classe de complexidade Ω(n²) então sabe-se com certeza que T₁(n) está na classe O(T₂(n)).",
            paren=True,
        ),
    ],
    "2024-02-4": [
        P("Dado o vetor abaixo, o qual é apresentado em uma tabela onde a primeira linha indica a posição dos elementos e a segunda linha os valores armazenados."),
        C(VEC_TABLE),
        P("Uma busca binária no mesmo compararia a chave 13 com os seguintes valores do vetor:"),
    ],
    "2024-02-5": [
        P("Considere a árvore binária a seguir:"),
        P("Se ela for percorrida em-ordem (inorder), a sequência de nós visitados será:"),
    ],
    "2024-02-6": [
        P("Sobre árvores vermelho e preto contento pelo menos 128 elementos, sabe-se que:"),
        R(
            "Uma árvore vermelho e preto tem altura máxima inferior a 3 log₂(n), onde n é o número de chaves, pois ela é balanceada",
            "No pior caso, uma árvore vermelho e preto tem altura pior do que o pior caso de uma árvore binária de pesquisa",
            "O balanceamento na árvore falha apenas para os casos de inserção em ordem crescente, situação em que a altura esperada da árvore pode chegar a passar da raiz quadrada do número de elementos quando o número de elementos for muito grande.",
            paren=True,
        ),
    ],
    "2024-02-7": [
        P("Considere as seguintes afirmações sobre a tarefa de pesquisa por chaves em uma coleção de elementos."),
        R(
            "A busca binária permite encontrar chaves eficientemente, mas não funciona se houver chaves repetidas na coleção",
            "Uma estrutura de dados pode ser usada para organizar os elementos, sacrificando custo espacial (memória) e ao mesmo tempo favorecendo o custo temporal",
            "Se for necessário fazer muitas alterações na coleção (inserção, remoção e alteração de chaves), então a busca sequencial poderá ser melhor do que a busca binária no caso médio.",
            paren=True,
        ),
    ],
    "2024-02-9": [
        P("Considere uma lista ligada na qual cada nó contém um campo info (um valor inteiro) e um campo prox (um ponteiro para o próximo nó). O início da lista é indicado simplesmente por um ponteiro para o primeiro elemento. A declaração a seguir especifica o tipo da lista e declara uma lista inicialmente vazia."),
        C("""
            typedef struct lista Lista;
            struct lista {
                int info;
                Lista *prox;
            } *uma_lista = NULL;
        """),
        P("Qual das alternativas a seguir contém um código que insere corretamente um novo nó no início da lista?"),
    ],
    "2024-02-10": [
        P("Considere as seguintes afirmações sobre algoritmos de ordenação."),
        R(
            "O método da inserção (insertion sort) pode ser mais eficiente do que o quick sort se o vetor for pequeno e tiver poucos elementos fora de ordem.",
            "O quick sort é o melhor algoritmo de ordenação em situações típicas e, para vetores muito grandes, ele é sempre aconselhável em detrimento de outros algoritmos de ordenação.",
            "O método da intercalação (merge sort) é eficiente, mas normalmente requer memória adicional para realizar a intercalação. É possível intercalar os elementos no próprio vetor, mas isso exige passos adicionais.",
            paren=True,
        ),
    ],
    "2024-02-11": [
        P("Considere a função em Python a seguir."),
        C(CHAMADA_FIB),
        P("Quantas vezes a palavra PPGI é impressa na tela ao executar chamada(4)?"),
    ],
    "2024-02-12": [
        P("Considere a função em Python a seguir."),
        C(CHAMADA_FIB),
        P("Qual o retorno da execução chamada(4)?"),
    ],
    "2024-02-13": [
        P("Sobre árvores vermelho-preto, considere as afirmações:"),
        R(
            "A raiz é preta",
            "Toda subárvore nula é preta",
            "Se um nó é preto, então os filhos são vermelhos",
            paren=True,
        ),
        P("São verdadeiras:"),
    ],
    "2024-02-16": [
        P("Considere o seguinte trecho de código em C:"),
        C(r"""
            int main() {
                int *ptr;
                ptr = (int *)malloc(sizeof(int));
                *ptr = 10;
                printf("O valor armazenado em ptr é: %d", *ptr);
                free(ptr);
                return 0;
            }
        """),
        P("O que o trecho de código faz?"),
    ],
    "2024-02-19": [
        P("Analise o código a seguir:"),
        C(r"""
            int subrotina(int x) {
                int i, z = 0;
                for (i = 1; i < x; i++)
                    z += i;
                return z;
            }

            int main() {
                int z, i, x;
                for (i = 1; i < 5; i++) {
                    printf("Informe um numero: ");
                    scanf("%d", &z);
                    x = subrotina(z);
                    printf("%d\n", x);
                }
                return 0;
            }
        """),
        P("Qual o resultado impresso na tela, considerando que o usuário informou os respectivos valores de entrada (9, 7, 6, 10)?"),
    ],
    "2024-02-20": [
        P("Marque a alternativa CORRETA do programa em C que atende o seguinte enunciado: “Alguns restaurantes nos EUA cobram gorjeta de 18% para o garçom. Faça um programa em C que leia o valor gasto com as despesas realizadas em um restaurante e imprima o valor total com a gorjeta”:"),
    ],
    # ------------------------------------------------------------------ 2024/01
    "2024-01-1": [
        P("Considere o código abaixo cujo objetivo é ordenar um vetor de inteiros com n elementos de maneira crescente:"),
        C("""
            void algoritmo(int v[], int n) {
                int i, j, k, tmp;
                for (i = 0; i < n-1; i++) {
                    k = i;
                    for (j = 0; j < n; j++) {
                        if (v[k] > v[j]) {
                            k = j
                        }
                    }
                    tmp = v[k];
                    v[k] = v[i];
                    v[i] = tmp;
                }
            }
        """),
    ],
    "2024-01-2": [
        P("Sobre o heapsort, é correto afirmar que:"),
        R(
            "Seu custo no pior caso é O(n log n), onde n é o tamanho do vetor",
            "O algoritmo pode ser dividido em duas etapas, sendo a primeira usada para construir um heap e a segunda para usar o heap como forma eficiente de executar uma estratégia de ordenação por seleção",
            "Tem custo máximo quadrático no pior caso",
            paren=True,
        ),
    ],
    "2024-01-3": [
        P("Em um heap binário de mínimo contendo N elementos e implementado em um vetor, sabendo-se que o elemento mínimo está na posição zero do vetor, a operação de remover o elemento da raiz (o da posição zero) e deixar a estrutura do heap correta ao final, com o restante das chaves formando um heap, pode ser implementada, na melhor maneira possível, a custo:"),
    ],
    "2024-01-4": [
        P("Se um programador fez testes para avaliar o tempo de execução para entradas de tamanho 100 em um programa (n³) e obteve tempo de 1 minuto, quanto tempo demoraria para uma entrada de tamanho 300?"),
        P("(Considere que 100 é suficientemente grande para desprezar fatores menores na função de custo, e que o custo unitário por operação não variou com o tamanho do problema entre os dois experimentos.)"),
    ],
    "2024-01-5": [
        P("Sobre as afirmativas abaixo:"),
        R(
            "Todo algoritmo que não seja vazio tem custo (1)",
            "Todo algoritmo tem custo O(nⁿ)",
            "Nenhum algoritmo que não seja vazio tem custo o(2) – “ó pequeno de 2”",
            paren=True,
        ),
    ],
    "2024-01-6": [
        P("Considere o vetor abaixo, o qual é apresentado em uma tabela onde a primeira linha indica a posição dos elementos e a segunda linha os valores armazenados."),
        C(VEC_TABLE),
        P("Uma busca binária nesse vetor compararia a chave 9 com os seguintes valores do vetor:"),
    ],
    "2024-01-7": [
        P("Sobre o custo das operações de busca por uma chave em árvores vermelho e preto, sabe-se que:"),
        R(
            "Uma árvore vermelho e preto tem altura máxima log n, onde n é o número de chaves, pois a mesma é balanceada",
            "Uma árvore vermelho e preto tem altura máxima inferior a 3 log n, onde n é o número de chaves, pois a mesma é balanceada",
            "Uma árvore vermelho e preto pode ser degenerada no pior caso, tendo custo de busca crescendo linearmente com o número de elementos, mas em situações muito raras, pois a mesma é balanceada",
            paren=True,
        ),
    ],
    "2024-01-8": [
        P("Considere uma pilha que inicialmente estava vazia e na qual inseriu-se as chaves 2, 4 e 6, 8 e 10 nessa ordem. Sobre uma operação de remoção de elemento da mesma (retirada padrão de uma pilha), considerando-se que a estrutura de dados usada é uma lista encadeada, pode-se afirmar que:"),
        R(
            "A remoção retira a chave 2",
            "A remoção da chave 10",
            "Custo computacional proporcional ao tamanho da pilha",
            "Custo computacional constante, não importando o tamanho da pilha",
            paren=True,
        ),
    ],
    "2024-01-10": [
        P("Sobre os algoritmos de ordenação quicksort, mergesort e inserção, é correto afirmar que:"),
        R(
            "O quicksort é o que apresenta melhor desempenho no pior caso dentre os três algoritmos, sendo por isso o algoritmo mais usado",
            "A ordenação por inserção tende a ser a mais rápida em casos de ordenação de um vetor onde o número de elementos fora de ordem é menor que um décimo de log N, sendo N o número de elementos do vetor e N um valor grande",
            "O mergesort é o que tem menor custo assintótico no pior caso quando comparamos os três algoritmos",
            paren=True,
        ),
    ],
    "2024-01-12": [
        P("Considere que um vetor de 8 elementos está sendo ordenado de forma crescente pelo algoritmo quicksort, e que após a escolha do pivot (elemento usado como chave para o particionamento) e ao final do primeiro particionamento, o vetor tenha ficado com os seguintes valores:"),
        C("2 5 9 1 7 2 1 9"),
        P("Dado o resultado, pode-se afirmar que:"),
    ],
    "2024-01-15": [
        P("Dado o seguinte pseudocódigo Python de busca binária recursiva, indique qual das opções abaixo é impressa pela linha final print()."),
        C(BUSCA_REC % "100"),
    ],
    "2024-01-16": [
        P("Considere a seguinte afirmação:"),
        P("Considerando o pior caso no custo das operações, em uma tabela hash com encadeamento na qual uma lista encadeada é usada para tratamento de colisões e uma chave no hash não pode se repetir, uma inserção tem custo de __, enquanto que uma busca tem custo de __. Entretanto, se tirarmos a lista encadeada e usarmos uma árvore rubro-negra para o tratamento de colisões, o custo de inserção na tabela hash passa a ser __ e o custo de busca passa a ser __."),
        P("Assinale a opção que preenche corretamente os campos em branco:"),
    ],
    "2024-01-17": [
        P("Dado o seguinte pseudocódigo Python de busca binária recursiva, indique quantas vezes ocorre a chamada da função pesquisa_binaria_recursiva():"),
        C(BUSCA_REC % "70"),
    ],
    "2024-01-18": [
        P("Dado o seguinte pseudocódigo Python, indique a saída correta que será impressa na tela do computador:"),
        C("""
            import numpy as np

            A = [[0, 2, 1], [1, 0, 0]]
            B = [[7, 0], [0, 10], [11, 0]]

            def operacao_com_matrizes():
                resultado = np.zeros((2, 2))
                for i in range(len(A)):
                    for j in range(len(B[0])):
                        for k in range(len(B)):
                            resultado[i][j] += A[i][k] * B[k][j]
                return resultado

            print(operacao_com_matrizes())
        """),
    ],
    "2024-01-19": [
        P("Dado o seguinte pseudocódigo Python, indique a saída correta que será impressa na tela do computador quando a seguinte sequência de comandos é executada:"),
        C("""
            class Stack:
                def __init__(self):
                    self.stack = []

                def pushit(self, value):
                    self.stack.append(value)

                def popit(self):
                    try:
                        self.stack.pop()
                    except:
                        print('empty stack')
                        self.stack = []
        """),
        P("Os comandos executados são:"),
        C("""
            stack = Stack()
            stack.pushit(1)
            stack.pushit(3)
            stack.popit()
            stack.popit()
            stack.popit()
            stack.pushit(2)
            stack.pushit(1)
            stack.popit()
            print(stack.stack)
        """),
    ],
    "2024-01-20": [
        P("Dado o seguinte pseudocódigo Python, indique qual seria a saída correta no terminal do computador:"),
        C("""
            def func1(fator):
                def func2(x):
                    return x * fator
                return func2

            funcao = func1(3)
            print(funcao(5))
        """),
    ],
    # ------------------------------------------------------------------ 2020/01
    "2020-01-1": [
        P("Suponha que você tenha a seguinte tabela hash implementada utilizando endereçamento aberto com sondagem linear (linear probing). A função hash que você está usando é uma função modular, h(x) = x MOD 9."),
        P("Qual das ordens abaixo pode ser a ordem em que os elementos foram adicionados à hash? Assuma que a hash nunca tenha sido redimensionada e que nenhum elemento tenha sido excluído ainda."),
    ],
    "2020-01-2": [
        P("Dado os seguintes elementos (10, 20, 15, 25, 30, 16, 18, 19), qual desenho representa uma árvore AVL, inicialmente vazia, que é preenchida com esses elementos, na ordem apresentada, e que tem as devidas rotações efetuadas?"),
    ],
    "2020-01-5": [
        P("Considere o código da função abaixo:"),
        C(r"""
            void fun1(struct node* head) {
                if (head == NULL)
                    return;
                fun1(head->next);
                printf("%d ", head->data);
            }
        """),
        P("O que essa função faz, dada uma lista encadeada de valores inteiros como entrada?"),
    ],
    "2020-01-7": [
        P("A seguinte função em C usa uma lista simplesmente encadeada como argumento de entrada. Ela modifica a lista, movendo o último elemento para a frente da lista e retorna a lista modificada."),
        C("""
            typedef struct node {
                int value;
                struct node *next;
            } Node;

            Node *move_to_front(Node *head) {
                Node *p, *q;
                if ((head == NULL) || (head->next == NULL))
                    return head;
                q = NULL;
                p = head;
                while (p->next != NULL) {
                    q = p;
                    p = p->next;
                }
                _ _ _ _ _ _ _ _ _ _ _ _ _ _
                return head;
            }
        """),
        P("Certa parte do código foi deixada em branco (linha tracejada). Escolha a alternativa CORRETA para substituir a linha em branco."),
    ],
    "2020-01-12": [
        P("Quais das seguintes árvores abaixo respeita as regras básicas de balanceamento de árvores AVL?"),
    ],
    "2020-01-19": [
        P("Considere uma lista duplamente encadeada não ordenada (com ponteiros na início e final da lista). Qual das seguintes operações a seguir pode ser implementada no tempo O(1)? Marque a alternativa CORRETA."),
        R(
            "Inserção na frente da lista encadeada",
            "Inserção no final da lista encadeada",
            "Exclusão do nó frontal da lista encadeada",
            "Exclusão do último nó da lista encadeada",
        ),
    ],
}

# --------------------------------------------------------------------------- alternativas
# texto simples  -> substitui o texto da alternativa
# opt("""código""") -> alternativa de código (multilinha)
OPTIONS: dict[str, dict[str, object]] = {
    "2026-02-4": {"A": "Apenas I.", "B": "Apenas I e III.", "C": "Apenas II e III.", "D": "Todas as afirmações são verdadeiras."},
    "2026-02-6": {
        "A": "Apenas as afirmações I e III estão corretas.",
        "B": "Apenas as afirmações II e III estão corretas.",
        "C": "Apenas as afirmações I e II estão corretas.",
        "D": "Nenhuma das opções anteriores, A, B ou C, está certa.",
    },
    "2026-02-7": {
        "A": "Se ??? for trocado pela opção I, então a função ordena o vetor v em ordem crescente usando ordenação por inserção.",
        "B": "Se ??? for trocado pela opção II, então a função ordena o vetor v em ordem decrescente usando ordenação por inserção.",
        "C": "Se ??? for trocado pela opção I, então a função ordena o vetor por seleção em ordem crescente.",
        "D": "Se ??? for trocado pela opção III, então a função ordena o vetor v em ordem crescente usando ordenação por seleção.",
    },
    "2026-02-12": {"B": "h(k, i) = (h'(k) + i²) mod m."},
    "2026-02-13": {
        "A": "Apenas a afirmativa I é verdadeira.",
        "B": "Apenas a afirmativa II é verdadeira.",
        "C": "Apenas as afirmativas I e II são verdadeiras.",
        "D": "Apenas as afirmativas I e III são verdadeiras.",
    },
    "2026-02-20": {
        "A": "O grafo Gᵀ é chamado grafo transposto de G e pode ser usado, por exemplo, para verificar se G é fortemente conexo.",
        "B": "O grafo Gᵀ é chamado grafo transposto de G e pode ser usado, por exemplo, para encontrar distâncias mínimas em grafos com pesos negativos usando algoritmos que não são capazes de lidar com pesos negativos em G.",
        "C": "O grafo Gᵀ é chamado grafo simétrico e pode ser usado para identificar se os vértices de G possuem vizinhança simétrica entre si.",
        "D": "O grafo Gᵀ é chamado grafo simétrico e só pode ser calculado para grafos não direcionados.",
    },
    "2026-01-8": {
        "A": opt("""
            I: tamanho - 1
            II: j >= i
            III: i = meio + 1
            IV: j = meio
        """),
        "B": opt("""
            I: tamanho
            II: j >= i
            III: i = meio + 1
            IV: j = meio - 1
        """),
        "C": opt("""
            I: tamanho - 1
            II: j >= i
            III: i = meio + 1
            IV: j = meio - 1
        """),
        "D": opt("""
            I: tamanho - 1
            II: i <= j
            III: i = meio - 1
            IV: j = meio + 1
        """),
    },
    "2026-01-13": {
        "A": opt("""
            def insere(lista, elemento):
                lista.insert(elemento)

            def remove(lista, elemento):
                lista.pop()
        """),
        "B": opt("""
            def insere(lista, elemento):
                lista.insert(-1, elemento)

            def remove(lista, elemento):
                lista.pop()
        """),
        "C": opt("""
            def insere(lista, elemento):
                lista.append(elemento)

            def remove(lista, elemento):
                lista.pop(0)
        """),
        "D": opt("""
            def insere(lista, elemento):
                lista.append(elemento, 0)

            def remove(lista, elemento):
                lista.remove(0)
        """),
    },
    "2026-01-14": {
        "A": opt("""
            int ident(int N, int mat[][N]) {
                int flag = 0;
                for (int i = 0; i < N; i++) {
                    if (mat[i][i] == 1)
                        flag = 1;
                    for (int j = i + 1; j < N; j++)
                        if (mat[i][j] == 0 || mat[j][i] == 0)
                            flag = 1;
                }
                return flag;
            }
        """),
        "B": opt("""
            int ident(int N, int mat[][N]) {
                int flag = 0;
                for (int i = 0; i < N; i++) {
                    for (int j = i + 1; j < N; j++)
                        if (i == j && mat[i][j] == 1)
                            flag = 1;
                        else if (mat[i][j] == 0)
                            flag = 1;
                }
                return flag;
            }
        """),
        "C": opt("""
            int ident(int N, int mat[][N]) {
                int flag = 1;
                for (int i = 0; i < N; i++) {
                    if (mat[i][i] != 1)
                        flag = 0;
                    for (int j = i + 1; j < N; j++)
                        if (mat[i][j] != 0 || mat[j][i] != 0)
                            flag = 0;
                }
                return flag;
            }
        """),
        "D": opt("""
            int ident(int N, int mat[][N]) {
                int flag = 1;
                for (int i = 0; i < N; i++) {
                    for (int j = i + 1; j < N; j++)
                        if (i == j && mat[i][j] == 0)
                            flag = 0;
                        else if (i != j && mat[i][j] != 0)
                            flag = 0;
                        else
                            flag = 1;
                }
                return flag;
            }
        """),
    },
    "2025-02-15": {
        "A": opt("""
            def maior(lista):
                res = list[0]
                for i in range(1, len(lista)):
                    if lista[i] > res:
                        res = lista[i]
                return res
        """),
        "B": opt("""
            def maior(lista):
                if len(lista) == 1:
                    return lista[0]
                primeiro = lista[0]
                resto = lista[1:]
                return max(primeiro, resto)
        """),
        "C": opt("""
            def maior(lista):
                if len(lista) == 1:
                    return lista[0]
                primeiro = lista[0]
                resto = lista[1:]
                if primeiro > resto:
                    return primeiro
                else:
                    return maior(resto)
        """),
        "D": opt("""
            def maior(lista):
                if len(lista) == 1:
                    return lista[0]
                primeiro = lista[0]
                resto = lista[1:]
                return max(primeiro, maior(resto))
        """),
    },
    "2025-02-19": {
        "A": opt("""
            if (pai->cor == VERMELHO && tio->cor == VERMELHO) {
                pai->cor = PRETO;
                tio->cor = PRETO;
                avo->cor = VERMELHO;
            }
        """),
        "B": opt("""
            if (pai->cor == VERMELHO && tio->cor == PRETO && no == pai->dir) {
                rotacaoEsquerda(pai);
                no = pai;
            }
        """),
        "C": opt("""
            if (pai->cor == VERMELHO && tio->cor == PRETO && no == pai->esq) {
                rotacaoDireita(avo);
                trocarCores(pai, avo);
            }
        """),
        "D": opt("""
            if (pai->cor == PRETO && tio->cor == PRETO) {
                rotacaoEsquerda(avo);
            }
        """),
    },
    "2025-02-20": {
        "A": opt("""
            if (musica->prev != NULL)
                musica->prev->next = musica->next;
            if (musica->next != NULL)
                musica->next->prev = musica->prev;
            free(musica);
        """),
        "B": opt("""
            musica->prev->next = NULL;
            musica->next->prev = NULL;
            free(musica);
        """),
        "C": opt("""
            if (musica->next != NULL)
                musica->next->next = musica->prev;
            if (musica->prev != NULL)
                musica->prev->prev = musica->next;
            free(musica);
        """),
        "D": opt("""
            free(musica->prev);
            free(musica->next);
            free(musica);
        """),
    },
    "2025-01-16": {
        "A": opt("""
            float calcula_preco(float valor_compra) {
                if (valor_compra > 100)
                    valor_compra = valor_compra - (valor_compra * 15%);
                return valor_compra;
            }
        """),
        "B": opt("""
            float calcula_preco(float valor_compra) {
                if (valor_compra > 100)
                    valor_compra = valor_compra - (valor_compra * 0.85);
                return valor_compra;
            }
        """),
        "C": opt("""
            float calcula_preco(float valor_compra) {
                if (valor_compra > 100)
                    valor_compra = valor_compra - valor_compra * 1.15;
                return valor_compra;
            }
        """),
        "D": opt("""
            float calcula_preco(float valor_compra) {
                if (valor_compra > 100)
                    valor_compra = valor_compra / 1.15;
                return valor_compra;
            }
        """),
        "E": opt("""
            float calcula_preco(float valor_compra) {
                if (valor_compra > 100)
                    valor_compra = valor_compra * 0.85;
                return valor_compra;
            }
        """),
    },
    "2024-02-9": {
        "A": opt("""
            void insere(Lista *lista, int info) {
                Lista *novo = malloc(sizeof(Lista));
                novo->info = info;
                novo->prox = *lista;
                *lista = novo;
            }
        """),
        "B": opt("""
            void insere(Lista *lista, int info) {
                Lista *novo = malloc(sizeof(Lista));
                novo->info = info;
                novo->prox = lista->prox;
                *lista = novo;
            }
        """),
        "C": opt("""
            void insere(Lista **lista, int info) {
                Lista *novo = malloc(sizeof(Lista));
                novo->info = info;
                novo->prox = *lista;
                *lista = novo;
            }
        """),
        "D": opt("""
            void insere(Lista **lista, int info) {
                Lista *novo = malloc(sizeof(Lista));
                novo->info = info;
                novo->prox = NULL;
                if (*lista == NULL) {
                    *lista = novo;
                } else {
                    *lista->prox = novo;
                }
            }
        """),
    },
    "2024-02-20": {
        letter: opt(
            f"""
            #include<stdio.h>

            int main(void) {{
                float {v1}, {v2};
                printf("Informe o valor");
                scanf("%f", &{v_in});
                {v_out} = {expr};
                printf("Valor Total: %.2f", {v_out});
                return 0;
            }}
            """
        )
        for letter, (v1, v2, v_in, v_out, expr) in {
            "A": ("PT", "E", "E", "PT", "E + E * 1.18"),
            "B": ("X", "TG", "X", "TG", "X * 0.18"),
            "C": ("K", "W", "K", "W", "K + K * 0.18"),
            "D": ("PT", "E", "E", "PT", "E * E * 18/100"),
        }.items()
    },
    "2024-01-20": {"D": "A saída é 0"},
    "2020-01-2": {"E": "Nenhuma das árvores desenhadas representa uma AVL"},
    "2020-01-7": {
        "A": opt("""
            q = NULL;
            p->next = head;
            head = p;
        """),
        "B": opt("""
            q->next = NULL;
            head = p;
            p->next = head;
        """),
        "C": opt("""
            head = p;
            p->next = q;
            q->next = NULL;
        """),
        "D": opt("""
            q->next = NULL;
            p->next = head;
            head = p;
        """),
    },
    "2020-01-3": {"A": "n³ + 9", "B": "3n² + 3n + 2", "E": "n² + 1"},
    "2020-01-13": {"E": "Pode-se dizer que uma árvore B é uma árvore balanceada"},
    "2020-01-18": {
        "A": opt("""
            4 5 3 2 1
            3 4 5 2 1
            2 3 4 5 1
            1 2 3 4 5
        """),
        "B": opt("""
            5 4 3 1 2
            5 4 1 2 3
            5 1 2 3 4
            1 2 3 4 5
        """),
        "C": opt("""
            4 3 2 1 5
            3 2 1 5 4
            2 1 5 4 3
            1 5 4 3 2
        """),
        "D": opt("""
            4 5 3 2 1
            2 3 4 5 1
            3 4 5 2 1
            1 2 3 4 5
        """),
        "E": opt("""
            4 5 3 1 2
            2 3 4 5 1
            3 4 5 2 1
            1 2 3 4 5
        """),
    },
    "2020-01-20": {
        "A": opt("""
            Full:  (REAR+1) mod n == FRONT
            Empty: (FRONT+1) mod n == REAR
        """),
        "B": opt("""
            Full:  REAR == FRONT
            Empty: (REAR+1) mod n == FRONT
        """),
        "C": opt("""
            Full:  (FRONT+1) mod n == REAR
            Empty: REAR == FRONT
        """),
        "D": opt("""
            Full:  REAR == FRONT
            Empty: (FRONT+1) mod n == REAR
        """),
        "E": opt("""
            Full:  (REAR+1) mod n == FRONT
            Empty: REAR == FRONT
        """),
    },
}

# --------------------------------------------------------------------------- limpeza de ruído do PDF
HEADER = re.compile(
    r"\s*Universidade Federal do Amazonas\s+Instituto de Computação"
    r"(?:\s+(?:ICOMP|fic OMP|ic OMP|UFAM))*"
    r"\s+Programa de Pós-[Gg]raduação em Inform[aá]tica"
    r"(?:\s+(?:Instituto de Computação|UFAM|inda corapuese\)|de comipataçi))*"
    r"(?:\s*_{3,})?"
)
ANSWER_SHEET = re.compile(r"\s*Cartão de respostas\..*$", re.S)
# Em 2024/01 o número da página vem ANTES do cabeçalho; em 2020/01, DEPOIS.
PAGE_BEFORE = re.compile(r"\s+\d{1,2}(?=\s*Universidade Federal do Amazonas)")
PAGE_AFTER = re.compile(r"(?<=Inform[aá]tica)\s+\d{1,2}\s*$")


def clean_noise(text: str, edition_id: str) -> str:
    if edition_id == "2024-01":
        text = PAGE_BEFORE.sub("", text)
    if edition_id == "2020-01":
        text = PAGE_AFTER.sub("", text)
    text = HEADER.sub("", text)
    text = ANSWER_SHEET.sub("", text)
    return re.sub(r"[ \t]+\n", "\n", text).strip()


# --------------------------------------------------------------------------- aplicação
def flatten(blocks: list[dict]) -> str:
    """Texto corrido de todos os blocos (usado pela busca)."""
    lines: list[str] = []
    for block in blocks:
        if block["type"] == "list":
            lines.extend(f"{item['label']} {item['text']}" for item in block["items"])
        else:
            lines.append(block["text"])
    return "\n".join(lines)


def structured_default(question: dict) -> list[dict] | None:
    """Questões que já tinham intro/code/ask (2026/02 nº 1 e 3) viram blocos."""
    if question.get("code"):
        return [P(question["intro"]), C(question["code"]), P(question["ask"])]
    return None


def main() -> None:
    src = DATA / "questions.json"
    data = json.loads(src.read_text())
    missing_blocks, missing_options = set(BLOCKS), set(OPTIONS)

    for edition in data["editions"]:
        for question in edition["questions"]:
            key = f"{edition['id']}-{question['number']}"

            blocks = BLOCKS.get(key) or structured_default(question)
            if blocks is None:
                blocks = [P(clean_noise(question["prompt"], edition["id"]))]
            missing_blocks.discard(key)
            question["blocks"] = blocks
            question["prompt"] = flatten(blocks)

            overrides = OPTIONS.get(key, {})
            missing_options.discard(key)
            for option in question["options"]:
                value = overrides.get(option["id"])
                if isinstance(value, tuple):
                    option["text"], option["code"] = value
                elif isinstance(value, str):
                    option["text"] = value
                    option.pop("code", None)
                else:
                    option["text"] = clean_noise(option["text"], edition["id"])

    assert not missing_blocks, f"chaves de blocos sem questão: {missing_blocks}"
    assert not missing_options, f"chaves de alternativas sem questão: {missing_options}"

    src.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    out = DATA / "questions.ts"
    out.write_text(
        "// Generated from the official PPGI/UFAM exam PDFs.\n"
        "export const studyData = " + json.dumps(data, ensure_ascii=False, indent=2) + " as const;\n"
    )
    total_code = sum(1 for e in data["editions"] for q in e["questions"] if any(b["type"] == "code" for b in q["blocks"]))
    total_list = sum(1 for e in data["editions"] for q in e["questions"] if any(b["type"] == "list" for b in q["blocks"]))
    print(f"OK: {len(BLOCKS)} enunciados reescritos; {total_code} com código, {total_list} com listas.")


if __name__ == "__main__":
    main()