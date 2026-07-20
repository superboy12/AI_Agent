module.exports = {
  apps: [
    {
      name: "AiBot",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/index.ts",
      cwd: "D:\\AiAgent",
      watch: false
    }
  ]
};
