'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function UploadQrCode({ testMode = false }: { testMode?: boolean }) {
  const qrSize = testMode ? 320 : 280;
  const [uploadUrl, setUploadUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  useEffect(() => {
    let cancelled = false;
    const configuredBase = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (!configuredBase && process.env.NODE_ENV !== 'development') {
      console.error('[QR] 正式二维码需要配置 NEXT_PUBLIC_SITE_URL。');
      return;
    }
    try {
      const base = configuredBase ? new URL(configuredBase).origin : window.location.origin;
      if (process.env.NODE_ENV === 'production' &&
        (new URL(base).protocol !== 'https:' || /^(localhost|127\.0\.0\.1|10\..*|192\.168\..*|172\.(1[6-9]|2\d|3[01])\..*)$/i.test(new URL(base).hostname))) {
        console.error('[QR] 正式二维码需要公网 HTTPS 地址，请配置 NEXT_PUBLIC_SITE_URL。');
        return;
      }
      const nextUrl = `${base}/upload`;
      if (process.env.NODE_ENV === 'development') console.info('[QR] uploadUrl:', nextUrl);
      setUploadUrl(nextUrl);
      QRCode.toDataURL(nextUrl, {
        width: qrSize,
        margin: 4,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#FFFFFF' },
      }).then(dataUrl => {
        if (!cancelled) setQrDataUrl(dataUrl);
      }).catch(error => console.error('[QR] PNG generation failed:', error));
    } catch {
      console.error('[QR] NEXT_PUBLIC_SITE_URL 不是有效地址。');
    }
    return () => { cancelled = true; };
  }, [qrSize]);

  return <>
    <div className={`qr-code-frame${testMode ? ' qr-code-frame-test' : ''}`} aria-label="扫码进入上传页面">
      {qrDataUrl && <img className="qr-code-image" src={qrDataUrl} width={qrSize} height={qrSize} alt="扫码进入上传页面" />}
    </div>
    {uploadUrl && <p className={`qr-address${testMode ? ' qr-address-test' : ''}`}>二维码实际编码网址：<br /><a href={uploadUrl}>{uploadUrl}</a></p>}
  </>;
}
