# Templates de estilização

O usuário escolhe a aparência do aplicativo em **Configurações → Template de estilização**. A
escolha é uma configuração persistida (`appearance.template`, ver
[DATABASE.md](DATABASE.md)).

## Templates existentes

| ID       | Nome   | Características                                                                                                                                                                                                                          |
| -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glass`  | Vidro  | Padrão. Painéis de vidro fumê (escuros e translúcidos, com desfoque, brilho suave no canto superior esquerdo e cantos bem arredondados), tipografia Segoe UI, destaque âmbar.                                                            |
| `matrix` | Matriz | Painéis escuros opacos, tipografia monoespaçada em maiúsculas, rótulos numerados, leituras e gráficos em matriz de pontos, destaque laranja.                                                                                             |
| `signal` | Sinal  | Painel de telemetria: superfícies quase pretas e opacas, cantos pouco arredondados, rótulos monoespaçados em maiúsculas, números em peso normal, gráfico semanal em blocos empilhados e um único verde de destaque.                      |
| `relief` | Relevo | Claro e macio (neumorfismo): painéis da cor do fundo, destacados só por uma sombra escura embaixo à direita e uma clara em cima à esquerda, cantos muito arredondados, texto escuro e destaque quase preto. **Não usa imagem de fundo.** |

Vidro, Matriz e Sinal mantêm a moldura preta e a imagem de fundo. O Relevo é o único template
claro: a moldura e o fundo são cinza-claros e a imagem de fundo escolhida é ignorada (a escolha
fica guardada e volta ao trocar de template).

### Como cada template estiliza os elementos

| Elemento                   | Vidro                         | Matriz                     | Sinal                               | Relevo                               |
| -------------------------- | ----------------------------- | -------------------------- | ----------------------------------- | ------------------------------------ |
| Painel (`.panel`)          | Vidro fumê com desfoque       | Escuro opaco, sombra       | Quase preto, borda fina, sem sombra | Cor do fundo, sombra dupla em relevo |
| Rótulo (`PanelLabel`)      | Segoe UI, peso médio          | Mono, maiúsculas, numerado | Mono, maiúsculas, espaçado          | Pequeno, seminegrito, apagado        |
| Indicador (`MetricValue`)  | Número grande                 | Matriz de pontos           | Número grande em peso normal        | Número grande em negrito             |
| Gráfico (`WeekChart`)      | Barras arredondadas           | Colunas de pontos          | Colunas de blocos verdes            | Barras arredondadas                  |
| Relógio do Pomodoro        | Número grande                 | Matriz de pontos           | Número grande                       | Número grande                        |
| Destaque                   | Âmbar `#f5c251`               | Laranja `#ff5a36`          | Verde `#2ee66b`                     | Quase preto `#1d1f24`                |
| Campos e áreas "afundadas" | `--color-panel-strong` escuro | Idem                       | Idem                                | Um tom abaixo do painel              |

As classes `matrix:`, `signal:` e `relief:` (variantes do Tailwind declaradas em `globals.css`)
aplicam um estilo só naquele template; o Vidro é o estilo base, sem variante.

No Relevo, os utilitários `white` e `black` do Tailwind trocam de papel **na janela principal**
(anéis de foco, véu dos diálogos), e os seletores nativos de data e hora usam o esquema claro.

## Imagem de fundo

Escolhida em **Configurações**, logo abaixo do template (`appearance.background`), entre:

| Escolha            | O que mostra                                             |
| ------------------ | -------------------------------------------------------- |
| `default`          | A primeira imagem embutida, em ordem alfabética          |
| `builtin` + `name` | Uma imagem embutida, pelo nome do arquivo sem a extensão |
| `custom`           | A imagem enviada pelo usuário                            |
| `none`             | Só o gradiente (`.app-background-fallback`)              |

**Imagens embutidas:** os arquivos em `src/assets/backgrounds/` (`png`, `jpg`, `jpeg`, `webp`,
`avif`). Para acrescentar uma, basta colocar o arquivo lá: ela aparece na grade na próxima
compilação. O nome do arquivo é o identificador gravado e também o rótulo (`por-do-sol.jpg` →
"Por do sol"); use só letras, números, hífen e sublinhado. Se uma imagem escolhida deixar de
existir em uma versão nova, vale a padrão.

