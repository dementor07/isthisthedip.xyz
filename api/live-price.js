// Vercel serverless function for live price data
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
    const { crypto } = req.query;
    
    if (!crypto) {
      return res.status(400).json({ error: 'Crypto symbol required' });
    }

    // Fetch live price data
    const priceData = await fetchLivePriceData(crypto);
    
    if (!priceData) {
      return res.status(404).json({ error: 'Cryptocurrency not found' });
    }

    return res.status(200).json({
      crypto: crypto.toLowerCase(),
      ...priceData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Live price data error:', error);
    return res.status(500).json({ error: 'Failed to fetch live price data' });
  }
}

async function fetchLivePriceData(crypto) {
  try {
    // Try CoinGecko first
    const coinGeckoResponse = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${crypto}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&include_last_updated_at=true`
    );
    
    if (coinGeckoResponse.ok) {
      const data = await coinGeckoResponse.json();
      const coinData = data[crypto] || data[Object.keys(data)[0]];
      
      if (coinData) {
        return {
          name: crypto.charAt(0).toUpperCase() + crypto.slice(1),
          symbol: crypto.toUpperCase(),
          price: coinData.usd,
          change_24h: coinData.usd_24h_change || 0,
          volume_24h: coinData.usd_24h_vol || 0,
          market_cap: coinData.usd_market_cap || 0,
          last_updated: coinData.last_updated_at ? new Date(coinData.last_updated_at * 1000) : new Date()
        };
      }
    }

    // Fallback: try to find by symbol
    const searchResponse = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${crypto}&order=market_cap_desc&per_page=1&page=1`
    );
    
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      if (searchData && searchData.length > 0) {
        const coin = searchData[0];
        return {
          name: coin.name,
          symbol: coin.symbol.toUpperCase(),
          price: coin.current_price,
          change_24h: coin.price_change_percentage_24h || 0,
          volume_24h: coin.total_volume || 0,
          market_cap: coin.market_cap || 0,
          last_updated: new Date()
        };
      }
    }

    // Final fallback: search by symbol
    const symbolSearchResponse = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1`
    );
    
    if (symbolSearchResponse.ok) {
      const coins = await symbolSearchResponse.json();
      const coin = coins.find(c => c.symbol.toLowerCase() === crypto.toLowerCase());
      
      if (coin) {
        return {
          name: coin.name,
          symbol: coin.symbol.toUpperCase(),
          price: coin.current_price,
          change_24h: coin.price_change_percentage_24h || 0,
          volume_24h: coin.total_volume || 0,
          market_cap: coin.market_cap || 0,
          last_updated: new Date()
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching live price data:', error);
    return null;
  }
}