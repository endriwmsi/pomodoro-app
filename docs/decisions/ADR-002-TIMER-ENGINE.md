# ADR-002 — Engine do timer

- **Status:** aceita e implementada na Fase 3 (2026-10-13)
- **Data:** 2026-10-13

Este ADR fixa as decisões de projeto da engine. A implementação — estados, transições,
comandos, evento e persistência — está descrita em [TIMER_ENGINE.md](../TIMER_ENGINE.md). As
escolhas feitas ao implementar estão na seção "Resolução na implementação", ao final.

## Contexto

O timer precisa continuar correto com a janela minimizada, com a interface atrasada, após
suspensão do computador, após mudança do relógio do sistema e após um encerramento inesperado.
Janela principal, notch e bandeja mostram o mesmo timer.

## Decisões

1. **O estado autoritativo vive no Rust.** O frontend não conta tempo: recebe snapshots por
   evento e os solicita por comando ao montar. Um `setInterval` na interface pode existir
   apenas para redesenhar, sempre recalculando a partir do último snapshot.

2. **Tipo de sessão e estado de execução são dimensões separadas.** Uma sessão de foco pausada
   continua sendo uma sessão de foco:
   - fase: `Focus | ShortBreak | LongBreak`;
   - execução: `Idle | Running | Paused`.

   `Idle` e `Paused` do requisito são valores de execução, não tipos de sessão.

3. **Tempo restante é derivado, não decrementado.** Guarda-se a duração planejada e o tempo
   ativo acumulado; enquanto roda, soma-se o intervalo desde a última retomada. Nenhum contador
   é decrementado por tick.

4. **Dois relógios com papéis distintos**, atrás de um trait `Clock` injetável:
   - _monotônico_ (`Instant`) para medir tempo decorrido dentro do processo — imune a ajustes
     do relógio do sistema;
   - _calendário_ (UTC) apenas para carimbar início/fim das sessões e para recuperação entre
     execuções do processo, onde o monotônico não sobrevive.

   Os testes usam um relógio falso; nenhum teste espera minutos reais.

5. **Suspensão do computador:** a documentação do Rust não garante se `Instant` avança ou não
   durante a suspensão, então a engine não presume nenhum dos dois. Ela detecta a suspensão
   (lacuna grande entre ticks consecutivos e/ou divergência entre o avanço monotônico e o de
   calendário) e trata o intervalo como tempo não trabalhado, em vez de concluir a sessão
   silenciosamente. O comportamento real no Windows será medido, e a regra exata (pausar
   automaticamente × descontar) definida e testada, na Fase 3.

6. **Conclusão idempotente.** Cada sessão tem um ID estável gerado no início. A transição para
   "concluída" acontece uma única vez, sob o mesmo lock que altera o estado, e os efeitos
   (gravar, notificar, tocar som, emitir evento) são disparados a partir dessa transição — não
   de ticks nem de pedidos da interface.

7. **Persistência para recuperação.** A sessão em andamento é gravada ao iniciar, pausar e
   retomar. Ao abrir o aplicativo com uma sessão não finalizada, ela **não** é contada como
   concluída: é encerrada como interrompida, com o tempo efetivo até o último registro
   confiável.

8. **Pomodoro concluído** = sessão de foco cujo tempo ativo atingiu a duração planejada.
   Sessões puladas, reiniciadas ou interrompidas são registradas com seu estado final, mas não
   contam como concluídas.

## Alternativas descartadas

- _Contador decremental no React:_ para com a aba em segundo plano e não sobrevive ao
  fechamento da janela.
- _Apenas relógio de calendário:_ um ajuste de horário ou de fuso alteraria o tempo restante.
- _Apenas relógio monotônico:_ não permite recuperar uma sessão após reiniciar o processo.

## Consequências

- O esquema da Fase 2 precisa de: ID da sessão, tipo, duração planejada, tempo efetivo, início,
  fim, estado final, motivo do encerramento e tarefa associada opcional.
- A engine precisa de um agendador próprio no backend (tarefa assíncrona ou thread) para
  detectar a conclusão sem depender de janelas abertas.

## Resolução na implementação (2026-10-13)

- **Nomes:** a dimensão de execução chama-se `Status` (`idle`, `running`, `paused`).
- **Item 5 (suspensão):** escolhida a pausa automática. Um salto maior que 30 s em qualquer dos
  relógios, entre duas leituras, descarta o intervalo e pausa a sessão. O comportamento real de
  `Instant` no Windows continua não medido — a regra não depende dele.
- **Item 7 (recuperação):** além da recuperação na abertura, o encerramento ordenado do
  aplicativo grava a sessão como interrompida com o tempo exato. Checkpoints a cada 10 s de
  tempo ativo limitam a perda em caso de queda.
- **Item 8:** o estado final e o motivo do encerramento são um único campo (`status`).
- **Agendador:** uma thread dedicada, bloqueada quando o timer não está rodando.
- **IDs de sessão:** inteiros gerados pelo SQLite (`AUTOINCREMENT`) no momento em que a sessão
  começa, em vez de UUIDs — estáveis e sem dependência adicional.
- **Posição no ciclo:** focos pulados também avançam a rotação até a pausa longa, embora não
  contem como concluídos.
