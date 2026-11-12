/** @type {import('./_venera_.js')} */

/**
 * 神奇漫画 (shenqimanhua.net) — Venera 漫画源
 *
 * 站点 key : shenqimanhua
 * 源类型   : Next.js App Router 全 SSR + RSC 飞行流
 * 图片协议 : 静态 /image/*.webp，无防盗链（无需 Referer），直接返回绝对 URL
 * 已验证接口: explore.load / categoryComics.load / search.load /
 *             comic.loadInfo / comic.loadEp
 * 图片协议   : 静态 /image/*.webp，无防盗链（curl 无 Referer 仍 HTTP 200）
 * 风险点   :
 *   - 章节完整列表不在 SSR DOM（仅前 20 话 + 展开按钮），须从 self.__next_f RSC
 *     飞行流提取；若站点改版去掉 RSC 流，loadInfo 的 chapters 会为空。
 *   - 列表/搜索 maxPage 从分页条最大页码推断，若分页组件改版不渲染末页数字则退化。
 *
 * 验证记录:
 *   - 本地静态核对: 通过（node --check + vm 加载 + DOM 白名单 + 元数据 + 官方强制项）
 *   - 真实 HTML 样本验证（cheerio 模拟 DOM）: 通过
 *       explore 最新 /comics(全部,latest)   : 24 部/页, maxPage=104（站点分页条 104）
 *       categoryComics 都市                 : 24 部/页, maxPage=43（站点分页条 43）
 *       search "的"                         : 24 部/页, maxPage=101（站点分页条 101）
 *       loadInfo 催眠手机                   : 93 话完整（站点最新 第93话, 完整性一致）
 *       loadEp 第93话                        : 168 张图（1..168 连续, 全部绝对 URL）
 *   - 云端 source validate: 待验证
 *   - 实机验证: 待用户导入 Venera
 */

class ShenQiManHua extends ComicSource {
    name = "神奇漫画"

    key = "shenqimanhua"

    version = "1.0.0"

    minAppVersion = "1.6.0"

    url = "https://shenqimanhua.net"

    // ============================================================
    // 基础网络 / 工具
    // ============================================================

    /**
     * 拼接绝对 URL
     */
    _abs(path) {
        if (!path) return "";
        if (path.indexOf("http") === 0) return path;
        return "https://shenqimanhua.net" + path;
    }

    /**
     * 通用请求头（浏览器 UA，避免站点反爬默认 UA）
     */
    _headers() {
        return {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        };
    }

    /**
     * GET 页面，非 200 抛错
     */
    async _getPage(path) {
        const res = await Network.get(this._abs(path), this._headers());
        if (res.status !== 200) {
            throw new Error("HTTP " + res.status + " for " + path);
        }
        return res.body;
    }

