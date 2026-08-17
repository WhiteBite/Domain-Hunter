# Dictionary Data Licenses

Every dataset used by Domain Hunter's generators is attributed below. Only **derived**
JSON is committed to this repository; raw corpora are never committed.

| Dataset | Source URL | License | What was derived |
|---|---|---|---|
| dwyl/english-words | https://github.com/dwyl/english-words | Unlicense | `words-common.json` — frequency-ranked common English words (3–12 chars) |
| first20hours/google-10000-english | https://github.com/first20hours/google-10000-english | Public Domain | Frequency ranking for `words-common.json` (intersect with dwyl list) |
| dariusk/corpora | https://github.com/dariusk/corpora | CC0 1.0 Universal | `themes/animals.json`, `themes/nature.json`, `themes/food.json`, `themes/space.json` (partial) |
| meodai/color-names | https://github.com/meodai/color-names | MIT | `themes/colors.json` (curated "best of" subset) |
| repushko/mythology_names_dataset | https://github.com/repushko/mythology_names_dataset | CC0 1.0 Universal | `themes/mythology.json` (names + pantheon hints) |
| latincy/verba | https://github.com/latincy/verba | CC0 1.0 Universal | `themes/latin.json` (short Latin word sample) |
| pirtleshell/constellations | https://github.com/pirtleshell/constellations | MIT | Merged into `themes/space.json` (constellation names + meaning hints) |
| cmusphinx/cmudict | https://github.com/cmusphinx/cmudict | BSD-2-Clause | `syllables.json` — onset/rime inventories derived from pronunciation data |

All licenses are permissive (Unlicense, CC0, MIT, BSD-2-Clause, Public Domain).
No GPL or CC-BY-SA content is used.
