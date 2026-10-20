// How a country outside the main list is recognised in headlines and feed summaries.
// Names come from Intl (Russian and English) with their usual endings; EXTRA adds what a name alone
// misses (capitals, adjectives like «итальянский» / "Spanish", leaders), OWN replaces the names when
// they would also match another country (Niger and Nigeria, Guinea and Papua New Guinea...).
// Word list syntax as in scripts/prefetch.mjs: a word matches from its start ("итал" matches «Италии»),
// a trailing "!" means the whole word only, a word with a capital letter is matched with its case
// («Того» the country, not «того» the pronoun).

// The 19 countries collected ahead of time: their files are on the site, not built here
export const MAIN = new Set("RU US CN UA IL IR DE GB FR TR IN JP PL BY KZ MA SA BR YE".split(" "));
// Codes Intl knows that are not countries today (unions, special areas, the USSR, East Germany...)
const NOT_COUNTRIES = new Set("EU EZ UN QO XA XB ZZ AQ BV HM UM TF IO AC CP CQ DG EA IC TA SU FX DD YD UK CS YU ZR TP BU DY HV NH RH VD NT AN QU".split(" "));

const EXTRA: Record<string, string[]> = {
  IT: ["итальянск", "итальянц", "рим!", "рима!", "риме!", "мелони", "italian", "rome!", "meloni"],
  ES: ["испанск", "испанц", "мадрид", "санчес", "spanish", "spaniard", "madrid", "sanchez", "sánchez"],
  PT: ["португальск", "лиссабон", "portuguese", "lisbon"],
  GR: ["греческ", "грек!", "греки!", "греков!", "афин!", "афинах!", "афины!", "greek", "athens"],
  NL: ["нидерланд", "голланд", "амстердам", "гааг", "dutch", "netherlands", "holland", "amsterdam", "the hague"],
  BE: ["бельгийск", "брюссел", "belgian", "brussels"],
  CH: ["швейцарск", "женев", "берн!", "swiss", "geneva", "bern!"],
  AT: ["австрийск", "вен!", "вене!", "вены!", "austrian", "vienna"],
  SE: ["шведск", "швед!", "шведы!", "стокгольм", "swedish", "swede", "stockholm"],
  NO: ["норвежск", "осло!", "norwegian", "oslo!"],
  FI: ["финск", "финн!", "финны!", "хельсинк", "finnish", "finn!", "finns!", "helsinki"],
  DK: ["датск", "копенгаген", "гренланд", "danish", "dane!", "danes!", "copenhagen", "greenland"],
  IE: ["ирландск", "дублин", "irish", "dublin"],
  CZ: ["чешск", "чехи!", "прага!", "праге!", "праги!", "czech", "prague"],
  SK: ["словацк", "братислав", "фицо", "slovak", "bratislava", "fico!"],
  HU: ["венгерск", "венгр", "будапешт", "орбан", "hungarian", "budapest", "orban", "orbán"],
  RO: ["румынск", "румын", "бухарест", "romanian", "bucharest"],
  BG: ["болгарск", "болгар", "bulgarian"],
  RS: ["сербск", "серб!", "сербы!", "белград", "вучич", "serbian", "serb!", "serbs!", "belgrade", "vucic", "vučić"],
  HR: ["хорватск", "хорват", "загреб", "croatian", "croat!", "zagreb"],
  SI: ["словенск", "любляна", "slovenian", "ljubljana"],
  BA: ["боснийск", "сараев", "bosnian", "sarajevo"],
  ME: ["черногорск", "подгориц", "montenegrin", "podgorica"],
  MK: ["македонск", "скопье", "macedonian", "skopje"],
  AL: ["албанск", "албанц", "тиран!", "тиране!", "albanian", "tirana"],
  XK: ["косов", "приштин", "kosovo", "pristina"],
  LV: ["латвийск", "латыш", "рига!", "риге!", "риги!", "latvian", "riga!"],
  LT: ["литовск", "литв", "вильнюс", "lithuanian", "vilnius"],
  EE: ["эстонск", "таллин", "estonian", "tallinn"],
  MD: ["молдавск", "молдов", "кишин", "санду", "приднестров", "moldovan", "chisinau", "chișinău", "sandu!", "transnistria"],
  AM: ["армянск", "армян", "ереван", "пашинян", "карабах", "armenian", "yerevan", "pashinyan", "karabakh"],
  AZ: ["азербайджанск", "азербайджанц", "баку!", "алиев", "azerbaijani", "baku!", "aliyev"],
  GE: ["грузинск", "грузин", "тбилиси", "кобахидзе", "georgian", "tbilisi", "kobakhidze"],
  UZ: ["узбекск", "узбек", "ташкент", "мирзиёев", "мирзиеев", "uzbek", "tashkent", "mirziyoyev"],
  KG: ["киргизск", "киргиз", "кыргыз", "бишкек", "жапаров", "kyrgyz", "bishkek", "japarov"],
  TJ: ["таджикск", "таджик", "душанбе", "рахмон", "tajik", "dushanbe", "rahmon"],
  TM: ["туркменск", "туркмен", "ашхабад", "бердымухамедов", "turkmen", "ashgabat", "berdimuhamedov"],
  MN: ["монгольск", "монгол", "улан-батор", "mongolian", "ulaanbaatar"],
  KR: ["южная корея", "южной корее", "южной кореи", "южную корею", "южнокорейск", "сеул", "south korea", "south korean", "seoul"],
  KP: ["кндр!", "северная корея", "северной корее", "северной кореи", "северную корею", "северокорейск", "пхеньян", "ким чен ын", "north korea", "north korean", "pyongyang", "kim jong un"],
  TW: ["тайваньск", "тайбэ", "taiwanese", "taipei"],
  VN: ["вьетнамск", "ханой", "vietnamese", "hanoi"],
  TH: ["таиланд", "тайланд", "тайск", "бангкок", "thai!", "bangkok"],
  PH: ["филиппин", "манил", "маркос", "philippine", "filipino", "manila", "marcos"],
  ID: ["индонезийск", "джакарт", "прабово", "indonesian", "jakarta", "prabowo"],
  MY: ["малайзийск", "куала-лумпур", "malaysian", "kuala lumpur"],
  SG: ["сингапурск", "singaporean"],
  PK: ["пакистанск", "исламабад", "шариф", "pakistani", "islamabad", "sharif!"],
  AF: ["афганск", "афганц", "кабул", "талиб", "afghan", "kabul", "taliban"],
  BD: ["бангладешск", "дакк", "bangladeshi", "dhaka"],
  LK: ["шри-ланк", "sri lanka", "sri lankan", "colombo"],
  NP: ["непальск", "катманду", "nepalese", "nepali", "kathmandu"],
  IQ: ["иракск", "багдад", "курдистан", "iraqi", "baghdad", "kurdistan"],
  SY: ["сирийск", "дамаск", "шараа", "syrian", "damascus", "sharaa"],
  LB: ["ливанск", "бейрут", "хезболл", "lebanese", "beirut", "hezbollah"],
  JO: ["иордански", "амман!", "jordanian", "amman!"],
  PS: ["палестин", "западн берег", "западном берегу", "рамалл", "аббас!", "palestinian", "west bank", "ramallah", "abbas!"],
  EG: ["египетск", "египтян", "каир", "ас-сиси", "egyptian", "cairo", "sisi!"],
  LY: ["ливийск", "триполи", "бенгази", "хафтар", "libyan", "tripoli", "benghazi", "haftar"],
  DZ: ["алжирск", "algerian", "algiers"],
  TN: ["тунисск", "tunisian"],
  ET: ["эфиопск", "аддис-абеб", "ethiopian", "addis ababa"],
  SO: ["сомалийск", "могадишо", "somali", "mogadishu"],
  KE: ["кенийск", "найроби", "kenyan", "nairobi"],
  NG: ["нигерийск", "абуджа", "лагос", "nigerian", "abuja", "lagos"],
  ZA: ["юар!", "южная африка", "южной африке", "южной африки", "южноафриканск", "south africa", "south african", "pretoria", "johannesburg", "ramaphosa"],
  QA: ["катарск", "доха!", "дохе!", "qatari", "doha!"],
  KW: ["кувейтск", "kuwaiti"],
  AE: ["оаэ!", "эмират", "абу-даби", "дубай", "дубае", "uae!", "emirati", "emirates", "abu dhabi", "dubai"],
  OM: ["оманск", "маскат", "omani", "muscat"],
  BH: ["бахрейнск", "bahraini", "manama"],
  CA: ["канадск", "оттав", "карни!", "canadian", "ottawa", "carney!"],
  MX: ["мексиканск", "мехико", "шейнбаум", "mexican", "mexico city", "sheinbaum"],
  CU: ["кубинск", "гаван", "cuban", "havana"],
  VE: ["венесуэльск", "каракас", "мадуро", "venezuelan", "caracas", "maduro"],
  CO: ["колумбийск", "богот", "петро!", "colombian", "bogota", "bogotá", "petro!"],
  AR: ["аргентинск", "буэнос-айрес", "милей", "argentine", "argentinian", "buenos aires", "milei"],
  CL: ["чилийск", "сантьяго", "chilean", "santiago"],
  EC: ["эквадорск", "кито!", "ecuadorian", "quito"],
  BO: ["боливийск", "bolivian", "la paz"],
  AU: ["австралийск", "канберр", "албаниз", "australian", "canberra", "albanese"],
  NZ: ["новозеландск", "wellington"]
};

