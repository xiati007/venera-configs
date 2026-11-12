/**
 * 鸟鸟韩漫（nnhm7.com）Venera 漫画源
 *
 * 版本：1.0.0
 * 站点：https://nnhm7.com/
 * 取证时间：2026-11-01
 *
 * 已验证能力：
 *  - 首页 5 个推荐区块（最近更新/新书发布/热门漫画/推荐漫画/已完结，各 9 卡）
 *  - 搜索 /search/{kw} 或 /catalog.php?key={kw}，18 卡/页
 *  - 分类 /comics/{cat}/ob/{ob}/st/{st}/page/{n}，18 卡/页，maxPage 来自末页链接
 *  - 详情：标题/封面/作者/标签/状态/简介/章节列表
 *  - 章节 163 张图片，懒加载明文直链（img[data-src]，无需 Referer）
 *
 * 权限边界：公开可读（无遮挡韩漫，无 VIP/付费墙）
 * 安全边界：只解析静态 HTML，不执行站点脚本；图片为明文直链，无解密
 * 已知限制：图片 CDN（new.niaopic.com）启用 Cloudflare TLS 指纹反爬，
 *           需浏览器级 HTTP 栈（Venera 正常）；爬虫库需模拟浏览器指纹
 */

/** @type {import('./_venera_.js')} */
class NiaoniaoHanmanSource extends ComicSource {
  // ============================================================
  // 元数据（必填）
  // ============================================================

  name = "鸟鸟韩漫";
  key = "nnhm7";
  version = "1.0.0";
  minAppVersion = "1.4.0"; // 显式三段式
  url = ""; // 无托管更新地址，显式留空

  // ============================================================
  // 站点常量
  // ============================================================

