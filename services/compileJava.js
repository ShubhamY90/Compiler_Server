const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const crypto = require("crypto");

// Java requires the public class name to match the filename.
// We always name the file Main.java and expect the user's class to be named Main.
const JAVA_CLASS_NAME = "Main";

function compileJava(code) {
    return new Promise((resolve) => {
        const submissionId = crypto.randomUUID();
        const submissionDir = path.join(
            __dirname,
            "..",
            "temp",
            submissionId
        );

        console.log(`☕ [compileJava] Creating temporary submission directory: "${submissionDir}"`);
        fs.mkdirSync(submissionDir, { recursive: true });

        const javaPath = path.join(submissionDir, `${JAVA_CLASS_NAME}.java`);

        console.log(`☕ [compileJava] Writing code to file: "${javaPath}"`);
        fs.writeFileSync(javaPath, code);

        const javacPath = process.env.JAVAC_PATH || "javac";
        const compileCmd = `"${javacPath}" "${javaPath}"`;
        console.log(`☕ [compileJava] Using compiler: "${javacPath}". Executing compilation command: \`${compileCmd}\``);

        const javacBinDir = path.dirname(javacPath);
        const childEnv = { ...process.env };
        const pathKey = Object.keys(childEnv).find(k => k.toUpperCase() === "PATH") || "PATH";
        childEnv[pathKey] = javacBinDir + path.delimiter + (childEnv[pathKey] || "");

        exec(compileCmd, { env: childEnv }, (compileErr, stdout, stderr) => {
            console.log(`☕ [compileJava] javac stdout: "${stdout || '(empty)'}"`);
            console.log(`☕ [compileJava] javac stderr: "${stderr || '(empty)'}"`);

            if (compileErr) {
                console.error("ERROR CODE:", compileErr.code);
                console.error("ERROR MESSAGE:", compileErr.message);
                console.error("STDOUT:", stdout);
                console.error("STDERR:", stderr);
                console.error("FULL ERROR:", compileErr);

                return resolve({
                    success: false,
                    verdict: "Compile Error",
                    // javac writes errors to stdout, not stderr
                    output: stdout || stderr || compileErr.message
                });
            }

            console.log(`☕ [compileJava] Compilation passed! .class files generated in: "${submissionDir}"`);
            resolve({
                success: true,
                // classDir is the directory passed to `java -cp`
                classDir: submissionDir,
                // className is passed as the entry point to `java`
                className: JAVA_CLASS_NAME,
                submissionDir
            });
        });
    });
}

module.exports = compileJava;
