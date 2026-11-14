"""Build the studio and Preflight guides for host-specific HTTP routing."""
from pathlib import Path
import re
import shutil
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist"
STUDIO = "https://expectedvaluestudio.com"
PREFLIGHT = "https://preflight.expectedvaluestudio.com"
GUIDES = "/guides/"
PRIVATE = "/_preflight"
NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
ET.register_namespace("", NS)


def generate():
    # Only copy the studio's published static files into the deploy.
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    for path in ROOT.iterdir():
        if path.is_dir() and path.name in {"assets", "labrats-legal", "nobody", "preflight", "preflight-legal"}:
            shutil.copytree(path, OUT / path.name)
        elif path.is_file() and path.suffix in {".html", ".xml", ".txt", ".png"}:
            shutil.copy2(path, OUT / path.name)

    target = OUT / PRIVATE.lstrip("/")
    target.mkdir()
    guides_dir = OUT / "guides"
    guides_dir.mkdir()
    aliases = {"index.html": ""}
    for path in sorted((ROOT / "guides").glob("*.html")):
        page = path.read_text().replace(STUDIO + GUIDES, PREFLIGHT + GUIDES)
        if 'http-equiv="refresh"' in page:
            destination = re.search(r'<link rel="canonical" href="([^"]+)">', page)[1]
            if not destination.startswith(PREFLIGHT + GUIDES):
                raise ValueError(f"Unexpected redirect destination for {path}")
            aliases[path.name] = destination.removeprefix(PREFLIGHT + GUIDES)
            continue
        # Absolute studio links keep shared assets, legal pages and app calls to action working.
        page = re.sub(r'(["\'(=])(/(?:assets/|preflight/|preflight-legal/))', r'\g<1>' + STUDIO + r'\g<2>', page)
        (guides_dir / path.name).write_text(page)

    for path in [OUT / "preflight/index.html", OUT / "llms.txt"]:
        text = path.read_text().replace(STUDIO + GUIDES, PREFLIGHT + GUIDES)
        path.write_text(text.replace('href="/guides/', 'href="' + PREFLIGHT + GUIDES))

    sitemap = ET.parse(ROOT / "sitemap.xml")
    studio_urls = sitemap.getroot()
    guide_urls = ET.Element(studio_urls.tag)
    for entry in list(studio_urls):
        loc = entry.find(f"{{{NS}}}loc")
        if loc.text.startswith(STUDIO + GUIDES):
            studio_urls.remove(entry)
            loc.text = loc.text.replace(STUDIO, PREFLIGHT, 1)
            guide_urls.append(entry)
    for folder, urls in [(OUT, studio_urls), (target, guide_urls)]:
        ET.ElementTree(urls).write(folder / "sitemap.xml", encoding="utf-8", xml_declaration=True)
        (folder / "sitemap.txt").write_text("".join(loc.text + "\n" for loc in urls.iter(f"{{{NS}}}loc")))
    (target / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {PREFLIGHT}/sitemap.xml\n")

    rules = []
    for host in [STUDIO, "https://www.expectedvaluestudio.com", PREFLIGHT]:
        for old, new in aliases.items():
            rules.append(f"{host}{GUIDES}{old} {PREFLIGHT}{GUIDES}{new} 301!")
        if host != PREFLIGHT:
            rules.extend([f"{host}/guides {PREFLIGHT}{GUIDES} 301!",
                          f"{host}{GUIDES}* {PREFLIGHT}{GUIDES}:splat 301!"])
    # Serve guides as real files, also available on the staging deployment.
    # Only the old studio hostnames redirect these paths.
    for name in ["robots.txt", "sitemap.xml", "sitemap.txt"]:
        rules.append(f"{PREFLIGHT}/{name} {PRIVATE}/{name} 200!")
    rules.append(f"{PREFLIGHT}/ {STUDIO}/preflight/ 301!")
    # Use file shadowing: existing guides and verification files win over
    # the historical redirect for unmatched paths on the app subdomain.
    rules.append(f"{PREFLIGHT}/* {STUDIO}/preflight/:splat 301")
    # Internal rewrite targets should never be indexed as standalone URLs.
    rules.append(f"{PRIVATE}/* {PREFLIGHT}/:splat 301!")
    (OUT / "_redirects").write_text("\n".join(rules) + "\n")


if __name__ == "__main__":
    generate()
