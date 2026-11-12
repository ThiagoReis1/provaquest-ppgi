# ProvaQuest PPGI

Aplicação web interativa para estudar as provas do processo seletivo do PPGI/UFAM.

O projeto reúne:

- treino individual por questão, com gabarito e resolução passo a passo;
- simulados por edital usando somente questões válidas;
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
client/src/pages/Home.tsx       interface, treino, simulados e consulta nominal
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
pip install pymupdf numpy scipy pillow
sudo apt-get install -y tesseract-ocr tesseract-ocr-por   # só para as provas escaneadas
python scripts/extract_figures.py            # gera as figuras
python scripts/extract_figures.py --report   # só mostra o que seria gerado
```

Ordem do pipeline: `prepare_data.py` (texto) → `format_questions.py` (blocos, alternativas, explicações) → `extract_figures.py` (figuras). O `extract_figures.py` só acrescenta o campo `figures`, então pode ser rodado de novo a qualquer momento sem estragar o texto.

No app, as figuras aparecem dentro do card da questão (`FigureList` em `client/src/pages/Home.tsx`), com clique para abrir em tamanho real.

## Dados oficiais

As questões, gabaritos e resultados são baseados nos documentos oficiais publicados pelo PPGI/UFAM. As fontes pesquisadas e os links das páginas oficiais estão registrados em [`research/results_sources.md`](research/results_sources.md). A aplicação não deve ser interpretada como uma nova publicação oficial: em caso de divergência, confira sempre o documento da UFAM.

Na consulta nominal, uma pessoa é considerada como tendo avançado quando aparece no resultado oficial da etapa seguinte. A nota mostrada é a nota publicada no documento, sem recalcular ou inventar valores. Para a prova de conhecimentos, o painel destaca o corte mínimo de 7,00 usado na análise dos processos estudados.

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
