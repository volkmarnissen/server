import type { Config } from "jest";

const config: Config = {
  verbose: true,
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/__tests__", "<rootDir>/testHelpers"],
  transform: {
    "^.+\\.tsx+$": "ts-jest",
  },
  testRegex: "/__tests__/(.*|(\\.|/)(test|spec))(\\.tsx)+$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  //  setupFiles: ["<rootDir>/.jest/setEnvVars.js"]
};
export default config;
