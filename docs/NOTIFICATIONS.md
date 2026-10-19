# Notificações e sons

Avisos disparados quando uma sessão do timer chega ao fim. Código em
`src-tauri/src/notifications/`.

## O que acontece ao concluir uma sessão

A sequência, a partir do instante em que o tempo ativo atinge a duração planejada:

1. a engine encerra a sessão como concluída e passa à fase seguinte (iniciando-a, se o início
   automático estiver ligado) — ver [TIMER_ENGINE.md](TIMER_ENGINE.md);
2. sessão, novo estado e posição no ciclo são gravados **em uma transação**;
3. as janelas recebem `timer:state`;
4. `Notifier::session_completed(fase concluída, estado seguinte)` é chamado → `Alerts`:
   - toca o som, se `alerts.soundEnabled`;
   - mostra a notificação do Windows, se `alerts.notificationsEnabled`;
5. o notch recebe `notch:notice` com o mesmo título e texto e, se `notch.notices` estiver ligado,
   abre por 3 s mostrando o aviso — ver
   [WINDOW_MANAGER.md](WINDOW_MANAGER.md#aviso-de-fim-de-sessão).

As estatísticas não precisam de passo próprio: serão calculadas das sessões gravadas (Fase 7).

### Exatamente uma vez

`session_completed` é chamado por `TimerService::apply` para cada efeito
`Finished { outcome: Completed }` **depois** de a transação ser confirmada:

- o efeito é produzido uma única vez pela engine (a transição acontece sob o lock do serviço;
  ticks seguintes não encontram mais a sessão);
- se a gravação falhar, a cópia da engine é descartada com o efeito e ninguém é avisado — a
  conclusão será tentada de novo no tick seguinte, e só então avisada;
- sessões **puladas, reiniciadas ou interrompidas não geram aviso**.

Há testes para os três pontos em `src-tauri/src/timer/mod.rs`.

### Falhas não afetam o timer

Os avisos acontecem depois de o estado estar gravado e são "melhor esforço":

- o som é tocado de forma assíncrona; se o sistema recusar (sem dispositivo de áudio, por
  exemplo), registra-se em `stderr` e segue-se em frente;
- a notificação é mostrada em uma thread separada, para que a thread do ticker não espere pelo
  sistema; um erro é apenas registrado;
- se as preferências não puderem ser lidas do banco, usam-se os padrões (ambos ligados).

## Rotinas e expediente

Com o aplicativo aberto no momento, e respeitando as mesmas preferências de som e notificação:

| Quando             | Som               | Notificação                                                            |
| ------------------ | ----------------- | ---------------------------------------------------------------------- |
| Uma rotina começa  | o do fim de foco  | Título: o nome da rotina. Texto: a duração e que o timer volta ao foco |
| O expediente acaba | o do fim de pausa | "Expediente encerrado"                                                 |

Cada aviso acontece uma vez por ocorrência (`Notifier::routine_started` e
`Notifier::workday_ended`, chamados pelo serviço do timer na passagem). Ver
[ROUTINES.md](ROUTINES.md).

## Som

`notifications/sound.rs`. **Não há arquivos de áudio**: os dois sons são sintetizados em
memória na primeira vez em que tocam (WAV PCM mono, 16 bits, 22 050 Hz) — senoides com ataque
curto e decaimento exponencial, como um sino suave.

| Som        | Quando           | Notas                                   |
| ---------- | ---------------- | --------------------------------------- |
| `FocusEnd` | fim de um foco   | três notas ascendentes (Mi5, Sol5, Dó6) |
| `BreakEnd` | fim de uma pausa | duas notas descendentes (Sol5, Ré5)     |

A reprodução usa `PlaySoundW` (API do Windows, via `windows-sys`) com
`SND_MEMORY | SND_ASYNC | SND_NODEFAULT`, em um bloco `unsafe`; o ponteiro
passado aponta para um buffer `'static` (`OnceLock`), que permanece válido enquanto o som toca.

O volume segue o volume do sistema; não há controle próprio.

## Notificação do Windows

Plugin oficial `tauri-plugin-notification`, usado apenas a partir do Rust (nenhuma permissão é
concedida ao frontend).

Texto, definido por `completion_message` (função pura, testada):

| Sessão concluída | Título            | Texto                                                          |
| ---------------- | ----------------- | -------------------------------------------------------------- |
| Foco             | `Foco concluído`  | `Hora de uma pausa curta (5 min).` ou `…pausa longa (15 min).` |
| Pausa            | `Pausa encerrada` | `Hora de voltar ao foco (25 min).`                             |

Se a fase seguinte já começou sozinha, o texto termina com `— já começou.`.

Há mais uma notificação, sem relação com o timer: na primeira vez, **por execução**, em que a
janela principal é fechada, avisa que o aplicativo continua na bandeja
(`Alerts::window_hidden_to_tray`). Só é mostrada se as notificações estiverem ligadas.

### Limitações

- Em desenvolvimento e no executável sem instalador, o Windows pode atribuir a notificação a
  outro aplicativo (por exemplo, "Windows PowerShell"), porque o Compasso não está registrado
  no sistema. Com o instalador (Fase 8) ela deve aparecer com o nome e o ícone do aplicativo —
  a conferir.
- O modo "Não perturbe" / assistente de foco do Windows pode suprimir a notificação. O som
  toca mesmo assim.
- Clicar na notificação não faz nada (não abre o aplicativo).

## Configurações

Seção `alerts` (ver [DATABASE.md](DATABASE.md)):

| Campo                         | Padrão | Efeito                            |
| ----------------------------- | ------ | --------------------------------- |
| `alerts.soundEnabled`         | `true` | Toca o som ao concluir uma sessão |
| `alerts.notificationsEnabled` | `true` | Mostra a notificação do Windows   |

As preferências são lidas do banco no momento do aviso, então uma mudança vale imediatamente.

Em **Configurações → Avisos**, o botão **Testar aviso** chama o comando `preview_alerts`, que
toca o som de fim de foco e mostra uma notificação de exemplo, respeitando as duas opções.

## Verificação

Som e notificação não têm como ser conferidos por teste automatizado; o roteiro manual está em
[TESTING.md](TESTING.md). Os testes cobrem: o formato e a amplitude do áudio sintetizado, o
texto das notificações e a regra de "exatamente uma vez".
