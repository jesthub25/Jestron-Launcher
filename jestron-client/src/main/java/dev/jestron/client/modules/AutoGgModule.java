package dev.jestron.client.modules;

import dev.jestron.client.core.Category;
import dev.jestron.client.core.Module;
import dev.jestron.client.core.Setting;
import dev.jestron.client.util.ChatSender;
import dev.jestron.client.util.TextUtil;

import java.util.List;

/** Oyun bitince (tetikleyici kelime gelince) otomatik "gg" yazar. Bekleme süresiyle spam yapmaz. */
public final class AutoGgModule extends Module {
    private final Setting.Text message = add(new Setting.Text("message", "Mesaj", "gg", 100));
    private final Setting.Text triggers = add(new Setting.Text("triggers", "Tetikleyiciler (virgülle)",
            "kazandın,kazandı,kazanan,oyun bitti,victory,winner,you won,game over", 256));
    private final Setting.Num cooldown = add(new Setting.Num("cooldown", "Bekleme süresi", 15, 5, 120, 5, " sn"));
    private final Setting.Num delay = add(new Setting.Num("delay", "Gönderme gecikmesi", 1, 0, 5, 0.5, " sn"));
    private final Setting.Bool playerChat = add(new Setting.Bool("playerChat", "Oyuncu mesajlarında da tetiklensin", false));

    private long lastFired;
    private int pendingTicks = -1;

    public AutoGgModule() {
        super("autogg", "Otomatik GG", "Oyun bitince otomatik gg yazar.", Category.CHAT, false);
    }

    public void onGameMessage(String plain) {
        check(plain);
    }

    public void onPlayerMessage(String plain) {
        if (playerChat.on()) check(plain);
    }

    /** Tetikleyici eşleşirse gönderimi planlar. */
    public boolean check(String plain) {
        if (!isEnabled() || plain == null || message.get().isBlank()) return false;
        long now = System.currentTimeMillis();
        if (now - lastFired < cooldown.d() * 1000) return false;
        String n = TextUtil.norm(plain);
        List<String> list = TextUtil.splitList(triggers.get());
        for (String t : list) {
            if (n.contains(t)) {
                lastFired = now;
                pendingTicks = (int) Math.round(delay.d() * 20);
                return true;
            }
        }
        return false;
    }

    @Override
    public void tick() {
        if (pendingTicks < 0) return;
        if (pendingTicks-- == 0) {
            ChatSender.send(message.get(), false);
            pendingTicks = -1;
        }
    }

    @Override
    protected void onDisable() {
        pendingTicks = -1;
    }
}
