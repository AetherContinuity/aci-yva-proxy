// aci-yva-proxy
//
// YVA-hankkeet (ympäristövaikutusten arviointi) ymparisto.fi:stä.
// Julkaisija: Suomen ympäristökeskus (Syke) ja Lupa- ja valvontavirasto.
//
// ── MIKSI TÄMÄ ON OLEMASSA ──────────────────────────────────────────
//
// OGAS3 ei näe YVA-prosessia lainkaan. Se on ERI KANAVA kuin
// Hankeikkuna: YVA on hankekohtaista ympäristöarviointia, Hankeikkuna
// on säädösvalmistelua. Lausunnot ja mielipiteet menevät
// yhteysviranomaiselle, EIVÄT Lausuntopalveluun.
//
// MITTAUSAUKKO KVANTIFIOITU 2026-09-09:
//   Hankeikkuna, teksti=datakeskus          2 osumaa
//   YVA-hakemisto, pelkkä A–N-osio         12 datakeskushanketta
//
// Kuusinkertainen ero, eikä se ole hakuvirhe. Datakeskus ei tarvitse
// lakia — se tarvitsee ympäristöluvan. Sama koskee Fingridin 5,2 mrd
// investointiohjelmaa: kymmeniä voimajohtohankkeita, joista yksikään
// ei näy Hankeikkunassa.
//
// ── MIKSI HTML-JÄSENNIN EIKÄ RAJAPINTA ──────────────────────────────
//
// Sivusto on Drupal 11. `/jsonapi` kokeiltiin 2026-09-09 — EI VASTAA.
// Sisäinen haku on Elastic App Search (`filters[0][field]=type&
// filters[0][values][0]=yva_project`), mutta sen päätepistettä ei ole
// julkaistu.
//
// Jäljelle jää kaksi lyhytosoitesivua, jotka listaavat KAIKKI
// YVA-hankkeet pysyvillä osoitteilla. Ne ovat enumeroitavissa, ja se
// on parempi kuin hakusuodattimet: hakemisto on täydellinen eikä
// riipu suodattimien semantiikasta.

const BASE = 'https://www.ymparisto.fi';
const INDEX = {
  'A-N': '/fi/yva-hankkeiden-n-lyhytosoitteet-ymparistofissa',
  'O-Ö': '/fi/yva-hankkeiden-o-o-lyhytosoitteet-ymparistofissa',
};
const UA = 'ACI-yva-proxy/1.0 (aethercontinuity.org)';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Hakemisto muuttuu harvoin (päivitetty 4.9.2026, julkaistu 5.9.2025).
const CACHE = 'public, max-age=86400';

// ── TURVAKYNNYS ─────────────────────────────────────────────────────
//
// HTML-jäsennin on hauraampi kuin JSON: jos Drupal-teema muuttuu,
// jäsennin hajoaa HILJAA — se palauttaa tyhjän listan eikä virhettä.
// Se on täsmälleen se vikaluokka jota tässä järjestelmässä on jahdattu
// (DS 105:n vakionolla, tyhjä 404 joka luettiin havainnoksi).
//
// Kynnys on MITATTU, ei arvattu: A–N-sivulla oli 2026-09-09 useita
// satoja hanketta. Alle sadan tulos tarkoittaa että jäsennin on
// rikki, ei että hankkeita olisi vähän.
const MIN_PROJECTS = 100;

async function fetchHtml(path) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!r.ok) throw new Error(`ymparisto.fi ${path}: HTTP ${r.status}`);
  return { html: await r.text(), url };
}

