/**
 * 连连看漫画（hmmfk.com / hmllk.com）Venera 漫画源
 *
 * 版本：1.1.0
 * 站点：https://www.hmmfk.com/
 * 取证时间：2026-11-01
 *
 * 站点按 User-Agent 返回两套模板（移动 mstyle.css / 桌面 style.css）。
 * 本源采用**移动取向**（siteUa=移动 UA，与手机浏览器一致）。
 *
 * 已验证能力：
 *  - 首页：热门卡片（div.manga-list-2-cover，swiper 标签页结构，按 id 去重）
 *  - 搜索 /search?keyword={kw}，div.book-list 卡片，单页无分页
 *  - 分类：题材主分类（全部 + 99 项）/list/{genre}.html，分页 /list/{genre}-{n}.html
 *        筛选面板（进度 全部/连载中/已完结 + 地区 6 项）组合 /list/{genre}_{end}_{area}.html，可分页 {path}-{n}.html
 *        「全部」分类 /list（页1）、/list/index-{n}.html（页n，maxPage=59，滑动窗口→有界二分探测）
 *  - 详情 /manhua/{id}：p.detail-main-info-title / div.detail-main-cover img.lazy / p.detail-main-info-author /
 *        p.detail-main-info-class / p.detail-desc / #detail-list-title span.detail-list-title-3（更新时间）/ ul#detail-list-select（移动版倒序，已反转成第1话在前）
 *  - 章节 /chapter/{id}：img.lazy[data-original] 明文直链，章节内分页 ?page=N（移动每页 10 图），
 *        终止条件 a[title="下一页"][href] 缺失（桌面 id=nextPage / 移动 view-bottom-bar-item 均匹配）
 *
 * 权限边界：公开可读（无 VIP/付费墙/地区限制）
 * 安全边界：只解析静态 HTML，不执行站点脚本；图片明文直链，无解密
 * 已知限制：图片 CDN（llk.acgnfl.com）无 Referer 校验；章节分页需逐页抓取（低并发+间隔）
 */

/** @type {import('./_venera_.js')} */
class LianliankanSource extends ComicSource {
  // ============================================================
  // 元数据（必填）
  // ============================================================

  name = "连连看漫画";
  key = "hmmfk";
  version = "1.1.2";
  minAppVersion = "1.4.0"; // 显式三段式
  url = ""; // 无托管更新地址，显式留空

  // ============================================================
  // 站点常量
  // ============================================================

  base = "https://www.hmmfk.com";

  // 移动取向：与手机浏览器一致，站点返回移动模板（mstyle.css）
  siteUa =
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

  // 列表真实 maxPage 缓存（按列表 base 路径）
  maxPageCache = {};

