package dev.jestron.client.modules;

import dev.jestron.client.core.Category;
import dev.jestron.client.core.Module;
import dev.jestron.client.core.Setting;
import dev.jestron.client.util.ChatSender;

/** 5 sohbet makrosu. Tuşları Seçenekler > Kontroller > Jestron Client'tan atanır. */
public final class MacrosModule extends Module {
    public final Setting.Text[] slots = new Setting.Text[5];

    public MacrosModule() {
        super("macros", "Sohbet makroları", "Tek tuşla mesaj ya da komut (tuşlar: Kontroller > Jestron Client).", Category.CHAT, true);
        for (int i = 0; i < slots.length; i++) slots[i] = add(new Setting.Text("m" + (i + 1), "Makro " + (i + 1), "", 256));
    }

    public void fire(int i) {
        if (!isEnabled() || i < 0 || i >= slots.length) return;
        ChatSender.send(slots[i].get(), true);
    }
}
