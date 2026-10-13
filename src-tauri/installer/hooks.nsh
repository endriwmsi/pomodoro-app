; Personalização do instalador do Compasso. O Tauri inclui este arquivo antes
; de declarar as páginas, então dá para definir textos do MUI e acrescentar
; uma página própria — que, por isso, é a primeira do assistente.
; Salve sempre em UTF-8 com BOM: é como o NSIS reconhece os acentos.

!include nsDialogs.nsh
!include LogicLib.nsh
!include FileFunc.nsh

; --- Boas-vindas e conclusão -------------------------------------------------
!define MUI_WELCOMEPAGE_TITLE "Instalar o Compasso"
!define MUI_WELCOMEPAGE_TEXT "O Compasso reúne Pomodoro configurável, quadro Kanban, painel de estatísticas e um notch retrátil na borda da tela.$\r$\n$\r$\nTotalmente local: seus dados ficam em um arquivo neste computador. Não há conta, servidor, anúncios nem rastreamento de uso. A única função que usa a internet é a previsão do tempo, opcional e desligada por padrão.$\r$\n$\r$\nÉ um projeto de código aberto, sob a licença MIT.$\r$\n$\r$\nClique em Próximo para continuar."
!define MUI_FINISHPAGE_LINK "Autor: github.com/endriwmsi"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/endriwmsi"

; --- Página "Conheça o Compasso" ---------------------------------------------
Var CompassoPreviewImage

Page custom CompassoPreviewShow

Function CompassoPreviewShow
  ; Instalação silenciosa (/S) ou passiva (/P, usada em atualizações): sem páginas.
  ${If} ${Silent}
    Abort
  ${EndIf}
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} "$0" "/P" $1
  ${IfNot} ${Errors}
    Abort
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "Conheça o Compasso" "Foco, tarefas e estatísticas, sem sair do que você está fazendo."

  InitPluginsDir
  File "/oname=$PLUGINSDIR\compasso-preview.bmp" "${__FILEDIR__}\preview.bmp"

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateBitmap} 0 0 100% 105u ""
  Pop $1
  ${NSD_SetStretchedImage} $1 "$PLUGINSDIR\compasso-preview.bmp" $CompassoPreviewImage

  ${NSD_CreateLabel} 0 111u 100% 28u "Pomodoro com timer confiável, Kanban com arrastar e soltar e um painel com o seu progresso. Tudo fica neste computador: sem conta, sem servidor e sem rastreamento. Código aberto (MIT)."
  Pop $2

  nsDialogs::Show
  ${NSD_FreeImage} $CompassoPreviewImage
FunctionEnd