    /**
     * 在字符串 s 中，从 start 位置开始找匹配的右括号（考虑字符串/转义），返回位置
     */
    _findMatchingBracket(s, start, open, close) {
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
     * 从原始 HTML 收集所有 self.__next_f.push([1,"..."]) 的 RSC 流字符串并拼接
     * （纯 JS 字符串扫描 + JSON.parse，非 DOM、非正则）
     */
    _collectRsc(html) {
        const parts = [];
        let i = 0;
        while (true) {
            const start = html.indexOf("self.__next_f.push(", i);
            if (start < 0) break;
            const bracket = html.indexOf("[", start);
            if (bracket < 0) break;
            const end = this._findMatchingBracket(html, bracket, "[", "]");
            if (end < 0) break;
            try {
                const arr = JSON.parse(html.slice(bracket, end + 1));
                if (Array.isArray(arr) && arr.length >= 2 && typeof arr[1] === "string") {
                    parts.push(arr[1]);
                }
            } catch (e) { /* ignore */ }
            i = end + 1;
        }
        return parts.join("");
    }

    /**
     * 从 RSC 流提取完整章节数组（[{id,title,number}...]），无则返回 null
     */
    _extractChapters(html) {
        const rsc = this._collectRsc(html);
        if (!rsc) return null;
        const idx = rsc.indexOf('"chapters":[');
        if (idx < 0) return null;
        const start = rsc.indexOf("[", idx);
        if (start < 0) return null;
        const end = this._findMatchingBracket(rsc, start, "[", "]");
        if (end < 0) return null;
        try {
            const arr = JSON.parse(rsc.slice(start, end + 1));
            if (Array.isArray(arr) && arr.length > 0 && arr[0] && typeof arr[0] === "object") {
                if ("id" in arr[0] && "title" in arr[0]) return arr;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    /**
     * 从列表页/搜索页 DOM 解析漫画卡片数组
     */
    _parseComicCards(doc) {
        const cards = doc.querySelectorAll("a[href*='/comic/']");
        const comics = [];
        const seen = {};
        for (const card of cards) {
            const href = card.attributes && card.attributes.href;
            if (!href) continue;
            const id = href.split("/").pop();
            if (!id || seen[id]) continue;
            const titleEl = card.querySelector("div.text-gray-900");
            const imgEl = card.querySelector("img");
            if (!titleEl || !imgEl) continue;
            const title = titleEl.text.trim();
            if (!title) continue;
            const cover = this._abs(imgEl.attributes && imgEl.attributes.src);
            // 标签：卡片内 span.truncate 文本 "校园 | 恋爱 | 复仇"
            let tags = [];
            const tagSpan = card.querySelector("span.truncate");
            if (tagSpan) {
                tags = tagSpan.text.split("|").map(function (s) { return s.trim(); }).filter(function (s) { return s; });
            }
            // 副标题：更新日期（卡片内 span.text-white）
            let subtitle = "";
            const subEl = card.querySelector("span.text-white");
            if (subEl) subtitle = subEl.text.trim();
            seen[id] = true;
            comics.push(new Comic({
                id: id,
                title: title,
                cover: cover,
                subtitle: subtitle,
                tags: tags,
            }));
        }
        return comics;
    }

    /**
     * 从分页条提取最大页码（真实依据：分页条渲染末页数字）
     */
    _extractMaxPage(doc) {
        let max = 1;
        const links = doc.querySelectorAll("a[href*='page=']");
        for (const a of links) {
            const href = a.attributes && a.attributes.href;
            if (!href) continue;
            const idx = href.indexOf("page=");
            if (idx < 0) continue;
            const numStr = href.slice(idx + 5).split("&")[0].split("?")[0];
            const n = parseInt(numStr, 10);
            if (!isNaN(n) && n > max) max = n;
        }
        return max;
    }

    /**
     * 加载漫画列表页（/comics?tag=&sort=&page=）
     */
    async _loadComicList(tag, sort, page) {
        const path = "/comics?tag=" + encodeURIComponent(tag) + "&sort=" + sort + "&page=" + page;
        const html = await this._getPage(path);
        const doc = new HtmlDocument(html);
        try {
            const comics = this._parseComicCards(doc);
            const maxPage = this._extractMaxPage(doc);
            return { comics: comics, maxPage: maxPage };
        } finally {
            doc.dispose();
        }
    }

    // ============================================================
    // explore（首页两个分页标签）
    // ============================================================

    explore = [
        {
            title: "最新",
            type: "multiPageComicList",
            load: async (page) => {
                return this._loadComicList("全部", "latest", page || 1);
            },
        },
        {
            title: "热门",
            type: "multiPageComicList",
            load: async (page) => {
                return this._loadComicList("全部", "total", page || 1);
            },
        },
    ]

    // ============================================================
    // category（分类标签页）
    // ============================================================

    category = {
        title: "分类",
        parts: [
            {
                name: "类型",
                type: "fixed",
                categories: [
                    { label: "全部", target: { page: "category", attributes: { category: "全部", param: null } } },
                    { label: "都市", target: { page: "category", attributes: { category: "都市", param: null } } },
                    { label: "恋爱", target: { page: "category", attributes: { category: "恋爱", param: null } } },
                    { label: "校园", target: { page: "category", attributes: { category: "校园", param: null } } },
                    { label: "奇幻", target: { page: "category", attributes: { category: "奇幻", param: null } } },
                    { label: "幻想", target: { page: "category", attributes: { category: "幻想", param: null } } },
                    { label: "悬疑", target: { page: "category", attributes: { category: "悬疑", param: null } } },
                    { label: "暗黑", target: { page: "category", attributes: { category: "暗黑", param: null } } },
                    { label: "欲望", target: { page: "category", attributes: { category: "欲望", param: null } } },
                    { label: "复仇", target: { page: "category", attributes: { category: "复仇", param: null } } },
                    { label: "热血", target: { page: "category", attributes: { category: "热血", param: null } } },
                    { label: "武侠", target: { page: "category", attributes: { category: "武侠", param: null } } },
                    { label: "治愈", target: { page: "category", attributes: { category: "治愈", param: null } } },
                    { label: "轻松", target: { page: "category", attributes: { category: "轻松", param: null } } },
                    { label: "禁忌", target: { page: "category", attributes: { category: "禁忌", param: null } } },
                    { label: "宫廷", target: { page: "category", attributes: { category: "宫廷", param: null } } },
                    { label: "科幻", target: { page: "category", attributes: { category: "科幻", param: null } } },
                    { label: "穿越", target: { page: "category", attributes: { category: "穿越", param: null } } },
                    { label: "逆袭", target: { page: "category", attributes: { category: "逆袭", param: null } } },
                    { label: "进阶", target: { page: "category", attributes: { category: "进阶", param: null } } },
                ],
            },
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        optionList: [
            {
                label: "排序",
                options: [
                    "latest-最新",
                    "total-热门",
                ],
            },
        ],
        load: async (category, param, options, page) => {
            const sort = (options && options.length && options[0]) || "latest";
            return this._loadComicList(category, sort, page || 1);
        },
    }

    // ============================================================
    // search
    // ============================================================

    search = {
        load: async (keyword, options, page) => {
            const path = "/search?query=" + encodeURIComponent(keyword || "") + "&page=" + (page || 1);
            const html = await this._getPage(path);
            const doc = new HtmlDocument(html);
            try {
                const comics = this._parseComicCards(doc);
                const maxPage = this._extractMaxPage(doc);
                return { comics: comics, maxPage: maxPage };
            } finally {
                doc.dispose();
            }
        },
    }

    // ============================================================
    // comic（详情 / 章节图）
    // ============================================================

    comic = {
        loadInfo: async (id) => {
            const html = await this._getPage("/comic/" + id);
            const doc = new HtmlDocument(html);
            try {
                const titleEl = doc.querySelector("h1[itemprop='name']");
                const title = titleEl ? titleEl.text.trim() : "";

                const coverEl = doc.querySelector("img[alt*='封面高清图']");
                const cover = this._abs(coverEl && coverEl.attributes && coverEl.attributes.src);

                const authorEl = doc.querySelector("a[itemprop='author']");
                const author = authorEl ? authorEl.text.trim() : "";

                const tags = [];
                const genreEls = doc.querySelectorAll("span[itemprop='genre'] a");
                for (const a of genreEls) {
                    const t = a.text.trim();
                    if (t) tags.push(t);
                }

                let description = "";
                const descEl = doc.querySelector("h2[itemprop='description']");
                if (descEl) {
                    const raw = descEl.text;
                    const i = raw.indexOf("简介：");
                    description = (i >= 0 ? raw.slice(i + 3) : raw).trim();
                }

                const chapters = {};
                const chapterArr = this._extractChapters(html);
                if (chapterArr) {
                    for (const c of chapterArr) {
                        if (c && c.id && c.title) chapters[c.id] = c.title;
                    }
                }

                const tagsMap = {};
                if (author) tagsMap["作者"] = [author];
                if (tags.length) tagsMap["分类"] = tags;

                return new ComicDetails({
                    title: title,
                    subtitle: author,
                    cover: cover,
                    description: description,
                    tags: tagsMap,
                    chapters: chapters,
                    url: this._abs("/comic/" + id),
                });
            } finally {
                doc.dispose();
            }
        },

        loadEp: async (comicId, epId) => {
            const html = await this._getPage("/read/" + comicId + "/" + epId);
            const doc = new HtmlDocument(html);
            try {
                const imgs = doc.querySelectorAll("img[src*='comicsRes']");
                const images = [];
                const seen = {};
                for (const img of imgs) {
                    const src = img.attributes && img.attributes.src;
                    if (!src) continue;
                    const abs = this._abs(src);
                    if (seen[abs]) continue;
                    seen[abs] = true;
                    images.push(abs);
                }
                return { images: images };
            } finally {
                doc.dispose();
            }
        },

        link: {
            domains: ["shenqimanhua.net"],
            linkToId: (url) => {
                if (!url) return null;
                const idx = url.indexOf("/comic/");
                if (idx >= 0) {
                    const rest = url.slice(idx + 7);
                    const id = rest.split("/")[0].split("?")[0];
                    return id || null;
                }
                const ridx = url.indexOf("/read/");
                if (ridx >= 0) {
                    const rest = url.slice(ridx + 6);
                    const id = rest.split("/")[0];
                    return id || null;
                }
                return null;
            },
        },
    }
}
