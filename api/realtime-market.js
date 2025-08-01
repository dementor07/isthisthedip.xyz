// Vercel serverless function for real-time market data
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch market data from multiple sources
    const [topCoins, fearGreed, marketData] = await Promise.allSettled([
      fetchTopCoinsData(),
      fetchFearGreedIndex(),
      fetchGlobalMarketData()
    ]);

    const response = {
      topCoins: topCoins.status === 'fulfilled' ? topCoins.value : [],
      fearGreed: fearGreed.status === 'fulfilled' ? fearGreed.value : { value: 50 },
      market: marketData.status === 'fulfilled' ? marketData.value : {},
      timestamp: new Date().toISOString(),
      status: 'success'
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Real-time market data error:', error);
    return res.status(500).json({ error: 'Failed to fetch market data' });
  }
}

async function fetchTopCoinsData() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h');
    const data = await response.json();
    
    return data.map(coin => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      price: coin.current_price,
      change_24h: coin.price_change_percentage_24h,
      market_cap: coin.market_cap,
      volume: coin.total_volume,
      image: coin.image
    }));
  } catch (error) {
    console.error('Error fetching top coins:', error);
    return [];
  }
}

async function fetchFearGreedIndex() {
  try {
    const response = await fetch('https://api.alternative.me/fng/');
    if (!response.ok) {
      console.error('Fear & Greed API error:', response.status);
      return { value: 50, classification: 'Neutral' };
    }
    const data = await response.json();
    return {
      value: parseInt(data.data[0].value),
      classification: data.data[0].value_classification,
      timestamp: data.data[0].timestamp
    };
  } catch (error) {
    console.error('Error fetching fear & greed index:', error);
    return { value: 50, classification: 'Neutral' };
  }
}

async function fetchGlobalMarketData() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/global');
    const data = await response.json();
    
    return {
      total_market_cap: data.data.total_market_cap.usd,
      total_volume: data.data.total_volume.usd,
      market_cap_change_24h: data.data.market_cap_change_percentage_24h_usd,
      active_cryptocurrencies: data.data.active_cryptocurrencies,
      markets: data.data.markets,
      market_cap_percentage: data.data.market_cap_percentage
    };
  } catch (error) {
    console.error('Error fetching global market data:', error);
    return {};
  }
}