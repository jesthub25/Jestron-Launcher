package dev.jestron.client.core;

public enum Category {
    HUD("HUD"),
    PVP("PvP"),
    GAMEPLAY("Oynanış"),
    VISUAL("Görsel"),
    CHAT("Sohbet");

    public final String label;

    Category(String label) {
        this.label = label;
    }
}