  base = "https://nnhm7.com";

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
    if (value.startsWith("/")) return this.base + value;
    return value;
  }

  // 漫画 ID：/comic/{slug}.html -> slug（兼容直接 slug）
  parseComicId(href) {
    const value = String(href || "").trim();
    if (!value) return null;
    const m = value.match(/\/comic\/([^/]+?)\.html/);
    if (m) return m[1];
    if (/^[a-zA-Z0-9-]+$/.test(value)) return value;
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
   * 章节 ID 标准化（兼容历史入参 12 种形态）
   * 章节 URL 格式：/comic/{slug}/chapter-{epId}.html
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

    // 形态 2-3+6：完整/相对 URL 或带扩展名（/comic/{slug}/chapter-86704.html, chapter-86704.html）
    const mUrl = s.match(/chapter[-/]?(\d+)/);
    if (mUrl) return mUrl[1] === "0" ? null : mUrl[1];

    // 形态 4-5：组合 ID
    if (s.includes("|") || s.includes(",")) {
      s = s.split(/[|,]/).pop().trim();
    }

    // 形态 7：分页后缀
    s = s.split("_")[0];

    // 形态 6：扩展名
    s = s.replace(/\.html?$/i, "");

    // 形态 1：纯数字（含尾部数字）
    if (/^\d+$/.test(s)) return s === "0" ? null : s;
    const tail = s.match(/(\d+)$/);
    if (tail && tail[1] !== "0") return tail[1];

    // 形态 12：非法
    return null;
  }

  // ============================================================
  // 列表卡片解析
  // ============================================================

  parseCard(card) {
    if (!card) return null;

    const linkA = card.querySelector("a.ImgA") || card.querySelector("a[href]");
    if (!linkA) return null;
    const href = String(linkA.attributes.href || "");
    const id = this.parseComicId(href);
    if (!id) return null;

    // 标题：a.txtA 文本优先，回退到 a.ImgA[title]
    let title = "";
    const txtA = card.querySelector("a.txtA");
    if (txtA && txtA.text) title = String(txtA.text).trim();
    if (!title && linkA.attributes.title) title = String(linkA.attributes.title).trim();
    if (!title) return null;

    // 封面：a.ImgA 内 img[src]（jpg），回退 source[srcset]（webp）
    let cover = "";
    const img = card.querySelector("a.ImgA img") || card.querySelector("img");
    if (img && img.attributes) {
      cover =
        img.attributes["data-src"] ||
        img.attributes["data-original"] ||
        img.attributes.src ||
        "";
    }
    if (!cover) {
      const src = card.querySelector("a.ImgA source");
      if (src && src.attributes) cover = src.attributes.srcset || "";
    }
    cover = this.absoluteUrl(String(cover).trim().split(" ")[0]);

    return new Comic({ id, title, cover });
  }

  parseCards(html) {
    const doc = new HtmlDocument(html);
    try {
      // 列表/首页卡片容器：ul.col_3_1 > li（首页 5 区块也复用）
      const cards = doc.querySelectorAll("li");
      const comics = [];
      for (const card of cards) {
        if (!card.querySelector("a.ImgA")) continue;
        const comic = this.parseCard(card);
        if (comic) comics.push(comic);
      }
      return comics;
    } finally {
      doc.dispose();
    }
  }

  // maxPage：分页控件末页链接真实最大页（/page/{n}）
  parseMaxPage(doc, fallback) {
    let maxPage = Math.max(1, Number(fallback) || 1);
    for (const a of doc.querySelectorAll("nav a[href]")) {
      const href = String(a.attributes.href || "");
      const m = href.match(/\/page\/(\d+)/);
      if (m) {
        const p = parseInt(m[1], 10);
        if (p > maxPage) maxPage = p;
      }
    }
    return maxPage;
  }

  // ============================================================
  // 首页探索（5 区块）
  // ============================================================

  explore = [
    {
      title: this.name,
      type: "singlePageWithMultiPart",
      load: async (page) => {
        try {
          const res = await Network.get(this.base + "/");
          const doc = new HtmlDocument(res.body);
          try {
            const result = {};
            for (const section of doc.querySelectorAll(".imgBox")) {
              const titleEl = section.querySelector(".Sub_H2 .Title");
              const title = titleEl && titleEl.text ? String(titleEl.text).trim() : "";
              if (!title) continue;
              const comics = [];
              for (const card of section.querySelectorAll("ul.col_3_1 li")) {
                if (!card.querySelector("a.ImgA")) continue;
                const comic = this.parseCard(card);
                if (comic) comics.push(comic);
              }
              if (comics.length > 0 && !result[title]) result[title] = comics;
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

  // 分类：题材为主分类（/comics/{genre}/ob/{ob}/st/{st}）
  category = {
    title: this.name,
    parts: [
      {
        name: "分类",
        type: "fixed",
        categories: [
          "全部", "正妹", "恋爱", "出版漫画", "肉慾", "浪漫", "大尺度", "巨乳",
          "有夫之婦", "女大生", "狗血劇", "同居", "好友", "調教", "动作", "後宮",
          "不倫", "3D", "校園", "耽美", "日漫",
        ],
        categoryParams: [
          "all", "正妹", "恋爱", "出版漫画", "肉慾", "浪漫", "大尺度", "巨乳",
          "有夫之婦", "女大生", "狗血劇", "同居", "好友", "調教", "动作", "後宮",
          "不倫", "3D", "校園", "耽美", "日漫",
        ],
        itemType: "category",
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    // 两个筛选维度：状态（全部/已完结/连载中）+ 排序（按时间/按热度）
    optionList: [
      { options: ["-全部", "completed-已完结", "serialized-连载中"] },
      { options: ["-按时间", "hits-按热度"] },
    ],
    load: async (category, param, options, page) => {
      const safePage = Math.max(1, Number(page) || 1);
      const genre = String(param || "").trim();
      if (!genre) return { comics: [], maxPage: safePage };
      // options[0]=状态, options[1]=排序；"-全部"/"-按时间" 为无筛选（空值）
      const rawSt = String((options && options[0]) || "");
      const rawOb = String((options && options[1]) || "");
      const st = rawSt.split("-")[0] || "all";
      const ob = rawOb.split("-")[0] || "time";
      try {
        const basePath = `${this.base}/comics/${encodeURIComponent(genre)}/ob/${ob}/st/${st}`;
        const url = safePage <= 1 ? basePath : `${basePath}/page/${safePage}`;
        const res = await Network.get(url);
        const doc = new HtmlDocument(res.body);
        try {
          const comics = this.parseCards(res.body);
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
  };

  // ============================================================
  // 搜索（/search/{kw}，分页 /search/{kw}/page/{n}）
  // ============================================================

  search = {
    load: async (keyword, options, page) => {
      const kw = String(keyword || "").trim();
      const safePage = Math.max(1, Number(page) || 1);
      if (!kw) return { comics: [], maxPage: 1 };
      try {
        const q = encodeURIComponent(kw);
        const url =
          safePage <= 1
            ? `${this.base}/search/${q}`
            : `${this.base}/search/${q}/page/${safePage}`;
        const res = await Network.get(url);
        const doc = new HtmlDocument(res.body);
        try {
          const comics = this.parseCards(res.body);
          const maxPage = this.parseMaxPage(doc, 1);
          return { comics, maxPage };
        } finally {
          doc.dispose();
        }
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

      const url = `${this.base}/comic/${comicId}.html`;
      const res = await Network.get(url);
      const doc = new HtmlDocument(res.body);
      try {
        // 标题：.txtItme2 > h1（《姨見鍾情》）
        let title = "";
        const h1 = doc.querySelector(".txtItme2 h1");
        if (h1 && h1.text) title = String(h1.text).trim();
        if (!title) {
          const t = doc.querySelector("h1");
          if (t && t.text) title = String(t.text).trim();
        }
        title = title.replace(/[《》]/g, "").trim();
        if (!title) throw new Error("详情页标题缺失");

        // 封面：#Cover img[src]
        let cover = "";
        const coverImg = doc.querySelector("#Cover img") || doc.querySelector(".pic img");
        if (coverImg && coverImg.attributes) {
          cover = coverImg.attributes["data-src"] || coverImg.attributes.src || "";
        }
        cover = this.absoluteUrl(cover);

        // 作者：.sub_r 中第一个 p.txtItme（icon02）
        let author = "";
        const txtItmes = doc.querySelectorAll(".sub_r p.txtItme");
        if (txtItmes && txtItmes.length > 0) {
          const a0 = txtItmes[0];
          author = a0.text ? String(a0.text).trim() : "";
        }

        // 标签：.sub_r p.txtItme 内 a[href^="/comics/"]
        const tagTexts = [];
        for (const a of doc.querySelectorAll('.sub_r p.txtItme a[href^="/comics/"]')) {
          const t = a.text ? String(a.text).trim() : "";
          if (t) tagTexts.push(t);
        }

        // 状态：p.txtItme > span.date
        let status = "";
        const dateEl = doc.querySelector(".sub_r span.date");
        if (dateEl && dateEl.text) status = String(dateEl.text).trim();

        // 简介：p.txtDesc
        let description = "";
        const descEl = doc.querySelector("p.txtDesc");
        if (descEl && descEl.text) {
          description = String(descEl.text).replace(/^介绍\s*[:：]?/, "").trim();
        }

        // 章节：ul#mh-chapter-list-ol-0 > li > a，DOM 为最新话在前，反转成第 1 话在前
        const entries = [];
        const seen = new Set();
        for (const a of doc.querySelectorAll("#mh-chapter-list-ol-0 li a[href]")) {
          const ep = this.normalizeEpId(a.attributes.href);
          if (!ep || seen.has(ep)) continue;
          seen.add(ep);
          const span = a.querySelector("span");
          const chapterTitle = span && span.text
            ? String(span.text).trim()
            : a.text
            ? String(a.text).trim()
            : `第${ep}话`;
          entries.push([ep, chapterTitle]);
        }
        entries.reverse(); // 倒序反转（新→旧 变 旧→新）

        const chapters = {};
        for (const [ep, chapterTitle] of entries) chapters[ep] = chapterTitle;
        if (Object.keys(chapters).length === 0) throw new Error("详情页章节列表为空");

        const tags = {};
        if (tagTexts.length) tags["标签"] = tagTexts;
        if (status) tags["状态"] = [status];

        return new ComicDetails({
          title,
          subTitle: author,
          cover,
          description,
          tags,
          chapters,
        });
      } finally {
        doc.dispose();
      }
    },

    loadEp: async (comicId, epId) => {
      const cid = this.normalizeComicId(comicId);
      const ep = this.normalizeEpId(epId);
      if (!ep || !cid) return { images: [] };

      const url = `${this.base}/comic/${cid}/chapter-${ep}.html`;
      const referer = `${this.base}/comic/${cid}.html`;

      try {
        const res = await Network.get(url, { Referer: referer });
        const doc = new HtmlDocument(res.body);
        try {
          const images = [];
          const seen = new Set();
          // 正文图片：img[data-src]（懒加载明文直链）
          for (const img of doc.querySelectorAll("img[data-src]")) {
            const raw = img.attributes["data-src"] || "";
            const abs = this.absoluteUrl(raw);
            if (!abs) continue;
            if (seen.has(abs)) continue;
            if (this.isPlaceholderImage(abs)) continue;
            if (!/\.(jpe?g|png|webp|gif)(?:[?#]|$)/i.test(abs)) continue;
            if (/(?:logo|loading|placeholder|avatar|icon|banner|share)/i.test(abs)) continue;
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
      const ep = this.normalizeEpId(epId);
      // 图片无需 Referer（实测无 Referer 亦 200），保留防御性头
      return {
        headers: {
          "User-Agent": this.siteUa,
          Referer: cid && ep ? `${this.base}/comic/${cid}/chapter-${ep}.html` : this.base + "/",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      };
    },
  };

  // 占位图判断
  isPlaceholderImage(url) {
    const s = String(url || "").toLowerCase();
    if (!s) return true;
    if (s.startsWith("data:image/")) return true;
    if (s.includes("empty.png")) return true;
    if (s.includes("placeholder")) return true;
    if (s.includes("loading")) return true;
    if (s.includes("imgloading")) return true;
    if (/\.svg($|\?)/.test(s)) return true;
    return false;
  }
}
// 类名以 Source 结尾，Venera 通过全局类识别加载，无需 module.exports
