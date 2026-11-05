; Tauri registers and removes the association. Only its document icon is overridden.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\typstOgraphe.Project\DefaultIcon" "" '$\"$INSTDIR\document.ico$\",0'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
