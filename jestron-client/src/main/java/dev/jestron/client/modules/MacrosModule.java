package dev.jestron.client.modules;

import dev.jestron.client.JestronClient;
import dev.jestron.client.core.Category;
import dev.jestron.client.core.Module;
import dev.jestron.client.core.Setting;
import dev.jestron.client.util.ChatSender;

/** 5 sohbet makrosu. Her makronun mesajı ve tuşu bu menüden ayarlanır. */
public final class MacrosModule extends Module {
    public final Setting.Text[] slots = new Setting.Text[5];
    public final Setting.Bind[] keys = new Setting.Bind[5];

    public MacrosModule() {
        super("macros", "Sohbet makroları", "Tek tuşla mesaj ya da /komut gönderir. Mesajı yaz, tuşa bas.", Category.CHAT, true);
        for (int i = 0; i < slots.length; i++) {
            final int n = i;
            slots[i] = add(new Setting.Text("m" + (i + 1), "Makro " + (i + 1) + " · mesaj ya da /komut", "", 256));
            keys[i] = add(new Setting.Bind("k" + (i + 1), "Makro " + (i + 1) + " · tuş", () -> JestronClient.MACRO_KEYS[n], true));
        }
    }

    public void fire(int i) {
        if (!isEnabled() || i < 0 || i >= slots.length) return;
        if (slots[i].get().isBlank()) return;
        ChatSender.send(slots[i].get(), true);
    }
}