**Imagem do usuário:** "Enviar uma imagem…" lê o arquivo escolhido e o entrega ao backend
(`background_set_custom`), que o **copia** para o diretório de dados do aplicativo — continua
valendo mesmo que o original seja movido ou apagado. Só existe uma por vez; enviar outra a
substitui. O backend aceita PNG, JPEG e WebP de até 12 MB, reconhecidos pelos primeiros bytes do
arquivo (a extensão e o tipo declarado são ignorados), e recusa o resto com `validation` no
campo `image`. A janela a lê de volta como `data:` URL (`background_get_custom`), o que a CSP já
permite para imagens; não há acesso do WebView ao sistema de arquivos.

Código: `src/app/background.ts` (lista e resolução), `src/stores/background.ts`,
`src/features/settings/BackgroundPicker.tsx` e `src-tauri/src/background.rs`.

## Como funciona

1. **Atributo no documento.** `applyTemplate(id)` (`src/app/templates.ts`) grava
   `data-template="<id>"` em `<html>`. `App.tsx` chama essa função sempre que
   `settings.appearance.template` muda.
2. **Tokens.** `src/styles/globals.css` define os tokens do template padrão em `@theme`
   (`--color-panel`, `--color-panel-strong`, `--color-panel-border`, `--color-ink`,
   `--color-ink-muted`, `--color-popover`, `--color-priority-low`, `--color-priority-medium`,
   `--color-priority-high`, `--color-accent`, `--color-accent-ink`, `--font-sans`,
   `--font-display`, `--radius-card`) e em `:root` (`--panel-backdrop`, `--panel-highlight`,
   `--panel-shadow`, `--scrollbar-thumb`, `--scrollbar-thumb-hover`). Cada
   template adicional os sobrescreve em um bloco `:root[data-template='<id>']`. Como os
   componentes usam utilitários derivados dos tokens (`bg-panel`, `text-ink-muted`,
   `bg-accent`, classe `.panel`…), a maior parte da interface muda sem tocar em componentes.
3. **Variante Tailwind.** `matrix:` aplica uma classe só naquele template
   (ex.: `matrix:uppercase`). Cada template novo que precisar de ajustes pontuais ganha sua
   variante com `@custom-variant`.
4. **Diferenças estruturais.** Quando o template muda _o que_ é renderizado, o componente
   consulta `useTemplate()` (`src/stores/settings.ts`). Hoje isso ocorre em:
   - `components/ui/MetricValue.tsx` — texto comum × `DotMatrixText`;
   - `features/dashboard/DashboardPage.tsx` — estado vazio × `DotColumns`.

### Primeiro quadro

As configurações chegam do backend de forma assíncrona. Para a janela não abrir no template
errado, `applyTemplate` também guarda o ID em `localStorage` (`compasso.template`), e
`main.tsx` o aplica antes de renderizar. É apenas uma dica por janela: a fonte de verdade é o
banco, e o valor é corrigido assim que `get_settings` responde.

## Componentes de matriz de pontos

| Componente                        | Uso                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/ui/DotMatrixText.tsx` | Texto em SVG com glifos de 7 linhas. Sem fonte externa. Glifos em `components/ui/dotMatrix.ts`: dígitos, `:` `.` `-` `%`, `h` `m` `k` e espaço; outros caracteres viram espaço. |
| `components/ui/DotColumns.tsx`    | Gráfico de colunas em pontos. Acende um ponto por unidade enquanto os valores cabem na coluna; acima disso, proporcional ao maior valor (`litDots`).                            |

Ambos expõem `role="img"` com nome acessível — o desenho nunca é a única forma de ler o valor.

## Cores de prioridade

Os ícones do clima (`src/notch/WeatherIcon.tsx`) usam os tokens `--color-weather-*` (sol,
lua, nuvem clara e escura, chuva, neve, raio), iguais nos dois templates; no notch branco, nuvens, lua e neve têm
valores próprios, mais escuros.

Usadas nos cartões do Kanban (`text-priority-*`, `border-priority-*`, `bg-priority-*`).

| Token                     | Vidro                   | Matriz                    |
| ------------------------- | ----------------------- | ------------------------- |
| `--color-priority-low`    | azul (`#60a5fa`)        | azul (`#60a5fa`)          |
| `--color-priority-medium` | verde claro (`#86efac`) | amarelo (`#facc15`)       |
| `--color-priority-high`   | cor de destaque (âmbar) | cor de destaque (laranja) |

