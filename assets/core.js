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

function cluster(items, c, singles, limit = 25) {
  const countryStems = [low(c.ru), low(c.en), low(c.loc || "")].flatMap(n => n.split(/\s+/)).filter(w => w.length >= 4).map(w => w.slice(0, 5));
  // Words found in many headlines of this country ("Путин", "заявил", "развитие") say nothing
  // about which event a headline is about, so they are not used for grouping
  const all = items.map(a => stems(a.title, countryStems));
  const df = new Map();
  for (const st of all) for (const w of st) df.set(w, (df.get(w) || 0) + 1);
  const common = Math.max(6, items.length * 0.025);
  const groups = [];
  items.forEach((a, n) => {
    const st = new Set([...all[n]].filter(w => df.get(w) <= common));
    if (st.size < 2) return;
    let home = null, bestScore = 0;
    for (const g of groups) {
      if (g.lang !== a.language) continue;
      // Compare with the headline the group started from, so a group cannot drift to other topics
      let shared = 0; for (const s of st) if (g.core.has(s)) shared++;
      const j = shared / Math.min(st.size, g.core.size);
      if ((shared >= 3 || (shared >= 2 && j >= 0.5)) && j > bestScore) { bestScore = j; home = g; }
    }
    if (home) { home.items.push(a); for (const s of st) home.stems.add(s); }
    else groups.push({ lang: a.language, core: st, stems: new Set(st), items: [a] });
  });
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
  if (singles) return multi.concat(ranked.filter(g => g.domains < 2)).slice(0, limit);
  return (multi.length >= 8 ? multi : multi.concat(ranked.filter(g => g.domains < 2).slice(0, 8 - multi.length))).slice(0, limit);
}

// ---------- "Why it matters" without AI ----------
// Recognises the kind of event from words in the headlines and explains why such events
// usually matter, then adds who reports it and whether the story is still developing.
const REASONS = [
  [["перемир", "прекращени огня", "ceasefire", "truce"], "Договорённости о прекращении огня могут изменить ход конфликта и безопасность мирных жителей."],
  [["ядерн", "nuclear", "уран", "uranium"], "Ядерная тема напрямую касается международной безопасности и отношений с другими странами."],
  [["удар", "атак", "обстрел", "ракет", "дрон", "беспилот", "взрыв", "strike", "attack", "missile", "drone", "shelling", "explos"], "Удары и атаки прямо влияют на безопасность людей, инфраструктуру и ход конфликта."],
  [["мобилиз", "призыв", "военн служб", "conscript", "mobiliz", "draft"], "Решения о призыве и военной службе затрагивают миллионы людей и показывают, к чему готовится армия."],
  [["нато", "nato", "оборон", "defen", "армия", "армии", "military", "troops", "войск", "баз", "base", "бомбардировщ", "bomber", "истребител", "fighter jet", "вооружен", "weapon"], "Решения в сфере обороны меняют военный баланс и требуют больших расходов из бюджета."],
  [["шпион", "разведк", "spy", "spying", "espionage", "intelligence"], "Шпионские дела и действия разведки показывают напряжённость между странами и могут ухудшить отношения."],
  [["санкц", "sanction"], "Санкции влияют на торговлю, цены, доступ к товарам и финансам, а значит и на экономику в целом."],
  [["ставк", "инфляц", "центробанк", "цб", "central bank", "inflation", "interest rate"], "Ставка и инфляция определяют цены, стоимость кредитов и доходность вкладов."],
  [["нефт", "газ", "энерг", "oil", "gas", "energy", "lng"], "Энергоносители влияют на цены на топливо и электричество и на доходы бюджета."],
  [["бюджет", "налог", "долг", "budget", "tax", "debt", "deficit", "дефицит"], "Бюджетные и налоговые решения затрагивают расходы государства и деньги людей и компаний."],
  [["пошлин", "тариф", "экспорт", "импорт", "торгов", "tariff", "trade", "export", "import"], "Торговые решения меняют цены на товары и условия работы для бизнеса."],
  [["рубл", "доллар", "валют", "курс", "биржа", "рынок", "currency", "market", "stocks", "shares"], "Движения валют и рынков отражаются на ценах, сбережениях и настроениях инвесторов."],
  [["выбор", "голосован", "референдум", "election", "vote", "referendum", "poll"], "Выборы и голосования определяют, кто и с каким курсом будет управлять страной."],
  [["отставк", "назначен", "resign", "appoint", "cabinet", "кабмин"], "Кадровые перемены во власти могут сменить курс политики."],
  [["закон", "указ", "законопроект", "law", "bill", "decree", "legislat"], "Новые законы и указы меняют правила, по которым живут люди и работает бизнес."],
  [["протест", "митинг", "забастов", "protest", "rally", "strike action"], "Протесты показывают уровень недовольства и могут повлиять на решения власти."],
  [["суд", "приговор", "court", "ruling", "verdict"], "Судебные решения создают прецеденты и могут повлиять на политику и права людей."],
  [["переговор", "саммит", "визит", "встреч", "соглашен", "договор", "talks", "summit", "visit", "meeting", "agreement", "deal", "negotiat"], "Переговоры и визиты определяют отношения с другими странами и возможные договорённости."],
  [["мигра", "беженц", "migra", "refugee", "asylum"], "Миграционные решения затрагивают рынок труда, бюджет и общественные настроения."]
];

function explain(g, c) {
  // The main headline decides the kind of event; other headlines only help when it says nothing
  const find = text => { for (const [keys, r] of REASONS) if (keys.some(k => text.includes(" " + k))) return r; return ""; };
  let reason = find(norm(g.lead.title));
  if (!reason) {
    // Otherwise take the kind of event most headlines of this story agree on
    const votes = new Map();
    for (const a of g.items) { const r = find(norm(a.title)); if (r) votes.set(r, (votes.get(r) || 0) + 1); }
    const best = [...votes].sort((x, y) => y[1] - x[1])[0];
    if (best && best[1] >= Math.max(1, g.items.length / 3)) reason = best[0];
  }

  const sources = [...new Set(g.items.map(a => a.source || a.domain))];
  const langs = new Set(g.items.map(a => a.language));
  const name = sources.slice(0, 2).join(" и ");
  let reach;
  const n = sources.length, word = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "издания" : "изданий";
  if (n >= 3) reach = `Событие освещают ${n} ${word}, в том числе ${name}` + (langs.size > 1 ? ", и российские, и зарубежные." : ".");
  else if (sources.length === 2) reach = `Об этом пишут ${name}.`;
  else reach = `Пока сообщает только ${sources[0]}, другие издания это не подтвердили.`;

  let dev = "";
  if (g.items.length >= 3) {
    const times = g.items.map(a => a.t || seenTime(a.seendate)).filter(Boolean);
    const spanH = (Math.max(...times) - Math.min(...times)) / 3600000;
    if (spanH >= 3 && Date.now() - Math.max(...times) < 6 * 3600000) dev = " История продолжает развиваться: новые публикации выходят в течение дня.";
  }
  return [reason, reach + dev].filter(Boolean).join(" ");
}
