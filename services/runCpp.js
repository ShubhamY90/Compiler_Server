const { spawn } = require("child_process");

function runCpp(exePath, input, timeLimit = 2000) {
    console.log("RUNNING TESTCASE");
    return new Promise((resolve) => {

        const runProcess = spawn(exePath);

        let output = "";
        let error = "";
        let tle = false;

        const timeout = setTimeout(() => {

            tle = true;

            runProcess.kill("SIGKILL");

        }, timeLimit);

        runProcess.stdout.on("data", (data) => {
            output += data.toString();
        });

        runProcess.stderr.on("data", (data) => {
            error += data.toString();
        });

        runProcess.stdin.write(input);
        runProcess.stdin.end();

        runProcess.on("close", (exitCode) => {

            clearTimeout(timeout);

            if (tle) {
                return resolve({
                    success: false,
                    verdict: "Time Limit Exceeded"
                });
            }

            if (exitCode !== 0) {
                return resolve({
                    success: false,
                    verdict: "Runtime Error",
                    output: error
                });
            }

            resolve({
                success: true,
                output
            });
        });
    });
}

module.exports = runCpp;