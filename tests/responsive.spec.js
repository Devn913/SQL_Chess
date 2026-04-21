// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const PAGE_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

/**
 * Helper: open the page, dismiss the setup modal by playing as guest,
 * then return the page for further assertions.
 */
async function openAndStartGame(page) {
  await page.goto(PAGE_URL);
  // Dismiss setup modal
  await page.click('#btnPlayAsGuest');
}

// ── SQL Panel visibility ────────────────────────────────────────────────────

test.describe('SQL panel — visible on page load', () => {
  test('SQL panel is rendered and not hidden', async ({ page }) => {
    await openAndStartGame(page);
    const sqlPanel = page.locator('#sqlPanel');
    await expect(sqlPanel).toBeVisible();
    await expect(sqlPanel).not.toHaveClass(/hidden-panel/);
  });

  test('SQL panel header is visible', async ({ page }) => {
    await openAndStartGame(page);
    await expect(page.locator('.sql-panel-header')).toBeVisible();
  });

  test('SQL panel contains at least one SQL block after game start', async ({ page }) => {
    await openAndStartGame(page);
    const blocks = page.locator('.sql-block');
    await expect(blocks).toHaveCount(1);
  });
});

// ── Query textarea ──────────────────────────────────────────────────────────

test.describe('SQL query textarea', () => {
  test('textarea is visible', async ({ page }) => {
    await openAndStartGame(page);
    await expect(page.locator('#sqlMoveInput')).toBeVisible();
  });

  test('textarea has rows=6', async ({ page }) => {
    await openAndStartGame(page);
    const rows = await page.locator('#sqlMoveInput').getAttribute('rows');
    expect(Number(rows)).toBeGreaterThanOrEqual(6);
  });

  test('textarea has sufficient rendered height (≥ 80 px)', async ({ page }) => {
    await openAndStartGame(page);
    const height = await page.locator('#sqlMoveInput').evaluate(
      (el) => el.getBoundingClientRect().height
    );
    expect(height).toBeGreaterThanOrEqual(80);
  });

  test('textarea is pre-filled with the default SQL sample', async ({ page }) => {
    await openAndStartGame(page);
    const value = await page.locator('#sqlMoveInput').inputValue();
    expect(value.toLowerCase()).toContain('update chess_piece');
  });

  test('textarea allows vertical resize (resize != none)', async ({ page }) => {
    await openAndStartGame(page);
    const resize = await page.locator('#sqlMoveInput').evaluate(
      (el) => window.getComputedStyle(el).resize
    );
    expect(resize).not.toBe('none');
  });
});

// ── SQL content area scrollability ─────────────────────────────────────────

test.describe('SQL content area — scrollability', () => {
  test('sql-content has overflow-y scroll or auto', async ({ page }) => {
    await openAndStartGame(page);
    const overflow = await page.locator('#sqlContent').evaluate(
      (el) => window.getComputedStyle(el).overflowY
    );
    expect(['auto', 'scroll']).toContain(overflow);
  });

  test('body does NOT scroll (overflow hidden)', async ({ page }) => {
    await openAndStartGame(page);
    const overflow = await page.locator('body').evaluate(
      (el) => window.getComputedStyle(el).overflow
    );
    expect(overflow).toBe('hidden');
  });

  test('sql-content has positive scrollHeight (content is present)', async ({ page }) => {
    await openAndStartGame(page);
    const sh = await page.locator('#sqlContent').evaluate((el) => el.scrollHeight);
    expect(sh).toBeGreaterThan(0);
  });
});

// ── Layout correctness at various viewports ─────────────────────────────────

