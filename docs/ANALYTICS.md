# Estatísticas

Os números do dashboard são **sempre calculados a partir do que está gravado** — sessões
(`pomodoro_sessions`) e tarefas (`tasks`). Não existe contador em memória: o que aparece na tela
pode ser refeito a qualquer momento com uma consulta ao banco.

Código: `src-tauri/src/analytics/` (consultas), `src/lib/calendar.ts` (calendário local) e
`src/features/dashboard/` (interface).

## Definições

### Indicadores do dia

| Indicador                | Definição                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pomodoros concluídos** | Sessões de **foco** com desfecho `completed`, sem contar os focos curtos (`short`), que **terminaram** hoje                                      |
| **Tempo de foco**        | Soma do **tempo efetivo** (`elapsed_ms`) de **todas** as sessões de foco que terminaram hoje — concluídas, puladas, reiniciadas ou interrompidas |
| **Tarefas concluídas**   | Tarefas cuja data de conclusão (`completed_at_ms`) cai hoje                                                                                      |
| **Tarefas em andamento** | Tarefas na coluna "Em andamento" **agora** (não depende do dia)                                                                                  |

Consequências dessas definições:

- **Planejado × efetivo.** O tempo de foco usa o tempo realmente decorrido com o timer rodando
  (pausas dentro da sessão não contam), nunca a duração planejada. Um foco de 25 min pulado aos
  10 min soma 10 min de foco e zero pomodoros.
- **Sessões incompletas** contam para o tempo de foco, mas não para os pomodoros.
- **Sessão em andamento** não entra em nenhum número até terminar (o tempo dela só é definitivo
  ao encerrar).
- **Pausas** (curtas e longas) não entram em nenhum indicador.
- Uma tarefa **reaberta** deixa de contar como concluída; se for concluída de novo, conta no dia
  da nova conclusão.
- Excluir uma tarefa não altera pomodoros nem tempo de foco: as sessões são preservadas.

### Gráfico semanal

Pomodoros concluídos por dia, de **segunda-feira a domingo**, com a mesma definição do indicador
diário. Abaixo do gráfico aparecem o total de pomodoros e o tempo de foco da semana exibida.
Pode-se navegar para semanas anteriores; a semana atual é o limite ("próxima" fica
desabilitada). Os indicadores do dia continuam se referindo a **hoje**, qualquer que seja a
semana exibida.

### Meta diária

Opcional (`goals.dailyPomodoros`, 1–50; ausente por padrão), definida em
**Configurações → Meta diária**. Com meta, o indicador mostra `concluídos/meta` e uma barra de
progresso, que para em 100 % quando a meta é superada (o número continua crescendo).

### Calendário

O painel **Calendário** do dashboard mostra o mês, de segunda a domingo, com o dia de hoje
destacado e até três marcadores por dia:

| Marcador             | Cor                       | Significado                                        | Origem                                   |
| -------------------- | ------------------------- | -------------------------------------------------- | ---------------------------------------- |
| **Foco concluído**   | destaque do template      | Houve ao menos um pomodoro concluído no dia        | `completedPomodoros` do período          |
| **Tarefa concluída** | `--color-priority-low`    | Ao menos uma tarefa foi concluída no dia           | `tasksCompleted` do período              |
| **Prazo de tarefa**  | `--color-priority-medium` | Ao menos uma tarefa **aberta** tem prazo nesse dia | `dueDate` das tarefas (store de tarefas) |

