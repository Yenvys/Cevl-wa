module.exports = {
  apps: [{
    name: 'cevl-bot',
    script: 'main.js',
    interpreter: 'node',
    
    // Instance & mode
    instances: 1,
    exec_mode: 'fork',
    
    // Auto-restart
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 5000,
    
    // Memory management
    max_memory_restart: '500M',
    
    // Logging
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './data/logs/error.log',
    out_file: './data/logs/output.log',
    merge_logs: true,
    log_type: 'json',
    
    // Environment
    env: {
      NODE_ENV: 'production'
    },
    env_development: {
      NODE_ENV: 'development'
    },
    
    // Graceful shutdown
    kill_timeout: 10000,
    listen_timeout: 5000,
    shutdown_with_message: true
  }]
};
