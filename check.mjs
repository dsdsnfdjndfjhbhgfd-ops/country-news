const C = [
 ["Лента.ру","https://lenta.ru/rss/news"],["Известия","https://iz.ru/xml/rss/all.xml"],["Газета.ру","https://www.gazeta.ru/export/rss/first.xml"],
 ["Meduza","https://meduza.io/rss/all"],["Euronews RU","https://ru.euronews.com/rss"],["RTVI","https://rtvi.com/feed/"],["Фонтанка","https://www.fontanka.ru/rss-feeds/rss.xml"],
 ["Новая газета Европа","https://novayagazeta.eu/feed/rss"],["Зеркало (BY)","https://news.zerkalo.io/rss/all.rss"],["БелТА","https://www.belta.by/rss"],["Белсат","https://ru.belsat.eu/feed/"],
 ["Tengrinews","https://tengrinews.kz/news.rss"],["Kursiv","https://kz.kursiv.media/feed/"],["Astana Times","https://astanatimes.com/feed/"],["Kazinform","https://www.inform.kz/rss/rus.xml"],
 ["Times of India","https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms"],["The Hindu","https://www.thehindu.com/news/national/feeder/default.rss"],["Hindustan Times","https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml"],
 ["Japan Times","https://www.japantimes.co.jp/feed/"],["NHK World","https://www3.nhk.or.jp/nhkworld/en/news/feeds/"],["Kyodo","https://english.kyodonews.net/rss/news.xml"],["Nikkei Asia","https://asia.nikkei.com/rss/feed/nar"],
 ["Notes from Poland","https://notesfrompoland.com/feed/"],["TVP World","https://tvpworld.com/rss"],["Polskie Radio EN","https://www.polskieradio.pl/395/7784/rss"],
 ["Times of Israel","https://www.timesofisrael.com/feed/"],["Kyiv Independent","https://kyivindependent.com/news-archive/rss/"],["Hürriyet Daily News","https://www.hurriyetdailynews.com/rss"],["Daily Sabah","https://www.dailysabah.com/rss"],
 ["NPR","https://feeds.npr.org/1004/rss.xml"],["Sky News","https://feeds.skynews.com/feeds/rss/world.xml"],["CNN","http://rss.cnn.com/rss/edition_world.rss"],["Euronews","https://www.euronews.com/rss"],
 ["The Diplomat","https://thediplomat.com/feed/"],["Foreign Policy","https://foreignpolicy.com/feed/"],["Washington Post","https://feeds.washingtonpost.com/rss/world"],["ABC News","https://abcnews.go.com/abcnews/internationalheadlines"],
 ["SCMP","https://www.scmp.com/rss/91/feed"],["Tehran Times","https://www.tehrantimes.com/rss"],["Iran International","https://www.iranintl.com/en/feed"],["Le Monde EN","https://www.lemonde.fr/en/rss/une.xml"],["Spiegel International","https://www.spiegel.de/international/index.rss"],
 ["Independent","https://www.independent.co.uk/news/world/rss"],["Fox News","https://moxie.foxnews.com/google-publisher/world.xml"],["CBS News","https://www.cbsnews.com/latest/rss/world"],["Bloomberg Politics","https://feeds.bloomberg.com/politics/news.rss"],
 ["MarketWatch","https://feeds.content.dowjones.io/public/rss/mw_topstories"],["Moscow Times","https://www.themoscowtimes.com/rss/news"],["Kommersant KZ","https://www.kommersant.ru/RSS/regions/kz.xml"]
];
const now = Date.now();
await Promise.all(C.map(async ([n,u]) => {
  try {
    const r = await fetch(u,{signal:AbortSignal.timeout(25000),headers:{"User-Agent":"Mozilla/5.0 (compatible; country-news/1.0)","Accept":"application/rss+xml, application/xml, text/xml, */*"}});
    const x = await r.text();
    const its = [...x.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)].map(m=>m[2]);
    const ds = its.map(b=>{const m=b.match(/<(pubDate|dc:date|updated|published)[^>]*>([^<]*)</);return m?new Date(m[2].replace(/<!\[CDATA\[|\]\]>/g,"")).getTime():NaN}).filter(t=>!isNaN(t));
    const fresh = ds.filter(t=>now-t<48*3600e3).length;
    const hasDesc = its.filter(b=>/<(description|summary)/.test(b)).length;
    console.log(`RES|${n}|${r.status}|${its.length}|${fresh}|${hasDesc}|${u}`);
  } catch(e){ console.log(`RES|${n}|ERR ${e.message}|0|0|0|${u}`); }
}));
