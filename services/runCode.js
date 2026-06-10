const { spawn } = require("child_process");
const path = require("path");

/**
 * Runs a command in a child process, feeds stdin, handles timeout, and returns the result.
 * 
 * @param {string} command - The executable command to run (e.g. java, python, main.exe)
 * @param {Array<string>} args - Arguments to pass
 * @param {string} language - The language key (e.g. 'c', 'cpp', 'java', 'python')
 * @param {string} input - The stdin input for the test case
 * @param {number} timeLimit - Time limit in milliseconds
 */
function runCode(command, args, language, input, timeLimit = 2000) {
    console.log(`🏃 [runCode] Running executable: "${command}" with args: ${JSON.stringify(args)} (Language: ${language}, Time Limit: ${timeLimit}ms)`);

    // Build standard env path adjustments
    const childEnv = { ...process.env };
    const pathKey = Object.keys(childEnv).find(k => k.toUpperCase() === "PATH") || "PATH";
    const pathVal = childEnv[pathKey] || "";

    const pathsToPrepend = [];
    if (language === "cpp" && process.env.GXX_PATH) {
        pathsToPrepend.push(path.dirname(process.env.GXX_PATH));
    } else if (language === "c" && process.env.GCC_PATH) {
        pathsToPrepend.push(path.dirname(process.env.GCC_PATH));
    } else if (language === "java" && process.env.JAVA_PATH && process.env.JAVA_PATH.includes(path.sep)) {
        pathsToPrepend.push(path.dirname(process.env.JAVA_PATH));
    } else if (language === "python" && process.env.PYTHON_PATH && process.env.PYTHON_PATH.includes(path.sep)) {
        pathsToPrepend.push(path.dirname(process.env.PYTHON_PATH));
    }

    if (pathsToPrepend.length > 0) {
        childEnv[pathKey] = pathsToPrepend.join(path.delimiter) + path.delimiter + pathVal;
    }

    return new Promise((resolve) => {
        let runProcess;
        try {
            runProcess = spawn(command, args, { env: childEnv });
        } catch (err) {
            console.error(`🏃 [runCode] Failed to spawn process:`, err);
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
            console.warn(`🏃 [runCode] Execution time limit of ${timeLimit}ms exceeded. Killing process...`);
            try {
                runProcess.kill("SIGKILL");
            } catch (err) {
                console.error(`🏃 [runCode] Error killing process:`, err);
            }
        }, timeLimit);

        runProcess.stdout.on("data", (data) => {
            const chunk = data.toString();
            output += chunk;
            console.log(`   [runCode stdout]: "${chunk.trim().replace(/\n/g, '\\n')}"`);
        });

        runProcess.stderr.on("data", (data) => {
            const chunk = data.toString();
            error += chunk;
            console.warn(`   [runCode stderr]: "${chunk.trim().replace(/\n/g, '\\n')}"`);
        });

        runProcess.on("error", (err) => {
            console.error(`🏃 [runCode] Child process emitted an error event:`, err);
            error += `\nProcess error: ${err.message}`;
        });

        try {
            console.log(`🏃 [runCode] Writing ${input.length} chars to stdin...`);
            runProcess.stdin.write(input);
            runProcess.stdin.end();
        } catch (err) {
            console.error(`🏃 [runCode] Error writing to process stdin:`, err);
        }

        runProcess.on("close", (exitCode, signal) => {
            clearTimeout(timeout);
            console.log(`🏃 [runCode] Process closed with exitCode: ${exitCode === null ? 'null' : exitCode}, signal: ${signal || 'none'}, TLE: ${tle}`);

            if (tle) {
                return resolve({
                    success: false,
                    verdict: "Time Limit Exceeded"
                });
            }

            if (exitCode !== 0) {
                console.warn(`🏃 [runCode] Process exited with non-zero exit code: ${exitCode}. Error output: "${error.trim()}"`);
                return resolve({
                    success: false,
                    verdict: "Runtime Error",
                    output: error || `Exit code ${exitCode}`
                });
            }

            resolve({
                success: true,
                output
            });
        });
    });
}

module.exports = runCode;
