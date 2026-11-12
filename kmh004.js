/**
 * K漫画（kmh004.com）Venera 漫画源
 *
 * 版本：1.3.0
 * 站点：https://kmh004.com/
 * 取证时间：2026-11-01
 *
 * 已验证能力：
 *  - 首页 1 个推荐区块（今日更新，95 张卡片）
 *  - 搜索 /api/comic?keyword=，10 条/页
 *  - 分类 /api/comic?tag=，10 条/页（total=989，maxPage=99）
 *  - 详情 SSR 含标题/封面/简介/作者/标签/全部章节（118/118、8/8、82/82，序号连续）
 *  - 章节 SSR 含多来源图片（FREEXCOMIC/NNHANMAN，动态选图片数最多的来源），明文直链
 *
 * 提取方式（v1.1.0）：不再使用正则提取，改为：
 *  - 结构化数据（章节/图片/元数据）：解析 __next_f RSC 飞行流，JSON.parse 提取
 *  - 真实 DOM（标题/标签/更新/作者）：HtmlDocument + CSS 选择器
 *  - 列表（首页/分类/搜索）：/api/comic JSON（结构化）
 *
 * 权限边界：公开可读
 * 安全边界：只解析静态 HTML（__next_f RSC 流）与 JSON API，不执行站点脚本
 * 已知限制：图片源选 NNHANMAN（new.niaopic.com）；FREEXCOMIC 源域名已失效
 */

/** @type {import('./_venera_.js')} */
class KMH extends ComicSource {
  // ============================================================
  // 元数据（必填）
  // ============================================================

  name = "K漫画";
  key = "kmh004";
  version = "1.3.0";
  minAppVersion = "1.0.0";
  url = ""; // 无维护地址显式留空

  // ============================================================
  // 站点常量
  // ============================================================

  baseUrl = "https://kmh004.com";

  siteUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

  // 每页条数（真实依据：API records 每页 10 条）
  pageSize = 10;

  // ============================================================
  // 工具函数
  // ============================================================

  /**
   * URL 补全
   */
  absoluteUrl(path) {
    const value = String(path || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("//")) return "https:" + value;
    if (value.startsWith("/")) return this.baseUrl + value;
    return this.baseUrl + "/" + value;
  }

  /**
   * 基础请求头
   */
  baseHeaders(referer) {
    return {
      "User-Agent": this.siteUa,
      Referer: referer || this.baseUrl + "/",
      Accept: "*/*",
    };
  }

  /**
   * 图片请求头（图片无需 Referer，但仍带上以兼容）
   */
  imageHeaders(referer) {
    return {
      "User-Agent": this.siteUa,
      Referer: referer || this.baseUrl + "/",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    };
  }

