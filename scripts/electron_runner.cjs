const { spawn } = require("child_process");

function start() {
  spawn("npm.cmd", ["run", "dev:electron"], {
    cwd: "D:/ems",
    stdio: "inherit",
    shell: true
  }).on("exit", () => setTimeout(start, 3000));
}

start();