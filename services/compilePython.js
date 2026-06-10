const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const crypto = require("crypto");

// Python is interpreted — there is no compile step that produces a binary.
// This module mirrors the compile* API surface so the judge pipeline stays uniform:
//   success → { success: true, scriptPath, submissionDir }
//   failure → { success: false, verdict: "Syntax Error", output: <message> }
// It performs a syntax check via `python -m py_compile` so syntax errors are
// caught early and reported the same way as a C/C++/Java compile error.

function compilePython(code) {
    return new Promise((resolve) => {
        const submissionId = crypto.randomUUID();
        const submissionDir = path.join(
            __dirname,
            "..",
            "temp",
            submissionId
        );

        console.log(`🐍 [compilePython] Creating temporary submission directory: "${submissionDir}"`);
        fs.mkdirSync(submissionDir, { recursive: true });

        const scriptPath = path.join(submissionDir, "main.py");

        console.log(`🐍 [compilePython] Writing code to file: "${scriptPath}"`);
        fs.writeFileSync(scriptPath, code);

        const pythonPath = process.env.PYTHON_PATH || "python";
        // -m py_compile exits 0 on success, non-zero + message on syntax error
        const checkCmd = `"${pythonPath}" -m py_compile "${scriptPath}"`;
        console.log(`🐍 [compilePython] Using interpreter: "${pythonPath}". Running syntax check: \`${checkCmd}\``);

        const childEnv = { ...process.env };

        exec(checkCmd, { env: childEnv }, (checkErr, stdout, stderr) => {
            console.log(`🐍 [compilePython] py_compile stdout: "${stdout || '(empty)'}"`);
            console.log(`🐍 [compilePython] py_compile stderr: "${stderr || '(empty)'}"`);

            if (checkErr) {
                console.error("ERROR CODE:", checkErr.code);
                console.error("ERROR MESSAGE:", checkErr.message);
                console.error("STDOUT:", stdout);
                console.error("STDERR:", stderr);
                console.error("FULL ERROR:", checkErr);

                return resolve({
                    success: false,
                    verdict: "Compile Error",
                    output: stderr || stdout || checkErr.message
                });
            }

            console.log(`🐍 [compilePython] Syntax check passed! Script ready at: "${scriptPath}"`);
            resolve({
                success: true,
                scriptPath,
                submissionDir
            });
        });
    });
}

module.exports = compilePython;
