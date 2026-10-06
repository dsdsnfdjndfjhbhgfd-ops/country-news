// Shared news logic: used by the page (index.html) and by the collector (scripts/prefetch.mjs).
// Groups headlines about the same event, picks serious topics and ranks events.
function low(s) { return (s || "").toLowerCase().replace(/ё/g, "е").trim(); }
function seenTime(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(s || ""); if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

// ---------- Importance filter ----------
const TOPICS = [
  ["Безопасность", "--t-security", ["войн","воен","армия","армии","удар","атак","ракет","дрон","беспилот","обстрел","фронт","террор","взрыв","нато","оборон","мобилиз","перемир","конфликт","ядерн","war","militar","army","strike","attack","missile","drone","troops","terror","explos","nato","defen","ceasefire","conflict","shell","invasion","nuclear"]],
  ["Политика", "--t-politics", ["президент","премьер","правительств","министр","парламент","дума","выбор","голосован","партия","партии","закон","указ","отставк","оппозиц","протест","митинг","конституц","суд","референдум","переворот","president","prime minister","government","minister","parliament","election","vote","party","law","decree","resign","opposition","protest","constitution","court","referendum","cabinet","coup"]],
  ["Экономика", "--t-economy", ["экономик","ввп","инфляц","ставк","цб","центробанк","бюджет","налог","рубл","доллар","нефт","газ","экспорт","импорт","пошлин","тариф","санкц","кризис","рынок","биржа","инвест","зарплат","пенси","цены","долг","торгов","economy","economic","gdp","inflation","rate","central bank","budget","tax","oil","gas","export","import","tariff","sanction","crisis","market","invest","price","debt","trade"]],
];
// Diplomacy counts as politics
TOPICS[1][2].push("переговор","визит","саммит","посол","мид","дипломат","соглашен","договор","оон","евросоюз","ес","talks","visit","summit","ambassador","foreign minister","diplomat","agreement","treaty","united nations","un","european union","eu","bilateral","negotiat");
const SOFT = ["футбол","хоккей","матч","чемпионат","турнир","олимпи","спорт","сборн","гол","тренер","звезд","певиц","певец","актер","актрис","фильм","сериал","шоу","концерт","свадьб","развод","гороскоп","рецепт","погода","синоптик","мода","блогер","фестивал","премия","теннис","баскетбол","медал","атлет","бокс","шахмат","марафон","кубок","лига","игры","игрок","football","soccer","hockey","match","championship","tournament","olymp","sport","coach","celebrity","singer","actor","actress","movie","film","series","show","concert","wedding","divorce","horoscope","recipe","weather","fashion","festival","award","box office","tennis","basketball","f1","formula","games","medal","climbing","athlet","boxing","ufc","chess","marathon","cup","league","player"];
const STOP = new Set("about after again also amid and are been before being between could from have into more news over says said than that their them there they this those through under were what when where which while will with would year years week today после перед также более может могут были было будет будут которые который которая через почему чтобы этого этой этом если между около заявил заявила стало сообщил сообщили сегодня неделе году года".split(" "));

function norm(title) { return " " + (low(title).match(/[a-zа-я0-9%]+/g) || []).join(" ") + " "; }
function stems(title, countryStems) {
  const out = new Set();
  for (const w of low(title).match(/[a-zа-я0-9]+/g) || []) {
    if (w.length < 4 || STOP.has(w)) continue;
    const s = w.slice(0, 6);
    if (countryStems.some(c => s.startsWith(c) || c.startsWith(s))) continue;
    out.add(s);
  }
  return out;
}
function topicOf(title) {
  const t = norm(title); let best = null, hits = 0;
  for (const tp of TOPICS) {
    const n = tp[2].reduce((k, w) => k + (t.includes(" " + w) ? 1 : 0), 0);
    if (n > hits) { hits = n; best = tp; }
  }
  return best;
}
function isSoft(title) { const t = norm(title); return SOFT.some(w => t.includes(" " + w)); }

function cluster(items, c, singles) {
  const countryStems = [low(c.ru), low(c.en), low(c.loc || "")].flatMap(n => n.split(/\s+/)).filter(w => w.length >= 4).map(w => w.slice(0, 5));
  const groups = [];
  for (const a of items) {
    const st = stems(a.title, countryStems);
    if (st.size < 2) continue;
    let home = null, bestScore = 0;
    for (const g of groups) {
      if (g.lang !== a.language) continue;
      let shared = 0; for (const s of st) if (g.stems.has(s)) shared++;
      const j = shared / Math.min(st.size, g.core.size);
      if ((shared >= 3 || (shared >= 2 && j >= 0.5)) && j > bestScore) { bestScore = j; home = g; }
    }
    if (home) { home.items.push(a); for (const s of st) home.stems.add(s); }
    else groups.push({ lang: a.language, core: st, stems: new Set(st), items: [a] });
  }
  for (const g of groups) {
    g.domains = new Set(g.items.map(i => i.source || i.domain)).size;
    g.lead = g.items[0];
    g.topic = g.items.map(i => topicOf(i.title)).find(Boolean) || null;
    g.soft = g.items.some(i => isSoft(i.title));
    g.newest = Math.max(...g.items.map(i => i.t || seenTime(i.seendate) || 0));
    const ageH = (Date.now() - g.newest) / 3600000;
    g.fresh = ageH < 3;
    // Coverage matters most, but fresh events rise so the feed keeps moving
    g.score = g.domains * 2 + (g.topic ? 3 : 0) + (ageH < 3 ? 4 : ageH < 12 ? 2 : 0);
  }
  const ranked = groups.filter(g => !g.soft && g.topic)
    .sort((x, y) => y.score - x.score || y.items.length - x.items.length);
  const multi = ranked.filter(g => g.domains >= 2);
  // Single-outlet stories always go after the ones several outlets cover
  if (singles) return multi.concat(ranked.filter(g => g.domains < 2)).slice(0, 25);
  return (multi.length >= 8 ? multi : multi.concat(ranked.filter(g => g.domains < 2).slice(0, 8 - multi.length))).slice(0, 25);
}
