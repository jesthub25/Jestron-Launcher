package dev.jestron.client.gui;

import dev.jestron.client.JestronClient;
import dev.jestron.client.core.Category;
import dev.jestron.client.core.Config;
import dev.jestron.client.core.HudModule;
import dev.jestron.client.core.Module;
import dev.jestron.client.core.Modules;
import dev.jestron.client.core.Setting;
import dev.jestron.client.core.Theme;
import dev.jestron.client.integration.EfektMenu;
import dev.jestron.client.util.TextUtil;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Sağ Shift menüsü: solda kategoriler, üstte arama, ortada modül kartları (aç/kapa + ayarlar),
 * kartın ayarlarına girince satır satır ayar listesi. Feather / Lunar mod menüsü mantığında.
 */
public final class JestronMenuScreen extends Screen {
    private static final int GAP = 8, CARD_MIN_W = 118, CARD_H = 60, ROW_H = 24, TEXT_ROW_H = 36;
    private static int lastCategory = 0;

    private final Screen parent;
    private int px, py, pw, ph, sideW, cx, cy, cw, ch;
    private EditBox search;
    private String query = "";
    private int category = lastCategory; // 0 = tümü, sonra Category sırası
    private double scroll, maxScroll;

    private Module settingsOf;
    private double setScroll, setMaxScroll;
    private final Map<Setting.Text, EditBox> textBoxes = new LinkedHashMap<>();
    private Setting.Num dragging;
    private int dragX, dragW;

    private final Map<String, Float> anim = new HashMap<>();
    private long lastNanos, openedAt;
    private boolean dirty;

    private record CardHit(Module m, int x, int y, int w, int h, int sx, int sy, int sw, int sh, int ax, int ay, int aw, int ah) {
    }

    private record RowHit(Setting<?> s, int x, int y, int w, int h, int ctrlX, int ctrlW) {
    }

    private record Btn(String id, int x, int y, int w, int h) {
    }

    private final List<CardHit> cardHits = new ArrayList<>();
    private final List<RowHit> rowHits = new ArrayList<>();
    private final List<Btn> buttons = new ArrayList<>();

    public JestronMenuScreen(Screen parent) {
        super(Component.literal("Jestron Menüsü"));
        this.parent = parent;
    }

    // ------------------------------------------------------------------ yerleşim

    @Override
    protected void init() {
        if (openedAt == 0) openedAt = System.currentTimeMillis();
        pw = Math.min(width - 20, 560);
        ph = Math.min(height - 20, 340);
        px = (width - pw) / 2;
        py = (height - ph) / 2;
        sideW = pw < 400 ? 84 : 110;
        cx = px + sideW + 12;
        cw = px + pw - 12 - cx;
        cy = py + 40;
        ch = py + ph - 12 - cy;

        search = new EditBox(font, cx + 6, py + 16, Math.max(40, cw - 12 - 90), 10, Component.literal("Ara"));
        search.setBordered(false);
        search.setMaxLength(40);
        search.setHint(Component.literal("Mod ara…"));
        search.setTextColor(Theme.text());
        search.setValue(query);
        search.setResponder(v -> {
            query = v;
            scroll = 0;
        });
        addWidget(search);

        textBoxes.clear();
        if (settingsOf != null) {
            search.setVisible(false);
            buildTextBoxes();
        }
    }

    private void buildTextBoxes() {
        for (EditBox b : textBoxes.values()) removeWidget(b);
        textBoxes.clear();
        if (settingsOf == null) return;
        for (Setting<?> s : settingsOf.settings()) {
            if (!s.visible || !(s instanceof Setting.Text t)) continue;
            EditBox b = new EditBox(font, 0, 0, 100, 10, Component.literal(t.label));
            b.setBordered(false);
            b.setMaxLength(t.maxLength);
            b.setTextColor(Theme.text());
            b.setValue(t.get());
            b.setResponder(v -> {
                t.set(v);
                settingsOf.onSettingChanged(t);
                dirty = true;
            });
            addWidget(b);
            textBoxes.put(t, b);
        }
    }

