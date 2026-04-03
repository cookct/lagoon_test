; Lagoon Windows Installer
; Requires Inno Setup 6.3+  https://jrsoftware.org/isinfo.php
;
; Build:
;   GUI  — open this file in the Inno Setup IDE and press F9
;   CLI  — iscc.exe installer\lagoon_setup.iss
;
; Output: installer\LagoonSetup-1.3.exe

#define AppName      "Lagoon"
#define AppVersion   "1.3"
#define AppPublisher "Lagoon"
#define AppURL       "https://github.com/GenXennial/Lagoon"
#define SourceDir    ".."

; ─── [Setup] ──────────────────────────────────────────────────────────────────

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/issues
VersionInfoVersion={#AppVersion}

; Install to user's AppData — no UAC dialog needed
DefaultDirName={localappdata}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes

; Output
OutputDir=.
OutputBaseFilename=LagoonSetup-{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
DiskSpanning=no

; Look and feel
WizardStyle=modern
WizardSizePercent=120
DisableWelcomePage=no
LicenseFile=

; Privileges
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=

; Windows 10+ required
MinVersion=10.0.17763

; Uninstaller
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\images\lagoon-icon.ico

; ─── [Languages] ──────────────────────────────────────────────────────────────

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

; ─── [Messages] ───────────────────────────────────────────────────────────────

[CustomMessages]
WelcomeLabel2=This will install [name/ver] on your computer.%n%nLagoon is a local AI writing environment for collaborative fiction. It runs entirely on your machine — nothing is uploaded or stored in the cloud.%n%nClick Next to continue.
FinishedHeadingLabel=Lagoon is installed.
FinishedLabelNoIcons=Lagoon was successfully installed to [dir].%n%nClick Finish to launch it — your browser will open automatically.

; ─── [Tasks] ──────────────────────────────────────────────────────────────────

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

; ─── [Files] ──────────────────────────────────────────────────────────────────

[Files]
; ── Core Python files ────────────────────────────────────────────
Source: "{#SourceDir}\app.py";              DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\config.py";           DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\requirements.txt";    DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\setup.py";            DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\style.css";           DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\index.html";          DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\system_prompts.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\model_configs.json";  DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\lagoon_macros.json";  DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\app_config.json.example"; DestDir: "{app}"; Flags: ignoreversion

; ── Python packages (subdirs, skip pyc/__pycache__) ──────────────
Source: "{#SourceDir}\routes\*";   DestDir: "{app}\routes";   Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pyc,__pycache__"
Source: "{#SourceDir}\services\*"; DestDir: "{app}\services"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pyc,__pycache__"

; ── Frontend ─────────────────────────────────────────────────────
Source: "{#SourceDir}\js\*";    DestDir: "{app}\js";    Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceDir}\css\*";   DestDir: "{app}\css";   Flags: ignoreversion recursesubdirs createallsubdirs

; ── Static assets ────────────────────────────────────────────────
; Exclude dev screenshots from the images dir
Source: "{#SourceDir}\images\*";        DestDir: "{app}\images";        Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "Screenshot*,*.webp"

; ── Demo characters ──────────────────────────────────────────────
Source: "{#SourceDir}\sample_configs\*"; DestDir: "{app}\sample_configs"; Flags: ignoreversion recursesubdirs createallsubdirs

; ── Launcher scripts (copied from installer\ to {app}) ───────────
Source: "launch.ps1";       DestDir: "{app}"; Flags: ignoreversion
Source: "stop.ps1";         DestDir: "{app}"; Flags: ignoreversion
Source: "install_deps.bat"; DestDir: "{app}"; Flags: ignoreversion

; ─── [Dirs] ───────────────────────────────────────────────────────────────────

[Dirs]
; User data directories — created but not removed on uninstall (they contain user files)
Name: "{app}\chats";           Flags: uninsneveruninstall
Name: "{app}\configs";         Flags: uninsneveruninstall
Name: "{app}\configs\.lore";   Flags: uninsneveruninstall
Name: "{app}\model_avatars";   Flags: uninsneveruninstall

; ─── [Icons] ──────────────────────────────────────────────────────────────────

[Icons]
; Start Menu
Name: "{group}\{#AppName}"; \
    Filename: "powershell.exe"; \
    Parameters: "-WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\launch.ps1"""; \
    WorkingDir: "{app}"; \
    Comment: "Start Lagoon and open in browser"

Name: "{group}\Stop {#AppName}"; \
    Filename: "powershell.exe"; \
    Parameters: "-WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\stop.ps1"""; \
    WorkingDir: "{app}"; \
    Comment: "Stop the Lagoon server"

Name: "{group}\Uninstall {#AppName}"; \
    Filename: "{uninstallexe}"

; Desktop (optional task)
Name: "{autodesktop}\{#AppName}"; \
    Filename: "powershell.exe"; \
    Parameters: "-WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\launch.ps1"""; \
    WorkingDir: "{app}"; \
    Comment: "Start Lagoon and open in browser"; \
    Tasks: desktopicon

; ─── [Run] ────────────────────────────────────────────────────────────────────
; These run during the installing phase (after file copy).

[Run]
; 1. Copy example config if app_config.json doesn't exist yet
Filename: "{cmd}"; \
    Parameters: "/c if not exist ""{app}\app_config.json"" copy ""{app}\app_config.json.example"" ""{app}\app_config.json"""; \
    Flags: runhidden waituntilterminated; \
    StatusMsg: "Creating configuration file..."

; 2. Post-install: offer to launch (first launch auto-installs deps via install_deps.bat)
Filename: "powershell.exe"; \
    Parameters: "-WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\launch.ps1"""; \
    WorkingDir: "{app}"; \
    Description: "Launch {#AppName} now"; \
    Flags: postinstall nowait skipifsilent

; ─── [UninstallRun] ───────────────────────────────────────────────────────────

[UninstallRun]
; Stop the server before uninstalling
Filename: "powershell.exe"; \
    Parameters: "-WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\stop.ps1"""; \
    Flags: runhidden waituntilterminated

; ─── [Code] ───────────────────────────────────────────────────────────────────

[Code]

function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  // Check Python 3.10+ is available
  if not Exec(ExpandConstant('{cmd}'),
    '/c python -c "import sys; sys.exit(0 if sys.version_info>=(3,10) else 1)"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
  begin
    MsgBox(
      'Python 3.10 or higher is required but was not found.' + #13#10#13#10 +
      'Download it from: https://www.python.org/downloads/' + #13#10#13#10 +
      'IMPORTANT: Check "Add Python to PATH" during installation, then re-run this installer.',
      mbError, MB_OK);
    Result := False;
  end else
    Result := True;
end;

