# Domain Hunter — Massen-Domänen-Verfügbarkeitsprüfer & Name-Generator

**Deutsch** | [English](README.md) | [Русский](README.ru.md) | [中文](README.zh.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md) | [Português](README.pt.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-gold.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/WhiteBite/Domain-Hunter?style=social)](https://github.com/WhiteBite/Domain-Hunter/stargazers)
[![Deploy](https://github.com/WhiteBite/Domain-Hunter/actions/workflows/deploy.yml/badge.svg)](https://github.com/WhiteBite/Domain-Hunter/actions/workflows/deploy.yml)

Kostenloser, quelloffener Massen-Domänen-Verfügbarkeitsprüfer und Name-Generator, der vollständig in Ihrem Browser läuft. Prüfen Sie Tausende von Domains gegen 148+ TLD-Registries über RDAP (die moderne WHOIS-Suchalternative), vergleichen Sie Preise zwischen Registraren und brainstormen Sie verfügbare Namen mit fünf integrierten Generatoren. Keine Server, keine API-Schlüssel, kein Tracking.

**[▶ Live-Demo](https://whitebite.github.io/Domain-Hunter/)** — funktioniert sofort, nichts zu installieren.

> **Dies ist ein fertiges Produkt, das Sie jetzt nutzen können.** Öffnen Sie <https://whitebite.github.io/Domain-Hunter/> und beginnen Sie sofort mit der Domänenprüfung oder Namenerzeugung. Keine Installation, keine Anmeldung, keine API-Schlüssel, kein Tracking. Die gesamte App kompiliert zu einer einzigen HTML-Datei (`dist/index.html`), die auch offline von `file://` funktioniert. Laden Sie sie herunter, teilen Sie sie, starten Sie sie überall.

![Domain Hunter prüft fünf Markennamen über 15 TLDs — Streaming-Ergebnisse mit Status-Badges, Erstjahres- und Verlängerungspreisen, CSV-Export](docs/screenshot-en-check.png)

Domain Hunter ruft Registry-**RDAP**-Endpunkte direkt aus dem Browser heraus auf (Verisign, Google Registry, Identity Digital, CentralNic, Radix…), um Ihnen mitzuteilen, welche Domänen verfügbar sind. Er erzeugt markenfähige Name-Ideen mit fünf integrierten Generatoren, zeigt **Live-Registrar-Preise** mit 3-Jahres-Gesamtbetriebskosten und exportiert alles nach CSV, TSV oder Markdown. Es ist eine datenschutzfreundliche Alternative zu WHOIS-Suchdiensten und bezahlten Domain-APIs wie WhoisXML oder DomainTools — die gesamte App kompiliert zu einer einzigen selbständigen HTML-Datei, die auch von `file://` funktioniert.

## So prüfen Sie Domänenverfügbarkeit im Massenverfahren

Fügen Sie bis zu 3 000 Domänennamen ein, wählen Sie die TLDs aus, die Sie interessieren, und starten Sie den Lauf. Ergebnisse streamen live in eine sortierbare Tabelle mit Status-Badges, Preisspalten und Kauf-Links pro Domain. Abgebrochene Läufe können später fortgesetzt werden.

- **148 kuratierte TLD-Zonen** auf 18 Registry-Infrastrukturen (`com net io ai dev app xyz me co uk de nl fr ch so ly tech site online store cloud` und mehr). Neue gTLDs werden automatisch über den Live-IANA-RDAP-Bootstrap entdeckt. Ergebnisse streamen live in eine sortierbare Tabelle mit Status-Badges, Preisspalten und Kauf-Links pro Domain. Abgebrochene Läufe können später fortgesetzt werden. Der Ausführungsverlauf mit Ein-Klick-Wiederherstellung hält Ihre letzte Suche nach dem Neuladen bereit.
- **Ehrliche Drei-Zustands-Ergebnisse** — `available`, `probably_available` oder `unknown`. Bei Low-Trust-cCTLDs wird ein 404 mit DNS-over-HTTPS (Cloudflare + Google DNS) korroboriert, bevor etwas als verfügbar bezeichnet wird. Domain Hunter rät niemals.
- **Cloudflare-RDAP-Aggregator-Fallback** — wenn der primäre RDAP-Fetch fehlschlägt, wird `rdap.cloudflare.com/domain/{domain}` einmal als Transport-Fallback und als Widerspruchskreuzprüfung für Low-Trust-Zonen abgefragt. Eine belegte Domain darf niemals als frei gemeldet werden.
- **Höflich gegenüber Registries** — pro-Infrastruktur AIMD-Ratenbegrenzung (die strenge ~1 rps von Google Registry wird eingehalten), automatisches Backoff bei HTTP 429 mit `Retry-After` und Ergebniscaching in `localStorage`.

## So vergleichen Sie Domänenpreise zwischen Registraren

Der **Preise-Tab** zeigt eine TLD × Registrar-Preismatrix mit hervorgehobener günstigster Zelle, Promo-Fallen-Kennzeichnungen (Verlängerung ≥ 5× Erstjahr) und einem exportierbaren CSV. Die Ergebnistabelle enthält eine Detailzeile mit vollständiger **Registrar-Preisvergleich** und anklickbaren Kauf-/Such-Links für jede verfügbare Domain.

- **Live-Preise** von Porkbun und Cloudflare zum Selbstkostenpreis sowie wöchentliche Snapshots von Dynadot, Spaceship, ValueDomain, reg.ru und Beget, eingesammelt via regctl.sh.
- **Gutscheine, Promo-Fallenerkennung** und 3-Jahres-TCO-Sortierung. Preise angezeigt in USD, RUB oder EUR.
- **Coverage-bewusste Kauf-Links** zielen auf den günstigsten Registrar mit Deep-Link-Vorlage, nicht bloß den günstigsten Preis in der Tabelle.

## So finden Sie verfügbare Domänennamen-Ideen

Fünf Generatoren produzieren Kandidaten, die Sie sofort prüfen können:

1. **Combinator** — Wurzeln × Affixe (Präfix, Suffix, beide)
2. **Silbenmischer** — Aussprechbarkeits-bewertete Neologismen aus CMUdict-abgeleiteten Silbenbanken
3. **Thematische Wortsets** — kuratierte Kategorien (Technologie, Natur, Mythologie, Farben, Sternbilder)
4. **TLD-Hacks** — `family` → `fami.ly`-artige Aufteilungen mit hackbaren TLDs
5. **Wortmutationen** — Vokaltausch, Konsonantenverschiebungen, Stutzung, Suffixe

Jeder Kandidat sammelt sich in einer persistenten Ablage, die Tab-Weiche übersteht und die projektierte Anzahl von Prüfungen vor dem Ausführen anzeigt.

## Gelöschte Domänen zum Registrierungspreis

Der **Drops-Tab** scannt abgelaufene/gelöschte Domänen und meldet diejenigen, die noch zum Standard-Registrierungspreis verfügbar sind — keine Aftermarket-Aufschläge. Markieren Sie eine beliebige Domain mit einem Stern, um sie zu Ihrer Watchlist hinzuzufügen; die App überprüft favorisierte Domänen beim Laden stillschweigend neu und kennzeichnet Freigabe- oder Belegungsänderungen.

## Social Handles

Der **Social-Tab** prüft die Verfügbarkeit von Benutzernamen auf großen Plattformen (Twitter/X, GitHub, Instagram, YouTube, TikTok, Twitch, Reddit, Telegram), damit Sie einen konsistenten Handle überall sichern können.

## Exportieren, teilen und organisieren

- **CSV-Download** — Excel-kompatible Datei mit BOM und korrekter Anführungszeichen
- **Kopieren als CSV / Markdown / TSV** — Zwischenformate zum Einfügen in Tabellenkalkulationen, Dokumente oder Notion
- **Massenaktionen für verfügbare Domains** — kopieren Sie die Liste aller verfügbaren Domains, markieren Sie sie alle auf einmal als Favorit oder exportieren Sie ein nur-verfügbar-CSV
- **Share-Links** — `#s=` kodiert Query + Zonen und startet den Lauf beim Öffnen automatisch
- **Favoriten mit Watchlist** — markieren Sie eine beliebige Domain mit einem Stern in einer persistenten Kurzliste; Freigabe-/Belegungs-Badges erscheinen beim Neuladen
- **Ausführungsverlauf** — kürzlich abgeschlossene Läufe werden lokal gespeichert; klicken Sie, um die gesamte Suche (Query, Zonen, Ergebnisse) mit einem Tippen wiederherzustellen
- **Letzte-Suche-Wiederherstellung** — nach einem Seitenneuladen stellt die App Ihre vorherige Eingabe und Zonenauswahl wieder, sodass Sie sofort fortfahren können
- **Social-Checks mit GitHub-Token** — der Social-Tab unterstützt optionale GitHub Device-Flow-Authentifizierung für username-Lookups mit höherer Rate
- **Registrar-Favicon-Badges** — Preiszellen zeigen Registrar-Logos neben Preisen zum schnellen visuellen Scannen

## Tastenkürzel

| Kürzel | Aktion |
|---|---|
| `/` | Fokus auf die Suchbox der Ergebnisse |
| `Ctrl` + `Enter` | Prüfung vom Eingabefeld aus starten |
| `Escape` | Popovers und Menüs schließen |

## Themen

Premium-Dunkel- und -hellthemen mit sanften Übergängen, Systempräferenz-Erkennung und manuellem Umschalter in der Kopfzeile. Alle UI-Elemente folgen WCAG-AA-Kontrastverhältnissen.

## Mehrsprachige Oberfläche

Verfügbar in **8 Sprachen**: Englisch, Russisch, Spanisch, Deutsch, Portugiesisch, Chinesisch, Japanisch und Französisch. Wechseln Sie über das Sprachmenü in der Kopfzeile.

![Domain Hunter Name-Generatoren im Dunkelthema: Combinator, Silbenmischer, thematische Wortsets, TLD-Hacks und Mutationen](docs/screenshot-en-generators.png)

## Schnellstart

Der Build ist eine einzige selbständige HTML-Datei — öffnen und sie funktioniert:

- **Die gehostete Version nutzen:** <https://whitebite.github.io/Domain-Hunter/>
- **Lokal ausführen:** [`dist/index.html`](dist/index.html) direkt von der Festplatte öffnen (`file://` wird vollständig unterstützt).
- **Aus dem Quellcode bauen:**

```bash
npm install
npm run build     # erzeugt dist/index.html — eine Datei, alles inline
npm run dev       # Vite-Dev-Server für Entwicklung
```

Kein Backend, keine Umgebungsvariablen, keine API-Schlüssel — nie.

## Stellen Sie Ihre eigene Kopie bereit

**GitHub Pages** (am einfachsten):

1. Forken Sie dieses Repository.
2. Settings → Pages → Source: **GitHub Actions** (der beiliegende `deploy.yml`-Workflow baut und veröffentlicht automatisch bei jedem Push auf `main`).
3. Ihre Kopie ist live unter `https://<sie>.github.io/Domain-Hunter/`.

**Cloudflare Pages:** Repository importieren, Build-Befehl `npm run build`, Ausgabeverzeichnis `dist`.

**Jeden statischen Host oder Festplatte:** `dist/index.html` bereitstellen oder öffnen. Alle Pfade sind relativ (`base: './'`), also funktioniert es unter jedem Sub-Pfad.

## Anleitungen

Schritt-für-Schritt-Artikel, die parallel zur App veröffentlicht werden:

- [So prüfen Sie Domänenverfügbarkeit im Massenverfahren](https://whitebite.github.io/Domain-Hunter/how-to-check-domain-availability-in-bulk.html) — RDAP-Methode, schrittweise Massenprüfung, Vertrauens- und Ratenbegrenzungs-Kaveats
- [Domänennamen-Ideen, die tatsächlich verfügbar sind](https://whitebite.github.io/Domain-Hunter/domain-name-ideas-that-are-actually-available.html) — fünf Naming-Techniken: Kombinatorik, Silben, TLD-Hacks, Mutationen, Themen

## RDAP vs WHOIS

WHOIS liefert unstrukturierten Text — eine menschlich lesbare Wand von Absätzen, die programmatisch schwer zu parsen und im großen Maßstab langsam zu automatisieren ist. RDAP (Registration Data Access Protocol, standardisiert als [RFC 9083](https://www.rfc-editor.org/rfc/rfc9083)) ist sein JSON-Nachfolger: strukturiert, maschinenlesbar und für API-Verbrauch konzipiert. Jeder Endpunkt, den Domain Hunter verwendet, sendet permissive CORS-Headers, also ruft Ihr Browser Registries direkt ohne Proxy auf. Das macht Massenprüfung schnell, ratenbegrenzungsfreundlich und kostenlos.

## Für wen ist es

- **Domain-Investoren & Drop-Catcher** — überwachen Sie eine Watchlist von Hunderten von Namen über 148+ TLDs, verfolgen Sie gelöschte/abgelaufene Domänen und exportieren Sie Freigabe- oder Belegungsänderungen in CSV.
- **Marken-Naming** — fünf Generatoren (Combinator, Silbenmischer, thematische Sets, TLD-Hacks, Mutationen) produzieren Kandidaten, die Sie sofort prüfen können.
- **Entwickler** — Einzeldatei-MIT-Build, eingebettbar, kein Backend, keine Abhängigkeiten. Forken, bereitstellen, erweitern.
- **Datenschutz-bewusste Nutzer** — keine Konten, keine Logs, keine Analytics. Alles läuft lokal in Ihrem Browser.

## Wie es funktioniert

1. Der Browser spricht **direkt mit Registry-RDAP-Endpunkten** — alle von Domain Hunter verwendeten Endpunkte haben offenes CORS, also wird kein Server oder Proxy benötigt.
2. **HTTP 200 → belegt**, **404 → nicht in der Registry** (danach gelten Vertrauensregeln: High-Trust-gTLDs melden `available`; Low-Trust-cCTLDs werden über DNS-over-HTTPS doppelt geprüft und als `probably_available` gemeldet).
3. **429 / 5xx → Wiederholung mit Backoff**; bei anhaltenden Netzwerk- oder CORS-Fehlern wird einmal der Cloudflare-RDAP-Aggregator versucht, dann übernimmt DoH-Korroborationsprüfung.
4. Ergebnisse werden lokal mit konfigurierbarer TTL zwischengespeichert; Neuprüfung ist ein Klick, und ein „Cache ignorieren"-Schalter erzwingt frische Abfragen.

## Unterstützte Zonen

148 kuratierte Zonen gruppiert nach Registry-Infrastruktur: Verisign (`com net cc tv`), Google Registry (`dev app page new day how ing meme zip mov foo dad phd prof esq nexus rsvp soy boo channel`), Identity Digital (`io ai me sh ac pro info live world email studio agency` und 54 weitere), CentralNic (`xyz lol icu cyou bond sbs cfd art` und 21 weitere), Radix (`tech site online fun space store website press host uno pw`), Uniregistry (`cloud link top win bid loan men`), Stealth-cCTLD-Endpunkte (`de co us uk nl fr ch ru so ly pl`) und NASK Polen (`pl`). Der Live-IANA-Bootstrap fügt neu delegierte gTLDs automatisch hinzu.

Fehlt eine Zone? Sie ist datengetrieben — ein Eintrag in `src/config/tlds.json` reicht aus, keine Codeänderungen nötig.

## Domain Hunter im Vergleich zu Alternativen

| | Domain Hunter | Registrar-Suchfelder | `whois` CLI | Bezahlte APIs (WhoisXML, DomainTools) |
|---|---|---|---|---|
| Preis | Kostenlos, MIT | Kostenlos (bindet an einen Registrar) | Kostenlos | Ab ~$19/Monat |
| Massenprüfung | 3 000 Namen × 148+ TLDs | Einer nach dem anderen | Scripting erforderlich | Ja, abgerechnet |
| Server / API-Schlüssel | **Keine — läuft im Browser** | N/A | Lokale Installation | API-Schlüssel + Abrechnung |
| Name-Generatoren | 5 integriert | Basisvorschläge | Keine | Keine |
| Live-Preise + 3-Jahres-TCO | Multi-Registrar-Vergleich | Nur eigene Preise | Keine | Extra-Gebühr |
| Exportformate | CSV, TSV, Markdown, Share-Links | Keine | Manuell | Hängt ab |
| Datenschutz | Kein Tracking, nur lokal | Suchverlauf protokolliert | Privat | Query-Logs |
| Qualität der Namen-Ideen | 5 Generatoren (Combinator, Silben, Themen, TLD-Hacks, Mutationen) | Basisvorschläge | Keine | Keine |

Wählen Sie eine bezahlte API, wenn Sie garantierte SLAs, Premium-Domain-Preisfeeds oder Millionen von Prüfungen pro Tag benötigen. Wählen Sie Domain Hunter, wenn Sie eine schnelle, kostenlose und private Möglichkeit wollen, um Hunderte von Kandidaten jetzt zu brainstormen und zu validieren.

## FAQ

### Wie kann es Domänen ohne Server oder API-Schlüssel prüfen?

Registries exponieren RDAP (Registration Data Access Protocol, der moderne Nachfolger von WHOIS) über HTTPS, und die Endpunkte, die Domain Hunter verwendet, senden permissive CORS-Headers. Ihr Browser ruft sie direkt auf, genau wie er jede öffentliche API aufruft. Ein optionaler benutzergestellter Cloudflare-Worker-Proxy kann für hartnäckige Endpunkte übernehmen.

### Ist der "Verfügbar"-Status genau?

Für ICANN-vertragete gTLD-Infrastruktur (Verisign, Google, Identity Digital, …) ist ein RDAP-404 autoritativ. Für cCTLDs mit weniger zuverlässigem RDAP korroboriert Domain Hunter mit DNS-NS-Lookups via DoH und meldet `probably_available` statt zu viel zu versprechen. Eine Domain kann immer noch von jemand anderem Sekunden später registriert werden — eine Prüfung ist ein Schnappschuss, also kaufen Sie zügig.

### Ist die Domänenprüfung via RDAP legal und höflich gegenüber Registries?

Ja. RDAP ist die eigene öffentliche, maschinenlesbare Schnittstelle der Registries (sie existiert precisely, um gecrapptes WHOIS zu ersetzen). Domain Hunter verteilt Anfragen pro Infrastruktur, ehrt `Retry-After` und drosselt exponentiell bei Drosselung — z.B. erhält Google Registry höchstens ~1 Anfrage/Sekunde. Die globaleConcurrency-Grenze hält alles vernünftig.

### Was ist eine Promo-Falle und warum zählt der Verlängerungspreis?

Einige Registrar werben mit $0,99 Erstjahr, verlangen aber $25 zur Verlängerung. Domain Hunter kennzeichnet diese als **Promo-Fallen**, wenn der Verlängerungspreis das 5-Fache oder mehr des Erstjahrespreises beträgt. Überprüfen Sie immer die Verlängerungsspalte und den 3-Jahres-TCO, nicht nur den Kopftextpreis.

### Unterstützt ihr IDN und cCTLDs wie .ru oder .de?

Internationalisierte Domänennamen werden automatisch in Punycode konvertiert. `de co us uk nl fr ch ru so ly pl` werden über dedizierte RDAP-Endpunkte unterstützt (`ru` ist aufgrund von Geo-Einschränkungen ihres RDAP als experimentell markiert — der optionale Proxy-Fallback deckt solche Fälle ab).

### Kann es offline oder von Festplatte laufen?

Ja. Der Produktionsbuild ist eine einzelne `index.html`-Datei, die von `file://` mit null Netzwerk-Anfragen funktioniert. Preisdaten fallen auf einen eingebauten Snapshot zurück; Verfügbarkeitsprüfungen benötigen eine Netzwerkverbindung, um RDAP-Endpunkte zu erreichen.

### Wie wird "Verfügbar" für cCTLDs bestimmt?

Ein cCTLD-404 löst zwei parallele Prüfungen aus: eine DNS-over-HTTPS-NS-Sonde (Cloudflare + Google DNS) und, wenn verfügbar, eine Cloudflare-RDAP-Aggregator-Abfrage. Wenn der Aggregator 200 zurückgibt, wird die Domain als `taken` markiert, unabhängig vom DoH-Ergebnis. Andernfalls gilt das DoH-Ergebnis: NXDOMAIN → `probably_available`, NOERROR → `taken`, sonst → `unknown`.

### Wo werden meine Daten gespeichert?

Überall außer in Ihrem Browser. Einstellungen, Cache, Favoriten und benutzerdefinierte Wortsets leben in `localStorage` unter `dh:v1:*`-Keys. Kein Konto, kein serverseitiger Zustand und keine Analytics irgendeiner Art.

## Technologiestack

Svelte 5 + TypeScript (strict), Vite 7 und `vite-plugin-singlefile` — die gesamte App (JS, CSS, Schriftarten, Web-Worker-Prüfengine) kompiliert zu **einer einzigen HTML-Datei**, die auch von `file://` funktioniert. Tests verwenden Vitest für reine Logik und Playwright E2E (mit gemocktem Netzwerk) für UI; CI stellt auf GitHub Pages via GitHub Actions bereit.

## Mitwirken

Issues und PRs sind willkommen. Gute erste Beiträge: neue kuratierte Zonen (`src/config/tlds.json` bearbeiten), neue thematische Wortsets (`src/config/dictionaries/`), Übersetzungen (`src/i18n/`). Siehe [AGENTS.md](AGENTS.md) für Build/Test-Befehle und Projektkonventionen.

## Zitieren

Wenn Sie Domain Hunter in akademischen oder technischen Arbeiten referenzieren, verwenden Sie bitte die Metadaten in [`CITATION.cff`](CITATION.cff):

```bibtex
@software{domain_hunter_2026,
  author = {WhiteBite},
  title = {Domain Hunter — Bulk Domain Availability Checker & Name Generator},
  version = {2.0.0},
  year = {2026},
  url = {https://github.com/WhiteBite/Domain-Hunter},
  license = {MIT}
}
```

## Lizenz

[MIT](LICENSE) — machen Sie, was Sie wollen, Namensnennung wird geschätzt.

---

[![Star History Chart](https://api.star-history.com/svg?repos=WhiteBite/Domain-Hunter&type=Date)](https://star-history.com/#WhiteBite/Domain-Hunter&Date)

Wenn Domain Hunter Ihnen Zeit gespart hat, hilft ein ⭐ anderen, es ebenfalls zu finden.
