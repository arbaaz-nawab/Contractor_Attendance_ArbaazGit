import { useState } from 'react';
import Layout from '../components/Layout';
import SignInForm from '../components/SignInForm';
import SignOutForm from '../components/SignOutForm';
import EngineerOvertimeForm from '../components/EngineerOvertimeForm';
import Link from 'next/link';

export default function Home() {
  const [userType, setUserType] = useState(''); // '' | 'contractor' | 'staff'
  const [tab, setTab]           = useState('signin'); // 'signin' | 'signout'

  return (
    <Layout>

      {/* ── Step 0: Who are you signing in as? ──────────────────────────────── */}
      {!userType && (
        <div className="card" style={{ marginTop: 8 }}>
          <p className="card__title">Who are you signing in as?</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            <button
              className="btn btn--primary"
              onClick={() => setUserType('contractor')}
            >
              Contractor
            </button>
            <button
              className="btn btn--secondary"
              onClick={() => setUserType('staff')}
            >
              Goodenough College Staff
            </button>
          </div>
        </div>
      )}

      {/* ── Contractor flow ──────────────────────────────────────────────────── */}
      {userType === 'contractor' && (
        <>
          <button
            style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', padding: '4px 0 12px', display: 'block' }}
            onClick={() => { setUserType(''); setTab('signin'); }}
          >
            ← Change selection
          </button>

          <div className="nav-tabs">
            <button
              className={`nav-tab ${tab === 'signin' ? 'nav-tab--active' : ''}`}
              onClick={() => setTab('signin')}
            >
              Sign In
            </button>
            <button
              className={`nav-tab ${tab === 'signout' ? 'nav-tab--active' : ''}`}
              onClick={() => setTab('signout')}
            >
              Sign Out
            </button>
          </div>

          {tab === 'signin' ? <SignInForm /> : <SignOutForm />}
        </>
      )}

      {/* ── Staff / Engineer Overtime flow ───────────────────────────────────── */}
      {userType === 'staff' && (
        <>
          <button
            style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', padding: '4px 0 12px', display: 'block' }}
            onClick={() => setUserType('')}
          >
            ← Change selection
          </button>

          <EngineerOvertimeForm />
        </>
      )}

      <div className="text-center mt-4" style={{ padding: '8px 0 24px' }}>
        <Link href="/dashboard" style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', textDecoration: 'none' }}>
          Manager Dashboard →
        </Link>
      </div>
    </Layout>
  );
}
