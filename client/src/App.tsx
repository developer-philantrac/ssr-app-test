import { useState, useEffect } from 'react'
import './App.css'

const VALID_EMAIL = 'developer@philantrac.com';
const VALID_PASSWORD = 'Arsal786920!';

type StatusType = 'info' | 'success' | 'error';

function App() {
  const [sitemapUrl, setSitemapUrl] = useState('')
  const [metaApiBase, setMetaApiBase] = useState('')
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState<StatusType>('info')
  const [urls, setUrls] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [cacheStatus, setCacheStatus] = useState<{ [url: string]: string }>({})
  const [loggedIn, setLoggedIn] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [pageHtml, setPageHtml] = useState<string>('');
  const [showModal, setShowModal] = useState(false);

  // On login, fetch last config and URLs, then check cache status
  useEffect(() => {
    if (loggedIn) {
      // Try to load last config from backend
      fetch('http://localhost:5000/api/last-config')
        .then(res => res.json())
        .then(data => {
          if (data.sitemapUrl) setSitemapUrl(data.sitemapUrl)
          if (data.metaApiBase) setMetaApiBase(data.metaApiBase)
          if (data.sitemapUrl) {
            fetchUrlsAndCheck(data.sitemapUrl)
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line
  }, [loggedIn]);

  // Helper: fetch URLs and check cache status
  const fetchUrlsAndCheck = async (urlToFetch: string) => {
    setStatus('Fetching URLs...')
    setStatusType('info')
    setUrls([])
    setCacheStatus({})
    try {
      const res = await fetch('http://localhost:5000/api/sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sitemapUrl: urlToFetch })
      })
      const data = await res.json()
      setUrls(data.urls || [])
      setStatus('URLs loaded. Checking cache status...')
      setStatusType('info')
      // Now check cache status
      const statusMap: { [url: string]: string } = {}
      for (const url of data.urls || []) {
        try {
          const res = await fetch(`http://localhost:5000/prerender?url=${encodeURIComponent(url)}&admin=1`)
          if (res.ok) {
            statusMap[url] = 'Cached'
          } else {
            statusMap[url] = 'Not Cached'
          }
        } catch {
          statusMap[url] = 'Not Cached'
        }
      }
      setCacheStatus(statusMap)
      setStatus('Cache status updated.')
      setStatusType('success')
    } catch (e) {
      setStatus('Failed to fetch URLs.')
      setStatusType('error')
    }
  }

  // Login handler
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email === VALID_EMAIL && password === VALID_PASSWORD) {
      setLoggedIn(true);
      setLoginError('');
    } else {
      setLoginError('Invalid email or password.');
    }
  };

  // Save config to backend
  const saveConfig = async () => {
    setStatus('Saving config...')
    setStatusType('info')
    try {
      const res = await fetch('http://localhost:5000/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sitemapUrl, metaApiBase })
      })
      if (res.ok) {
        setStatus('Config saved!')
        setStatusType('success')
      } else {
        setStatus('Failed to save config.')
        setStatusType('error')
      }
    } catch (e) {
      setStatus('Error saving config.')
      setStatusType('error')
    }
  }

  // Fetch URLs from sitemap
  const fetchUrls = async () => {
    setStatus('Fetching URLs...')
    setStatusType('info')
    setUrls([])
    setCacheStatus({})
    try {
      const res = await fetch('http://localhost:5000/api/sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sitemapUrl })
      })
      const data = await res.json()
      setUrls(data.urls || [])
      setStatus('URLs loaded.')
      setStatusType('success')
    } catch (e) {
      setStatus('Failed to fetch URLs.')
      setStatusType('error')
    }
  }

  // Trigger recaching
  const recache = async () => {
    setLoading(true)
    setStatus('Prerendering and caching...')
    setStatusType('info')
    try {
      const res = await fetch('http://localhost:5000/api/prerender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, metaApiBase })
      })
      if (res.ok) {
        setStatus('Prerendering complete!')
        setStatusType('success')
      } else {
        setStatus('Prerendering failed.')
        setStatusType('error')
      }
    } catch (e) {
      setStatus('Error during prerendering.')
      setStatusType('error')
    }
    setLoading(false)
  }

  // Check cache status for all URLs
  const checkCacheStatus = async () => {
    setStatus('Checking cache status...')
    setStatusType('info')
    const statusMap: { [url: string]: string } = {}
    for (const url of urls) {
      try {
        const res = await fetch(`http://localhost:5000/prerender?url=${encodeURIComponent(url)}&admin=1`)
        if (res.ok) {
          statusMap[url] = 'Cached'
        } else {
          statusMap[url] = 'Not Cached'
        }
      } catch {
        statusMap[url] = 'Not Cached'
      }
    }
    setCacheStatus(statusMap)
    setStatus('Cache status updated.')
    setStatusType('success')
  }

  // Fetch prerendered HTML for a selected URL
  const handleViewPage = async (url: string) => {
    setSelectedUrl(url);
    setShowModal(true);
    setPageHtml('Loading...');
    try {
      const res = await fetch(`http://localhost:5000/prerender?url=${encodeURIComponent(url)}&admin=1`);
      const html = await res.text();
      setPageHtml(html);
    } catch (e) {
      setPageHtml('Failed to load HTML.');
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedUrl(null);
    setPageHtml('');
  };

  if (!loggedIn) {
    return (
      <div className="login-container">
        <form className="login-form" onSubmit={handleLogin}>
          <h2>Login to SSR Dashboard</h2>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button type="submit">Login</button>
          {loginError && <div className="login-error">{loginError}</div>}
        </form>
      </div>
    );
  }

  return (
    <div className="container styled-dashboard">
      <h1>SSR Prerender Dashboard</h1>
      <div className="form-group">
        <label>Sitemap URL (.txt or JSON):</label>
        <input value={sitemapUrl} onChange={e => setSitemapUrl(e.target.value)} style={{ width: '100%' }} />
      </div>
      <div className="form-group">
        <label>Meta API Base URL:</label>
        <input value={metaApiBase} onChange={e => setMetaApiBase(e.target.value)} style={{ width: '100%' }} />
      </div>
      <div className="button-row">
        <button onClick={saveConfig} disabled={loading}>Save Config</button>
        <button onClick={fetchUrls} disabled={loading || !sitemapUrl}>Load URLs</button>
        <button onClick={recache} disabled={loading || urls.length === 0 || !metaApiBase}>Prerender & Cache</button>
        <button onClick={checkCacheStatus} disabled={loading || urls.length === 0}>Check Cache Status</button>
      </div>
      <div className={`status-message ${statusType}`}>{status}</div>
      <div className="urls-list">
        <h3>URLs to Prerender:</h3>
        <ul>
          {urls.map(url => (
            <li key={url}>
              {url} {' '}
              <span style={{ color: cacheStatus[url] === 'Cached' ? 'green' : 'red' }}>
                {cacheStatus[url] || ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <h3>Cached URLs</h3>
      <ul>
        {urls.map(url => (
          <li key={url} style={{ marginBottom: 8 }}>
            <span>{url}</span>
            {cacheStatus[url] === 'Cached' && (
              <button style={{ marginLeft: 8 }} onClick={() => handleViewPage(url)}>
                View
              </button>
            )}
            {cacheStatus[url] !== 'Cached' && (
              <span style={{ marginLeft: 8, color: 'gray' }}>Not Cached</span>
            )}
          </li>
        ))}
      </ul>
      {/* Modal for viewing HTML and meta */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={handleCloseModal}>
          <div style={{ background: '#222', padding: 24, borderRadius: 8, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto', color: '#fff' }} onClick={e => e.stopPropagation()}>
            <h4 style={{ color: '#fff' }}>Rendered Page: {selectedUrl}</h4>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 350 }}>
                <iframe
                  srcDoc={pageHtml && !/^\s*<\!\-\-/.test(pageHtml) ? pageHtml : undefined}
                  title="Rendered Page"
                  style={{ width: '100%', height: '50vh', border: '1px solid #444', background: '#fff' }}
                />
                <div style={{ marginTop: 8 }}>
                  <a
                    href={`http://localhost:5000/prerender?url=${encodeURIComponent(selectedUrl || '')}&admin=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#b5e853', textDecoration: 'underline', fontSize: 14 }}
                  >
                    Open in new tab
                  </a>
                </div>
                {(!pageHtml || /^\s*<\!\-\-/.test(pageHtml)) && (
                  <div style={{ color: '#ffb', background: '#333', padding: 12, borderRadius: 4, marginTop: 8 }}>
                    No preview available or invalid HTML.
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 350 }}>
                <h5 style={{ color: '#fff' }}>Page Source & Meta</h5>
                <pre style={{ maxHeight: '50vh', overflow: 'auto', background: '#181818', color: '#b5e853', padding: 12, borderRadius: 4, fontSize: 13, wordBreak: 'break-all' }}>
                  {pageHtml}
                </pre>
              </div>
            </div>
            <button onClick={handleCloseModal} style={{ marginTop: 24, background: '#111', color: '#fff', padding: '8px 24px', border: 'none', borderRadius: 8, fontSize: 18, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
