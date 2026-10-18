import { describe, expect, it } from "vitest";
import { formatPrice, formatSpec, specCell, specLabel } from "./format";

describe("format", () => {
  it("formats prices in euros with thousands separators", () => {
    expect(formatPrice(1229.99)).toBe("€1,229.99");
    expect(formatPrice(30)).toBe("€30.00");
  });

  it("formats specs for humans", () => {
    expect(formatSpec("ram_gb", 16)).toBe("16 GB RAM");
    expect(formatSpec("storage_gb", 2048)).toBe("2 TB storage");
    expect(formatSpec("gps", false)).toBe("no GPS");
    expect(formatSpec("panel", "OLED")).toBe("OLED");
  });

  it("builds table labels and cells", () => {
    expect(specLabel("battery_hours")).toBe("Battery (h)");
    expect(specLabel("noise_cancelling")).toBe("Noise cancelling");
    expect(specLabel("bluetooth_version")).toBe("Bluetooth version");
    expect(specCell(true)).toBe("yes");
    expect(specCell(null)).toBe("n/a");
  });
});