// Hankelinkit ovat muodossa
//   <a href="/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/SLUG"
//      title="NIMI">ymparisto.fi/LYHYTOSOITE</a>
// Poimitaan href, title ja lyhytosoite. `title` on hankkeen nimi;
// linkkiteksti on lyhytosoite eikä nimi.
const LINK = /<a\s+href="(\/fi\/osallistu-ja-vaikuta\/ymparistovaikutusten-arviointi\/[^"]+)"[^>]*?title="([^"]*)"[^>]*>([^<]*)<\/a>/gi;

function parseIndex(html) {
  const out = [];
  const seen = new Set();
  let m;
  while ((m = LINK.exec(html)) !== null) {
    const path = m[1];
    if (seen.has(path)) continue;      // sama hanke voi olla kahdesti
    seen.add(path);
    out.push({
      name: m[2].trim(),
      slug: path.split('/').pop(),
      path,
      url: BASE + path,
      shortcut: (m[3] || '').trim() || null,
    });
  }
  LINK.lastIndex = 0;
  return out;
}


// ── Hankesivun jäsennys (lisätty 2026-09-29) ─────────────────────
// Aiempi jäsennin etsi vain href="...pdf" -linkkejä ja palautti 0
// asiakirjaa myös hankkeille, joilla niitä on kymmeniä (Pyhäjoen
// datakeskus: 19). Drupal ei päätä asiakirjalinkkejä tiedostopäätteeseen.
// Linkkiteksti sen sijaan kertoo muodon: "Arviointiohjelma (pdf, 15.74 Mt)".
//
// Päivämäärät ja tila luetaan TEKSTISTÄ, ei HTML-rakenteesta: sivupohja
// voi muuttua, mutta sivun näkyvä teksti ("Tila: Vireillä",
// "Arviointiselostus nähtävillä 19.3.-8.5.2026") on se mitä
// yhteysviranomainen julkaisee. Jäsennin palauttaa aina myös raakarivit,
// jotta tulkinnan voi tarkistaa.

function textify(html) {
  const main = (html.match(/<main[\s\S]*?<\/main>/i) || [html])[0];
  return main
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div|dt|dd|tr|section|article|summary)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// "28.8.2025" -> "2025-08-28". Alkupäivästä voi puuttua vuosi ("28.8.-26.9.2025").
function isoDate(d, m, y) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const DATE = /(\d{1,2})\.(\d{1,2})\.(\d{4})?/g;
function datesIn(line) {
  const raw = [...line.matchAll(DATE)].map(m => ({ d: +m[1], m: +m[2], y: m[3] ? +m[3] : null }));
  // vuoden täydennys seuraavasta päivästä; jos kuukausi on suurempi, edellinen vuosi
  for (let i = raw.length - 1; i >= 0; i--) {
    if (raw[i].y == null && i + 1 < raw.length && raw[i + 1].y != null)
      raw[i].y = raw[i].m > raw[i + 1].m ? raw[i + 1].y - 1 : raw[i + 1].y;
  }
  return raw.filter(x => x.y && x.m >= 1 && x.m <= 12 && x.d >= 1 && x.d <= 31)
            .map(x => isoDate(x.d, x.m, x.y));
}

// Vaiheet avainsanoista. Järjestys on menettelyn järjestys.
const VAIHEET = [
  ['ohjelma_nahtavilla',   /arviointiohjelma\S*\s+(on\s+)?nähtävillä/i],
  ['ohjelma_lausunto',     /lausun\S*\s+(yva-)?(arviointi)?ohjelmasta|ohjelmasta\s+on\s+annettu/i],
  ['selostus_nahtavilla',  /arviointiselostus\S*\s+(on\s+)?nähtävillä|yva-selostus\S*\s+(on\s+)?nähtävillä/i],
  ['perusteltu_paatelma',  /perustel\S*\s+päätelm/i],
];

function parseProject(html) {
  const lines = textify(html);
  const field = (label) => {
    const re = new RegExp(`^${label}:\\s*(.+)$`, 'i');
    for (const l of lines) { const m = l.match(re); if (m) return m[1].trim(); }
    return null;
  };
  // Aikataulu: rivit otsikon "aikataulu" jälkeen, joissa on päivämäärä,
  // kunnes tulee rivi ilman päivämäärää ja ilman vaiheavainsanaa.
  const start = lines.findIndex(l => /menettelyn aikataulu/i.test(l));
  const aikataulu = [];
  if (start >= 0) {
    for (const l of lines.slice(start + 1, start + 25)) {
      const ds = datesIn(l);
      const vaihe = (VAIHEET.find(([, re]) => re.test(l)) || [null])[0];
      if (!ds.length && !vaihe) { if (aikataulu.length) break; else continue; }
      if (ds.length) aikataulu.push({ text: l, vaihe, alku: ds[0], loppu: ds.length > 1 ? ds[ds.length - 1] : null });
    }
  }
  const pub = lines.map(l => l.match(/Julkaistu\s+(\d{1,2}\.\d{1,2}\.\d{4})(?:\s*\/\s*Päivitetty\s+(\d{1,2}\.\d{1,2}\.\d{4}))?/i)).find(Boolean);
  const julkaisijaI = lines.findIndex(l => /^Julkaisija$/i.test(l));
  return {
    tila: field('Tila'),
    alueet: field('Alueet'),
    aihealue: field('Aihealue'),
    aikataulu,
    julkaistu: pub ? datesIn(pub[1])[0] || null : null,
    paivitetty: pub && pub[2] ? datesIn(pub[2])[0] || null : null,
    julkaisija: julkaisijaI >= 0 ? lines[julkaisijaI + 1] || null : null,
    lyhytosoite: (lines.map(l => l.match(/lyhytosoite on:?\s*(\S+)/i)).find(Boolean) || [])[1] || null,
  };
}

// Asiakirjat: linkki jonka teksti kertoo muodon "(pdf, 15.74 Mt)" TAI
// jonka osoite päättyy tiedostopäätteeseen.
function parseDocuments(html, base) {
  const docs = [];
  const A = /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let d;
  while ((d = A.exec(html)) !== null) {
    const text = d[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const fmt = text.match(/\((pdf|docx?|xlsx?|zip)\s*,\s*([\d.,]+\s*[kMG]?t)\)/i);
    const ext = d[1].match(/\.(pdf|docx?|xlsx?|zip)(\?|$)/i);
    if (!fmt && !ext) continue;
    docs.push({
      url: d[1].startsWith('http') ? d[1] : base + d[1],
      text: text.replace(/\s*\((pdf|docx?|xlsx?|zip)\s*,[^)]*\)\s*$/i, ''),
      format: (fmt ? fmt[1] : ext[1]).toLowerCase(),
      size: fmt ? fmt[2] : null,
      dates: datesIn(text),
    });
  }
  return docs;
}

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const u = new URL(req.url);
    const p = u.searchParams;

    const ok = (data) => Response.json({
      source: 'ymparisto.fi — YVA-hankkeet',
      publisher: 'Suomen ympäristökeskus (Syke) / Lupa- ja valvontavirasto',
      data_class: 'authoritative (lakisääteinen YVA-menettely)',
      _channel_note: 'ERI KANAVA kuin Hankeikkuna. YVA-lausunnot menevät '
                   + 'yhteysviranomaiselle, EIVÄT Lausuntopalveluun. '
                   + 'OGAS3:n L-tapahtumat eivät kata tätä.',
      fetched: new Date().toISOString(),
      ...data,
    }, { headers: { ...CORS, 'Cache-Control': CACHE } });

    try {
      // ── Hakemisto ──────────────────────────────────────────────
      const idx = p.get('index');
      if (idx) {
        const keys = idx === 'all' ? Object.keys(INDEX) : [idx];
        const all = [];
        const trace = [];
        for (const k of keys) {
          if (!INDEX[k]) throw new Error(`tuntematon osio ${k}, sallitut ${Object.keys(INDEX)} tai 'all'`);
          const { html, url } = await fetchHtml(INDEX[k]);
          const rows = parseIndex(html);
          trace.push({ section: k, url, n: rows.length });
          all.push(...rows.map(r => ({ ...r, section: k })));
        }
        // TURVAKYNNYS — ks. perustelu yllä.
        if (all.length < MIN_PROJECTS)
          throw new Error(
            `JÄSENNIN RIKKI: hakemistosta löytyi vain ${all.length} hanketta, `
            + `kynnys ${MIN_PROJECTS}. Sivun rakenne on todennäköisesti `
            + `muuttunut. Tyhjä tai lyhyt lista EI ole tulos — se on virhe. `
            + `Osiot: ${JSON.stringify(trace)}`);
        return ok({ route: 'index', sections: trace, n: all.length, data: all });
      }

      // ── Suodatus nimestä ───────────────────────────────────────
      // Suodattaa VAIN hankkeen nimestä. Ei päättele aihetta eikä
      // luokittele — se olisi Extractorin työtä.
      const filter = p.get('filter');
      if (filter) {
        const needle = filter.toLowerCase();
        const all = [];
        for (const [k, path] of Object.entries(INDEX)) {
          const { html } = await fetchHtml(path);
          all.push(...parseIndex(html).map(r => ({ ...r, section: k })));
        }
        if (all.length < MIN_PROJECTS)
          throw new Error(`JÄSENNIN RIKKI: ${all.length} hanketta, kynnys ${MIN_PROJECTS}`);
        const hits = all.filter(r =>
          r.name.toLowerCase().includes(needle) ||
          r.slug.toLowerCase().includes(needle));
        return ok({
          route: 'filter', filter, n_total: all.length, n: hits.length,
          _note: 'Suodatus hankkeen NIMESTÄ. Ei aiheluokitusta.',
          data: hits,
        });
      }

      // ── Yksi hankesivu ─────────────────────────────────────────
      const proj = p.get('project');
      if (proj) {
        const path = proj.startsWith('http')
          ? new URL(proj).pathname
          : (proj.startsWith('/') ? proj : `/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/${proj}`);
        if (!path.includes('/ymparistovaikutusten-arviointi/'))
          throw new Error('?project: polku ei ole YVA-hankesivu');
        const { html, url } = await fetchHtml(path);
        const title = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
        // ?raw=1: näkyvä teksti riveinä jäsentimen tarkistamiseen. Ei
        // HTML:ää eikä avointa välitystä — vain YVA-hankesivujen teksti.
        if (p.get('raw') === '1')
          return ok({ route: 'project', url, raw_lines: textify(html).slice(0, 400) });
        const docs = parseDocuments(html, BASE);
        const meta = parseProject(html);
        return ok({
          route: 'project', url,
          title: title ? title.replace(/<[^>]+>/g, '').trim() : null,
          ...meta,
          _aikataulu_note: 'Luettu sivun tekstistä rivi kerrallaan. vaihe = avainsanatunnistus; '
                         + 'null = rivillä on päivämäärä mutta vaihetta ei tunnistettu (tarkista text). '
                         + 'Aikataulu täydentyy menettelyn edetessä.',
          n_documents: docs.length,
          _documents_note: 'Linkit joiden teksti kertoo muodon "(pdf, 15.74 Mt)" tai osoite päättyy '
                         + 'tiedostopäätteeseen. Tyhjä lista voi tarkoittaa ettei asiakirjoja ole '
                         + 'vielä julkaistu.',
          documents: docs,
        });
      }

      return Response.json({
        service: 'aci-yva-proxy',
        principle: 'Hakemisto on enumeroitava. Kaksi lyhytosoitesivua '
                 + 'listaavat KAIKKI YVA-hankkeet pysyvillä osoitteilla.',
        routes: {
          index:   "?index=A-N | O-Ö | all",
          filter:  "?filter=datakeskus",
          project: "?project=<slug|polku|url>   — tila, aihealue, aikataulu, asiakirjat",
          raw:     "?project=<slug>&raw=1   — sivun näkyvä teksti riveinä (jäsentimen tarkistus)",
        },
        traps: [
          'HTML-jäsennin, ei rajapinta. Drupal 11 /jsonapi kokeiltiin '
          + '2026-09-09 — ei vastaa.',
          `TURVAKYNNYS ${MIN_PROJECTS} hanketta: lyhyt lista on JÄSENTIMEN VIKA, `
          + 'ei tulos. Kynnys on mitattu (A–N-sivulla satoja hankkeita), ei arvattu.',
          'Viranomainen vaihtui: ELY-keskusten YVA-toimivalta siirtyi '
          + 'Lupa- ja valvontavirastolle 1.1.2026. Ennen sitä vireille tulleilla '
          + 'hankkeilla lukee vanha nimi. EI ole kirjoitusasuero vaan '
          + 'organisaatiomuutos — alias-taulukko ei saa yhdistää niitä.',
          'YVA-lausunnot EIVÄT ole Lausuntopalvelussa eivätkä Hankeikkunassa. '
          + 'Ne menevät yhteysviranomaiselle.',
        ],
        terms: 'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/hankkeiden-ymparistovaikutusten-arviointimenettely-yva/yva-hankkeet',
      }, { status: 200, headers: CORS });

    } catch (e) {
      return Response.json({ error: e.message }, { status: 502, headers: CORS });
    }
  },
};
