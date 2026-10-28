import { useEffect, useState } from 'react'

type ExchangeQuote = { code: string; name: string; bid: string; ask: string; pctChange: string; create_date: string }
type ExchangeData = { USDBRL: ExchangeQuote; EURBRL: ExchangeQuote }
const CURRENCY_CACHE_TTL = 60000

export default function CurrencyPanel() {
  const [quotes, setQuotes] = useState<ExchangeData | null>(null)
  const [error, setError] = useState(false)

  const loadQuotes = async (forceRefresh = false) => {
    const cached = sessionStorage.getItem('hub-currency')
    if (!forceRefresh && cached) {
      try {
        const saved = JSON.parse(cached) as { timestamp: number; quotes: ExchangeData }
        if (Date.now() - saved.timestamp < CURRENCY_CACHE_TTL) {
          setQuotes(saved.quotes)
          setError(false)
          return
        }
      } catch {
        sessionStorage.removeItem('hub-currency')
      }
    }

    try {
      const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL')
      if (!response.ok) throw new Error('exchange')
      const nextQuotes = await response.json() as ExchangeData
      sessionStorage.setItem('hub-currency', JSON.stringify({ timestamp: Date.now(), quotes: nextQuotes }))
      setQuotes(nextQuotes)
      setError(false)
    } catch {
      setError(true)
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadQuotes(), 0)
    const timer = window.setInterval(() => void loadQuotes(), CURRENCY_CACHE_TTL)
    const refreshQuotes = () => void loadQuotes(true)
    window.addEventListener('hub:data-refresh', refreshQuotes)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(timer)
      window.removeEventListener('hub:data-refresh', refreshQuotes)
    }
  }, [])

  const money = (value: string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const quoteRows = quotes ? [
    { code: 'BRL', label: 'Real brasileiro', value: 'R$ 1,00', change: '0,00%' },
    { code: 'USD', label: 'Dólar americano', value: money(quotes.USDBRL.bid), change: `${Number(quotes.USDBRL.pctChange).toFixed(2).replace('.', ',')}%` },
    { code: 'EUR', label: 'Euro', value: money(quotes.EURBRL.bid), change: `${Number(quotes.EURBRL.pctChange).toFixed(2).replace('.', ',')}%` },
  ] : []

  return (
    <section className="currency-panel">
      <div className="currency-heading">
        <div><span className="section-kicker">MERCADO EM TEMPO REAL</span><h3>Cotações</h3></div>
        <span className="currency-live"><span className="live-dot" /> Atualização a cada minuto</span>
      </div>
      {error && !quotes ? (
        <div className="currency-error">Cotações temporariamente indisponíveis. Tentaremos novamente.</div>
      ) : (
        <div className="currency-table">
          <div className="currency-table-head"><span>Ativo</span><span>Valor em BRL</span><span>Variação</span></div>
          {quoteRows.map((row) => (
            <div className="currency-row" key={row.code}>
              <span className="currency-name"><b>{row.code}</b><small>{row.label}</small></span>
              <strong>{row.value}</strong>
              <span className={row.change.startsWith('-') ? 'negative' : 'positive'}>{row.change}</span>
            </div>
          ))}
        </div>
      )}
      {error && quotes && <small className="currency-stale-error" role="status">Cotações indisponíveis; mostrando os valores da última coleta.</small>}
      {quotes && <small className="currency-updated">Compra de referência · última coleta: {new Date(quotes.USDBRL.create_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>}
    </section>
  )
}