Cada dia tem um nome acessível com as quantidades ("13 de outubro (hoje), 2 pomodoros
concluídos, 1 prazo"), e a legenda fica abaixo do calendário — a cor não é o único sinal.
Pode-se navegar para meses anteriores e seguintes (meses futuros só podem ter prazos).

Os dois primeiros marcadores vêm do comando `analytics_periods`, chamado com uma meia-noite
local por dia do mês (ver o contrato abaixo). O prazo é uma data local sem hora, comparada
diretamente com o dia do calendário; concluir a tarefa remove o marcador de prazo.

## Dias, semanas e fuso horário

- **Fuso:** o do computador do usuário, no momento da consulta.
- **Dia:** da meia-noite local (inclusive) à meia-noite local seguinte (exclusive).
- **Semana:** sete dias a partir da segunda-feira, 00:00 local.

O backend não lida com fusos. A interface calcula os limites com `new Date(ano, mês, dia)` —
que devolve a meia-noite local mesmo em dias de 23 ou 25 horas (horário de verão) — e os envia
como instantes em milissegundos UTC. O backend apenas conta o que cai em cada intervalo
`[início, fim)`.

**A que dia pertence uma sessão:** ao dia em que ela **terminou** (`ended_at_ms`). Uma sessão
que atravessa a meia-noite é contada inteira no dia do término — pomodoro e tempo —, sem
divisão proporcional.

Mudar o fuso do computador muda o agrupamento de dias de todo o histórico, porque os registros
guardam instantes absolutos e os limites são sempre recalculados no fuso atual.

## Contrato

Comando `analytics_dashboard` (`src-tauri/src/commands/analytics.rs`):

```ts
analyticsDashboard(
  todayStartMs: number,      // meia-noite local de hoje
  todayEndMs: number,        // meia-noite local de amanhã
  weekBoundariesMs: number[] // as 8 meias-noites que delimitam a semana pedida
): Promise<Dashboard>

interface Dashboard {
  today: {
    completedPomodoros: number;
    focusMs: number;
    tasksCompleted: number;
    tasksInProgress: number;
  };
  week: PeriodStats[];
}

interface PeriodStats {
  startMs: number;
  endMs: number;
  completedPomodoros: number;
  focusMs: number;
  tasksCompleted: number; // tarefas concluídas no período
}

// Um total para cada par de limites consecutivos (de 2 a 64 limites).
analyticsPeriods(boundariesMs: number[]): Promise<PeriodStats[]>
```

Erros: `validation` se `todayStartMs >= todayEndMs` (campo `todayStartMs`) ou se os limites da
semana não forem de 2 a 64 valores em ordem estritamente crescente (campo `weekBoundariesMs`);
`database`.

`analytics::periods` é genérico — um total para cada par de limites consecutivos. O calendário
o usa com os dias de um mês (até 32 limites).

A migration `0004` criou índices para essas consultas (`ended_at_ms` das sessões e
`completed_at_ms` das tarefas).

## Atualização na tela

`DashboardPage` refaz a consulta quando:

- a tela é aberta ou a semana exibida muda;
- o quadro muda (`tasks:changed`, emitido também ao concluir um foco);
- o timer muda de situação ou de fase (um foco pulado ou reiniciado altera o tempo de foco);
- o dia vira (um temporizador até a próxima meia-noite local).

Não há atualização periódica: com um foco rodando, os números só mudam quando ele termina.

## Apresentação

- Template Vidro: barras; template Matriz: colunas de pontos (`DotColumns`). O dia de hoje fica
  na cor de destaque.
- A escala do gráfico vai de zero ao maior valor da semana, com mínimo de 4 (Vidro) ou 8 pontos
  (Matriz), para que uma ou duas sessões não pareçam uma semana cheia.
- O gráfico tem `role="img"` com uma descrição que lista o valor de cada dia; nada depende só
  do desenho ou da cor.
- Tempo de foco: `25m`, `1h 05m`, arredondado para o minuto mais próximo.

## Limitações

- Não há estatísticas por tarefa além da contagem de pomodoros no cartão, nem médias,
  sequências ou comparações entre semanas.
- Não há exportação dos dados.
- Na pré-visualização do navegador (fora do aplicativo) os indicadores ficam sem valor.

## Focos curtos

Um foco encurtado para caber antes de uma rotina ou do fim do expediente
(`pomodoro_sessions.short = 1`, ver [ROUTINES.md](ROUTINES.md)) entra no **tempo de foco**, mas
não em **pomodoros concluídos** — nem no dashboard, nem na contagem por tarefa do Kanban.
