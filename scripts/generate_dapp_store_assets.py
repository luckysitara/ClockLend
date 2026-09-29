#!/usr/bin/env python3
"""
Generate promotional assets for Seeker dApp Store submission:
1. icon-512x512.png (512x512px, solid background)
2. banner-1200x600.png (1200x600px hero banner)
3. graphics-1200x1200px.png (1200x1200px promo graphic)
"""

import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

OUTPUT_DIR = "mobile/assets/dapp-store"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Font paths
FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

def get_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

def create_radial_gradient_bg(width, height, centers_colors):
    """
    Generate a sleek dark gradient background with colored radial ambient glows.
    centers_colors: list of (x, y, radius, (r, g, b, intensity))
    """
    # Base dark gradient from top #0a0e1c to bottom #05070e
    y_coords = np.linspace(0, 1, height)[:, None]
    top_color = np.array([12, 18, 36], dtype=np.float32)
    bot_color = np.array([5, 7, 14], dtype=np.float32)
    base_bg = (1 - y_coords) * top_color + y_coords * bot_color
    base_img = np.tile(base_bg[:, None, :], (1, width, 1))

    # Add radial glows
    y, x = np.ogrid[:height, :width]
    for cx, cy, rad, (r, g, b, alpha) in centers_colors:
        dist_sq = (x - cx)**2 + (y - cy)**2
        mask = np.clip(1.0 - np.sqrt(dist_sq) / rad, 0, 1)
        # smoothstep
        mask = mask * mask * (3 - 2 * mask) * alpha
        glow_color = np.array([r, g, b], dtype=np.float32)
        base_img += mask[:, :, None] * glow_color

    base_img = np.clip(base_img, 0, 255).astype(np.uint8)
    return Image.fromarray(base_img, mode='RGB')

def draw_card(draw, box, fill=(16, 22, 42, 220), outline=(255, 255, 255, 24), radius=16):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=1)

def generate_icon_512():
    print("Generating 512x512 App Icon...")
    icon = Image.open('mobile/assets/icon.png').convert('RGBA')
    bg = Image.new('RGB', (1024, 1024), '#0C1435')
    bg.paste(icon, (0, 0), icon)
    icon_512 = bg.resize((512, 512), Image.Resampling.LANCZOS)
    out_path = os.path.join(OUTPUT_DIR, "icon-512x512.png")
    icon_512.save(out_path, "PNG", optimize=True)
    print(f"Saved: {out_path} ({icon_512.size})")

