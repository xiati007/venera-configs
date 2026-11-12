/** @type {import('./_venera_.js')} */
/**
 * 漫畫大濕（mhds7.com）Venera 漫画源 v1.0.1
 *
 * 版本历史：
 *  - v1.0.0 初版（首页/搜索/分类/详情/章节/图片全链路）
 *  - v1.0.1 详情页章节表改为**正序**输出：站点章节列表为倒序（首位是最新章节，如 4306 首位为
 *    「第83話」），本源收集后整体反转，使列表首位为第 1 话、最新章节在末尾，
 *    与客户端「从第一话开始读」的预期一致。
 *
 * 入口说明：站点 title「漫畫大濕 - 免費无删减漫畫」，固定域名 https://mhds7.com
 * （取证范围内未发现镜像域名公告，故 url 元数据写死、不做域名切换设置项）。
 *
 * 站点性质：服务端渲染静态 HTML（自定义 gm- 模板 + jquery + app.js 懒加载），
 * 无前端渲染正文、无接口取图。正文图与封面走第三方图床：
 *   - 正文图 https://img.nnpic.xyz/upload_s/{yyyymmddNN}/{name}.jpg（明文直链 JPEG）
 *   - 封面   https://thumb.niaopic.com/upload_s/{yyyymm}/{name}.webp
 *            https://new.niaopic.com/{yyyymm}/{name}.webp
 *
 * 全站路由（2026-10-15 实测，非跨站复制）：
 *   - 首页   /
 *   - 分类   /cata[/{分类}/ob/{hits|time}/st/{all|serialized|completed}][/page/{N}]
 *   - 最新   /new、/new/newbook、/new/recommend（子 tab，单屏无分页）
 *   - 排行   /top/{weekly|daily|monthly|all}（4 榜单子 tab，单屏无分页）
 *   - 搜索   /search/{关键词}[/page/{N}]（与表单 action=/cata.php?key={关键词} 等价）
 *   - 详情   /manhua/{comicId}（comicId 为纯数字）
 *   - 章节   /manhua/{comicId}/{epKey}（epKey 为 16 位 base62 随机串，非数字）
 *
 * 已取证并验证（2026-10-15）：
 *   - 【G0 正文图片闸门】**通过**。真实章节页 /manhua/4306/fTCLNITCOvIJ6vuG（第1話）
 *     正文图 225 张（去重 223）全部为 img[data-src] 明文直链；抽样首/中/尾三张：
 *     HTTP 200 / Content-Type image/jpeg / 38409、74430、22885 字节；无 Referer 亦可下载
 *     （响应头 access-control-allow-origin: *）。整话单页全量，**无「下一页」分页**。
 *   - 首页 5 个推荐区块（gm-meta>h3 标题 + 紧随其后的 gm-list，每区 12 卡）：
 *     最新更新/最熱門漫畫/新書上架/推薦漫畫/已完結漫畫。
 *   - 分类筛选页 24 卡/页；分页器 div.gm-page > li.pager > a[href$=/page/N]，
 *     maxPage 取分页器全部 /page/N 与当前页的最大值（末页分页器不含自身 → 必须并入当前页）。
 *     实测「正妹」共 46 页；状态 all/serialized/completed、排序 hits/time 均生效。
 *   - 最新页与排行页单屏、**页面无分页控件** → maxPage 恒为 1（/new、/new/newbook、
 *     /new/recommend 各 60/60/60 卡；/top 单区块 102 卡，4 个子 tab 用 /top/{slug} 页）。
 *   - 搜索 /search/{kw}：24 卡/页，翻页 /search/{kw}/page/{N}；无结果词返回 0 卡（安全空）。
 *   - 详情：h1.title 标题、div.gm-vod img.img 封面、div.info 前缀「作者：/題材：/進度：/劇情：」
 *     四字段、div.source a[href] 章节（**站点原序为倒序，最新在前；本源反转输出正序，第 1 话在前**）。
 *   - 图片无防盗链：正文图/封面无 Referer、任意 Referer 均 200（此处仍防御性带本站 Referer）。
 *
 * 无效 ID 的错误页形态：HTTP 200 + 37 字节的跳转脚本页（无 gm-vod / 无 data-src），
 * loadInfo 与 loadEp 识别后安全失败（抛错 / 返回 { images: [] }），不返回半截数据。
 *
 * 安全边界：页面含 Cloudflare email-decode 脚本与第三方广告脚本（poweredby.jads.co、
 * 随机字符串混淆码），本源**只解析静态 HTML 结构，不加载、不执行任何站点脚本**；
 * 无 eval、无 new Function、无字符串 throw；图片明文直链，无解密逻辑。
 *
 * 源设置：本源无 settings 项（固定域名，无已取证镜像集）。
 */
