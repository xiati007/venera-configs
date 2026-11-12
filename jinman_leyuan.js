/**
 * 禁漫乐园（jmly7.com）Venera 漫画源
 *
 * 真实取证结论（2026-10-15，全部来自实际网页/接口样本）：
 * 1. 站点为 Maccms 架构、服务端渲染 HTML（非 SPA）。
 * 2. 卡片结构：.a-con-inner；带 .pic 者为漫画卡，无 .pic 者（<span><a>）为章节项。
 *    漫画卡：.pic a（封面/详情链接）、.pic img.lazyload[data-src]（封面图）、
 *    .s1 a（标题）、.s2 a（最新章节）、.s4（状态：连载中/已完结）。
 * 3. 首页分区：.a-tit（标题，h1）→ 紧随其后的 .a-con（卡片区），共 5 组对齐：
 *    最近更新 / 漫画排行 / 新漫上架 / 站长推荐 / 完结漫画。
 * 4. 详情路由：/manga-read/{comicId}.html；章节 /manga-read/{comicId}/{章节token}.
 *    章节 token 为 18 位字母数字（如 VoiqQIVFKJbcElXwhjor）。
 * 5. 分类：/book-catalogs/{类型}/ob/{排序}/st/{状态}，第 2 页起追加 /page/{n}；
 *    分页链接形如 .../page/60（尾页真实页码）。类型：all/韩漫/日漫/3D漫画/真人美女/短篇漫画/同性；
 *    排序：time/hits；状态：all/completed/serialized。每页 24 卡。
 * 6. 搜索：表单 action=/cata.php?key= 会跳转至 /search-books/{关键词}，
 *    翻页 /search-books/{关键词}/page/{n}。
 * 7. 排行：/book-rank，单页（50 卡）；结构 li > .rank-con-l(序号) / .rank-con-m(.pic+.info) /
 *    .rank-con-r(人气)。封面 .pic img[data-src]，标题 .info p a，状态 .info span。
 * 8. 阅读页：图片为 img[data-index][data-src] 明文直链 JPEG（img.nnpic.xyz），无加密，不执行解密；
 *    封面域名 new.niaopic.com / thumb.niaopic.com。
 * 9. 页面内联广告/反爬脚本（含 eval、new Function）一律不执行。
 */
class JinManLeYuan extends ComicSource {
    name = "禁漫乐园"
    key = "jinman_leyuan"
    version = "1.0.0"
    minAppVersion = "1.0.0"
    url = "https://jmly7.com"

    baseUrl = "https://jmly7.com"

