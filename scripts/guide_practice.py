"""Render guide-specific iPhone links into the static Netlify pages."""
import json
import re
from html import escape, unescape
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROUTES = json.loads(Path(__file__).with_name("guide-routes.json").read_text())
APP_ID = "6794363864"
SCHEME = "brainpreflight://sel/"
ASSETS = "/assets/guide-practice.css"
ANCHOR = re.compile(r'<a\b(?P<attrs>[^<>]*)>(?P<label>.*?)</a>', re.I | re.S)
HREF = re.compile(r'''\bhref=(["'])(.*?)\1''', re.I)
CLASS = re.compile(r'''\bclass=(["'])(.*?)\1''', re.I)

# Heading, download link, post-install instruction, link to the guide's program choices.
COPY = {
    "en": ("Open in Brain Preflight on iPhone", "Download on the App Store", "After installing, return here and tap your practice.", "Open your practice in Brain Preflight"),
    "fr": ("Ouvrir dans Brain Preflight sur iPhone", "Télécharger sur l’App Store", "Après l’installation, revenez ici et touchez l’entraînement choisi.", "Ouvrir votre entraînement dans Brain Preflight"),
    "de": ("In Brain Preflight auf dem iPhone öffnen", "Im App Store laden", "Kehre nach der Installation hierher zurück und tippe auf dein Training.", "Training in Brain Preflight öffnen"),
    "nl": ("Open in Brain Preflight op je iPhone", "Download in de App Store", "Kom na de installatie hier terug en tik op je training.", "Open je training in Brain Preflight"),
    "es": ("Abrir en Brain Preflight en el iPhone", "Descargar en el App Store", "Después de instalar la app, vuelve aquí y toca el ejercicio que quieras practicar.", "Abrir la práctica en Brain Preflight"),
    "sv": ("Öppna i Brain Preflight på iPhone", "Hämta i App Store", "Kom tillbaka hit efter installationen och tryck på det du vill öva på.", "Öppna din övning i Brain Preflight"),
    "da": ("Åbn i Brain Preflight på iPhone", "Hent i App Store", "Gå tilbage hertil efter installationen, og tryk på den øvelse, du vil træne.", "Åbn din træning i Brain Preflight"),
}


def campaign_url(store_url, campaign):
    url = urlsplit(store_url)
    params = dict(parse_qsl(url.query))
    params["ct"] = campaign
    return urlunsplit(url._replace(query=urlencode(params)))


def add_practice_links(page, slug):
    # The guide directory leads to individual guides, each of which then supplies its own route.
    if slug == "index":
        return page
    options = ROUTES[slug]
    language = re.search(r'<html[^>]+\blang="([a-z]+)', page)[1]
    heading, download, instruction, reopen = COPY[language]
    paths = list(options.values())
    program_ids = {value.split("?")[0] for value in paths}
    banner = ""
    if len(program_ids) == 1:
        argument = paths[0] if len(paths) == 1 else next(iter(program_ids))
        banner = f'<meta name="apple-itunes-app" content="app-id={APP_ID}, app-argument={SCHEME}{escape(argument, quote=True)}">'
    head, body = page.split("</head>", 1)
    head += f'{banner}<link rel="stylesheet" href="{ASSETS}"></head>'

    stores = []
    for anchor in ANCHOR.finditer(body):
        href = HREF.search(anchor["attrs"])
        if not href:
            continue
        url = urlsplit(unescape(href[2]))
        if url.hostname == "apps.apple.com" and url.path.endswith("/id" + APP_ID):
            classes = CLASS.search(anchor["attrs"])
            stores.append((anchor, set(classes[2].split()) if classes else set(), url.geturl()))
    if not stores:
        raise ValueError(f"No iPhone install link in {slug}")

    primary = [entry for entry in stores if entry[1] & {"cta", "btn"}] or [stores[0]]
    edits = []
    for i, (anchor, _, store) in enumerate(primary):
        # Keep the original campaign and storefront, even when the article has more than one CTA.
        link = f'<a class="bp-download" href="{escape(store, quote=True)}">{download}</a>'
        if i == 0:
            links = []
            for label, value in options.items():
                deep = f'<a class="bp-practice-link" href="{SCHEME}{escape(value, quote=True)}">{escape(label)}</a>'
                if slug == "afcat-exam-preparation":
                    exam = label.split(" · ")[0]
                    install = campaign_url(store, "in-" + exam.lower())
                    deep = f'<span class="bp-practice-option">{deep}<a href="{escape(install, quote=True)}" aria-label="Download Brain Preflight for {exam}">App Store</a></span>'
                links.append(deep)
            content = (f'<span class="bp-practice" id="exam-practice" role="group" aria-label="{heading}">'
                       f'{link}<small>{instruction}</small><strong>{heading}</strong>'
                       f'<span class="bp-practice-links">{" ".join(links)}</span></span>')
        else:
            target = SCHEME + paths[0] if len(paths) == 1 else "#exam-practice"
            content = (f'<span class="bp-practice-repeat">{link}'
                       f'<a href="{escape(target, quote=True)}">{reopen}</a></span>')
        edits.append((anchor.start(), anchor.end(), content))
    # Long-form articles sometimes put the original CTA below several sections.
    intro = body[:primary[0][0].start()]
    if re.search(r"<h2\b", intro, re.I):
        title = re.search(r"</h1>", intro, re.I)
        if title:
            store = escape(primary[0][2], quote=True)
            early = f'<p class="bp-intro"><a class="bp-download" href="{store}">{download}</a></p>'
            edits.insert(0, (title.end(), title.end(), early))
    for start, end, replacement in reversed(edits):
        body = body[:start] + replacement + body[end:]
    return head + body
