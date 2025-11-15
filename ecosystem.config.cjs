module.exports = {
  apps: [
    {
      name: "mcp-server",
      script: "server.js",
      cwd: ".",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "mcp-http",
      script: "server_http.js",
      cwd: ".",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
        HTTP_PORT: 5379
      }
    },
    {
      name: "mcp-worker",
      script: "worker.js",
      cwd: ".",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
