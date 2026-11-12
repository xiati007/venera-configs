/**
 * cin.onl（同人漫画）Venera 漫画源
 *
 * 版本：1.0.0
 * 站点：https://cin.onl
 * 取证时间：2026-11-10
 *
 * 已验证能力：
 *  - 首页 2 个区块（热门 popular / 最新 all），来自 /api/v6/home
 *  - 搜索 /api/v6/search/{kw}/{page}/{sort}，25 条/页（maxPage 分页）
 *    支持查询语法：language:"chinese|english"、tags:"xxx"（可组合，URL 编码）
 *  - 分类：榜单(总/周/日) + 语言(中/英) + 标签(30) + 浏览(热门/最新)，走 /api/v6/search 查询语法
 *  - 详情 /api/v6/book/{id}，字段完整（title/images/tags/num_pages）
 *  - 章节：单章直载（整本漫画 = 1 章，images.pages 为全部页）
 *  - 图片：明文直链 WebP（/api/imageV2/i/{media_id}/{n}.webp，需完整浏览器头）
 *
 * 权限边界：公开可读（无需登录）
 * 安全边界：只解析静态 JSON，不执行站点脚本
 * 已知限制：
 *  - 图片服务 kontol.online 是 Cloudflare：裸请求 403，必须带完整浏览器头
 *    （移动 UA + Accept image/* + Referer + Origin + Sec-Fetch-*）才 200
 *  - 搜索排序：popular(总)/popular-weekly(周)/popular-today(日) 有效；"all" 为全库默认（回落）
 *  - 图片子域 a/b/c/f 轮换规律未确认，待验证
 */

/** @type {import('./_venera_.js')} */
class CinOnlSource extends ComicSource {
  // ============================================================
  // 元数据（必填）
  // ============================================================

  name = "cin.onl";
  key = "cinonl";
  version = "1.1.0"; // 1.1.0：分类完善（榜单/语言/标签，查询语法）
  minAppVersion = "1.0.0"; // 必须显式设置三段式
  url = "https://cin.onl"; // 站点主地址

  // ============================================================
  // 站点常量
  // ============================================================

  baseUrl = "https://cin.onl";
  apiBase = "https://same.yui.pw/api/v6"; // 独立 JSON API

  // 移动 UA：图片服务 Cloudflare 校验，需移动 UA 才放行
  siteUa =
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

  // ============================================================
  // 工具函数
  // ============================================================

  absoluteUrl(path) {
    const value = String(path || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("//")) return "https:" + value;
    if (value.startsWith("/")) return this.baseUrl + value;
    return this.baseUrl + "/" + value;
  }

  /**
   * 基础请求头（API same.yui.pw 需要移动 UA + Referer）
   */
  baseHeaders(referer) {
    return {
      "User-Agent": this.siteUa,
      Referer: referer || this.baseUrl + "/",
      Accept: "*/*",
    };
  }

  /**
   * 图片请求头（关键）：kontol.online 是 Cloudflare，
   * 必须带完整浏览器头（移动 UA + Accept image/* + Referer + Origin + Sec-Fetch-*）才 200，
   * 否则 403。Referer 应为详情页 URL。
   */
  imageHeaders(referer) {
    return {
      "User-Agent": this.siteUa,
      Referer: referer || this.baseUrl + "/",
      Origin: this.baseUrl,
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Sec-Fetch-Site": "cross-site",
      "Sec-Fetch-Mode": "no-cors",
      "Sec-Fetch-Dest": "image",
    };
  }

  isTransientError(message) {
    // 网络瞬态错误（含 node 的 AggregateError / fetch failed / DNS 类）→ 重试一次
    return /timeout|timed out|connection reset|connection closed|peer closed|broken pipe|unexpected.?eof|network error|aborted|connection refused|unreachable|temporary|aggregateerror|fetch failed|econn|enotfound|eai_again|getaddrinfo|socket hang up/i.test(
      String(message || "")
    );
  }

