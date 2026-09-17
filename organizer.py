#!/usr/bin/env python3
"""
File organization helpers for completed one-shot downloads.

Restructures a torrent's downloaded content into a Jellyfin-friendly
"Show Name/Season NN/" layout and optionally normalizes filenames.
Contains no database or Transmission access so it can be reasoned
about (and tested) independently of the rest of the app.
"""
import os
import shutil
from utils import extract_season_number


def normalize_filename(name: str) -> str:
    """Replace underscores with spaces, keeping the extension."""
    base, ext = os.path.splitext(name)
    return base.replace('_', ' ') + ext


def rename_files_in_place(directory: str) -> None:
    """Recursively replace underscores with spaces in file names."""
    for root, _, files in os.walk(directory):
        for filename in files:
            new_name = normalize_filename(filename)
            if new_name == filename:
                continue
            src = os.path.join(root, filename)
            dst = os.path.join(root, new_name)
            if os.path.exists(dst):
                continue  # Don't clobber an existing file
            os.rename(src, dst)


def _move_contents(src_dir: str, dst_dir: str) -> None:
    """
    Move every item from src_dir into dst_dir, creating dst_dir if
    needed. Items that would overwrite an existing file are left in
    src_dir rather than clobbering the destination.
    """
    os.makedirs(dst_dir, exist_ok=True)
    for item in os.listdir(src_dir):
        src_path = os.path.join(src_dir, item)
        dst_path = os.path.join(dst_dir, item)
        if os.path.exists(dst_path):
            continue
        shutil.move(src_path, dst_path)


def _remove_if_empty(path: str) -> None:
    """Remove a directory if it exists and has no contents."""
    try:
        if os.path.isdir(path) and not os.listdir(path):
            os.rmdir(path)
    except OSError:
        pass


def _cleanup_staging(staging_dir: str) -> None:
    """Remove the staging dir and its .pyget_staging parent if empty."""
    _remove_if_empty(staging_dir)
    parent = os.path.dirname(staging_dir)
    if os.path.basename(parent) == '.pyget_staging':
        _remove_if_empty(parent)


def _content_root(staging_dir: str) -> str:
    """
    Return the directory that actually holds the downloaded content.
    Transmission may create a single wrapping directory for the
    torrent, or drop files directly into the download directory.
    """
    entries = os.listdir(staging_dir)
    if len(entries) == 1:
        only_path = os.path.join(staging_dir, entries[0])
        if os.path.isdir(only_path):
            return only_path
    return staging_dir


def _organize_single_season(content_root: str, show_dir: str,
                             season_name: str) -> None:
    """Move all downloaded content into show_dir/season_name."""
    dest = os.path.join(show_dir, season_name)
    _move_contents(content_root, dest)


def _organize_multi_season(content_root: str, show_dir: str,
                            fallback_season: str) -> None:
    """
    Split a multi-season batch into per-season folders. Subfolders
    with a recognizable season number are moved to "Season NN";
    anything ambiguous is left under the show folder as-is rather
    than guessed, so it's easy to spot and sort out manually.
    """
    entries = os.listdir(content_root)
    subdirs = [e for e in entries
               if os.path.isdir(os.path.join(content_root, e))]
    loose_files = [e for e in entries
                   if os.path.isfile(os.path.join(content_root, e))]

    if not subdirs:
        # Nothing to split on; fall back to single-season handling.
        _organize_single_season(content_root, show_dir, fallback_season)
        return

    for subdir in subdirs:
        src_path = os.path.join(content_root, subdir)
        season_num = extract_season_number(subdir)
        if season_num:
            dest = os.path.join(show_dir, f'Season {season_num}')
        else:
            dest = os.path.join(show_dir, subdir)
        _move_contents(src_path, dest)
        _remove_if_empty(src_path)

    if loose_files:
        dest = os.path.join(show_dir, fallback_season)
        os.makedirs(dest, exist_ok=True)
        for filename in loose_files:
            src = os.path.join(content_root, filename)
            dst = os.path.join(dest, filename)
            if not os.path.exists(dst):
                shutil.move(src, dst)


def organize_download(staging_dir: str, show_dir: str, season_name: str,
                       multi_season: bool, strip_underscores: bool):
    """
    Restructure a completed download from its staging directory into
    show_dir, following Jellyfin's "Season NN" layout.

    Returns a status message string if anything was left in place
    for manual review, or None if everything was organized cleanly.
    """
    content_root = _content_root(staging_dir)

    if strip_underscores:
        rename_files_in_place(content_root)

    if multi_season:
        _organize_multi_season(content_root, show_dir, season_name)
    else:
        _organize_single_season(content_root, show_dir, season_name)

    _remove_if_empty(content_root)
    _cleanup_staging(staging_dir)

    leftovers = os.listdir(content_root) if os.path.isdir(
        content_root) else []
    if leftovers:
        return (
            f'{len(leftovers)} item(s) left in place due to naming '
            f'conflicts: {", ".join(leftovers)}'
        )
    return None