// Whole replacement where a generic name would also catch another country
const OWN: Record<string, string[]> = {
  NE: ["нигер!", "нигера!", "нигере!", "ниамей", "niger!", "nigerien", "niamey"],
  GN: ["гвинея!", "гвинеи!", "гвинею!", "гвинее!", "гвинейск", "конакри", "guinea!", "guinean", "conakry"],
  GQ: ["экваториальная гвинея", "экваториальной гвинеи", "equatorial guinea"],
  GW: ["гвинея-бисау", "гвинеи-бисау", "guinea-bissau"],
  PG: ["папуа", "papua"],
  SS: ["южный судан", "южного судана", "южном судане", "южному судану", "south sudan", "juba!"],
  SD: ["судан!", "судана!", "судане!", "судану!", "суданом!", "суданск", "хартум", "дарфур", "sudan!", "sudanese", "khartoum", "darfur"],
  DO: ["доминиканск", "dominican republic"],
  DM: ["доминика!", "доминики!", "dominica!"],
  CG: ["конго-браззавиль", "браззавил", "brazzaville", "republic of the congo"],
  CD: ["дрк!", "демократическая республика конго", "демократической республики конго", "киншас", "drc!", "dr congo", "democratic republic of the congo", "kinshasa", "конго!", "congo!"],
  KR: [], KP: [], // names come from EXTRA only: plain «Корея» / "Korea" could be either
  GE: ["грузия!", "грузии!", "грузию!", "грузией!", "грузинск", "грузин", "тбилиси", "кобахидзе", "georgian", "tbilisi", "kobakhidze"], // "Georgia" alone is also a US state
  JO: ["иордания", "иордании", "иорданию", "иорданией", "иордански", "амман!"], // "Jordan" is also a first name
  TD: ["Чад!", "Чада!", "Чаде!", "нджамен", "n'djamena", "ndjamena"],          // "Chad" is also a first name
  TL: ["восточный тимор", "восточного тимора", "восточном тиморе", "timor-leste", "east timor"],
  VA: ["ватикан", "папа римский", "папы римского", "vatican", "holy see"],
  // Names that are also ordinary words: «того», «мали» (малой), «перу» (пера)
  TG: ["Того!", "тоголезск", "ломе!", "togo!", "togolese", "lomé", "lome!"],
  ML: ["Мали!", "малийск", "бамако", "mali!", "malian", "bamako"],
  PE: ["перу!", "перуанск", "лима!", "peru!", "peruvian", "lima!"]
};