  sleep(ms) {
    // setTimeout 官方 js_api 未文档化，待验证：存在时延时，不存在则立即 resolve
    if (typeof setTimeout === "function") {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    return Promise.resolve();
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

  async getText(url, referer) {
    const res = await this.request("GET", url, this.baseHeaders(referer), null);
    if (!res.body) throw new Error(`空响应（${url}）`);
    return String(res.body);
  }

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

  parseComicId(href) {
    const value = String(href || "").trim();
    if (!value) return null;
    // 详情路由 /v/{id}
    const m = value.match(/\/v\/(\d+)/);
    if (m) return m[1];
    if (/^\d+$/.test(value)) return value;
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
    // 单章直载：章节 id 即漫画 id（/v/{id} 详情）
    const mUrl = s.match(/\/v\/(\d+)/);
    if (mUrl) return mUrl[1];
    if (s.includes("|") || s.includes(",")) {
      s = s.split(/[|,]/).pop().trim();
    }
    s = s.split("_")[0];
    s = s.replace(/\.html?$/i, "");
    if (/^\d+$/.test(s)) return s === "0" ? null : s;
    return null;
  }

  // ============================================================
  // 列表卡片解析（JSON）
  // ============================================================

  /**
   * 统一 Comic 构造（JSON 条目 → Comic）
   * 条目字段：{ id, media_id, title{english,japanese,pretty}, lang, cover{t,w,h}, num_pages }
   */
  buildComic(item) {
    if (!item) return null;
    const id = this.parseComicId(item.id || item._id || item.url || item.href || "");
    if (!id) return null;
    const title =
      (item.title && (item.title.pretty || item.title.english || item.title.japanese)) ||
      item.title ||
      "未知漫画";
    const cover = (item.cover && item.cover.t) || (item.cover && item.cover) || "";
    return new Comic({
      id,
      title: String(title).trim(),
      subTitle: item.lang ? String(item.lang).trim() : "",
      cover: this.absoluteUrl(cover),
      tags: [],
    });
  }

  // ============================================================
  // 首页探索
  // ============================================================

  explore = [
    {
      title: this.name,
      // 官方枚举三种：multiPartPage / multiPageComicList / mixed
      type: "multiPartPage",
      load: async (page) => {
        try {
          const data = await this.getJson(`${this.apiBase}/home`, this.baseUrl + "/");
          if (!data || typeof data !== "object") return [];
          const parts = [];

          // 区块1：热门（popular，5 条）——「查看更多」跳「热门」分类（今日热门分页）
          if (Array.isArray(data.popular) && data.popular.length > 0) {
            const comics = data.popular
              .map((item) => this.buildComic(item))
              .filter((c) => !!c);
            if (comics.length > 0) {
              parts.push({ title: "热门", comics, viewMore: "category:热门@hot" });
            }
          }

          // 区块2：最新（all，25 条）——「查看更多」跳「最新」分类（全库分页）
          if (Array.isArray(data.all) && data.all.length > 0) {
            const comics = data.all
              .map((item) => this.buildComic(item))
              .filter((c) => !!c);
            if (comics.length > 0) {
              parts.push({ title: "最新", comics, viewMore: "category:最新@all" });
            }
          }

          return parts;
        } catch (e) {
          console.error(`${this.name} 首页解析失败：`, e);
          return [];
        }
      },
    },
  ];

  // ============================================================
  // 分类：站点无传统分类导航端点，但搜索支持查询语法（已验证）：
  //  - language:"chinese"/"english" 按语言；tags:"xxx" 按标签
  //  - 榜单走 /search/{kw}/{page}/{sort}，sort=popular(总)/popular-weekly(周)/popular-today(日)
  //  - 保留「浏览」两个入口（热门=今日 / 最新=全库）承接 explore 查看更多
  // 标签值来自外部软件规则（cin.onl 站内标签），实测 doujinshi/full color/sister 均有效。
  // ============================================================

  category = {
    title: this.name,
    parts: [
      {
        name: "榜单",
        type: "fixed",
        categories: ["总排行", "周排行", "日排行"],
        categoryParams: ["total", "weekly", "daily"],
        itemType: "category",
      },
      {
        name: "语言",
        type: "fixed",
        categories: ["中文", "英文"],
        categoryParams: ["chinese", "english"],
        itemType: "category",
      },
      {
        name: "标签",
        type: "fixed",
        categories: [
          "同人志", "日漫", "韩漫", "全彩", "大胸", "单男", "NTR", "女校服",
          "姐妹", "女主导", "比基尼", "泳装", "阿黑颜", "巨根", "巨乳", "卖淫",
          "欺骗", "精神控制", "口交", "乳交", "手交", "足交", "正太控", "萝莉控",
          "高个女", "勒索", "黑皮", "乱伦", "束缚", "强奸",
        ],
        categoryParams: [
          "doujinshi", "manga", "webtoon", "full color", "big breasts", "sole male",
          "netorare", "schoolgirl uniform", "sister", "femdom", "bikini", "swimsuit",
          "ahegao", "big penis", "huge breasts", "prostitution", "cheating",
          "mind control", "blowjob", "paizuri", "handjob", "footjob", "shotacon",
          "lolicon", "tall girl", "blackmail", "dark skin", "incest", "bondage", "rape",
        ],
        itemType: "category",
      },
      {
        name: "浏览",
        type: "fixed",
        categories: ["热门", "最新"],
        categoryParams: ["hot", "all"],
        itemType: "category",
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const safePage = Math.max(1, Number(page) || 1);
      const sortMap = {
        hot: { kw: "", sort: "popular-today" },
        all: { kw: "", sort: "all" },
        total: { kw: 'language:"chinese"', sort: "popular" },
        weekly: { kw: 'language:"chinese"', sort: "popular-weekly" },
        daily: { kw: 'language:"chinese"', sort: "popular-today" },
        chinese: { kw: 'language:"chinese"', sort: "popular" },
        english: { kw: 'language:"english"', sort: "popular" },
      };
      // 其余 param 视为标签（tags:"xxx"），查询语法经 encodeURIComponent 整体编码
      let cfg = sortMap[param];
      if (!cfg) cfg = { kw: 'language:"chinese" tags:"' + param + '"', sort: "popular" };
      const kwSeg = cfg.kw ? encodeURIComponent(cfg.kw) : "-";
      try {
        const url = `${this.apiBase}/search/${kwSeg}/${safePage}/${cfg.sort}`;
        const data = await this.getJson(url, this.baseUrl + "/");
        const list = Array.isArray(data.result) ? data.result : [];
        const comics = list.map((item) => this.buildComic(item)).filter((c) => !!c);
        const maxPage = Math.max(1, Number(data.num_pages) || safePage);
        return { comics, maxPage };
      } catch (e) {
        console.error(`${this.name} 分类「${category}/${param}」加载失败：`, e);
        return { comics: [], maxPage: safePage };
      }
    },
    optionList: [],
  };

  // ============================================================
  // 搜索（三段式路径翻页 /search/{kw}/{page}/{sort}）
  // ============================================================

  search = {
    load: async (keyword, options, page) => {
      const kw = String(keyword || "").trim();
      const safePage = Math.max(1, Number(page) || 1);
      if (!kw) return { comics: [], maxPage: 1 };

      try {
        // sort="all" 为观察到的回落默认值（全库匹配）；官方 UI 仅 popular-today/weekly，待验证
        const url = `${this.apiBase}/search/${encodeURIComponent(kw)}/${safePage}/all`;
        const data = await this.getJson(url, this.baseUrl + "/");
        const list = Array.isArray(data.result) ? data.result : [];
        const comics = list.map((item) => this.buildComic(item)).filter((c) => !!c);
        // maxPage 依据：服务端 num_pages（关键词匹配的总页数），非猜测
        const maxPage = Math.max(1, Number(data.num_pages) || safePage);
        return { comics, maxPage };
      } catch (e) {
        console.error(`${this.name} 搜索失败：`, e);
        return { comics: [], maxPage: 1 };
      }
    },
    optionList: [],
  };

  // ============================================================
  // 详情与章节（单章直载）
  // ============================================================

  comic = {
    loadInfo: async (id) => {
      const comicId = this.normalizeComicId(id);
      if (!comicId) throw new Error(`无效的漫画 ID：${id}`);

      const url = `${this.apiBase}/book/${comicId}`;
      const data = await this.getJson(url, this.baseUrl + "/");
      if (!data || data.error) throw new Error(`详情加载失败：${data && data.error}`);

      // 标题：pretty > english > japanese
      const title =
        (data.title && (data.title.pretty || data.title.english || data.title.japanese)) ||
        "";
      if (!title) throw new Error("详情页标题缺失");

      // 封面：images.cover.t
      let cover = "";
      if (data.images && data.images.cover) {
        cover = this.absoluteUrl(data.images.cover.t || "");
      }
      if (!cover && data.images && data.images.thumbnail) {
        cover = this.absoluteUrl(data.images.thumbnail.t || "");
      }

      // 标签：tags[].name
      const tags = {};
      if (Array.isArray(data.tags) && data.tags.length > 0) {
        tags["标签"] = data.tags.map((t) => t && t.name).filter(Boolean);
      }
      if (data.lang) tags["语言"] = [String(data.lang)];

      // 单章直载：整本 = 1 章。ep 用 comicId（normalizeEpId 兼容 /v/{id}）
      const numPages = Number(data.num_pages) || 0;
      const epId = String(comicId);
      const chapterTitle = numPages > 0 ? `第1话（共${numPages}页）` : "第1话";
      const chapters = new Map([[epId, chapterTitle]]);

      return new ComicDetails({
        title,
        cover,
        description: "",
        tags,
        chapters,
        url,
      });
    },

    loadEp: async (comicId, epId) => {
      const ep = this.normalizeEpId(epId);
      const cid = this.normalizeComicId(comicId);
      if (!ep || !cid) return { images: [] };

      const url = `${this.apiBase}/book/${cid}`;
      const referer = `${this.baseUrl}/v/${cid}`;

      try {
        const data = await this.getJson(url, referer);
        const pages = (data && data.images && data.images.pages) || [];
        const images = [];
        const seen = new Set();
        for (const p of pages) {
          if (!p || !p.t) continue;
          const abs = this.absoluteUrl(p.t);
          if (!abs || seen.has(abs)) continue;
          // 只保留合法 webp/jpg/png 图片
          if (!/\.(jpe?g|png|webp)(?:[?#]|$)/i.test(abs)) continue;
          seen.add(abs);
          images.push(abs);
        }
        return { images };
      } catch (e) {
        console.error(`${this.name} 章节 ${ep} 加载失败：`, e);
        return { images: [] };
      }
    },

    onImageLoad: (url, comicId, epId) => {
      const cid = this.normalizeComicId(comicId);
      const referer = cid ? `${this.baseUrl}/v/${cid}` : this.baseUrl + "/";
      return {
        headers: this.imageHeaders(referer),
      };
    },

    onThumbnailLoad: (url) => ({
      headers: this.imageHeaders(this.baseUrl + "/"),
    }),
  };
}