A alta é sempre a cor de destaque do template. No Vidro o destaque já é âmbar, então a média
usa verde — amarelo ficaria quase igual à alta. A cor nunca é o único sinal: o cartão traz o
nome da prioridade.

## Campos numéricos

`components/ui/NumberInput.tsx` substitui as setas nativas do navegador (escondidas em
`globals.css`) por setas no estilo do template. O campo continua sendo um
`<input type="number">`, então as setas do teclado e os leitores de tela funcionam como sempre.

## Componentes shadcn/ui

Controles de formulário mais complexos vêm do [shadcn/ui](https://ui.shadcn.com) (Radix UI):
hoje, `components/ui/checkbox.tsx`, `components/ui/select.tsx` e `components/ui/dialog.tsx`
(Dialog e AlertDialog). O código é o do shadcn, com
duas adaptações:

- as classes de cor do shadcn (`border-input`, `bg-primary`, `bg-popover`…) foram trocadas
  pelos tokens do template (`border-panel-border`, `bg-accent`, `bg-popover`…), para que os
  controles sigam o template ativo sem um segundo conjunto de variáveis;
- as classes de animação (`animate-in`, `fade-in-0`…) foram removidas, pois exigem o pacote
  `tw-animate-css`.

Não há `components.json`: como as cores são diferentes das do shadcn, `npx shadcn add` geraria
componentes que precisariam da mesma adaptação manual. Para trazer outro componente, copie o
código do shadcn e troque as classes de cor. Os arquivos mantêm o nome em minúsculas do shadcn;
`CheckboxField.tsx` é o invólucro com rótulo usado nas Configurações.

Dependências: `radix-ui`, `clsx` e `tailwind-merge` (função `cn` em `src/lib/utils.ts`).

O token `--color-popover` é o fundo **opaco** de menus suspensos — os painéis são
translúcidos no template Vidro, o que deixaria o menu ilegível.

## Acrescentar um template

1. `src-tauri/src/settings/mod.rs`: nova variante em `Template` (serializa em minúsculas).
2. `src/lib/commands.ts`: acrescente o ID a `TemplateId`.
3. `src/app/templates.ts`: nova entrada em `TEMPLATES` (rótulo e descrição).
4. `src/styles/globals.css`: bloco `:root[data-template='<id>']` com os tokens e, se preciso,
   um `@custom-variant`.
5. `src/features/settings/AppearanceSection.tsx`: miniatura em `TemplatePreview` (com cores
   fixas, para não depender do template ativo).
6. Só se o template exigir marcação diferente: ramifique nos componentes que usam
   `useTemplate()`.
7. Atualize a tabela acima, a de `docs/DATABASE.md` e os testes.

Nenhuma migration é necessária. Um banco gravado com um template que o executável não conhece
(downgrade) volta ao padrão ao carregar.

## Limitações

- O seletor ocupa duas colunas (duas linhas com os quatro templates atuais).
- O Relevo é o único template claro e foi conferido só no dashboard; telas com muitos
  controles (Kanban, diálogos, Configurações) podem ter pontos de contraste a ajustar.
- No Sinal e no Relevo, relógios e indicadores usam o desenho base (número), não um próprio.
- No notch, o template muda apenas o desenho do tempo e a cor de destaque. O fundo não depende
  do template: é preto, ou branco se o usuário escolher (`notch.theme`, ver
  [WINDOW_MANAGER.md](WINDOW_MANAGER.md#cor)). Ele acompanha a troca de template pelo evento `settings:changed`.
