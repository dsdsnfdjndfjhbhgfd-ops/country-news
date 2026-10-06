const C = [
 ["Взгляд","https://vz.ru/rss.xml"],["Российская газета","https://rg.ru/xml/index.xml"],["МК","https://www.mk.ru/rss/index.xml"],["Парламентская газета","https://pnp.ru/rss/index.xml"],["Новые Известия","https://newizv.ru/rss"],["Эксперт","https://expert.ru/rss/"],
 ["Kazinform EN","https://www.inform.kz/rss/eng.xml"],["Zakon.kz","https://www.zakon.kz/rss.xml"],["Sputnik Беларусь","https://sputnik.by/export/rss2/archive/index.xml"],
 ["Ukrinform","https://www.ukrinform.net/rss/block-lastnews"],["UNIAN","https://rss.unian.net/site/news_rus.rss"],["Ukrainska Pravda EN","https://www.pravda.com.ua/eng/rss/"],["Euromaidan Press","https://euromaidanpress.com/feed/"],
 ["NDTV","https://feeds.feedburner.com/ndtvnews-top-stories"],["Indian Express","https://indianexpress.com/section/india/feed/"],["Firstpost","https://www.firstpost.com/commonfeeds/v1/mfp/rss/india.xml"],["Hindustan Times","https://www.hindustantimes.com/feeds/rss/world-news/rssfeed.xml"],["The Hindu World","https://www.thehindu.com/news/international/feeder/default.rss"],
 ["Japan Today","https://japantoday.com/feed"],["Asahi","https://www.asahi.com/ajw/rss/news.xml"],["Mainichi","https://mainichi.jp/english/rss/etc/english_latest.rss"],
 ["Anadolu","https://www.aa.com.tr/en/rss/default?cat=world"],["TRT World","https://www.trtworld.com/rss"],["Turkish Minute","https://www.turkishminute.com/feed/"],
 ["Jerusalem Post","https://www.jpost.com/rss/rssfeedsfrontpage.aspx"],["Haaretz","https://www.haaretz.com/srv/haaretz-latest-headlines"],["i24 News","https://www.i24news.tv/en/rss"],["Middle East Eye","https://www.middleeasteye.net/rss"],
 ["IRNA","https://en.irna.ir/rss"],["Press TV","https://www.presstv.ir/rss.xml"],
 ["China Daily","https://www.chinadaily.com.cn/rss/world_rss.xml"],["Global Times","https://www.globaltimes.cn/rss/outbrain.xml"],["Xinhua","http://www.xinhuanet.com/english/rss/worldrss.xml"],["CGTN","https://www.cgtn.com/subscribe/rss/section/world.xml"],
 ["RFI EN","https://www.rfi.fr/en/rss"],["Tagesschau","https://www.tagesschau.de/index~rss2.xml"],["The Local DE","https://feeds.thelocal.com/rss/de"],["Spiegel Intl","https://www.spiegel.de/international/index.rss"],["Der Standard","https://www.derstandard.at/rss"],
 ["The Telegraph","https://www.telegraph.co.uk/rss.xml"],["Financial Times","https://www.ft.com/world?format=rss"],["Reuters via Google? skip","https://example.invalid/"],["The Economist","https://www.economist.com/international/rss.xml"],["Time","https://time.com/feed/"],["Axios","https://api.axios.com/feed/"],["Politico US","https://rss.politico.com/politics-news.xml"],["The Hill","https://thehill.com/feed/"],["Newsweek","https://www.newsweek.com/rss"],
 ["Notes from Poland","https://notesfrompoland.com/feed/"],["Polish News Bulletin","https://www.polandin.com/rss"],["Poland In","https://www.polandin.com/feed"],["Visegrad Insight","https://visegradinsight.eu/feed/"],
 ["Kommersant","https://www.kommersant.ru/RSS/news.xml"]
];
const now = Date.now();
await Promise.all(C.map(async ([n,u]) => {
  try {
    const r = await fetch(u,{signal:AbortSignal.timeout(25000),headers:{"User-Agent":"Mozilla/5.0 (compatible; country-news/1.0)","Accept":"application/rss+xml, application/xml, text/xml, */*"}});
    const x = await r.text();
    const its = [...x.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)].map(m=>m[2]);
    const ds = its.map(b=>{const m=b.match(/<(pubDate|dc:date|updated|published|lastmod)[^>]*>\s*(?:<!\[CDATA\[)?([^<\]]*)/);return m?new Date(m[2].trim()).getTime():NaN}).filter(t=>!isNaN(t));
    const fresh = ds.filter(t=>now-t<48*3600e3).length;
    const hasDesc = its.filter(b=>/<(description|summary)/.test(b)).length;
    console.log(`RES|${n}|${r.status}|${its.length}|${fresh}|${hasDesc}|${u}`);
  } catch(e){ console.log(`RES|${n}|ERR ${e.message}|0|0|0|${u}`); }
}));
