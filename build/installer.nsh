!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "nsDialogs.nsh"

!macro customHeader
  !system "echo '' > /dev/null"
!macroend

!if "${APP_ID}" == "com.sistema.tangomaster"
  !define TANGO_DISPLAY_NAME "Tango Master"
!else
  !define TANGO_DISPLAY_NAME "Tango Gestão de Créditos"
!endif

; --- Dados de uma instalação anterior ------------------------------------------------------------
; Os dados ficam no perfil do utilizador (AppData), fora da pasta do programa: reinstalar não os apaga e a
; aplicação abre directamente no login. Uma página do instalador pergunta o que fazer. A instalação limpa
; não apaga nada: move os dados anteriores para uma cópia no Ambiente de Trabalho, recuperável.
;
; MODE "detect": $R3 = 1 se existir alguma pasta. MODE "move": move cada pasta para $R0 (cópia).
!macro TangoDataFolders BASE PATTERN MODE
  ClearErrors
  FindFirst $R1 $R2 "${BASE}\${PATTERN}"
  ${DoWhile} $R2 != ""
    ${If} $R2 != "."
    ${AndIf} $R2 != ".."
    ${AndIf} ${FileExists} "${BASE}\$R2\*.*"
      !if "${MODE}" == "detect"
        StrCpy $R3 "1"
      !else
        CreateDirectory "$R0"
        ClearErrors
        Rename "${BASE}\$R2" "$R0\$R2"
        ${If} ${Errors}
          ; Pasta noutro disco ou bloqueada: copia e remove.
          CopyFiles /SILENT "${BASE}\$R2" "$R0"
          RMDir /r "${BASE}\$R2"
        ${EndIf}
        DetailPrint "Dados anteriores guardados: $R2"
      !endif
    ${EndIf}
    FindNext $R1 $R2
  ${Loop}
  FindClose $R1
!macroend

!macro TangoAllDataFolders MODE
  !if "${APP_ID}" == "com.sistema.tangomaster"
    !insertmacro TangoDataFolders "$APPDATA" "Tango Gestao de Creditos" "${MODE}"
    !insertmacro TangoDataFolders "$APPDATA" "TangoMasterGen" "${MODE}"
    !insertmacro TangoDataFolders "$LOCALAPPDATA" "com.sistema.tangomaster" "${MODE}"
    !insertmacro TangoDataFolders "$DOCUMENTS" "TangoMaster_Config" "${MODE}"
  !else
    !insertmacro TangoDataFolders "$APPDATA" "Tango Gest*o * Cr*ditos ERP" "${MODE}"
    !insertmacro TangoDataFolders "$APPDATA" "TangoERP" "${MODE}"
    !insertmacro TangoDataFolders "$APPDATA" "tango-gestao-e-creditos-erp" "${MODE}"
    !insertmacro TangoDataFolders "$APPDATA" "tango-gestao-erp" "${MODE}"
    !insertmacro TangoDataFolders "$APPDATA" "AngolaCreditoPro" "${MODE}"
    !insertmacro TangoDataFolders "$APPDATA" "angola-cr*dito-pro" "${MODE}"
    !insertmacro TangoDataFolders "$LOCALAPPDATA" "com.sistema.tangoerp" "${MODE}"
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
  Var TangoHasData
  Var TangoCleanInstall
  Var TangoKeepRadio
  Var TangoCleanRadio
  Var TangoTitleFont
  Var TangoOptionFont
!endif

; --- Página de boas-vindas (com o painel lateral da marca) ---
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Bem-vindo ao ${TANGO_DISPLAY_NAME}"
  !define MUI_WELCOMEPAGE_TEXT "Este assistente vai instalar o ${TANGO_DISPLAY_NAME} neste computador.$\r$\n$\r$\nAntes de continuar, feche a aplicação se estiver aberta.$\r$\n$\r$\nClique em Seguinte para começar."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; --- Página "Dados de uma instalação anterior" (só aparece se existirem dados) ---
