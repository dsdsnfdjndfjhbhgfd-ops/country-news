const C = [
 ["Morocco World News","https://www.moroccoworldnews.com/feed"],["Hespress EN","https://en.hespress.com/feed"],["Hespress FR","https://fr.hespress.com/feed"],["Le360 EN","https://en.le360.ma/rss"],["Yabiladi EN","https://en.yabiladi.com/rss.xml"],["Barlamane","https://www.barlamane.com/feed/"],["MAP Express","https://mapexpress.ma/feed/"],["Morocco Mirror","https://moroccomirror.com/feed/"],["North Africa Post","https://northafricapost.com/feed"],["The Africa Report","https://www.theafricareport.com/feed/"],["Atalayar","https://www.atalayar.com/en/rss"],
 ["Arab News","https://www.arabnews.com/rss.xml"],["Saudi Gazette","https://saudigazette.com.sa/rssFeed/133"],["Al Arabiya EN","https://english.alarabiya.net/tools/rss"],["Asharq Al-Awsat EN","https://english.aawsat.com/feed"],["Zawya","https://www.zawya.com/en/rss/"],["Gulf News","https://gulfnews.com/rss"],["The National","https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml"],["Al-Monitor","https://www.al-monitor.com/rss"],["Arab News Saudi","https://www.arabnews.com/saudiarabia/rss.xml"],["Saudi Press Agency","https://www.spa.gov.sa/rss"],["Riyadh Daily","https://www.alriyadhdaily.com/feed"],
 ["Rio Times","https://www.riotimesonline.com/feed/"],["Agência Brasil EN","https://agenciabrasil.ebc.com.br/en/rss/ultimasnoticias/feed.xml"],["Brazil Reports","https://brazilreports.com/feed/"],["MercoPress","https://en.mercopress.com/rss"],["Brasil de Fato EN","https://www.brasildefato.com.br/rss"],["Americas Quarterly","https://www.americasquarterly.org/feed/"],["Buenos Aires Times","https://www.batimes.com.ar/feed"],["Latin America Reports","https://latinamericareports.com/feed/"],["Folha EN","https://www1.folha.uol.com.br/internacional/en/rss.xml"],["BNamericas","https://www.bnamericas.com/en/rss"],["Brazil Journal","https://braziljournal.com/feed/"],["Reuters LatAm skip","https://example.invalid/"],["The Rio Times alt","https://www.riotimesonline.com/brazil-news/feed/"],
 ["Al Jazeera ES","https://www.aljazeera.com/xml/rss/all.xml"]
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
