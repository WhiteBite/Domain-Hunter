# Domain Hunter — Verificador de disponibilidade de domínios em massa e gerador de nomes

**Português** | [English](README.md) | [Русский](README.ru.md) | [中文](README.zh.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-gold.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/WhiteBite/Domain-Hunter?style=social)](https://github.com/WhiteBite/Domain-Hunter/stargazers)
[![Deploy](https://github.com/WhiteBite/Domain-Hunter/actions/workflows/deploy.yml/badge.svg)](https://github.com/WhiteBite/Domain-Hunter/actions/workflows/deploy.yml)

Verificador gratuito e de código aberto de disponibilidade de domínios em massa e gerador de nomes que roda inteiramente no seu navegador. Verifique milhares de domínios contra mais de 148 registros de TLD via RDAP (a alternativa moderna à busca WHOIS), compare preços entre registradoras e crie ideias de nomes disponíveis com cinco geradores embutidos. Sem servidores, sem chaves de API, sem rastreamento.

**[▶ Demonstração ao vivo](https://whitebite.github.io/Domain-Hunter/)** — funciona na hora, nada para instalar.

> **Este é um produto pronto para uso agora.** Abra <https://whitebite.github.io/Domain-Hunter/> e comece a verificar domínios ou gerar nomes imediatamente. Sem instalação, sem cadastro, sem chaves de API, sem rastreamento. Todo o aplicativo compila em um único arquivo HTML (`dist/index.html`) que também funciona offline a partir de `file://`. Baixe, compartilhe, execute em qualquer lugar.

![Domain Hunter verificando cinco nomes de marca em 15 TLDs — resultados em streaming com badges de status, preços do primeiro ano e de renovação, exportação CSV](docs/screenshot-en-check.png)

O Domain Hunter chama endpoints **RDAP** de registos diretamente do navegador (Verisign, Google Registry, Identity Digital, CentralNic, Radix…) para informar quais domínios estão disponíveis. Gera ideias de nomes com marca usando cinco geradores embutidos, mostra **preços ao vivo de registradoras** com custo total de propriedade de 3 anos e exporta tudo para CSV, TSV ou Markdown. É uma alternativa respeitosa com a privacidade aos serviços de busca WHOIS e APIs pagas de domínio como WhoisXML ou DomainTools — todo o aplicativo compila em um único arquivo HTML autossuficiente que também funciona a partir de `file://`.

## Como verificar a disponibilidade de domínios em massa

Cole até 3 000 nomes de domínio, escolha os TLDs que interessam e pressione iniciar. Os resultados fluem ao vivo para uma tabela ordenável com badges de status, colunas de preços e links de compra por domínio. Execuções interrompidas podem ser retomadas depois.

- **148 zonas TLD curadas** em 18 infraestruturas de registro (`com net io ai dev app xyz me co uk de nl fr ch so ly tech site online store cloud` e mais). Novos gTLDs são descobertos automaticamente via bootstrap RDAP da IANA ao vivo. Os resultados fluem ao vivo para uma tabela ordenável com badges de status, colunas de preços e links de compra por domínio. Execuções interrompidas podem ser retomadas depois. O histórico de execução com restauração em um clique mantém sua última pesquisa pronta após recarregar.
- **Resultados honestos em três estados** — `available`, `probably_available` ou `unknown`. Para ccTLDs de baixa confiança, um 404 é corroborado com DNS-over-HTTPS (Cloudflare + Google DNS) antes que algo seja declarado disponível. O Domain Hunter nunca adivinha.
- **Fallback do agregador RDAP da Cloudflare** — quando a busca RDAP primária falha, `rdap.cloudflare.com/domain/{domain}` é consultado uma vez como fallback de transporte e como verificação cruzada de contradição para zonas de baixa confiança. Um domínio ocupado nunca deve ser reportado como livre.
- **Cortesia com os registos** — limitação de taxa AIMD por infraestrutura (o rigoroso ~1 rps do Google Registry é respeitado), retrocesso automático em HTTP 429 com `Retry-After` e cache de resultados no `localStorage`.

## Como comparar preços de domínios entre registradoras

A **aba Preços** mostra uma matriz de preços TLD × registradora com a célula mais barça destacada, sinalizações de armadilha promocional (renovação ≥ 5× primeiro ano) e um CSV exportável. A tabela de resultados inclui uma linha de detalhe com **comparação completa de preços de registradoras** e links de compra/busca clicáveis para cada domínio disponível.

- **Preços ao vivo** da Porkbun e Cloudflare a custo, mais instantâneos semanais da Dynadot, Spaceship, ValueDomain, reg.ru e Beget coletados via regctl.sh.
- **Cupons, detecção de armadilhas promocionais** e ordenação por TCO de 3 anos. Preços exibidos em USD, RUB ou EUR.
- **Links de compra conscientes de cobertura** apontam para a registradora mais barata que tenha um template de link profundo, não meramente o preço mais baixo na tabela.

## Como encontrar ideias de nomes de domínio disponíveis

Cinco geradores produzem candidatos que você pode verificar imediatamente:

1. **Combinador** — raízes × afixos (prefixo, sufixo, ambos)
2. **Misturador de sílabas** — neologismos com pontuação de pronunciabilidade oriundos de bancos de sílabas derivados do CMUdict
3. **Conjuntos temáticos de palavras** — categorias curadas (tecnologia, natureza, mitologia, cores, constelações)
4. **TLD-hacks** — `family` → `fami.ly` estilo splits usando TLDs hackeáveis
5. **Mutações de palavras** — trocas de vogais, mudanças de consoantes, truncamento, sufixos

Cada candidato se acumula em uma bandeja persistente que sobrevive a trocas de aba e mostra o número projetado de verificações antes de executá-las.

## Domínios expirados a preço de registro

A **aba Drops** escaneia domínios expirados/excluídos e reporta aqueles ainda disponíveis ao preço padrão de registro — sem acréscimos de mercado secundário. Marque qualquer domínio com uma estrela para adicioná-lo à sua lista de vigilância; o aplicativo re-verifica silenciosamente os domínios favoritos ao carregar e sinaliza mudanças de liberados ou ocupados.

## Redes sociais

A **aba Social** verifica a disponibilidade de nomes de usuário nas plataformas principais (Twitter/X, GitHub, Instagram, YouTube, TikTok, Twitch, Reddit, Telegram) para que você possa garantir um handle consistente em todos os lugares.

## Exportar, compartilhar e organizar

- **Download CSV** — arquivo compatível com Excel com BOM e aspas adequadas
- **Copiar como CSV / Markdown / TSV** — formatos de área de transferência para colar em planilhas, documentos ou Notion
- **Ações em massa para domínios disponíveis** — copie a lista de todos os domínios disponíveis, marque-os todos de uma vez como favoritos ou exporte um CSV apenas de disponíveis
- **Links de compartilhamento** — `#s=` codifica consulta + zonas e inicia automaticamente a execução ao abrir
- **Favoritos com lista de vigilância** — marque qualquer domínio com uma estrela em uma mini-lista persistente; badges de liberados/ocupados aparecem ao recarregar
- **Histórico de execuções** — execuções concluídas recentes são salvas localmente; clique para restaurar toda a pesquisa (consulta, zonas, resultados) em um toque
- **Restaurar última pesquisa** — após recarregar a página, o aplicativo restaura sua entrada e seleção de zona anteriores para que você possa retomar instantaneamente
- **Verificações sociais com token do GitHub** — a aba Social suporta autenticação opcional por fluxo de dispositivo do GitHub para buscas de nome de usuário com maior taxa
- **Badges de favicon de registradoras** — células de preço mostram logotipos de registradoras junto aos preços para varredura visual rápida

## Atalhos de teclado

| Atalho | Ação |
|---|---|
| `/` | Focar a caixa de busca dos resultados |
| `Ctrl` + `Enter` | Iniciar a verificação a partir do campo de entrada |
| `Escape` | Fechar popovers e menus |

## Temas

Temas premium escuros e claros com transições suaves, detecção de preferência do sistema e um interruptor manual no cabeçalho. Todos os elementos da interface seguem proporções de contraste WCAG AA.

## Interface multilíngue

Disponível em **8 idiomas**: inglês, russo, espanhol, alemão, português, chinês, japonês e francês. Altere pelo menu de idiomas do cabeçalho.

![Domain Hunter geradores de nomes no tema escuro: combinador, misturador de sílabas, conjuntos de palavras temáticas, TLD-hacks e mutações](docs/screenshot-en-generators.png)

## Início rápido

A compilação é um único arquivo HTML autossuficiente — abra e funciona:

- **Usar a versão hospedada:** <https://whitebite.github.io/Domain-Hunter/>
- **Executar localmente:** abra [`dist/index.html`](dist/index.html) direto do disco (`file://` é totalmente suportado).
- **Compilar a partir do código-fonte:**

```bash
npm install
npm run build     # produz dist/index.html — um arquivo, tudo integrado
npm run dev       # servidor de desenvolvimento Vite
```

Sem backend, sem variáveis de ambiente, sem chaves de API — nunca.

## Implante sua própria cópia

**GitHub Pages** (o mais fácil):

1. Faça um fork deste repositório.
2. Settings → Pages → Source: **GitHub Actions** (o workflow `deploy.yml` incluído compila e publica automaticamente em cada push para `main`).
3. Sua cópia estará online em `https://<voce>.github.io/Domain-Hunter/`.

**Cloudflare Pages:** importe o repositório, comando de compilação `npm run build`, diretório de saída `dist`.

**Qualquer host estático ou disco:** sirva ou abra `dist/index.html`. Todos os caminhos são relativos (`base: './'`), então funciona sob qualquer sub-caminho.

## Guias

Artigos passo a passo publicados junto com o aplicativo:

- [Como verificar a disponibilidade de domínios em massa](https://whitebite.github.io/Domain-Hunter/how-to-check-domain-availability-in-bulk.html) — método RDAP, verificação em massa passo a passo, advertências de confiança e limite de taxa
- [Ideias de nomes de domínio que realmente estão disponíveis](https://whitebite.github.io/Domain-Hunter/domain-name-ideas-that-are-actually-available.html) — cinco técnicas de naming: combinatoria, sílabas, hacks TLD, mutações, temas

## RDAP vs WHOIS

WHOIS retorna texto não estruturado — uma parede de parágrafos legíveis por humanos que é difícil de parsear programaticamente e lenta de automatizar em escala. RDAP (Registration Data Access Protocol, padronizado como [RFC 9083](https://www.rfc-editor.org/rfc/rfc9083)) é seu sucessor JSON: estruturado, legível por máquina e projetado para consumo de API. Cada endpoint que o Domain Hunter usa envia cabeçalhos CORS permissivos, então seu navegador chama os registos diretamente sem nenhum proxy. Isso torna a verificação em massa rápida, amigável com limites de taxa e gratuita.

## Para quem é

- **Investidores em domínios e drop-catchers** — monitore uma lista de vigilância de centenas de nomes em mais de 148 TLDs, acompanhe domínios expirados/excluídos e exporte mudanças de liberados ou ocupados em CSV.
- **Naming de marcas** — cinco geradores (combinador, misturador de sílabas, conjuntos temáticos, TLD-hacks, mutações) produzem candidatos que você pode verificar imediatamente.
- **Desenvolvedores** — compilação MIT em um único arquivo, embutível, sem backend, sem dependências. Faça um fork, implante, amplie.
- **Usuários preocupados com privacidade** — sem contas, sem logs, sem analíticas. Tudo roda localmente no seu navegador.

## Como funciona

1. O navegador fala **diretamente com os endpoints RDAP dos registos** — todos os endpoints usados pelo Domain Hunter têm CORS aberto, então nenhum servidor ou proxy é necessário.
2. **HTTP 200 → ocupado**, **404 → não está no registro** (depois valem as regras de confiança: gTLDs de alta confiança reportam `available`; ccTLDs de baixa confiança são duplo-verificados via DNS-over-HTTPS e reportados como `probably_available`).
3. **429 / 5xx → retry com retrocesso**; em falhas persistentes de rede ou CORS tenta-se uma vez o agregador RDAP da Cloudflare, depois a corroboração DoH assume o controle.
4. Resultados são armazenados em cache localmente com um TTL configurável; re-verificar é um clique e um toggle de "ignorar cache" força consultas frescas.

## Zonas suportadas

148 zonas curadas agrupadas por infraestrutura de registro: Verisign (`com net cc tv`), Google Registry (`dev app page new day how ing meme zip mov foo dad phd prof esq nexus rsvp soy boo channel`), Identity Digital (`io ai me sh ac pro info live world email studio agency` e mais 54), CentralNic (`xyz lol icu cyou bond sbs cfd art` e mais 21), Radix (`tech site online fun space store website press host uno pw`), Uniregistry (`cloud link top win bid loan men`), endpoints stealth de ccTLD (`de co us uk nl fr ch ru so ly pl`) e NASK Polônia (`pl`). O bootstrap IANA ao vivo adiciona gTLDs recém-delegados automaticamente.

Faltou uma zona? É orientado a dados — basta adicionar uma entrada em `src/config/tlds.json`, sem necessidade de alterações de código.

## Domain Hunter versus alternativas

| | Domain Hunter | Campos de busca de registradoras | `whois` CLI | APIs pagas (WhoisXML, DomainTools) |
|---|---|---|---|---|
| Preço | Gratuito, MIT | Gratuito (trava você em uma registradora) | Gratuito | A partir de ~$19/mês |
| Verificação em massa | 3 000 nomes × 148+ TLDs | Um de cada vez | Scripting necessário | Sim, medido |
| Servidores / chaves de API | **Nenhum — roda no navegador** | N/A | Instalação local | Chave de API + faturamento |
| Geradores de nomes | 5 embutidos | Sugestões básicas | Nenhum | Nenhum |
| Preços ao vivo + TCO de 3 anos | Comparação multi-registradora | Apenas seus próprios preços | Nenhum | Taxa extra |
| Formatos de exportação | CSV, TSV, Markdown, links de compartilhamento | Nenhum | Manual | Depende |
| Privacidade | Sem rastreamento, apenas local | Histórico de busca registrado | Privado | Logs de consulta |
| Qualidade das ideias de nomes | 5 geradores (combinador, sílabas, temas, TLD-hacks, mutações) | Sugestões básicas | Nenhum | Nenhum |

Escolha uma API paga se precisar de SLAs garantidos, feeds de preço de domínios premium ou milhões de verificações por dia. Escolha o Domain Hunter quando quiser uma maneira rápida, gratuita e privada de fazer brainstorm e validar centenas de candidatos agora mesmo.

## FAQ

### Como pode verificar domínios sem servidor ou chave de API?

Os registos expõem RDAP (Registration Data Access Protocol, o sucessor moderno do WHOIS) sobre HTTPS, e os endpoints que o Domain Hunter usa enviam cabeçalhos CORS permissivos. Seu navegador os chama diretamente, exatamente como chama qualquer API pública. Um proxy Cloudflare Worker opcional fornecido pelo usuário pode assumir o controle para endpoints teimosos.

### O status "disponível" é preciso?

Para infraestrutura gTLD com contrato ICANN (Verisign, Google, Identity Digital, …) um 404 RDAP é autoritativo. Para ccTLDs com RDAP menos confiável, o Domain Hunter corrobora com buscas NS de DNS via DoH e reporta `probably_available` em vez de prometer demais. Um domínio ainda pode ser registrado por outra pessoa segundos depois — uma verificação é uma foto instantânea, então compre rapidamente.

### Verificar domínios via RDAP é legal e cortês com os registos?

Sim. RDAP é a própria interface pública e legível por máquina dos registos (ela existe precisamente para substituir o WHOIS raspado). O Domain Hunter espaça requisições por infraestrutura, honra `Retry-After` e reduz a velocidade exponencialmente quando limitado — por exemplo, o Google Registry recebe no máximo ~1 requisição/segundo. O limite global de concorrência mantém tudo equilibrado.

### O que é uma armadilha promocional e por que o preço de renovação importa?

Algumas registradoras anunciam $0,99 no primeiro ano mas cobram $25 para renovar. O Domain Hunter marca estes como **armadilhas promocionais** quando o preço de renovação é 5× ou mais o preço do primeiro ano. Sempre verifique a coluna de renovação e o TCO de 3 anos, não apenas o preço de capa.

### Vocês suportam IDN e ccTLDs como .ru ou .de?

Nomes de domínio internacionalizados são convertidos para punycode automaticamente. `de co us uk nl fr ch ru so ly pl` são suportados via endpoints RDAP dedicados (`ru` é marcada como experimental devido a restrições geográficas no seu RDAP — o fallback opcional de proxy cobre esses casos).

### Pode rodar offline ou a partir do disco?

Sim. A compilação de produção é um único arquivo `index.html` que funciona a partir de `file://` com zero requisições de rede. Dados de preço caem em um instantâneo embutido; verificações de disponibilidade requerem conexão de rede para alcançar endpoints RDAP.

### Como "disponível" é determinado para ccTLDs?

Um 404 de ccTLD dispara duas verificações paralelas: uma sonda NS DNS-over-HTTPS (Cloudflare + Google DNS) e, quando disponível, uma consulta ao agregador RDAP da Cloudflare. Se o agregador retornar 200 o domínio é marcado `taken` independentemente do resultado DoH. Caso contrário o resultado DoH permanece: NXDOMAIN → `probably_available`, NOERROR → `taken`, outro → `unknown`.

### Onde meus dados são armazenados?

Em nenhum lugar exceto no seu navegador. Configurações, cache, favoritos e conjuntos de palavras personalizados vivem no `localStorage` sob as chaves `dh:v1:*`. Não há conta, não há estado do lado do servidor e nenhuma analítica de qualquer tipo.

## Stack tecnológico

Svelte 5 + TypeScript (strict), Vite 7 e `vite-plugin-singlefile` — todo o aplicativo (JS, CSS, fontes, motor de verificação Web Worker) compila em **um único arquivo HTML** que também funciona a partir de `file://`. Testes usam Vitest para lógica pura e Playwright E2E (com rede simulada) para UI; CI implanta no GitHub Pages via GitHub Actions.

## Contribuindo

Issues e PRs são bem-vindos. Boas primeiras contribuições: novas zonas curadas (edite `src/config/tlds.json`), novos conjuntos temáticos de palavras (`src/config/dictionaries/`), traduções (`src/i18n/`). Consulte [AGENTS.md](AGENTS.md) para comandos de compilação/teste e convenções do projeto.

## Citacao

Se você referenciar o Domain Hunter em trabalhos acadêmicos ou técnicos, use os metadados em [`CITATION.cff`](CITATION.cff):

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

## Licença

[MIT](LICENSE) — faça o que quiser, atribuição é apreciada.

---

[![Star History Chart](https://api.star-history.com/svg?repos=WhiteBite/Domain-Hunter&type=Date)](https://star-history.com/#WhiteBite/Domain-Hunter&Date)

Se o Domain Hunter economizou seu tempo, um ⭐ ajuda outros a encontrá-lo também.
