# Versões e publicação

Como uma versão do Compasso é gerada e publicada. Tudo acontece no GitHub Actions
(`.github/workflows/`); nada depende da máquina de quem desenvolve.

## Publicar uma versão

1. Atualize o `CHANGELOG.md`: mova o que está em "Não lançado" para uma seção com o número da
   versão.
2. Defina a versão em todos os arquivos que a guardam (`package.json`, `package-lock.json`,
   `src-tauri/Cargo.toml` e `src-tauri/Cargo.lock`):

   ```bash
   npm run release:version -- 0.2.0
   ```

3. Faça o commit, crie a tag e envie os dois:

   ```bash
   git commit -am "chore(release): 0.2.0"
   ```

   ```bash
   git tag v0.2.0
   ```

   ```bash
   git push origin main --follow-tags
   ```

A tag dispara o workflow **Release**, que em cerca de 15 a 25 minutos cria a Release
`Compasso v0.2.0` em <https://github.com/endriwmsi/pomodoro-app/releases> com os instaladores.

Se a tag não bater com a versão dos arquivos, o workflow para antes de compilar e diz o que
fazer. Para refazer uma tag: apague-a no GitHub e localmente, corrija e crie de novo.

## O que é gerado

| Sistema               | Arquivos                       | Situação                 |
| --------------------- | ------------------------------ | ------------------------ |
| Windows (x64)         | Instalador `-setup.exe` (NSIS) | **Plataforma principal** |
| Linux (x64)           | `.deb`, `.rpm` e `.AppImage`   | Experimental             |
| macOS (Apple Silicon) | `.dmg` e `.app` (`aarch64`)    | Experimental             |
| macOS (Intel)         | `.dmg` e `.app` (`x64`)        | Experimental             |

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

### Sem assinatura

Nenhum instalador é assinado. O Windows SmartScreen avisa ao executar ("Mais informações →
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

Não existe: quem tem uma versão instalada baixa o instalador novo e o executa por cima (os
dados ficam fora da pasta de instalação e são preservados). Um atualizador automático faria o
aplicativo consultar a internet a cada abertura, o que exigiria revisar o
[ADR-004](decisions/ADR-004-NETWORK-FEATURES.md).

## Limitações

- Os workflows foram escritos sem poder ser executados localmente: a primeira execução no
  GitHub é o teste deles — ver o estado em [TESTING.md](TESTING.md).
- A versão é definida à mão (passo 2); não há geração automática a partir dos commits.
- Não há versões de pré-lançamento nem canal "nightly".
