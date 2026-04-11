from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "build" / "icons"
MASTER_SIZE = 1024
SOURCE_ICON = ICON_DIR / f"icon-{MASTER_SIZE}.png"
MAC_ICONSET_SIZES = [16, 32, 64, 128, 256, 512, 1024]


def load_master_icon() -> Image.Image:
    if not SOURCE_ICON.exists():
        raise FileNotFoundError(f"Missing source icon: {SOURCE_ICON}")

    master = Image.open(SOURCE_ICON).convert("RGBA")
    if master.size != (MASTER_SIZE, MASTER_SIZE):
        raise ValueError(
            f"Source icon must be exactly {MASTER_SIZE}x{MASTER_SIZE}px, got {master.size[0]}x{master.size[1]}px"
        )
    return master


def save_pngs(master: Image.Image) -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    master.save(ICON_DIR / "icon.png")
    for size in MAC_ICONSET_SIZES:
        if size == MASTER_SIZE:
            master.save(ICON_DIR / f"icon-{size}.png")
            continue

        resized = master.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(ICON_DIR / f"icon-{size}.png")


def save_ico(master: Image.Image) -> None:
    ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    master.save(ICON_DIR / "icon.ico", sizes=ico_sizes)


def save_icns(master: Image.Image) -> None:
    master.save(ICON_DIR / "icon.icns", format="ICNS")


def main() -> None:
    master = load_master_icon()
    save_pngs(master)
    save_ico(master)
    save_icns(master)


if __name__ == "__main__":
    main()
