package dev.jestron.client;

import dev.jestron.client.core.Config;
import dev.jestron.client.core.Module;
import dev.jestron.client.core.Modules;
import dev.jestron.client.gui.HudEditorScreen;
import dev.jestron.client.gui.JestronMenuScreen;
import dev.jestron.client.integration.EfektMenu;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.worldselection.CreateWorldScreen;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.network.chat.Component;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Sadece CI'da (-Djestron.selftest=true) çalışır: gerçek oyunda menüyü, HUD düzenleyiciyi,
 * yeni bir dünyada HUD öğelerini, sohbeti ve ayar ekranlarını açar, ekran görüntüsü alır ve
 * oyunu kapatır. Sonuç run/jestron-selftest.txt dosyasına yazılır.
 */
public final class SelfTest {
    private SelfTest() {
    }

    private static boolean active;
    private static int step, wait, total;

    public static void maybeStart() {
        if (!Boolean.getBoolean("jestron.selftest")) return;
        active = true;
        Config.readOnly = true;
        Minecraft mc = Minecraft.getInstance();
        mc.options.onboardAccessibility = false;
        JestronClient.LOG.info("[SELFTEST] başladı");
    }

    public static void tick(Minecraft mc) {
        if (!active) return;
        total++;
        if (total > 20 * 60 * 8) {
            finish(mc, "FAIL: zaman aşımı (adım " + step + ")");
            return;
        }
        if (wait > 0) {
            wait--;
            return;
        }
        try {
            run(mc);
        } catch (Throwable t) {
            JestronClient.LOG.error("[SELFTEST] adım {} hata", step, t);
            finish(mc, "FAIL: adım " + step + " -> " + t);
        }
    }

    private static void run(Minecraft mc) {
        switch (step) {
            case 0 -> {
                if (mc.getOverlay() != null) return; // kaynaklar yükleniyor
                wait = 60;
                step = 1;
            }
            case 1 -> {
                mc.setScreen(new JestronMenuScreen(mc.screen));
                wait = 30;
                step = 2;
            }
            case 2 -> {
                shot(mc, "1-menu");
                for (Module m : Modules.ALL) if (m.toggleable()) m.setEnabled(true);
                Modules.NAMETAG_HEALTH.settings().stream().filter(s -> s.key.equals("mobs"))
                        .forEach(s -> ((dev.jestron.client.core.Setting.Bool) s).set(true));
                mc.setScreen(new HudEditorScreen(null));
                wait = 30;
                step = 3;
            }
            case 3 -> {
                shot(mc, "2-hud-duzenleyici");
                CreateWorldScreen.openFresh(mc, null);
                step = 4;
            }
            case 4 -> {
                if (!(mc.screen instanceof CreateWorldScreen cws)) return;
                String label = Component.translatable("selectWorld.create").getString();
                for (GuiEventListener l : cws.children()) {
                    if (l instanceof Button b && b.getMessage().getString().equals(label)) {
                        b.onPress();
                        step = 5;
                        return;
                    }
                }
                throw new IllegalStateException("Dünya oluştur düğmesi bulunamadı");
            }
            case 5 -> {
                if (mc.level == null || mc.player == null || mc.screen != null) return;
                IntegratedServer server = mc.getSingleplayerServer();
                if (server == null) return;
                String[] cmds = {
                        "difficulty peaceful", "time set noon", "weather clear", "gamerule doDaylightCycle false",
                        "item replace entity @a armor.head with minecraft:diamond_helmet",
                        "item replace entity @a armor.chest with minecraft:iron_chestplate[damage=230]",
                        "item replace entity @a armor.legs with minecraft:diamond_leggings",
                        "item replace entity @a armor.feet with minecraft:diamond_boots",
                        "item replace entity @a weapon.mainhand with minecraft:diamond_sword",
                        "execute as @a at @s run summon minecraft:villager ^ ^ ^3 {NoAI:1b,Silent:1b,PersistenceRequired:1b,CustomNameVisible:1b,CustomName:'\"Hedef\"'}",
                        "damage @e[type=minecraft:villager,limit=1,sort=nearest] 6",
                        "execute as @a at @s run tp @s ~ ~ ~ facing entity @e[type=minecraft:villager,limit=1,sort=nearest] eyes"
                };
                server.execute(() -> {
                    for (String c : cmds) {
                        try {
                            server.getCommands().performPrefixedCommand(server.createCommandSourceStack(), c);
                        } catch (Throwable t) {
                            JestronClient.LOG.warn("[SELFTEST] komut başarısız: {}", c, t);
                        }
                    }
                });
                wait = 140;
                step = 6;
            }
            case 6 -> {
                shot(mc, "3-oyun-ici-hud");
                mc.gui.getChat().addMessage(Component.literal("Jestron Client test mesajı (sohbet saati)"));
                boolean fired = Modules.AUTO_GG.check("Tebrikler, oyunu KAZANDIN!");
                JestronClient.LOG.info("[SELFTEST] Otomatik GG tetiklendi: {}", fired);
                wait = 80;
                step = 7;
            }
            case 7 -> {
                shot(mc, "4-sohbet-ve-gg");
                mc.setScreen(new JestronMenuScreen(null));
                wait = 30;
                step = 8;
            }
            case 8 -> {
                shot(mc, "5-menu-oyun-ici");
                if (mc.screen instanceof JestronMenuScreen ms) ms.openSettings(Modules.AUTO_GG);
                wait = 20;
                step = 9;
            }
            case 9 -> {
                shot(mc, "6-ayarlar");
                Modules.APPEARANCE.menu.set(1);
                Modules.APPEARANCE.accent.set(2);
                mc.setScreen(new JestronMenuScreen(null));
                wait = 20;
                step = 10;
            }
            case 10 -> {
                shot(mc, "7-koyu-tema");
                Modules.APPEARANCE.menu.set(0);
                Modules.APPEARANCE.accent.set(0);
                mc.setScreen(new HudEditorScreen(null));
                wait = 30;
                step = 11;
            }
            case 11 -> {
                shot(mc, "8-hud-duzenleyici-oyun-ici");
                if (EfektMenu.isLoaded()) {
                    EfektMenu.open(null);
                    wait = 40;
                    step = 12;
                } else {
                    step = 13;
                }
            }
            case 12 -> {
                shot(mc, "9-efekt-menusu");
                step = 13;
            }
            case 13 -> {
                mc.setScreen(null);
                finish(mc, "OK");
            }
            default -> finish(mc, "FAIL: bilinmeyen adım");
        }
    }

    private static void shot(Minecraft mc, String name) {
        Screenshot.grab(mc.gameDirectory, "jestron-" + name + ".png", mc.getMainRenderTarget(), msg -> {
        });
        JestronClient.LOG.info("[SELFTEST] ekran görüntüsü: {}", name);
    }

    private static void finish(Minecraft mc, String result) {
        active = false;
        try {
            Files.writeString(Path.of(mc.gameDirectory.getAbsolutePath(), "jestron-selftest.txt"), result, StandardCharsets.UTF_8);
        } catch (Exception e) {
            JestronClient.LOG.error("[SELFTEST] sonuç yazılamadı", e);
        }
        JestronClient.LOG.info("[SELFTEST] SONUÇ: {}", result);
        mc.stop();
    }
}
