# Rotinas e expediente

Os horários fixos do dia e como o timer se encaixa neles.

- Uma **rotina** é uma atividade que se repete em horário fixo — "Hora do café", "Lanche da
  tarde". Existe independentemente dos pomodoros.
- O **expediente** é o intervalo em que o usuário trabalha (opcional).

Para o timer, os dois são **âncoras**: pontos fixos no relógio. A regra geral é que **o foco
mantém a duração configurada e quem se ajusta são as pausas e o último bloco antes de cada
âncora**.

Código: `src-tauri/src/routines/` (modelo, validação e cálculo dos horários),
`src-tauri/src/timer/engine.rs` (encaixe), `src/features/routines/` (tela).

## Modelo

### Rotina (tabela `routines`, ver [DATABASE.md](DATABASE.md))

| Campo             | Regra                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| `name`            | 1 a 60 caracteres, sem espaços nas pontas                                   |
| `startMinute`     | Minutos desde a meia-noite, no fuso local (0 a 1439)                        |
| `durationMinutes` | 1 a 240; a rotina termina no mesmo dia em que começa                        |
| `weekdays`        | Um bit por dia: 1 = segunda … 64 = domingo; 127 = todos os dias. Ao menos 1 |
| `enabled`         | Desligada, a rotina fica guardada mas não vale                              |

Duas rotinas **ligadas** não podem se cruzar em um mesmo dia (o timer só consegue estar em uma
por vez): o backend recusa com `validation` no campo `startMinute`, citando a outra. Encostar
uma na outra é permitido.

### Expediente (seção `workday` das configurações)

`{ enabled, startMinute, endMinute }`, com `startMinute < endMinute ≤ 1440`. Padrão: desligado,
das 09:00 às 18:00. Vale todos os dias.

## O horizonte

`routines::horizon(agora, rotinas, expediente, puladas)` é uma função pura que responde, para um
instante local:

| Campo               | Significado                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `routine`           | A rotina em andamento (do início, inclusive, ao fim, exclusive) e quanto falta                      |
| `anchor_in_ms`      | Tempo até a próxima âncora **de hoje**: o início de uma rotina ou, durante o expediente, o fim dele |
| `in_workday`        | Dentro do expediente — ou sem expediente configurado                                                |
| `next_change_in_ms` | Tempo até este resultado mudar (usado para o ticker saber quando acordar)                           |

O serviço do timer calcula o horizonte antes de **cada** operação e o entrega à engine
(`Engine::set_horizon`). A engine continua pura: não lê relógio nem banco.

O horário local vem do relógio UTC do timer mais a diferença de fuso do sistema
(`timer::clock::UtcOffset`, lida do sistema com a crate `chrono`, com horário de verão).

## Como o timer se encaixa

### Duração das sessões (`Engine::planned_for`)

Com uma âncora à frente, a duração da próxima sessão é decidida **ao iniciá-la**:

- **Foco:** nunca passa da âncora. Se não couber inteiro, é um **foco curto**, que termina
  exatamente na âncora.
- **Pausa:** se, depois dela, a sobra até a âncora não der um foco de pelo menos 10 minutos
  (`MIN_FOCUS_MS`), a pausa **absorve a sobra** e vai até a âncora. Se a âncora chegar antes do
  fim da pausa, a pausa é encurtada.
- Nenhuma sessão é planejada com menos de 1 minuto.

Exemplo, com ciclos de 25/5 e café às 10:15, começando às 09:00: foco 09:00–09:25, pausa
09:25–09:30, foco 09:30–09:55, pausa 09:55–10:00, **foco curto** 10:00–10:15, café.

O plano não é guardado: a cada troca de fase a conta é refeita a partir de "agora". Atrasos e
pausas manuais se corrigem sozinhos, e uma sessão em andamento nunca tem a duração alterada.

**Foco curto:** conta o tempo de foco nas estatísticas, mas **não soma um pomodoro concluído**
(coluna `pomodoro_sessions.short`; ver [ANALYTICS.md](ANALYTICS.md)). Avança a posição no ciclo
como qualquer foco. O estado do timer informa `short: true`.

### Quando uma rotina começa (`Engine::follow_routine`)

| Situação do timer                  | O que acontece                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| Foco rodando, faltam mais de 5 min | O foco é **pausado** (`pauseReason: 'routine'`) e **retomado sozinho** ao fim da rotina      |
| Foco rodando, faltam até 5 min     | O foco termina primeiro; a rotina faz as vezes da pausa e o foco seguinte começa ao fim dela |
| Pausa rodando                      | A pausa é encerrada (registrada como pulada); o foco seguinte começa ao fim da rotina        |
| Parado ou pausado pelo usuário     | Nada muda — nem durante, nem depois                                                          |

Durante a rotina o estado traz `routineId` e `routineRemainingMs`, e nada começa sozinho. A
rotina **não** é uma sessão: não gera linha em `pomodoro_sessions`.

