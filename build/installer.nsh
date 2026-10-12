!include "LogicLib.nsh"
!include "FileFunc.nsh"

!macro customHeader
  !system "echo '' > /dev/null"
!macroend

; --- Instalação limpa ou manter dados -------------------------------------------------------------
; Os dados ficam no perfil do utilizador (AppData), fora da pasta do programa: reinstalar não os apaga e a
; aplicação abre directamente no login. O instalador pergunta o que fazer. "Instalação limpa" não apaga nada:
; move os dados anteriores para uma cópia no Ambiente de Trabalho, recuperável.
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
        DetailPrint "Dados anteriores movidos: ${BASE}\$R2"
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

; --- Custom Install Logic ---
!macro customInstall
  DetailPrint "Instalação do ${PRODUCT_NAME} concluída com sucesso."
!macroend

; --- Custom Init (runs before install begins) ---
!macro customInit
  ; Fechar a aplicação aberta antes de instalar (e antes de mover os seus dados).
  nsExec::ExecToLog 'taskkill /f /im "Tango Gestao de Creditos.exe" /t'
  nsExec::ExecToLog 'taskkill /f /im "TangoERP.exe" /t'
  nsExec::ExecToLog 'taskkill /f /im "TangoMasterGen.exe" /t'
  Sleep 1000

  ; Actualizações automáticas (silenciosas) mantêm sempre os dados.
  ${IfNot} ${Silent}
    ; Os dados são do utilizador que instala, não da pasta comum a todos (instalação por máquina).
    SetShellVarContext current
    StrCpy $R3 "0"
    !insertmacro TangoAllDataFolders "detect"
    ${If} $R3 == "1"
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON1 \
        "Foram encontrados dados de uma instalação anterior do ${PRODUCT_NAME} neste computador (base de dados, utilizadores, definições).$\r$\n$\r$\nSIM  —  Manter os dados anteriores (recomendado para actualizar).$\r$\nNÃO  —  Instalação limpa: começar do zero, com o assistente de configuração.$\r$\n$\r$\nNa instalação limpa os dados anteriores não são apagados: ficam guardados numa pasta de cópia no Ambiente de Trabalho." \
        IDYES tango_keep_data
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
        "Confirma a instalação limpa?$\r$\n$\r$\nO ${PRODUCT_NAME} vai abrir sem empresa, sem utilizadores e sem dados, como numa primeira instalação.$\r$\nOs dados actuais serão movidos para o Ambiente de Trabalho." \
        IDCANCEL tango_keep_data
      ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
      StrCpy $R0 "$DESKTOP\${PRODUCT_NAME} - dados anteriores $2-$1-$0 $4h$5"
      !insertmacro TangoAllDataFolders "move"
      MessageBox MB_OK|MB_ICONINFORMATION "Instalação limpa preparada.$\r$\n$\r$\nCópia dos dados anteriores:$\r$\n$R0"
    ${EndIf}
    tango_keep_data:
    SetShellVarContext all
  ${EndIf}
!macroend

; --- Custom Uninstall Logic ---
!macro customUnInstall
  DetailPrint "A remover a aplicação..."
!macroend