def generate_banner_1200x600():
    print("Generating 1200x600 Banner...")
    width, height = 1200, 600
    
    # Ambient glows: Solana Purple (#9945FF -> 153, 69, 255), Solana Green (#14F195 -> 20, 241, 149), Cyan
    glows = [
        (150, 100, 450, (153, 69, 255, 0.28)),
        (1050, 480, 500, (20, 241, 149, 0.22)),
        (650, 250, 400, (6, 182, 212, 0.15)),
    ]
    bg = create_radial_gradient_bg(width, height, glows).convert('RGBA')
    overlay = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Grid lines subtle
    grid_color = (255, 255, 255, 8)
    for x in range(0, width, 40):
        draw.line([(x, 0), (x, height)], fill=grid_color, width=1)
    for y in range(0, height, 40):
        draw.line([(0, y), (width, y)], fill=grid_color, width=1)

    # Left Section: Branding & Titles
    # Eyebrow Pill
    draw.rounded_rectangle([70, 75, 410, 110], radius=18, fill=(153, 69, 255, 40), outline=(153, 69, 255, 120), width=1)
    font_badge = get_font(FONT_BOLD, 14)
    draw.text((88, 85), "⚡  BUILT FOR SOLANA SEEKER", font=font_badge, fill=(20, 241, 149, 255))

    # App Logo (Small near title)
    logo = Image.open('mobile/assets/logo.png').convert('RGBA')
    logo_small = logo.resize((84, 84), Image.Resampling.LANCZOS)
    overlay.paste(logo_small, (70, 135), logo_small)

    # Main Title
    font_title = get_font(FONT_BOLD, 68)
    draw.text((170, 138), "ClockLend", font=font_title, fill=(248, 250, 252, 255))

    # Subtitle / Tagline
    font_sub = get_font(FONT_BOLD, 26)
    draw.text((70, 240), "P2P Micro-Lending & Social Pawns", font=font_sub, fill=(20, 241, 149, 255))

    font_body = get_font(FONT_REGULAR, 18)
    draw.text((70, 285), "Instant non-custodial micro-credit powered by Solana Seeker.", font=font_body, fill=(148, 163, 184, 255))
    draw.text((70, 312), "Zero float math. Verified PDA escrows. Hardware Seed Vault.", font=font_body, fill=(148, 163, 184, 255))

    # Feature Pill Badges
    pills = [
        ("⚡ 1-Tap Express Desk", (139, 92, 246, 50), (139, 92, 246, 160)),
        ("🏦 Circle Liquidity", (6, 182, 212, 50), (6, 182, 212, 160)),
        ("💎 SKR Yield Engine", (20, 241, 149, 50), (20, 241, 149, 160)),
        ("🛡️ 24h Social Grace", (245, 158, 11, 50), (245, 158, 11, 160)),
    ]
    px = 70
    font_pill = get_font(FONT_BOLD, 15)
    for text, fill_c, stroke_c in pills:
        bbox = font_pill.getbbox(text)
        pw = (bbox[2] - bbox[0]) + 28
        draw.rounded_rectangle([px, 365, px + pw, 405], radius=12, fill=fill_c, outline=stroke_c, width=1)
        draw.text((px + 14, 375), text, font=font_pill, fill=(248, 250, 252, 240))
        px += pw + 12

    # Stats Bottom Row
    stats = [
        ("100%", "Rust SBF Escrow"),
        ("< 1s", "Atomic Settlement"),
        ("90% LTV", "SKR Reputation"),
    ]
    sx = 70
    font_stat_val = get_font(FONT_BOLD, 24)
    font_stat_lbl = get_font(FONT_REGULAR, 13)
    for val, lbl in stats:
        draw.text((sx, 445), val, font=font_stat_val, fill=(20, 241, 149, 255))
        draw.text((sx, 475), lbl, font=font_stat_lbl, fill=(148, 163, 184, 255))
        sx += 160

    # Right Section: Visual Showcase Card
    card_x1, card_y1, card_x2, card_y2 = 680, 80, 1130, 520
    # Card glow shadow
    draw.rounded_rectangle([card_x1 - 2, card_y1 - 2, card_x2 + 2, card_y2 + 2], radius=26, fill=(153, 69, 255, 30))
    draw_card(draw, [card_x1, card_y1, card_x2, card_y2], fill=(12, 17, 34, 235), outline=(255, 255, 255, 35), radius=24)

    # Card Header
    draw.rounded_rectangle([card_x1 + 25, card_y1 + 25, card_x1 + 175, card_y1 + 55], radius=15, fill=(20, 241, 149, 30), outline=(20, 241, 149, 100))
    font_card_tag = get_font(FONT_BOLD, 13)
    draw.text((card_x1 + 38, card_y1 + 33), "EXPRESS BORROW", font=font_card_tag, fill=(20, 241, 149, 255))

    draw.text((card_x2 - 145, card_y1 + 33), "SOLANA SEEKER", font=font_card_tag, fill=(148, 163, 184, 200))

    # Token Swap / Borrow visual
    # Box 1: Collateral
    draw.rounded_rectangle([card_x1 + 25, card_y1 + 75, card_x2 - 25, card_y1 + 170], radius=16, fill=(18, 24, 46, 255), outline=(255, 255, 255, 20))
    font_card_lbl = get_font(FONT_REGULAR, 14)
    draw.text((card_x1 + 45, card_y1 + 92), "You Deposit Collateral", font=font_card_lbl, fill=(148, 163, 184, 255))
    font_card_big = get_font(FONT_BOLD, 28)
    draw.text((card_x1 + 45, card_y1 + 120), "2.50 SOL", font=font_card_big, fill=(248, 250, 252, 255))

    # Token icons
    if os.path.exists('site/assets/sol.png'):
        sol_icon = Image.open('site/assets/sol.png').convert('RGBA').resize((44, 44), Image.Resampling.LANCZOS)
        overlay.paste(sol_icon, (card_x2 - 80, card_y1 + 100), sol_icon)

    # Arrow Down
    draw.rounded_rectangle([card_x1 + 205, card_y1 + 178, card_x1 + 245, card_y1 + 218], radius=20, fill=(153, 69, 255, 180))
    font_arrow = get_font(FONT_BOLD, 18)
    draw.text((card_x1 + 218, card_y1 + 187), "↓", font=font_arrow, fill=(255, 255, 255, 255))

    # Box 2: Borrowed USDC
    draw.rounded_rectangle([card_x1 + 25, card_y1 + 225, card_x2 - 25, card_y1 + 320], radius=16, fill=(18, 24, 46, 255), outline=(20, 241, 149, 60))
    draw.text((card_x1 + 45, card_y1 + 242), "Instant Micro-Loan Disbursed", font=font_card_lbl, fill=(20, 241, 149, 255))
    draw.text((card_x1 + 45, card_y1 + 270), "350.00 USDC", font=font_card_big, fill=(20, 241, 149, 255))

    if os.path.exists('site/assets/usdc.png'):
        usdc_icon = Image.open('site/assets/usdc.png').convert('RGBA').resize((44, 44), Image.Resampling.LANCZOS)
        overlay.paste(usdc_icon, (card_x2 - 80, card_y1 + 250), usdc_icon)

    # Info summary row
    draw.text((card_x1 + 45, card_y1 + 345), "Repayment Window:", font=font_card_lbl, fill=(148, 163, 184, 255))
    draw.text((card_x2 - 130, card_y1 + 345), "14 Days", font=get_font(FONT_BOLD, 14), fill=(248, 250, 252, 255))

    draw.text((card_x1 + 45, card_y1 + 375), "Security Guarantee:", font=font_card_lbl, fill=(148, 163, 184, 255))
    draw.text((card_x2 - 165, card_y1 + 375), "Hardware Seed Vault", font=get_font(FONT_BOLD, 14), fill=(20, 241, 149, 255))

    # Action Button in Card
    draw.rounded_rectangle([card_x1 + 25, card_y2 - 65, card_x2 - 25, card_y2 - 20], radius=14, fill=(20, 241, 149, 255))
    font_btn = get_font(FONT_BOLD, 16)
    draw.text((card_x1 + 130, card_y2 - 50), "Borrow in 1 Tap ⚡", font=font_btn, fill=(7, 10, 20, 255))

    # Composite & Save
    final_img = Image.alpha_composite(bg, overlay).convert('RGB')
    out_path = os.path.join(OUTPUT_DIR, "banner-1200x600.png")
    final_img.save(out_path, "PNG", optimize=True)
    print(f"Saved: {out_path} ({final_img.size})")

