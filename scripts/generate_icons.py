from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "build" / "icons"
MASTER_SIZE = 1024
MAC_ICONSET_SIZES = [16, 32, 64, 128, 256, 512, 1024]

TEXT_COLOR = (255, 106, 66, 255)
TEXT_SHADOW = (105, 28, 18, 210)
PANEL_FILL = (28, 28, 30, 255)
PANEL_STROKE = (255, 106, 66, 255)
PANEL_HIGHLIGHT = (255, 144, 118, 108)
PANEL_SHADOW = (0, 0, 0, 90)
SYMBOL_BG = (45, 33, 32, 255)


def load_font(size: int, *, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates: list[str]
    if mono:
        candidates = [
            "/System/Library/Fonts/Menlo.ttc",
            "/System/Library/Fonts/SFNSMono.ttf",
        ]
    elif bold:
        candidates = [
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/System/Library/Fonts/HelveticaNeue.ttc",
            "/System/Library/Fonts/Helvetica.ttc",
        ]
    else:
        candidates = [
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/System/Library/Fonts/HelveticaNeue.ttc",
            "/System/Library/Fonts/Helvetica.ttc",
        ]

    for candidate in candidates:
        if Path(candidate).exists():
            try:
                return ImageFont.truetype(candidate, size=size)
            except OSError:
                continue

    return ImageFont.load_default()


def draw_text_with_shadow(
    draw: ImageDraw.ImageDraw,
    position: tuple[int, int],
    text: str,
    font: ImageFont.ImageFont,
) -> None:
    shadow_offset = 10
    draw.text((position[0] + shadow_offset, position[1] + shadow_offset), text, font=font, fill=TEXT_SHADOW)
    draw.text(position, text, font=font, fill=TEXT_COLOR)


def create_master_icon() -> Image.Image:
    image = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    background_top = (20, 18, 22, 255)
    background_bottom = (10, 10, 12, 255)
    for y in range(MASTER_SIZE):
        ratio = y / (MASTER_SIZE - 1)
        color = tuple(
            int(background_top[index] * (1 - ratio) + background_bottom[index] * ratio)
            for index in range(4)
        )
        draw.line((0, y, MASTER_SIZE, y), fill=color)

    shadow_bounds = (160, 172, MASTER_SIZE - 128, MASTER_SIZE - 116)
    draw.rounded_rectangle(shadow_bounds, radius=188, fill=PANEL_SHADOW)

    panel_bounds = (146, 146, MASTER_SIZE - 146, MASTER_SIZE - 146)
    draw.rounded_rectangle(
        panel_bounds,
        radius=190,
        fill=PANEL_FILL,
        outline=PANEL_STROKE,
        width=10,
    )
    draw.rounded_rectangle(
        (166, 166, MASTER_SIZE - 166, MASTER_SIZE - 166),
        radius=170,
        outline=PANEL_HIGHLIGHT,
        width=4,
    )

    primary_font = load_font(220, bold=True)
    secondary_font = load_font(166, bold=True)
    symbol_font = load_font(78, mono=True)

    draw_text_with_shadow(draw, (214, 280), "Pcl", primary_font)
    draw_text_with_shadow(draw, (214, 504), "Aude", secondary_font)

    symbol_bounds = (696, 666, 824, 794)
    draw.rounded_rectangle(
        symbol_bounds,
        radius=34,
        fill=SYMBOL_BG,
        outline=(255, 128, 97, 230),
        width=6,
    )
    symbol_text = ">_"
    symbol_box = draw.textbbox((0, 0), symbol_text, font=symbol_font)
    symbol_width = symbol_box[2] - symbol_box[0]
    symbol_height = symbol_box[3] - symbol_box[1]
    symbol_position = (
        int((symbol_bounds[0] + symbol_bounds[2] - symbol_width) / 2),
        int((symbol_bounds[1] + symbol_bounds[3] - symbol_height) / 2 - 8),
    )
    draw.text(symbol_position, symbol_text, font=symbol_font, fill=TEXT_COLOR)

    return image


def save_pngs(master: Image.Image) -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    master.save(ICON_DIR / "icon.png")
    for size in MAC_ICONSET_SIZES:
        resized = master.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(ICON_DIR / f"icon-{size}.png")


def save_ico(master: Image.Image) -> None:
    ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    master.save(ICON_DIR / "icon.ico", sizes=ico_sizes)


def save_icns() -> None:
    master = Image.open(ICON_DIR / "icon.png")
    master.save(ICON_DIR / "icon.icns", format="ICNS")


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    for temporary_file in [ICON_DIR / "icon.icns"]:
        if temporary_file.exists():
            temporary_file.unlink()

    master = create_master_icon()
    save_pngs(master)
    save_ico(master)
    save_icns()


if __name__ == "__main__":
    main()
