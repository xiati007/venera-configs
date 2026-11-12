/**
 * 色漫谷（semangu2.com）Venera 漫画源
 *
 * 版本：1.0.0
 * 站点：https://semangu2.com/
 * 取证时间：2026-11-04
 *
 * 已验证能力：
 *  - 首页 多个推荐/更新区块（最新更新 / 本周热门 / 新上架 / 小编推荐 / 已完结）
 *  - 搜索 /man-hua-sou-suo/{关键词}/ob/{排序}/st/{进度}[/page/{n}]
 *  - 分类 /man-hua-fen-lei/{分类}/ob/{排序}/st/{进度}[/page/{n}]，约 30 卡/页
 *  - 详情 标题 / 封面 / 作者 / 类别 / 状态 / 简介 / 章节列表
 *  - 章节 明文直链图片，约 190 张/话（img.lazyload[data-original]）
 *
 * 权限边界：公开可读，无登录 / 无 VIP
 * 安全边界：只解析静态 HTML，不执行站点脚本；无 eval / 无 new Function
 * 已知限制：分页 maxPage 由「尾页」链接解析；站点改版或加验证时需重新取证
 */

/** @type {import('./_venera_.js')} */
class SemanguSource extends ComicSource {
  // ============================================================
  // 元数据（必填）
  // ============================================================

  name = "色漫谷";
  key = "semangu";
  version = "1.0.0";
  minAppVersion = "1.0.0"; // ⚠️ 三段式，不能留空
  url = "https://semangu2.com/";

  // ============================================================
  // 站点常量
  // ============================================================

  baseUrl = "https://semangu2.com";

  siteUa =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

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

  baseHeaders(referer) {
    return {
      "User-Agent": this.siteUa,
      Referer: referer || this.baseUrl + "/",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };
  }

