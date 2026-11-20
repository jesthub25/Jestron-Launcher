package dev.jestron.client.mixin;

import dev.jestron.client.core.Hud;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.GuiGraphics;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** HUD öğeleri tüm arayüzün üstünde çizilir (F1 ile gizlenir, HUD düzenleyici açıkken çizilmez). */
@Mixin(Gui.class)
public abstract class GuiMixin {
    @Inject(method = "render", at = @At("TAIL"))
    private void jestron$hud(GuiGraphics g, DeltaTracker delta, CallbackInfo ci) {
        try {
            Minecraft mc = Minecraft.getInstance();
            if (mc.options.hideGui || mc.player == null) return;
            if (mc.screen instanceof dev.jestron.client.gui.HudEditorScreen) return;
            g.pose().pushPose();
            g.pose().translate(0f, 0f, 850f);
            try {
                Hud.renderAll(g);
            } finally {
                g.pose().popPose();
            }
        } catch (Throwable ignored) {
        }
    }
}
