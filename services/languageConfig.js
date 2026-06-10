// languageConfig.js
// Central registry mapping a language key to:
//   compile(code)    → Promise<compileResult>
//   command(result)  → string  (the executable command path to spawn)
//   args(result)     → Array<string> (the array of command line arguments)

const compileC      = require("./compileC");
const compileCpp    = require("./compileCpp");
const compileJava   = require("./compileJava");
const compilePython = require("./compilePython");

const LANGUAGES = {
    c: {
        compile: compileC,
        // result shape: { exePath }
        command: (result) => result.exePath,
        args: (result) => [],
    },

    cpp: {
        compile: compileCpp,
        // result shape: { exePath }
        command: (result) => result.exePath,
        args: (result) => [],
    },

    java: {
        compile: compileJava,
        // result shape: { classDir, className }
        // Capping memory to 256MB
        command: (result) => process.env.JAVA_PATH || "java",
        args: (result) => ["-Xmx256m", "-cp", result.classDir, result.className],
    },

    python: {
        compile: compilePython,
        // result shape: { scriptPath }
        command: (result) => process.env.PYTHON_PATH || "python",
        args: (result) => [result.scriptPath],
    },
};

/**
 * Returns { compile, command, args } for the given language key.
 * Throws if the language is unsupported.
 */
function getLanguageConfig(language) {
    const key = (language || "").toLowerCase().trim();
    const config = LANGUAGES[key];
    if (!config) {
        throw new Error(
            `Unsupported language: "${language}". Supported: ${Object.keys(LANGUAGES).join(", ")}`
        );
    }
    return config;
}

module.exports = { getLanguageConfig, SUPPORTED_LANGUAGES: Object.keys(LANGUAGES) };