    private void openSettingsInternal(Module m) {
        settingsOf = m;
        setScroll = 0;
        search.setVisible(false);
        setFocused(null);
        buildTextBoxes();
    }

    /** Oyun içi test ve kısayollar için. */
    public void openSettings(Module m) {
        openSettingsInternal(m);
    }

    private void closeSettings() {
        for (EditBox b : textBoxes.values()) removeWidget(b);
        textBoxes.clear();
        settingsOf = null;
        dragging = null;
        search.setVisible(true);
        setFocused(null);
    }

    private List<Module> visibleModules() {
        List<Module> out = new ArrayList<>();
        String q = TextUtil.norm(query.trim());
        for (Module m : Modules.ALL) {
            if (category > 0 && m.category != Category.values()[category - 1]) continue;
            if (!q.isEmpty() && !TextUtil.norm(m.name + " " + m.description + " " + m.category.label).contains(q)) continue;
            out.add(m);
        }
        return out;
    }

    // ------------------------------------------------------------------ çizim

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        // bulanıklaştırma yok: oyun arkada görünür, HUD değişiklikleri canlı izlenir
        float t = openProgress();
        g.fill(0, 0, width, height, Draw.withAlpha(Theme.overlay(), t));
    }

    private float openProgress() {
        long d = System.currentTimeMillis() - openedAt;
        float t = Math.min(1f, d / 160f);
        return 1f - (1f - t) * (1f - t);
    }

    private float animate(String key, boolean on, float dt) {
        float cur = anim.getOrDefault(key, on ? 1f : 0f);
        float target = on ? 1f : 0f;
        float step = dt * 10f;
        cur = cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
        anim.put(key, cur);
        return cur;
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        long now = System.nanoTime();
        float dt = lastNanos == 0 ? 0f : Math.min(0.1f, (now - lastNanos) / 1_000_000_000f);
        lastNanos = now;

        renderBackground(g, mouseX, mouseY, partialTick);
        float open = openProgress();
        int slide = Math.round((1f - open) * 10f);
        g.pose().pushPose();
        g.pose().translate(0, slide, 0);
        try {
            int my = mouseY - slide;
            drawPanel(g, mouseX, my);
            drawSidebar(g, mouseX, my);
            if (settingsOf == null) drawGrid(g, mouseX, my, dt, partialTick);
            else drawSettings(g, mouseX, my, dt, partialTick);
        } finally {
            g.pose().popPose();
        }
    }

    private void drawPanel(GuiGraphics g, int mx, int my) {
        Draw.card(g, px, py, px + pw, py + ph, 8, Theme.panel(), Theme.border());
        Draw.roundRect(g, px + 1, py + 1, px + sideW, py + ph - 1, 7, Theme.sidebar());
        g.fill(px + sideW - 6, py + 1, px + sideW, py + ph - 1, Theme.sidebar());
        g.fill(px + sideW, py + 1, px + sideW + 1, py + ph - 1, Theme.border());
    }

    private void drawSidebar(GuiGraphics g, int mx, int my) {
        buttons.clear();
        int x = px + 12;
        int y = py + 14;
        g.drawString(font, Component.literal("jestron").withStyle(s -> s.withBold(true)), x, y, Theme.text(), false);
        int dotX = x + font.width(Component.literal("jestron").withStyle(s -> s.withBold(true))) + 1;
        g.fill(dotX, y + 6, dotX + 2, y + 8, Theme.accent());
        g.drawString(font, "client", x, y + 11, Theme.muted(), false);
        y += 34;

        int n = Category.values().length + 1;
        for (int i = 0; i < n; i++) {
            String label = i == 0 ? "Tümü" : Category.values()[i - 1].label;
            boolean active = settingsOf == null && category == i || settingsOf != null && i > 0 && settingsOf.category == Category.values()[i - 1];
            boolean hover = Draw.inside(mx, my, px + 6, y - 4, sideW - 12, 16);
            if (active || hover) Draw.roundRect(g, px + 6, y - 4, px + sideW - 6, y + 12, 4, active ? Theme.card() : Draw.withAlpha(Theme.card(), 0.6f));
            if (active) g.fill(px + 11, y + 2, px + 14, y + 5, Theme.accent());
            g.drawString(font, label, x + 6, y, active ? Theme.text() : Theme.muted(), false);
            buttons.add(new Btn("cat" + i, px + 6, y - 4, sideW - 12, 16));
            y += 18;
        }

        // alt kısayollar
        int by = py + ph - 14 - 18;
        if (EfektMenu.isLoaded()) {
            by = sideButton(g, mx, my, "efekt", "Efekt Menüsü", by, false) - 22;
        }
        sideButton(g, mx, my, "hud", "HUD Düzenle", by, true);
    }

    private int sideButton(GuiGraphics g, int mx, int my, String id, String label, int y, boolean primary) {
        int x1 = px + 8, x2 = px + sideW - 8;
        boolean hover = Draw.inside(mx, my, x1, y, x2 - x1, 18);
        if (primary) {
            Draw.roundRect(g, x1, y, x2, y + 18, 9, hover ? Draw.lerpColor(Theme.accent(), 0xFF000000, 0.12f) : Theme.accent());
            int tw = font.width(label);
            g.drawString(font, label, x1 + (x2 - x1 - tw) / 2, y + 5, Theme.onAccent(), false);
        } else {
            Draw.card(g, x1, y, x2, y + 18, 9, hover ? Theme.cardHover() : Theme.card(), Theme.border());
            int tw = font.width(label);
            g.drawString(font, label, x1 + (x2 - x1 - tw) / 2, y + 5, Theme.text(), false);
        }
        buttons.add(new Btn(id, x1, y, x2 - x1, 18));
        return y;
    }

    private void drawGrid(GuiGraphics g, int mx, int my, float dt, float pt) {
        // arama kutusu
        Draw.card(g, cx, py + 10, cx + cw - 96, py + 30, 10, Theme.card(), search.isFocused() ? Theme.accent() : Theme.border());
        search.setX(cx + 10);
        search.setY(py + 16);
        search.setWidth(Math.max(30, cw - 96 - 16));
        search.setTextColor(Theme.text());
        search.render(g, mx, my, pt);
        List<Module> list = visibleModules();
        long on = list.stream().filter(m -> m.toggleable() && m.isEnabled()).count();
        String count = on + " / " + list.stream().filter(Module::toggleable).count() + " açık";
        g.drawString(font, count, cx + cw - font.width(count), py + 16, Theme.muted(), false);

        int cols = Math.max(1, (cw + GAP) / (CARD_MIN_W + GAP));
        int cardW = (cw - (cols - 1) * GAP) / cols;
        int rows = (list.size() + cols - 1) / cols;
        int total = rows * (CARD_H + GAP) - GAP;
        maxScroll = Math.max(0, total - ch);
        scroll = Math.max(0, Math.min(maxScroll, scroll));

        cardHits.clear();
        g.enableScissor(cx - 2, cy, cx + cw + 2, cy + ch);
        try {
            if (list.isEmpty()) {
                String t = "Sonuç yok";
                g.drawString(font, t, cx + (cw - font.width(t)) / 2, cy + 30, Theme.muted(), false);
            }
            for (int i = 0; i < list.size(); i++) {
                Module m = list.get(i);
                int x = cx + (i % cols) * (cardW + GAP);
                int y = cy + (i / cols) * (CARD_H + GAP) - (int) Math.round(scroll);
                if (y + CARD_H < cy || y > cy + ch) continue;
                drawCard(g, m, x, y, cardW, mx, my, dt);
            }
        } finally {
            g.disableScissor();
        }
        drawScrollbar(g, scroll, maxScroll, total);
    }

    private void drawCard(GuiGraphics g, Module m, int x, int y, int w, int mx, int my, float dt) {
        boolean inArea = my >= cy && my < cy + ch;
        boolean hover = inArea && Draw.inside(mx, my, x, y, w, CARD_H);
        boolean enabled = m.toggleable() && m.isEnabled();
        float t = animate("card:" + m.id, enabled, dt);
        int border = enabled ? Draw.lerpColor(Theme.border(), Theme.accent(), t) : Theme.border();
        Draw.card(g, x, y, x + w, y + CARD_H, 8, hover ? Theme.cardHover() : Theme.card(), border);

        Component title = Component.literal(Draw.ellipsize(font, m.name, w - 16)).withStyle(s -> s.withBold(true));
        g.drawString(font, title, x + 8, y + 8, Theme.text(), false);
        List<FormattedCharSequence> desc = font.split(Component.literal(m.description), w - 16);
        for (int i = 0; i < Math.min(2, desc.size()); i++) {
            g.drawString(font, desc.get(i), x + 8, y + 20 + i * 9, Theme.muted(), false);
        }

        int sx = 0, sy = 0, sw = 0, sh = 0, ax = 0, ay = 0, aw = 0, ah = 0;
        int by = y + CARD_H - 15;
        if (m.toggleable()) {
            sw = 22;
            sh = 12;
            sx = x + w - 8 - sw;
            sy = by;
            Draw.toggle(g, sx, sy, sw, sh, t, Theme.accent(), Theme.track());
        }
        if (m.hasVisibleSettings()) {
            String a = m.toggleable() ? "Ayarlar ›" : "Aç ›";
            aw = font.width(a);
            ah = 10;
            ax = x + 8;
            ay = by + 2;
            boolean ah2 = inArea && Draw.inside(mx, my, ax - 2, ay - 2, aw + 4, ah + 2);
            g.drawString(font, a, ax, ay, ah2 ? Theme.accent() : Theme.muted(), false);
        }
        cardHits.add(new CardHit(m, x, y, w, CARD_H, sx, sy, sw, sh, ax - 2, ay - 2, aw + 4, ah + 2));
    }

    private void drawScrollbar(GuiGraphics g, double sc, double max, int total) {
        if (max <= 0) return;
        int trackH = ch;
        int barH = Math.max(16, (int) (trackH * (double) trackH / (trackH + max)));
        int barY = cy + (int) ((trackH - barH) * (sc / max));
        int x = px + pw - 7;
        Draw.roundRect(g, x, barY, x + 3, barY + barH, 1, Theme.track());
    }

    private void drawSettings(GuiGraphics g, int mx, int my, float dt, float pt) {
        Module m = settingsOf;
        // başlık
        boolean backHover = Draw.inside(mx, my, cx, py + 10, 46, 20);
        Draw.card(g, cx, py + 10, cx + 46, py + 30, 10, backHover ? Theme.cardHover() : Theme.card(), Theme.border());
        g.drawString(font, "‹ Geri", cx + 9, py + 16, Theme.text(), false);
        buttons.add(new Btn("back", cx, py + 10, 46, 20));
        Component title = Component.literal(Draw.ellipsize(font, m.name, cw - 46 - 130)).withStyle(s -> s.withBold(true));
        g.drawString(font, title, cx + 56, py + 16, Theme.text(), false);

        int rx = cx + cw;
        String reset = "Sıfırla";
        int rw = font.width(reset) + 16;
        rx -= rw;
        boolean resetHover = Draw.inside(mx, my, rx, py + 10, rw, 20);
        Draw.card(g, rx, py + 10, rx + rw, py + 30, 10, resetHover ? Theme.cardHover() : Theme.card(), Theme.border());
        g.drawString(font, reset, rx + 8, py + 16, Theme.muted(), false);
        buttons.add(new Btn("reset", rx, py + 10, rw, 20));
        if (m.toggleable()) {
            float t = animate("card:" + m.id, m.isEnabled(), dt);
            int tx = rx - 8 - 26;
            Draw.toggle(g, tx, py + 13, 26, 14, t, Theme.accent(), Theme.track());
            buttons.add(new Btn("toggle", tx, py + 13, 26, 14));
        }

        // satırlar
        List<Setting<?>> vis = new ArrayList<>();
        for (Setting<?> s : m.settings()) if (s.visible) vis.add(s);
        int total = 0;
        for (Setting<?> s : vis) total += (s instanceof Setting.Text ? TEXT_ROW_H : ROW_H);
        boolean hud = m instanceof HudModule;
        int extra = (hud ? ROW_H : 0) + (m == Modules.MACROS ? 22 : 0);
        total += extra;
        setMaxScroll = Math.max(0, total - ch);
        setScroll = Math.max(0, Math.min(setMaxScroll, setScroll));

        rowHits.clear();
        for (EditBox b : textBoxes.values()) b.visible = false;
        g.enableScissor(cx - 2, cy, cx + cw + 2, cy + ch);
        try {
            int y = cy - (int) Math.round(setScroll);
            if (vis.isEmpty() && !hud) {
                g.drawString(font, "Bu modülün ayarı yok.", cx + 4, y + 8, Theme.muted(), false);
            }
            for (Setting<?> s : vis) {
                int h = s instanceof Setting.Text ? TEXT_ROW_H : ROW_H;
                if (y + h >= cy && y <= cy + ch) drawRow(g, s, y, h, mx, my, dt, pt);
                y += h;
            }
            if (hud) {
                boolean hov = my >= cy && my < cy + ch && Draw.inside(mx, my, cx, y + 4, 150, 16);
                Draw.card(g, cx, y + 4, cx + 150, y + 20, 8, hov ? Theme.cardHover() : Theme.card(), Theme.border());
                g.drawString(font, "HUD düzenleyicide taşı ›", cx + 8, y + 8, Theme.text(), false);
                rowHits.add(new RowHit(null, cx, y + 4, 150, 16, 0, 0));
                y += ROW_H;
            }
            if (m == Modules.MACROS) {
                g.drawString(font, "Tuşlar: Seçenekler › Kontroller › Tuş Atamaları › Jestron Client", cx + 2, y + 6, Theme.muted(), false);
            }
        } finally {
            g.disableScissor();
        }
        drawScrollbar(g, setScroll, setMaxScroll, total);
    }

    private void drawRow(GuiGraphics g, Setting<?> s, int y, int h, int mx, int my, float dt, float pt) {
        boolean inArea = my >= cy && my < cy + ch;
        g.fill(cx, y + h - 1, cx + cw, y + h, Theme.border());
        if (s instanceof Setting.Text t) {
            g.drawString(font, t.label, cx + 2, y + 4, Theme.text(), false);
            EditBox b = textBoxes.get(t);
            int bx = cx, bw = cw, byy = y + 15;
            Draw.card(g, bx, byy, bx + bw, byy + 16, 8, Theme.card(), b != null && b.isFocused() ? Theme.accent() : Theme.border());
            if (b != null) {
                b.setX(bx + 8);
                b.setY(byy + 4);
                b.setWidth(bw - 16);
                b.setTextColor(Theme.text());
                b.visible = byy >= cy && byy + 16 <= cy + ch;
                if (b.visible) b.render(g, mx, my, pt);
            }
            rowHits.add(new RowHit(s, cx, y, cw, h, bx, bw));
            return;
        }
        g.drawString(font, Draw.ellipsize(font, s.label, cw / 2), cx + 2, y + (h - 8) / 2, Theme.text(), false);
        int ctrlW, ctrlX;
        if (s instanceof Setting.Bool b) {
            ctrlW = 26;
            ctrlX = cx + cw - ctrlW;
            float t = animate("set:" + settingsOf.id + ":" + s.key, b.on(), dt);
            Draw.toggle(g, ctrlX, y + (h - 14) / 2, 26, 14, t, Theme.accent(), Theme.track());
        } else if (s instanceof Setting.Num n) {
            ctrlW = Math.min(130, cw / 2 - 40);
            ctrlX = cx + cw - ctrlW;
            int ty = y + h / 2;
            int fillW = (int) Math.round(ctrlW * n.fraction());
            Draw.roundRect(g, ctrlX, ty - 2, ctrlX + ctrlW, ty + 2, 2, Theme.track());
            Draw.roundRect(g, ctrlX, ty - 2, ctrlX + Math.max(4, fillW), ty + 2, 2, Theme.accent());
            int kx = ctrlX + fillW;
            Draw.roundRect(g, kx - 5, ty - 5, kx + 5, ty + 5, 5, Theme.accent());
            Draw.roundRect(g, kx - 3, ty - 3, kx + 3, ty + 3, 3, 0xFFFFFFFF);
            String v = n.display();
            g.drawString(font, v, ctrlX - 8 - font.width(v), y + (h - 8) / 2, Theme.muted(), false);
        } else if (s == Modules.APPEARANCE.accent) {
            Setting.Choice c = (Setting.Choice) s;
            int sw = 14, gap = 5;
            ctrlW = c.options.length * (sw + gap) - gap;
            ctrlX = cx + cw - ctrlW;
            for (int i = 0; i < c.options.length; i++) {
                int sx = ctrlX + i * (sw + gap), sy = y + (h - sw) / 2;
                if (i == c.index()) Draw.roundRect(g, sx - 2, sy - 2, sx + sw + 2, sy + sw + 2, 9, Theme.text());
                Draw.roundRect(g, sx, sy, sx + sw, sy + sw, 7, Theme.accentPreview(i) == 0xFF18181B && Theme.dark() ? 0xFFF4F4F5 : Theme.accentPreview(i));
            }
            g.drawString(font, c.display(), ctrlX - 8 - font.width(c.display()), y + (h - 8) / 2, Theme.muted(), false);
        } else if (s instanceof Setting.Choice c) {
            String v = c.display();
            ctrlW = Math.max(70, font.width(v) + 30);
            ctrlX = cx + cw - ctrlW;
            boolean hov = inArea && Draw.inside(mx, my, ctrlX, y + 4, ctrlW, h - 8);
            Draw.card(g, ctrlX, y + 4, ctrlX + ctrlW, y + h - 4, 8, hov ? Theme.cardHover() : Theme.card(), Theme.border());
            g.drawString(font, "‹", ctrlX + 6, y + (h - 8) / 2, Theme.muted(), false);
            g.drawString(font, "›", ctrlX + ctrlW - 10, y + (h - 8) / 2, Theme.muted(), false);
            g.drawString(font, v, ctrlX + (ctrlW - font.width(v)) / 2, y + (h - 8) / 2, Theme.text(), false);
        } else {
            ctrlW = 0;
            ctrlX = cx + cw;
        }
        rowHits.add(new RowHit(s, cx, y, cw, h, ctrlX, ctrlW));
    }

    // ------------------------------------------------------------------ giriş

    private void changed(Setting<?> s) {
        if (settingsOf != null) settingsOf.onSettingChanged(s);
        dirty = true;
    }

    @Override
    public boolean mouseClicked(double mx, double my, int button) {
        double y = my - Math.round((1f - openProgress()) * 10f);
        // önce yazı kutuları
        for (EditBox b : textBoxes.values()) {
            if (b.visible && b.mouseClicked(mx, y, button)) {
                setFocused(b);
                return true;
            }
        }
        if (search.isVisible() && Draw.inside(mx, y, cx, py + 10, cw - 96, 20)) {
            search.mouseClicked(Math.max(search.getX(), Math.min(mx, search.getX() + search.getWidth() - 1)), search.getY() + 2, button);
            setFocused(search);
            search.setFocused(true);
            return true;
        }
        setFocused(null);
        if (button != 0 && button != 1) return false;

        for (Btn b : buttons) {
            if (!Draw.inside(mx, y, b.x, b.y, b.w, b.h)) continue;
            click(b.id);
            return true;
        }
        if (settingsOf == null) {
            if (y < cy || y >= cy + ch) return false;
            for (CardHit c : cardHits) {
                if (!Draw.inside(mx, y, c.x, c.y, c.w, c.h)) continue;
                if (c.aw > 0 && (Draw.inside(mx, y, c.ax, c.ay, c.aw, c.ah) || !c.m.toggleable() || button == 1)) {
                    openSettingsInternal(c.m);
                } else if (c.m.toggleable()) {
                    c.m.toggle();
                    dirty = true;
                }
                return true;
            }
            return false;
        }
        if (y < cy || y >= cy + ch) return false;
        for (RowHit r : rowHits) {
            if (!Draw.inside(mx, y, r.x, r.y, r.w, r.h)) continue;
            if (r.s == null) {
                // HUD düzenleyiciye git
                minecraft.setScreen(new HudEditorScreen(this));
                return true;
            }
            if (r.s instanceof Setting.Bool b) {
                b.toggle();
                changed(b);
            } else if (r.s instanceof Setting.Num n) {
                if (mx >= r.ctrlX - 6 && mx <= r.ctrlX + r.ctrlW + 6) {
                    dragging = n;
                    dragX = r.ctrlX;
                    dragW = r.ctrlW;
                    n.setFraction((mx - dragX) / (double) dragW);
                    changed(n);
                }
            } else if (r.s == Modules.APPEARANCE.accent) {
                Setting.Choice c = (Setting.Choice) r.s;
                int sw = 14, gap = 5;
                for (int i = 0; i < c.options.length; i++) {
                    int sx = r.ctrlX + i * (sw + gap);
                    if (mx >= sx - 2 && mx <= sx + sw + 2) {
                        c.set(i);
                        changed(c);
                        break;
                    }
                }
            } else if (r.s instanceof Setting.Choice c) {
                if (mx >= r.ctrlX) {
                    c.next(mx < r.ctrlX + r.ctrlW / 2.0 || button == 1 ? -1 : 1);
                    changed(c);
                }
            }
            return true;
        }
        return false;
    }

    private void click(String id) {
        switch (id) {
            case "hud" -> minecraft.setScreen(new HudEditorScreen(this));
            case "efekt" -> EfektMenu.open(this);
            case "back" -> closeSettings();
            case "reset" -> {
                if (settingsOf != null) {
                    settingsOf.resetToDefaults();
                    buildTextBoxes();
                    dirty = true;
                }
            }
            case "toggle" -> {
                if (settingsOf != null && settingsOf.toggleable()) {
                    settingsOf.toggle();
                    dirty = true;
                }
            }
            default -> {
                if (id.startsWith("cat")) {
                    try {
                        category = Integer.parseInt(id.substring(3));
                    } catch (NumberFormatException ignored) {
                        category = 0;
                    }
                    lastCategory = category;
                    scroll = 0;
                    if (settingsOf != null) closeSettings();
                }
            }
        }
    }

    @Override
    public boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
        if (dragging != null && dragW > 0) {
            dragging.setFraction((mx - dragX) / (double) dragW);
            changed(dragging);
            return true;
        }
        return super.mouseDragged(mx, my, button, dx, dy);
    }

    @Override
    public boolean mouseReleased(double mx, double my, int button) {
        dragging = null;
        return super.mouseReleased(mx, my, button);
    }

    @Override
    public boolean mouseScrolled(double mx, double my, double sx, double sy) {
        if (settingsOf == null) scroll = Math.max(0, Math.min(maxScroll, scroll - sy * 24));
        else setScroll = Math.max(0, Math.min(setMaxScroll, setScroll - sy * 24));
        return true;
    }

    @Override
    public boolean keyPressed(int key, int scan, int mods) {
        if (key == GLFW.GLFW_KEY_ESCAPE) {
            if (getFocused() instanceof EditBox) {
                setFocused(null);
                return true;
            }
            if (settingsOf != null) {
                closeSettings();
                return true;
            }
            onClose();
            return true;
        }
        if (getFocused() instanceof EditBox eb && eb.isFocused()) {
            return super.keyPressed(key, scan, mods);
        }
        if (JestronClient.menuKey != null && JestronClient.menuKey.matches(key, scan)) {
            onClose();
            return true;
        }
        return super.keyPressed(key, scan, mods);
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    @Override
    public void onClose() {
        minecraft.setScreen(parent);
    }

    @Override
    public void removed() {
        if (dirty) {
            Config.save();
            dirty = false;
        }
    }
}