!macro customPageAfterChangeDir
  Page custom TangoDataPage TangoDataPageLeave

  Function TangoDataPage
    ${If} $TangoHasData != "1"
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "Dados de uma instalação anterior" "Escolha se quer manter os dados ou começar do zero."

    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    CreateFont $TangoTitleFont "Segoe UI" 10 700
    CreateFont $TangoOptionFont "Segoe UI" 9 400

    ${NSD_CreateLabel} 0 0 100% 22u "Este computador já tem a base de dados, os utilizadores e as definições de uma instalação anterior do ${TANGO_DISPLAY_NAME}."
    Pop $0
    SendMessage $0 ${WM_SETFONT} $TangoOptionFont 1

    ; Opção 1: manter
    ${NSD_CreateGroupBox} 0 28u 100% 50u ""
    Pop $0
    ${NSD_CreateRadioButton} 8u 36u 92% 12u "Manter os dados anteriores  (recomendado)"
    Pop $TangoKeepRadio
    SendMessage $TangoKeepRadio ${WM_SETFONT} $TangoTitleFont 1
    ${NSD_CreateLabel} 20u 50u 88% 24u "Para actualizar o sistema. A aplicação abre com a empresa, os utilizadores e todo o histórico, como estava."
    Pop $0
    SendMessage $0 ${WM_SETFONT} $TangoOptionFont 1
    SetCtlColors $0 0x5B6478 transparent

    ; Opção 2: instalação limpa
    ${NSD_CreateGroupBox} 0 84u 100% 54u ""
    Pop $0
    ${NSD_CreateRadioButton} 8u 92u 92% 12u "Instalação limpa"
    Pop $TangoCleanRadio
    SendMessage $TangoCleanRadio ${WM_SETFONT} $TangoTitleFont 1
    ${NSD_CreateLabel} 20u 106u 88% 28u "Começa do zero, com o assistente de configuração. Nada é apagado: os dados actuais ficam guardados numa pasta de cópia no Ambiente de Trabalho."
    Pop $0
    SendMessage $0 ${WM_SETFONT} $TangoOptionFont 1
    SetCtlColors $0 0x5B6478 transparent

    ${If} $TangoCleanInstall == "1"
      ${NSD_Check} $TangoCleanRadio
    ${Else}
      ${NSD_Check} $TangoKeepRadio
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function TangoDataPageLeave
    ${NSD_GetState} $TangoCleanRadio $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $TangoCleanInstall "1"
    ${Else}
      StrCpy $TangoCleanInstall "0"
    ${EndIf}
  FunctionEnd
!macroend

; --- Custom Init (runs before install begins) ---
!macro customInit
  ; Fechar a aplicação aberta antes de instalar (e antes de mover os seus dados).
  !if "${APP_ID}" == "com.sistema.tangomaster"
    nsExec::ExecToLog 'taskkill /f /im "TangoMasterGen.exe" /t'
  !else
    nsExec::ExecToLog 'taskkill /f /im "Tango Gestao de Creditos.exe" /t'
    nsExec::ExecToLog 'taskkill /f /im "TangoERP.exe" /t'
  !endif
  Sleep 1000

  StrCpy $TangoHasData "0"
  StrCpy $TangoCleanInstall "0"
  ; Actualizações automáticas (silenciosas) mantêm sempre os dados: a página nem é mostrada.
  ${IfNot} ${Silent}
    ; Os dados são do utilizador que instala, não da pasta comum a todos (instalação por máquina).
    SetShellVarContext current
    StrCpy $R3 "0"
    !insertmacro TangoAllDataFolders "detect"
    StrCpy $TangoHasData $R3
    SetShellVarContext all
  ${EndIf}
!macroend

; --- Custom Install Logic ---
!macro customInstall
  ${If} $TangoCleanInstall == "1"
    SetShellVarContext current
    ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
    StrCpy $R0 "$DESKTOP\${TANGO_DISPLAY_NAME} - dados anteriores $2-$1-$0 $4h$5"
    !insertmacro TangoAllDataFolders "move"
    !if "${APP_ID}" == "com.sistema.tangomaster"
      ; A chave de assinatura das licenças nunca recomeça: sem ela, as licenças novas deixam de ser aceites pelos
      ; ERP já instalados. Fica no lugar (com o "Local State", que guarda a chave do cofre do Windows que a protege).
      ${If} ${FileExists} "$R0\Tango Gestao de Creditos\license-signing-key.bin"
        CreateDirectory "$APPDATA\Tango Gestao de Creditos"
        CopyFiles /SILENT "$R0\Tango Gestao de Creditos\license-signing-key.bin" "$APPDATA\Tango Gestao de Creditos"
        CopyFiles /SILENT "$R0\Tango Gestao de Creditos\Local State" "$APPDATA\Tango Gestao de Creditos"
        DetailPrint "Chave de assinatura das licenças mantida."
      ${EndIf}
      ; Chave pública partilhada com o ERP deste computador.
      ${If} ${FileExists} "$R0\TangoMaster_Config\public_key.json"
        CreateDirectory "$DOCUMENTS\TangoMaster_Config"
        CopyFiles /SILENT "$R0\TangoMaster_Config\public_key.json" "$DOCUMENTS\TangoMaster_Config"
      ${EndIf}
    !endif
    DetailPrint "Instalação limpa: cópia dos dados anteriores em $R0"
    SetShellVarContext all
  ${EndIf}
  DetailPrint "Instalação do ${TANGO_DISPLAY_NAME} concluída."
!macroend

; --- Custom Uninstall Logic ---
!macro customUnInstall
  DetailPrint "A remover a aplicação..."
!macroend