  // 题材（99 项，不含「全部」）——与站点「分类」下拉一致
  genreLabels = [
    "男性", "真人", "恋爱", "都市", "冒险", "动作", "校园", "韩国", "恐怖", "BL", "热血", "搞笑", "科幻", "玄幻", "少女", "灵异",
    "日漫", "情感", "生活", "异能", "奇幻", "魔幻", "末世", "悬疑", "伦理", "爱情", "后宫", "性感", "纯爱", "同居", "高校", "暧昧", "青春",
    "灵药", "古代", "神鬼", "出轨", "出版", "古装", "剧情", "穿越", "竞技", "古风", "霸总", "修真", "耽美", "战争", "同人", "励志", "少年",
    "青年", "戏剧", "漫画式小说", "运动", "仙侠", "其他", "师生", "3D", "NTR", "合集", "人妻", "无删减", "免费", "肉欲", "可爱", "巨乳",
    "大尺度", "黑丝", "办公室", "职场", "豪门", "巨乳肉欲性感情感透视黑丝袜", "巨乳性感", "性感巨乳", "校园巨乳肉欲性感黑丝袜高跟鞋小混混", "办公室职场巨乳肉欲性感情感",
    "巨乳肉欲性感大尺度透视", "伦理性感", "校园性感肉欲", "校园巨乳性感", "性感情感强迫大尺度", "伦理性感巨乳校园", "巨乳肉欲黑丝袜透视", "校园都市", "豪门巨乳",
    "职场巨乳", "情感性感强迫", "真人职场", "征服", "少妇", "诱惑", "百合", "初次", "恋物", "无圣光", "欲望", "超能力", "正妹", "姐姐",
  ];
  genreParams = [
    "nanxing", "zhenren", "lianai", "dushi", "maoxian", "dongzuo", "xiaoyuan", "hanguo",
    "kongbu", "bl", "rexue", "gaoxiao32", "kehuan", "xuanhuan", "shaonyu", "lingyi", "chubanriman",
    "qinggan", "shenghuo", "yineng", "qihuan", "mohuan", "moshiyineng", "xuanyi", "lunli", "aiqing",
    "hougong", "xinggan", "chunai", "tongju", "gaoxiao", "aimei", "qingchun", "lingyao", "gudai",
    "shengui", "chugui", "chubanmanhua", "guzhuang", "juqing", "chuanyue", "jingji", "gufeng",
    "bazong", "xiuzhen", "danmei", "zhanzheng", "tongren", "lizhi", "shaonian", "qingnian", "xiju",
    "manhuashixiaoshuo", "yundong", "xianxia", "qita", "shisheng", "68", "69", "heji", "renqi",
    "wushanjian", "mianfei", "rouyu", "keai", "juru", "dachidu", "heisi", "bangongshi", "zhichang",
    "haomen", "jururouyuxingganqinggantoushiheisiwa", "juruxinggan", "xingganjuru", "xiaoyuanjururouyuxingganheisiwagaogenxiexiaohunhun",
    "bangongshizhichangjururouyuxingganqinggan", "jururouyuxinggandachidutoushi", "lunlixinggan",
    "xiaoyuanxingganrouyu", "xiaoyuanjuruxinggan", "xingganqingganqiangpodachidu", "lunlixingganjuruxiaoyuan",
    "jururouyuheisiwatoushi", "xiaoyuandushi", "haomenjuru", "zhichangjuru", "qingganxingganqiangpo",
    "zhenrenzhichang", "zhengfu", "shaofu", "youhuo", "baihe", "chuci", "lianwu", "wushengguang",
    "yuwang", "chaonengli", "zhengmei", "jiejie",
  ];

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

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 基础请求头
  baseHeaders(referer) {
    return {
      "User-Agent": this.siteUa,
      Referer: referer || this.base + "/",
      Accept: "*/*",
    };
  }

  // 瞬态错误判断
  isTransientError(message) {
    return /timeout|timed out|connection reset|connection closed|peer closed|broken pipe|unexpected.?eof|network error|aborted|connection refused|unreachable|temporary/i.test(
      String(message || "")
    );
  }

  // 统一请求：瞬态重试一次，5xx 重试一次，4xx 不重试
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

  // 获取 HTML 文本
  async getText(url, referer) {
    const res = await this.request("GET", url, this.baseHeaders(referer), null);
    if (!res.body) throw new Error(`空响应（${url}）`);
    return String(res.body);
  }

  // ============================================================
  // ID 标准化
  // ============================================================

