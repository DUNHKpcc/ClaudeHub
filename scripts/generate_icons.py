from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "build" / "icons"
MASTER_SIZE = 1024
MAC_ICONSET_SIZES = [
    16,
    32,
    64,
    128,
    256,
    512,
    1024,
]


def create_master_icon() -> Image.Image:
    image = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    background_top = (14, 33, 56, 255)
    background_bottom = (6, 16, 31, 255)
    for y in range(MASTER_SIZE):
        ratio = y / (MASTER_SIZE - 1)
        color = tuple(
            int(background_top[index] * (1 - ratio) + background_bottom[index] * ratio)
            for index in range(4)
        )
        draw.line((0, y, MASTER_SIZE, y), fill=color)

    draw.rounded_rectangle(
        (64, 64, MASTER_SIZE - 64, MASTER_SIZE - 64),
        radius=220,
        fill=(10, 24, 43, 245),
        outline=(117, 180, 255, 255),
        width=12,
    )

    glow_bounds = (128, 128, MASTER_SIZE - 128, MASTER_SIZE - 128)
    draw.rounded_rectangle(glow_bounds, radius=180, outline=(84, 153, 255, 90), width=26)

    toolbox_left = 228
    toolbox_top = 348
    toolbox_right = MASTER_SIZE - toolbox_left
    toolbox_bottom = MASTER_SIZE - 228
    toolbox_bounds = (toolbox_left, toolbox_top, toolbox_right, toolbox_bottom)
    draw.rounded_rectangle(
        toolbox_bounds,
        radius=92,
        fill=(235, 244, 255, 255),
        outline=(182, 207, 245, 255),
        width=8,
    )

    handle_width = 248
    handle_height = 108
    handle_left = (MASTER_SIZE - handle_width) / 2
    handle_top = toolbox_top - 86
    handle_right = handle_left + handle_width
    handle_bottom = handle_top + handle_height
    draw.rounded_rectangle(
        (handle_left, handle_top, handle_right, handle_bottom),
        radius=46,
        fill=(235, 244, 255, 255),
        outline=(182, 207, 245, 255),
        width=8,
    )
    inner_handle_margin = 26
    draw.rounded_rectangle(
        (
            handle_left + inner_handle_margin,
            handle_top + inner_handle_margin,
            handle_right - inner_handle_margin,
            handle_bottom + 34,
        ),
        radius=36,
        fill=(10, 24, 43, 255),
    )

    latch_width = 168
    latch_height = 32
    latch_left = (MASTER_SIZE - latch_width) / 2
    latch_top = toolbox_top + 58
    draw.rounded_rectangle(
        (latch_left, latch_top, latch_left + latch_width, latch_top + latch_height),
        radius=16,
        fill=(10, 24, 43, 255),
    )

    accent = (68, 150, 255, 255)
    accent_soft = (91, 170, 255, 255)
    wrench_points = [
        (404, 610),
        (458, 556),
        (522, 620),
        (654, 488),
        (636, 438),
        (686, 388),
        (742, 404),
        (782, 364),
        (742, 324),
        (702, 364),
        (718, 420),
        (668, 470),
        (618, 452),
        (486, 584),
        (550, 648),
        (496, 702),
    ]
    draw.polygon(wrench_points, fill=accent)
    draw.ellipse((338, 544, 468, 674), fill=accent)
    draw.ellipse((372, 578, 434, 640), fill=(235, 244, 255, 255))

    screwdriver_handle = [(318, 714), (396, 636), (454, 694), (376, 772)]
    draw.polygon(screwdriver_handle, fill=accent_soft)
    draw.rounded_rectangle((454, 526, 496, 696), radius=20, fill=accent_soft)
    draw.polygon([(496, 526), (574, 448), (604, 478), (526, 556)], fill=accent_soft)

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
    iconset_dir = ICON_DIR / "pclaude.iconset"
    if iconset_dir.exists():
        shutil.rmtree(iconset_dir)
    for temporary_file in [ICON_DIR / "test.icns", ICON_DIR / "icon.icns"]:
        if temporary_file.exists():
            temporary_file.unlink()

    master = create_master_icon()
    save_pngs(master)
    save_ico(master)
    save_icns()


if __name__ == "__main__":
    main()
