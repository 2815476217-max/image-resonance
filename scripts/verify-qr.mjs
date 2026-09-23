import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const expected = 'https://exhibition-web-318184-7-1492951929.sh.run.tcloudbase.com/upload';
const buffer = await QRCode.toBuffer(expected, {
  type: 'png',
  width: 280,
  margin: 4,
  errorCorrectionLevel: 'M',
  color: { dark: '#000000', light: '#FFFFFF' },
});
const png = PNG.sync.read(buffer);
const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
if (decoded?.data !== expected) {
  throw new Error(`QR decode mismatch: ${decoded?.data || 'no result'}`);
}
console.log(`[QR VERIFY] decoded URL: ${decoded.data}`);
