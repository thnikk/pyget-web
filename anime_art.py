import gzip
import os
import re
import time
import xml.etree.ElementTree as ET
import requests
from config import DATA_DIR

ANIDB_API = "http://api.anidb.net:9001/httpapi"
ANIDB_CDN = "https://cdn.anidb.net/images/main"
TITLES_URL = "https://anidb.net/api/anime-titles.xml.gz"
TITLES_CACHE = os.path.join(DATA_DIR, "anime-titles.xml.gz")
TITLES_TTL = 86400  # 24 hours

MIN_INTERVAL = 2.1  # seconds between API requests
last_request_time = 0


def log(msg):
    print(f"[anime_art] {msg}", flush=True)


ANIDB_CLIENT = "pyget"
ANIDB_CLIENTVER = "1"


def _rate_limit():
    global last_request_time
    elapsed = time.time() - last_request_time
    if elapsed < MIN_INTERVAL:
        wait = MIN_INTERVAL - elapsed
        log(f"rate limit: sleeping {wait:.1f}s")
        time.sleep(wait)
    last_request_time = time.time()


def _decode_response(resp):
    try:
        return gzip.decompress(resp.content)
    except Exception:
        return resp.content


# ---------------------------------------------------------------------------
# Title dump: download, cache, search
# ---------------------------------------------------------------------------

def _titles_cache_fresh():
    """Return True if the local titles cache exists and is less than TTL seconds old."""
    if not os.path.exists(TITLES_CACHE):
        return False
    age = time.time() - os.path.getmtime(TITLES_CACHE)
    return age < TITLES_TTL


def _download_titles():
    """Download the AniDB title dump (gzipped XML) to the local cache path."""
    log(f"downloading AniDB title dump")
    try:
        resp = requests.get(TITLES_URL, timeout=60)
        resp.raise_for_status()
        with open(TITLES_CACHE, "wb") as f:
            f.write(resp.content)
        log(f"title dump saved ({len(resp.content)} bytes)")
        return True
    except Exception as e:
        log(f"failed to download title dump: {e}")
        return False


def _load_titles():
    """
    Parse the gzipped XML title dump and return a list of
    (aid, title_text) tuples covering all title variants.
    """
    try:
        with gzip.open(TITLES_CACHE, "rb") as f:
            data = f.read()
        root = ET.fromstring(data)
    except Exception as e:
        log(f"failed to parse title dump: {e}")
        return []

    entries = []
    for anime in root:
        aid = anime.get("aid") or anime.get("id")
        if not aid:
            continue
        for title_el in anime:
            text = title_el.text
            if text:
                entries.append((aid, text))
    return entries


def _season_number(season_name):
    """
    Extract an integer season number from a string like 'Season 03', 'S2', '3', etc.
    Returns None if no number found.
    """
    if not season_name:
        return None
    m = re.search(r'\d+', season_name)
    return int(m.group()) if m else None


def _season_candidates(show_name, season_name):
    """
    Build an ordered list of (title, is_season_specific) search candidates
    given a show name and season descriptor.

    For season 1: the base title is tried first (most shows don't suffix S1).
    For season N>1: season-specific variants are tried before the bare title.
    """
    n = _season_number(season_name)

    if n is None:
        # No season number parseable — just try the raw combo then the base title
        return [
            (f"{show_name} {season_name}", True),
            (show_name, False),
        ]

    if n == 1:
        # Season 1 is almost always just the bare title in AniDB
        return [(show_name, False)]

    # For season N, AniDB uses various conventions — try them all
    variants = [
        f"{show_name} Season {n}",   # "Oshi no Ko Season 2"  (exact AniDB title for S2)
        f"{show_name} S{n}",         # "Oshi no Ko S3"        (in S3 dump)
        f"{show_name} {n}",          # "Oshi no Ko 2" / "Oshi no Ko 3"
    ]
    candidates = [(v, True) for v in variants]
    candidates.append((show_name, False))  # bare title as last resort
    return candidates


