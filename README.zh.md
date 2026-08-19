# Domain Hunter — 批量域名可注册性查询与名称生成器

[English](README.md) | [Русский](README.ru.md) | **中文** | [日本語](README.ja.md) | [Français](README.fr.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-gold.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/WhiteBite/Domain-Hunter?style=social)](https://github.com/WhiteBite/Domain-Hunter/stargazers)
[![Deploy](https://github.com/WhiteBite/Domain-Hunter/actions/workflows/deploy.yml/badge.svg)](https://github.com/WhiteBite/Domain-Hunter/actions/workflows/deploy.yml)

免费、开源的批量域名可注册性查询工具，完全在浏览器中运行——无需服务器、无需 API 密钥、无任何追踪。

**[▶ 在线演示](https://whitebite.github.io/Domain-Hunter/)** — 即开即用，无需安装。

![Domain Hunter 查询五个品牌名称跨 15 个 TLD——实时流入结果，带状态标签、首年与续费价格、CSV 导出](docs/screenshot-en-check.png)

Domain Hunter 直接对接注册局 **RDAP** 端点（Verisign、Google Registry、Identity Digital、CentralNic、Radix……）查询域名可注册性，内置五种生成器发明品牌化名称，展示**实时注册商价格**与三年总成本（TCO），并可将一切导出为 CSV。它是 WHOIS 查询服务和 WhoisXML、DomainTools 等付费域名 API 的隐私友好替代方案——整个应用就是一个自包含的 HTML 文件。

## 功能特性

- **批量可注册性查询** — 粘贴最多 3,000 个名称；跨所选 TLD 展开后每次最多 30,000 次查询，实时流入可排序的表格。中断的查询可恢复。
- **140+ 精选 TLD 区域** — `com net io ai dev app xyz me co uk de nl fr ch so ly tech site online store cloud` 等 120+ 个区域，覆盖 17 个注册局基础设施。额外区域通过实时 IANA RDAP 引导自动发现。
- **诚实的三态结果** — `available`（可注册）/ `probably_available`（可能可注册）/ `unknown`（未知）。对于低信任度的 ccTLD，在判定为可注册前，会用 DNS-over-HTTPS（Cloudflare + Google DNS）交叉验证 404 响应。Domain Hunter 绝不猜测。
- **五种名称生成器** — 词根 × 前后缀组合器、可发音度评分的音节混合器（基于 CMUdict）、精选主题词集、TLD 技巧（`family` → `fami.ly`）和词汇变形（`midas` → `mydas`、`midaz`、`midaso`）。候选名称收集在持久候选栏中，跨标签页切换不丢失，并在运行前显示预计查询次数。
- **实时价格与 TCO** — 首年与续费价格实时来自 Porkbun 和 Cloudflare，外加每周采集对比最多五个注册商（Dynadot、Spaceship、ValueDomain 快照）；优惠码、促销陷阱检测（续费 ≥ 5× 首年）、三年 TCO 排序，以及覆盖感知的购买链接至 13 个注册商。价格支持 USD、RUB 或 EUR。
- **逐域名的"去哪买"** — 点击一个可注册域名，显示注册局溢价警告（含溢价价格）和当前最低价注册商及直购链接（公开 DigMyName API，无需密钥）。
- **对注册局礼貌** — 按基础设施分别 AIMD 限速（例如 Google Registry 严格的 ~1 rps 会被遵守），HTTP 429 时自动退避并遵守 `Retry-After`，结果缓存在 `localStorage` 中。
- **收藏与历史** — 给任意域名（结果、生成器候选、过期列表）加星标，存入持久收藏夹并带独立筛选；最近的查询会被记住，一键即可恢复。结果支持搜索、多选和复制所选。
- **分享与导出** — 一键分享链接（`#s=` 编码查询 + 区域，自动开始查询）、Excel 兼容的 CSV 导出（BOM + 引号包裹）、逐行复制/重新查询。
- **隐私优先设计** — 无分析、无遥测、无账号。所有状态都保存在浏览器的 `localStorage` 中。多语言界面（英语、俄语、西班牙语、德语、葡萄牙语、中文），浅色与深色主题，移动端友好。

![Domain Hunter 名称生成器深色主题：组合器、音节混合器、主题词集、TLD 技巧和变形](docs/screenshot-en-generators.png)

## 快速开始

构建产物是一个自包含的 HTML 文件——打开即用：

- **使用在线版本：** <https://whitebite.github.io/Domain-Hunter/>
- **本地运行：** 直接从磁盘打开 [`dist/index.html`](dist/index.html)（完全支持 `file://`）。
- **从源码构建：**

```bash
npm install
npm run build     # 生成 dist/index.html——单文件，一切内联
npm run dev       # Vite 开发服务器
```

无需后端、无需环境变量、无需 API 密钥——永远如此。

## 部署你自己的副本

**GitHub Pages**（最简单）：

1. Fork 本仓库。
2. Settings → Pages → Source: **GitHub Actions**（内置的 `deploy.yml` 工作流在每次推送到 `main` 时自动构建并发布）。
3. 你的副本上线于 `https://<你的用户名>.github.io/Domain-Hunter/`。

**Cloudflare Pages：** 导入仓库，构建命令 `npm run build`，输出目录 `dist`。

**任意静态主机或磁盘：** 提供或打开 `dist/index.html`。所有路径均为相对路径（`base: './'`），因此可在任意子路径下运行。

## 工作原理

1. 浏览器**直接与注册局 RDAP 端点通信** — Domain Hunter 使用的所有端点均开放 CORS，因此无需服务器或代理。
2. **HTTP 200 → 已注册**，**404 → 不在注册局中**（此时信任规则生效：高信任度 gTLD 报告为 `available`；低信任度 ccTLD 通过 DNS-over-HTTPS 二次验证后报告为 `probably_available`）。
3. **429 / 5xx → 退避重试**；在持续的网络或 CORS 失败时，可选的、用户自备的 Cloudflare Worker 代理可接管（见应用设置中的 `worker.js` 配置）。
4. 结果以可配置的 TTL 在本地缓存；重新查询只需一键，"忽略缓存"开关可强制刷新查询。

## 支持的区域

147 个精选区域，按注册局基础设施分组：Verisign（`com net cc tv`）、Google Registry（`dev app page new day how ing meme zip mov foo dad phd prof esq nexus rsvp soy boo channel`）、Identity Digital（`io ai me sh ac pro info live world email studio agency` 等 70+ 个）、CentralNic（`xyz lol icu cyou bond sbs cfd art` 等 30+ 个）、Radix（`tech site online fun space store website press host`）、Uniregistry（`cloud link top win bid loan men`），以及隐式 ccTLD 端点（`de co us uk nl fr ch ru so ly`）。实时 IANA 引导自动添加新授权的 gTLD。

缺少某个区域？这是数据驱动的——只需在 `src/config/tlds.json` 中添加一条记录，无需改代码。

## Domain Hunter 与替代方案对比

| | Domain Hunter | 注册商搜索框 | `whois` 命令行 | 付费 API（WhoisXML、DomainTools） |
|---|---|---|---|---|
| 价格 | 免费，MIT | 免费（锁定单一注册商） | 免费 | 约 $19/月起 |
| 批量查询 | 3,000 个名称 × 140+ TLD | 一次一个 | 需编写脚本 | 支持，按量计费 |
| 服务器 / API 密钥 | **无需——浏览器中运行** | 不适用 | 本地安装 | API 密钥 + 计费 |
| 名称生成器 | 内置 5 种 | 基础建议 | 无 | 无 |
| 实时价格 + 三年 TCO | 对比 12 个注册商 | 仅自家价格 | 无 | 额外收费 |
| 隐私 | 无追踪，仅本地 | 搜索历史被记录 | 私密 | 查询日志 |

如果你需要保证 SLA、溢价域名定价数据流或每天数百万次查询，请选择付费 API。如果你想要一种快速、免费、私密的方式来头脑风暴并验证数百个候选名称，请选择 Domain Hunter。

## 常见问题

### 没有服务器或 API 密钥，它怎么查询域名？

注册局通过 HTTPS 暴露 RDAP（Registration Data Access Protocol，WHOIS 的现代继任者），而 Domain Hunter 使用的端点发送了宽松的 CORS 头。你的浏览器直接调用它们，就像调用任何公共 API 一样。

### "可注册"状态准确吗？

对于 ICANN 签约的 gTLD 基础设施（Verisign、Google、Identity Digital……），RDAP 404 是权威的。对于 RDAP 不太可靠的 ccTLD，Domain Hunter 用 DNS NS 查询交叉验证，并报告为 `probably_available` 而非过度承诺。域名仍可能在几秒后被他人注册——查询只是一个快照，请尽快购买。

### 这对注册局合法且礼貌吗？

是的。RDAP 是注册局自己的公开、机器可读接口（它的存在正是为了替代被爬取的 WHOIS）。Domain Hunter 按基础设施分别控制请求频率，遵守 `Retry-After`，并在被限流时指数级减速——例如 Google Registry 最多每秒约 1 次请求。

### 我一次能查询多少个域名？

最多 3,000 个输入名称；经 TLD 展开后每次查询上限为 30,000 次单独检查。本地缓存意味着重复查询几乎即时完成。

### 它支持 IDN 和 .ru 或 .de 等 ccTLD 吗？

国际化名称会自动转换为 punycode。`de co us uk nl fr ch ru so ly` 通过专用端点支持（`ru` 因其 RDAP 的地理限制被标记为实验性——可选的代理回退可覆盖此类情况）。

### 我的数据存储在哪里？

只在你浏览器中。设置、缓存和自定义词集保存在 `localStorage` 的 `dh:v1:*` 键下。没有账号、没有服务端状态、没有任何形式的分析。

## 技术栈

Svelte 5 + TypeScript（严格模式）、Vite 7 和 `vite-plugin-singlefile` — 整个应用（JS、CSS、字体、Web Worker 查询引擎）编译为**一个 HTML 文件**，同时支持 `file://` 运行。测试使用 Vitest 做纯逻辑测试，Playwright E2E（模拟网络）做 UI 测试；CI 通过 GitHub Actions 部署到 GitHub Pages。

## 贡献

欢迎提 Issue 和 PR。适合新手的贡献：新增精选区域（编辑 `src/config/tlds.json`）、新增主题词集（`src/config/dictionaries/`）、翻译（`src/i18n/`）。构建/测试命令和项目约定见 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE) — 随意使用，请注明出处。

---

[![Star History Chart](https://api.star-history.com/svg?repos=WhiteBite/Domain-Hunter&type=Date)](https://star-history.com/#WhiteBite/Domain-Hunter&Date)

如果 Domain Hunter 为你节省了时间，一个 ⭐ 能帮助更多人发现它。
