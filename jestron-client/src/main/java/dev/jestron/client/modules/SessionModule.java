package dev.jestron.client.modules;

import dev.jestron.client.core.Category;
import dev.jestron.client.core.TextHud;
import dev.jestron.client.util.TextUtil;
import net.minecraft.client.Minecraft;

public final class SessionModule extends TextHud {
    /** Dünyaya / sunucuya girildiği an (JestronClient ayarlar). */
    public static long joinedAt;

    public SessionModule() {
        super("session", "Oturum süresi", "Bu dünyada / sunucuda geçen süre.", Category.HUD, false, 0.80, 0.535);
    }

    @Override
    protected String[] lines(boolean preview) {
        if (Minecraft.getInstance().player == null || joinedAt == 0) return preview ? new String[]{kv("Oturum", "12:34")} : new String[0];
        return new String[]{kv("Oturum", TextUtil.duration(System.currentTimeMillis() - joinedAt))};
    }
}
