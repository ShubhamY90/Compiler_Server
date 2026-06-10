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
        "main.exe"
);

        console.log(`🔨 [compileCpp] Writing code to file: "${cppPath}"`);
        fs.writeFileSync(cppPath, code);

        const gxxPath = process.env.GXX_PATH || "g++";
        const compileCmd = `"${gxxPath}" -std=c++17 "${cppPath}" -o "${exePath}"`;
        console.log(`🔨 [compileCpp] Using compiler: "${gxxPath}". Executing compilation command: \`${compileCmd}\``);

        // MSYS2 g++ needs its own bin dir in PATH so cc1plus.exe and runtime
        // DLLs can be located. Build a child-process env with that dir prepended.
        const gxxBinDir = require("path").dirname(gxxPath);
        const childEnv = { ...process.env };
        const pathKey = Object.keys(childEnv).find(k => k.toUpperCase() === "PATH") || "PATH";
        childEnv[pathKey] = gxxBinDir + require("path").delimiter + (childEnv[pathKey] || "");

        exec(
            compileCmd,
            { env: childEnv },
            (compileErr, stdout, stderr) => {
                console.log(`🔨 [compileCpp] g++ stdout: "${stdout || '(empty)'}"`);
                console.log(`🔨 [compileCpp] g++ stderr: "${stderr || '(empty)'}"`);

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