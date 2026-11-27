"""Add country markers to published Preflight navigation, using the guide directory as the index."""
import re
from html import unescape
from pathlib import PurePosixPath
from urllib.parse import urljoin, urlsplit

ANCHOR = re.compile(r'(<a\b[^<>]*?\bhref="([^"]+)"[^<>]*>)(.*?)</a>', re.I | re.S)
NAV = re.compile(r'(<nav\b[^>]*>)(.*?)</nav>', re.I | re.S)
LANGUAGE_LABELS = {"english", "français", "deutsch", "dansk", "nederlands", "svenska", "español"}
SITE_HOSTS = {"expectedvaluestudio.com", "preflight.expectedvaluestudio.com"}
# Programme geography is independent of the language or host guide.
PROGRAMMES = {
    **dict.fromkeys("af_psy0 af_psy1 af_pro enac_epl rail mil gend police".split(), "FR"),
    **dict.fromkeys("atsa_faa us_mil_avia us_tbas us_astb us_sift us_asvab us_police us_bpa".split(), "US"),
    **dict.fromkeys("uk_daa uk_army uk_raf_aircrew uk_civil cute".split(), "GB"),
    **dict.fromkeys("cfat ca_police qc_police ca_rcmp".split(), "CA"),
    **dict.fromkeys("de_eignung de_bpol de_bw".split(), "DE"),
    **dict.fromkeys("au_airservices au_adf_joa au_adf_avia".split(), "AU"),
    "iaf": "IN", "sg_rsaf": "SG", "se_hp": "SE", "dk_sdu_unitest": "DK", "dk_ku_kvote2": "DK",
    "es_psico": "ES", "es_gc": "ES", "nl_capaciteit": "NL", "nl_politie": "NL", "at_polizei": "AT",
    "ch_sphair": "CH", "dlr": "DE CH AT LU", "atc": "FR CH", "dispatch": "US CA",
}


def guide_countries(directory):
    result = {
        "atsa-practice": "US",
        "afoqt-tbas-astb-sift-preparation": "US",
        "eignungstest-bundeswehr-polizei": "DE",
    }
    for code, body in re.findall(r'<section class="country" data-country="([A-Z]{2})"[^>]*>(.*?)</section>', directory, re.S):
        for slug in re.findall(r'<a class="g" href="/guides/([^"/]+)\.html"', body):
            result[slug] = code
    return result


def flag(codes):
    symbols = " ".join("".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in code) for code in codes.split())
    return f'<span data-country-flag="{codes}" aria-hidden="true">{symbols}</span> '


def decorate(page, path, countries):
    base = "https://expectedvaluestudio.com/" + path
    current = countries.get(PurePosixPath(path).stem)
    if "/da/" in path:
        current = "DK"

    def link(match):
        opening, href, label = match.groups()
        text = unescape(re.sub(r"<[^>]+>", "", label)).strip().casefold()
        if not text or text in LANGUAGE_LABELS or 'class="back"' in opening or 'class="brand"' in opening or 'data-country-flag=' in label or 'class="flag"' in label:
            return match[0]
        url = urlsplit(urljoin(base, unescape(href)))
        codes = None
        if url.scheme == "brainpreflight" and url.netloc == "sel":
            codes = PROGRAMMES.get(url.path.strip("/"), current)
        elif url.hostname in SITE_HOSTS:
            if href.startswith("#"):
                if url.fragment not in {"content", "main", "countries", "exam-practice"}:
                    codes = current
            elif url.path.startswith("/guides/"):
                codes = countries.get(PurePosixPath(url.path.rstrip("/")).stem)
            elif url.path.startswith(("/preflight/da/", "/preflight-legal/da/")):
                codes = "DK"
        if not codes:
            return match[0]
        return opening + flag(codes) + label + "</a>"

    head, body = page.split("</head>", 1)
    # The programme picker can point to an international article while describing a specific selection.
    def programme(match):
        prefix, program, anchor = match.groups()
        codes = PROGRAMMES.get(program)
        if not codes:
            return match[0]
        return prefix + anchor.replace(">", ">" + flag(codes), 1)

    body = re.sub(r'(<li data-programme="([^"]+)">)(<a\b[^>]+>.*?</a>)', programme, body, flags=re.S)
    body = ANCHOR.sub(link, body)

    def nav_heading(match):
        opening, contents = match.groups()
        codes = set(re.findall(r'data-country-flag="([^"]+)"', contents))
        if len(codes) == 1:
            contents = re.sub(r'(<h[23]\b[^>]*>)', lambda m: m[0] + flag(next(iter(codes))), contents, count=1)
        return opening + contents + "</nav>"

    return head + "</head>" + NAV.sub(nav_heading, body)