    defaultHeaders = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Referer": "https://jmly7.com/"
    };

    // ---- 筛选白名单（每一项都有上文取证的真实 URL）----
    cateTypes = ["all", "韩漫", "日漫", "3D漫画", "真人美女", "短篇漫画", "同性"];
    statusValues = ["all", "completed", "serialized"];
    orderValues = ["time", "hits"];

    // ============================ 通用工具 ============================

    absoluteUrl(path) {
        if (!path) return "";
        if (/^https?:\/\//i.test(path)) return path;
        if (path.startsWith("//")) return "https:" + path;
        if (path.startsWith("/")) return this.baseUrl + path;
        return this.baseUrl + "/" + path;
    }

    comicIdFromHref(href) {
        if (!href) return "";
        const match = href.match(/\/manga-read\/(\d+)\.html/);
        return match ? match[1] : "";
    }

    chapterTokenFromHref(href) {
        if (!href) return "";
        const match = href.match(/\/manga-read\/\d+\/([A-Za-z0-9]+)\.html/);
        return match ? match[1] : "";
    }

    parseMaxPage(doc, fallback = 1) {
        let maxPage = fallback;
        const links = doc.querySelectorAll("a");
        for (const link of links) {
            const href = String(link.attributes.href || "");
            const match = href.match(/\/page\/(\d+)/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxPage) maxPage = num;
            }
        }
        return maxPage;
    }

    optValue(option, fallback, allowed) {
        let raw = "";
        if (Array.isArray(option)) {
            raw = option.length > 0 ? option[0] : "";
        } else if (option != null) {
            raw = option;
        }
        const value = String(raw).split("-")[0].trim();
        return allowed.indexOf(value) >= 0 ? value : fallback;
    }

    parseCategoryParam(param) {
        const s = param == null ? "" : String(param);
        const idx = s.indexOf("|");
        if (idx <= 0 || idx === s.length - 1) return null;
        return { section: s.slice(0, idx), value: s.slice(idx + 1) };
    }

    isAllowedParam(section, value) {
        if (section === "update") return value === "latest";
        if (section === "rank") return value === "all";
        if (section === "cate") return this.cateTypes.indexOf(value) >= 0;
        return false;
    }

    cleanSearchKeyword(keyword) {
        let s = keyword == null ? "" : String(keyword);
        s = s.replace(/\s+/g, "");
        return s.trim();
    }

    // ============================ 列表 / 卡片解析 ============================

    parseCard(item) {
        const thumb = item.querySelector(".pic");
        const titleEl = item.querySelector(".s1 a") || item.querySelector(".pic a");
        if (!thumb || !titleEl) return null;

        const href = thumb.querySelector("a")?.attributes.href || "";
        const id = this.comicIdFromHref(href);
        if (!id) return null;

        const coverImg = thumb.querySelector("img");
        const cover = this.absoluteUrl(
            coverImg?.attributes["data-src"] || coverImg?.attributes.src || ""
        );
        const title = (titleEl.text || titleEl.attributes.title || "").trim();
        const subEl = item.querySelector(".s2 a");
        const subTitle = subEl?.text?.trim() || "";
        const statusEl = item.querySelector(".s4");
        const status = statusEl?.text?.trim() || "";

        return new Comic({ id, title, cover, subTitle, status });
    }

    parseList(doc) {
        const comics = [];
        const items = doc.querySelectorAll(".a-con-inner");
        for (const item of items) {
            const comic = this.parseCard(item);
            if (comic) comics.push(comic);
        }
        return comics;
    }

    parseRank(doc) {
        const comics = [];
        const lis = doc.querySelectorAll("li");
        for (const li of lis) {
            const picA = li.querySelector(".pic a");
            const href = picA?.attributes.href || "";
            const id = this.comicIdFromHref(href);
            if (!id) continue;
            const coverImg = li.querySelector(".pic img");
            const cover = this.absoluteUrl(
                coverImg?.attributes["data-src"] || coverImg?.attributes.src || ""
            );
            const titleEl = li.querySelector(".info p a") || picA;
            const title = (titleEl?.text || picA?.attributes.title || "").trim();
            const statusEl = li.querySelector(".info span");
            const status = statusEl?.text?.trim() || "";
            comics.push(new Comic({ id, title, cover, status }));
        }
        return comics;
    }

    async loadList(url, maxPageMode = "parse") {
        const res = await Network.get(url, this.defaultHeaders);
        if (res.status !== 200) throw `Invalid status: ${res.status}`;
        const doc = new HtmlDocument(res.body);
        try {
            const comics = this.parseList(doc);
            const maxPage = maxPageMode === "parse" ? this.parseMaxPage(doc, 1) : 1;
            return { comics, maxPage };
        } finally {
            doc.dispose();
        }
    }

    // ============================ 分类入口 ============================

    category = {
        title: this.name,
        parts: [
            {
                name: "更新",
                type: "fixed",
                categories: ["最近更新"],
                itemType: "category",
                categoryParams: ["update|latest"]
            },
            {
                name: "排行",
                type: "fixed",
                categories: ["漫画排行"],
                itemType: "category",
                categoryParams: ["rank|all"]
            },
            {
                name: "分类",
                type: "fixed",
                categories: ["全部", "韩漫", "日漫", "3D漫画", "真人美女", "短篇漫画", "同性"],
                itemType: "category",
                categoryParams: [
                    "cate|all", "cate|韩漫", "cate|日漫", "cate|3D漫画",
                    "cate|真人美女", "cate|短篇漫画", "cate|同性"
                ]
            }
        ],
        enableRankingPage: false
    };

    categoryComics = {
        optionList: [
            { label: "进度", options: ["all-全部", "completed-已完结", "serialized-更新中"] },
            { label: "排序", options: ["time-按时间", "hits-按人气"] }
        ],
        load: async (category, param, options, page) => {
            const safePage = Math.max(1, Number(page) || 1);
            const parsed = this.parseCategoryParam(param);
            if (!parsed || !this.isAllowedParam(parsed.section, parsed.value)) {
                return { comics: [], maxPage: safePage };
            }
            try {
                if (parsed.section === "update") {
                    // 最近更新：/new-books（实测单页，无 /page 分页）
                    return await this.loadList(this.baseUrl + "/new-books", "single");
                }
                if (parsed.section === "rank") {
                    const res = await Network.get(this.baseUrl + "/book-rank", this.defaultHeaders);
                    if (res.status !== 200) throw `Invalid status: ${res.status}`;
                    const doc = new HtmlDocument(res.body);
                    try {
                        return { comics: this.parseRank(doc), maxPage: 1 };
                    } finally {
                        doc.dispose();
                    }
                }
                // 分类：/book-catalogs/{类型}/ob/{排序}/st/{状态}，第 2 页起追加 /page/{n}
                const status = this.optValue(options?.[0], "all", this.statusValues);
                const order = this.optValue(options?.[1], "time", this.orderValues);
                const pageSuffix = safePage > 1 ? "/page/" + safePage : "";
                const url = this.baseUrl + "/book-catalogs/" + encodeURIComponent(parsed.value)
                    + "/ob/" + order + "/st/" + status + pageSuffix;
                return await this.loadList(url, "parse");
            } catch (e) {
                console.error(`禁漫乐园分类「${category}」加载失败：`, e);
                return { comics: [], maxPage: safePage };
            }
        }
    };

    // ============================ 首页 ============================

    explore = [
        {
            title: "禁漫乐园",
            type: "singlePageWithMultiPart",
            load: async () => {
                let doc = null;
                try {
                    const res = await Network.get(this.baseUrl + "/", this.defaultHeaders);
                    if (res.status !== 200) throw `Invalid status: ${res.status}`;
                    doc = new HtmlDocument(res.body);

                    const result = {};
                    const aTits = doc.querySelectorAll(".a-tit");
                    const aCons = doc.querySelectorAll(".a-con");
                    const n = Math.min(aTits.length, aCons.length);

                    for (let i = 0; i < n; i++) {
                        let title = aTits[i].querySelector("h1")?.text
                            || aTits[i].text || "";
                        title = title.replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, "").trim();
                        const comics = this.parseList(aCons[i]);
                        if (comics.length > 0) {
                            result[title || ("板块" + (i + 1))] = comics;
                        }
                    }
                    return result;
                } finally {
                    doc?.dispose();
                }
            }
        }
    ];

    // ============================ 搜索 ============================

    search = {
        optionList: [
            { label: "进度", options: ["all-全部", "completed-已完结", "serialized-更新中"] },
            { label: "排序", options: ["time-按时间", "hits-按人气"] }
        ],
        load: async (keyword, options, page) => {
            const safePage = Math.max(1, Number(page) || 1);
            const kw = this.cleanSearchKeyword(keyword);
            if (!kw) return { comics: [], maxPage: 1 };
            try {
                const url = this.baseUrl + "/search-books/"
                    + encodeURIComponent(kw) + "/page/" + safePage;
                return await this.loadList(url, "parse");
            } catch (e) {
                console.error(`禁漫乐园搜索「${keyword}」加载失败：`, e);
                return { comics: [], maxPage: safePage };
            }
        }
    };

    // ============================ 详情与章节 ============================

    comic = {
        // 主入口：loadInfo(id|url)。
        // 用户当前 Venera 版本在 _parseLoadComicFunc 中调用 loadInfo，
        // 且把返回值交给 ComicDetails.fromJson(obj) 解析，
        // 因此这里必须返回「普通 JS 对象」（而非 new ComicDetails 实例），
        // 否则 fromJson 读不到 chapters 字段会抛 Null is not a subtype of Map。
        loadInfo: async (urlOrId) => {
            let doc = null;
            try {
                const id = (() => {
                    if (!urlOrId) return "";
                    const s = String(urlOrId);
                    const m = s.match(/\/manga-read\/(\d+)\.html/);
                    return m ? m[1] : s.replace(/[^\d]/g, "");
                })();
                const url = this.absoluteUrl("/manga-read/" + id + ".html");
                const res = await Network.get(url, this.defaultHeaders);
                if (res.status !== 200) throw `Invalid status: ${res.status}`;
                const raw = res.body || "";
                doc = new HtmlDocument(raw);

                // 标题 / 封面：详情页 .info .pic img 的 alt 即标题，data-src 即封面
                const coverImg = doc.querySelector(".info .pic img")
                    || doc.querySelector(".cover")
                    || doc.querySelector(".pic img");
                const title = (coverImg?.attributes.alt || "").trim() || "未知漫画";
                const cover = this.absoluteUrl(
                    coverImg?.attributes["data-src"] || coverImg?.attributes.src || ""
                );

                // 作者：.name 块内「作者：」之后文本（含子元素 <a>）
                let author = "";
                const nameEl = doc.querySelector(".name");
                if (nameEl) {
                    author = nameEl.text.replace(/^作者[：:]\s*/, "").replace(/<[^>]+>/g, "").trim();
                }
                if (!author) {
                    const am = raw.match(/作者[：:]\s*(.*?)<\/span>/s);
                    if (am) author = am[1].replace(/<[^>]+>/g, "").replace(/^[\s：:]+/, "").trim();
                }

                // 简介：<meta name="description"> 中「剧情介绍：」之后
                let description = "";
                const metaDesc = doc.querySelector('meta[name="description"]');
                if (metaDesc && metaDesc.attributes.content) {
                    description = metaDesc.attributes.content
                        .replace(/^《[^》]*》在线阅读[，,]?剧情介绍[：: ]?/, "")
                        .trim();
                }

                // 状态：全文匹配 连载中 / 已完结 / 完结
                let status = "";
                const sm = raw.match(/(连载中|已完结|完结)/);
                if (sm) status = sm[1];

                // 章节列表：当前漫画的 /manga-read/{id}/{token}.html（排除顶部「开始阅读」按钮）
                const chapters = {};
                const chapterLinks = doc.querySelectorAll('a[href*="/manga-read/' + id + '/"]');
                for (const link of chapterLinks) {
                    const href = link.attributes.href || "";
                    const token = this.chapterTokenFromHref(href);
                    if (!token) continue;
                    const lt = link.attributes.title || "";
                    const chText = (link.text || "").trim();
                    if (lt.indexOf("开始阅读") >= 0 || chText.indexOf("开始阅读") >= 0) continue;
                    const chTitle = chText || lt.replace(/^[^_-]*[-_]/, "") || lt;
                    chapters[id + "|" + token] = chTitle;
                }

                // 返回普通对象（非 new ComicDetails 实例），供框架 ComicDetails.fromJson 解析
                return {
                    title,
                    cover,
                    author,
                    description: description || "",
                    status,
                    tags: {
                        "作者": author ? [author] : [],
                        "状态": status ? [status] : []
                    },
                    chapters
                };
            } finally {
                doc?.dispose();
            }
        },

        // 兼容别名：部分框架调用 comic.load(url)，委托给主入口 loadInfo
        load: async (urlOrId) => {
            return await this.comic.loadInfo(urlOrId);
        },

        loadEp: async (comicId, epId) => {
            let doc = null;
            try {
                const epStr = epId == null ? "" : String(epId);
                let token = "";

                const comboMatch = epStr.match(/^(\d+)\|([A-Za-z0-9]+)$/);
                if (comboMatch) {
                    token = comboMatch[2];
                } else {
                    const urlMatch = epStr.match(/\/manga-read\/\d+\/([A-Za-z0-9]+)/);
                    if (urlMatch) token = urlMatch[1];
                    else token = epStr;
                }

                if (!token || !/^[A-Za-z0-9]+$/.test(token)) {
                    return { images: [] };
                }

                const url = this.absoluteUrl("/manga-read/" + comicId + "/" + token + ".html");
                const res = await Network.get(url, this.defaultHeaders);
                if (res.status !== 200) throw `Invalid status: ${res.status}`;
                doc = new HtmlDocument(res.body);

                // 图片为 img[data-index][data-src] 明文直链（img.nnpic.xyz），无加密
                const images = [];
                const imgEls = doc.querySelectorAll("img[data-index]");
                for (const imgEl of imgEls) {
                    const src = imgEl.attributes["data-src"] || imgEl.attributes.src;
                    if (src && /^https?:\/\//i.test(src)) {
                        images.push(src);
                    }
                }
                return { images: [...new Set(images)] };
            } catch (e) {
                console.error(`禁漫乐园章节加载失败：`, e);
                return { images: [] };
            } finally {
                doc?.dispose();
            }
        },

        onImageLoad: (url, comicId, epId) => {
            return {
                headers: {
                    "Referer": this.baseUrl + "/",
                    "User-Agent": this.defaultHeaders["User-Agent"]
                }
            };
        },

        onThumbnailLoad: (url) => {
            return {
                headers: {
                    "Referer": this.baseUrl + "/",
                    "User-Agent": this.defaultHeaders["User-Agent"]
                }
            };
        }
    };
}
