// Events for the map on the home page (data/map.json): the main events of every country,
// in the order of its feed, with a picture where the outlets have one.
// Small on purpose: the home page loads it at once, without the country files.
const PER_COUNTRY = 4, LOOK = 10;

// core: assets/core.js (cluster); countries: { CODE: { code, ru, en, loc } }; itemsOf(code) -> items; rateOf: AI marks
export async function buildMap(core, countries, itemsOf, rateOf) {
  const out = {};
  for (const [code, c] of Object.entries(countries)) {
    const groups = core.cluster(await itemsOf(code), c, true, LOOK, rateOf);
    const withPic = g => g.items.find(i => /^https:\/\//.test(i.socialimage || ""));
    // Events with a picture first, but never one far below the top of the feed
    const picked = [...groups.slice(0, LOOK)].sort((a, b) => (!!withPic(b) - !!withPic(a)) || groups.indexOf(a) - groups.indexOf(b)).slice(0, PER_COUNTRY)
      .sort((a, b) => groups.indexOf(a) - groups.indexOf(b));
    out[code] = picked.map(g => {
      const pic = withPic(g);
      return {
        title: g.lead.title, url: g.lead.url, source: g.lead.source || g.lead.domain, domains: g.domains,
        topic: g.topic ? g.topic[0] : null, at: g.newest,
        ...(pic ? { image: pic.socialimage } : {})
      };
    });
  }
  return out;
}
