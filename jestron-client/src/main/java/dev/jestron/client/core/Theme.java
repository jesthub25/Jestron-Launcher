package dev.jestron.client.core;

import dev.jestron.client.modules.AppearanceModule;

/** Menü ve HUD renkleri. Varsayılan: launcher ile aynı "Minimal Açık" görünüm. */
public final class Theme {
    private Theme() {
    }

    public static final String[] ACCENT_NAMES = {"Mürekkep", "Turuncu", "Mavi", "Yeşil", "Mor", "Pembe"};
    private static final int[] ACCENTS = {0xFF18181B, 0xFFEA580C, 0xFF2563EB, 0xFF16A34A, 0xFF7C3AED, 0xFFDB2777};

    private static AppearanceModule app() {
        return Modules.APPEARANCE;
    }

    public static boolean dark() {
        return app().menu.index() == 1;
    }

    public static boolean inkAccent() {
        return app().accent.index() == 0;
    }

    public static int accent() {
        int a = ACCENTS[app().accent.index()];
        return inkAccent() && dark() ? 0xFFF4F4F5 : a;
    }

    public static int onAccent() {
        return inkAccent() && dark() ? 0xFF18181B : 0xFFFFFFFF;
    }

    public static int accentPreview(int index) {
        return ACCENTS[Math.max(0, Math.min(ACCENTS.length - 1, index))];
    }

    // menü
    public static int overlay() {
        return dark() ? 0x99000000 : 0x66000000;
    }

    public static int panel() {
        return dark() ? 0xF7111114 : 0xF8FAFAFA;
    }

    public static int sidebar() {
        return dark() ? 0xFF18181B : 0xFFF4F4F5;
    }

    public static int card() {
        return dark() ? 0xFF1C1C20 : 0xFFFFFFFF;
    }

    public static int cardHover() {
        return dark() ? 0xFF24242A : 0xFFF4F4F5;
    }

    public static int border() {
        return dark() ? 0xFF2E2E33 : 0xFFE4E4E7;
    }

    public static int text() {
        return dark() ? 0xFFF4F4F5 : 0xFF18181B;
    }

    public static int muted() {
        return dark() ? 0xFFA1A1AA : 0xFF52525B;
    }

    public static int track() {
        return dark() ? 0xFF3F3F46 : 0xFFD4D4D8;
    }

    // HUD (her zaman koyu yarı saydam zemin üstünde)
    public static boolean hudBackground() {
        return app().hudBg.on();
    }

    public static boolean hudShadow() {
        return app().hudShadow.on();
    }

    public static int hudValue() {
        return 0xFFFFFFFF;
    }

    public static int hudLabel() {
        if (app().hudColor.index() == 1 && !inkAccent()) return ACCENTS[app().accent.index()] | 0xFF000000;
        return 0xFFB4B4BC;
    }

    public static int hudAccent() {
        return inkAccent() ? 0xFFFFFFFF : ACCENTS[app().accent.index()];
    }
}
