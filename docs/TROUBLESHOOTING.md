# Solução de problemas

Armadilhas deste projeto. Cada item indica se foi **observado** ou se é uma restrição
**prevista** a partir da configuração (ainda não reproduzida).

## Atualizar o TypeScript para a 7 quebra o lint — _previsto_

**Causa:** `typescript-eslint` 8.71 declara `typescript >=4.8.4 <6.1.0` como peer; a versão mais
recente do TypeScript é a 7.

**Solução:** manter `typescript` em `~6.0.3` no `package.json`. Só atualizar quando o
`typescript-eslint` declarar suporte (ver [ADR-001](decisions/ADR-001-TECH-STACK.md)).

## `npm run tauri dev` falha porque a porta 1420 está ocupada — _previsto_

**Causa:** a porta é fixa (`strictPort`) e já há um Vite rodando — normalmente um `npm run dev`
ou a pré-visualização `frontend` do Claude Code.

**Solução:** encerrar o outro servidor. Não troque a porta em um lugar só: ela precisa ser a
mesma em `vite.config.ts` e em `build.devUrl` de `tauri.conf.json`.

## Abri o aplicativo e "nada aconteceu" / o build não consegue gravar `compasso.exe` — _previsto_

**Causa:** já existe uma instância rodando, oculta na bandeja. A segunda execução só mostra a
janela da primeira e sai; e o Windows não deixa sobrescrever um executável em uso.

**Solução:** ícone da bandeja → **Encerrar**. Se o ícone não estiver visível, encerre o
processo `compasso.exe` pelo Gerenciador de Tarefas.

## "O Compasso não conseguiu iniciar" — _previsto_

**Causa:** a inicialização falhou e o aplicativo mostrou uma caixa de erro com o motivo. Os
casos esperados: o arquivo `compasso.db` não é um banco válido ou está sem permissão de
leitura/escrita; ou o banco foi atualizado por uma versão **mais nova** do aplicativo
("o banco está na versão N do esquema…").

**Solução:** para o banco mais novo, instale a versão atual do aplicativo. Para um arquivo
danificado, feche o aplicativo, renomeie `%APPDATA%\com.endriwmsi.compasso\compasso.db` (e os
arquivos `-wal` e `-shm`) para guardar uma cópia e abra de novo — um banco vazio será criado.
O aplicativo nunca apaga nem sobrescreve o arquivo por conta própria.

## A aba de clima mostra "Sem conexão" ou só capitais — _previsto_

**Causa:** sem internet, o serviço Open-Meteo não responde. Só capitais: a localização não foi
permitida em Configurações → Previsão do tempo, ou o Windows não a forneceu.

**Solução:** a previsão volta sozinha na próxima atualização (a cada 15 minutos) ou pelo botão
"Tentar de novo". Para a localização: Configurações do Windows → Privacidade e segurança →
Localização → permitir para aplicativos de desktop.

## O Compasso não abre ao entrar no Windows — _previsto_

**Causa:** a opção **Configurações → Geral → Iniciar com o Windows** grava o caminho do
executável em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. Se o executável foi movido
ou a entrada foi desativada em Gerenciador de Tarefas → Aplicativos de inicialização, o Windows
não o encontra (ou o ignora).

**Solução:** abra o Compasso uma vez — ao iniciar, ele regrava o caminho atual se a opção
estiver ligada — e confira se a entrada "Compasso" está habilitada no Gerenciador de Tarefas.
Em desenvolvimento (`npm run tauri dev`) a opção registra o executável de depuração; deixe-a
desligada.

## A barra de progresso da música não aparece ou fica parada — _previsto_

**Causa:** o aplicativo que toca não publica a duração da faixa (rádios, transmissões ao vivo,
alguns players no navegador) ou não aceita mudar a posição.

**Solução:** nenhuma no Compasso; ver [MEDIA.md](MEDIA.md#posição-na-faixa).

## A aba de música diz "Nada tocando" com um player aberto — _previsto_

**Causa:** o player não publica uma sessão de mídia no Windows (as teclas de mídia do teclado
também não o controlam), ou nada foi iniciado desde que ele abriu.

**Solução:** inicie a reprodução no player. Se as teclas de mídia não o controlam, o Compasso
também não consegue.

## `&&` não funciona no terminal — _observado_

**Causa:** o Windows PowerShell 5.1 não tem `&&`.

**Solução:** rode um comando por vez ou use `;`. Os scripts do `package.json` podem usar `&&`
porque o npm os executa pelo `cmd`.

## A janela sem moldura ainda aparece com `WS_CAPTION` em ferramentas de inspeção — _observado_

**Causa provável:** com `decorations: false` e `shadow: true`, o Tauri mantém o estilo nativo e remove a
moldura ao tratar a área não-cliente — é assim que o Windows 11 preserva sombra e cantos
arredondados.

**Solução:** nenhuma; é o comportamento esperado. Para conferir a ausência da barra de título,
olhe a janela, não o estilo.

## Os controles de janela não fazem nada em `npm run dev` — _observado_

**Causa:** no navegador não há runtime do Tauri; `src/lib/window.ts` vira no-op de propósito.

**Solução:** usar `npm run tauri dev` para testar comportamento de janela.
