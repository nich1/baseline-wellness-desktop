"""Crop the original wordmark and remove its dark matte without redrawing it."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[3]
source = root / 'frontend/public/baseline-logo.png'
output = root / 'frontend/public/baseline-logo-transparent.png'
original = Image.open(source).convert('RGB')
# The BASELINE wordmark ends at y=874; the separate tagline starts below y=920.
cropped = original.crop((0, 0, original.width, 900))
pixels = cropped.load()
clean = Image.new('RGBA', cropped.size)
result = clean.load()
for y in range(cropped.height):
    for x in range(cropped.width):
        rgb = pixels[x, y]
        peak = max(rgb)
        if peak <= 32:
            continue
        if peak >= 180:
            result[x, y] = (*rgb, 255)
            continue
        # Recover antialiased edge color from the nearest solid logo pixel.
        # Removing the dark matte here avoids a dark fringe on light surfaces.
        reference = None
        for radius in range(1, 5):
            candidates = []
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    if max(abs(dx), abs(dy)) != radius:
                        continue
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < cropped.width and 0 <= yy < cropped.height and max(pixels[xx, yy]) >= 180:
                        candidates.append((dx * dx + dy * dy, pixels[xx, yy]))
            if candidates:
                reference = min(candidates, key=lambda item: item[0])[1]
                break
        if reference:
            alpha = min(1, (peak - 12) / (max(reference) - 12))
            unmatte = tuple(max(0, min(255, round((channel - 12 * (1 - alpha)) / alpha))) for channel in rgb)
            result[x, y] = (*unmatte, round(alpha * 255))

bounds = clean.getbbox()
assert bounds is not None
logo = clean.crop(bounds)
final = Image.new('RGBA', (logo.width + 24, logo.height + 24))
final.paste(logo, (12, 12))
final.save(output, optimize=True)
print(f'{output}: {final.size}, {final.mode}; original bounds: {bounds}')
# Temporary light/dark review sheet; not an application asset.
preview = Image.new('RGB', (final.width, final.height * 2))
for i, color in enumerate(('#111113', '#ededed')):
    background = Image.new('RGBA', final.size, color)
    background.alpha_composite(final)
    preview.paste(background.convert('RGB'), (0, i * final.height))
preview.save('/tmp/baseline-logo-review.png')
