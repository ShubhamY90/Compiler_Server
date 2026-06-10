const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const crypto = require("crypto");

function compileC(code) {
    return new Promise((resolve) => {
        const submissionId = crypto.randomUUID();
        const submissionDir = path.join(
            __dirname,
            "..",
            "temp",
            submissionId
        );

        console.log(`🔨 [compileC] Creating temporary submission directory: "${submissionDir}"`);
        fs.mkdirSync(submissionDir, { recursive: true });

        const cPath = path.join(submissionDir, "main.c");
        const exePath = path.join(submissionDir, "main.exe");

        console.log(`🔨 [compileC] Writing code to file: "${cPath}"`);
        fs.writeFileSync(cPath, code);

        const gccPath = process.env.GCC_PATH || "gcc";
        const compileCmd = `"${gccPath}" -std=c17 "${cPath}" -o "${exePath}"`;
        console.log(`🔨 [compileC] Using compiler: "${gccPath}". Executing compilation command: \`${compileCmd}\``);

        const gccBinDir = path.dirname(gccPath);
        const childEnv = { ...process.env };
        const pathKey = Object.keys(childEnv).find(k => k.toUpperCase() === "PATH") || "PATH";
        childEnv[pathKey] = gccBinDir + path.delimiter + (childEnv[pathKey] || "");

        exec(compileCmd, { env: childEnv }, (compileErr, stdout, stderr) => {
            console.log(`🔨 [compileC] gcc stdout: "${stdout || '(empty)'}"`);
            console.log(`🔨 [compileC] gcc stderr: "${stderr || '(empty)'}"`);

            if (compileErr) {
                console.error("ERROR CODE:", compileErr.code);
                console.error("ERROR MESSAGE:", compileErr.message);
                console.error("STDOUT:", stdout);
                console.error("STDERR:", stderr);
                console.error("FULL ERROR:", compileErr);

                return resolve({
                    success: false,
                    verdict: "Compile Error",
                    output: stderr || compileErr.message
                });
            }

            console.log(`🔨 [compileC] Compilation passed! Executable generated at: "${exePath}"`);
            resolve({
                success: true,
                exePath,
                submissionDir
            });
        });
    });
}

module.exports = compileC;
