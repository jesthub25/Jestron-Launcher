package dev.jestron.client.integration;

import dev.jestron.client.JestronClient;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/**
 * Jestron'un Efekt Menüsü modu (JestronPriv) kuruluysa onun ana menüsünü açar.
 * Derleme bağımlılığı yoktur: sınıf çalışırken yansıma ile bulunur, bulunamazsa sadece uyarı verilir.
 */
public final class EfektMenu {
    private EfektMenu() {
    }

    private static final String MOD_ID = "jestronpriv";
    private static final String SCREEN = "com.jestron.jestronpriv.client.gui.MainMenuScreen";

    public static boolean isLoaded() {
        return FabricLoader.getInstance().isModLoaded(MOD_ID);
    }

    public static void open(Screen from) {
        Minecraft mc = Minecraft.getInstance();
        if (!isLoaded()) {
            notify(mc, "Efekt Menüsü kurulu değil. Jestron Launcher › Modlar'dan açabilirsin.");
            return;
        }
        try {
            Class<?> c = Class.forName(SCREEN);
            Object s = c.getDeclaredConstructor().newInstance();
            if (s instanceof Screen screen) {
                mc.setScreen(screen);
                return;
            }
        } catch (Throwable t) {
            JestronClient.LOG.warn("Efekt Menüsü açılamadı", t);
        }
        notify(mc, "Efekt Menüsü açılamadı; kendi tuşunu (varsayılan K) kullan.");
    }

    private static void notify(Minecraft mc, String msg) {
        if (mc.player != null) mc.player.displayClientMessage(Component.literal("[Jestron] " + msg), false);
        else JestronClient.LOG.info(msg);
    }
}
