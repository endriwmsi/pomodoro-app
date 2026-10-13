# Documentação

Índice dos documentos do projeto. As regras de manutenção estão em [AGENTS.md](../AGENTS.md).

## Existentes

| Documento                                        | Conteúdo                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)               | Módulos, limites, comandos e eventos Tauri, segurança                   |
| [ROADMAP.md](ROADMAP.md)                         | Fases, progresso real, pendências e riscos                              |
| [DEVELOPMENT.md](DEVELOPMENT.md)                 | Ambiente, scripts, build                                                |
| [WINDOW_MANAGER.md](WINDOW_MANAGER.md)           | Janela principal sem moldura; requisitos do notch e bandeja             |
| [TESTING.md](TESTING.md)                         | Estratégia, comandos e roteiros manuais                                 |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md)         | Problemas encontrados e soluções verificadas                            |
| [TIMER_ENGINE.md](TIMER_ENGINE.md)               | Estados, transições, tempo, persistência, comandos e evento do timer    |
| [ADR-001](decisions/ADR-001-TECH-STACK.md)       | Stack tecnológica                                                       |
| [DATABASE.md](DATABASE.md)                       | Local do banco, migrations, esquema, regras das configurações           |
| [THEMING.md](THEMING.md)                         | Templates de estilização e como acrescentar um                          |
| [ANALYTICS.md](ANALYTICS.md)                     | Definição das métricas, dias e semanas, fuso, contrato das estatísticas |
| [KANBAN.md](KANBAN.md)                           | Tarefas: modelo, movimentação e ordem, vínculo com o timer, interface   |
| [WEATHER.md](WEATHER.md)                         | Aba de clima: configurações, provedor, dados enviados, frequência       |
| [MEDIA.md](MEDIA.md)                             | Aba de música: sessão de mídia do Windows, volume, contrato             |
| [NOTIFICATIONS.md](NOTIFICATIONS.md)             | Som e notificação ao concluir uma sessão; regra de "exatamente uma vez" |
| [ADR-002](decisions/ADR-002-TIMER-ENGINE.md)     | Diretrizes da engine do timer                                           |
| [ADR-004](decisions/ADR-004-NETWORK-FEATURES.md) | Exceção de rede (clima) e APIs nativas do Windows                       |
| [ADR-003](decisions/ADR-003-DATABASE-LAYER.md)   | rusqlite, conexão única, migrations próprias                            |

Não há documentos de módulo pendentes: todos os módulos previstos estão documentados.
