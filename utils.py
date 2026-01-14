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
