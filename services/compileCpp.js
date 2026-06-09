const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const crypto = require("crypto");

function compileCpp(code) {
    return new Promise((resolve) => {
        const submissionId = crypto.randomUUID();
        const submissionDir = path.join(
            __dirname,
            "..",
            "temp",
            submissionId
        );

        console.log(`🔨 [compileCpp] Creating temporary submission directory: "${submissionDir}"`);
        fs.mkdirSync(submissionDir, {
            recursive: true
        });

        const cppPath = path.join(
            submissionDir,
            "main.cpp"
        );

        const exePath = path.join(
            submissionDir,
            "main"
        );

        console.log(`🔨 [compileCpp] Writing code to file: "${cppPath}"`);
        fs.writeFileSync(cppPath, code);

        const gxxPath = process.env.GXX_PATH || "g++";
        const compileCmd = `${gxxPath} -std=c++17 "${cppPath}" -o "${exePath}"`;
        console.log(`🔨 [compileCpp] Using compiler: "${gxxPath}". Executing compilation command: \`${compileCmd}\``);

        exec(
            compileCmd,
            (compileErr, stdout, stderr) => {
                console.log(`🔨 [compileCpp] g++ stdout: "${stdout || '(empty)'}"`);
                console.log(`🔨 [compileCpp] g++ stderr: "${stderr || '(empty)'}"`);

                if (compileErr) {
                    console.error(`🔨 [compileCpp] Compilation failed! Error details:`, compileErr);
                    console.error(`🔨 [compileCpp] Command stderr output:\n${stderr}`);
                    return resolve({
                        success: false,
                        verdict: "Compile Error",
                        output: stderr || compileErr.message
                    });
                }

                console.log(`🔨 [compileCpp] Compilation passed! Executable generated at: "${exePath}"`);
                resolve({
                    success: true,
                    exePath,
                    submissionDir
                });
            }
        );
    });
}

module.exports = compileCpp;