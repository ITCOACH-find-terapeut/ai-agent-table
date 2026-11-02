# Rundbordet – downloads (beta)

**Dansk** · [English below](#english)

Rundbordet er et bord, hvor flere AI-stole arbejder sammen om din opgave, og hvor **du** beslutter, hvad der går videre. Alt ligger lokalt hos dig. Dine API-nøgler gemmes krypteret på din maskine og sendes kun direkte til den udbyder, du selv vælger.

> **Beta.** Det er en prøveversion. Den kan have fejl, og den er endnu ikke signeret. Der er ikke noget salg eller nogen licens endnu.

Dette repo indeholder **kun færdige programfiler**. Kildekoden er privat.

## Hent

Gå til [**Releases**](../../releases/latest) og vælg filen til din maskine:

| System | Fil |
|---|---|
| Mac med Apple-chip (M1 eller nyere) | `Rundbordet-<version>-arm64.dmg` |
| Mac med Intel-chip | `Rundbordet-<version>-x64.dmg` |
| Windows (installer) | `Rundbordet-<version>-x64.exe` |
| Windows (uden installer) | `Rundbordet-<version>-win-x64-uden-installer.zip` |

Er du i tvivl om din Mac: Apple-menuen → *Om denne Mac*.

## Tjek at filen er uændret

Hver udgivelse har en fil `SHA256SUMS.txt` med filernes checksummer. På Mac:

```bash
shasum -a 256 Rundbordet-<version>-arm64.dmg
```

Tallet skal være det samme som i `SHA256SUMS.txt`. På Windows (PowerShell): `Get-FileHash .\Rundbordet-<version>-x64.exe -Algorithm SHA256`.

## Første gang du åbner appen

Programmet er ikke signeret endnu, så dit system advarer:

- **Mac:** Træk appen til *Programmer*, og åbn den. macOS siger, at appen ikke kan åbnes: tryk **Færdig**. Åbn så *Systemindstillinger → Anonymitet og sikkerhed*, rul ned til *Sikkerhed*, tryk **Åbn alligevel** ved Rundbordet, og bekræft med din adgangskode eller Touch ID. (På macOS før version 15 kan du i stedet højreklikke på appen → **Åbn** → **Åbn**.) Det er kun nødvendigt første gang.
- **Windows:** Hvis SmartScreen advarer: **Flere oplysninger** → **Kør alligevel**.

## Rettigheder

© 2026 eterapeut.dk. Alle rettigheder forbeholdes. Programmet leveres "som det er", uden nogen form for garanti. Den endelige slutbrugerlicens er ikke på plads endnu.

---

## English

Rundbordet ("the round table") lets several AI seats work together on your task, while **you** decide what moves forward. Everything stays local. Your API keys are stored encrypted on your machine and sent only directly to the provider you choose.

> **Beta.** This is a preview. It may have bugs and is not yet code-signed. There is no sale or licence yet.

This repository contains **release binaries only**. The source code is private.

### Download

Open [**Releases**](../../releases/latest) and pick the file for your machine:

| System | File |
|---|---|
| Mac, Apple silicon (M1 or later) | `Rundbordet-<version>-arm64.dmg` |
| Mac, Intel | `Rundbordet-<version>-x64.dmg` |
| Windows (installer) | `Rundbordet-<version>-x64.exe` |
| Windows (portable, no installer) | `Rundbordet-<version>-win-x64-uden-installer.zip` |

### Verify the download

Each release has a `SHA256SUMS.txt`. On Mac run `shasum -a 256 <file>`; on Windows (PowerShell) `Get-FileHash <file> -Algorithm SHA256`. The value must match.

### First launch

The app is not signed yet, so your system will warn you:

- **Mac:** drag the app to *Applications* and open it. macOS says the app cannot be opened: press **Done**. Then open *System Settings → Privacy & Security*, scroll down to *Security*, press **Open Anyway** next to Rundbordet, and confirm with your password or Touch ID. (On macOS before version 15 you can instead right-click the app → **Open** → **Open**.) You only need to do this the first time.
- **Windows:** if SmartScreen warns, choose **More info** → **Run anyway**.

### Rights

© 2026 eterapeut.dk. All rights reserved. The program is provided "as is", without warranty of any kind. The final end-user licence is not in place yet.
