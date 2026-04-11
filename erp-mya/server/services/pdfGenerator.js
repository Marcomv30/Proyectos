/**
 * pdfGenerator.js — Genera PDF desde HTML usando puppeteer-core + Chrome local
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export async function htmlToPdf(htmlContent) {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '8mm', right: '10mm', bottom: '8mm', left: '10mm' },
      printBackground: true,
    });
    // page.pdf() puede devolver Uint8Array en versiones recientes — normalizar a Buffer
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
