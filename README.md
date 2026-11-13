# ProvaQuest PPGI

Aplicação web interativa para estudar as provas do processo seletivo do PPGI/UFAM.

O projeto reúne:

- prática integrada à busca: filtre por edital, assunto, tema e subtema, resolva a questão na mesma tela e receba o gabarito com resolução passo a passo;
- progresso salvo no navegador: respostas, acertos e o filtro atual sobrevivem ao F5, com opção de zerar somente o filtro ou todo o histórico;
- simulados por edital usando somente questões válidas, com gabarito e explicação revelados após confirmar cada resposta, progresso independente por edição e opção para zerar um ou todos;
- questões estruturadas com código, desenhos e referência da página original quando necessário;
- fontes oficiais das provas e gabaritos;
- consulta nominal dos resultados publicados nos editais encerrados;
- notas por etapa, situação de avanço e funil de candidatos por fase.

## Requisitos

Você pode executar o projeto de duas formas:

- **Docker**, recomendado para maior compatibilidade: Docker Engine 24+ e Docker Compose v2+;
- **Node.js**, para desenvolvimento: Node.js 22+, Corepack e pnpm 10.18.0.

A aplicação atual usa dados locais no frontend. Não é necessário configurar banco de dados, OAuth ou chave de API para estudar as questões e consultar os resultados incluídos no repositório.

## Rodar com Docker

Na raiz do projeto:

```bash
docker compose up --build
```

Depois abra <http://localhost:3000>.

O proxy de arquivos `/manus-storage/*` é opcional. Para usá-lo, defina `MANUS_API_URL` e `MANUS_API_KEY` no ambiente antes de subir o Compose ou coloque essas variáveis em um arquivo `.env` local na raiz do projeto. Não publique nem versione a chave. Sem essas variáveis, estudo, simulados e consulta aos dados locais continuam funcionando, mas downloads que dependam do proxy de storage não estarão disponíveis.

Para executar em segundo plano:

```bash
docker compose up --build -d
```

Para parar:

```bash
docker compose down
```

O container expõe a porta `3000`. Para usar outra porta no computador, altere somente o lado esquerdo do mapeamento:

```yaml
ports:
  - "8080:3000"
```

Nesse caso, acesse <http://localhost:8080>.

Também é possível executar sem Compose:

```bash
docker build -t provaquest-ppgi .
docker run --rm -p 3000:3000 provaquest-ppgi
```

O endpoint `GET /api/health` retorna `{"status":"ok"}` e pode ser usado por serviços de hospedagem para verificar se a aplicação está pronta.

## Rodar localmente com Node.js

Instale as dependências e inicie o modo de desenvolvimento:

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install
pnpm dev
```

Abra <http://localhost:3000>.

Para rodar somente a interface estática, sem o servidor Express:

```bash
pnpm dev:static
```

Para validar o projeto antes de publicar:

```bash
pnpm check
pnpm build
pnpm test
```

Para iniciar a versão compilada:

```bash
pnpm build
pnpm start
```

## Estrutura principal

```text
client/src/pages/Home.tsx       interface, prática integrada à busca, simulados e consulta nominal
client/src/data/questions.ts    acervo de questões convertido para TypeScript
client/src/data/candidates.ts   nomes, notas e etapas dos resultados oficiais
client/public/evidence/         imagens de páginas originais usadas como referência
client/public/figures/          recortes das figuras (árvores, grafos, tabelas) por questão
scripts/                        preparação, validação e geração dos dados
server/                         entrypoint Express e contratos do starter
Dockerfile                      imagem de produção
compose.yaml                    execução local via Docker Compose
```

## Figuras das questões

Muitas questões do PPGI só fazem sentido com o desenho que vem junto: árvore AVL, grafo ponderado, tabela hash, diagrama de listas. Esses desenhos não são texto, então qualquer extração baseada só no texto do PDF os perde.

O script [`scripts/extract_figures.py`](scripts/extract_figures.py) recorta cada figura direto da página original:

1. baixa os PDFs oficiais para `.sources/` (ou usa os que já estão lá);
2. localiza os marcadores de questão (`QUESTÃO 12.`, `12.`, `Questão 10.`) e delimita a região de cada uma;
3. separa tinta de texto: rasteriza a página, apaga as palavras e o que sobra é o desenho;
4. junta os pedaços do mesmo desenho (células de tabela, alternativas desenhadas A/B/C/D, traços soltos do scan);
5. cresce o recorte até a tinta visível, inclui cabeçalho de tabela (linha de índices) e evita cortar uma linha de texto pela metade;
6. grava `client/public/figures/<edital>-<questão>-<n>.webp` e escreve o campo `figures` de cada questão no `questions.json`.

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
sudo apt-get install -y tesseract-ocr tesseract-ocr-por   # só para as provas escaneadas
python scripts/extract_figures.py            # gera as figuras; PDFs em .sources/
python scripts/extract_figures.py --report   # relatório sem gravar
python scripts/validate_figures.py           # valida arquivos e metadados
python scripts/validate_data.py              # valida questões e gabaritos
```

Os nomes, URLs e arquivos esperados das fontes ficam em [`research/source_manifest.json`](research/source_manifest.json). Os PDFs não são versionados no Git; se uma fonte obrigatória estiver ausente, `extract_figures.py` termina com código de erro em vez de declarar sucesso incompleto. O pipeline usa a raiz do próprio clone, sem depender de `/home/ubuntu/provaquest`.

Ordem do pipeline: `prepare_data.py` (texto) → `format_questions.py` (blocos, alternativas, explicações) → `scripts/json_to_ts.py` (artefato TypeScript) → `extract_figures.py` (figuras). O `extract_figures.py` só acrescenta o campo `figures`, então pode ser rodado de novo a qualquer momento sem estragar o texto.

