package dev.jestron.client.modules;

import dev.jestron.client.core.Category;
import dev.jestron.client.core.TextHud;

public final class MemoryModule extends TextHud {
    public MemoryModule() {
        super("memory", "Bellek", "Oyunun kullandığı RAM.", Category.HUD, false, 0.80, 0.445);
    }

    @Override
    protected String[] lines(boolean preview) {
        Runtime rt = Runtime.getRuntime();
        long max = rt.maxMemory(), used = rt.totalMemory() - rt.freeMemory();
        long pct = max > 0 ? used * 100 / max : 0;
        return new String[]{kv("Bellek", (used >> 20) + "/" + (max >> 20) + " MB (%" + pct + ")")};
    }
}
