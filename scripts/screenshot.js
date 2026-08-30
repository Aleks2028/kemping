/**
 * Скрипт делает скриншот сайта http://localhost:3000
 * Требует: Node.js + npm install puppeteer
 */

const puppeteer = require('puppeteer');

(async () => {
  console.log('🚀 Запускаю браузер…');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  console.log('📡 Открываю http://localhost:3000…');
  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
  } catch (e) {
    console.error('❌ Не удалось открыть сайт. Убедитесь, что Docker запущен и сайт работает.');
    console.error(e.message);
    await browser.close();
    process.exit(1);
  }

  // Ждём прелоадер
  await new Promise(r => setTimeout(r, 2000));

  console.log('📸 Делаю скриншот…');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `screenshot-${timestamp}.png`;

  await page.screenshot({
    path: filename,
    fullPage: true,  // полная страница, не только видимая часть
  });

  console.log(`✅ Готово! Сохранено: ${filename}`);
  console.log(`📁 Полный путь: ${require('path').resolve(filename)}`);

  await browser.close();
})();