def generate_graphics_1200x1200():
    print("Generating 1200x1200 Promo Graphic...")
    width, height = 1200, 1200

    glows = [
        (250, 250, 600, (153, 69, 255, 0.30)),
        (950, 950, 650, (20, 241, 149, 0.25)),
        (600, 600, 500, (6, 182, 212, 0.18)),
    ]
    bg = create_radial_gradient_bg(width, height, glows).convert('RGBA')
    overlay = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Subtle grid
    grid_color = (255, 255, 255, 8)
    for x in range(0, width, 40):
        draw.line([(x, 0), (x, height)], fill=grid_color, width=1)
    for y in range(0, height, 40):
        draw.line([(0, y), (width, y)], fill=grid_color, width=1)

    # Top Header: Badge & Logo
    draw.rounded_rectangle([420, 60, 780, 105], radius=22, fill=(153, 69, 255, 45), outline=(153, 69, 255, 140), width=1)
    font_badge = get_font(FONT_BOLD, 16)
    draw.text((448, 73), "⚡ SOLANA SEEKER DAPP STORE", font=font_badge, fill=(20, 241, 149, 255))

    # App Logo
    logo = Image.open('mobile/assets/logo.png').convert('RGBA')
    logo_med = logo.resize((150, 150), Image.Resampling.LANCZOS)
    overlay.paste(logo_med, (525, 130), logo_med)

    # App Name
    font_title = get_font(FONT_BOLD, 64)
    draw.text((435, 295), "ClockLend", font=font_title, fill=(248, 250, 252, 255))

    # Tagline
    font_tagline = get_font(FONT_BOLD, 26)
    draw.text((310, 375), "The Bybit P2P for Micro-Lending on Solana", font=font_tagline, fill=(20, 241, 149, 255))

    font_sub = get_font(FONT_REGULAR, 20)
    draw.text((270, 420), "Algorithmic P2P Credit  •  Merchant Liquidity Desks  •  Social Pawns", font=font_sub, fill=(148, 163, 184, 255))

    # 4 Modular Feature Cards (2x2 Grid)
    cards = [
        {
            "icon": "⚡",
            "title": "1-Tap Express Match",
            "desc": "Algorithmic router selects the lowest-APR liquidity desk across Solana. Instant USDC disbursement in under 1 second.",
            "color": (139, 92, 246)
        },
        {
            "icon": "🏦",
            "title": "Merchant Desks",
            "desc": "Deploy solo or community circle pools. Set custom interest rates, duration rules, and earn non-custodial protocol yield.",
            "color": (6, 182, 212)
        },
        {
            "icon": "💎",
            "title": "SKR Reputation Engine",
            "desc": "Stake SKR to unlock 90% LTV, up to 50% APR interest fee discounts, and direct real-yield USDC fee dividend distribution.",
            "color": (20, 241, 149)
        },
        {
            "icon": "🛡️",
            "title": "Hardware Integrity",
            "desc": "Protected by Solana Seeker Seed Vault, MWA 2.0 biometric signing, Android FLAG_SECURE screen shielding & zero float math.",
            "color": (245, 158, 11)
        }
    ]

    card_positions = [
        (100, 490, 570, 750),
        (630, 490, 1100, 750),
        (100, 790, 570, 1050),
        (630, 790, 1100, 1050)
    ]

    font_card_t = get_font(FONT_BOLD, 24)
    font_card_d = get_font(FONT_REGULAR, 17)

    for data, (x1, y1, x2, y2) in zip(cards, card_positions):
        cr, cg, cb = data["color"]
        # Glow border
        draw.rounded_rectangle([x1 - 1, y1 - 1, x2 + 1, y2 + 1], radius=22, fill=(cr, cg, cb, 25))
        draw_card(draw, [x1, y1, x2, y2], fill=(13, 18, 36, 230), outline=(cr, cg, cb, 90), radius=20)

        # Icon badge
        draw.rounded_rectangle([x1 + 25, y1 + 25, x1 + 75, y1 + 75], radius=14, fill=(cr, cg, cb, 50), outline=(cr, cg, cb, 140), width=1)
        draw.text((x1 + 38, y1 + 35), data["icon"], font=get_font(FONT_BOLD, 22), fill=(255, 255, 255, 255))

        # Title
        draw.text((x1 + 90, y1 + 36), data["title"], font=font_card_t, fill=(248, 250, 252, 255))

        # Description wrapped
        words = data["desc"].split()
        lines = []
        cur_line = []
        for w in words:
            cur_line.append(w)
            if len(" ".join(cur_line)) > 38:
                lines.append(" ".join(cur_line[:-1]))
                cur_line = [w]
        if cur_line:
            lines.append(" ".join(cur_line))

        ly = y1 + 95
        for line in lines:
            draw.text((x1 + 28, ly), line, font=font_card_d, fill=(148, 163, 184, 255))
            ly += 26

    # Bottom Token Bar
    bar_y = 1090
    draw.rounded_rectangle([100, bar_y, 1100, bar_y + 70], radius=18, fill=(10, 14, 28, 240), outline=(255, 255, 255, 25))

    font_tokens_lbl = get_font(FONT_BOLD, 17)
    draw.text((135, bar_y + 24), "Supported Protocol Assets:", font=font_tokens_lbl, fill=(148, 163, 184, 255))

    tx = 440
    for name, icon_path, color in [("SOL", "site/assets/sol.png", (153, 69, 255)),
                                   ("USDC", "site/assets/usdc.png", (6, 182, 212)),
                                   ("SKR", "site/assets/skr.png", (20, 241, 149))]:
        if os.path.exists(icon_path):
            t_icon = Image.open(icon_path).convert('RGBA').resize((36, 36), Image.Resampling.LANCZOS)
            overlay.paste(t_icon, (tx, bar_y + 17), t_icon)
        draw.text((tx + 46, bar_y + 24), name, font=get_font(FONT_BOLD, 18), fill=color)
        tx += 140

    draw.text((910, bar_y + 24), "MWA 2.0 Verified", font=get_font(FONT_BOLD, 16), fill=(20, 241, 149, 255))

    final_img = Image.alpha_composite(bg, overlay).convert('RGB')
    out_path = os.path.join(OUTPUT_DIR, "graphics-1200x1200.png")
    final_img.save(out_path, "PNG", optimize=True)
    print(f"Saved: {out_path} ({final_img.size})")

if __name__ == "__main__":
    generate_icon_512()
    generate_banner_1200x600()
    generate_graphics_1200x1200()
    print("All dApp store assets successfully generated in:", OUTPUT_DIR)
