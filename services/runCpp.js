const { spawn } = require("child_process");

function runCpp(exePath, input, timeLimit = 2000) {
    console.log(`🏃 [runCpp] Running executable: "${exePath}" (Time Limit: ${timeLimit}ms)`);
    return new Promise((resolve) => {
        let runProcess;
        try {
            runProcess = spawn(exePath);
        } catch (err) {
            console.error(`🏃 [runCpp] Failed to spawn process:`, err);
            return resolve({
                success: false,
                verdict: "Runtime Error",
                output: err.message
            });
        }

        let output = "";
        let error = "";
        let tle = false;

        const timeout = setTimeout(() => {
            tle = true;
            console.warn(`🏃 [runCpp] Execution time limit of ${timeLimit}ms exceeded. Killing process...`);
            try {
                runProcess.kill("SIGKILL");
            } catch (err) {
                console.error(`🏃 [runCpp] Error killing process:`, err);
            }
        }, timeLimit);

        runProcess.stdout.on("data", (data) => {
            const chunk = data.toString();
            output += chunk;
            console.log(`   [runCpp stdout]: "${chunk.trim().replace(/\n/g, '\\n')}"`);
        });

        runProcess.stderr.on("data", (data) => {
            const chunk = data.toString();
            error += chunk;
            console.warn(`   [runCpp stderr]: "${chunk.trim().replace(/\n/g, '\\n')}"`);
        });

        runProcess.on("error", (err) => {
            console.error(`🏃 [runCpp] Child process emitted an error event:`, err);
            error += `\nProcess error: ${err.message}`;
        });

        try {
            console.log(`🏃 [runCpp] Writing ${input.length} chars to stdin...`);
            runProcess.stdin.write(input);
            runProcess.stdin.end();
        } catch (err) {
            console.error(`🏃 [runCpp] Error writing to process stdin:`, err);
        }

        runProcess.on("close", (exitCode, signal) => {
            clearTimeout(timeout);
            console.log(`🏃 [runCpp] Process closed with exitCode: ${exitCode === null ? 'null' : exitCode}, signal: ${signal || 'none'}, TLE: ${tle}`);

            if (tle) {
                return resolve({
                    success: false,
                    verdict: "Time Limit Exceeded"
                });
            }

            if (exitCode !== 0) {
                console.warn(`🏃 [runCpp] Process exited with non-zero exit code: ${exitCode}. Error output: "${error.trim()}"`);
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