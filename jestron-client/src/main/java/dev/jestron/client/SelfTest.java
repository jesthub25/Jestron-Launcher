package dev.jestron.client;

import dev.jestron.client.core.Config;
import dev.jestron.client.core.Module;
import dev.jestron.client.core.Modules;
import dev.jestron.client.gui.HudEditorScreen;
import dev.jestron.client.gui.JestronMenuScreen;
import dev.jestron.client.gui.MenuStyle;
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
    private static int step, wait, total, styleShot;

    public static void maybeStart() {
        if (!Boolean.getBoolean("jestron.selftest")) return;
        active = true;
        Config.readOnly = true;
        Minecraft mc = Minecraft.getInstance();
        mc.options.onboardAccessibility = false;
        mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
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
                // ilk açılıştaki gibi: Efekt Menüsü varsa onun da gösterdiği FPS / Ping / Koordinat kapalı kalır
                for (Module m : Modules.ALL) {
                    if (!m.toggleable()) continue;
                    boolean dup = EfektMenu.isLoaded() && (m == Modules.FPS || m == Modules.PING || m == Modules.COORDS);
                    m.setEnabled(!dup);
                }
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
                        // açık havada düz bir platform: hedef hiçbir şeyin arkasında kalmasın
                        // yaw 0 = güneye (+Z) bakış; köylü tam karşıda, göz hizasında
                        "execute as @a at @s run tp @s ~ 150 ~ 0 0",
                        "execute as @a at @s run fill ~-4 ~-1 ~-2 ~4 ~-1 ~8 minecraft:smooth_stone",
                        "execute as @a at @s run fill ~-4 ~ ~-2 ~4 ~4 ~8 minecraft:air",
                        "execute as @a at @s run summon minecraft:villager ~ ~ ~3 {NoAI:1b,Silent:1b,PersistenceRequired:1b,CustomNameVisible:1b,CustomName:'\"Hedef\"'}",
                        "damage @e[type=minecraft:villager,limit=1,sort=nearest] 6"
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
                boolean target = mc.crosshairPickEntity instanceof net.minecraft.world.entity.LivingEntity;
                JestronClient.LOG.info("[SELFTEST] nişangahta canlı var: {}", target);
                shot(mc, "3-oyun-ici-hud");
                mc.gui.getChat().addMessage(Component.literal("Jestron Client test mesajı (sohbet saati)"));
                // tuş atama ve otomatik GG tetikleyicileri
                String meName = mc.player.getGameProfile().getName();
                net.minecraft.network.chat.Component killMsg = net.minecraft.network.chat.Component.translatable("death.attack.player", net.minecraft.network.chat.Component.literal("Hedef"), mc.player.getName());
                net.minecraft.network.chat.Component deathMsg = net.minecraft.network.chat.Component.translatable("death.attack.player", mc.player.getName(), net.minecraft.network.chat.Component.literal("Hedef"));
                if (dev.jestron.client.modules.AutoGgModule.classifyDeath(killMsg, meName) != 1 || dev.jestron.client.modules.AutoGgModule.classifyDeath(deathMsg, meName) != 2) {
                    finish(mc, "FAIL: öldürme mesajı tanınmadı");
                    return;
                }
                if (!dev.jestron.client.modules.AutoGgModule.killedBy("Hedef was slain by " + meName, meName)
                        || !dev.jestron.client.modules.AutoGgModule.killedBy("Hedef, " + meName + " tarafından öldürüldü", meName)
                        || !dev.jestron.client.modules.AutoGgModule.killedBy(meName + " killed Hedef", meName)
                        || dev.jestron.client.modules.AutoGgModule.killedBy(meName + " was slain by Hedef", meName)
                        || dev.jestron.client.modules.AutoGgModule.killedBy(meName + ", Hedef tarafından öldürüldü", meName)) {
                    finish(mc, "FAIL: sunucu öldürme mesajları yanlış");
                    return;
                }
                Modules.MACROS.keys[0].bindKey(com.mojang.blaze3d.platform.InputConstants.getKey(org.lwjgl.glfw.GLFW.GLFW_KEY_F6, 0));
                if (JestronClient.MACRO_KEYS[0].getKey().getValue() != org.lwjgl.glfw.GLFW.GLFW_KEY_F6 || !Modules.MACROS.keys[0].bound()) {
                    finish(mc, "FAIL: makro tuşu atanamadı");
                    return;
                }
                JestronClient.LOG.info("[SELFTEST] Makro 1 tuşu: {}", Modules.MACROS.keys[0].display());
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
                if (mc.screen instanceof JestronMenuScreen ms) ms.openSettings(Modules.MACROS);
                wait = 15;
                step = 40;
            }
            case 40 -> {
                shot(mc, "7-makro-ayar");
                Modules.MACROS.keys[0].unbind();
                if (!JestronClient.MACRO_KEYS[0].isUnbound()) {
                    finish(mc, "FAIL: makro tuşu kaldırılamadı");
                    return;
                }
                styleShot = 0;
                step = 20;
            }
            case 20 -> {
                // 10 menü tasarımı sırayla
                Modules.APPEARANCE.style.set(styleShot);
                Modules.APPEARANCE.accent.set(0);
                JestronMenuScreen ms = new JestronMenuScreen(null);
                mc.setScreen(ms);
                if (MenuStyle.ALL[styleShot].split()) ms.openSettings(Modules.AUTO_GG);
                wait = 20;
                step = 21;
            }
            case 21 -> {
                shot(mc, String.format(java.util.Locale.ROOT, "stil-%02d", styleShot + 1));
                styleShot++;
                step = styleShot < MenuStyle.ALL.length ? 20 : 10;
                wait = 2;
            }
            case 10 -> {
                Modules.APPEARANCE.style.reset();
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
                    styleShot = 0;
                    step = 30;
                }
            }
            case 12 -> {
                shot(mc, "9-efekt-menusu");
                styleShot = 0;
                step = 30;
            }
            case 30 -> {
                // 12 ESC menüsü tasarımı: vanilla duraklatma menüsü açılır, mixin Jestron menüsüne çevirmeli
                Modules.APPEARANCE.pause.set(styleShot + 1);
                mc.setScreen(new net.minecraft.client.gui.screens.PauseScreen(true));
                wait = 20;
                step = 31;
            }
            case 31 -> {
                if (!(mc.screen instanceof dev.jestron.client.gui.JestronPauseScreen ps)) {
                    finish(mc, "FAIL: ESC menüsü değiştirilmedi: " + mc.screen);
                    return;
                }
                java.util.Set<String> ids = new java.util.HashSet<>();
                for (var it : ps.items()) ids.add(it.id());
                if (!ids.containsAll(java.util.List.of("resume", "jestron", "hud", "options", "advancements", "stats", "disconnect"))) {
                    finish(mc, "FAIL: ESC menüsü öğeleri eksik: " + ids);
                    return;
                }
                if (styleShot == 0) JestronClient.LOG.info("[SELFTEST] ESC menüsü öğeleri: {}", ids);
                shot(mc, String.format(java.util.Locale.ROOT, "esc-%02d", styleShot + 1));
                styleShot++;
                step = styleShot < dev.jestron.client.gui.PauseStyle.ALL.length ? 30 : 32;
                wait = 2;
            }
            case 32 -> {
                // menüden Ayarlar açılıp geri dönülünce yine Jestron ESC menüsü gelmeli
                Modules.APPEARANCE.pause.reset();
                mc.setScreen(new net.minecraft.client.gui.screens.PauseScreen(true));
                if (mc.screen instanceof dev.jestron.client.gui.JestronPauseScreen ps) {
                    for (var it : ps.items()) if (it.id().equals("options")) it.action().run();
                }
                wait = 10;
                step = 33;
            }
            case 33 -> {
                if (!(mc.screen instanceof net.minecraft.client.gui.screens.options.OptionsScreen)) {
                    finish(mc, "FAIL: Ayarlar açılmadı: " + mc.screen);
                    return;
                }
                mc.screen.onClose();
                wait = 10;
                step = 34;
            }
            case 34 -> {
                if (!(mc.screen instanceof dev.jestron.client.gui.JestronPauseScreen)) {
                    finish(mc, "FAIL: Ayarlardan dönünce ESC menüsü gelmedi: " + mc.screen);
                    return;
                }
                // F3+Esc (menüsüz duraklatma) vanilla kalmalı
                mc.setScreen(new net.minecraft.client.gui.screens.PauseScreen(false));
                wait = 5;
                step = 35;
            }
            case 35 -> {
                if (!(mc.screen instanceof net.minecraft.client.gui.screens.PauseScreen)) {
                    finish(mc, "FAIL: menüsüz duraklatma değiştirildi: " + mc.screen);
                    return;
                }
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
