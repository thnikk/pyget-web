import re
from typing import Optional
from urllib.parse import urlencode

def parse_anime_title(title: str) -> Optional[str]:
    """
    Extract show name from anime title format.
    Expected: [SubGroup] Show name - episode (quality) [id].mkv
    """
    # Remove brackets and their contents from the start
    match = re.search(r'\[.*?\]\s*(.*?)\s*-\s*\d+', title)
    if match:
        return match.group(1).strip()
    return None

def build_feed_url(base_url: str, uploader: str = None,
                   quality: str = None, show: str = None) -> str:
    """Build RSS feed URL with query parameters."""
    params = {}

    if show:
        search_terms = [show]
        if quality:
            search_terms.append(quality)
        params['q'] = ' '.join(search_terms)
    elif quality:
        params['q'] = quality

    if uploader:
        params['u'] = uploader

    if params:
        return f"{base_url}/?page=rss&{urlencode(params)}"
    return f"{base_url}/?page=rss"

def extract_episode_number(title: str) -> Optional[str]:
    """Extract episode number from anime title format."""
    # Expected: [SubGroup] Show name - 01 (quality) [id].mkv
    match = re.search(r'-\s*(\d+)', title)
    if match:
        return match.group(1)
    return None

def extract_subgroup(title: str) -> Optional[str]:
    """Extract subgroup from anime title format."""
    # Expected: [SubGroup] Show name - episode (quality) [id].mkv
    match = re.search(r'^\[([^\]]+)\]', title)
    if match:
        return match.group(1).strip()
    return None

def extract_version(title: str) -> Optional[str]:
    """Extract version number from title (v2, v3, etc.)."""
    match = re.search(r'\s+v(\d+)(?:\s|$)', title, re.IGNORECASE)
    return match.group(1) if match else None

def extract_quality(title: str) -> Optional[str]:
    """Extract quality from anime title format."""
    # Look for patterns like (1080p), (720p), etc.
    match = re.search(r'\((\d+p)\)', title)
    if match:
        return match.group(1)
    return None

def extract_torrent_url(entry) -> Optional[str]:
    """Find the .torrent link on a feedparser entry."""
    if hasattr(entry, 'links'):
        for link in entry.links:
            if link.get('type') == 'application/x-bittorrent':
                return link.get('href')
    if hasattr(entry, 'link'):
        return entry.link
    return None


def get_entry_seeders(entry) -> Optional[int]:
    """
    Read the seeder count from a Nyaa-style RSS entry, if the feed
    provides one. Not all indexers expose this.
    """
    value = entry.get('nyaa_seeders')
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# Keywords and patterns that suggest a release is a batch/season
# pack rather than a single episode.
BATCH_KEYWORDS = re.compile(
    r'\b(batch|complete|full\s*season|season\s*pack)\b', re.IGNORECASE)
EPISODE_RANGE = re.compile(r'\b\d{2,3}\s*[-~]\s*\d{2,3}\b')


def is_batch_release(title: str) -> bool:
    """
    Heuristic check for whether a torrent title looks like a
    batch/season release rather than a single episode. Not perfect,
    used for sorting/filtering, not hard exclusion.
    """
    if BATCH_KEYWORDS.search(title):
        return True
    if EPISODE_RANGE.search(title):
        return True
    return False


# Matches "Season 2", "Season_02", "S2", etc. in a directory name.
SEASON_PATTERN = re.compile(
    r'season\s*[\s_.-]?(\d{1,2})\b|(?<![a-z])s(\d{1,2})\b',
    re.IGNORECASE)


def extract_season_number(name: str) -> Optional[str]:
    """Extract a zero-padded season number from a directory name."""
    match = SEASON_PATTERN.search(name)
    if not match:
        return None
    num = match.group(1) or match.group(2)
    return num.zfill(2)


def strip_release_tags(title: str) -> str:
    """
    Remove bracketed and parenthesized release tags (subgroup,
    quality, batch markers, etc.) from a torrent title, leaving a
    cleaner suggested show name.
    """
    cleaned = re.sub(r'\[[^\]]*\]', '', title)
    cleaned = re.sub(r'\([^)]*\)', '', cleaned)
    return re.sub(r'\s+', ' ', cleaned).strip()


def parse_episode_info(title: str) -> dict:
    """
    Parse comprehensive episode information from title.
    Expected format: [SubGroup] Show name - episode (quality) [id].mkv
    Returns dict with: show_name, episode, subgroup, version, quality
    """
    show_name = parse_anime_title(title)
    episode = extract_episode_number(title)
    subgroup = extract_subgroup(title)
    version = extract_version(title)
    quality = extract_quality(title)
    
    return {
        'show_name': show_name,
        'episode': episode,
        'subgroup': subgroup,
        'version': int(version) if version and version.isdigit() else 1,
        'quality': quality
    }