class Mhds7ComicSource extends ComicSource {
  name = "漫畫大濕";
  key = "mhds7";
  version = "1.0.1";
  minAppVersion = "1.6.0";
  url = "https://mhds7.com";

  // 站点固定域名：取证范围内无镜像公告，故不提供域名切换设置。
  baseUrl = "https://mhds7.com";

  siteUa =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  // 分类筛选白名单（2026-10-15 取证于站点 /cata 页筛选面板，与站内一字不差；防越权 URL 拼接）。
  categorySlugs = [
    "all",
    "正妹",
    "恋爱",
    "出版漫画",
    "肉慾",
    "浪漫",
    "大尺度",
    "巨乳",
    "有夫之婦",
    "女大生",
    "狗血劇",
    "同居",
    "好友",
    "調教",
    "动作",
    "後宮",
    "不倫",
    "3D",
    "校園",
    "耽美",
    "日漫",
  ];
  // 站点筛选面板真值：状态 st=all|serialized|completed，排序 ob=hits|time。
  statusSlugs = ["all", "completed", "serialized"];
  sortSlugs = ["hits", "time"];
  // 最新页 / 排行页子 tab URL 段真值（页面无分页控件 → maxPage=1）。
  latestSlugs = ["new", "new/newbook", "new/recommend"];
  rankSlugs = ["top/weekly", "top/daily", "top/monthly", "top/all"];
  // 分类筛选面板只在「分类」分区可见，其余分区隐藏。
  noFilterTabs = ["最近更新", "新書上架", "推薦漫畫", "周榜", "日榜", "月榜", "總榜"];

  // ---------------------------------------------------------------- 基础工具

  absoluteUrl(path) {
    const value = String(path || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("//")) return "https:" + value;
    if (value.startsWith("/")) return this.baseUrl + value;
    return this.baseUrl + "/" + value;
  }

  headers(referer) {
    return {
      "User-Agent": this.siteUa,
      Referer: referer || this.baseUrl + "/",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
    };
  }

