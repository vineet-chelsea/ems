const { spawn } = require("child_process");

function start() {
  spawn("npm.cmd", ["start"], {
    cwd: "D:/ems/backend",
    stdio: "inherit",
    shell: true
  }).on("exit", () => setTimeout(start, 3000));
}

start();