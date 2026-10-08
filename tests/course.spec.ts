import { test, expect } from "@playwright/test";

test("a running jump clears a real gap, contact causes damage, and high quality renders", async ({
  page,
}) => {
  page.setDefaultTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log(e.message);
  });
  await page.addInitScript(() =>
    localStorage.setItem("kingdom-quality", "balanced"),
  );
  await page.goto("/");
  await page.waitForFunction(() => window.__kingdom);
  await page.getByRole("button", { name: "冒険をはじめる" }).click();
  await page.waitForFunction(
    () =>
      !!document.pointerLockElement && window.__kingdom!.snapshot().grounded,
  );
  // Arrange running momentum at the lip of the first pit, then use real keyboard input.
  await page.keyboard.down("w");
  await page.keyboard.down("Shift");
  await page.evaluate(() =>
    window.__kingdom!.teleport(7, 0.85, -42.1, 0, -7.8),
  );
  await page.keyboard.down("Space");
  await page.waitForFunction(
    () =>
      window.__kingdom!.snapshot().z < -48 &&
      window.__kingdom!.snapshot().grounded,
  );
  await page.keyboard.up("Space");
  await page.keyboard.up("w");
  await page.keyboard.up("Shift");
  expect(
    (await page.evaluate(() => window.__kingdom!.snapshot())).y,
  ).toBeGreaterThan(0.7);
  console.log("Validated a running jump across the pit");
  // The tallest pipe must be reachable, including the coin above it.
  await page.evaluate(() => window.__kingdom!.teleport(-3.7, 0.85, -58.8));
  await page.waitForFunction(
    () =>
      Math.abs(window.__kingdom!.snapshot().z + 58.8) < 0.1 &&
      window.__kingdom!.snapshot().grounded,
  );
  await page.keyboard.down("w");
  await page.keyboard.down("Space");
  await expect(page.locator(".hud > div").nth(1).locator("strong")).toHaveText(
    "◈ 01",
  );
  await page.keyboard.up("w");
  await page.keyboard.up("Space");
  await page.waitForFunction(
    () =>
      window.__kingdom!.snapshot().grounded &&
      window.__kingdom!.snapshot().y > 3.8,
  );
  console.log(
    "Validated jumping onto the tallest pipe and collecting its coin",
  );
  await page.evaluate(() => window.__kingdom!.teleport(1, 0.85, -6.5));
  await page.waitForFunction(
    () => Math.abs(window.__kingdom!.snapshot().z + 6.5) < 0.1,
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "冒険をつづける" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "画質を切り替える" }).click();
  await expect(
    page.getByRole("button", { name: "画質を切り替える" }),
  ).toContainText("HIGH QUALITY");
  await page.getByRole("button", { name: "冒険をつづける" }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "test-results/high-quality-gameplay.png" });
  console.log("Captured high-quality first-person rendering");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "画質を切り替える" }).click();
  await page.getByRole("button", { name: "冒険をつづける" }).click();
  await page.setViewportSize({ width: 640, height: 480 });
  await page.evaluate(() => {
    const e = window.__kingdom!.enemies()[1];
    window.__kingdom!.teleport(e[0], 0.85, e[2]);
  });
  await expect(
    page.getByRole("heading", { name: "もう一度、冒険へ。" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
