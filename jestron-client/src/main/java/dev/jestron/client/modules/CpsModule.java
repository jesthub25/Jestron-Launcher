package dev.jestron.client.modules;

import dev.jestron.client.core.Category;
import dev.jestron.client.core.Setting;
import dev.jestron.client.core.TextHud;
import dev.jestron.client.util.Clicks;

public final class CpsModule extends TextHud {
    private final Setting.Bool right = add(new Setting.Bool("right", "Sağ tıkı da göster", true));

    public CpsModule() {
        super("cps", "CPS", "Saniyedeki tık sayısı (sol | sağ).", Category.HUD, true, 0.005, 0.055);
    }

    @Override
    protected String[] lines(boolean preview) {
        int l = preview && Clicks.left() == 0 ? 8 : Clicks.left();
        int r = preview && Clicks.right() == 0 ? 3 : Clicks.right();
        return new String[]{kv("CPS", right.on() ? l + " | " + r : String.valueOf(l))};
    }
}