  /**
   * 瞬态错误判断
   */
  isTransientError(message) {
    return /timeout|timed out|connection reset|connection closed|peer closed|broken pipe|unexpected.?eof|network error|aborted|connection refused|unreachable|temporary/i.test(
      String(message || "")
    );
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 统一请求：瞬态重试一次，5xx 重试一次，4xx 不重试
   */
  async request(method, url, headers, body) {
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try {
        res = await Network.sendRequest(method, url, headers, body);
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
      if (!status || status < 200 || status >= 400) {
        throw new Error(`请求失败 HTTP ${status}（${url}）`);
      }
      return res;
    }
    throw new Error(`网络请求失败：${lastError}（${url}）`);
  }

  /**
   * 获取 HTML 文本
   */
  async getText(url, referer) {
    const res = await this.request("GET", url, this.baseHeaders(referer), null);
    if (!res.body) throw new Error(`空响应（${url}）`);
    return String(res.body);
  }

  /**
   * 获取 JSON
   */
  async getJson(url, referer) {
    const text = await this.getText(url, referer);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`响应不是合法 JSON（${url}）：${text.slice(0, 100)}`);
    }
  }

  // ============================================================
  // ID 标准化
  // ============================================================

  /**
   * 从链接提取漫画 ID（24 位 hex MongoId）
   */
  parseComicId(href) {
    const value = String(href || "").trim();
    if (!value) return null;
    const m = value.match(/\/comic\/([a-f0-9]{24})/);
    if (m) return m[1];
    if (/^[a-f0-9]{24}$/.test(value)) return value;
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
   * 章节 ID 标准化（兼容历史入参）
   *
   * 支持形态：
   *  - 纯 ID：              "66ca11d279f037b6a9a29f8a"
   *  - 完整章节 URL：        "https://kmh004.com/chapter/66ca11d279f037b6a9a29f8a"
   *  - 组合 ID：             "comicId|epId" / "comicId,epId"
   *  - 对象参数：            {epId} / {chapterId} / {id} / {url}
   *  - 非法/缺失：           "" / null / undefined / {} / 0
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
    let s = String(epId).trim();
    if (!s) return null;

    // 完整 URL：/chapter/{id}
    const mUrl = s.match(/\/chapter\/([a-f0-9]{24})/);
    if (mUrl) return mUrl[1];

    // 组合 ID：取最后一段（若 comicId|epId，取 epId）
    if (s.includes("|") || s.includes(",")) {
      s = s.split(/[|,]/).pop().trim();
    }

    // 纯 hex ID
    if (/^[a-f0-9]{24}$/.test(s)) return s;

    return null;
  }

  // ============================================================
  // API 记录 → Comic（列表卡片）
  // ============================================================

  /**
   * 从 API JSON record 构造 Comic
   */
  buildComicFromRecord(record) {
    if (!record) return null;
    const id = this.parseComicId(record._id);
    if (!id) return null;
    const lastChapter = record.lastChapter || {};
    const subTitle =
      (lastChapter.subtitle || lastChapter.title || "") + (lastChapter.title ? " " + lastChapter.title : "");
    return new Comic({
      id,
      title: String(record.name || "未知漫画").trim(),
      subTitle: String(subTitle).trim(),
      cover: this.absoluteUrl(record.cover || ""),
      tags: Array.isArray(record.tags) ? record.tags : [],
      sourceKey: this.key,
    });
  }

  // ============================================================
  // RSC 流解析工具（纯 JS，无正则提取）
  // ============================================================

  /**
   * 从字符串 s 中，从 start 位置开始，找到匹配的右括号（考虑字符串/转义），返回该位置（不含）
   */
  findMatchingBracket(s, start, open, close) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = start; j < s.length; j++) {
      const c = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === open) depth++;
        else if (c === close) {
          depth--;
          if (depth === 0) return j;
        }
      }
    }
    return -1;
  }

  /**
   * 从 script 文本解析 self.__next_f.push([1,"..."])，返回 RSC 流字符串
   */
  parsePushRsc(text) {
    const i = text.indexOf("self.__next_f.push(");
    if (i < 0) return null;
    const bracket = text.indexOf("[", i);
    if (bracket < 0) return null;
    const end = this.findMatchingBracket(text, bracket, "[", "]");
    if (end < 0) return null;
    try {
      const arr = JSON.parse(text.slice(bracket, end + 1));
      if (Array.isArray(arr) && arr.length >= 2 && typeof arr[1] === "string") {
        return arr[1];
      }
    } catch (e) {}
    return null;
  }

  /**
   * 从 HTML 收集所有 self.__next_f.push 的 RSC 流字符串并拼接
   */
  collectRsc(html) {
    const parts = [];
    let i = 0;
    while (true) {
      const start = html.indexOf("<script", i);
      if (start < 0) break;
      const gt = html.indexOf(">", start);
      if (gt < 0) break;
      const end = html.indexOf("</script>", gt);
      if (end < 0) break;
      const text = html.slice(gt + 1, end);
      const rsc = this.parsePushRsc(text);
      if (rsc !== null) parts.push(rsc);
      i = end + 9;
    }
    return parts.join("");
  }

  /**
   * 在 RSC 流里找所有 "key":[ ... ] 数组并 JSON.parse
   */
  findAllArrays(rsc, key) {
    const results = [];
    let pos = 0;
    while (true) {
      const idx = rsc.indexOf('"' + key + '":[', pos);
      if (idx < 0) break;
      const start = rsc.indexOf("[", idx);
      if (start < 0) break;
      const end = this.findMatchingBracket(rsc, start, "[", "]");
      if (end < 0) break;
      try {
        results.push(JSON.parse(rsc.slice(start, end + 1)));
      } catch (e) {
        results.push(null);
      }
      pos = end + 1;
    }
    return results;
  }

  /**
   * 找章节数组：含 _id + subtitle 的对象数组
   */
  findChapterArray(rsc) {
    const arrays = this.findAllArrays(rsc, "data");
    for (const arr of arrays) {
      if (Array.isArray(arr) && arr.length > 0 && arr[0] && typeof arr[0] === "object") {
        if ("_id" in arr[0] && "subtitle" in arr[0]) return arr;
      }
    }
    return null;
  }

  /**
   * 找图片数组：含 url + sourceName + sortIndex 的对象数组
   */
  findImageArray(rsc) {
    const arrays = this.findAllArrays(rsc, "images");
    for (const arr of arrays) {
      if (Array.isArray(arr) && arr.length > 0 && arr[0] && typeof arr[0] === "object") {
        if ("url" in arr[0] && "sourceName" in arr[0]) return arr;
      }
    }
    return null;
  }

  /**
   * 解析 RSC 流 metadata 数组，返回 { title, description, authors[], cover, keywords }
   * metadata 数组形如：["$",<标签>,"<序>",{属性}]
   */
  parseMetadata(rsc) {
    const meta = { title: "", description: "", authors: [], cover: "", keywords: "" };
    const idx = rsc.indexOf('"metadata":[');
    if (idx < 0) return meta;
    const start = rsc.indexOf("[", idx);
    if (start < 0) return meta;
    const end = this.findMatchingBracket(rsc, start, "[", "]");
    if (end < 0) return meta;
    let arr;
    try {
      arr = JSON.parse(rsc.slice(start, end + 1));
    } catch (e) {
      return meta;
    }
    if (!Array.isArray(arr)) return meta;
    for (const item of arr) {
      if (!Array.isArray(item) || item.length < 4) continue;
      const tag = item[1];
      const attrs = item[3];
      if (!attrs || typeof attrs !== "object") continue;
      if (tag === "title" && attrs.children) {
        // 去掉 " | K漫画" 后缀
        meta.title = String(attrs.children).replace(/\s*\|\s*K漫画.*$/, "").trim();
      } else if (tag === "meta" && attrs.name === "description") {
        meta.description = String(attrs.content || "");
      } else if (tag === "meta" && attrs.name === "author") {
        if (attrs.content) meta.authors.push(String(attrs.content).trim());
      } else if (tag === "meta" && attrs.property === "og:image") {
        meta.cover = String(attrs.content || "");
      } else if (tag === "meta" && attrs.name === "keywords") {
        meta.keywords = String(attrs.content || "");
      }
    }
    return meta;
  }

  // ============================================================
  // 提取函数（CSS/JS，无正则提取）
  // ============================================================

  /**
   * 章节列表提取：解析 RSC 流章节数组（含 _id/subtitle/ordinal/title）
   * 返回 [{ ordinal, id, label }] 数组
   * label 生成规则：有 title → `subtitle + " " + title`；无 title → 仅 subtitle
   */
  extractChapters(html) {
    const rsc = this.collectRsc(html);
    const data = this.findChapterArray(rsc);
    const pairs = [];
    if (!Array.isArray(data)) return pairs;
    const seen = new Set();
    for (const ch of data) {
      if (!ch || typeof ch !== "object") continue;
      const id = String(ch._id || "").trim();
      if (!id || seen.has(id)) continue;
      const ordinal = Number(ch.ordinal);
      if (!Number.isFinite(ordinal)) continue;
      seen.add(id);
      const subtitle = String(ch.subtitle || "").trim();
      const title = String(ch.title || "").trim();
      const label = title ? (subtitle ? `${subtitle} ${title}` : title) : subtitle;
      pairs.push({ ordinal, id, label });
    }
    pairs.sort((a, b) => a.ordinal - b.ordinal);
    return pairs;
  }

  /**
   * 章节图片提取：解析 RSC 流 images 数组（含 sourceName/url/sortIndex）
   * 策略：选图片数最多的来源（主图源），按 sortIndex 排序
   */
  extractImages(html) {
    const rsc = this.collectRsc(html);
    const images = this.findImageArray(rsc);
    const groups = {};
    if (Array.isArray(images)) {
      for (const im of images) {
        if (!im || typeof im !== "object") continue;
        const sn = String(im.sourceName || "").trim();
        const url = String(im.url || "").trim();
        if (!sn || !url) continue;
        if (!groups[sn]) groups[sn] = [];
        groups[sn].push({ si: Number(im.sortIndex) || 0, url });
      }
    }
    // 选图片数最多的来源（主图源）
    let best = [];
    for (const sn of Object.keys(groups)) {
      const items = groups[sn].slice().sort((a, b) => a.si - b.si);
      if (items.length > best.length) best = items;
    }
    // 过滤非图片 URL（用 URL 后缀判断，非正则）
    const isImage = (u) => {
      const lower = u.toLowerCase().split(/[?#]/)[0];
      return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp");
    };
    return best.filter((o) => isImage(o.url)).map((o) => o.url);
  }

  /**
   * 搜索页封面提取：从 RSC 流按序取 img.kmh.pics 封面 URL（纯 JS，无正则）
   * 返回 [url, ...] 数组，与 DOM 卡片顺序一一对应
   */
  extractSearchCovers(rsc) {
    const covers = [];
    let pos = 0;
    while (true) {
      const idx = rsc.indexOf("img.kmh.pics/", pos);
      if (idx < 0) break;
      // 往前确认是 src 属性（匹配 "src":" 或 \"src\":\" 转义形式）
      const srcIdx = rsc.lastIndexOf('src":"', idx);
      if (srcIdx < 0 || idx - srcIdx > 14) {
        pos = idx + 12;
        continue;
      }
      // 往后取到引号（URL 内无反斜杠转义）
      const endQ = rsc.indexOf('"', idx + 12);
      if (endQ < 0) break;
      const url = "https://" + rsc.slice(idx, endQ);
      if (url.includes("img.kmh.pics")) covers.push(url);
      pos = endQ + 1;
    }
    return covers;
  }

  /**
   * 搜索结果提取：搜索页为 SSR 页面，卡片在真实 DOM（<a href="/comic/..."> 内 h3 标题/h4 章节），
   * 封面在 RSC 流（img.kmh.pics/...-cover.jpg，与卡片同序）。无分页。
   * 返回 [{ id, title, subTitle, cover }] 数组
   */
  extractSearchComics(html) {
    const rsc = this.collectRsc(html);
    const covers = this.extractSearchCovers(rsc);
    const result = [];
    const doc = new HtmlDocument(html);
    try {
      const cards = doc.querySelectorAll("a[href^='/comic/']");
      let coverIdx = 0;
      for (const card of cards) {
        const href = String((card.attributes && card.attributes.href) || "");
        const id = this.parseComicId(href);
        if (!id) continue;
        const titleEl = card.querySelector("h3");
        const title = titleEl && titleEl.text ? String(titleEl.text).trim() : "";
        const subEl = card.querySelector("h4");
        const subTitle = subEl && subEl.text ? String(subEl.text).trim() : "";
        // 封面：RSC 流按序配对（DOM 卡片顺序与封面顺序一致）
        const cover = coverIdx < covers.length ? covers[coverIdx] : "";
        coverIdx++;
        result.push({ id, title, subTitle, cover });
      }
    } finally {
      doc.dispose();
    }
    return result;
  }

  // ============================================================
  // 首页探索（直接调 /api/comic JSON）
  // ============================================================

  explore = [
    {
      title: this.name,
      type: "singlePageWithMultiPart",
      load: async (page) => {
        try {
          const data = await this.getJson(
            `${this.baseUrl}/api/comic?current=1`,
            this.baseUrl + "/"
          );
          const records = Array.isArray(data.records) ? data.records : [];
          const comics = records
            .map((r) => this.buildComicFromRecord(r))
            .filter((c) => c !== null);
          const result = {};
          if (comics.length > 0) {
            result["今日更新"] = comics;
          }
          return result;
        } catch (e) {
          console.error(`${this.name} 首页解析失败：`, e);
          return {};
        }
      },
    },
  ];

  // ============================================================
  // 分类
  // ============================================================

  category = {
    title: this.name,
    parts: [
      {
        name: "分类",
        type: "fixed",
        // 真实分类（API tag 有效性已验证：少妇19/人妻15/纯情6/阿姨5/后宫142/NTR26/奇幻17/武侠1/科幻1/体育1）
        categories: [
          "少妇",
          "人妻",
          "纯情",
          "阿姨",
          "后宫",
          "NTR",
          "奇幻",
          "武侠",
          "科幻",
          "体育",
        ],
        categoryParams: [
          "少妇",
          "人妻",
          "纯情",
          "阿姨",
          "后宫",
          "NTR",
          "奇幻",
          "武侠",
          "科幻",
          "体育",
        ],
        itemType: "category",
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const safePage = Math.max(1, Number(page) || 1);
      if (!param) return { comics: [], maxPage: safePage };

      try {
        const url = `${this.baseUrl}/api/comic?tag=${encodeURIComponent(param)}&current=${safePage}`;
        const data = await this.getJson(url, this.baseUrl + "/");
        const records = Array.isArray(data.records) ? data.records : [];
        const comics = records
          .map((r) => this.buildComicFromRecord(r))
          .filter((c) => c !== null);
        const total = Number(data.total) || 0;
        const maxPage =
          total > 0 ? Math.max(1, Math.ceil(total / this.pageSize)) : safePage;
        return { comics, maxPage };
      } catch (e) {
        console.error(`${this.name} 分类「${category}」加载失败：`, e);
        return { comics: [], maxPage: safePage };
      }
    },
    optionList: [],
  };

  // ============================================================
  // 搜索
  // ============================================================

  search = {
    load: async (keyword, options, page) => {
      const kw = String(keyword || "").trim();
      if (!kw) return { comics: [], maxPage: 1 };

      try {
        // 搜索页为 SSR 页面（/search?key=），结果一次全出，无分页
        const url = `${this.baseUrl}/search?key=${encodeURIComponent(kw)}`;
        const html = await this.getText(url, this.baseUrl + "/");
        const items = this.extractSearchComics(html);
        const comics = items
          .map((it) => new Comic({
            id: it.id,
            title: it.title || "未知漫画",
            subTitle: it.subTitle,
            cover: this.absoluteUrl(it.cover),
            tags: [],
            sourceKey: this.key,
          }))
          .filter((c) => c !== null && c.id);
        return { comics, maxPage: 1 };
      } catch (e) {
        console.error(`${this.name} 搜索失败：`, e);
        return { comics: [], maxPage: 1 };
      }
    },
    optionList: [],
  };

  // ============================================================
  // 详情与章节
  // ============================================================

  comic = {
    loadInfo: async (id) => {
      const comicId = this.normalizeComicId(id);
      if (!comicId) throw new Error(`无效的漫画 ID：${id}`);

      const url = `${this.baseUrl}/comic/${comicId}`;
      const html = await this.getText(url, this.baseUrl + "/");
      const rsc = this.collectRsc(html);

      // 元数据：RSC 流 metadata 数组（JSON.parse）
      const meta = this.parseMetadata(rsc);

      // 标题：优先 metadata title，回退真实 DOM h1[hidden]
      let title = meta.title;
      if (!title) {
        const doc = new HtmlDocument(html);
        try {
          const h1s = doc.querySelectorAll("h1");
          for (const h of h1s) {
            if (h.attributes && "hidden" in h.attributes) {
              title = String(h.text || "").trim();
              break;
            }
          }
        } finally {
          doc.dispose();
        }
      }
      if (!title) throw new Error("详情页标题缺失");

      // 封面：metadata og:image
      let cover = meta.cover;

      // 简介：metadata description
      const description = meta.description;

      // 作者：RSC metadata authors（JSON.parse，最稳）
      let author = meta.authors.length ? meta.authors.join("、") : "";

      // 更新 / 标签：真实 DOM（HtmlDocument + CSS 选择器）
      let update = "";
      const domTags = [];
      const doc = new HtmlDocument(html);
      try {
        // 更新：span 文本以"更新："开头
        const spans = doc.querySelectorAll("span");
        for (const sp of spans) {
          const t = String(sp.text || "").trim();
          if (t.startsWith("更新：")) {
            update = t.replace(/^更新：/, "").trim();
            break;
          }
        }
        // 标签：a href^="/tag?value="
        const as = doc.querySelectorAll("a");
        for (const a of as) {
          const href = String((a.attributes && a.attributes.href) || "");
          if (href.startsWith("/tag?value=")) {
            const v = decodeURIComponent(href.replace("/tag?value=", ""));
            if (v && !domTags.includes(v)) domTags.push(v);
          }
        }
      } finally {
        doc.dispose();
      }

      // 章节列表（RSC 流章节数组）
      const chaptersData = this.extractChapters(html);
      const entries = [];
      const seen = new Set();
      for (const ch of chaptersData) {
        if (!ch.id || seen.has(ch.id)) continue;
        seen.add(ch.id);
        entries.push([ch.id, ch.label]);
      }
      if (entries.length === 0) throw new Error("详情页章节列表为空");
      const chapters = new Map(entries);

      const tagMap = {};
      if (author) tagMap["作者"] = [author];
      if (update) tagMap["更新"] = [update];
      if (domTags.length) tagMap["标签"] = domTags;

      return new ComicDetails({
        title,
        cover,
        description,
        tags: tagMap,
        chapters,
        url,
      });
    },

    loadEp: async (comicId, epId) => {
      const ep = this.normalizeEpId(epId);
      if (!ep) return { images: [] };
      const cid = this.normalizeComicId(comicId);

      const url = `${this.baseUrl}/chapter/${ep}`;
      const referer = cid
        ? `${this.baseUrl}/comic/${cid}`
        : this.baseUrl + "/";

      try {
        const html = await this.getText(url, referer);
        const images = this.extractImages(html);
        return { images };
      } catch (e) {
        console.error(`${this.name} 章节 ${ep} 加载失败：`, e);
        return { images: [] };
      }
    },

    onImageLoad: (url, comicId, epId) => {
      const cid = this.normalizeComicId(comicId);
      const ep = this.normalizeEpId(epId);
      const referer =
        cid && ep
          ? `${this.baseUrl}/comic/${cid}`
          : this.baseUrl + "/";
      return {
        headers: this.imageHeaders(referer),
      };
    },

    onThumbnailLoad: (url) => ({
      headers: this.imageHeaders(this.baseUrl + "/"),
    }),
  };
}
// 类名以 Source 结尾可选，Venera 通过全局类识别加载，无需 module.exports
