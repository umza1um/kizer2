/**
 * Android QA smoke test against production (Playwright Pixel 7 profile).
 * Run: node scripts/android-qa.mjs
 */
import { chromium, devices } from "playwright";

const BASE = process.env.QA_BASE_URL || "https://kizer2.vercel.app";
const results = [];

function log(step, status, detail = "") {
  const entry = { step, status, detail };
  results.push(entry);
  const icon = status === "ok" ? "✓" : status === "warn" ? "!" : "✗";
  console.log(`${icon} ${step}${detail ? `: ${detail}` : ""}`);
}

async function main() {
  const device = devices["Pixel 7"];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...device,
    locale: "ru-RU",
    permissions: ["microphone"],
  });
  const page = await context.newPage();

  // --- 1. Главная ---
  try {
    const res = await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
    log("1.1 Открыть главную", res?.ok() ? "ok" : "fail", `HTTP ${res?.status()}`);
    await page.getByText("КИЗЕР").waitFor({ timeout: 5000 });
    log("1.2 Заголовок «КИЗЕР»", "ok");
    for (const [label, path] of [
      ["Режим 1 — вопросы", "/questions"],
      ["Режим 2 — фото", "/photo"],
      ["Режим 3 — фото v2", "/photo-v2"],
    ]) {
      const link = page.locator(`a[href="${path}"]`);
      const visible = await link.isVisible();
      log(`1.3 Карточка «${label}»`, visible ? "ok" : "fail");
    }
    for (const [label, path] of [
      ["настройки", "/settings"],
      ["логи", "/logs"],
      ["админка", "/admin"],
    ]) {
      const btn = page.locator(`a[href="${path}"]`);
      log(`1.4 Кнопка «${label}»`, (await btn.isVisible()) ? "ok" : "fail");
    }
  } catch (e) {
    log("1. Главная", "fail", String(e.message || e));
  }

  // --- 2. Вопросы — текстовый ввод ---
  try {
    await page.goto(`${BASE}/questions`, { waitUntil: "networkidle", timeout: 30000 });
    log("2.1 Страница /questions", "ok");

    const input = page.locator('input[name="question"]');
    await input.waitFor({ timeout: 5000 });
    log("2.2 Поле ввода вопроса", (await input.isVisible()) ? "ok" : "fail");

    const sendBtn = page.getByLabel("Отправить вопрос");
    const micBtn = page.getByLabel(/Удерживайте|Слушаю/);
    const sendBox = await sendBtn.boundingBox();
    const micBox = await micBtn.boundingBox();
    if (sendBox && micBox) {
      const overlap =
        sendBox.x < micBox.x + micBox.width &&
        sendBox.x + sendBox.width > micBox.x &&
        sendBox.y < micBox.y + micBox.height &&
        sendBox.y + sendBox.height > micBox.y;
      log("2.3 Кнопки → и 🎤 не перекрываются", overlap ? "fail" : "ok",
        overlap ? "overlap detected" : `send x=${Math.round(sendBox.x)} mic x=${Math.round(micBox.x)}`);
    }

    const speechApi = await page.evaluate(() => ({
      recognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
      synthesis: !!window.speechSynthesis,
    }));
    log("2.4 Web Speech API (recognition)", speechApi.recognition ? "ok" : "warn",
      speechApi.recognition ? "доступен в Chromium Android" : "недоступен в headless");
    log("2.5 Web Speech API (synthesis)", speechApi.synthesis ? "ok" : "warn");

    const question = "Что такое Эрмитаж? Ответь в одном предложении.";
    await input.fill(question);
    log("2.6 Ввести текст вопроса", "ok", question.slice(0, 40) + "…");

    const chatPromise = page.waitForResponse(
      (r) => r.url().includes("/api/questions/chat") && r.request().method() === "POST",
      { timeout: 60000 }
    );
    await sendBtn.click();
    log("2.7 Нажать «→» отправить", "ok");

    const chatRes = await chatPromise;
    const chatStatus = chatRes.status();
    let answerText = "";
    if (chatStatus === 200) {
      const body = await chatRes.json().catch(() => ({}));
      answerText = body?.reply || body?.message || body?.content || JSON.stringify(body).slice(0, 120);
      log("2.8 API /api/questions/chat", "ok", `HTTP 200, ответ ~${answerText.length} симв.`);
    } else {
      log("2.8 API /api/questions/chat", "fail", `HTTP ${chatStatus}`);
    }

    await page.getByText("Ваш последний вопрос:").waitFor({ timeout: 5000 });
    log("2.9 Блок «Ваш последний вопрос»", "ok");

    const thinking = page.locator('[class*="ThinkingIndicator"], text=собираюсь с мыслями').first();
    const sawThinking = await thinking.isVisible().catch(() => false);
    log("2.10 Индикатор «собираюсь с мыслями»", sawThinking ? "ok" : "warn",
      sawThinking ? "показан во время запроса" : "не пойман (быстрый ответ?)");

    await page.waitForTimeout(3000);
    const answerBlock = page.locator("text=Ответ Кизера").locator("..");
    const answerVisible = await page.getByText("Ответ Кизера").isVisible();
    log("2.11 Блок «Ответ Кизера»", answerVisible ? "ok" : "fail");

    const pageText = await page.locator("main").innerText();
    const hasAnswer = pageText.length > 200 && (answerText ? pageText.includes(answerText.slice(0, 20)) : true);
    log("2.12 Текст ответа на экране", hasAnswer ? "ok" : "warn",
      hasAnswer ? "контент появился" : "проверьте вручную");

    const scrubber = page.locator('input[type="range"]');
    const scrubberCount = await scrubber.count();
    log("2.13 TTS-ползунок (scrubber)", scrubberCount > 0 ? "ok" : "warn",
      scrubberCount > 0 ? "найден" : "нет (browser TTS или короткий ответ)");

    // Mic pointer events (без реального аудио)
    await micBtn.dispatchEvent("pointerdown");
    await page.waitForTimeout(500);
    const micListening = await micBtn.getAttribute("aria-label");
    log("2.14 Зажать 🎤 (pointerdown)", micListening?.includes("Слушаю") ? "ok" : "warn",
      micListening || "");
    await micBtn.dispatchEvent("pointerup");
    await page.waitForTimeout(800);
    log("2.15 Отпустить 🎤 (pointerup)", "ok", "сессия завершена без краша");

    const homeLink = page.getByRole("link", { name: "На главную" });
    log("2.16 Ссылка «На главную»", (await homeLink.isVisible()) ? "ok" : "fail");
  } catch (e) {
    log("2. Вопросы", "fail", String(e.message || e));
  }

  // --- 3. Настройки TTS ---
  try {
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle", timeout: 30000 });
    log("3.1 Страница /settings", "ok");
    const title = await page.getByRole("heading", { name: "Настройки" }).isVisible();
    log("3.2 Заголовок настроек", title ? "ok" : "fail");

    const selects = page.locator("select");
    const selectCount = await selects.count();
    log("3.3 Селекты TTS", selectCount > 0 ? "ok" : "warn", `найдено: ${selectCount}`);

    const previewBtn = page.getByRole("button", { name: /прослуш|preview|тест/i });
    if ((await previewBtn.count()) > 0) {
      const ttsPromise = page.waitForResponse(
        (r) => r.url().includes("/api/tts/speak"),
        { timeout: 15000 }
      ).catch(() => null);
      await previewBtn.first().click();
      const ttsRes = await ttsPromise;
      log("3.4 Кнопка предпрослушивания", ttsRes ? (ttsRes.ok() ? "ok" : "warn") : "warn",
        ttsRes ? `HTTP ${ttsRes.status()}` : "запрос не ушёл (browser TTS?)");
    } else {
      log("3.4 Кнопка предпрослушивания", "warn", "кнопка не найдена по тексту");
    }

    await page.getByRole("link", { name: "На главную" }).click();
    log("3.5 «На главную» из настроек", "ok");
  } catch (e) {
    log("3. Настройки", "fail", String(e.message || e));
  }

  // --- 4. Фото режим ---
  try {
    await page.goto(`${BASE}/photo`, { waitUntil: "networkidle", timeout: 30000 });
    log("4.1 Страница /photo", "ok");
    const fileInput = page.locator('input[type="file"]');
    log("4.2 Input для фото", (await fileInput.count()) > 0 ? "ok" : "warn");
    log("4.3 Камера на эмуляторе", "warn", "нужен реальный Android — автотест не снимает фото");
  } catch (e) {
    log("4. Фото", "fail", String(e.message || e));
  }

  // --- 5. Фото v2 ---
  try {
    await page.goto(`${BASE}/photo-v2`, { waitUntil: "networkidle", timeout: 30000 });
    log("5.1 Страница /photo-v2", "ok");
  } catch (e) {
    log("5. Фото v2", "fail", String(e.message || e));
  }

  // --- 6. Логи ---
  try {
    await page.goto(`${BASE}/logs`, { waitUntil: "networkidle", timeout: 30000 });
    log("6.1 Страница /logs", "ok");
    const body = await page.locator("main").innerText();
    log("6.2 Содержимое логов", body.length > 10 ? "ok" : "warn", `${body.length} симв.`);
  } catch (e) {
    log("6. Логи", "fail", String(e.message || e));
  }

  // --- 7. Админка ---
  try {
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 30000 });
    log("7.1 Страница /admin", "ok");
  } catch (e) {
    log("7. Админка", "fail", String(e.message || e));
  }

  // --- API direct ---
  try {
    const apiRes = await page.request.post(`${BASE}/api/questions/chat`, {
      data: {
        message: "Привет",
        messages: [],
      },
      timeout: 60000,
    });
    log("8.1 API chat напрямую", apiRes.ok() ? "ok" : "fail", `HTTP ${apiRes.status()}`);
  } catch (e) {
    log("8. API", "fail", String(e.message || e));
  }

  await browser.close();

  const ok = results.filter((r) => r.status === "ok").length;
  const warn = results.filter((r) => r.status === "warn").length;
  const fail = results.filter((r) => r.status === "fail").length;
  console.log(`\n--- Итого: ${ok} ok, ${warn} warn, ${fail} fail ---`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
