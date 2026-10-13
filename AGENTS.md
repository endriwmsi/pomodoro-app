# AGENTS.md

Instruções permanentes para qualquer agente de programação (ou pessoa) que altere este
repositório. Leia este arquivo no início de cada sessão.

## O produto

**Compasso** é um aplicativo desktop para Windows, local e offline, que combina Pomodoro
configurável, Kanban, dashboard de produtividade e um notch retrátil na borda superior do
monitor principal. Não há conta nem servidor, e tudo funciona sem internet — com uma única
exceção opcional e desligada por padrão: a previsão do tempo do notch (ver
`docs/decisions/ADR-004-NETWORK-FEATURES.md`).

Prioridade de toda decisão técnica, nesta ordem:

1. Confiabilidade.
2. Baixo consumo de recursos.
3. Simplicidade arquitetural.
4. Experiência de usuário.
5. Facilidade de manutenção e evolução.

## Onde está cada informação

Cada assunto tem uma única fonte de verdade. Não duplique conteúdo; referencie.

| Assunto                                            | Fonte de verdade                                   |
| -------------------------------------------------- | -------------------------------------------------- |
| Progresso real, fases, pendências                  | [docs/ROADMAP.md](docs/ROADMAP.md)                 |
| Módulos, limites, comandos e eventos Tauri         | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)       |
| Ambiente, comandos, build                          | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)         |
| Janelas (principal sem moldura, notch, bandeja)    | [docs/WINDOW_MANAGER.md](docs/WINDOW_MANAGER.md)   |
| Banco, migrations, regras das configurações        | [docs/DATABASE.md](docs/DATABASE.md)               |
| Timer: estados, tempo, sessões, recuperação        | [docs/TIMER_ENGINE.md](docs/TIMER_ENGINE.md)       |
| Estatísticas: definições das métricas e calendário | [docs/ANALYTICS.md](docs/ANALYTICS.md)             |
| Kanban: tarefas, ordem, vínculo com o timer        | [docs/KANBAN.md](docs/KANBAN.md)                   |
| Aba de clima: provedor, dados enviados, frequência | [docs/WEATHER.md](docs/WEATHER.md)                 |
| Aba de música: sessão de mídia e volume            | [docs/MEDIA.md](docs/MEDIA.md)                     |
| Som e notificações                                 | [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md)     |
| Templates de estilização                           | [docs/THEMING.md](docs/THEMING.md)                 |
| Estratégia e comandos de teste                     | [docs/TESTING.md](docs/TESTING.md)                 |
| Problemas conhecidos e soluções verificadas        | [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |
| Decisões arquiteturais                             | [docs/decisions/](docs/decisions/)                 |
| Histórico de mudanças                              | [CHANGELOG.md](CHANGELOG.md)                       |
| Índice dos documentos (inclusive os planejados)    | [docs/README.md](docs/README.md)                   |

Um módulo novo ganha seu documento junto com o código. Não crie documentos vazios.

## Regras arquiteturais

- **Rust é a autoridade** sobre regras de negócio críticas e sobre o estado do timer. O React
  apenas exibe e envia intenções.
- **O frontend nunca acessa o SQLite.** Toda comunicação passa por comandos e eventos Tauri
  documentados em `docs/ARCHITECTURE.md`.
- **Um único estado do timer.** Janela principal, notch e bandeja leem o mesmo estado emitido
  pelo backend; nenhum deles mantém contagem própria. Nada de `setInterval` decrementando tempo
  no React.
- Acesso a banco isolado em uma camada própria; queries sempre parametrizadas; transações para
  operações relacionadas.
- Entradas validadas no backend Rust, mesmo que o frontend também valide.
- Capabilities do Tauri com o menor conjunto de permissões possível
  (`src-tauri/capabilities/`). Cada permissão nova precisa de um consumidor real.
- Nada de Electron, Docker, servidor HTTP local, autenticação ou serviços externos sem
  necessidade aprovada e registrada em um ADR.
- **Rede:** só `src-tauri/src/weather/` faz requisições, e apenas com `weather.enabled`. Uma
  nova função de rede exige revisar o ADR-004. O WebView nunca acessa a rede (a CSP não tem
  destinos externos).
- **`unsafe`:** só para chamar APIs do Windows, em blocos mínimos e com comentário `SAFETY`.
- Dependência nova só após avaliar necessidade, tamanho, manutenção e compatibilidade; registre
  o motivo no changelog ou em um ADR.
- Organização por funcionalidade (`src/features/*`, módulos de domínio em `src-tauri/src/*`).
  Evite arquivos gigantes e abstrações sem consumidor.

## Convenções

- Identificadores de código em inglês; textos de interface e documentação em português (pt-BR).
- TypeScript estrito (`tsconfig.json`), sem `any` e sem `eval`.
- Structs Rust expostas ao frontend usam `#[serde(rename_all = "camelCase")]` e têm um tipo
  espelhado em `src/lib/commands.ts`.
- Handlers em `src-tauri/src/commands/` são finos: validam, delegam ao módulo de domínio,
  convertem o resultado.
- O dashboard e as estatísticas nunca exibem números sem origem em dados persistidos.
- Cores, fontes e raios vêm dos tokens do template (`bg-panel`, `text-ink-muted`, `bg-accent`…),
  não de valores fixos, para que todo template funcione — ver `docs/THEMING.md`.
- Mudanças de esquema entram como migration nova; migrations publicadas nunca são editadas.

## Documentação é parte da mudança

Toda alteração relevante de código vem acompanhada, na mesma alteração, da documentação
correspondente.

1. Antes de modificar uma funcionalidade existente, consulte a documentação do módulo e
   identifique suas dependências.
2. Antes de implementar uma funcionalidade nova, determine quais documentos descreverão seu
   comportamento e suas integrações.
3. Sempre que um comando Rust, evento Tauri, estrutura de dados, estado, regra de negócio,
   tabela, migration, configuração ou contrato entre módulos mudar, atualize os documentos
   afetados.
4. Ao alterar uma função usada por outros módulos, identifique os consumidores e verifique se a
   mudança afeta seus contratos ou comportamentos.
5. Documente decisões não óbvias, limitações conhecidas, premissas, efeitos colaterais e os
   motivos das escolhas técnicas.
6. Mantenha exemplos de código, nomes de comandos, caminhos, configurações e instruções de
   execução consistentes com a implementação real.
7. Não documente como concluído algo que ainda não foi implementado ou testado.
8. Não marque uma etapa como concluída se seus critérios de aceitação não tiverem sido
   verificados.
9. Atualize o `docs/ROADMAP.md` conforme o progresso real, sem apagar pendências importantes.
10. Registre no `CHANGELOG.md` as mudanças relevantes para desenvolvedores ou usuários.
11. Se uma funcionalidade for removida, atualize ou remova sua documentação, referências,
    exemplos e testes relacionados.
12. Não mantenha documentação duplicada com conteúdos contraditórios. Cada assunto tem uma
    fonte de verdade (tabela acima).
13. Ao final de cada etapa, revise a documentação em busca de informações desatualizadas,
    incompletas ou incompatíveis com o código.
14. Se uma mudança não exigir alteração documental, isso deve ser uma decisão consciente, não
    uma omissão automática.

## Fluxo de trabalho obrigatório

No início da sessão: leia este arquivo, o `README.md`, o `docs/ROADMAP.md` e os documentos do
módulo em que vai trabalhar; inspecione o código e verifique se há alterações anteriores a
preservar (`git status`).

Para cada tarefa:

1. Inspecionar o código e a documentação existentes.
2. Identificar os módulos afetados e os contratos existentes.
3. Definir a implementação e os testes necessários.
4. Implementar a alteração (pequena e verificável).
5. Executar testes, verificações estáticas e builds pertinentes — `npm run check` cobre tudo.
6. Atualizar a documentação e o changelog.
7. Verificar regressões e a consistência entre código, testes e documentação.
8. Atualizar o roadmap quando o progresso mudar.
9. Relatar: resumo, arquivos alterados, documentação, testes executados (com resultados
   reais), pendências e próxima etapa.

Regras de conduta:

- Não declare que um teste passou sem executá-lo. Se uma verificação não puder ser executada,
  diga isso explicitamente.
- Não substitua implementações reais por mocks para declarar algo concluído.
- Não reescreva módulos estáveis nem remova código ou funcionalidades silenciosamente.
- Diante de ambiguidade pequena e reversível, escolha a solução simples, documente a premissa
  e siga. Peça esclarecimento quando a decisão afetar significativamente arquitetura,
  segurança, persistência dos dados ou comportamento esperado.
- Não execute operações destrutivas sobre arquivos, dados locais ou configurações sem
  necessidade e cautela.
- Desenvolva em fases (ver roadmap). Não implemente várias fases em uma única alteração.
