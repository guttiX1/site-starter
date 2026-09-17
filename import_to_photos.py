#!/usr/bin/env python3
"""
Import food media files from food-media/ folder into macOS Photos app.
Run on your Mac: python3 import_to_photos.py
"""

import os
import subprocess
import sys
from pathlib import Path

def import_to_photos():
    """Import all images and videos from food-media/ to Photos app"""

    # Get the food-media folder path
    script_dir = Path(__file__).parent
    media_folder = script_dir / "food-media"

    if not media_folder.exists():
        print(f"❌ Error: food-media folder not found at {media_folder}")
        sys.exit(1)

    # Supported file types
    supported_types = {'.png', '.jpg', '.jpeg', '.gif', '.mp4', '.mov', '.m4v'}

    # Find all media files
    media_files = [
        f for f in media_folder.iterdir()
        if f.is_file() and f.suffix.lower() in supported_types
    ]

    if not media_files:
        print("❌ No media files found in food-media folder")
        sys.exit(1)

    print(f"📸 Found {len(media_files)} media files")
    print("Importing to Photos app...\n")

    # Use AppleScript to import files into Photos
    for media_file in media_files:
        print(f"  ↗️  {media_file.name}")

        # Build AppleScript command
        applescript = f'''
        tell application "Photos"
            activate
            import POSIX file "{str(media_file)}"
        end tell
        '''

        try:
            subprocess.run(
                ['osascript', '-e', applescript],
                capture_output=True,
                check=True,
                timeout=5
            )
        except subprocess.TimeoutExpired:
            print(f"     ⚠️  Timeout importing {media_file.name}")
        except subprocess.CalledProcessError as e:
            print(f"     ⚠️  Error importing {media_file.name}: {e.stderr.decode()}")
        except Exception as e:
            print(f"     ⚠️  Error: {e}")

    print("\n✅ Import complete! Check your Photos app")
    print(f"📁 Imported {len(media_files)} files from food-media/")

if __name__ == "__main__":
    # Check if running on macOS
    if sys.platform != "darwin":
        print("❌ This script only works on macOS")
        sys.exit(1)

    # Check if Photos app is installed
    if not os.path.exists("/Applications/Photos.app"):
        print("❌ Photos app not found. Please install it from the App Store")
        sys.exit(1)

    import_to_photos()
