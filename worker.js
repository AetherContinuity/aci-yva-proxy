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
        // Asiakirjalinkit: PDF ja muut liitteet.
        const docs = [];
        const D = /<a\s+href="([^"]+\.(?:pdf|docx?|xlsx?))"[^>]*>([\s\S]*?)<\/a>/gi;
        let d;
        while ((d = D.exec(html)) !== null) {
          docs.push({
            url: d[1].startsWith('http') ? d[1] : BASE + d[1],
            text: d[2].replace(/<[^>]+>/g, '').trim(),
          });
        }
        return ok({
          route: 'project', url,
          title: title ? title.replace(/<[^>]+>/g, '').trim() : null,
          n_documents: docs.length,
          _documents_note: 'Arviointiohjelma ja -selostus ovat hankesivulla. '
                         + 'Tyhjä lista voi tarkoittaa ettei niitä ole vielä '
                         + 'julkaistu — se on eri asia kuin jäsentimen vika.',
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
          project: "?project=<slug|polku|url>",
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
