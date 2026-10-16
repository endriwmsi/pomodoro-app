# Atualização do aplicativo

Como o Compasso se atualiza sozinho ao abrir. Código em `src-tauri/src/updater/`; comandos em
`src-tauri/src/commands/updater.rs`; interface em
`src/features/settings/UpdatesSection.tsx`. A decisão de rede está no
[ADR-004](decisions/ADR-004-NETWORK-FEATURES.md); como publicar uma versão, em
[RELEASING.md](RELEASING.md).

## Por que não é preciso certificado

A atualização usa o `tauri-plugin-updater`, que confere a **assinatura minisign** do pacote
contra uma chave pública gravada no aplicativo (`tauri.conf.json` → `plugins.updater.pubkey`).
Essa chave é gratuita, gerada com `tauri signer generate`, e **não tem relação** com o
certificado de assinatura de código do Windows (Authenticode), que é pago e só serviria para
silenciar o aviso do SmartScreen. Sem a chave privada, ninguém consegue publicar uma
atualização que o aplicativo aceite — nem com acesso à conta do GitHub, a menos que também
roube o secret.

## Fluxo

1. `npm run release` (ver [RELEASING.md](RELEASING.md)) cria a tag; o workflow **Release**
   compila, assina cada pacote (`TAURI_SIGNING_PRIVATE_KEY`) e anexa à Release do GitHub os
   instaladores, os arquivos `.sig` e o `latest.json`.
2. O aplicativo consulta
   `https://github.com/endriwmsi/pomodoro-app/releases/latest/download/latest.json` — uma
   requisição `GET` simples, sem enviar dados do usuário (o plugin acrescenta só o sistema, a
   arquitetura e a versão atual à própria consulta).
3. Se `latest.json` traz uma versão maior que a instalada, o plugin baixa o pacote do sistema,
   confere a assinatura e só então executa o instalador. No Windows o instalador NSIS roda no
   modo `passive` (barra de progresso, sem perguntas), substitui o aplicativo e o abre de novo.
4. Os dados do usuário ficam fora da pasta de instalação e não são tocados; as migrations
   pendentes rodam na abertura seguinte, como em qualquer atualização.

## Quando consulta

| Situação                                                              | Consulta?                         |
| --------------------------------------------------------------------- | --------------------------------- |
| Abrir o aplicativo, `updates.autoUpdate` ligado, build de **release** | Sim, uma vez, 8 s depois de abrir |
| Abrir o aplicativo, `updates.autoUpdate` desligado                    | Não                               |
| Build de desenvolvimento (`npm run tauri dev`)                        | Nunca automaticamente             |
| Botão **Verificar agora** em Configurações → Atualizações             | Sim, sempre                       |

Não há consulta periódica: o aplicativo roda por dias na bandeja, e a atualização espera a
próxima abertura (ou o botão).

## O timer e a instalação

No Windows o plugin encerra o processo com `exit(0)` ao iniciar o instalador, **sem** passar
por `RunEvent::Exit`. Por isso, antes de instalar, o backend chama `TimerService::shutdown()`
(a sessão fica registrada como interrompida, com o tempo exato) e **recusa instalar com o timer
em andamento ou pausado**: o erro `validation` (campo `update`) pede para concluir ou reiniciar
o timer. Na consulta automática isso significa apenas "não instala agora"; a atualização fica
guardada em memória e aparece em Configurações → Atualizações como "disponível".

## Comandos

| Comando          | Retorno              | O que faz                                                                    |
| ---------------- | -------------------- | ---------------------------------------------------------------------------- |
| `update_pending` | `UpdateInfo \| null` | A atualização já encontrada nesta execução. **Não usa a rede.**              |
| `update_check`   | `UpdateInfo \| null` | Consulta o `latest.json`; `null` se já é a versão mais nova. Erro `network`. |
| `update_install` | `void`               | Baixa, confere a assinatura, instala e reinicia. Só retorna com erro.        |

`UpdateInfo` = `{ version: string; notes: string | null }`, espelhado em `src/lib/commands.ts`.
Os comandos não têm permissão no frontend: o plugin é usado só pelo Rust, então
`capabilities/` não ganhou nenhuma entrada do updater.

## Configuração

`updates.autoUpdate` (padrão `true`; ver [DATABASE.md](DATABASE.md)). Ligada por padrão porque o
objetivo da função é atualizar sozinho; o texto em Configurações diz que usa a internet e o
usuário pode desligar.

## Limitações

- **A primeira versão com o atualizador precisa ser instalada à mão**: quem tem a 0.2.0 não tem
  o código que consulta a Release. A partir dela, as seguintes chegam sozinhas.
- **Perder a chave privada** impede publicar atualizações aceitas: seria preciso distribuir um
  instalador novo, com outra chave pública. Faça cópia de `~/.tauri/compasso.key`.
- **Repositório privado não funciona**: o aplicativo não tem credenciais, então o `latest.json`
  precisa ser público.
- **Linux e macOS** geram os pacotes de atualização, mas esse caminho não foi verificado.
  No Linux só o AppImage se atualiza; `.deb` e `.rpm` exigem instalar a versão nova à mão.
- **O fluxo ponta a ponta ainda não foi exercitado**: depende de uma Release real publicada
  (ver [TESTING.md](TESTING.md)).
