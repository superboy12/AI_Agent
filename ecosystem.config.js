module.exports = {
  apps: [
    {
      name: "AiBot",
      script: "npm",
      args: "run start",
      interpreter: "none",
      cwd: __dirname,
      watch: false
    }
  ]
};
