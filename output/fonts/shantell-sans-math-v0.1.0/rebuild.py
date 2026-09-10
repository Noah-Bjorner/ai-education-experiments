"""Rebuild, verify, install runtime assets, and refresh the distributable ZIP.

Run from any directory: python3 /path/to/this/rebuild.py
Requires fonttools[woff], skia-pathops, and Pillow. Preview labels use macOS Helvetica.
"""
from pathlib import Path
import subprocess
import sys
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

from build_font import build
from verify_font import verify


def main():
    package = Path(__file__).resolve().parent
    source = package / "sources/ShantellSans-Medium.woff2"
    artwork = package / "sources/artwork"
    build(source, artwork, package)
    verify(source, artwork, package)
    repository = package.parents[2]
    exporter = repository / "projects/sixtus/tools/learning-material/whiteboard/render/fonts/build.py"
    subprocess.run([sys.executable, str(exporter), str(package / "ShantellSansMath-Medium.woff2")], check=True)
    archive = Path(str(package) + ".zip")
    with ZipFile(archive, "w", compression=ZIP_DEFLATED) as bundle:
        for path in sorted(package.rglob("*")):
            if not path.is_file() or "__pycache__" in path.parts or path.suffix == ".pyc":
                continue
            entry = ZipInfo(path.relative_to(package.parent).as_posix())
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            bundle.writestr(entry, path.read_bytes())
    print(f"Updated runtime assets and {archive.name}")


if __name__ == "__main__":
    main()