def find_aid_by_title(query):
    """
    Search the local AniDB title dump for the best matching AID.
    Tries exact match first, then case-insensitive, then substring.
    Returns the AID string on success, or None.
    """
    if not _titles_cache_fresh():
        if not _download_titles():
            if not os.path.exists(TITLES_CACHE):
                log("no title dump available, cannot search")
                return None
            log("using stale title dump (download failed)")

    entries = _load_titles()
    if not entries:
        return None

    log(f"searching title dump for '{query}' ({len(entries)} title entries)")
    query_lower = query.lower()

    # 1. Exact match
    for aid, title in entries:
        if title == query:
            log(f"exact match: aid={aid} title='{title}'")
            return aid

    # 2. Case-insensitive exact match
    for aid, title in entries:
        if title.lower() == query_lower:
            log(f"case-insensitive match: aid={aid} title='{title}'")
            return aid

    # 3. Substring match — prefer shortest title (most specific)
    matches = [(aid, title) for aid, title in entries if query_lower in title.lower()]
    if matches:
        matches.sort(key=lambda x: len(x[1]))
        aid, title = matches[0]
        log(f"substring match: aid={aid} title='{title}'")
        return aid

    log(f"no match found in title dump for '{query}'")
    return None


# ---------------------------------------------------------------------------
# AniDB HTTP API: fetch anime details by AID
# ---------------------------------------------------------------------------

def fetch_anime_by_aid(aid):
    """
    Call request=anime&aid=<aid> to retrieve the anime record.
    Returns the picture filename string on success, or None.
    """
    _rate_limit()

    params = {
        'client': ANIDB_CLIENT,
        'clientver': ANIDB_CLIENTVER,
        'protover': '1',
        'request': 'anime',
        'aid': aid,
    }

    log(f"fetching AniDB record for aid={aid}")

    try:
        resp = requests.get(ANIDB_API, params=params, timeout=15)
        log(f"AniDB response: HTTP {resp.status_code}")

        if resp.status_code != 200:
            log(f"unexpected status {resp.status_code}")
            return None

        data = _decode_response(resp)
        log(f"response XML: {data[:300]}")

        root = ET.fromstring(data)
        if root.tag == 'error':
            code = root.get('code', '?')
            text = root.text or ''
            if code == '302':
                log(f"INVALID CLIENT (error 302) — check client name/version in settings")
            elif code == '500':
                log(f"BANNED (error 500) — IP may be rate-limited by AniDB")
            else:
                log(f"AniDB API error {code}: {text}")
            return None

        picture = root.findtext('picture')
        log(f"parsed: aid={aid}, picture={picture}")
        return picture

    except Exception as e:
        log(f"exception during AniDB request: {e}")

    return None


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

def fetch_artwork_url(show_name, season_name=None, anidb_id=None):
    """
    Resolve an AniDB CDN artwork URL for the given show.

    If anidb_id is provided, use it directly (skip title search).
    Otherwise search the title dump using season-aware candidate titles,
    then fetch the picture filename via the HTTP API.
    """
    if anidb_id:
        log(f"using direct AID {anidb_id}, fetching picture filename")
        picture = fetch_anime_by_aid(anidb_id)
        if picture:
            url = f"{ANIDB_CDN}/{picture}"
            log(f"direct AID artwork: {url}")
            return url
        log(f"could not retrieve picture for aid={anidb_id}")
        return None

    # Build season-aware ordered candidate list
    if season_name:
        candidates = _season_candidates(show_name, season_name)
        log(f"season candidates: {[t for t, _ in candidates]}")
    else:
        candidates = [(show_name, False)]

    for title, is_season_specific in candidates:
        log(f"trying title: '{title}'")
        aid = find_aid_by_title(title)
        if not aid:
            log(f"no AID found for '{title}'")
            continue

        picture = fetch_anime_by_aid(aid)
        if picture:
            url = f"{ANIDB_CDN}/{picture}"
            log(f"found artwork: {url}")
            return url
        log(f"no picture in AniDB record for aid={aid}")

    log(f"no artwork found for '{show_name}' (season={season_name})")
    return None