  imageHeaders(referer) {
    // 实测 CDN 无 Referer 校验（无 Referer 也返回 200），仍带站点 Referer 以稳妥
    return {
      "User-Agent": this.siteUa,
      Referer: referer || this.baseUrl + "/",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
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

  /** 解码实体 + 去空白 */
  cleanText(text) {
    return String(text || "")
      .replace(/&hellip;/gi, "…")
      .replace(/&hearts;/gi, "♥")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ============================================================
  // ID 标准化
  // ============================================================

  /** 从链接提取漫画 ID：/man-hua-yue-du/{id}.html 或 /man-hua-yue-du/{id}/{ep}.html */
  parseComicId(href) {
    const value = String(href || "").trim();
    if (!value) return null;
    const m = value.match(/\/man-hua-yue-du\/(\d+)(?:\.html)?(?:\/|$)/);
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

  /**
   * 章节 ID 标准化（兼容历史入参）
   *
   * 站点章节 URL 形态：/man-hua-yue-du/{cid}/{epKey}.html，epKey 为大小写字母数字混合串
   * 支持：完整 URL / 纯 epKey / {epId|chapterId|id|url} 对象 / 组合 ID
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

    // 完整章节 URL：/man-hua-yue-du/{cid}/{epKey}.html
    const mUrl = s.match(/\/man-hua-yue-du\/\d+\/([A-Za-z0-9]+)(?:\.html?)?/i);
    if (mUrl) return mUrl[1];

    // 组合 ID：取最后一段
    if (s.includes("|") || s.includes(",")) {
      s = s.split(/[|,]/).pop().trim();
    }

    // 去扩展名 / 分页后缀
    s = s.replace(/\.html?$/i, "");
    s = s.split("_")[0];

    // 仅字母数字混合 key 合法；"0" 视为无效 ID（parseComicId 同规则）
    if (/^[A-Za-z0-9]+$/.test(s) && s !== "0") return s;
    return null;
  }

  // ============================================================
  // 列表卡片解析
  // ============================================================

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

  /** 单张卡片：div.stui-vodlist__box */
  parseCard(card) {
    if (!card) return null;

    // 标题（.title a 优先，回退 thumb 链接的 title 属性）
    let title = "";
    let href = "";
    const titleEl = card.querySelector(".stui-vodlist__detail .title a");
    if (titleEl && titleEl.attributes) {
      title = this.cleanText(titleEl.text);
      href = titleEl.attributes.href || "";
    }
    if (!title) {
      const thumb = card.querySelector("a.stui-vodlist__thumb");
      if (thumb && thumb.attributes) {
        title = this.cleanText(thumb.attributes.title);
        href = thumb.attributes.href || "";
      }
    }
    if (!title) return null;

    const id = this.parseComicId(href);
    if (!id) return null;

    // 封面（懒加载字段优先）
    let cover = "";
    const thumb = card.querySelector("a.stui-vodlist__thumb");
    if (thumb && thumb.attributes) {
      cover =
        thumb.attributes["data-original"] ||
        thumb.attributes["data-src"] ||
        thumb.attributes.src ||
        "";
    }
    if (this.isPlaceholderImage(cover)) cover = "";

    // 副标题（更新时间）
    let subTitle = "";
    const subEl = card.querySelector(".stui-vodlist__detail .text");
    if (subEl && subEl.text) subTitle = this.cleanText(subEl.text);

    return this.buildComic({ url: href, title, cover, subTitle });
  }

  /** 解析整页 HTML 中所有卡片 */
  parseCards(html) {
    const doc = new HtmlDocument(html);
    try {
      const cards = doc.querySelectorAll(".stui-vodlist__box");
      const comics = [];
      for (const card of cards) {
        const comic = this.parseCard(card);
        if (comic) comics.push(comic);
      }
      return comics;
    } finally {
      doc.dispose();
    }
  }

  isPlaceholderImage(url) {
    const s = String(url || "").toLowerCase();
    if (!s) return true;
    if (s.startsWith("data:image/")) return true;
    if (s.includes("empty.png")) return true;
    if (s.includes("placeholder")) return true;
    if (s.includes("load.gif")) return true;
    if (s.includes("loading")) return true;
    if (/\.svg($|\?)/.test(s)) return true;
    return false;
  }

  /** maxPage：分类/搜索页末页链接 /page/{n} */
  parseMaxPage(doc, fallback) {
    let maxPage = fallback;
    const links = doc.querySelectorAll(".stui-page a");
    for (const a of links) {
      const text = a.text ? String(a.text).trim() : "";
      const href = (a.attributes && a.attributes.href) || "";
      // 尾页 / 末页 / 末頁
      if (/尾页|末页|末頁|last/i.test(text) || /尾页|末页/i.test(href)) {
        const m = href.match(/\/page\/(\d+)/);
        if (m) maxPage = Math.max(maxPage, parseInt(m[1], 10));
      }
    }
    // 兜底：取所有 page 链接最大值
    for (const a of links) {
      const href = (a.attributes && a.attributes.href) || "";
      const m = href.match(/\/page\/(\d+)/);
      if (m) maxPage = Math.max(maxPage, parseInt(m[1], 10));
    }
    return maxPage;
  }

  // ============================================================
  // 首页探索
  // ============================================================

  explore = [
    {
      title: this.name,
      type: "singlePageWithMultiPart",
      load: async (page) => {
        try {
          const html = await this.getText(this.baseUrl + "/", this.baseUrl + "/");
          const doc = new HtmlDocument(html);
          try {
            const result = {};
            // 首页每个区块：.stui-pannel_hd h3.title 为区块名，随后 .stui-pannel-box 内卡片
            for (const panel of doc.querySelectorAll(".stui-pannel-box")) {
              const head = panel.querySelector(".stui-pannel_hd h3.title");
              const title = head && head.text ? this.cleanText(head.text) : "";
              if (!title || result[title]) continue;

              const comics = [];
              const seen = new Set();
              for (const card of panel.querySelectorAll(".stui-vodlist__box")) {
                const comic = this.parseCard(card);
                if (comic && !seen.has(comic.id)) {
                  seen.add(comic.id);
                  comics.push(comic);
                }
              }
              // 首页顶部推荐区可能是其它结构，跳过空区块
              if (comics.length > 0) {
                result[title] = comics;
              }
            }
            return result;
          } finally {
            doc.dispose();
          }
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
        categories: ["全部", "日漫", "韩漫", "3D", "真人", "同性"],
        categoryParams: ["all", "日漫", "韩漫", "3D", "真人", "同性"],
        itemType: "category",
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const safePage = Math.max(1, Number(page) || 1);
      const genre = String(param || "all").trim() || "all";
      try {
        // optionList 两组：进度 st / 排序 ob
        const stRaw = String((options && options[0]) || "").split("-")[0];
        const obRaw = String((options && options[1]) || "").split("-")[0];
        const st = ["all", "serialized", "completed"].includes(stRaw) ? stRaw : "all";
        const ob = ["time", "hits"].includes(obRaw) ? obRaw : "time";

        const base = `${this.baseUrl}/man-hua-fen-lei/${encodeURIComponent(
          genre
        )}/ob/${ob}/st/${st}`;
        const url = safePage <= 1 ? base : `${base}/page/${safePage}`;

        const html = await this.getText(url, this.baseUrl + "/");
        const doc = new HtmlDocument(html);
        try {
          const comics = this.parseCards(html);
          const maxPage = this.parseMaxPage(doc, safePage);
          return { comics, maxPage };
        } finally {
          doc.dispose();
        }
      } catch (e) {
        console.error(`${this.name} 分类「${category}」加载失败：`, e);
        return { comics: [], maxPage: safePage };
      }
    },
    optionList: [
      {
        label: "进度",
        type: "select",
        options: ["all-全部", "serialized-连载中", "completed-已完结"],
      },
      {
        label: "排序",
        type: "select",
        options: ["time-按时间", "hits-按人气"],
      },
    ],
  };

  // ============================================================
  // 搜索
  // ============================================================

  search = {
    load: async (keyword, options, page) => {
      const kw = String(keyword || "").trim();
      const safePage = Math.max(1, Number(page) || 1);
      if (!kw) return { comics: [], maxPage: 1 };

      try {
        const obRaw = String((options && options[0]) || "").split("-")[0];
        const ob = ["time", "hits"].includes(obRaw) ? obRaw : "time";
        const base = `${this.baseUrl}/man-hua-sou-suo/${encodeURIComponent(
          kw
        )}/ob/${ob}/st/all`;
        const url = safePage <= 1 ? base : `${base}/page/${safePage}`;

        const html = await this.getText(url, this.baseUrl + "/");
        const doc = new HtmlDocument(html);
        try {
          const comics = this.parseCards(html);
          const maxPage = this.parseMaxPage(doc, 1);
          return { comics, maxPage };
        } finally {
          doc.dispose();
        }
      } catch (e) {
        console.error(`${this.name} 搜索「${kw}」失败：`, e);
        return { comics: [], maxPage: 1 };
      }
    },
    optionList: [
      {
        label: "排序",
        type: "select",
        options: ["time-按时间", "hits-按人气"],
      },
    ],
  };

  // ============================================================
  // 详情与章节
  // ============================================================

  comic = {
    loadInfo: async (id) => {
      const comicId = this.normalizeComicId(id);
      if (!comicId) throw new Error(`无效的漫画 ID：${id}`);

      const url = `${this.baseUrl}/man-hua-yue-du/${comicId}.html`;
      const html = await this.getText(url, this.baseUrl + "/");
      const doc = new HtmlDocument(html);
      try {
        // 标题：<h1>《xxx》</h1>
        const titleEl = doc.querySelector("h1");
        const title = titleEl && titleEl.text ? this.cleanText(titleEl.text) : "";
        if (!title) throw new Error("详情页标题缺失");

        // 封面：og:image 最稳（详情页首图 / 封面 CDN 直链）
        let cover = "";
        const coverImg = doc.querySelector("a.stui-vodlist__thumb, .stui-vodlist__thumb");
        if (coverImg && coverImg.attributes) {
          cover =
            coverImg.attributes["data-original"] ||
            coverImg.attributes["data-src"] ||
            coverImg.attributes.src ||
            "";
        }
        if (this.isPlaceholderImage(cover)) {
          const ogImage = doc.querySelector("meta[property='og:image'], meta[itemprop='image']");
          cover = ogImage && ogImage.attributes ? ogImage.attributes.content || "" : "";
        }
        cover = this.absoluteUrl(cover);

        // 简介：p.desc.detail 的 .detail-sketch
        let description = "";
        const introEl = doc.querySelector(".stui-content__detail p.desc .detail-sketch");
        if (introEl && introEl.text) description = this.cleanText(introEl.text);
        if (!description) {
          const descEl = doc.querySelector("p.desc, .desc.detail");
          if (descEl && descEl.text) description = this.cleanText(descEl.text);
        }

        // 作者：p.data a[href^='/man-hua-sou-suo/']
        let author = "";
        const authorEl = doc.querySelector(".stui-content__detail p.data a[href^='/man-hua-sou-suo/']");
        if (authorEl && authorEl.text) author = this.cleanText(authorEl.text);

        // 类别：p.data 中「类别：」后的文本 / a[href^='/man-hua-fen-lei/']
        let catText = "";
        const catEl = doc.querySelector(".stui-content__detail a[href^='/man-hua-fen-lei/']");
        if (catEl && catEl.text) catText = this.cleanText(catEl.text);
        if (!catText) {
          for (const p of doc.querySelectorAll(".stui-content__detail p.data")) {
            const t = p.text ? String(p.text) : "";
            if (t.indexOf("类别") >= 0) {
              catText = t.replace(/类别[：:]\s*/, "").trim();
              break;
            }
          }
        }

        // 状态：meta[property='og:comic:status'] 最稳，回落 p.data「时间：」
        let statusText = "";
        const statusMeta = doc.querySelector("meta[property='og:comic:status']");
        if (statusMeta && statusMeta.attributes) {
          statusText = this.cleanText(statusMeta.attributes.content);
        }
        if (!statusText) {
          for (const p of doc.querySelectorAll(".stui-content__detail p.data")) {
            const t = p.text ? String(p.text) : "";
            if (t.indexOf("时间") >= 0) {
              statusText = t.replace(/时间[：:]\s*/, "").split(/\s+/)[0].trim();
              break;
            }
          }
        }
        const statusClean = statusText || "";

        // 章节列表：ul.stui-content__playlist a（不含顶部「开始阅读」按钮）
        const entries = [];
        const seen = new Set();
        for (const a of doc.querySelectorAll(".stui-content__playlist a")) {
          const href = (a.attributes && a.attributes.href) || "";
          const ep = this.normalizeEpId(href);
          if (!ep || seen.has(ep)) continue;
          seen.add(ep);
          const chapterTitle = a.text ? this.cleanText(a.text) : `第${ep}话`;
          entries.push([ep, chapterTitle]);
        }
        // 站点为正序（第1话在最前），无需反转
        const chapters = new Map(entries);
        if (chapters.size === 0) throw new Error("详情页章节列表为空");

        // Venera 契约（models.dart L151）：ComicDetails.tags 是 Map<String, List<String>>，
        // 值必须是数组；字段名只能是 title/cover/description/tags/chapters（不能 intro/name）。
        // 传 intro 或把 tags 值写成字符串，都会在 Dart 侧报
        // type 'Null'/'List' is not a subtype of type 'String'/'Map'。
        const authorArr = author ? [author] : [];
        const catArr = catText ? [catText] : [];
        const statusArr = statusClean ? [statusClean] : [];
        return new ComicDetails({
          title,
          subtitle: author,
          cover,
          description,
          tags: {
            "作者": authorArr,
            "类别": catArr,
            "状态": statusArr,
          },
          chapters,
          url,
        });
      } finally {
        doc.dispose();
      }
    },

    loadEp: async (comicId, epId) => {
      const ep = this.normalizeEpId(epId);
      if (!ep) return { images: [] };
      const cid = this.normalizeComicId(comicId);
      // 章节 URL 必须同时有 comicId 与 epKey，仅 epKey 会 404 → 缺一安全返回空
      if (!cid) return { images: [] };
      const url = `${this.baseUrl}/man-hua-yue-du/${cid}/${ep}.html`;
      const referer = `${this.baseUrl}/man-hua-yue-du/${cid}.html`;

      try {
        const html = await this.getText(url, referer);
        const doc = new HtmlDocument(html);
        try {
          const images = [];
          const seen = new Set();

          for (const img of doc.querySelectorAll("img")) {
            const raw =
              img.attributes["data-original"] ||
              img.attributes["data-src"] ||
              img.attributes["lay-src"] ||
              img.attributes.src ||
              "";
            const abs = this.absoluteUrl(raw);

            if (!abs) continue;
            if (seen.has(abs)) continue;
            if (this.isPlaceholderImage(abs)) continue;
            // 仅保留正文 CDN 图片（18rouman.vip 下的 jpg/webp/png）
            if (!/\.18rouman\.vip\//i.test(abs)) continue;
            if (!/\.(jpe?g|png|webp|gif)(?:[?#]|$)/i.test(abs)) continue;

            seen.add(abs);
            images.push(abs);
          }

          return { images };
        } finally {
          doc.dispose();
        }
      } catch (e) {
        console.error(`${this.name} 章节 ${ep} 加载失败：`, e);
        return { images: [] };
      }
    },

    onImageLoad: (url, comicId, epId) => {
      const cid = this.normalizeComicId(comicId);
      const referer = cid
        ? `${this.baseUrl}/man-hua-yue-du/${cid}.html`
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
// 类名以 Source 结尾，Venera 通过全局类识别加载，无需 module.exports