  // 漫画 ID：/manhua/{id} -> 数字 id
  parseComicId(href) {
    const value = String(href || "").trim();
    if (!value) return null;
    const m = value.match(/\/manhua\/(\d+)/);
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
   * 章节 ID 标准化（兼容历史入参 12 种形态）
   * 章节 URL 格式：/chapter/{epId}（可带 ?page=N）
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

    // 形态 2/3/6：完整或相对 URL（/chapter/5294, /chapter/5294?page=2, chapter/5294.html）
    const mUrl = s.match(/\/chapter\/(\d+)/);
    if (mUrl) return mUrl[1] === "0" ? null : mUrl[1];

    // 形态 4-5：组合 ID
    if (s.includes("|") || s.includes(",")) {
      s = s.split(/[|,]/).pop().trim();
    }

    // 形态 7：分页后缀 / 查询串
    s = s.split(/[?_]/)[0];

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
  // 列表卡片解析（移动模板）
  // ============================================================

  // 移动列表/首页卡片：li 内含 div.manga-list-2-cover
  parseMobileListCard(li) {
    if (!li) return null;
    const link = li.querySelector('div.manga-list-2-cover a[href^="/manhua/"]');
    if (!link || !link.attributes) return null;
    const id = this.parseComicId(String(link.attributes.href || ""));
    if (!id) return null;

    let title = "";
    const titleA = li.querySelector('p.manga-list-2-title a[title]');
    if (titleA && titleA.attributes && titleA.attributes.title) {
      title = String(titleA.attributes.title).trim();
    }
    if (!title && link.attributes.title) title = String(link.attributes.title).trim();
    if (!title) return null;

    let cover = "";
    const img = li.querySelector("div.manga-list-2-cover img");
    if (img && img.attributes) {
      cover =
        img.attributes["data-original"] ||
        img.attributes["data-src"] ||
        img.attributes.src ||
        "";
    }
    cover = this.absoluteUrl(cover);

    return new Comic({ id, title, cover, subTitle: "" });
  }

  // 移动搜索卡片：li 内含 div.book-list-cover
  parseSearchCard(li) {
    if (!li) return null;
    const link = li.querySelector('div.book-list-cover a[href^="/manhua/"]');
    if (!link || !link.attributes) return null;
    const id = this.parseComicId(String(link.attributes.href || ""));
    if (!id) return null;

    let title = "";
    const titleEl = li.querySelector("p.book-list-info-title");
    if (titleEl && titleEl.text) title = String(titleEl.text).trim();
    if (!title && link.attributes.title) title = String(link.attributes.title).trim();
    if (!title) return null;

    let cover = "";
    const img = li.querySelector("img.book-list-cover-img");
    if (img && img.attributes) {
      cover =
        img.attributes["data-original"] ||
        img.attributes["data-src"] ||
        img.attributes.src ||
        "";
    }
    cover = this.absoluteUrl(cover);

    let subTitle = "";
    const desc = li.querySelector("p.book-list-info-desc");
    if (desc && desc.text) subTitle = String(desc.text).trim().slice(0, 40);

    return new Comic({ id, title, cover, subTitle });
  }

  parseCards(html) {
    const doc = new HtmlDocument(html);
    try {
      const comics = [];
      const seen = new Set();
      const push = (c) => {
        if (c && !seen.has(c.id)) {
          seen.add(c.id);
          comics.push(c);
        }
      };
      // 移动卡片统一按 li 内封面容器分派（列表/首页: manga-list-2-cover；搜索: book-list-cover）
      for (const li of doc.querySelectorAll("li")) {
        if (li.querySelector("div.manga-list-2-cover")) {
          push(this.parseMobileListCard(li));
        } else if (li.querySelector("div.book-list-cover")) {
          push(this.parseSearchCard(li));
        }
      }
      return comics;
    } finally {
      doc.dispose();
    }
  }

  // maxPage：分页控件 ul.pagination / div.pagination 内 {path}-{n}.html / index-{n}.html 末值
  parseMaxPage(doc, fallback) {
    let maxPage = Math.max(1, Number(fallback) || 1);
    for (const a of doc.querySelectorAll("ul.pagination a[href], div.pagination a[href]")) {
      const href = String(a.attributes.href || "");
      const m = href.match(/(?:index-|-)(\d+)\.html$/);
      if (m) {
        const p = parseInt(m[1], 10);
        if (p > maxPage) maxPage = p;
      }
    }
    return maxPage;
  }

  // ============================================================
  // 首页探索（热门卡片，去重）
  // ============================================================

  explore = [
    {
      title: this.name,
      type: "singlePageWithMultiPart",
      load: async (page) => {
        try {
          const html = await this.getText(this.base + "/", this.base + "/");
          const comics = this.parseCards(html);
          return comics.length ? { "热门漫画": comics } : {};
        } catch (e) {
          console.error(`${this.name} 首页解析失败：`, e);
          return {};
        }
      },
    },
  ];

  // ============================================================
  // 分类：题材主分类（全部 + 99 项）+ 筛选面板（进度/地区）
  // ============================================================

  category = {
    title: this.name,
    parts: [
      {
        name: "分类",
        type: "fixed",
        itemType: "category",
        categories: ["全部", ...this.genreLabels],
        categoryParams: ["all", ...this.genreParams],
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    // 两个筛选维度：进度（全部/连载中/已完结）+ 地区（6 项）；移动模板无「语言」
    optionList: [
      { options: ["-全部", "0-连载中", "1-已完结"] },
      { options: ["-全部", "1-日本", "2-韩国", "3-港台", "4-欧美", "5-内地", "6-其他"] },
    ],
    load: async (category, param, options, page) => {
      const safePage = Math.max(1, Number(page) || 1);
      // param = 题材（"all"=全部, 其余为题材段）
      const genre = String(param || "").trim() || "all";
      // options[0]=进度（"-全部"→""，0=连载中，1=已完结）, options[1]=地区（"-全部"→""）
      const end = String((options && options[0]) || "").split("-")[0] || "";
      const area = String((options && options[1]) || "").split("-")[0] || "";
      try {
        const meta = this.listMeta(genre, end, area, "");
        const url = this.listPageUrl(meta, safePage);
        const html = await this.getText(this.base + url, this.base + "/");
        const doc = new HtmlDocument(html);
        try {
          const comics = this.parseCards(html);
          const maxPage = await this.resolveListMax(meta, doc, safePage);
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

  /**
   * 分类列表元信息（已实测各组合，移动/桌面共用 URL 方案）
   * 路径段：genre(题材) + end(进度 0/1) + area(地区 1..6)
   *   - 无筛选：/list/{genre}.html；「全部」/list
   *   - 仅进度：/list/{genre}_{end}.html（全部题材时 /list/all_{end}.html）
   *   - 地区出现时进度位用占位 "all"；语言位本模板不用
   */
  listMeta(genre, end, area, lang) {
    const segs = [];
    if (end) segs.push(end);
    else if (area || lang) segs.push("all");
    if (area) segs.push(area);
    else if (lang) segs.push("0");
    if (lang) segs.push(lang);
    if (segs.length === 0) {
      return genre === "all"
        ? { kind: "all", base: "/list" }
        : { kind: "genre", base: `/list/${genre}` };
    }
    return { kind: "filtered", base: `/list/${genre}_${segs.join("_")}` };
  }

  // 分页 URL：{path}-{n}.html；「全部」无筛选分页 /list/index-{n}.html
  listPageUrl(meta, page) {
    const p = Math.max(1, Number(page) || 1);
    if (meta.kind === "all") return p <= 1 ? "/list" : `/list/index-${p}.html`;
    return p <= 1 ? `${meta.base}.html` : `${meta.base}-${p}.html`;
  }

  // 有界边界探测 + 缓存：拿到真实 maxPage（分页控件为滑动窗口，第 1 页会低估）
  async resolveListMax(meta, doc, safePage) {
    const cacheKey = meta.base;
    if (this.maxPageCache[cacheKey] != null) return this.maxPageCache[cacheKey];

    // 窗口最高可见页（真实依据：这些页确实存在）
    let maxPage = this.parseMaxPage(doc, safePage);
    // 是否存在指向比当前页更后的分页链接（含 "»" 下一页 / #nextPage）→ 窗口被裁剪，需探测
    let hasNext = false;
    for (const a of doc.querySelectorAll("ul.pagination a[href], div.pagination a[href]")) {
      const href = String(a.attributes.href || "");
      const m = href.match(/(?:index-|-)(\d+)\.html$/);
      if (m && parseInt(m[1], 10) > safePage) {
        hasNext = true;
        break;
      }
    }
    if (hasNext) {
      // 二分探测真实末页（比线性探测省请求：全部列表 59 页 ≈ 6 次 vs 54 次）
      let low = maxPage; // 窗口最高可见页必有卡
      let high = 60; // 上限（手册 maxPage 上限）
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (mid === low) break;
        if (await this.listPageHasCards(meta, mid)) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }
      maxPage = low;
    }
    this.maxPageCache[cacheKey] = maxPage;
    return maxPage;
  }

  // 判断列表某一页是否有卡片（用于边界探测；空页/404/网络错误 → false）
  async listPageHasCards(meta, page) {
    try {
      const url = this.listPageUrl(meta, page);
      const html = await this.getText(this.base + url, this.base + "/");
      const d = new HtmlDocument(html);
      try {
        return d.querySelectorAll("div.manga-list-2-cover").length > 0;
      } finally {
        d.dispose();
      }
    } catch (e) {
      return false;
    }
  }

  // ============================================================
  // 搜索（/search?keyword={kw}，单页）
  // ============================================================

  search = {
    load: async (keyword, options, page) => {
      const kw = String(keyword || "").trim();
      const safePage = Math.max(1, Number(page) || 1);
      if (!kw) return { comics: [], maxPage: 1 };
      try {
        const url = `${this.base}/search?keyword=${encodeURIComponent(kw)}`;
        const html = await this.getText(url, this.base + "/");
        const doc = new HtmlDocument(html);
        try {
          const comics = this.parseCards(html);
          // 实测搜索无分页，maxPage=1
          const maxPage = this.parseMaxPage(doc, 1);
          return { comics, maxPage: Math.max(1, maxPage) };
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
  // 详情与章节（移动模板）
  // ============================================================

  comic = {
    loadInfo: async (id) => {
      const comicId = this.normalizeComicId(id);
      if (!comicId) throw new Error(`无效的漫画 ID：${id}`);

      const url = `${this.base}/manhua/${comicId}`;
      const html = await this.getText(url, this.base + "/");
      const doc = new HtmlDocument(html);
      try {
        // 标题：p.detail-main-info-title
        let title = "";
        const titleEl = doc.querySelector("p.detail-main-info-title");
        if (titleEl && titleEl.text) title = String(titleEl.text).trim();
        if (!title) throw new Error("详情页标题缺失");

        // 封面：div.detail-main-cover img.lazy[data-original]
        let cover = "";
        const coverImg = doc.querySelector("div.detail-main-cover img");
        if (coverImg && coverImg.attributes) {
          cover =
            coverImg.attributes["data-original"] ||
            coverImg.attributes["data-src"] ||
            coverImg.attributes.src ||
            "";
        }
        cover = this.absoluteUrl(cover);

        // 作者/状态/语言：p.detail-main-info-author（作者行 / 语言行）
        let author = "";
        let status = "";
        let language = "";
        for (const p of doc.querySelectorAll("p.detail-main-info-author")) {
          const text = p.text ? String(p.text).trim() : "";
          if (!text) continue;
          if (/^作者/.test(text)) {
            const m = text.replace(/^\s*作者\s*[:：]\s*/, "");
            const sp = m.split(/\s*状态\s*[:：]\s*/);
            author = sp[0].trim();
            if (sp.length > 1) status = sp[1].trim();
          } else if (/^语言/.test(text)) {
            const a = p.querySelector("a");
            language = a && a.text ? String(a.text).trim() : "";
          }
        }

        // 标签：p.detail-main-info-class span a
        const tagTexts = [];
        for (const a of doc.querySelectorAll("p.detail-main-info-class span a")) {
          const t = a.text ? String(a.text).trim() : "";
          if (t) tagTexts.push(t);
        }

        // 简介：p.detail-desc
        let description = "";
        const descEl = doc.querySelector("p.detail-desc");
        if (descEl && descEl.text) description = String(descEl.text).trim();

        // 更新时间：div#detail-list-title span.detail-list-title-3（"2026-10-29更新" → "2026-10-29"）
        let updateTime = "";
        const updateEl = doc.querySelector("#detail-list-title span.detail-list-title-3");
        if (updateEl && updateEl.text) {
          updateTime = String(updateEl.text).trim().replace(/更新\s*$/, "").trim();
        }

        // 章节：ul#detail-list-select li a[href^="/chapter/"]；移动版为倒序（第75话在前）→ 反转成第1话在前
        const entries = [];
        const seen = new Set();
        for (const a of doc.querySelectorAll('ul#detail-list-select li a[href^="/chapter/"]')) {
          const ep = this.normalizeEpId(a.attributes && a.attributes.href);
          if (!ep || seen.has(ep)) continue;
          seen.add(ep);
          const chapterTitle = a.text ? String(a.text).trim() : `第${ep}话`;
          entries.push([ep, chapterTitle]);
        }
        entries.reverse();

        const chapters = new Map(entries);
        if (chapters.size === 0) throw new Error("详情页章节列表为空");

        const tags = {};
        if (tagTexts.length) tags["标签"] = tagTexts;
        if (author) tags["作者"] = [author];
        if (status) tags["状态"] = [status];
        if (language) tags["语言"] = [language];
        if (updateTime) tags["更新时间"] = [updateTime];

        return new ComicDetails({
          title,
          subTitle: author,
          cover,
          description,
          tags,
          chapters,
          url,
        });
      } finally {
        doc.dispose();
      }
    },

    loadEp: async (comicId, epId) => {
      const cid = this.normalizeComicId(comicId);
      const ep = this.normalizeEpId(epId);
      if (!ep) return { images: [] };

      const referer = `${this.base}/chapter/${ep}`;
      const images = [];
      const seen = new Set();
      let page = 1;
      const maxPages = 200; // 安全上限（防御死循环）
      try {
        while (page <= maxPages) {
          const url = page <= 1 ? referer : `${referer}?page=${page}`;
          const res = await Network.get(url, { Referer: referer });
          const doc = new HtmlDocument(res.body);
          let got = 0;
          try {
            const imgs = doc.querySelectorAll(".comicpage img[data-original], img.lazy[data-original]");
            for (const img of imgs) {
              const raw = String(img.attributes["data-original"] || "");
              const abs = this.absoluteUrl(raw);
              if (!abs || seen.has(abs)) continue;
              if (this.isPlaceholderImage(abs)) continue;
              if (!/\.(jpe?g|png|webp|gif)(?:[?#]|$)/i.test(abs)) continue;
              if (/(?:logo|loading|placeholder|avatar|icon|banner|share|qrcode)/i.test(abs)) continue;
              seen.add(abs);
              images.push(abs);
              got++;
            }
            // 下一页终止：a[title="下一页"][href] 缺失即停止（桌面 id=nextPage / 移动 view-bottom-bar-item 均匹配）
            const next = doc.querySelector('a[title="下一页"][href]');
            if (!next || !next.attributes || !next.attributes.href) break;
            page++;
          } finally {
            doc.dispose();
          }
          if (got === 0) break; // 防御：空页停止
          await this.sleep(200); // 低并发翻页间隔
        }
        return { images };
      } catch (e) {
        console.error(`${this.name} 章节 ${ep} 加载失败：`, e);
        return { images };
      }
    },

    onImageLoad: (url, comicId, epId) => {
      const ep = this.normalizeEpId(epId);
      // 图片无需 Referer（实测无 Referer 亦 200），保留防御性头
      return {
        headers: {
          "User-Agent": this.siteUa,
          Referer: ep ? `${this.base}/chapter/${ep}` : this.base + "/",
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
