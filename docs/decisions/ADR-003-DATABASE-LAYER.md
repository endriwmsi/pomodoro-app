# ADR-003 — Camada de banco de dados

- **Status:** aceita
- **Data:** 2026-10-13

## Contexto

O aplicativo precisa de SQLite local com migrations versionadas, transações e queries
parametrizadas. Há um único usuário, um único processo e operações curtas (configurações,
sessões, tarefas). O requisito sugere SQLx "ou outra solução Rust com justificativa técnica".

## Decisão

- **`rusqlite` com a feature `bundled`** (SQLite compilado junto com o executável).
- **Uma conexão**, protegida por `Mutex`, registrada como estado do Tauri.
- **Migrations próprias**, controladas por `PRAGMA user_version` (cerca de 30 linhas em
  `src-tauri/src/database/migrations.rs`).
- Comandos Tauri que tocam o banco são `async`, para não rodarem na thread principal.

## Alternativas consideradas

| Alternativa                     | Por que não                                                                                                                                                                                                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLx                            | É assíncrono e voltado a pools e bancos em rede. Aqui traria um runtime e uma árvore de dependências maiores, e a verificação de queries em tempo de compilação exige um banco disponível no build (ou metadados versionados) — complexidade sem ganho para um arquivo local com um usuário. |
| `tauri-plugin-sql`              | Expõe SQL ao frontend, o que contraria a regra de que o React não acessa o banco.                                                                                                                                                                                                            |
| `rusqlite_migration` / refinery | Resolveriam o mesmo problema que as ~30 linhas próprias, ao custo de mais uma dependência.                                                                                                                                                                                                   |
| Pool de conexões (r2d2)         | Sem concorrência real que o justifique; com WAL, um pool pode ser adicionado depois sem mudar o esquema.                                                                                                                                                                                     |

## Consequências

- O build compila o SQLite em C (exige o compilador MSVC, já necessário para o Tauri) e a
  primeira compilação fica um pouco mais longa.
- Operações de banco são síncronas e seriais. Uma operação longa bloquearia as demais; se isso
  surgir (ex.: agregações do dashboard), avaliar uma segunda conexão somente leitura.
- A versão do SQLite é a mesma em todas as máquinas (inclui JSON e tabelas `STRICT`, usados no
  esquema).
- As queries não são verificadas em tempo de compilação: cada uma precisa de teste.
