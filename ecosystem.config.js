module.exports = {
  apps: [
    {
      name: "AiBot",
      script: "npm",
      args: "run start",
      interpreter: "none",
      cwd: __dirname,
      watch: false
    },
    {
      name: "AiWorker",
      script: "npm",
      args: "run start:worker",
      interpreter: "none",
      cwd: __dirname,
      watch: false
    }
  ]
};
