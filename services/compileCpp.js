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

        fs.writeFileSync(cppPath, code);

        console.log("COMPILING...");

        exec(
            `g++ "${cppPath}" -o "${exePath}"`,
            (compileErr, stdout, stderr) => {

                if (compileErr) {

                    return resolve({
                        success: false,
                        verdict: "Compile Error",
                        output: stderr
                    });
                }

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