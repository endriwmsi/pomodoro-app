# Desenvolvimento

## Pré-requisitos (Windows 10/11 x64)

| Ferramenta                                       | Versão verificada | Observação                                        |
| ------------------------------------------------ | ----------------- | ------------------------------------------------- |
| Rust (toolchain `stable-x86_64-pc-windows-msvc`) | 1.97.1            | `rustup`, com os componentes `rustfmt` e `clippy` |
| Build Tools do Visual Studio                     | 18                | Carga "Desenvolvimento para desktop com C++"      |
| Node.js                                          | 24.13             | npm 11.6 incluso                                  |
| WebView2 Runtime                                 | 154               | Já vem no Windows 11                              |

Não é necessário instalar a CLI do Tauri globalmente: ela é uma dependência de desenvolvimento
(`@tauri-apps/cli`) e roda por `npm run tauri`.

## Primeiros passos

```bash
npm install
```

```bash
npm run tauri dev
```

A primeira compilação do Rust baixa e compila as crates (alguns minutos); as seguintes são
incrementais.

### Encerrar o aplicativo

Fechar a janela apenas a oculta. Para encerrar: ícone da bandeja → **Encerrar**. Em
`npm run tauri dev`, `Ctrl+C` no terminal também encerra (como é um encerramento abrupto, uma
sessão em andamento só é marcada como interrompida na próxima abertura).

Só roda **uma instância** por vez, inclusive entre `tauri dev` e o executável de release: se um
estiver aberto, o outro apenas mostra a janela do primeiro e sai. Um executável aberto também
impede o `tauri build` de sobrescrevê-lo.

## Scripts

| Script                 | O que faz                                                       |
| ---------------------- | --------------------------------------------------------------- |
| `npm run tauri dev`    | Aplicativo desktop com hot reload (sobe o Vite na porta 1420)   |
| `npm run dev`          | Só o frontend no navegador — útil para layout; sem APIs nativas |
| `npm run build`        | `tsc --noEmit` + build do frontend em `dist/`                   |
| `npm run typecheck`    | TypeScript em modo estrito                                      |
| `npm run lint`         | ESLint (typescript-eslint com regras baseadas em tipos)         |
| `npm run format`       | Prettier (escreve)                                              |
| `npm run format:check` | Prettier (apenas verifica)                                      |
| `npm run test`         | Vitest, execução única                                          |
| `npm run test:watch`   | Vitest em modo observação                                       |
| `npm run rust:fmt`     | `cargo fmt --check`                                             |
| `npm run rust:clippy`  | Clippy em todos os alvos, avisos tratados como erro             |
| `npm run rust:test`    | `cargo test`                                                    |
| `npm run check`        | Todos os itens de verificação acima, em sequência               |

Para corrigir a formatação do Rust: `cargo fmt --manifest-path src-tauri/Cargo.toml`.

## Build de release

Executável sem instalador (não acessa a rede):

```bash
npm run tauri build -- --no-bundle
```

Resultado: `src-tauri/target/release/compasso.exe`. O perfil de release usa `opt-level = "s"`,
LTO, `codegen-units = 1`, `panic = "abort"` e `strip`.

Instalador NSIS (alvo configurado em `tauri.conf.json` → `bundle.targets`):

```bash
npm run tauri build
```

