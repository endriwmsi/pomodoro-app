# Versões e publicação

Como uma versão do Compasso é gerada e publicada. Tudo acontece no GitHub Actions
(`.github/workflows/`); nada depende da máquina de quem desenvolve.

## Publicar uma versão

Com tudo commitado na `main`, **um comando**:

```bash
npm run release -- patch
```

`patch` sobe `0.2.0 → 0.2.1`; `minor`, `0.2.0 → 0.3.0`; `major`, `0.2.0 → 1.0.0`. Também
aceita uma versão explícita (`npm run release -- 0.3.0`).

O que ele faz, em ordem, parando no primeiro problema:

1. Confere que está na `main`, sem alterações pendentes, em dia com o `origin` e que a tag não
   existe.
2. Exige que "Não lançado" no `CHANGELOG.md` tenha conteúdo.
3. Roda `npm run check` (typecheck, ESLint, Prettier, Vitest, rustfmt, Clippy, `cargo test`).
4. Fecha "Não lançado" como a nova versão (com a data de hoje) e deixa uma seção vazia no topo.
5. Define a versão em `package.json`, `package-lock.json`, `src-tauri/Cargo.toml` e
   `src-tauri/Cargo.lock`.
6. Cria o commit `chore(release): X.Y.Z` e a tag `vX.Y.Z` e envia os dois.

A tag dispara o workflow **Release**, que em cerca de 15 a 25 minutos compila e **assina** os
instaladores e cria a Release `Compasso vX.Y.Z` em
<https://github.com/endriwmsi/pomodoro-app/releases>, com o texto do `CHANGELOG.md` e o
`latest.json` que os aplicativos instalados consultam ([UPDATER.md](UPDATER.md)).

Opções: `--dry-run` mostra o que faria sem alterar nada; `--skip-check` pula o passo 3 (o
workflow de CI já roda as mesmas verificações); `--no-push` cria o commit e a tag, mas não
envia.

Se a tag não bater com a versão dos arquivos (por exemplo, uma tag criada à mão), o workflow
para antes de compilar e diz o que fazer. Para refazer uma tag: apague-a no GitHub e
localmente, corrija e crie de novo.

### Configuração única: o secret de assinatura

As atualizações são assinadas com uma chave gratuita do Tauri, **sem relação** com certificados
pagos do Windows. A chave privada fica em `%USERPROFILE%\.tauri\compasso.key` (fora do
repositório; **faça uma cópia segura**) e a pública está em `tauri.conf.json`. Falta só entregar
a privada ao GitHub, uma vez:

1. Copie o conteúdo do arquivo (no PowerShell: `Get-Content $env:USERPROFILE\.tauri\compasso.key | Set-Clipboard`).
2. Em <https://github.com/endriwmsi/pomodoro-app/settings/secrets/actions>, **New repository
   secret**, nome `TAURI_SIGNING_PRIVATE_KEY`, e cole o conteúdo.

A chave foi gerada sem senha; se você a regenerar com uma, cadastre também o secret
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Sem o secret, o workflow para logo no começo e diz isso.

Para gerar os instaladores localmente (`npm run tauri build` sem `--no-bundle`), defina antes
`TAURI_SIGNING_PRIVATE_KEY` com o conteúdo do arquivo ou o caminho dele — `createUpdaterArtifacts`
exige a chave para assinar.

## O que é gerado

| Sistema               | Arquivos                                | Situação                 |
| --------------------- | --------------------------------------- | ------------------------ |
| Windows (x64)         | Instalador `-setup.exe` (NSIS) + `.sig` | **Plataforma principal** |
| Linux (x64)           | `.deb`, `.rpm` e `.AppImage`            | Experimental             |
| macOS (Apple Silicon) | `.dmg` e `.app` (`aarch64`)             | Experimental             |
| macOS (Intel)         | `.dmg` e `.app` (`x64`)                 | Experimental             |

Os quatro são compilados em paralelo, cada um no seu sistema — por isso o macOS não exige um
Mac de quem publica. Se um falhar, os outros ainda são anexados à Release.

### Linux e macOS: o que esperar

O Compasso foi feito e verificado no Windows. Nos outros sistemas o código **compila e passa
nos testes** (o workflow de CI confere isso a cada push), mas:

- não há controle de música nem volume por aplicativo (a aba Música mostra "Nada tocando");
- a previsão do tempo usa só as capitais (sem a localização do computador);
- não há som de aviso; as notificações do sistema funcionam pelo plugin do Tauri;
- o instalador personalizado (página de apresentação, textos) é só do Windows;
- **o notch e a bandeja não foram vistos funcionando** nesses sistemas. No macOS a janela
  transparente do notch depende de `macOSPrivateApi` (ligado em `tauri.conf.json`), o que
  impede publicar na Mac App Store.

Trate essas versões como uma prévia até alguém testá-las.

### Sem assinatura de código

Os pacotes de **atualização** são assinados (ver acima), mas nenhum instalador tem assinatura
de código do sistema. O Windows SmartScreen avisa ao executar ("Mais informações →
Executar assim mesmo"); o macOS recusa abrir um aplicativo baixado até o usuário liberá-lo em
Ajustes do Sistema → Privacidade e Segurança, ou remover a quarentena
(`xattr -dr com.apple.quarantine /Applications/Compasso.app`). Assinar exige certificados
pagos (Windows) e uma conta de desenvolvedor da Apple.

## Verificações a cada push (workflow CI)

| Job                    | Sistema | O que roda                                               |
| ---------------------- | ------- | -------------------------------------------------------- |
| Verificações (Windows) | Windows | `npm run check` inteiro                                  |
| Backend (Linux)        | Ubuntu  | Compila o frontend, depois Clippy e os testes do backend |
| Backend (macOS)        | macOS   | Idem                                                     |

## Atualização dentro do aplicativo

O aplicativo consulta a última Release ao abrir e, havendo versão nova, instala e reinicia
sozinho (opção em Configurações → Atualizações). Funcionamento, comandos e limitações em
[UPDATER.md](UPDATER.md); a decisão de rede, no
[ADR-004](decisions/ADR-004-NETWORK-FEATURES.md).

Quem tem uma versão anterior ao atualizador (0.2.0 ou menos) precisa baixar o instalador da
primeira versão que o inclui e executá-lo por cima; os dados ficam fora da pasta de instalação
e são preservados.

## Limitações

- Os workflows foram escritos sem poder ser executados localmente: a primeira execução no
  GitHub é o teste deles — ver o estado em [TESTING.md](TESTING.md).
- O número da versão é escolhido por quem publica (`patch`, `minor`, `major`); não há geração
  automática a partir dos commits, e o `CHANGELOG.md` é escrito à mão.
- Não há versões de pré-lançamento nem canal "nightly".
