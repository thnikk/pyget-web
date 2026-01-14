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
