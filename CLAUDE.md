# CLAUDE.md

As regras do projeto estão em @AGENTS.md — elas valem integralmente aqui. Este arquivo só
acrescenta o que é específico do Claude Code.

## Comandos

```bash
npm run check          # tudo: typecheck, eslint, prettier, vitest, rustfmt, clippy, cargo test
npm run tauri dev      # aplicativo desktop com hot reload
npm run tauri build -- --no-bundle   # executável de release, sem instalador
```

Os demais scripts e os pré-requisitos estão em `docs/DEVELOPMENT.md`.

## Particularidades do ambiente

- O shell padrão é PowerShell 5.1: sem `&&`; use `;` ou `if ($?) { ... }`.
- A primeira compilação do Rust leva alguns minutos. Rode `cargo`/`tauri build` em segundo
  plano e continue o trabalho enquanto isso.
- A porta 1420 é fixa (`vite.config.ts` e `tauri.conf.json`). Pare a pré-visualização
  `frontend` de `.claude/launch.json` antes de rodar `npm run tauri dev`.
- A pré-visualização no navegador serve para conferir layout. Controles de janela, comandos
  Tauri e eventos só funcionam dentro do aplicativo desktop (`isTauri()` é falso no navegador).
- Não rode `npm run tauri build` sem `--no-bundle` sem avisar: o empacotamento NSIS baixa
  ferramentas da internet (ver `docs/DEVELOPMENT.md`).

- O aplicativo fica na bandeja ao fechar a janela e só roda uma instância. Antes de
  `tauri build` ou de abrir o executável para testar, confira se não há `compasso.exe` rodando
  (`Get-Process compasso`) — pode ser uma instância que o usuário está usando; não a encerre
  sem necessidade.
- O usuário costuma mexer no aplicativo enquanto ele está aberto para teste: cliques e
  registros no banco que você não fez provavelmente são dele.

## Ao concluir uma etapa

Use o formato de relatório do item 9 do fluxo de trabalho em `AGENTS.md` e só marque itens no
`docs/ROADMAP.md` depois de verificar o critério de conclusão.
