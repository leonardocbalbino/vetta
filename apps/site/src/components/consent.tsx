'use client';

import { Button, Switch } from '@vetta/ui';
import Script from 'next/script';
import { useEffect, useState } from 'react';

const KEY = 'vetta:consent';
/** Versão do texto do banner: mudou o texto, pede de novo. */
const VERSION = '2026-11';
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

interface Consent {
  version: string;
  analytics: boolean;
  marketing: boolean;
  at: string;
}

function read(): Consent | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Consent | null;
    return c?.version === VERSION ? c : null;
  } catch {
    return null;
  }
}

/** Abre o banner de novo (link "Preferências de cookies" no rodapé). */
export const openConsent = () => window.dispatchEvent(new Event('vetta:consent:open'));

/**
 * Banner LGPD. GA4 e Meta Pixel só carregam depois do consentimento explícito
 * para cada finalidade; sem escolha, nada de terceiros é carregado.
 */
export function ConsentManager() {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const c = read();
    setConsent(c);
    setOpen(!c);
    const reopen = () => {
      const cur = read();
      setAnalytics(cur?.analytics ?? false);
      setMarketing(cur?.marketing ?? false);
      setCustom(true);
      setOpen(true);
    };
    window.addEventListener('vetta:consent:open', reopen);
    return () => window.removeEventListener('vetta:consent:open', reopen);
  }, []);

  const save = (a: boolean, m: boolean) => {
    const c = { version: VERSION, analytics: a, marketing: m, at: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(c));
    setConsent(c);
    setOpen(false);
    // Revogar exige recarregar para descarregar scripts já executados.
    if (consent && ((consent.analytics && !a) || (consent.marketing && !m)))
      window.location.reload();
  };

  return (
    <>
      {consent?.analytics && GA_ID ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}',{anonymize_ip:true});`}
          </Script>
        </>
      ) : null}
      {consent?.marketing && PIXEL_ID ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');fbq('track','PageView');`}
        </Script>
      ) : null}
      {open ? (
        <div
          role="dialog"
          aria-labelledby="consent-title"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-2xl flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-lg"
        >
          <h2 id="consent-title" className="font-semibold">
            Sua privacidade
          </h2>
          <p className="text-sm text-muted-foreground">
            Usamos cookies essenciais para o site funcionar. Com a sua permissão, também usamos
            cookies de análise (Google Analytics) e de marketing (Meta Pixel). Saiba mais na{' '}
            <a href="/privacidade" className="text-action underline">
              política de privacidade
            </a>
            .
          </p>
          {custom ? (
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex min-h-11 items-center gap-3">
                <Switch checked={analytics} onCheckedChange={setAnalytics} /> Análise de uso
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <Switch checked={marketing} onCheckedChange={setMarketing} /> Marketing
              </label>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {custom ? (
              <Button onClick={() => save(analytics, marketing)}>Salvar escolhas</Button>
            ) : (
              <>
                <Button onClick={() => save(true, true)}>Aceitar todos</Button>
                <Button variant="secondary" onClick={() => save(false, false)}>
                  Só essenciais
                </Button>
                <Button variant="ghost" onClick={() => setCustom(true)}>
                  Personalizar
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ConsentLink() {
  return (
    <button type="button" onClick={openConsent} className="min-h-11 hover:underline">
      Preferências de cookies
    </button>
  );
}