Para validar a aplicação JavaScript:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm check:format
pnpm test
pnpm test:coverage
pnpm build
pnpm validate:data
pnpm validate:figures
```

No app, as figuras aparecem dentro do card da questão (`FigureList` em `client/src/pages/Home.tsx`), com clique para abrir em tamanho real.

## Busca por questões em camadas

A busca não depende apenas do texto livre. Cada questão respondível recebe uma classificação reproduzível em três níveis: **assunto** (Algoritmos, Estruturas de dados, Complexidade ou Grafos), **tema** (por exemplo, Árvores, Hash e espalhamento, Heaps, Grafos, Ordenação, Busca, Recursão, Programação ou Estruturas lineares) e **subtema**. Os subtemas agora distinguem AVL e balanceamento, BST e percursos, Rubro-negra, Árvores B e B+, Árvores binárias e percursos, Dijkstra e caminho mínimo, Heap e fila de prioridades, Colisões e encadeamento, Endereçamento aberto, Pilhas (LIFO), Filas (FIFO), Listas encadeadas, Busca binária, Algoritmos de ordenação, Recursão e recorrências, Ponteiros e memória e Operações bit a bit. Ao escolher um nível, o próximo seletor é recalculado somente com as opções compatíveis.

O texto livre também aceita múltiplos termos, sem diferenciar maiúsculas ou acentos. Assim, `caminho minimo`, `Dijkstra`, `tabela hash`, `stack lifo` e `pilha` são encontrados por seus aliases. A taxonomia e os aliases ficam em `scripts/classify_topics.py`; para regenerar os campos `topic`, `subtopic` e `searchTerms` do JSON e do TypeScript, execute:

```bash
pnpm classify:data
```

## Prática e progresso local

A aba **Praticar** reúne a busca e a resolução na mesma tela: os filtros (edital, assunto, tema, subtema, texto livre e “somente salvas”) montam a lista à esquerda e a questão escolhida abre à direita, com o edital sempre visível no topo do card.

O estado fica no `localStorage` do navegador, então atualizar a página não apaga nada. Cada questão e cada simulado usam uma chave própria, para que duas abas abertas ao mesmo tempo não se sobrescrevam:

| Chave                                    | Conteúdo                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `provaquest-practice`                    | questão aberta na prática (`activeId`)                                     |
| `provaquest-practice-question:<id>`      | alternativa marcada e confirmação da questão `<id>` (`<edital>-<número>`)  |
| `provaquest-practice-filters`            | último filtro usado na prática                                             |
| `provaquest-simulation-edition:<edital>` | sessão do simulado daquele edital (questões, índice, respostas, conclusão) |
| `provaquest-simulation-edition`          | último edital de simulado aberto                                           |
| `provaquest-progress`                    | questões já respondidas, usadas no progresso geral                         |
| `provaquest-results`                     | acerto/erro por questão                                                    |
| `provaquest-bookmarks`                   | questões salvas                                                            |

Versões anteriores gravavam a prática inteira em `provaquest-practice` e todos os simulados em `provaquest-simulations` (ou `provaquest-simulation`). Esses formatos continuam sendo lidos uma vez e são migrados para as chaves por questão/edital na primeira abertura.

Na aba **Simulados**, cada edital tem seu próprio cartão, status e contagem de respostas. É possível continuar/refazer um edital, usar **Zerar** no cartão para apagar apenas aquele simulado ou **Zerar todos os simulados** para limpar todas as sessões sem afetar a prática nem os favoritos. O botão **Zerar progresso** da barra lateral limpa a prática e todos os simulados, mantendo favoritos. O progresso de um simulado não é somado ao progresso da prática. A aba atual é gravada em `?view=`, e cada sessão continua após F5.

As questões, gabaritos e resultados são baseados nos documentos oficiais publicados pelo PPGI/UFAM. As fontes pesquisadas e os links das páginas oficiais estão registrados em [`research/results_sources.md`](research/results_sources.md). A aplicação não deve ser interpretada como uma nova publicação oficial: em caso de divergência, confira sempre o documento da UFAM.

Na consulta nominal, uma pessoa é considerada como tendo avançado quando aparece no resultado oficial da etapa seguinte. A nota mostrada é a nota publicada no documento, sem recalcular ou inventar valores. Para a prova de conhecimentos, o painel destaca o corte mínimo de 7,00 usado na análise dos processos estudados.

## Dados oficiais

## Publicar no GitHub

1. Crie um repositório vazio no GitHub.
2. Na pasta do projeto, confira os arquivos antes de enviar:

   ```bash
   git status
   git add .
   git commit -m "Initial ProvaQuest PPGI"
   ```

3. Conecte o repositório e envie a branch principal:

   ```bash
   git remote add origin https://github.com/SEU_USUARIO/provaquest-ppgi.git
   git branch -M main
   git push -u origin main
   ```

Não envie `node_modules`, `dist`, arquivos `.env` ou logs locais. O `.gitignore` e o `.dockerignore` já excluem esses itens.

## Publicar a aplicação

Para serviços que aceitam Docker, use o `Dockerfile` deste repositório e configure:

- porta interna: `3000`;
- comando de inicialização: o `CMD` do Dockerfile;
- health check: `/api/health`;
- protocolo: HTTP.

Exemplos de plataformas compatíveis incluem Render, Railway, Fly.io, DigitalOcean App Platform e qualquer servidor próprio com Docker. A configuração específica de domínio, HTTPS e variáveis de ambiente pertence à plataforma escolhida.

## Licença

O `package.json` declara licença MIT. Antes de publicar os documentos oficiais, imagens e dados nominais em um repositório público, confira as políticas de distribuição do PPGI/UFAM e escolha conscientemente se o repositório será público ou privado.
