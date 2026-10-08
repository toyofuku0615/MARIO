import { test, expect } from "@playwright/test";

test("title renders with no errors and the complete gameplay loop works", async ({
  page,
}) => {
  page.setDefaultTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("Browser error:", e.message);
  });
  const broken: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) broken.push(`${r.status()} ${r.url()}`);
  });
  await page.addInitScript(() =>
    localStorage.setItem("kingdom-quality", "balanced"),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "冒険をはじめる" }),
  ).toBeVisible();
  await page.waitForFunction(() => !!window.__kingdom);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "test-results/title.png" });
  await page.getByRole("button", { name: "冒険をはじめる" }).click();
  await page.waitForFunction(() => document.pointerLockElement !== null);
  await page.waitForFunction(() => window.__kingdom!.snapshot().grounded);
  const start = await page.evaluate(() => window.__kingdom!.snapshot());
  expect(start.y).toBeGreaterThan(0.7);
  expect(start.y).toBeLessThan(0.9);
  await page.keyboard.down("w");
  await page.waitForFunction(
    (z) => window.__kingdom!.snapshot().z < z - 1,
    start.z,
  );
  await page.keyboard.up("w");
  const moved = await page.evaluate(() => window.__kingdom!.snapshot());
  expect(moved.z).toBeLessThan(start.z - 1);
  await page.keyboard.down("Space");
  await page.waitForFunction(() => window.__kingdom!.snapshot().y > 1.5);
  await page.keyboard.up("Space");
  expect(
    (await page.evaluate(() => window.__kingdom!.snapshot())).y,
  ).toBeGreaterThan(1.5);
  await page.waitForFunction(() => window.__kingdom!.snapshot().grounded);
  console.log("Validated movement and jump");
  await page.evaluate(() => window.__kingdom!.teleport(0, 0.85, -5));
  await expect(page.locator(".hud > div").nth(1).locator("strong")).toHaveText(
    "◈ 01",
  );
  await page.evaluate(() => window.__kingdom!.teleport(-1.8, 0.85, -12));
  await page.waitForFunction(() => window.__kingdom!.snapshot().grounded);
  await page.keyboard.down("Space");
  await expect(page.locator(".hud > div").nth(1).locator("strong")).toHaveText(
    "◈ 02",
  );
  await page.keyboard.up("Space");
  await expect(
    page.locator(".hud").getByText("000300", { exact: true }),
  ).toBeVisible();
  console.log("Validated pickups and block head contact");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/gameplay.png" });
  // Rapier's solid pipe stops lateral movement.
  await page.evaluate(() => window.__kingdom!.teleport(-4, 0.85, -16.8));
  await page.keyboard.down("w");
  await page.waitForFunction(() => window.__kingdom!.snapshot().z < -17.4);
  await page.waitForTimeout(500);
  await page.keyboard.up("w");
  expect(
    (await page.evaluate(() => window.__kingdom!.snapshot())).z,
  ).toBeGreaterThan(-17.8);
  // A falling capsule above the first moving enemy should stomp and bounce.
  await page.evaluate(() => {
    const e = window.__kingdom!.enemies()[0];
    window.__kingdom!.teleport(e[0], 2.8, e[2], -4);
  });
  await expect(
    page.locator(".hud").getByText("000500", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  console.log("Validated pipe collision and enemy stomp");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "冒険をつづける" }),
  ).toBeVisible();
  const paused = await page.evaluate(() => window.__kingdom!.snapshot());
  await page.waitForTimeout(400);
  expect(
    (await page.evaluate(() => window.__kingdom!.snapshot())).z,
  ).toBeCloseTo(paused.z, 1);
  await page.getByRole("button", { name: "冒険をつづける" }).click();
  await page.waitForFunction(() => document.pointerLockElement !== null);
  await page.evaluate(() => window.__kingdom!.teleport(0, 1, -45));
  await expect(
    page.getByRole("heading", { name: "もう一度、冒険へ。" }),
  ).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "最初からプレイ" }).click();
  await page.waitForFunction(() => window.__kingdom!.snapshot().grounded);
  await expect(
    page.locator(".hud").getByText("000000", { exact: true }),
  ).toBeVisible();
  console.log("Validated pause, falling, and restart");
  await page.evaluate(() => window.__kingdom!.teleport(0, 1, -320));
  await expect(
    page.getByRole("heading", { name: "草原の、その先へ。" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/goal.png" });
  expect(errors).toEqual([]);
  expect(broken).toEqual([]);
});
