/* eslint-disable no-undef */

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  testEnvironmentOptions: {
    // Matches the dev server origin, so relative URLs (authRedirect.html) resolve like in Office.
    url: "https://localhost:3000/taskpane.html",
  },
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  transform: {
    // Tests run on Node: compile TS and modern syntax for the current Node version only.
    // The webpack build keeps using babel.config.json / ts-loader unchanged.
    "\\.ts$": [
      "babel-jest",
      {
        babelrc: false,
        configFile: false,
        presets: [["@babel/preset-env", { targets: { node: "current" } }], "@babel/preset-typescript"],
      },
    ],
  },
  moduleFileExtensions: ["ts", "js", "json"],
  collectCoverageFrom: ["src/**/*.ts"],
  coverageReporters: ["text", "text-summary", "lcov"],
  clearMocks: true,
};
