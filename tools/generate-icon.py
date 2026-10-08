"""Generate the small Lezu Windows icon from a simple vector-like shape."""

from pathlib import Path
from PIL import Image, ImageDraw

size = 512
out = Path(__file__).resolve().parents[1] / "src-tauri" / "icons"
out.mkdir(parents=True, exist_ok=True)
image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((24, 24, 488, 488), radius=105, fill="#121c18")
draw.rounded_rectangle((75, 75, 437, 437), radius=75, fill="#dceacc")
draw.polygon(((191, 135), (259, 135), (259, 302), (360, 302), (360, 372), (191, 372)), fill="#182a21")
image.resize((128, 128), Image.Resampling.LANCZOS).save(out / "128x128.png")
image.resize((32, 32), Image.Resampling.LANCZOS).save(out / "32x32.png")
image.save(out / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