  isTransientError(message) {
    return /timeout|timed out|connection reset|connection closed|peer closed|broken pipe|unexpected.?eof|network error|aborted|connection refused|unreachable|temporary/i.test(
      String(message || "")
    );
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  num(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  // ---------------------------------------------------------------- 网络

  /** 统一网络请求：瞬态错误有限重试一次，5xx 有限重试一次，非 2xx 抛错。 */
  async getText(url, referer) {
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try {
        res = await Network.get(url, this.headers(referer));
      } catch (e) {
        res = { error: String(e) };
      }
      if (res && res.error) {
        lastError = String(res.error);
        if (this.isTransientError(lastError) && attempt === 0) {
          await this.sleep(400);
          continue;
        }
        throw new Error(`网络请求失败：${lastError}（${url}）`);
      }
      const status = Number(res && res.status);
      if (status >= 500 && attempt === 0) {
        await this.sleep(400);
        continue;
      }
      if (!status || status < 200 || status >= 300) {
        throw new Error(`请求失败 HTTP ${status}（${url}）`);
      }
      if (!res.body) throw new Error(`空响应（${url}）`);
      return String(res.body);
    }
    throw new Error(`网络请求失败：${lastError}（${url}）`);
  }

  // ------------------------------------------------------------ ID 标准化

  /** 从 /manhua/4306、完整 URL、纯数字中提取漫画 ID；不误配章节链接末尾的 epKey。 */
  parseComicId(href) {
    const value = String(href || "").trim();
    if (!value) return null;
    const match = value.match(/\/manhua\/(\d+)(?:[/?#]|$)/);
    if (match) return match[1] === "0" ? null : match[1];
    if (/^\d+$/.test(value)) return value === "0" ? null : value;
    const digits = value.match(/(\d+)\s*$/);
    if (digits) return digits[1] === "0" ? null : digits[1];
    return null;
  }

  normalizeComicId(id) {
    if (id === null || id === undefined) return null;
    if (typeof id === "object") {
      return this.normalizeComicId(
        id.comicId !== undefined ? id.comicId : id.id !== undefined ? id.id : id.url
      );
    }
    return this.parseComicId(String(id));
  }

  /**
   * 章节 ID（epKey，16 位 base62 随机串）标准化，兼容历史入参：
   *   fTCLNITCOvIJ6vuG                              普通章节 ID
   *   /manhua/4306/fTCLNITCOvIJ6vuG                 章节链接
   *   https://mhds7.com/manhua/4306/fTCL….html       完整章节 URL
   *   4306|fTCLNITCOvIJ6vuG                         组合 ID（取最后一段）
   *   {epId/chapterId/id/url}                       对象参数
   *   /manhua/4306、4306、纯数字                     只有漫画 ID → null（拒绝）
   *   空值 / 不可识别                                → null，由调用方安全返回空图片
   */
  normalizeEpId(epId) {
    if (epId === null || epId === undefined || epId === "") return null;
    if (typeof epId === "object") {
      return this.normalizeEpId(
        epId.epId !== undefined
          ? epId.epId
          : epId.chapterId !== undefined
          ? epId.chapterId
          : epId.id !== undefined
          ? epId.id
          : epId.url
      );
    }
    const value = String(epId).trim();
    if (!value) return null;
    // epKey 已取证为 16 位 base62；用 8-64 位字母数字做防御性校验，
    // 既容纳未来长度漂移，也拒绝 "abc"/纯漫画 ID 等不可识别输入（未知入参安全失败）。
    const validEpKey = (s) => /^[A-Za-z0-9]{8,64}$/.test(s);
    const clean = value.split(/[?#]/)[0].replace(/\.html?$/i, "");
    const segments = clean.split("/").filter((s) => s);
    // 路径形态：/…/manhua/{cid}/{epKey} → 取最后一段且倒数第二段为数字漫画 ID。
    if (
      segments.length >= 3 &&
      segments[segments.length - 3] === "manhua" &&
      /^\d+$/.test(segments[segments.length - 2])
    ) {
      const ep = segments[segments.length - 1];
      return validEpKey(ep) ? ep : null;
    }
    // 组合形态 a|b 取最后一段；纯数字（漫画 ID）一律拒绝。
    const last = clean.split("|").pop().trim();
    if (/^\d+$/.test(last)) return null;
    return validEpKey(last) ? last : null;
  }

  // ------------------------------------------------------------ 列表卡片解析

  buildComic(item) {
    if (!item) return null;
    const id = this.parseComicId(item.url || item.href || "");
    if (!id) return null;
    return new Comic({
      id,
      title: String(item.title || "未知漫画").trim(),
      subTitle: String(item.subTitle || "").trim(),
      cover: this.absoluteUrl(item.cover || ""),
      tags: Array.isArray(item.tags) ? item.tags : [],
      sourceKey: this.key,
    });
  }

  /**
   * 单张卡片解析（首页区块、分类页、搜索页、最新页、排行页结构一致，五处分别取证确认
   * 同为 div.item 模板）：
   *   div.item > a.link[href=/manhua/{id}][title] > img.img[data-src]（封面）
   *                                              + div.tag1（分类）
   *                                              + div.tag2（更新时间，仅首页）
   *            > div.info > a.title（标题） + div.desc（最新章节 / 日期）
   */
  parseCard(card) {
    if (!card) return null;
    const link =
      card.querySelector("a.link") || card.querySelector("a.title") || card.querySelector("a[href]");
    if (!link || !link.attributes) return null;
    const href = link.attributes.href || "";
    const id = this.parseComicId(href);
    if (!id) return null;

    let title = "";
    const titleEl = card.querySelector("a.title");
    if (titleEl && titleEl.text) title = String(titleEl.text).trim();
    if (!title && link.attributes.title) title = String(link.attributes.title).trim();
    if (!title && link.text) title = String(link.text).trim();
    if (!title) return null;

    const img = card.querySelector("img");
    const coverRaw =
      img && img.attributes ? img.attributes["data-src"] || img.attributes.src || "" : "";
    const sub = card.querySelector("div.desc");
    const subTitle = sub && sub.text ? String(sub.text).trim() : "";

    return this.buildComic({ url: href, title, cover: coverRaw, subTitle });
  }

  /** 解析某个容器节点下的全部列表卡片。 */
  parseCardsFromNode(node) {
    if (!node) return [];
    const comics = [];
    for (const card of node.querySelectorAll("div.item")) {
      const comic = this.parseCard(card);
      if (comic) comics.push(comic);
    }
    return comics;
  }

  /**
   * maxPage 真实依据：分页器 div.gm-page 内全部 a[href$=/page/N] 的最大 N，
   * 并并入当前页（末页分页器窗口不含自身 → 必须并入，否则末页 maxPage 少 1）。
   * 无分页控件（最新页 / 排行页 / 单屏结果）→ 返回当前页。
   */
  readMaxPage(doc, currentPage) {
    let max = this.num(currentPage, 1);
    for (const a of doc.querySelectorAll("div.gm-page a")) {
      if (!a.attributes) continue;
      const m = String(a.attributes.href || "").match(/\/page\/(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return max;
  }

  // ------------------------------------------------------------ 首页推荐

  explore = [
    {
      title: this.name,
      type: "singlePageWithMultiPart",
      load: async () => {
        let doc = null;
        try {
          const html = await this.getText(this.baseUrl + "/", this.baseUrl + "/");
          doc = new HtmlDocument(html);
          const result = {};
          // 首页区块：div.gm-main > div.gm-meta（含 h3 标题）紧随 div.gm-list。
          // 分类/搜索/排行页的 gm-meta 是筛选面板（无 h3）→ 天然被跳过。
          for (const meta of doc.querySelectorAll("div.gm-main div.gm-meta")) {
            const h3 = meta.querySelector("h3");
            const title = h3 && h3.text ? String(h3.text).trim() : "";
            if (!title || result[title]) continue;
            // 紧跟的兄弟节点应为 gm-list；容许中间夹一个广告节点，最多向后找 2 个。
            let node = meta.nextElementSibling;
            let comics = [];
            for (let i = 0; i < 2 && node; i++) {
              comics = this.parseCardsFromNode(node);
              if (comics.length) break;
              node = node.nextElementSibling;
            }
            if (comics.length > 0) result[title] = comics;
          }
          return result;
        } catch (e) {
          console.error("漫畫大濕首页解析失败：", e);
          return {};
        } finally {
          if (doc) doc.dispose();
        }
      },
    },
  ];

  // ------------------------------------------------------------ 分类频道

  category = {
    title: this.name,
    // parts 分组按站点导航：
    //  - 「分類」= /cata 筛选页（站点分类面板真值，21 个类别）
    //  - 「最新」 = /new 页三个子 tab（最近更新 / 新書上架 / 推薦漫畫）
    //  - 「排行」 = /top 页四个榜单子 tab（周榜 / 日榜 / 月榜 / 總榜）
    parts: [
      {
        name: "分類",
        type: "fixed",
        categories: [
          "全部",
          "正妹",
          "恋爱",
          "出版漫画",
          "肉慾",
          "浪漫",
          "大尺度",
          "巨乳",
          "有夫之婦",
          "女大生",
          "狗血劇",
          "同居",
          "好友",
          "調教",
          "动作",
          "後宮",
          "不倫",
          "3D",
          "校園",
          "耽美",
          "日漫",
        ],
        categoryParams: [
          "all",
          "正妹",
          "恋爱",
          "出版漫画",
          "肉慾",
          "浪漫",
          "大尺度",
          "巨乳",
          "有夫之婦",
          "女大生",
          "狗血劇",
          "同居",
          "好友",
          "調教",
          "动作",
          "後宮",
          "不倫",
          "3D",
          "校園",
          "耽美",
          "日漫",
        ],
        itemType: "category",
      },
      {
        name: "最新",
        type: "fixed",
        categories: ["最近更新", "新書上架", "推薦漫畫"],
        categoryParams: ["new", "new/newbook", "new/recommend"],
        itemType: "category",
      },
      {
        name: "排行",
        type: "fixed",
        categories: ["周榜", "日榜", "月榜", "總榜"],
        categoryParams: ["top/weekly", "top/daily", "top/monthly", "top/all"],
        itemType: "category",
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const path = String(param || "").trim();
      const safePage = Math.max(1, this.num(page, 1));
      if (!path) return { comics: [], maxPage: safePage };
      const opts = Array.isArray(options) ? options : [];
      try {
        let url;
        let isFixed = false;
        if (this.rankSlugs.indexOf(path) >= 0 || this.latestSlugs.indexOf(path) >= 0) {
          // 排行页 / 最新页：单屏、页面无分页控件 → maxPage 恒为 1。
          url = `${this.baseUrl}/${path}`;
          isFixed = true;
        } else {
          // 分类筛选页：/cata/{类别}/ob/{排序}/st/{状态}[/page/{N}]
          const slug = this.categorySlugs.indexOf(path) >= 0 ? path : "all";
          const status = this.statusSlugs.indexOf(opts[0]) >= 0 ? opts[0] : "all";
          const sort = this.sortSlugs.indexOf(opts[1]) >= 0 ? opts[1] : "hits";
          const base = `${this.baseUrl}/cata/${encodeURIComponent(slug)}/ob/${sort}/st/${status}`;
          url = safePage > 1 ? `${base}/page/${safePage}` : base;
        }
        if (isFixed && safePage > 1) return { comics: [], maxPage: 1 };

        const html = await this.getText(url, this.baseUrl + "/");
        const doc = new HtmlDocument(html);
        try {
          let comics = [];
          for (const card of doc.querySelectorAll("div.gm-list div.item")) {
            const comic = this.parseCard(card);
            if (comic) comics.push(comic);
          }
          const maxPage = isFixed ? 1 : this.readMaxPage(doc, safePage);
          return { comics, maxPage };
        } finally {
          doc.dispose();
        }
      } catch (e) {
        console.error(`漫畫大濕分类「${category}」加载失败：`, e);
        return { comics: [], maxPage: safePage };
      }
    },
    optionList: [
      {
        label: "狀態",
        type: "select",
        // 最新 / 排行子 tab 页没有筛选面板，按分类名隐藏这两组。
        notShowWhen: [
          "最近更新",
          "新書上架",
          "推薦漫畫",
          "周榜",
          "日榜",
          "月榜",
          "總榜",
        ],
        options: ["all-全部", "serialized-連載中", "completed-已完結"],
      },
      {
        label: "排序",
        type: "select",
        notShowWhen: [
          "最近更新",
          "新書上架",
          "推薦漫畫",
          "周榜",
          "日榜",
          "月榜",
          "總榜",
        ],
        options: ["hits-按熱度", "time-按時間"],
      },
    ],
  };

  // ------------------------------------------------------------ 搜索

  search = {
    load: async (keyword, options, page) => {
      const kw = String(keyword || "").trim();
      const safePage = Math.max(1, this.num(page, 1));
      if (!kw) return { comics: [], maxPage: safePage };
      try {
        // /search/{kw}[/page/{N}]（与表单 action=/cata.php?key={kw} 等价，实测一致）。
        const base = `${this.baseUrl}/search/${encodeURIComponent(kw)}`;
        const url = safePage > 1 ? `${base}/page/${safePage}` : base;
        const html = await this.getText(url, this.baseUrl + "/");
        const doc = new HtmlDocument(html);
        try {
          const comics = [];
          for (const card of doc.querySelectorAll("div.gm-list div.item")) {
            const comic = this.parseCard(card);
            if (comic) comics.push(comic);
          }
          // 无结果词返回 0 卡 + 无分页控件 → maxPage=1（安全空，UI 不翻页）。
          return { comics, maxPage: this.readMaxPage(doc, safePage) };
        } finally {
          doc.dispose();
        }
      } catch (e) {
        console.error("漫畫大濕搜索失败：", e);
        return { comics: [], maxPage: safePage };
      }
    },
  };

  // ------------------------------------------------------------ 详情与章节

  comic = {
    loadInfo: async (id) => {
      const comicId = this.normalizeComicId(id);
      if (!comicId) throw new Error(`无效的漫画 ID：${id}`);
      const url = `${this.baseUrl}/manhua/${comicId}`;
      const html = await this.getText(url, this.baseUrl + "/");
      // 站点对不存在的漫画返回 HTTP 200 + 37 字节跳转脚本页（无 gm-vod 容器）。
      if (html.length < 200 || html.indexOf("gm-vod") < 0) {
        throw new Error(`漫画不存在或已下架：${comicId}`);
      }
      const doc = new HtmlDocument(html);
      try {
        const h1 = doc.querySelector("div.gm-vod h1.title") || doc.querySelector("h1.title");
        const title = h1 && h1.text ? String(h1.text).trim() : "";
        if (!title) throw new Error("详情页标题缺失");

        // 封面：div.gm-vod > img.img（data-src 优先，src 与之一致）。
        const coverImg = doc.querySelector("div.gm-vod img.img") || doc.querySelector("div.gm-vod img");
        const coverRaw =
          coverImg && coverImg.attributes
            ? coverImg.attributes["data-src"] || coverImg.attributes.src || ""
            : "";
        const cover = this.absoluteUrl(coverRaw);

        // 信息块 div.gm-vod > div.info，字段以前缀区分：作者：/ 題材：/ 進度：/ 劇情：
        let author = "";
        let statusText = "";
        let description = "";
        const tagList = [];
        for (const info of doc.querySelectorAll("div.gm-vod div.info")) {
          const text = info.text ? String(info.text).trim() : "";
          if (text.indexOf("作者：") === 0) {
            const a = info.querySelector("a");
            author = a && a.text ? String(a.text).trim() : text.replace(/^作者：/, "").trim();
          } else if (text.indexOf("題材：") === 0) {
            for (const a of info.querySelectorAll("a")) {
              const t = a.text ? String(a.text).trim() : "";
              if (t && tagList.indexOf(t) < 0) tagList.push(t);
            }
          } else if (text.indexOf("進度：") === 0) {
            statusText = text.replace(/^進度：/, "").trim();
          } else if (text.indexOf("劇情：") === 0) {
            description = text.replace(/^劇情：/, "").trim();
          }
        }

        // 章节：div.source > div.list > a[href=/manhua/{cid}/{epKey}]。
        // 站点章节表为**倒序**（列表首位是最新章节，如 4306 首位为「第83話」）；
        // 本源收集后整体反转，输出**正序**（列表首位为第 1 话），
        // 与用户在客户端「从第一话开始读」的预期一致。
        const entries = [];
        const seenEp = new Set();
        for (const a of doc.querySelectorAll("div.source a[href]")) {
          if (!a.attributes) continue;
          const href = String(a.attributes.href || "");
          const m = href.match(/\/manhua\/\d+\/([A-Za-z0-9]{8,64})/);
          if (!m) continue;
          const epId = m[1];
          if (seenEp.has(epId)) continue;
          const name = a.text ? String(a.text).trim() : "";
          if (!name) continue;
          seenEp.add(epId);
          entries.push([epId, name]);
        }
        if (!entries.length) throw new Error("详情页章节列表为空");
        // 站点倒序 → 反转成正序（第 1 话在前，最新章节在末尾）。
        const chapters = new Map();
        for (let i = entries.length - 1; i >= 0; i--) {
          chapters.set(entries[i][0], entries[i][1]);
        }

        const authors = author ? [author] : [];
        return new ComicDetails({
          title,
          subTitle: author,
          cover,
          tags: {
            作者: author ? [author] : [],
            題材: tagList,
          },
          authors,
          status: statusText,
          intro: description,
          description,
          chapters,
          comic: new Comic({
            id: comicId,
            title,
            subTitle: author,
            cover,
            tags: tagList,
            sourceKey: this.key,
          }),
          sourceKey: this.key,
        });
      } finally {
        doc.dispose();
      }
    },

    /**
     * 章节图片加载：站点阅读页把整话图片一次性渲染在 div.gm-read 内
     * （img[data-src=https://img.nnpic.xyz/...][data-index]，明文直链 JPEG），
     * 实测 225/175/230 张三话均无「下一页」分页 → 单请求取全量。
     * 章节 URL 必须同时有 comicId 与 epKey（仅 epKey 会 404），故两者缺一即安全返回空。
     * 页面存在重复图（实测 225 张去重 223）→ 必须跨项去重。
     */
    loadEp: async (comicId, epId) => {
      const epIdNorm = this.normalizeEpId(epId);
      if (!epIdNorm) return { images: [] };
      const cid = this.normalizeComicId(comicId);
      if (!cid) return { images: [] };
      const referer = `${this.baseUrl}/manhua/${cid}`;
      try {
        const url = `${this.baseUrl}/manhua/${cid}/${epIdNorm}`;
        const html = await this.getText(url, referer);
        // 不存在的章节返回 200 + 37 字节错误页（无正文图容器）。
        if (html.indexOf("gm-read") < 0) return { images: [] };
        const doc = new HtmlDocument(html);
        try {
          const images = [];
          const seen = new Set();
          // 只取 div.gm-read 内的懒加载图（统计像素位于正文之外），双字段兼容。
          const nodes = doc.querySelectorAll(
            "div.gm-read img[data-src], div.gm-read img[data-index]"
          );
          for (const node of nodes) {
            if (!node.attributes) continue;
            const raw = node.attributes["data-src"] || node.attributes.src || "";
            if (!raw) continue;
            const abs = this.absoluteUrl(raw);
            if (!abs || seen.has(abs)) continue;
            seen.add(abs);
            images.push(abs);
          }
          return {
            images,
            headers: {
              "User-Agent": this.siteUa,
              Referer: referer,
            },
          };
        } finally {
          doc.dispose();
        }
      } catch (e) {
        console.error(`漫畫大濕章节 ${epIdNorm} 图片加载失败：`, e);
        return { images: [] };
      }
    },

    /** 图片请求头：实测正文图与封面均无防盗链（无 Referer 亦 200），此处防御性带本站 Referer。 */
    onImageLoad: (url, comicId, epId) => {
      const cid = this.normalizeComicId(comicId);
      const referer = cid ? `${this.baseUrl}/manhua/${cid}` : this.baseUrl + "/";
      return {
        headers: {
          "User-Agent": this.siteUa,
          Referer: referer,
        },
      };
    },
  };
}
