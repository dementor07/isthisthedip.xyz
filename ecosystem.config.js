// PM2 Production Configuration for isthisthedip.xyz
module.exports = {
  apps: [{
    name: 'isthisthedip-api',
    script: 'api/server.js',
    instances: 'max', // Use all CPU cores
    exec_mode: 'cluster',
    
    // Environment
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // Monitoring
    monitoring: true,
    pmx: true,
    
    // Logging
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Process management
    watch: false, // Don't watch in production
    ignore_watch: ['node_modules', 'logs', '*.log'],
    max_memory_restart: '500M',
    
    // Restart policy
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Advanced options
    node_args: '--max-old-space-size=1024',
    
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Environment variables
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      INSTANCE_ID: 0
    }
  }],

  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server-ip'],
      ref: 'origin/main',
      repo: 'https://github.com/yourusername/isthisthedip.xyz.git',
      path: '/var/www/isthisthedip.xyz',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production && pm2 save'
    }
  }
};