Ver a seção [Instalador](#instalador).

## Instalador

```bash
npm run tauri build
```

Gera `src-tauri/target/release/bundle/nsis/Compasso_<versão>_x64-setup.exe` (2,8 MB na versão
0.1.0). Na primeira execução o empacotador baixa o NSIS; depois fica em cache.

- **Instalação:** por usuário, sem pedir administrador (padrão do NSIS no Tauri). O instalador
  cuida do WebView2 se ele faltar (baixa o instalador da Microsoft — relevante no Windows 10).
- **Dados:** ficam em `%APPDATA%\com.endriwmsi.compasso\`, fora da pasta de instalação.
  Instalar uma versão nova por cima **não toca nos dados**; na primeira abertura, as migrations
  pendentes atualizam o banco.
- **Voltar a uma versão antiga** depois que o banco foi atualizado não é suportado: o
  aplicativo recusa o banco mais novo e avisa, sem modificá-lo.
- **Desinstalação:** pelo painel de aplicativos do Windows. Os dados do usuário não são
  apagados automaticamente; para removê-los, exclua a pasta acima.
- **Sem assinatura de código:** o Windows SmartScreen exibe um aviso ao executar o instalador.

### Aparência do instalador

Configurada em `tauri.conf.json` → `bundle` e na pasta `src-tauri/installer/`:

| Item                         | Origem                                                                 |
| ---------------------------- | ---------------------------------------------------------------------- |
| Idioma                       | `nsis.languages`: português do Brasil                                  |
| Página "Conheça o Compasso"  | `installer/hooks.nsh` (página própria, com `installer/preview.bmp`)    |
| Textos de boas-vindas e link | `installer/hooks.nsh` (`MUI_WELCOMEPAGE_*`, `MUI_FINISHPAGE_LINK*`)    |
| Página de licença            | `bundle.licenseFile`: o `LICENSE` (MIT) da raiz                        |
| Barra lateral e cabeçalho    | `nsis.sidebarImage` e `nsis.headerImage` (`sidebar.bmp`, `header.bmp`) |

- O Tauri inclui `hooks.nsh` **antes** de declarar as páginas do assistente. Por isso o arquivo
  pode definir textos do MUI — e por isso a página própria é a **primeira**, antes das
  boas-vindas. Ela é pulada em instalações silenciosas (`/S`) e passivas (`/P`).
- `hooks.nsh` precisa ser salvo em **UTF-8 com BOM**, ou os acentos saem trocados.
- As três imagens são geradas por `installer/make-assets.ps1` a partir do ícone e das capturas
  em `docs/images/` (o NSIS só aceita BMP). Ao trocar o ícone ou as capturas:

  ```bash
  powershell -NoProfile -ExecutionPolicy Bypass -File src-tauri\installer\make-assets.ps1
  ```

As páginas até a escolha da pasta foram **abertas e conferidas** (capturas em `docs/images/`);
a instalação em si **não foi executada** durante o desenvolvimento.

## Dados de exemplo e capturas de tela

`scripts/demo-data.mjs` cria, **em uma pasta à parte**, um banco com seis semanas de pomodoros,
tarefas nas três colunas, rotinas e expediente — para demonstrações e para as imagens do README
e do instalador. Usa o SQLite embutido no Node (`node:sqlite`) e as migrations do projeto; não
toca nos dados reais.

```bash
node scripts/demo-data.mjs "$env:TEMP\compasso-demo" --template glass
```

O aplicativo usa essa pasta quando a variável `COMPASSO_DATA_DIR` está definida (em vez de
`%APPDATA%\com.endriwmsi.compasso`). No PowerShell:

```bash
$env:COMPASSO_DATA_DIR = "$env:TEMP\compasso-demo"; .\src-tauri\target\release\compasso.exe
```

Feche a instância em uso antes (só roda uma). Para voltar aos dados reais, abra o aplicativo
de um terminal novo, ou limpe a variável (`$env:COMPASSO_DATA_DIR = $null`).

As imagens de `docs/images/` foram tiradas assim, uma execução por template (`--template`
aceita `glass`, `matrix`, `signal` e `relief`). O player de música mostra o que estiver tocando
no computador no momento, e a aba de clima consulta a internet (capitais, não a localização).
Depois de refazê-las, gere de novo as imagens do instalador (seção anterior).

## Configurações relevantes

- **Porta 1420** fixa (`vite.config.ts` com `strictPort` e `build.devUrl` em
  `tauri.conf.json`). Se estiver ocupada, o `tauri dev` falha em vez de trocar de porta.
- **Alias `@/`** → `src/` (em `tsconfig.json` e `vite.config.ts`; mantenha os dois iguais).
- **Tailwind v4** não tem `tailwind.config.js`: os tokens ficam em `@theme`, em
  `src/styles/globals.css`. O Prettier ordena as classes (`prettier-plugin-tailwindcss`).
- **TypeScript fixado em `~6.0`** — ver [ADR-001](decisions/ADR-001-TECH-STACK.md).
- **Pré-visualizar o notch no navegador:** com `npm run dev`, abra
  `http://localhost:1420/?window=notch`. Fora do Tauri não há janela para redimensionar, então
  só a forma e o conteúdo são exibidos.
- **Imagem de fundo:** `src/assets/background.{png,jpg,jpeg,webp,avif}` — ver
  [ARCHITECTURE.md](ARCHITECTURE.md#linguagem-visual).
- **Ícones:** `src-tauri/app-icon.png` é a fonte (provisória, 1024 × 1024). Para regenerar:
  `npm run tauri icon src-tauri/app-icon.png` e apague as pastas `icons/android` e `icons/ios`,
  que não são usadas.

## Dados locais

O banco fica em `%APPDATA%\com.endriwmsi.compasso\compasso.db` (mais `-wal` e `-shm`), tanto em
`tauri dev` quanto no executável de release — **os dois usam o mesmo arquivo**. Para começar do
zero, feche o aplicativo e apague os três arquivos. Detalhes em [DATABASE.md](DATABASE.md).

O WebView2 guarda seus próprios dados (inclusive a dica de template em `localStorage`) em
`%LOCALAPPDATA%\com.endriwmsi.compasso\`.