const L = "a-zа-яё0-9";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// One Russian word with its case endings: «Италия» -> Италии, Италию; «Египет» -> Египта, Египте
function ruWord(w: string): string {
  const e = esc;
  if (/(ая|яя|ий|ый|ой|ое|ые|ие)$/.test(w)) return `${e(w.slice(0, -2))}(?:ая|яя|ой|ей|ую|юю|ий|ый|ого|его|ом|ем|ые|ие|ых|их)`; // «Южная», «Южной»
  if (w.endsWith("ия")) return `${e(w.slice(0, -1))}(?:я|и|ю|ей)`;
  if (w.endsWith("а")) return `${e(w.slice(0, -1))}(?:а|ы|и|е|у|ой|ою)`;
  if (w.endsWith("я")) return `${e(w.slice(0, -1))}(?:я|и|е|ю|ей)`;
  if (w.endsWith("ы")) return `${e(w.slice(0, -1))}(?:ы|ов|ах|ам|ами)`;                 // «Нидерланды», «Филиппины»
  if (/[йь]$/.test(w)) return `${e(w.slice(0, -1))}(?:${w.slice(-1)}|я|е|ю|ем|ём)`;     // «Парагвай», «Израиль»
  if (/[оуиеюэ]$/.test(w)) return e(w);                                                   // «Конго», «Перу», «Чили»: not declined
  const fleeting = /[^аяеоуыюиэьй][ео][^аяеоуыюиэьй]$/.test(w) ? w.slice(0, -2) + w.slice(-1) : w; // «Египет» -> «Египта»
  return `(?:${e(w)}|${e(fleeting)}(?:а|е|у|ом))`;
}
// One English word with the usual demonym endings: Egypt -> Egyptian, Syria -> Syrian, Sudan -> Sudanese
function enWord(w: string): string {
  return `${esc(w)}(?:'s|n|ns|an|ans|ian|ians|ese|i|is)?`;
}
function phrase(name: string, word: (w: string) => string): string {
  const words = name.toLowerCase().replace(/\s*\(.*?\)/g, "").split(/ - |,/)[0].replace(/[’']/g, "'").trim().split(/\s+/).filter(w => w !== "the");
  return words.map(w => w.split("-").map(p => p.length <= 2 ? esc(p) : word(p)).join("-")).join("\\s+") + `(?![${L}])`;
}
// The "!" word syntax of the lists above as a regular expression source
function listWord(w: string): string {
  const whole = w.endsWith("!"), k = esc(w.replace(/!$/, "")).replace(/\s+/g, "\\s+");
  return k + (whole ? `(?![${L}])` : "");
}

const ruNames = new Intl.DisplayNames(["ru"], { type: "region" });
const enNames = new Intl.DisplayNames(["en"], { type: "region" });
export function names(code: string): { ru: string; en: string } | null {
  if (!/^[A-Z]{2}$/.test(code) || NOT_COUNTRIES.has(code)) return null;
  let ru = "", en = "";
  try { ru = ruNames.of(code) || ""; en = enNames.of(code) || ""; } catch { return null; }
  if (!ru || ru === code || !en || en === code) return null;
  return { ru, en };
}

export function patterns(code: string): RegExp[] {
  const n = names(code);
  if (!n) return [];
  const parts = code in OWN ? [] : [phrase(n.ru, ruWord), phrase(n.en, enWord)];
  const exact: string[] = [];
  for (const w of [...(OWN[code] || []), ...(EXTRA[code] || [])]) (/[A-ZА-ЯЁ]/.test(w) ? exact : parts).push(listWord(w));
  return [...[...new Set(parts)].map(p => new RegExp(`(^|[^${L}])${p}`, "i")), ...exact.map(p => new RegExp(`(^|[^${L}])${p}`))];
}

// The same rule as the collector: named in the headline, or at least twice in the summary
// (once is enough for an outlet based in this country). The expressions are built once per country.
export function matcher(code: string): ((title: string, desc: string, home: boolean) => boolean) | null {
  const res = patterns(code);
  if (!res.length) return null;
  const all = res.map(re => new RegExp(re.source, re.flags + "g"));
  return (title, desc, home) => {
    if (res.some(re => re.test(title))) return true;
    if (!desc) return false;
    const need = home ? 1 : 2;
    let n = 0;
    for (const re of all) if ((n += (desc.match(re) || []).length) >= need) return true;
    return false;
  };
}
