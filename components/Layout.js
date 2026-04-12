import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';

export default function Layout({ children, title, wide = false }) {
  const appTitle = 'Estates Contractor Log';

  return (
    <>
      <Head>
        <title>{title ? `${title} | ${appTitle}` : appTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#0070f3" />
      </Head>

      <header className="header">
        <div className="header__inner">
          <Link href="/" style={{ textDecoration: 'none' }}>
            <CollegeLogo />
          </Link>
          <h1 className="header__title">{appTitle}</h1>
          <p className="header__subtitle">Contractor Sign In / Sign Out</p>
        </div>
      </header>

      <main className={wide ? 'container--wide' : 'container'}>
        {children}
      </main>

      <footer style={{
        textAlign: 'center',
        padding: '28px 16px',
        color: 'var(--text-muted)',
        fontSize: '0.75rem',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg)',
        marginTop: '16px',
      }}>
        {appTitle} &mdash; Site Access Record
      </footer>
    </>
  );
}

function CollegeLogo() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <div className="header__logo-placeholder">GE</div>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/goodenough-logo.png"
      alt="Goodenough College"
      className="header__logo"
      onError={() => setFailed(true)}
    />
  );
}