test.describe('Layout at current viewport', () => {
  test('chess panel and SQL panel are side-by-side on wide screens', async ({ page, viewport }) => {
    if (!viewport || viewport.width < 1024) test.skip();
    await openAndStartGame(page);

    const chessBox = await page.locator('#chessPanel').boundingBox();
    const sqlBox   = await page.locator('#sqlPanel').boundingBox();
    expect(chessBox).not.toBeNull();
    expect(sqlBox).not.toBeNull();

    // On wide screens both panels should be in the same row (similar top values)
    expect(Math.abs((chessBox?.y ?? 0) - (sqlBox?.y ?? 0))).toBeLessThan(10);
    // SQL panel should be to the right of chess panel
    expect((sqlBox?.x ?? 0)).toBeGreaterThan((chessBox?.x ?? 0));
  });

  test('SQL panel stacks below chess panel on narrow screens', async ({ page, viewport }) => {
    if (!viewport || viewport.width >= 900) test.skip();
    await openAndStartGame(page);

    const chessBox = await page.locator('#chessPanel').boundingBox();
    const sqlBox   = await page.locator('#sqlPanel').boundingBox();
    expect(chessBox).not.toBeNull();
    expect(sqlBox).not.toBeNull();

    // SQL panel should be below chess panel (larger Y)
    expect((sqlBox?.y ?? 0)).toBeGreaterThan((chessBox?.y ?? 0));
  });

  test('no horizontal page overflow', async ({ page }) => {
    await openAndStartGame(page);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewWidth = await page.evaluate(() => window.innerWidth);
    // Allow up to 1 px rounding difference
    expect(bodyWidth).toBeLessThanOrEqual(viewWidth + 1);
  });

  test('chess board is visible and square', async ({ page }) => {
    await openAndStartGame(page);
    const box = await page.locator('#board').boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThan(100);
      // Width and height should be within 2 px of each other
      expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(2);
    }
  });

  test('SQL panel header does not overflow its container', async ({ page }) => {
    await openAndStartGame(page);
    const panelBox  = await page.locator('#sqlPanel').boundingBox();
    const headerBox = await page.locator('.sql-panel-header').boundingBox();
    if (panelBox && headerBox) {
      expect(headerBox.width).toBeLessThanOrEqual(panelBox.width + 1);
    }
  });

  test('SQL input section is fully visible within the SQL panel', async ({ page, viewport }) => {
    // On very short landscape screens (height < 500 px) the panel is compact by design;
    // the user can still interact — skip strict bounds check in that scenario.
    if (viewport && viewport.height < 500) test.skip();
    await openAndStartGame(page);
    const panelBox = await page.locator('#sqlPanel').boundingBox();
    const inputBox = await page.locator('#sqlInputSection').boundingBox();
    if (panelBox && inputBox) {
      // Input section top should be within the panel
      expect(inputBox.y).toBeGreaterThanOrEqual(panelBox.y - 1);
      // Input section bottom should be within the panel
      expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
    }
  });
});

// ── Toggle SQL panel ────────────────────────────────────────────────────────

test.describe('Toggle SQL panel', () => {
  test('SQL panel hides when toggle button is clicked', async ({ page }) => {
    await openAndStartGame(page);
    await page.click('#btnToggleSQL');
    await expect(page.locator('#sqlPanel')).toHaveClass(/hidden-panel/);
  });

  test('SQL panel reappears when toggle button is clicked again', async ({ page }) => {
    await openAndStartGame(page);
    await page.click('#btnToggleSQL');
    await page.click('#btnToggleSQL');
    await expect(page.locator('#sqlPanel')).not.toHaveClass(/hidden-panel/);
  });

  test('chess panel expands when SQL panel is hidden', async ({ page, viewport }) => {
    if (!viewport || viewport.width < 1024) test.skip();
    await openAndStartGame(page);

    const widthBefore = await page.locator('#chessPanel').evaluate(
      (el) => el.getBoundingClientRect().width
    );
    await page.click('#btnToggleSQL');
    // Wait for the CSS transition to finish (width change detectable via polling)
    await expect.poll(async () =>
      page.locator('#chessPanel').evaluate((el) => el.getBoundingClientRect().width)
    ).toBeGreaterThan(widthBefore);
  });
});

// ── SQL block content ───────────────────────────────────────────────────────

test.describe('SQL block content', () => {
  test('initial SQL block contains CREATE TABLE statements', async ({ page }) => {
    await openAndStartGame(page);
    const codeText = await page.locator('.sql-block .sql-code').first().textContent();
    expect(codeText?.toUpperCase()).toContain('CREATE TABLE');
  });

  test('a chess move appends a new SQL block', async ({ page }) => {
    await openAndStartGame(page);
    const before = await page.locator('.sql-block').count();

    // Click e2 then e4 to make a move
    await page.locator('.sq[data-square="e2"]').click();
    await page.locator('.sq[data-square="e4"]').click();

    const after = await page.locator('.sql-block').count();
    expect(after).toBeGreaterThan(before);
  });

  test('Clear SQL button removes all SQL blocks', async ({ page }) => {
    await openAndStartGame(page);
    // Make a move first
    await page.locator('.sq[data-square="e2"]').click();
    await page.locator('.sq[data-square="e4"]').click();
    await page.click('#btnClearSQL');
    await expect(page.locator('.sql-block')).toHaveCount(0);
  });
});

// ── Run SQL via textarea ────────────────────────────────────────────────────

test.describe('Execute SQL move via textarea', () => {
  test('typing a shorthand move and running it executes the move', async ({ page }) => {
    await openAndStartGame(page);
    await page.locator('#sqlMoveInput').fill('e2 e4');
    await page.click('#btnRunSQL');
    // After a successful move the error should be hidden
    await expect(page.locator('#sqlRunError')).toHaveClass(/hidden/);
  });

  test('invalid SQL shows an error message', async ({ page }) => {
    await openAndStartGame(page);
    await page.locator('#sqlMoveInput').fill('not valid sql');
    await page.click('#btnRunSQL');
    const errorEl = page.locator('#sqlRunError');
    await expect(errorEl).not.toHaveClass(/hidden/);
    const text = await errorEl.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });
});