Normalmente o foco anterior já foi dimensionado para terminar na âncora; os dois primeiros casos
só ocorrem se o usuário pausou no meio ou começou fora do plano.

### Pular a rotina

`routine_skip` (botão "Pular a rotina") dispensa a rotina em andamento **só hoje** e retoma o
que ela interrompeu. Iniciar o timer (`timer_start`) ou focar uma tarefa (`timer_focus_task`)
durante uma rotina faz o mesmo: o usuário decidiu trabalhar. Pausar durante uma rotina cancela
a retomada automática. Os pulos ficam só em memória e não sobrevivem a fechar o aplicativo.

### Expediente

- Dentro do expediente, o **fim dele é uma âncora**: o último foco termina junto com ele.
- Fora do expediente **nada começa sozinho** (o início automático de focos e pausas fica
  suspenso), mas o usuário pode iniciar o timer manualmente. As rotinas valem do mesmo jeito.

## Avisos

Ver [NOTIFICATIONS.md](NOTIFICATIONS.md). Uma vez por ocorrência, com o aplicativo aberto:
"<nome da rotina>" quando ela começa e "Expediente encerrado" quando o expediente acaba.

## Ticker

Com rotinas ou expediente configurados, o ticker do timer deixa de dormir indefinidamente
quando nada roda (`TimerService::next_wait`):

| Situação                           | Intervalo                                       |
| ---------------------------------- | ----------------------------------------------- |
| Sessão rodando                     | 250 ms (como antes)                             |
| Rotina em andamento, nada rodando  | 1 s (só a contagem dela muda)                   |
| Parado, com rotinas ou expediente  | Até o próximo horário relevante, no máximo 60 s |
| Parado, sem rotinas nem expediente | Indefinidamente, até um comando (como antes)    |

O teto de 60 s existe para não depender de um cálculo feito antes de o computador ser suspenso
ou de o relógio mudar.

## Contrato

Comandos em `src-tauri/src/commands/routines.rs`. Os que alteram devolvem a lista completa e
emitem `routines:changed` (sem payload).

| Comando                         | Devolve         | Efeito                                       |
| ------------------------------- | --------------- | -------------------------------------------- |
| `routines_list()`               | `Routine[]`     | As rotinas, na ordem em que acontecem no dia |
| `routine_create({ input })`     | `Routine[]`     | Cria                                         |
| `routine_update({ id, input })` | `Routine[]`     | Altera (inclusive ligar e desligar)          |
| `routine_delete({ id })`        | `Routine[]`     | Exclui                                       |
| `routine_skip()`                | `TimerSnapshot` | Pula a rotina em andamento, só hoje          |

```ts
interface Routine {
  id: number;
  name: string;
  startMinute: number;
  durationMinutes: number;
  weekdays: number; // bits: 1 = segunda … 64 = domingo
  enabled: boolean;
}
type RoutineInput = Omit<Routine, 'id'>;
```

Erros: `validation` com o campo (`name`, `startMinute`, `durationMinutes`, `weekdays`);
`notFound` para uma rotina que não existe mais. O expediente é gravado por `update_settings`
(`validation` no campo `workday.endMinute`).

## Interface

- **Tela Rotina** (`RoutinesPage`): expediente, uma faixa do dia com o expediente, as rotinas de
  hoje e a hora atual, e a lista de rotinas com criar, editar, ligar/desligar e excluir. Os
  campos de horário do expediente mantêm um rascunho local e só gravam ao sair do campo ou com
  Enter (gravar a cada tecla recusaria horários intermediários, como 01:00 ao digitar "17").
- **Pomodoro e notch:** durante uma rotina, o relógio mostra quanto falta para ela acabar, com o
  nome dela e "Pular a rotina"; fora dela, a próxima rotina de hoje e o rótulo "Foco curto"
  quando a sessão foi encurtada. Quando a rotina começa, o notch se abre por uns 3 s com o nome
  e a duração dela (ver [WINDOW_MANAGER.md](WINDOW_MANAGER.md#avisos-no-notch)).

O que a interface mostra sobre horários (próxima rotina, faixa do dia) é calculado no frontend,
só para exibição (`features/routines/schedule.ts`); o comportamento do timer é sempre do backend.

## Limitações

- A faixa do dia mostra o expediente e as rotinas, **não os pomodoros previstos**.
- O dashboard não relaciona o foco do dia com o que o expediente comporta.
- O expediente é o mesmo todos os dias; rotinas não atravessam a meia-noite.
- Rotinas de amanhã não são âncoras hoje: perto da meia-noite não há encaixe com a primeira
  rotina do dia seguinte.
- Os avisos só acontecem com o aplicativo aberto no momento.
- "Retomar o foco ao fim da rotina" fica só em memória: fechar o aplicativo durante uma rotina
  encerra o foco em espera como interrompido, como qualquer sessão em andamento.
- Verificado só por testes automatizados; o comportamento ao vivo (rotina começando com o
  aplicativo aberto, avisos, pulo) não foi exercitado no aplicativo real — ver
  [TESTING.md](TESTING.md).
