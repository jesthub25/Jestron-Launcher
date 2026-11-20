package dev.jestron.client.modules;

import dev.jestron.client.core.Category;
import dev.jestron.client.core.Setting;
import dev.jestron.client.core.TextHud;
import net.minecraft.client.Minecraft;

public final class FpsModule extends TextHud {
    private final Setting.Bool label = add(new Setting.Bool("label", "Etiketi göster", true));

    public FpsModule() {
        super("fps", "FPS", "Saniyedeki kare sayısı.", Category.HUD, true, 0.005, 0.01);
    }

    @Override
    protected String[] lines(boolean preview) {
        int fps = Minecraft.getInstance().getFps();
        return new String[]{label.on() ? kv("FPS", String.valueOf(fps)) : fps + " FPS"};
    }
}
